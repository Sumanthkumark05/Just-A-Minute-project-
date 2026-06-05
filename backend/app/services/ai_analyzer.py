import logging
import time
import re
from typing import Dict, Any, List
from app.config import settings
from app.services.audio_processor import process_audio
from app.services.vision_processor import process_video
from app.services.ai_evaluator import evaluate_speech_with_gemini

logger = logging.getLogger("jam_analyzer")

def calculate_local_semantic_relevance(transcript: str, topic: str, category: str) -> int:
    """
    Calculates a dynamic semantic relevance score (0-100) between the transcript and the topic
    by comparing cleaned content words, ignoring filler words and common stopwords,
    and estimating overlap.
    """
    if not transcript or not topic:
        return 0
        
    filler_words = {"um", "uh", "like", "you", "know", "actually", "basically", "literally", "sort", "of", "kind"}
    stopwords = {
        "a", "about", "above", "after", "again", "against", "all", "am", "an", "and", "any", "are", "aren't", "as", "at",
        "be", "because", "been", "before", "being", "below", "between", "both", "but", "by", "can't", "cannot", "could",
        "couldn't", "did", "didn't", "do", "does", "doesn't", "doing", "don't", "down", "during", "each", "few", "for",
        "from", "further", "had", "hadn't", "has", "hasn't", "have", "haven't", "having", "he", "he'd", "he'll", "he's",
        "her", "here", "here's", "hers", "herself", "him", "himself", "his", "how", "how's", "i", "i'd", "i'll", "i'm",
        "i've", "if", "in", "into", "is", "isn't", "it", "it's", "its", "itself", "let's", "me", "more", "most", "mustn't",
        "my", "myself", "no", "nor", "not", "of", "off", "on", "once", "only", "or", "other", "ought", "our", "ours",
        "ourselves", "out", "over", "own", "same", "shan't", "she", "she'd", "she'll", "she's", "should", "shouldn't",
        "so", "some", "such", "than", "that", "that's", "the", "their", "theirs", "them", "themselves", "then", "there",
        "there's", "these", "they", "they'd", "they'll", "they're", "they've", "this", "those", "through", "to", "too",
        "under", "until", "up", "very", "was", "wasn't", "we", "we'd", "we'll", "we're", "we've", "were", "weren't",
        "what", "what's", "when", "when's", "where", "where's", "which", "while", "who", "who's", "whom", "why", "why's",
        "with", "won't", "would", "wouldn't", "you'd", "you'll", "you're", "you've", "your", "yours", "yourself", "yourselves"
    }
    
    # Helper to extract clean content words
    def get_content_words(text: str) -> List[str]:
        words = re.findall(r"\b\w+\b", text.lower())
        return [w for w in words if w not in filler_words and w not in stopwords]
        
    topic_words = set(get_content_words(topic))
    category_words = set(get_content_words(category))
    transcript_words = set(get_content_words(transcript))
    
    if not topic_words:
        return 70  # default fallback if topic has no content words
        
    # Check overlap with topic words
    topic_overlap = len(topic_words.intersection(transcript_words))
    topic_match_ratio = topic_overlap / len(topic_words)
    
    # Check overlap with category words (adds context)
    category_overlap = len(category_words.intersection(transcript_words))
    category_match_ratio = category_overlap / len(category_words) if category_words else 0
    
    # Simple semantic expansion: basic synonym mappings for common topics
    synonym_map = {
        "job": {"work", "employment", "career", "occupation", "employee", "hiring", "worker"},
        "jobs": {"work", "employment", "careers", "occupations", "employees", "hiring", "workers"},
        "ai": {"artificial", "intelligence", "technology", "machine", "learning", "automation", "robot", "software"},
        "education": {"learning", "school", "college", "university", "student", "teacher", "study", "academic"},
        "online": {"digital", "remote", "virtual", "internet", "web", "zoom"},
        "offline": {"physical", "classroom", "person", "traditional"},
        "teamwork": {"collaboration", "cooperation", "together", "group", "collective", "partner"},
        "sports": {"athletics", "games", "players", "fitness", "exercise", "physical"},
        "climate": {"environment", "warming", "green", "carbon", "nature", "earth", "weather"}
    }
    
    # Check synonym overlap
    synonym_hits = 0
    for tw in topic_words:
        if tw in transcript_words:
            continue
        if tw in synonym_map:
            if synonym_map[tw].intersection(transcript_words):
                synonym_hits += 1
                
    adjusted_topic_overlap = topic_overlap + synonym_hits
    adjusted_ratio = min(1.0, adjusted_topic_overlap / len(topic_words))
    
    if adjusted_ratio > 0:
        score = 50 + int(adjusted_ratio * 40) + int(category_match_ratio * 10)
    else:
        score = 30
        
    return min(100, score)

