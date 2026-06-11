import os
import random
import logging
from typing import List, Optional
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.orm import Session as DBSession

from app.database import get_db
from app.models import User, Session, Transcript, CommunicationDNA, VoiceMetrics, FaceMetrics, GrowthMetrics, Report
from app.schemas import (
    TopicResponse, GenerateTopicResponse, SessionOut, 
    JAMSessionHistoryItem, LeaderboardEntry, ProgressPoint, DashboardStats
)
from app.auth import get_current_user
from app.config import settings

from app.services.deepgram_service import DeepgramService
from app.services.voice_service import VoiceService
from app.services.vision_processor import process_video
from app.services.openai_service import OpenAIService
from app.services.coach_agent import CoachAgent
from app.services.audio_processor import extract_audio
from app.services.topic_generator import generate_topic_from_llm
from app.services.ai_analyzer import analyze_video_speech

logger = logging.getLogger("jam_analyzer")

router = APIRouter(prefix="/jam", tags=["jam"])
api_router = APIRouter(tags=["jam"])

CATEGORIES = [
    "Technology",
    "AI",
    "Education",
    "Business",
    "Environment",
    "Startups",
    "Leadership",
    "Ethics",
    "Social Issues",
    "Innovation",
    "Future Trends",
    "Current Affairs"
]

@api_router.get("/generate-topic", response_model=GenerateTopicResponse)
def get_generate_topic(
    category: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db)
):
    selected_cat = category
    if not selected_cat or selected_cat not in CATEGORIES:
        selected_cat = random.choice(CATEGORIES)
    
    # Retrieve user's recent topics to exclude
    recent_sessions = db.query(Session.topic).filter(
        Session.user_id == current_user.id
    ).order_by(Session.created_at.desc()).limit(20).all()
    exclude_topics = [s[0] for s in recent_sessions if s[0]]
    
    # Call topic generator
    try:
        topic_data = generate_topic_from_llm(selected_cat, exclude_topics)
    except Exception as e:
        logger.error(f"Topic generation failed: {e}")
        # Default topic fallback
        topic_data = {
            "topic": f"The future of {selected_cat} in modern society",
            "category": selected_cat,
            "difficulty": "Medium",
            "keywords": [selected_cat.lower(), "future", "innovation"],
            "talking_points": ["Introduce the significance of " + selected_cat, "Outline key technological challenges", "Conclude with personal thoughts"],
            "estimated_speaking_time": 60
        }

    return {
        "topic": topic_data["topic"],
        "category": topic_data["category"],
        "difficulty": topic_data["difficulty"],
        "keywords": topic_data["keywords"],
        "talking_points": topic_data.get("talking_points", []),
        "estimated_speaking_time": topic_data.get("estimated_speaking_time", 60)
    }

@router.get("/topic", response_model=GenerateTopicResponse)
def get_jam_topic(
    category: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db)
):
    return get_generate_topic(category=category, current_user=current_user, db=db)

@api_router.get("/deepgram/token")
async def get_deepgram_token(current_user: User = Depends(get_current_user)):
    """
    Generates a temporary token for client-side live streaming transcription.
    """
    try:
        service = DeepgramService()
        token = await service.generate_temp_token()
        return {"token": token}
    except Exception as e:
        logger.error(f"Failed to generate Deepgram token: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Deepgram token error: {str(e)}"
        )

@router.post("/session", response_model=SessionOut)
def create_session(
    topic_data: TopicResponse, 
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db)
):
    session = Session(
        user_id=current_user.id,
        session_type="jam",
        topic=topic_data.topic,
        category=topic_data.category,
        instant_start=topic_data.instant_start,
        preparation_mode=topic_data.preparation_mode,
        skip_preparation=topic_data.skip_preparation
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session

@router.post("/session/{session_id}/upload", response_model=SessionOut)
async def upload_video(
    session_id: str,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db)
):
    session = db.query(Session).filter(
        Session.id == session_id, 
        Session.user_id == current_user.id
    ).first()
    
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found"
        )
        
    # Check file extension
    file_ext = os.path.splitext(file.filename)[1] or ".webm"
    video_filename = f"{session_id}{file_ext}"
    video_path = os.path.join(settings.UPLOAD_DIR, video_filename)
    
    # Save file locally
    try:
        with open(video_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
    except Exception as e:
        logger.error(f"Failed to save uploaded video: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save uploaded video: {str(e)}"
        )
        
    session.video_url = f"/uploads/{video_filename}"
    db.commit()

    # Call centralized AI analysis pipeline
    try:
        report_data = analyze_video_speech(video_path, session.topic, session.category)
    except Exception as e:
        logger.error(f"Centralized analysis failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Video analysis failed: {str(e)}"
        )

    # Check for VAD error cases
    if report_data.get("status") == "NO_SPEECH_DETECTED":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=report_data.get("feedback", "No speech detected (Speech duration under 2 seconds).")
        )

    # 1. Save Transcript Record
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
    
    # 2. Save Acoustic & Visual metrics records
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

    # 3. Save Communication DNA Record
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

    # 4. Save Report Entry (storing complete 10-section JSON in summary)
    report = Report(
        session_id=session.id,
        summary=report_data["report_data"]
    )
    db.add(report)
    
    db.commit()
    db.refresh(session)
    return session

