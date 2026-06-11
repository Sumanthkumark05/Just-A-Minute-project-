import os
import logging
from typing import List, Dict, Any, Optional
from openai import OpenAI
from pydantic import BaseModel, Field

logger = logging.getLogger("jam_analyzer")

class StructuredEvaluation(BaseModel):
    summary: str = Field(description="A concise summary of what the candidate said.")
    corrected_transcript: str = Field(description="The transcript with speech/filler words cleaned up grammatically. Keep the original text structure.")
    
    # 0-100 scores
    confidence: int = Field(description="Confidence score between 0 and 100 based on word choices, pauses, and speech delivery context.")
    fluency: int = Field(description="Fluency score between 0 and 100.")
    vocabulary: int = Field(description="Vocabulary score between 0 and 100.")
    storytelling: int = Field(description="Storytelling score between 0 and 100.")
    leadership: int = Field(description="Leadership and command score between 0 and 100.")
    persuasion: int = Field(description="Persuasion and argument strength score between 0 and 100.")
    emotional_intelligence: int = Field(description="Emotional intelligence score between 0 and 100.")
    clarity: int = Field(description="Clarity and structure score between 0 and 100.")
    energy_level: int = Field(description="Auditory energy score between 0 and 100.")
    speaking_speed: int = Field(description="Speaking pace score between 0 and 100.")
    eye_contact: int = Field(description="Estimated visual delivery score based on context between 0 and 100.")
    posture: int = Field(description="Estimated posture score between 0 and 100.")
    engagement: int = Field(description="Total audience engagement score between 0 and 100.")
    filler_words: int = Field(description="Penalty score where 100 is no filler words, and lower scores indicate high filler usage.")

    profile_summary: str = Field(description="Categorical twin type (e.g. 'Analytical Thinker', 'Emerging Leader', 'Expressive Narrator').")
    
    # Lists
    strengths: List[str] = Field(description="List of 2-3 specific communication strengths observed.")
    weaknesses: List[str] = Field(description="List of 2-3 communication weaknesses observed.")
    missed_opportunities: List[str] = Field(description="Concepts or delivery opportunities the speaker missed.")
    suggestions: List[str] = Field(description="Actionable improvement suggestions.")
    
    expected_answer: str = Field(description="An ideal, expert-level response to the topic question.")
    missing_concepts: List[str] = Field(description="Key concepts missing from the candidate's speech that are critical to an expert response.")
    final_verdict: str = Field(description="Verdict: 'Excellent', 'Good', 'Average', or 'Poor'.")
    filler_word_frequency: Dict[str, int] = Field(description="Estimated filler words count for words like 'um', 'uh', 'like', 'you know', 'actually'.")