def get_insufficient_audio_response(message: str) -> Dict[str, Any]:
    """
    Returns a database-conforming dictionary with scores set to 0 and message as transcript
    when audio quality safeguards are triggered.
    """
    return {
        "original_transcript": message,
        "corrected_transcript": message,
        "transcript": message,
        "summary": message,
        "key_points": [],
        
        # Primary Database Metrics
        "accuracy_score": 0,
        "transcript_confidence": 0,
        "semantic_similarity_score": 0,
        
        "fluency_score": 0,
        "grammar_score": 0,
        "pronunciation_score": 0,
        "confidence_score": 0,
        "communication_score": 0,
        "words_per_minute": 0,
        
        # Detailed Sub-Metrics
        "vocabulary_score": 0,
        "speaking_pace_score": 0,
        "eye_contact_score": 0,
        "posture_score": 0,
        "engagement_score": 0,
        "content_quality_score": 0,
        "topic_relevance_score": 0,
        "dominant_emotion": "Neutral",
        "emotion_stability_score": 0,
        
        # JSON stores
        "filler_words": {},
        "emotion_distribution": {},
        "mistakes": [message],
        "strengths": [],
        "improvements": [],
        "exercises": []
    }

def analyze_video_speech(video_path: str, topic: str, category: str) -> Dict[str, Any]:
    """
    Orchestrates the entire speech and body language analysis workflow:
    1. Extracts audio and runs Whisper transcription + audio analysis.
    2. Decodes video and runs MediaPipe Face Mesh + OpenCV visual tracking.
    3. Runs LLM evaluation using Gemini if API key is present.
    4. Falls back to a data-driven local evaluator if the API key is missing.
    """
    logger.info(f"Starting AI Analysis Pipeline for session topic: '{topic}'")
    start_time = time.time()
    
    # 1. Run local Speech / Audio processing
    try:
        logger.info("Executing local audio/speech pipeline...")
        speech_results = process_audio(video_path)
    except Exception as e:
        logger.error(f"Speech processing failed: {e}")
        return get_insufficient_audio_response("Audio quality insufficient for reliable evaluation.")

    # 1.1 Apply Safeguards
    transcript = speech_results.get("transcript", "").strip()
    confidence = speech_results.get("transcript_confidence", 0)
    
    clean_text = re.sub(r"[^\w\s]", "", transcript).strip()
    if not clean_text or transcript == "Audio transcription failed." or confidence < 40:
        logger.warning(f"Audio Safeguard Triggered - Transcript empty: {not clean_text}, Confidence: {confidence}%")
        return get_insufficient_audio_response("Audio quality insufficient for reliable evaluation.")

    # 2. Run local Video / Computer Vision processing
    try:
        logger.info("Executing local video/computer vision pipeline...")
        vision_results = process_video(video_path)
    except Exception as e:
        logger.error(f"Visual processing failed: {e}")
        # Build empty/mock vision results as recovery
        vision_results = {
            "eye_contact_score": 50,
            "posture_score": 50,
            "confidence_score": 50,
            "engagement_score": 50,
            "emotion_distribution": {"Confident": 40.0, "Neutral": 40.0, "Nervous": 10.0, "Happy": 5.0, "Anxious": 5.0},
            "dominant_emotion": "Neutral",
            "emotion_stability_score": 60,
            "fidgeting_index": 0.0
        }

    # 3. Choose Evaluator: Gemini API (Cloud) vs. Data-driven Fallback (Local)
    if settings.GEMINI_API_KEY:
        try:
            logger.info("GEMINI_API_KEY detected. Running cloud AI evaluator...")
            ai_eval = evaluate_speech_with_gemini(
                topic=topic,
                category=category,
                transcript=speech_results["transcript"],
                speech_metrics=speech_results,
                vision_metrics=vision_results
            )
            
            # Combine all metrics together
            final_report = combine_metrics(speech_results, vision_results, ai_eval)
            elapsed = time.time() - start_time
            logger.info(f"AI Pipeline completed successfully in {elapsed:.2f}s using Gemini.")
            return final_report
            
        except Exception as e:
            logger.error(f"Gemini evaluation failed: {e}. Falling back to local data-driven evaluator.")
    else:
        logger.warning("GEMINI_API_KEY is not set. Using local data-driven evaluator.")

    # 4. Local Data-Driven Fallback Evaluator
    ai_eval = generate_local_evaluation(topic, category, speech_results, vision_results)
    final_report = combine_metrics(speech_results, vision_results, ai_eval)
    
    elapsed = time.time() - start_time
    logger.info(f"AI Pipeline completed in {elapsed:.2f}s using local data-driven fallback.")
    return final_report

