import pytest
import numpy as np
from app.services.audio_processor import clean_word, analyze_speech_metrics
from app.services.vision_processor import estimate_gaze_hit, estimate_head_pose
from app.services.ai_analyzer import generate_local_evaluation, combine_metrics

def test_clean_word():
    assert clean_word("Hello!!!") == "hello"
    assert clean_word("world,") == "world"
    assert clean_word("  Test's  ") == "test's"
    assert clean_word("...") == ""

def test_analyze_speech_metrics():
    # 5 words in 2 seconds, no fillers, no pauses
    words = [
        {"word": "This", "start": 0.0, "end": 0.3},
        {"word": "is", "start": 0.4, "end": 0.6},
        {"word": "a", "start": 0.7, "end": 0.9},
        {"word": "clean", "start": 1.0, "end": 1.4},
        {"word": "speech", "start": 1.5, "end": 1.9}
    ]
    duration = 2.0
    metrics = analyze_speech_metrics(words, duration)
    
    assert metrics["words_per_minute"] == 150
    assert metrics["filler_words"] == {
        "um": 0, "uh": 0, "ah": 0, "er": 0, "like": 0, "you know": 0,
        "actually": 0, "basically": 0, "literally": 0, "sort of": 0, "kind of": 0
    }
    assert metrics["pause_count"] == 0
    assert metrics["pause_duration"] == 0.0
    assert metrics["vocabulary_score"] > 50
    assert metrics["speaking_pace_score"] == 77  # 100 - abs(150-135)*1.5

def test_analyze_speech_metrics_with_fillers():
    # Speech with fillers and pauses
    words = [
        {"word": "So", "start": 0.0, "end": 0.3},
        {"word": "um", "start": 0.4, "end": 0.7},
        {"word": "like", "start": 0.8, "end": 1.1},
        {"word": "you", "start": 3.0, "end": 3.2}, # > 1.5s pause since last end (1.1)
        {"word": "know", "start": 3.3, "end": 3.6}
    ]
    duration = 4.0
    metrics = analyze_speech_metrics(words, duration)
    
    assert metrics["filler_words"]["um"] == 1
    assert metrics["filler_words"]["like"] == 1
    assert metrics["filler_words"]["you know"] == 1
    assert metrics["pause_count"] == 1
    assert metrics["pause_duration"] == 1.9

def test_estimate_gaze_hit():
    # Mock aligned pupil coordinates (Centered)
    left_eye = [np.array([0.1, 0.5]), np.array([0.9, 0.5])]
    left_pupil = np.array([0.5, 0.5])
    
    right_eye = [np.array([0.1, 0.5]), np.array([0.9, 0.5])]
    right_pupil = np.array([0.5, 0.5])
    
    assert estimate_gaze_hit(left_eye, left_pupil, right_eye, right_pupil) is True

    # Mock unaligned pupil coordinates (Looking away)
    left_pupil_away = np.array([0.95, 0.5])
    right_pupil_away = np.array([0.95, 0.5])
    
    assert estimate_gaze_hit(left_eye, left_pupil_away, right_eye, right_pupil_away) is False

def test_local_evaluation_fallback():
    speech = {
        "transcript": "Hello from artificial intelligence. We are testing the code today.",
        "words_per_minute": 130,
        "filler_words": {
            "um": 1, "uh": 0, "ah": 0, "er": 0, "like": 0, "you know": 0,
            "actually": 0, "basically": 0, "literally": 0, "sort of": 0, "kind of": 0
        },
        "pause_count": 0,
        "pause_duration": 0.0,
        "vocabulary_score": 85,
        "speaking_pace_score": 95,
        "duration": 10.0
    }
    vision = {
        "eye_contact_score": 85,
        "posture_score": 90,
        "confidence_score": 88,
        "engagement_score": 88,
        "emotion_distribution": {"Confident": 70, "Neutral": 20, "Nervous": 10, "Happy": 0, "Anxious": 0},
        "dominant_emotion": "Confident",
        "emotion_stability_score": 85,
        "fidgeting_index": 0.5
    }
    
    eval_report = generate_local_evaluation(
        topic="Is AI replacing jobs?",
        category="Technology",
        speech=speech,
        vision=vision
    )
    
    assert "summary" in eval_report
    assert len(eval_report["strengths"]) > 0
    assert eval_report["grammar_score"] > 80
    assert eval_report["communication_score"] > 70
    
    combined = combine_metrics(speech, vision, eval_report)
    assert combined["fluency_score"] == 91  # 95 - 4*1
    assert combined["eye_contact_score"] == 85
    assert combined["grammar_score"] == eval_report["grammar_score"]
