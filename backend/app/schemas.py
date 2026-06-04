from pydantic import BaseModel, EmailStr, Field
from datetime import datetime
from typing import Optional, List, Dict

# User Auth Schemas
class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6)
    name: str = Field(..., min_length=1)

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserOut(BaseModel):
    id: str
    email: EmailStr
    name: str
    created_at: datetime

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    user_id: Optional[str] = None

# JAM Schemas
class TopicRequest(BaseModel):
    category: Optional[str] = None

class TopicResponse(BaseModel):
    topic: str
    category: str

class JAMMetricsBase(BaseModel):
    fluency_score: int
    grammar_score: int
    pronunciation_score: int
    confidence_score: int
    communication_score: int
    words_per_minute: int
    vocabulary_score: int = 0
    speaking_pace_score: int = 0
    eye_contact_score: int = 0
    posture_score: int = 0
    engagement_score: int = 0
    content_quality_score: int = 0
    topic_relevance_score: int = 0
    dominant_emotion: Optional[str] = None
    emotion_stability_score: int = 0
    filler_words: Dict[str, int]
    emotion_distribution: Dict[str, float]
    mistakes: List[str]
    strengths: List[str]
    improvements: List[str]
    exercises: List[str]

class JAMMetricsOut(JAMMetricsBase):
    id: str
    session_id: str

    class Config:
        from_attributes = True

class JAMSessionOut(BaseModel):
    id: str
    user_id: str
    topic: str
    category: str
    video_url: Optional[str] = None
    transcript: Optional[str] = None
    summary: Optional[str] = None
    key_points: Optional[List[str]] = None
    created_at: datetime
    metrics: Optional[JAMMetricsOut] = None

    class Config:
        from_attributes = True

class JAMSessionHistoryItem(BaseModel):
    id: str
    topic: str
    category: str
    created_at: datetime
    overall_score: int
    duration: int = 60

class LeaderboardEntry(BaseModel):
    rank: int
    name: str
    average_score: float
    sessions_count: int

class ProgressPoint(BaseModel):
    date: str
    fluency: float
    grammar: float
    communication: float
    pronunciation: float
    confidence: float

class DashboardStats(BaseModel):
    total_sessions: int
    avg_confidence: float
    avg_fluency: float
    avg_communication: float
    streak: int
    progress_data: List[ProgressPoint]
