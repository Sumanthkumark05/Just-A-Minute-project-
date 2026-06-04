import uuid
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Text, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base

def generate_uuid():
    return str(uuid.uuid4())

class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    name = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    sessions = relationship("JAMSession", back_populates="user", cascade="all, delete-orphan")

class JAMSession(Base):
    __tablename__ = "jam_sessions"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    topic = Column(String(255), nullable=False)
    category = Column(String(100), nullable=False)
    video_url = Column(String(500), nullable=True) # local path or cloud URL
    transcript = Column(Text, nullable=True)
    summary = Column(Text, nullable=True)
    key_points = Column(JSON, nullable=True) # list of strings
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="sessions")
    metrics = relationship("JAMMetrics", back_populates="session", uselist=False, cascade="all, delete-orphan")

class JAMMetrics(Base):
    __tablename__ = "jam_metrics"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    session_id = Column(String(36), ForeignKey("jam_sessions.id", ondelete="CASCADE"), unique=True, nullable=False)
    fluency_score = Column(Integer, default=0)
    grammar_score = Column(Integer, default=0)
    pronunciation_score = Column(Integer, default=0)
    confidence_score = Column(Integer, default=0)
    communication_score = Column(Integer, default=0)
    words_per_minute = Column(Integer, default=0)
    
    # New Refactored Metrics
    vocabulary_score = Column(Integer, default=0)
    speaking_pace_score = Column(Integer, default=0)
    eye_contact_score = Column(Integer, default=0)
    posture_score = Column(Integer, default=0)
    engagement_score = Column(Integer, default=0)
    content_quality_score = Column(Integer, default=0)
    topic_relevance_score = Column(Integer, default=0)
    dominant_emotion = Column(String(100), nullable=True)
    emotion_stability_score = Column(Integer, default=0)
    
    # JSON stores
    filler_words = Column(JSON, default=dict) # e.g. {"um": 5, "uh": 2}
    emotion_distribution = Column(JSON, default=dict) # e.g. {"Confident": 70, "Nervous": 15}
    mistakes = Column(JSON, default=list) # e.g. ["long pause at 15s", "poor posture"]
    strengths = Column(JSON, default=list) # e.g. ["fluent speaking", "good grammar"]
    improvements = Column(JSON, default=list) # e.g. ["reduce filler words"]
    exercises = Column(JSON, default=list) # e.g. ["practice mirror speaking"]

    session = relationship("JAMSession", back_populates="metrics")
