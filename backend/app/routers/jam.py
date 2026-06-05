import os
import random
from typing import List, Optional
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User, JAMSession, JAMMetrics
from app.schemas import (
    TopicRequest, TopicResponse, JAMSessionOut, 
    JAMSessionHistoryItem, LeaderboardEntry, ProgressPoint, DashboardStats
)
from app.auth import get_current_user
from app.config import settings
from app.services.ai_analyzer import analyze_video_speech

router = APIRouter(prefix="/jam", tags=["jam"])

# Curated topic repository by category
TOPICS = {
    "Technology": [
        "Is AI replacing jobs?",
        "Social media advantages and disadvantages",
        "Electric vehicles and the future of transport",
        "The impact of 5G on communication",
        "Cybersecurity in the modern digital age",
        "The role of privacy in the era of big data"
    ],
    "Education": [
        "Future of education: Online vs Offline",
        "Importance of learning soft skills",
        "Is a college degree still necessary in 2026?",
        "The role of emotional intelligence in schools",
        "How to make learning fun for kids",
        "The impact of gamification in education"
    ],
    "Sports": [
        "Importance of teamwork in sports and life",
        "Should esports be included in the Olympics?",
        "Role of sports in building personal character",
        "Mental health awareness in professional sports",
        "Gender equality and pay gap in athletics",
        "How sports bring diverse communities together"
    ],
    "Business": [
        "Work-life balance in the corporate world",
        "Gig economy: boon or bane for modern workers?",
        "Entrepreneurship vs a secure corporate job",
        "Importance of customer-first design and satisfaction",
        "Green business practices and corporate responsibility",
        "Remote work: productivity booster or culture killer?"
    ],
    "Current Affairs": [
        "Climate change and the transition to renewable energy",
        "Impact of globalization on local cultures",
        "Universal Basic Income: pros and cons",
        "Cryptocurrency: future of money or speculative bubble?",
        "The critical role of independent media in democracy",
        "Healthcare accessibility as a human right"
    ],
    "Personal Development": [
        "The life-changing power of minor habits",
        "Overcoming the fear of failure to achieve growth",
        "Importance of active listening in communication",
        "Healthy ways to manage stress and anxiety",
        "Time management techniques for high performers",
        "The role of gratitude in mental well-being"
    ]
}

@router.get("/topic", response_model=TopicResponse)
def get_topic(category: Optional[str] = None):
    # Select category
    selected_cat = category
    if not selected_cat or selected_cat not in TOPICS:
        selected_cat = random.choice(list(TOPICS.keys()))
    
    # Select random topic from category
    selected_topic = random.choice(TOPICS[selected_cat])
    
    return {"topic": selected_topic, "category": selected_cat}

