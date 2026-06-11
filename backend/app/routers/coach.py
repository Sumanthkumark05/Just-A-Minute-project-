import logging
from typing import List
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session as DBSession

from app.database import get_db
from app.models import User, CommunicationDNA, CoachRecommendation, ChallengeHistory, GrowthMetrics
from app.schemas import CommunicationDNASchema, ChallengeOut
from app.auth import get_current_user

logger = logging.getLogger("jam_analyzer")

router = APIRouter(prefix="/coach", tags=["coach"])

@router.get("/dna", response_model=CommunicationDNASchema)
def get_current_dna(
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db)
):
    """
    Retrieves the user's latest aggregated Communication DNA profile.
    """
    dna = db.query(CommunicationDNA).filter(
        CommunicationDNA.user_id == current_user.id
    ).order_by(CommunicationDNA.created_at.desc()).first()
    
    if not dna:
        # Return base placeholder DNA
        return {
            "confidence": 50,
            "fluency": 50,
            "vocabulary": 50,
            "storytelling": 50,
            "leadership": 50,
            "persuasion": 50,
            "emotional_intelligence": 50,
            "clarity": 50,
            "energy_level": 50,
            "speaking_speed": 50,
            "eye_contact": 50,
            "posture": 50,
            "engagement": 50,
            "filler_words": 50,
            "profile_summary": "Unclassified Twin",
            "filler_word_frequency": {}
        }
    return dna

@router.get("/recommendations")
def get_recommendations(
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db)
):
    """
    Returns recent AI Coach actionable suggestions.
    """
    recs = db.query(CoachRecommendation).filter(
        CoachRecommendation.user_id == current_user.id
    ).order_by(CoachRecommendation.created_at.desc()).limit(10).all()
    
    return [
        {
            "id": r.id,
            "weakness": r.weakness_identified,
            "suggestion": r.suggestion,
            "challenge_id": r.recommended_challenge_id,
            "created_at": r.created_at
        } for r in recs
    ]

@router.get("/challenges", response_model=List[ChallengeOut])
def get_challenges(
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db)
):
    """
    Lists the history of personalized coaching challenges.
    """
    challenges = db.query(ChallengeHistory).filter(
        ChallengeHistory.user_id == current_user.id
    ).order_by(ChallengeHistory.created_at.desc()).all()
    return challenges

@router.post("/challenge/{challenge_id}/attempt")
def attempt_challenge(
    challenge_id: str,
    score: int,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db)
):
    """
    Logs an attempt for a specific verbal challenge and updates scores.
    """
    challenge = db.query(ChallengeHistory).filter(
        ChallengeHistory.id == challenge_id,
        ChallengeHistory.user_id == current_user.id
    ).first()
    
    if not challenge:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Challenge not found."
        )
        
    challenge.attempts += 1
    if score > challenge.best_score:
        challenge.best_score = score
        
    if score >= 75: # completion threshold
        challenge.is_completed = True
        challenge.completed_at = datetime.utcnow()
        
    db.commit()
    db.refresh(challenge)
    return challenge
