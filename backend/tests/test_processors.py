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

def test_speech_evaluation_weighted_and_safeguards():
    from app.services.ai_analyzer import calculate_local_semantic_relevance, analyze_video_speech, get_insufficient_audio_response
    
    # 1. Test local semantic relevance scoring
    score = calculate_local_semantic_relevance(
        transcript="AI is replacing standard workforce jobs and creating career opportunities in technology",
        topic="Is AI replacing jobs?",
        category="Technology"
    )
    assert score >= 50
    
    # Test synonym mapping
    score_synonym = calculate_local_semantic_relevance(
        transcript="Artificial intelligence automates careers and work in the physical environment",
        topic="Is AI replacing jobs?",
        category="Technology"
    )
    assert score_synonym >= 50
    
    # 2. Test weighted scoring logic
    speech = {
        "transcript": "hello",
        "transcript_confidence": 90,
        "speaking_pace_score": 80,
        "words_per_minute": 130,
        "filler_words": {"um": 0}
    }
    vision = {
        "confidence_score": 80,
        "fidgeting_index": 0.0,
        "eye_contact_score": 80
    }
    evaluation = {
        "semantic_similarity_score": 80,
        "grammar_score": 80
    }
    combined = combine_metrics(speech, vision, evaluation)
    
    # Weights: 30% conf (27) + 30% relevance (24) + 20% fluency (16) + 10% grammar (8) + 10% pronunciation (9.8 clamped to 9) = 84
    assert combined["accuracy_score"] == 84
    
    # 3. Test safeguards triggering on invalid audio path
    blocked_empty = analyze_video_speech("dummy_path", "Is AI replacing jobs?", "Technology")
    assert blocked_empty["accuracy_score"] == 0
    assert "Audio quality insufficient for reliable evaluation." in blocked_empty["transcript"]

def test_speech_analysis_quality_improvements():
    from app.services.audio_processor import count_filler_words, clean_fillers_from_transcript
    
    # 1. Test repeat variations matching
    fillers = count_filler_words("uumm, uhhh, er, like, you know, actually, basically, literally, kind of, sort of.")
    assert fillers["um"] == 1
    assert fillers["uh"] == 1
    assert fillers["er"] == 1
    assert fillers["like"] == 1
    assert fillers["you know"] == 1
    assert fillers["actually"] == 1
    assert fillers["basically"] == 1
    assert fillers["literally"] == 1
    assert fillers["sort of"] == 1
    assert fillers["kind of"] == 1

    # 2. Test clean_fillers_from_transcript
    raw = "So, um, like, actually, you know, we should go."
    cleaned = clean_fillers_from_transcript(raw)
    assert cleaned == "So, we should go."

    # 3. Test analyze_speech_metrics with filler occurrences
    words = [
        {"word": "So", "start": 0.0, "end": 0.3},
        {"word": "uumm", "start": 0.4, "end": 0.7},
        {"word": "like", "start": 0.8, "end": 1.1},
        {"word": "we", "start": 1.2, "end": 1.5},
        {"word": "should", "start": 1.6, "end": 1.9},
        {"word": "go", "start": 2.0, "end": 2.3}
    ]
    duration = 3.0
    metrics = analyze_speech_metrics(words, duration)
    assert metrics["raw_transcript"] == "So uumm like we should go"
    assert metrics["transcript"] == "So we should go"
    assert len(metrics["filler_occurrences"]) == 2
    assert metrics["filler_occurrences"][0]["filler"] == "um"
    assert metrics["filler_occurrences"][0]["start"] == 0.4
    assert metrics["filler_occurrences"][1]["filler"] == "like"
    assert metrics["filler_occurrences"][1]["start"] == 0.8