@router.post("/session", response_model=JAMSessionOut)
def create_session(
    topic_data: TopicResponse, 
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    session = JAMSession(
        user_id=current_user.id,
        topic=topic_data.topic,
        category=topic_data.category
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session

@router.post("/session/{session_id}/upload", response_model=JAMSessionOut)
async def upload_video(
    session_id: str,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    session = db.query(JAMSession).filter(
        JAMSession.id == session_id, 
        JAMSession.user_id == current_user.id
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
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save uploaded video: {str(e)}"
        )
        
    session.video_url = f"/uploads/{video_filename}"
    db.commit()
    
    # Call Gemini Multimodal analysis (or mock fallback)
    analysis = analyze_video_speech(video_path, session.topic, session.category)
    
    # Save transcript and summary on session
    session.transcript = analysis.get("transcript", "")
    session.summary = analysis.get("summary", "")
    session.key_points = analysis.get("key_points", [])
    
    # Create or update metrics
    metrics = session.metrics
    if not metrics:
        metrics = JAMMetrics(session_id=session.id)
        db.add(metrics)
        
    metrics.accuracy_score = analysis.get("accuracy_score", 0)
    metrics.transcript_confidence = analysis.get("transcript_confidence", 0)
    metrics.semantic_similarity_score = analysis.get("semantic_similarity_score", 0)
    metrics.original_transcript = analysis.get("original_transcript", "")
    metrics.corrected_transcript = analysis.get("corrected_transcript", "")
        
    metrics.fluency_score = analysis.get("fluency_score", 0)
    metrics.grammar_score = analysis.get("grammar_score", 0)
    metrics.pronunciation_score = analysis.get("pronunciation_score", 0)
    metrics.confidence_score = analysis.get("confidence_score", 0)
    metrics.communication_score = analysis.get("communication_score", 0)
    metrics.words_per_minute = analysis.get("words_per_minute", 0)
    
    # New Refactored Metrics
    metrics.vocabulary_score = analysis.get("vocabulary_score", 0)
    metrics.speaking_pace_score = analysis.get("speaking_pace_score", 0)
    metrics.eye_contact_score = analysis.get("eye_contact_score", 0)
    metrics.posture_score = analysis.get("posture_score", 0)
    metrics.engagement_score = analysis.get("engagement_score", 0)
    metrics.content_quality_score = analysis.get("content_quality_score", 0)
    metrics.topic_relevance_score = analysis.get("topic_relevance_score", 0)
    metrics.dominant_emotion = analysis.get("dominant_emotion", "Neutral")
    metrics.emotion_stability_score = analysis.get("emotion_stability_score", 0)
    
    metrics.filler_words = analysis.get("filler_words", {})
    metrics.emotion_distribution = analysis.get("emotion_distribution", {})
    metrics.mistakes = analysis.get("mistakes", [])
    metrics.strengths = analysis.get("strengths", [])
    metrics.improvements = analysis.get("improvements", [])
    metrics.exercises = analysis.get("exercises", [])
    
    db.commit()
    db.refresh(session)
    return session

@router.get("/session/{session_id}", response_model=JAMSessionOut)
def get_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    session = db.query(JAMSession).filter(
        JAMSession.id == session_id,
        JAMSession.user_id == current_user.id
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
    db: Session = Depends(get_db)
):
    sessions = db.query(JAMSession).filter(
        JAMSession.user_id == current_user.id
    ).order_by(JAMSession.created_at.desc()).all()
    
    history_items = []
    for s in sessions:
        # If metrics exist, retrieve accuracy_score directly
        overall_score = s.metrics.accuracy_score if s.metrics else 0
        history_items.append({
            "id": s.id,
            "topic": s.topic,
            "category": s.category,
            "created_at": s.created_at,
            "overall_score": overall_score
        })
    return history_items

@router.get("/leaderboard", response_model=List[LeaderboardEntry])
def get_leaderboard(db: Session = Depends(get_db)):
    # Calculate leaderboard by finding overall average scores for each user
    # Select all users who have completed at least one session with metrics
    users = db.query(User).all()
    leaderboard = []
    
    for u in users:
        sessions = db.query(JAMSession).filter(JAMSession.user_id == u.id).all()
        scored_sessions = [s for s in sessions if s.metrics]
        
        if not scored_sessions:
            continue
            
        total_score_sum = 0
        for s in scored_sessions:
            total_score_sum += s.metrics.accuracy_score
            
        user_average = round(total_score_sum / len(scored_sessions), 1)
        leaderboard.append({
            "name": u.name,
            "average_score": user_average,
            "sessions_count": len(scored_sessions)
        })
        
    # Sort leaderboard by average score descending
    leaderboard.sort(key=lambda x: x["average_score"], reverse=True)
    
    # Add ranks
    ranked_leaderboard = []
    for i, entry in enumerate(leaderboard):
        ranked_leaderboard.append({
            "rank": i + 1,
            "name": entry["name"],
            "average_score": entry["average_score"],
            "sessions_count": entry["sessions_count"]
        })
        
    return ranked_leaderboard[:10] # Top 10 users

@router.get("/analytics", response_model=DashboardStats)
def get_analytics(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    sessions = db.query(JAMSession).filter(
        JAMSession.user_id == current_user.id
    ).order_by(JAMSession.created_at.asc()).all()
    
    scored_sessions = [s for s in sessions if s.metrics]
    
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
    avg_confidence = round(sum(s.metrics.confidence_score for s in scored_sessions) / len(scored_sessions), 1)
    avg_fluency = round(sum(s.metrics.fluency_score for s in scored_sessions) / len(scored_sessions), 1)
    avg_communication = round(sum(s.metrics.communication_score for s in scored_sessions) / len(scored_sessions), 1)
    
    # Streak Calculation
    dates = sorted(list(set(s.created_at.date() for s in sessions)))
    streak = 0
    today = datetime.utcnow().date()
    yesterday = today - timedelta(days=1)
    
    # Check if user spoke today or yesterday to continue streak
    if today in dates or yesterday in dates:
        streak = 1
        current_date = dates[-1]
        for i in range(len(dates) - 2, -1, -1):
            if current_date - dates[i] == timedelta(days=1):
                streak += 1
                current_date = dates[i]
            else:
                break
    
    # Progress line graph data (group sessions by date)
    progress_data = []
    # Group by date to average daily performances
    daily_groups = {}
    for s in scored_sessions:
        date_str = s.created_at.strftime("%Y-%m-%d")
        if date_str not in daily_groups:
            daily_groups[date_str] = []
        daily_groups[date_str].append(s.metrics)
        
    for date_str, metrics_list in sorted(daily_groups.items()):
        progress_data.append({
            "date": date_str,
            "fluency": round(sum(m.fluency_score for m in metrics_list) / len(metrics_list), 1),
            "grammar": round(sum(m.grammar_score for m in metrics_list) / len(metrics_list), 1),
            "communication": round(sum(m.communication_score for m in metrics_list) / len(metrics_list), 1),
            "pronunciation": round(sum(m.pronunciation_score for m in metrics_list) / len(metrics_list), 1),
            "confidence": round(sum(m.confidence_score for m in metrics_list) / len(metrics_list), 1)
        })
        
    return {
        "total_sessions": len(scored_sessions),
        "avg_confidence": avg_confidence,
        "avg_fluency": avg_fluency,
        "avg_communication": avg_communication,
        "streak": streak,
        "progress_data": progress_data
    }
