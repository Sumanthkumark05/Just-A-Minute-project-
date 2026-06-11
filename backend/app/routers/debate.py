import os
import json
import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.orm import Session as DBSession

from app.database import get_db
from app.models import User, Session, DebateSession
from app.auth import get_current_user
from app.config import settings
from app.services.openai_service import OpenAIService
from app.services.audio_processor import extract_audio, process_audio
from app.services.deepgram_service import DeepgramService
from app.services.voice_service import VoiceService
from app.services.vision_processor import process_video

logger = logging.getLogger("jam_analyzer")

router = APIRouter(prefix="/debate", tags=["debate"])

@router.post("/start")
def start_debate(
    topic: str,
    difficulty: str,
    category: str = "Debate",
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db)
):
    """
    Initializes a new Debate Arena session.
    """
    # 1. Create main session record
    session = Session(
        user_id=current_user.id,
        session_type="debate",
        topic=topic,
        category=category
    )
    db.add(session)
    db.flush()

    # 2. Call OpenAI to get the opening opponent statement
    try:
        openai_service = OpenAIService()
        opening_statement = openai_service.generate_debate_opponent_argument(
            topic=topic,
            opponent_difficulty=difficulty,
            user_argument=None
        )
    except Exception as e:
        logger.error(f"Failed to generate opening debate statement: {e}")
        opening_statement = "Let the debate begin. I am ready to hear your opening arguments."

    # 3. Create debate session record
    debate_session = DebateSession(
        session_id=session.id,
        opponent_difficulty=difficulty,
        opponent_argument=opening_statement,
        scorecard={}
    )
    db.add(debate_session)
    db.commit()

    return {
        "session_id": session.id,
        "topic": topic,
        "difficulty": difficulty,
        "opponent_statement": opening_statement
    }

@router.post("/{session_id}/argue")
def submit_argument(
    session_id: str,
    user_argument: str,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db)
):
    """
    Submits user's argument, evaluates it, and generates the AI opponent's response.
    """
    session = db.query(Session).filter(
        Session.id == session_id,
        Session.user_id == current_user.id
    ).first()

    if not session or not session.debate_session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Active debate session not found."
        )

    debate = session.debate_session

    try:
        openai_service = OpenAIService()
        
        # 1. Generate opposing counter-argument
        counter_argument = openai_service.generate_debate_opponent_argument(
            topic=session.topic,
            opponent_difficulty=debate.opponent_difficulty,
            user_argument=user_argument
        )
        
        # 2. Score user's current argument
        eval_prompt = f"""
        Evaluate the user's debate argument on the topic: "{session.topic}"
        User Argument:
        \"\"\"{user_argument}\"\"\"
        
        Score from 0 to 100 for each:
        - argument_quality
        - persuasion
        - logical_consistency
        
        Return ONLY valid JSON like:
        {{"argument_quality": 80, "persuasion": 75, "logical_consistency": 85}}
        """
        
        res = openai_service.client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": eval_prompt}],
            response_format={"type": "json_object"},
            temperature=0.2
        )
        
        scores = json.loads(res.choices[0].message.content.strip())
        
        # 3. Update debate record
        debate.opponent_argument = counter_argument
        debate.argument_quality_score = scores.get("argument_quality", 70)
        debate.persuasion_score = scores.get("persuasion", 70)
        debate.logical_consistency_score = scores.get("logical_consistency", 70)
        debate.scorecard = scores
        
        db.commit()

        return {
            "opponent_statement": counter_argument,
            "scores": scores
        }
        
    except Exception as e:
        logger.error(f"Failed to process debate argument: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Debate process error: {str(e)}"
        )

