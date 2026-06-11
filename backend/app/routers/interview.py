import os
import logging
from typing import List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.orm import Session as DBSession

from app.database import get_db
from app.models import User, Session, InterviewSession, Transcript, CommunicationDNA, VoiceMetrics, FaceMetrics, Report
from app.schemas import SessionOut
from app.auth import get_current_user
from app.config import settings
from app.services.openai_service import OpenAIService
from app.services.ai_analyzer import analyze_video_speech

logger = logging.getLogger("jam_analyzer")

router = APIRouter(prefix="/interview", tags=["interview"])


@router.post("/start")
def start_interview(
    role: str,
    round_type: str,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db)
):
    """
    Initializes a new Interview Simulator session and returns the first question.
    """
    topic = f"{role} Mock Interview ({round_type})"
    category = "Interview"

    # 1. Create session record
    session = Session(
        user_id=current_user.id,
        session_type="interview",
        topic=topic,
        category=category
    )
    db.add(session)
    db.flush()

    # 2. Call OpenAI to generate the first question
    try:
        openai_service = OpenAIService()
        first_question = openai_service.generate_interview_question(
            role=role,
            round_type=round_type,
            question_history=[]
        )
    except Exception as e:
        logger.error(f"Failed to generate first interview question: {e}")
        first_question = "Tell me about yourself and your background."

    # 3. Create interview session record
    interview_session = InterviewSession(
        session_id=session.id,
        role=role,
        round_type=round_type,
        question_history=[first_question]
    )
    db.add(interview_session)
    db.commit()

    return {
        "session_id": session.id,
        "role": role,
        "round_type": round_type,
        "question": first_question
    }


@router.post("/{session_id}/answer")
def submit_answer(
    session_id: str,
    user_answer: str,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db)
):
    """
    Submits user's text answer, generates constructive feedback, and returns the next question.
    """
    session = db.query(Session).filter(
        Session.id == session_id,
        Session.user_id == current_user.id
    ).first()

    if not session or not session.interview_session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Active interview session not found."
        )

    interview = session.interview_session
    openai_service = OpenAIService()

    try:
        import json

        # 1. Generate feedback for the previous question/answer pair
        last_question = interview.question_history[-1] if interview.question_history else "Tell me about your background."

        feedback_prompt = f"""
        Provide constructive interview coaching feedback on the user's answer.
        Question Asked: "{last_question}"
        User Answer:
        \"\"\"{user_answer}\"\"\"

        Provide concise specific fields:
        - communication_feedback: (tips on clarity, STAR structure, pacing)
        - confidence_feedback: (tips on word certainty, hesitation, vocabulary)

        Return ONLY valid JSON like:
        {{"communication_feedback": "text...", "confidence_feedback": "text..."}}
        """

        res = openai_service.client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": feedback_prompt}],
            response_format={"type": "json_object"},
            temperature=0.2
        )

        feedback_data = json.loads(res.choices[0].message.content.strip())

        # 2. Generate the next follow-up question
        next_question = openai_service.generate_interview_question(
            role=interview.role,
            round_type=interview.round_type,
            question_history=list(interview.question_history)
        )

        # 3. Update interview session record
        history = list(interview.question_history)
        history.append(next_question)
        interview.question_history = history

        interview.communication_feedback = feedback_data.get("communication_feedback", "")
        interview.confidence_feedback = feedback_data.get("confidence_feedback", "")

        db.commit()

        return {
            "feedback": feedback_data,
            "next_question": next_question
        }

    except Exception as e:
        logger.error(f"Failed to process interview response: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Interview process error: {str(e)}"
        )


