import logging
import json
from typing import Dict, Any, List
from pydantic import BaseModel, Field
from app.config import settings

logger = logging.getLogger("jam_analyzer")

# Schema for structured Gemini evaluation output
class GeminiEvaluationOutput(BaseModel):
    summary: str = Field(description="A concise summary of the speech content.")
    key_points: List[str] = Field(description="List of 2-4 key arguments or points made by the speaker.")
    grammar_score: int = Field(description="Score between 0 and 100 assessing grammatical correctness and vocabulary usage.")
    communication_score: int = Field(description="Score between 0 and 100 assessing clarity, persuasion, structure, and pacing.")
    content_quality_score: int = Field(description="Score between 0 and 100 assessing the depth, structure, and quality of content.")
    topic_relevance_score: int = Field(description="Score between 0 and 100 assessing how closely the speech stuck to the specified topic.")
    mistakes: List[str] = Field(description="List of specific grammatical errors, mispronunciations, or delivery hiccups detected in the transcript.")
    strengths: List[str] = Field(description="List of 2-3 specific communication strengths observed.")
    improvements: List[str] = Field(description="List of 2-3 actionable areas for improvement based on the delivery and transcript.")
    exercises: List[str] = Field(description="List of 2-3 targeted coaching exercises mapped directly to the areas of improvement.")

def evaluate_speech_with_gemini(topic: str, category: str, transcript: str,
                                 speech_metrics: Dict[str, Any], vision_metrics: Dict[str, Any]) -> Dict[str, Any]:
    """
    Calls the Gemini API to analyze the speech transcript, combining it with local CV and audio metrics.
    Conforms the output to the structured GeminiEvaluationOutput schema.
    """
    if not settings.GEMINI_API_KEY:
        logger.warning("GEMINI_API_KEY is not set. Skipping Gemini evaluation.")
        raise ValueError("GEMINI_API_KEY not found")

    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=settings.GEMINI_API_KEY)
        
        # Prepare structured metrics description for Gemini
        metrics_payload = {
            "duration_seconds": speech_metrics.get("duration", 60),
            "words_per_minute": speech_metrics.get("words_per_minute", 0),
            "filler_words_count": speech_metrics.get("filler_words", {}),
            "pause_count": speech_metrics.get("pause_count", 0),
            "pause_duration_seconds": speech_metrics.get("pause_duration", 0.0),
            "local_vocabulary_score": speech_metrics.get("vocabulary_score", 0),
            "local_speaking_pace_score": speech_metrics.get("speaking_pace_score", 0),
            "eye_contact_percentage": vision_metrics.get("eye_contact_score", 0),
            "posture_stability_score": vision_metrics.get("posture_score", 0),
            "fidgeting_index": vision_metrics.get("fidgeting_index", 0.0),
            "local_confidence_score": vision_metrics.get("confidence_score", 0),
            "local_engagement_score": vision_metrics.get("engagement_score", 0),
            "dominant_emotion": vision_metrics.get("dominant_emotion", "Neutral"),
            "emotion_stability_score": vision_metrics.get("emotion_stability_score", 0),
            "emotion_distribution": vision_metrics.get("emotion_distribution", {})
        }

        prompt = f"""
        You are an elite public speaking coach and verbal communication assessor.
        Analyze this 1-minute speech transcript and its objective delivery metrics.
        
        Topic: "{topic}"
        Category: "{category}"
        
        Transcript:
        \"\"\"{transcript}\"\"\"

        Objective Delivery Metrics (Calculated via Local Audio & Video Tracking):
        {json.dumps(metrics_payload, indent=2)}

        Tasks:
        1. Evaluate topic relevance: Did the speaker actually address the topic "{topic}" or did they deviate/ramble?
        2. Evaluate content quality, structure, flow, and persuasiveness.
        3. Evaluate grammar: Identify any syntax, tense, or phrasing errors in the transcript.
        4. Synthesize local visual/audio metrics (WPM, filler count, pauses, eye contact, head pose) into deep, personalized feedback.
        5. Provide constructive coaching suggestions, strengths, improvements, and specific speaking drills.

        Your response MUST be valid JSON conforming exactly to the requested output schema.
        """

        logger.info("Calling Gemini 2.5 Flash for deep speech evaluation...")
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=[prompt],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=GeminiEvaluationOutput,
                temperature=0.2
            )
        )

        result = json.loads(response.text)
        logger.info("Successfully received AI evaluation report from Gemini.")
        return result

    except Exception as e:
        logger.error(f"Error calling Gemini AI evaluator: {e}")
        raise e
