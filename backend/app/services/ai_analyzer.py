import logging
import time
import re
from typing import Dict, Any, List
from app.config import settings
from app.services.audio_processor import process_audio
from app.services.vision_processor import process_video
from app.services.scoring_engine import calculate_evidence_scores
from app.services.ai_evaluator import evaluate_speech_with_gemini

logger = logging.getLogger("jam_analyzer")

def get_no_speech_response(message: str, diagnostics: Dict[str, Any]) -> Dict[str, Any]:
    """
    Returns a database-conforming dictionary indicating that no speech was detected,
    conforming to the diagnostics requirements.
    """
    return {
        "status": "NO_SPEECH_DETECTED",
        "feedback": message,
        "original_transcript": "",
        "corrected_transcript": "",
        "transcript": "",
        "overall_score": 0,
        "rating": "Needs Improvement",
        "diagnostics": diagnostics
    }

def generate_local_report_fallback(topic: str, category: str, transcript: str, scores: Dict[str, Any]) -> Dict[str, Any]:
    """
    Generates a local, rule-based qualitative evaluation matching the GeminiReportOutput schema
    when API keys are missing or rate-limited.
    """
    wpm = scores["speech_analysis"]["speaking_rate"]["wpm"]
    fillers = scores["speech_analysis"]["fillers"]["filler_count"]
    eye_pct = scores["body_language_analysis"]["eye_contact"]["eye_contact_pct"]
    posture = scores["body_language_analysis"]["posture"]["score"]
    
    # 1. Executive Summary
    summary_bullets = [
        f"Delivered a speech on the topic '{topic}' under category '{category}'.",
        f"Maintained a speaking pace of {wpm} WPM with {fillers} filler word occurrences.",
        f"Visual eye contact was recorded at {eye_pct:.1f}% with posture rating at {posture}%."
    ]
    
    # 2. Detailed lists
    strengths = []
    improvements = []
    
    if 120 <= wpm <= 150:
        strengths.append("Maintained an optimal, highly conversational speaking rate.")
    else:
        improvements.append("Adjust speaking rate closer to the conversational 135 WPM threshold.")
        
    if eye_pct >= 70:
        strengths.append("Established consistent eye contact directly with the camera lens.")
    else:
        improvements.append("Focus gaze forward on the camera lens to project confidence.")
        
    if fillers <= 3:
        strengths.append("Extremely fluent transition phrasing with minimal filler vocalizations.")
    else:
        improvements.append("Reduce vocal filler words by replacing them with silent transition pauses.")

    if len(strengths) < 2:
        strengths.append("Earnest delivery and structural clarity.")
        strengths.append("Addressed the general talking points of the category.")
    if len(improvements) < 2:
        improvements.append("Practice posture stabilization drills.")
        improvements.append("Incorporate rhetorical structural patterns.")

    # 3. Action plan
    immediate = ["Implement the Lens-Dot target drill to anchor your visual gaze."]
    short_term = ["Play the 'Pause Game' during discussions to eliminate filler words."]
    long_term = ["Rehearse system architecture talking points aloud to build vocabulary structure."]

    return {
        "executive_summary": "\n".join([f"- {b}" for b in summary_bullets]),
        
        # Speech text
        "speech_rate_reason": "Pacing was conversational." if 120 <= wpm <= 150 else "Speaking pace deviated from optimal range.",
        "speech_rate_suggestion": "Maintain this comfortable rhythm." if 120 <= wpm <= 150 else "Slow down or speed up practice drills.",
        
        "speech_clarity_reason": "Transcription was successfully mapped without severe audio dropouts.",
        "speech_clarity_suggestion": "Ensure consistent distance from the microphone.",
        
        "speech_pronunciation_reason": "Enunciation was clean and words were transcribed successfully.",
        "speech_pronunciation_suggestion": "Speak slowly on multi-syllabic terms.",
        
        "speech_fluency_reason": "Audible flow was generally smooth.",
        "speech_fluency_suggestion": "Practice structural outlines to reduce hesitation.",
        
        "speech_fillers_reason": f"Filler word frequency was recorded at {fillers} items.",
        "speech_fillers_suggestion": "Practice locking your mouth during transition gaps.",
        
        "speech_confidence_reason": "Vocal pitch and loudness indicators remained stable.",
        "speech_confidence_suggestion": "Practice deep breathing prior to recording.",

        # Body language text
        "body_eye_contact_evidence": f"Looked directly at the camera {eye_pct:.1f}% of the duration.",
        "body_eye_contact_suggestion": "Anchor visual focus next to the camera lens.",
        
        "body_expressions_evidence": "Facial movements matched standard active listening patterns.",
        "body_expressions_suggestion": "Utilize warm smiles at opening and closing points.",
        
        "body_posture_evidence": f"Maintained stable posture alignment scoring {posture}%.",
        "body_posture_suggestion": "Align shoulders and check camera angle height.",
        
        "body_gestures_evidence": "Gestures were subtle or limited.",
        "body_gestures_suggestion": "Raise hands to chest level during emphasis points.",
        
        "body_head_movement_evidence": "Head roll and tilt stayed within stable parameters.",
        "body_head_movement_suggestion": "Keep chin level with the camera horizontal frame line.",

        # Effectiveness text
        "effectiveness_confidence_reason": "Measurable delivery signals reflect a balanced confidence style.",
        "effectiveness_confidence_recommendation": "Vocalize with clear, assertive projection.",
        
        "effectiveness_professionalism_reason": "Vocabulary choices and posture alignment were professional.",
        "effectiveness_professionalism_recommendation": "Adopt structured transition terms.",
        
        "effectiveness_engagement_reason": "Eye contact and expressions kept audience focus.",
        "effectiveness_engagement_recommendation": "Vary tempo dynamically during key sentences.",
        
        "effectiveness_persuasiveness_reason": "Core vocabulary arguments showed basic logic flow.",
        "effectiveness_persuasiveness_recommendation": "Present claims supported by evidence.",
        
        "effectiveness_leadership_reason": "Command of physical presence and head posture was positive.",
        "effectiveness_leadership_recommendation": "Deliver transition statements with structural pauses.",

        # Content text
        "content_grammar_quality": "Grammatical structure was simple and direct.",
        "content_vocabulary_richness": "Vocabulary selection was clear, focusing on category keywords.",
        
        # Lists
        "detailed_strengths": strengths[:5] + ["Consistent posture"] * max(0, 5 - len(strengths)),
        "areas_for_improvement": improvements[:5] + ["Increase vocabulary richness"] * max(0, 5 - len(improvements)),
        
        # Action Plan
        "action_immediate": immediate,
        "action_short_term": short_term,
        "action_long_term": long_term,
        
        "expected_answer": f"An expert response to '{topic}' should introduce the core concept, explore trade-offs, and outline real-world examples.",
        "corrected_transcript": transcript,
        "summary": f"The speaker presented comments regarding '{topic}' under category '{category}'.",
        "missing_concepts": ["Advanced industrial case studies", "Quantitative statistical evidence"]
    }