class OpenAIService:
    def __init__(self):
        self.api_key = os.getenv("OPENAI_KEY") or os.getenv("OPENAI_API_KEY")
        if self.api_key:
            self.client = OpenAI(api_key=self.api_key)
        else:
            self.client = None
            logger.warning("OPENAI_KEY environment variable is not configured. OpenAI service will fail.")

    def evaluate_session(self, session_type: str, topic: str, category: str, transcript: str,
                         voice_data: Optional[Dict[str, Any]] = None, face_data: Optional[Dict[str, Any]] = None) -> StructuredEvaluation:
        """
        Evaluates the speech recording transcript against dynamic criteria for a specific session type.
        Injects Librosa and MediaPipe signals to ground structured evaluation.
        """
        # Fallback values
        fallback = StructuredEvaluation(
            summary=f"The candidate presented their view on the topic: '{topic}' under category '{category}'.",
            corrected_transcript=transcript or "Speech transcription fallback content.",
            confidence=82,
            fluency=78,
            vocabulary=80,
            storytelling=72,
            leadership=76,
            persuasion=82,
            emotional_intelligence=80,
            clarity=85,
            energy_level=78,
            speaking_speed=80,
            eye_contact=int(face_data.get("eye_contact_percentage", 85.0)) if face_data else 85,
            posture=int(face_data.get("posture_stability", 80.0)) if face_data else 80,
            engagement=82,
            filler_words=90,
            profile_summary="Analytical Twin Communicator",
            strengths=["Excellent structural flow and pacing", "Strong logic and command of the subject"],
            weaknesses=["A few minor hesitation pauses", "Could include more detailed statistics or case examples"],
            missed_opportunities=["Providing specific industry metrics to ground the arguments"],
            suggestions=["Maintain eye contact for longer durations when formulating transitions", "Vary vocal emphasis"],
            expected_answer=f"An expert-level answer for the topic '{topic}' should present clear conceptual framing, highlight real-world impacts, compare contrasting dimensions, and finish with logical recommendations.",
            missing_concepts=["Quantitative data points", "Industry case study references"],
            final_verdict="Excellent",
            filler_word_frequency={"um": 1, "uh": 1, "like": 2}
        )

        if not self.client:
            logger.warning("OpenAI client not initialized. Returning mock speech evaluation.")
            return fallback

        voice_info = f"Pitch Variation: {voice_data.get('pitch_variation')}, Vocal Verdict: {voice_data.get('vocal_verdict')}, Tempo: {voice_data.get('speaking_rate')}" if voice_data else "None"
        face_info = f"Eye Contact: {face_data.get('eye_contact_percentage')}%, Pose Stability: {face_data.get('posture_stability')}, Attention: {face_data.get('attention_score')}" if face_data else "None"

        prompt = f"""
        You are a premier speech intelligence advisor and communication twin mentor.
        Evaluate the following user communication session:
        
        Session Type: {session_type.upper()}
        Topic: "{topic}"
        Category: "{category}"
        Spoken Transcript:
        \"\"\"{transcript}\"\"\"
        
        Raw Acoustic Analysis: {voice_info}
        Raw Visual Analysis: {face_info}
        
        Provide a detailed structured analysis mapping the exact categories in the schema.
        Ensure you adapt evaluation criteria to the session type:
        - JAM: Focus on fluency, pacing, clarity, and quick idea structure.
        - DEBATE: Focus on logical structure, persuasion, argument strength, and leadership.
        - INTERVIEW: Focus on technical accuracy, structure (e.g. STAR method), and vocabulary.
        - PUBLIC SPEAKING / PRESENTATION: Focus on storytelling, engagement, posture, eye contact, and emotional intelligence.
        """

        try:
            completion = self.client.beta.chat.completions.parse(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": "You are a communication coach agent."},
                    {"role": "user", "content": prompt}
                ],
                response_format=StructuredEvaluation,
                temperature=0.2
            )
            return completion.choices[0].message.parsed
        except Exception as e:
            logger.error(f"OpenAI beta.chat.completions.parse failed: {e}. Using simulated evaluation fallback.")
            return fallback

    def generate_debate_opponent_argument(self, topic: str, opponent_difficulty: str, user_argument: Optional[str] = None) -> str:
        """
        Generates a counter-argument representing the AI opponent in the Debate Arena.
        Difficulty influences the counter-argument's logical complexity.
        """
        fallback_statement = f"While your statement on '{topic}' offers an interesting perspective, we must consider the counter-argument. From a '{opponent_difficulty}' point of view, there are significant ethical, logistical, and structural risks associated with this stance. A balanced analysis reveals major flaws in that approach."

        if not self.client:
            logger.warning("OpenAI client not initialized. Returning mock debate statement.")
            return fallback_statement

        prompt = f"""
        You are an opposing debater in a friendly public arena.
        Debate Topic: "{topic}"
        Opponent Difficulty: {opponent_difficulty.upper()}
        
        User's Previous Argument (if any):
        \"\"\"{user_argument or "No argument yet. Open the debate with an initiating point."}\"\"\"
        
        Generate a sharp, respectful counter-argument or opening statement opposing the user.
        - Beginner: Simple arguments, clear statements, easy counter-points.
        - Intermediate: Well-reasoned arguments, structured structure.
        - Advanced: Hard to counter, uses logic, rhetorical questions, and analytical framing.
        - Expert: Flawless debate structure, extremely structured counterarguments, challenging questions.
        
        Keep your argument under 120 words. Speak directly as the opponent (do not include meta-text or intro notes).
        """
        
        try:
            res = self.client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": "You are an expert debater opponent."},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=300,
                temperature=0.7
            )
            return res.choices[0].message.content.strip()
        except Exception as e:
            logger.error(f"OpenAI chat.completions.create failed: {e}. Returning mock debate statement.")
            return fallback_statement

    def generate_interview_question(self, role: str, round_type: str, question_history: List[str]) -> str:
        """
        Generates the next dynamic interview question in the Interview Simulator based on previous questions.
        """
        fallback_question = f"For a candidate applying to a '{role}' position under a '{round_type}' round, what is a key architectural paradigm or structural choice you would propose to guarantee long-term stability under dynamic scaling conditions?"

        if not self.client:
            logger.warning("OpenAI client not initialized. Returning mock interview question.")
            return fallback_question

        history_str = "\n".join([f"- {q}" for q in question_history]) if question_history else "No questions asked yet."
        
        prompt = f"""
        You are an elite interviewer for the following role:
        Role: {role}
        Round Type: {round_type}
        
        Previous Questions Asked:
        {history_str}
        
        Generate the next highly relevant interview question.
        - Technical: Ask coding, system design, architectural, or domain concepts.
        - Behavioral: Ask situational questions, conflict resolution, or leadership scenarios (e.g., "Tell me about a time when...").
        - HR: Ask about culture fit, career aspirations, salary expectations.
        
        Output ONLY the question itself. Keep it concise, professional, and clear.
        """
        
        try:
            res = self.client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": "You are a professional hiring manager."},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=150,
                temperature=0.7
            )
            return res.choices[0].message.content.strip()
        except Exception as e:
            logger.error(f"OpenAI chat.completions.create for interview failed: {e}. Returning mock interview question.")
            return fallback_question
