import logging
from typing import Dict, Any

logger = logging.getLogger("jam_analyzer")

def calculate_evidence_scores(speech: Dict[str, Any], vision: Dict[str, Any], voice: Dict[str, Any]) -> Dict[str, Any]:
    """
    Computes all communication, speech, body language, and effectiveness scores
    strictly using formula-based combinations of measurable acoustic, visual, and content signals.
    """
    logger.info("=== Computing Formula-Based Evidence Scores ===")
    
    # 1. Base Variables
    wpm = speech.get("words_per_minute", 130)
    filler_counts = speech.get("filler_words", {})
    total_fillers = sum(filler_counts.values())
    pause_count = speech.get("pause_count", 0)
    whisper_confidence = speech.get("transcript_confidence", 85)
    vocabulary_score = speech.get("vocabulary_score", 70)
    speaking_pace_score = speech.get("speaking_pace_score", 70)
    
    # Visual metrics
    eye_contact = vision.get("eye_contact_percentage", 70.0)
    expressions = vision.get("expressions", {"confidence": 70.0, "neutral": 30.0, "nervousness": 10.0, "happiness": 10.0})
    smile_frequency = vision.get("smile_frequency", expressions.get("happiness", 10.0))
    nervousness = expressions.get("nervousness", 10.0)
    posture = vision.get("posture_score", 70.0)
    hand_detection_rate = vision.get("hand_detection_rate", 20.0)
    hand_movement_frequency = vision.get("hand_movement_frequency", 20.0)
    gesture_effectiveness = vision.get("gesture_effectiveness", 40.0)
    head_stability = vision.get("head_stability", 70.0)
    avg_tilt = vision.get("head_tilt_average", 0.0)
    
    # Voice metrics (Librosa)
    stability_score = voice.get("stability_score", 75.0)
    pitch_var = voice.get("pitch_variation", 20.0)
    energy_var = voice.get("energy_variation", 0.05)
    
    # 2. Content & Grammar calculations
    # Grammar penalty: excessive fillers and repeated words
    repetition_ratio = max(0.0, 100.0 - vocabulary_score * 1.2)
    grammar_score = max(50.0, min(100.0, 95.0 - total_fillers * 2.5 - repetition_ratio * 0.3))
    content_quality = max(50.0, min(100.0, 90.0 - abs(wpm - 135) * 0.4 - total_fillers * 1.5 + vocabulary_score * 0.1))

    # 3. Speech Sub-scores
    fluency_score = max(30, int(100 - min(30, pause_count * 3) - min(40, total_fillers * 4)))
    clarity_score = int((whisper_confidence * 0.7) + (stability_score * 0.3))
    pronunciation_score = min(98, max(50, int(100 - abs(wpm - 135) * 0.5 - total_fillers)))
    fillers_score = max(0, int(100 - total_fillers * 5))
    confidence_speech_score = int((speaking_pace_score * 0.4) + (stability_score * 0.4) + (fluency_score * 0.2))

    # 4. Body Language Sub-scores
    eye_contact_score = int(eye_contact)
    facial_expression_score = max(30, min(100, int(60 + (smile_frequency * 0.4) - (nervousness * 0.5))))
    posture_score = int(posture)
    gestures_score = max(30, min(100, int((hand_detection_rate * 0.6) + (hand_movement_frequency * 0.4))))
    head_movement_score = int(head_stability)

    # 5. Communication Effectiveness (Weighted Formulas)
    # - Confidence: 40% Voice Stability, 30% Eye Contact, 20% Posture, 10% Speaking Pace
    effectiveness_confidence = round(
        (stability_score * 0.4) + (eye_contact * 0.3) + (posture * 0.2) + (speaking_pace_score * 0.1)
    )
    # - Professionalism: 40% Vocabulary, 30% Posture, 20% Fluency, 10% Filler Word Reduction
    effectiveness_professionalism = round(
        (vocabulary_score * 0.4) + (posture * 0.3) + (fluency_score * 0.2) + (fillers_score * 0.1)
    )
    # - Engagement: 40% Eye Contact, 30% Gesture Effectiveness, 20% Smile Frequency, 10% Speaking Pace
    effectiveness_engagement = round(
        (eye_contact * 0.4) + (gesture_effectiveness * 0.3) + (smile_frequency * 0.2) + (speaking_pace_score * 0.1)
    )
    # - Persuasiveness: 30% Content Quality, 30% Confidence Score, 20% Vocabulary Score, 20% Eye Contact
    effectiveness_persuasiveness = round(
        (content_quality * 0.3) + (effectiveness_confidence * 0.3) + (vocabulary_score * 0.2) + (eye_contact * 0.2)
    )
    # - Leadership Presence: 30% Posture, 30% Voice Stability, 20% Eye Contact, 20% Persuasiveness
    effectiveness_leadership = round(
        (posture * 0.3) + (stability_score * 0.3) + (eye_contact * 0.2) + (effectiveness_persuasiveness * 0.2)
    )

    # 6. Overall Communication Score
    # - Speech Analysis (average of 6 speech metrics: Pace, Clarity, Pronunciation, Fluency, Confidence, Fillers)
    avg_speech = (speaking_pace_score + clarity_score + pronunciation_score + fluency_score + confidence_speech_score + fillers_score) / 6
    # - Body Language (average of 5 body language metrics: Eye Contact, Posture, Gestures, Head Movement, Facial Expressions)
    avg_body = (eye_contact_score + posture_score + gestures_score + head_movement_score + facial_expression_score) / 5
    # - Content Quality
    content_quality_score = content_quality
    # - Engagement
    engagement_score = effectiveness_engagement
    
    # - Overall Communication Score: 35% Speech Analysis, 25% Body Language, 20% Content Quality, 20% Engagement
    overall_score = round(
        (avg_speech * 0.35) + (avg_body * 0.25) + (content_quality_score * 0.20) + (engagement_score * 0.20)
    )
    
    # Rating Classification
    if overall_score >= 90:
        rating = "Excellent"
    elif overall_score >= 75:
        rating = "Good"
    elif overall_score >= 55:
        rating = "Average"
    else:
        rating = "Needs Improvement"

    logger.info(f"Computed Overall Score: {overall_score}/100, Rating: {rating}")
    return {
        "overall_score": overall_score,
        "rating": rating,
        
        # Speech metrics
        "speech_analysis": {
            "speaking_rate": {"score": int(speaking_pace_score), "wpm": wpm},
            "clarity": {"score": int(clarity_score), "whisper_confidence": whisper_confidence},
            "pronunciation": {"score": int(pronunciation_score)},
            "fluency": {"score": int(fluency_score), "pause_count": pause_count},
            "fillers": {"score": int(fillers_score), "filler_count": total_fillers},
            "confidence": {"score": int(confidence_speech_score)}
        },
        
        # Body language metrics
        "body_language_analysis": {
            "eye_contact": {"score": int(eye_contact_score), "eye_contact_pct": eye_contact},
            "facial_expressions": {"score": int(facial_expression_score), "smile_freq": smile_frequency},
            "posture": {"score": int(posture_score)},
            "gestures": {"score": int(gestures_score), "hand_detection_rate": hand_detection_rate},
            "head_movement": {"score": int(head_movement_score)}
        },
        
        # Effectiveness metrics
        "communication_effectiveness": {
            "confidence": {"score": int(effectiveness_confidence)},
            "professionalism": {"score": int(effectiveness_professionalism)},
            "engagement": {"score": int(effectiveness_engagement)},
            "persuasiveness": {"score": int(effectiveness_persuasiveness)},
            "leadership_presence": {"score": int(effectiveness_leadership)}
        },
        
        # Content analysis metrics
        "content_analysis": {
            "grammar_quality": int(grammar_score),
            "vocabulary_richness": int(vocabulary_score),
            "top_filler_words": filler_counts
        }
    }