def combine_metrics(speech: Dict[str, Any], vision: Dict[str, Any], evaluation: Dict[str, Any]) -> Dict[str, Any]:
    """
    Merges speech metrics, vision metrics, and AI evaluation text/scores into a single database-conforming dictionary.
    """
    # Calculate fluency: combines speaking pace score and filler word penalties
    filler_count = sum(speech.get("filler_words", {}).values())
    filler_penalty = min(50, filler_count * 4)
    fluency_score = max(30, speech.get("speaking_pace_score", 70) - filler_penalty)
    
    # Calculate pronunciation: influenced by eye contact, stability, and pace
    pronunciation_score = max(50, 100 - int(vision.get("fidgeting_index", 0.0) * 1.5) - abs(speech.get("words_per_minute", 130) - 135) // 2)
    # Clamp to max 98
    pronunciation_score = min(98, pronunciation_score)

    # Calculate final accuracy score using weighted formula:
    # - Transcript Confidence: 30%
    # - Semantic Relevance to Topic: 30%
    # - Fluency and Coherence: 20%
    # - Grammar Quality: 10%
    # - Pronunciation Clarity: 10%
    transcript_conf = speech.get("transcript_confidence", 85)
    semantic_sim = evaluation.get("semantic_similarity_score", 80)
    grammar_score = evaluation.get("grammar_score", 80)
    
    accuracy_score = int(
        (transcript_conf * 0.30) +
        (semantic_sim * 0.30) +
        (fluency_score * 0.20) +
        (grammar_score * 0.10) +
        (pronunciation_score * 0.10)
    )
    
    logger.info("--- Weighted Score Calculation ---")
    logger.info("Evaluation Inputs:")
    logger.info(f"  Transcript Confidence: {transcript_conf}% (weight: 30%)")
    logger.info(f"  Semantic Relevance: {semantic_sim}% (weight: 30%)")
    logger.info(f"  Fluency Score: {fluency_score}% (weight: 20%)")
    logger.info(f"  Grammar Score: {grammar_score}% (weight: 10%)")
    logger.info(f"  Pronunciation Score: {pronunciation_score}% (weight: 10%)")
    logger.info(f"Final Weighted Score: {accuracy_score}%")
    logger.info("----------------------------------")

    mistakes = list(evaluation.get("mistakes", []))

    # Warnings logic - threshold updated to 70%
    if transcript_conf < 70:
        logger.warning(f"Low transcript confidence detected: {transcript_conf}%")
        mistakes.append(f"WARNING: Transcript confidence is low ({transcript_conf}%). AI Evaluation may be inaccurate. Please ensure a quiet environment and clear microphone.")

    # Format and append timestamped filler occurrences to mistakes list
    filler_occurrences = speech.get("filler_occurrences", [])
    for occ in filler_occurrences:
        mistakes.append(f"Vocal filler '{occ['filler']}' spoken at {occ['start']:.1f}s - {occ['end']:.1f}s")

    original_transcript = evaluation.get("original_transcript") or speech.get("raw_transcript") or speech.get("transcript", "")
    corrected_transcript = evaluation.get("corrected_transcript") or speech.get("transcript", "")

    return {
        "original_transcript": original_transcript,
        "corrected_transcript": corrected_transcript,
        "transcript": corrected_transcript,
        "summary": evaluation.get("summary", ""),
        "key_points": evaluation.get("key_points", []),
        
        # Primary Database Metrics
        "accuracy_score": accuracy_score,
        "transcript_confidence": transcript_conf,
        "semantic_similarity_score": semantic_sim,
        
        "fluency_score": fluency_score,
        "grammar_score": grammar_score,
        "pronunciation_score": pronunciation_score,
        "confidence_score": vision.get("confidence_score", 75),
        "communication_score": evaluation.get("communication_score", 75),
        "words_per_minute": speech.get("words_per_minute", 120),
        
        # Detailed Sub-Metrics
        "vocabulary_score": speech.get("vocabulary_score", 70),
        "speaking_pace_score": speech.get("speaking_pace_score", 70),
        "eye_contact_score": vision.get("eye_contact_score", 70),
        "posture_score": vision.get("posture_score", 70),
        "engagement_score": vision.get("engagement_score", 70),
        "content_quality_score": evaluation.get("content_quality_score", 75),
        "topic_relevance_score": evaluation.get("topic_relevance_score", 80),
        "dominant_emotion": vision.get("dominant_emotion", "Neutral"),
        "emotion_stability_score": vision.get("emotion_stability_score", 75),
        
        # JSON stores
        "filler_words": speech.get("filler_words", {}),
        "emotion_distribution": vision.get("emotion_distribution", {}),
        "mistakes": mistakes,
        "strengths": evaluation.get("strengths", []),
        "improvements": evaluation.get("improvements", []),
        "exercises": evaluation.get("exercises", [])
    }

def generate_local_evaluation(topic: str, category: str, speech: Dict[str, Any], vision: Dict[str, Any]) -> Dict[str, Any]:
    """
    Generates a highly personalized, data-driven assessment entirely in local Python code.
    """
    transcript = speech.get("transcript", "")
    raw_transcript = speech.get("raw_transcript") or transcript
    wpm = speech.get("words_per_minute", 0)
    filler_counts = speech.get("filler_words", {})
    total_fillers = sum(filler_counts.values())
    
    eye_score = vision.get("eye_contact_score", 70)
    posture_score = vision.get("posture_score", 70)
    fidget_index = vision.get("fidgeting_index", 0.0)
    
    logger.info("--- Running Local Fallback Evaluation ---")
    logger.info("Evaluation Inputs:")
    logger.info(f"  Topic: '{topic}'")
    logger.info(f"  Category: '{category}'")
    logger.info(f"  Transcript Length: {len(transcript)} chars")
    logger.info(f"  Speaking Pace: {wpm} WPM")
    logger.info(f"  Filler Count: {total_fillers}")
    logger.info(f"  Eye Contact Score: {eye_score}%")
    logger.info(f"  Posture Score: {posture_score}%")
    
    # 1. Summary and Key Points generation based on actual transcription
    words_list = [w for w in transcript.split() if len(w) > 4]
    unique_words = list(set(words_list))
    
    keywords = sorted(unique_words, key=lambda w: transcript.lower().count(w.lower()), reverse=True)[:3]
    keywords_str = ", ".join([f"'{k}'" for k in keywords]) if keywords else f"'{topic}'"

    summary = (
        f"The speaker delivered a {speech.get('duration', 60)}s speech on the topic '{topic}'. "
        f"They spoke at a pace of {wpm} words per minute. "
        f"The content centered around concepts related to {category}, specifically touching on vocabulary like {keywords_str}."
    )
    
    key_points = [
        f"Introduced key thoughts regarding {topic}.",
        f"Expressed ideas using a total vocabulary pool of {len(unique_words)} distinct words."
    ]
    if keywords:
        key_points.append(f"Emphasized concepts surrounding {keywords_str}.")

    # 2. Score assessments
    grammar_score = max(50, 95 - (total_fillers * 2) - max(0, 10 - len(unique_words) // 2))
    content_quality = max(50, 90 - max(0, 120 - wpm) // 3 - total_fillers)
    
    communication_score = int(vision.get("engagement_score", 70) * 0.4 + speech.get("speaking_pace_score", 70) * 0.4 + grammar_score * 0.2)

    # 3. Dynamic Strengths, Mistakes, and Recommendations
    strengths = []
    mistakes = []
    improvements = []
    exercises = []

    # Speak pace assessment
    if 115 <= wpm <= 145:
        strengths.append("Excellent pacing: Speech rate is steady and easy to follow.")
    elif wpm > 145:
        mistakes.append("Fast speaking pace: Speech rate was too rapid, leading to minor pronunciation overlaps.")
        improvements.append("Slow down slightly to let complex ideas resonate with the listener.")
        exercises.append("Metronome rehearsal: Speak along to a slow, steady pulse (120 bpm) to internalize pacing.")
    else:
        mistakes.append("Slow speaking rate: Pacing felt hesitant, with some audible pauses.")
        improvements.append("Increase word output speed to maintain listener energy and engagement.")
        exercises.append("Speed-reading drill: Read paragraphs out loud as fast as possible to build speech agility.")

    # Eye contact assessment
    if eye_score >= 75:
        strengths.append("Strong visual focus: Consistent eye contact with the camera.")
    else:
        mistakes.append("Low eye contact: Frequent glances away from the camera lens.")
        improvements.append("Direct your gaze to the camera lens rather than looking down or at the screen.")
        exercises.append("Lens-dot drill: Place a bright colored sticky dot right next to the camera lens as a visual anchor.")

    # Posture/fidgeting assessment
    if fidget_index < 2.0:
        strengths.append("Excellent posture: Maintained a stable head position with minimal nervous movement.")
    else:
        mistakes.append("Unstable posture: Noticeable head tilting or nervous shifts.")
        improvements.append("Ground your upper body and maintain a steady, relaxed posture.")
        exercises.append("Mirror presentation: Deliver your speech in front of a mirror to build body orientation awareness.")

    # Fillers assessment
    if total_fillers > 4:
        mistakes.append(f"High filler frequency: Used {total_fillers} filler vocalizations (e.g. {', '.join([f'{k}: {v}' for k, v in filler_counts.items() if v > 0])}).")
        improvements.append("Reduce filler words by pausing silently during transitions instead of vocalizing.")
        exercises.append("The Pause Game: When you feel a filler word coming, lock your mouth closed and count to one silently.")
    else:
        strengths.append("High fluency: Very clean transitions with low usage of filler words.")

    # Ensure fallback minimum lists are filled
    if len(strengths) == 0:
        strengths.append("Earnest attempt with clearly structured introductory remarks.")
    if len(mistakes) == 0:
        mistakes.append("Slight muscle tension in the shoulders during key points.")
    if len(improvements) == 0:
        improvements.append("Incorporate more varied vocabulary to explain complex concepts.")
    if len(exercises) == 0:
        exercises.append("Mirror training: Speak for 1 minute while observing your posture in a mirror.")

    local_relevance = calculate_local_semantic_relevance(transcript, topic, category)

    return {
        "original_transcript": raw_transcript,
        "corrected_transcript": transcript,
        "semantic_similarity_score": local_relevance,
        "summary": summary,
        "key_points": key_points,
        "grammar_score": grammar_score,
        "communication_score": communication_score,
        "content_quality_score": content_quality,
        "topic_relevance_score": local_relevance,
        "mistakes": mistakes,
        "strengths": strengths,
        "improvements": improvements,
        "exercises": exercises
    }