@router.post("/session/{session_id}/upload", response_model=SessionOut)
async def upload_interview_video(
    session_id: str,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db)
):
    """
    Accepts a recorded video/audio blob from the Interview Simulator.
    Runs the same full evidence-based analysis pipeline as JAM Analyzer:
      - Faster Whisper transcription
      - WebRTC VAD speech detection
      - OpenCV + MediaPipe body language analysis
      - Formula-based evidence scoring
      - Gemini qualitative report generation
    Returns a full SessionOut with 10-section report.
    """
    # 1. Retrieve the session
    session = db.query(Session).filter(
        Session.id == session_id,
        Session.user_id == current_user.id
    ).first()

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Interview session '{session_id}' not found."
        )

    # 2. Save the uploaded file
    file_ext = os.path.splitext(file.filename or "recording.webm")[1] or ".webm"
    video_filename = f"interview_{session_id}{file_ext}"
    video_path = os.path.join(settings.UPLOAD_DIR, video_filename)

    logger.info(f"[Interview Upload] Saving video to: {video_path}")
    try:
        with open(video_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
        logger.info(f"[Interview Upload] Saved {len(content):,} bytes.")
    except Exception as e:
        logger.error(f"[Interview Upload] Failed to save video: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save uploaded video: {str(e)}"
        )

    session.video_url = f"/uploads/{video_filename}"
    db.commit()

    # 3. Run the centralized AI analysis pipeline (identical to JAM)
    logger.info(f"[Interview Upload] Starting analysis pipeline for session '{session_id}'.")
    try:
        report_data = analyze_video_speech(video_path, session.topic, session.category)
    except Exception as e:
        logger.error(f"[Interview Upload] Analysis pipeline failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Video analysis failed: {str(e)}"
        )

    # 4. Handle VAD / no-speech cases
    if report_data.get("status") == "NO_SPEECH_DETECTED":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=report_data.get("feedback", "No speech detected — audio was too short or silent.")
        )

    # 5. Persist Transcript record
    transcript_record = Transcript(
        session_id=session.id,
        raw_transcript=report_data["original_transcript"],
        corrected_transcript=report_data["corrected_transcript"],
        confidence_score=report_data["transcript_confidence"],
        wpm=report_data["words_per_minute"],
        pauses_detected=[],
        word_timings=[]
    )
    db.add(transcript_record)

    # 6. Persist VoiceMetrics record
    v_metrics_record = VoiceMetrics(
        session_id=session.id,
        pitch_variation=0.0,
        energy_variation=0.0,
        rhythm_score=float(report_data["words_per_minute"]),
        stability_score=float(report_data["transcript_confidence"]),
        pause_frequency=0.0,
        vocal_verdict="Dynamic" if report_data["overall_score"] >= 75 else "Stable",
        raw_metrics={}
    )
    db.add(v_metrics_record)

    # 7. Persist FaceMetrics record
    f_metrics_record = FaceMetrics(
        session_id=session.id,
        eye_contact_percentage=float(report_data["eye_contact_score"]),
        gaze_direction_distribution={},
        head_movement_variance=0.0,
        head_tilt_average=0.0,
        smile_frequency=float(report_data["emotion_stability_score"]),
        attention_score=float(report_data["eye_contact_score"]),
        engagement_score=float(report_data["engagement_score"]),
        posture_stability=float(report_data["posture_score"]),
        attention_heatmap=[]
    )
    db.add(f_metrics_record)
    db.flush()

    # 8. Persist CommunicationDNA record
    dna_record = CommunicationDNA(
        user_id=current_user.id,
        session_id=session.id,
        confidence=int(report_data["confidence_score"]),
        fluency=int(report_data["fluency_score"]),
        vocabulary=int(report_data["vocabulary_score"]),
        storytelling=int(report_data["vocabulary_score"]),
        leadership=int(report_data["communication_score"]),
        persuasion=int(report_data["content_quality_score"]),
        emotional_intelligence=int(report_data["emotion_stability_score"]),
        clarity=int(report_data["clarity_score"] * 10),
        energy_level=80,
        speaking_speed=int(report_data["speaking_pace_score"]),
        eye_contact=int(report_data["eye_contact_score"]),
        posture=int(report_data["posture_score"]),
        engagement=int(report_data["engagement_score"]),
        filler_words=int(report_data["overall_score"]),
        profile_summary=report_data["final_verdict"],
        filler_word_frequency=report_data["filler_words"]
    )
    db.add(dna_record)

    # 9. Persist full Report (10-section JSON)
    report = Report(
        session_id=session.id,
        summary=report_data["report_data"]
    )
    db.add(report)

    db.commit()
    db.refresh(session)

    logger.info(f"[Interview Upload] Analysis complete. Overall score: {report_data['overall_score']}/100")
    return session