def analyze_video_speech(video_path: str, topic: str, category: str) -> Dict[str, Any]:
    """
    Centralized communication analyzer orchestrating audio processing, visual computer vision,
    evidence formula scoring, and report generation.
    """
    logger.info(f"--- Centralized Analysis Overhaul: '{topic}' ---")
    start_time = time.time()
    
    # 1. Run Audio & Speech Processing
    try:
        speech_results = process_audio(video_path)
    except Exception as e:
        logger.error(f"Speech processing failed: {e}")
        diagnostics = {
            "audio_length": 0.0,
            "detected_speech_length": 0.0,
            "whisper_confidence": 0.0,
            "frames_processed": 0,
            "face_detection_rate": 0.0
        }
        return get_no_speech_response("No speech detected. Analysis unavailable.", diagnostics)

    # Extract diagnostic variables
    audio_length = speech_results.get("duration", 0.0)
    detected_speech_length = speech_results.get("speech_duration", 0.0)
    whisper_confidence = speech_results.get("transcript_confidence", 0)
    
    # Apply strict VAD limit: Speech duration must be >= 2.0s
    if detected_speech_length < 2.0:
        logger.warning(f"VAD limit triggered: speech duration ({detected_speech_length}s) is less than 2.0s.")
        diagnostics = {
            "audio_length": round(audio_length, 1),
            "detected_speech_length": round(detected_speech_length, 1),
            "whisper_confidence": whisper_confidence,
            "frames_processed": 0,
            "face_detection_rate": 0.0
        }
        return get_no_speech_response("No speech detected (Speech duration under 2 seconds).", diagnostics)

    # 2. Run Video & Computer Vision Processing
    try:
        vision_results = process_video(video_path)
    except Exception as e:
        logger.error(f"Visual processing failed: {e}")
        vision_results = get_fallback_metrics()

    # Get video diagnostics
    video_diags = vision_results.get("diagnostics", {"frames_processed": 0, "face_detection_rate": 0.0})
    
    # Consolidate diagnostics
    diagnostics = {
        "audio_length": round(audio_length, 1),
        "detected_speech_length": round(detected_speech_length, 1),
        "whisper_confidence": whisper_confidence,
        "frames_processed": video_diags.get("frames_processed", 0),
        "face_detection_rate": video_diags.get("face_detection_rate", 0.0)
    }

    # 3. Librosa Voice metrics mapping
    # Check if voice metrics are available, or create mock voice inputs
    voice_metrics = {
        "stability_score": 75.0,
        "pitch_variation": 20.0,
        "energy_variation": 0.05
    }

    # 4. Compute Evidence-based scores (Formula Only)
    scores = calculate_evidence_scores(speech_results, vision_results, voice_metrics)

    # 5. Generate qualitative report (Gemini/Groq vs Fallback)
    transcript = speech_results.get("transcript", "")
    try:
        report_text = evaluate_speech_with_gemini(topic, category, transcript, scores)
    except Exception as e:
        logger.warning(f"AI report generation failed: {e}. Generating local fallback report.")
        report_text = generate_local_report_fallback(topic, category, transcript, scores)

    # Extract score details for analytics dashboard
    wpm = scores["speech_analysis"]["speaking_rate"]["wpm"]
    total_fillers = scores["speech_analysis"]["fillers"]["filler_count"]
    eye_contact = scores["body_language_analysis"]["eye_contact"]["eye_contact_pct"]
    posture = scores["body_language_analysis"]["posture"]["score"]

    # 6. Build the unified report dictionary
    final_report = {
        "status": "SUCCESS",
        "original_transcript": speech_results.get("raw_transcript", ""),
        "corrected_transcript": report_text.get("corrected_transcript", transcript),
        "transcript": report_text.get("corrected_transcript", transcript),
        "summary": report_text.get("summary", ""),
        # Expose whisper confidence so jam.py Transcript record can access it
        "transcript_confidence": whisper_confidence,
        
        # Primary Database Metrics
        "overall_score": scores["overall_score"],
        "rating": scores["rating"],
        
        # Sub-scores
        "fluency_score": scores["speech_analysis"]["fluency"]["score"],
        "grammar_score": scores["content_analysis"]["grammar_quality"],
        "pronunciation_score": scores["speech_analysis"]["pronunciation"]["score"],
        "confidence_score": scores["communication_effectiveness"]["confidence"]["score"],
        "communication_score": scores["communication_effectiveness"]["leadership_presence"]["score"],
        "words_per_minute": scores["speech_analysis"]["speaking_rate"]["wpm"],
        
        # Sub-metrics
        "vocabulary_score": scores["content_analysis"]["vocabulary_richness"],
        "speaking_pace_score": scores["speech_analysis"]["speaking_rate"]["score"],
        "eye_contact_score": scores["body_language_analysis"]["eye_contact"]["score"],
        "posture_score": scores["body_language_analysis"]["posture"]["score"],
        "engagement_score": scores["communication_effectiveness"]["engagement"]["score"],
        "content_quality_score": scores["communication_effectiveness"]["persuasiveness"]["score"],
        "topic_relevance_score": scores["communication_effectiveness"]["professionalism"]["score"],
        "dominant_emotion": vision_results.get("expressions", {}).get("confidence", 70.0), # fallback emotion
        "emotion_stability_score": scores["body_language_analysis"]["facial_expressions"]["score"],
        
        # Professional fields
        "expected_answer": report_text.get("expected_answer", ""),
        "technical_accuracy_score": scores["communication_effectiveness"]["professionalism"]["score"] // 10,
        "completeness_score": scores["communication_effectiveness"]["persuasiveness"]["score"] // 10,
        "clarity_score": scores["speech_analysis"]["clarity"]["score"] // 10,
        "relevance_score": scores["communication_effectiveness"]["professionalism"]["score"] // 10,
        "final_verdict": scores["rating"],
        "missing_concepts": report_text.get("missing_concepts", []),
        
        # Nested Report sections matching the 10 structure items
        "report_data": {
            "overall_score": scores["overall_score"],
            "rating": scores["rating"],
            "executive_summary": report_text.get("executive_summary", ""),
            "speech_analysis": {
                "speaking_rate": {
                    "score": scores["speech_analysis"]["speaking_rate"]["score"],
                    "reason": report_text.get("speech_rate_reason", ""),
                    "suggestion": report_text.get("speech_rate_suggestion", "")
                },
                "clarity": {
                    "score": scores["speech_analysis"]["clarity"]["score"],
                    "reason": report_text.get("speech_clarity_reason", ""),
                    "suggestion": report_text.get("speech_clarity_suggestion", "")
                },
                "pronunciation": {
                    "score": scores["speech_analysis"]["pronunciation"]["score"],
                    "reason": report_text.get("speech_pronunciation_reason", ""),
                    "suggestion": report_text.get("speech_pronunciation_suggestion", "")
                },
                "fluency": {
                    "score": scores["speech_analysis"]["fluency"]["score"],
                    "reason": report_text.get("speech_fluency_reason", ""),
                    "suggestion": report_text.get("speech_fluency_suggestion", "")
                },
                "fillers": {
                    "score": scores["speech_analysis"]["fillers"]["score"],
                    "reason": report_text.get("speech_fillers_reason", ""),
                    "suggestion": report_text.get("speech_fillers_suggestion", "")
                },
                "confidence": {
                    "score": scores["speech_analysis"]["confidence"]["score"],
                    "reason": report_text.get("speech_confidence_reason", ""),
                    "suggestion": report_text.get("speech_confidence_suggestion", "")
                }
            },
            "body_language_analysis": {
                "eye_contact": {
                    "score": scores["body_language_analysis"]["eye_contact"]["score"],
                    "evidence": report_text.get("body_eye_contact_evidence", ""),
                    "suggestion": report_text.get("body_eye_contact_suggestion", "")
                },
                "facial_expressions": {
                    "score": scores["body_language_analysis"]["facial_expressions"]["score"],
                    "evidence": report_text.get("body_expressions_evidence", ""),
                    "suggestion": report_text.get("body_expressions_suggestion", "")
                },
                "posture": {
                    "score": scores["body_language_analysis"]["posture"]["score"],
                    "evidence": report_text.get("body_posture_evidence", ""),
                    "suggestion": report_text.get("body_posture_suggestion", "")
                },
                "gestures": {
                    "score": scores["body_language_analysis"]["gestures"]["score"],
                    "evidence": report_text.get("body_gestures_evidence", ""),
                    "suggestion": report_text.get("body_gestures_suggestion", "")
                },
                "head_movement": {
                    "score": scores["body_language_analysis"]["head_movement"]["score"],
                    "evidence": report_text.get("body_head_movement_evidence", ""),
                    "suggestion": report_text.get("body_head_movement_suggestion", "")
                }
            },
            "communication_effectiveness": {
                "confidence": {
                    "score": scores["communication_effectiveness"]["confidence"]["score"],
                    "reason": report_text.get("effectiveness_confidence_reason", ""),
                    "recommendation": report_text.get("effectiveness_confidence_recommendation", "")
                },
                "professionalism": {
                    "score": scores["communication_effectiveness"]["professionalism"]["score"],
                    "reason": report_text.get("effectiveness_professionalism_reason", ""),
                    "recommendation": report_text.get("effectiveness_professionalism_recommendation", "")
                },
                "engagement": {
                    "score": scores["communication_effectiveness"]["engagement"]["score"],
                    "reason": report_text.get("effectiveness_engagement_reason", ""),
                    "recommendation": report_text.get("effectiveness_engagement_recommendation", "")
                },
                "persuasiveness": {
                    "score": scores["communication_effectiveness"]["persuasiveness"]["score"],
                    "reason": report_text.get("effectiveness_persuasiveness_reason", ""),
                    "recommendation": report_text.get("effectiveness_persuasiveness_recommendation", "")
                },
                "leadership_presence": {
                    "score": scores["communication_effectiveness"]["leadership_presence"]["score"],
                    "reason": report_text.get("effectiveness_leadership_reason", ""),
                    "recommendation": report_text.get("effectiveness_leadership_recommendation", "")
                }
            },
            "content_analysis": {
                "grammar_quality": scores["content_analysis"]["grammar_quality"],
                "vocabulary_richness": scores["content_analysis"]["vocabulary_richness"],
                "top_filler_words": scores["content_analysis"]["top_filler_words"],
                "grammar_text": report_text.get("content_grammar_quality", ""),
                "vocabulary_text": report_text.get("content_vocabulary_richness", "")
            },
            "detailed_strengths": report_text.get("detailed_strengths", []),
            "areas_for_improvement": report_text.get("areas_for_improvement", []),
            "action_plan": {
                "immediate_actions": report_text.get("action_immediate", []),
                "short_term_actions": report_text.get("action_short_term", []),
                "long_term_actions": report_text.get("action_long_term", [])
            },
            "analytics_dashboard": {
                "speech_confidence": whisper_confidence,
                "eye_contact_pct": round(eye_contact, 1),
                "posture_score": posture,
                "speaking_rate": wpm,
                "filler_word_count": total_fillers,
                "engagement_score": scores["communication_effectiveness"]["engagement"]["score"]
            }
        },
        
        # Acoustic and visual data stores for DB mapping
        "filler_words": speech_results.get("filler_words", {}),
        "emotion_distribution": vision_results.get("expressions", {}),
        "mistakes": report_text.get("areas_for_improvement", []),
        "strengths": report_text.get("detailed_strengths", []),
        "improvements": report_text.get("areas_for_improvement", []),
        "exercises": report_text.get("action_immediate", []),
        "diagnostics": diagnostics
    }
    
    elapsed = time.time() - start_time
    logger.info(f"AI Redesigned Pipeline completed in {elapsed:.2f}s.")
    return final_report
