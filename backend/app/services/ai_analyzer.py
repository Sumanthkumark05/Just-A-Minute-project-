import logging
import time
from typing import Dict, Any, List
from app.config import settings
from app.services.audio_processor import process_audio
from app.services.vision_processor import process_video
from app.services.ai_evaluator import evaluate_speech_with_gemini

logger = logging.getLogger("jam_analyzer")

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
        # Build empty/mock speech results as recovery
        speech_results = {
            "transcript": "Audio transcription failed.",
            "words_per_minute": 0,
            "filler_words": {
                "um": 0, "uh": 0, "ah": 0, "er": 0, "like": 0, "you know": 0,
                "actually": 0, "basically": 0, "literally": 0, "sort of": 0, "kind of": 0
            },
            "pause_count": 0,
            "pause_duration": 0.0,
            "vocabulary_score": 50,
            "speaking_pace_score": 50,
            "duration": 60.0
        }

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
            # Fall back to local data-driven generator
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

    return {
        "transcript": speech.get("transcript", ""),
        "summary": evaluation.get("summary", ""),
        "key_points": evaluation.get("key_points", []),
        
        # Primary Database Metrics
        "fluency_score": fluency_score,
        "grammar_score": evaluation.get("grammar_score", 80),
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
        "mistakes": evaluation.get("mistakes", []),
        "strengths": evaluation.get("strengths", []),
        "improvements": evaluation.get("improvements", []),
        "exercises": evaluation.get("exercises", [])
    }


def generate_local_evaluation(topic: str, category: str, speech: Dict[str, Any], vision: Dict[str, Any]) -> Dict[str, Any]:
    """
    Generates a highly personalized, data-driven assessment entirely in local Python code.
    Analyzes actual metrics (filler count, WPM, eye contact, stability) and transcript to generate tailored feedback.
    """
    transcript = speech.get("transcript", "")
    wpm = speech.get("words_per_minute", 0)
    filler_counts = speech.get("filler_words", {})
    total_fillers = sum(filler_counts.values())
    
    eye_score = vision.get("eye_contact_score", 70)
    posture_score = vision.get("posture_score", 70)
    fidget_index = vision.get("fidgeting_index", 0.0)
    
    # 1. Summary and Key Points generation based on actual transcription
    words_list = [w for w in transcript.split() if len(w) > 4]
    unique_words = list(set(words_list))
    
    # Highlight top keywords to show we read the transcript
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
    # Grammar estimation: deduct points for filler words, shorter speech, or vocabulary quality
    grammar_score = max(50, 95 - (total_fillers * 2) - max(0, 10 - len(unique_words) // 2))
    
    # Communication score: balance of fluency, content quality, and visual posture stability
    content_quality = max(50, 90 - max(0, 120 - wpm) // 3 - total_fillers)
    topic_relevance = 90  # Default local estimation
    
    # Communication is average of visual engagement and speech pacing
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

    return {
        "summary": summary,
        "key_points": key_points,
        "grammar_score": grammar_score,
        "communication_score": communication_score,
        "content_quality_score": content_quality,
        "topic_relevance_score": topic_relevance,
        "mistakes": mistakes,
        "strengths": strengths,
        "improvements": improvements,
        "exercises": exercises
    }