@router.post("/session/{session_id}/upload")
async def upload_debate_video(
    session_id: str,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db)
):
    """
    Saves and processes user's recorded argument video, scoring visual, acoustic, and content logic,
    and returns AI opponent's rebuttal response.
    """
    session = db.query(Session).filter(
        Session.id == session_id,
        Session.user_id == current_user.id
    ).first()

    if not session or not session.debate_session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Active debate session not found."
        )

    debate = session.debate_session

    # Save uploaded video
    file_ext = os.path.splitext(file.filename)[1] or ".webm"
    video_filename = f"debate_{session_id}_{len(debate.scorecard or {})}{file_ext}"
    video_path = os.path.join(settings.UPLOAD_DIR, video_filename)

    try:
        with open(video_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
    except Exception as e:
        logger.error(f"Failed to save debate video: {e}")
        raise HTTPException(status_code=500, detail="Failed to save video.")

    # 1. Extract audio channel
    # 1. Run redesigned audio analysis (transcription + acoustic metrics)
    try:
        speech_results = process_audio(video_path)
        transcript_text = speech_results["transcript"]
        transcript_data = {
            "raw_transcript": speech_results["raw_transcript"],
            "confidence_score": speech_results["transcript_confidence"],
            "wpm": speech_results["words_per_minute"]
        }
        voice_metrics = {
            "pitch_variation": 0.0,
            "vocal_verdict": "Dynamic" if speech_results["words_per_minute"] > 100 else "Stable",
            "stability_score": speech_results["transcript_confidence"]
        }
    except Exception as e:
        logger.error(f"Debate audio analysis failed: {e}")
        transcript_text = "Transcription failed."
        transcript_data = {"raw_transcript": "", "confidence_score": 0, "wpm": 0}
        voice_metrics = {"pitch_variation": 0.0, "vocal_verdict": "Flat", "stability_score": 50}

    # 4. MediaPipe pose and gaze tracking
    try:
        face_metrics = process_video(video_path)
    except Exception as e:
        logger.error(f"Debate MediaPipe analysis failed: {e}")
        face_metrics = {"eye_contact_percentage": 50.0, "posture_stability": 50.0, "attention_score": 50.0}

    # 5. Evaluate argument content & delivery using OpenAI
    try:
        openai_service = OpenAIService()
        
        # Counter-argument
        counter_argument = openai_service.generate_debate_opponent_argument(
            topic=session.topic,
            opponent_difficulty=debate.opponent_difficulty,
            user_argument=transcript_text
        )

        # Multi-dimensional scores
        eval_prompt = f"""
        Evaluate the user's debate argument on the topic: "{session.topic}"
        User Argument:
        \"\"\"{transcript_text}\"\"\"
        
        Vocal energy variation: {voice_metrics.get("energy_variation")}
        Gaze eye contact: {face_metrics.get("eye_contact_percentage")}%
        
        Score from 0 to 100 for each of the following:
        - argument_quality: depth of points.
        - persuasion: rhetorical structure.
        - logical_consistency: coherence.
        - rebuttal_quality: direct clash with opponent.
        - clarity: structured clarity.
        - vocabulary: wording.
        - confidence: delivery.
        
        Return ONLY valid JSON like:
        {{
            "argument_quality": 80,
            "persuasion": 75,
            "logical_consistency": 85,
            "rebuttal_quality": 78,
            "clarity": 82,
            "vocabulary": 80,
            "confidence": 75
        }}
        """

        res = openai_service.client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": eval_prompt}],
            response_format={"type": "json_object"},
            temperature=0.2
        )
        
        scores = json.loads(res.choices[0].message.content.strip())
        
        # 6. Update database model record
        debate.opponent_argument = counter_argument
        debate.argument_quality_score = scores.get("argument_quality", 70)
        debate.persuasion_score = scores.get("persuasion", 70)
        debate.logical_consistency_score = scores.get("logical_consistency", 70)
        debate.confidence_score = scores.get("confidence", 70)
        debate.rebuttal_score = scores.get("rebuttal_quality", 70)
        debate.communication_score = scores.get("clarity", 70)
        
        # Save visual/acoustic attributes
        debate.eye_contact_percentage = face_metrics.get("eye_contact_percentage", 50.0)
        debate.speaking_speed_wpm = transcript_data.get("wpm", 120)
        debate.clarity_score = scores.get("clarity", 70)
        debate.vocabulary_score = scores.get("vocabulary", 70)
        
        debate.scorecard = scores
        db.commit()

        return {
            "opponent_statement": counter_argument,
            "scores": scores,
            "transcript": transcript_text,
            "voice_verdict": voice_metrics.get("vocal_verdict", "Flat"),
            "eye_contact": face_metrics.get("eye_contact_percentage", 50.0),
            "wpm": transcript_data.get("wpm", 120)
        }

    except Exception as e:
        logger.error(f"Failed evaluating debate video: {e}")
        raise HTTPException(status_code=500, detail=f"Debate upload error: {str(e)}")