@router.get("/session/{session_id}", response_model=SessionOut)
def get_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db)
):
    session = db.query(Session).filter(
        Session.id == session_id,
        Session.user_id == current_user.id
    ).first()
    
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found"
        )
    return session

@router.get("/history", response_model=List[JAMSessionHistoryItem])
def get_history(
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db)
):
    sessions = db.query(Session).filter(
        Session.user_id == current_user.id
    ).order_by(Session.created_at.desc()).all()
    
    history_items = []
    for s in sessions:
        score = 0
        if s.dna:
            # overall average score of DNA metrics
            score = int((s.dna.confidence + s.dna.fluency + s.dna.vocabulary + s.dna.storytelling + s.dna.leadership + s.dna.persuasion + s.dna.clarity) / 7)
            
        history_items.append({
            "id": s.id,
            "topic": s.topic,
            "category": s.category,
            "session_type": s.session_type,
            "created_at": s.created_at,
            "overall_score": score
        })
    return history_items

@router.get("/leaderboard", response_model=List[LeaderboardEntry])
def get_leaderboard(db: DBSession = Depends(get_db)):
    users = db.query(User).all()
    leaderboard = []
    
    for u in users:
        sessions = db.query(Session).filter(Session.user_id == u.id).all()
        scored_sessions = [s for s in sessions if s.dna]
        
        if not scored_sessions:
            continue
            
        total_score_sum = 0
        for s in scored_sessions:
            score = int((s.dna.confidence + s.dna.fluency + s.dna.vocabulary + s.dna.storytelling + s.dna.leadership + s.dna.persuasion + s.dna.clarity) / 7)
            total_score_sum += score
            
        user_average = round(total_score_sum / len(scored_sessions), 1)
        leaderboard.append({
            "name": u.name,
            "average_score": user_average,
            "sessions_count": len(scored_sessions)
        })
        
    leaderboard.sort(key=lambda x: x["average_score"], reverse=True)
    
    ranked_leaderboard = []
    for i, entry in enumerate(leaderboard):
        ranked_leaderboard.append({
            "rank": i + 1,
            "name": entry["name"],
            "average_score": entry["average_score"],
            "sessions_count": entry["sessions_count"]
        })
        
    return ranked_leaderboard[:10]

@router.get("/analytics", response_model=DashboardStats)
def get_analytics(
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db)
):
    sessions = db.query(Session).filter(
        Session.user_id == current_user.id
    ).order_by(Session.created_at.asc()).all()
    
    scored_sessions = [s for s in sessions if s.dna]
    
    if not scored_sessions:
        return {
            "total_sessions": 0,
            "avg_confidence": 0.0,
            "avg_fluency": 0.0,
            "avg_communication": 0.0,
            "streak": 0,
            "progress_data": []
        }
        
    # Averages
    avg_confidence = round(sum(s.dna.confidence for s in scored_sessions) / len(scored_sessions), 1)
    avg_fluency = round(sum(s.dna.fluency for s in scored_sessions) / len(scored_sessions), 1)
    avg_communication = round(sum(s.dna.clarity for s in scored_sessions) / len(scored_sessions), 1)
    
    # Streak Calculation
    dates = sorted(list(set(s.created_at.date() for s in sessions)))
    streak = 0
    today = datetime.utcnow().date()
    yesterday = today - timedelta(days=1)
    
    if today in dates or yesterday in dates:
        streak = 1
        current_date = dates[-1]
        for i in range(len(dates) - 2, -1, -1):
            if current_date - dates[i] == timedelta(days=1):
                streak += 1
                current_date = dates[i]
            else:
                break
    
    # Progress Timeline data
    progress_data = []
    daily_groups = {}
    for s in scored_sessions:
        date_str = s.created_at.strftime("%Y-%m-%d")
        if date_str not in daily_groups:
            daily_groups[date_str] = []
        daily_groups[date_str].append(s.dna)
        
    for date_str, dna_list in sorted(daily_groups.items()):
        progress_data.append({
            "date": date_str,
            "confidence": round(sum(d.confidence for d in dna_list) / len(dna_list), 1),
            "fluency": round(sum(d.fluency for d in dna_list) / len(dna_list), 1),
            "vocabulary": round(sum(d.vocabulary for d in dna_list) / len(dna_list), 1),
            "storytelling": round(sum(d.storytelling for d in dna_list) / len(dna_list), 1),
            "leadership": round(sum(d.leadership for d in dna_list) / len(dna_list), 1),
            "persuasion": round(sum(d.persuasion for d in dna_list) / len(dna_list), 1),
            "engagement": round(sum(d.engagement for d in dna_list) / len(dna_list), 1)
        })
        
    return {
        "total_sessions": len(scored_sessions),
        "avg_confidence": avg_confidence,
        "avg_fluency": avg_fluency,
        "avg_communication": avg_communication,
        "streak": streak,
        "progress_data": progress_data
    }
