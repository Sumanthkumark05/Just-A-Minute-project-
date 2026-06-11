import logging
import json
import requests
from typing import Dict, Any, List
from pydantic import BaseModel, Field
from app.config import settings

logger = logging.getLogger("jam_analyzer")

class GeminiReportOutput(BaseModel):
    executive_summary: str = Field(description="Max 5 concise bullet points covering key strengths, major weaknesses, and overall assessment.")
    
    # Speech analysis reasons/suggestions
    speech_rate_reason: str = Field(description="Reason for speaking rate score.")
    speech_rate_suggestion: str = Field(description="Actionable suggestion to improve speaking rate.")
    
    speech_clarity_reason: str = Field(description="Reason for clarity score.")
    speech_clarity_suggestion: str = Field(description="Actionable suggestion to improve clarity.")
    
    speech_pronunciation_reason: str = Field(description="Reason for pronunciation score.")
    speech_pronunciation_suggestion: str = Field(description="Actionable suggestion to improve pronunciation.")
    
    speech_fluency_reason: str = Field(description="Reason for fluency score.")
    speech_fluency_suggestion: str = Field(description="Actionable suggestion to improve fluency.")
    
    speech_fillers_reason: str = Field(description="Reason for fillers score.")
    speech_fillers_suggestion: str = Field(description="Actionable suggestion to reduce fillers.")
    
    speech_confidence_reason: str = Field(description="Reason for speech confidence score.")
    speech_confidence_suggestion: str = Field(description="Actionable suggestion to improve confidence.")

    # Body language evidence/suggestions
    body_eye_contact_evidence: str = Field(description="Evidence observed for eye contact score.")
    body_eye_contact_suggestion: str = Field(description="Actionable suggestion to improve eye contact.")
    
    body_expressions_evidence: str = Field(description="Evidence observed for facial expressions score.")
    body_expressions_suggestion: str = Field(description="Actionable suggestion to improve facial expressions.")
    
    body_posture_evidence: str = Field(description="Evidence observed for posture score.")
    body_posture_suggestion: str = Field(description="Actionable suggestion to improve posture.")
    
    body_gestures_evidence: str = Field(description="Evidence observed for gestures score.")
    body_gestures_suggestion: str = Field(description="Actionable suggestion to improve hand gestures.")
    
    body_head_movement_evidence: str = Field(description="Evidence observed for head movement score.")
    body_head_movement_suggestion: str = Field(description="Actionable suggestion to improve head stability.")

    # Effectiveness reasons/recommendations
    effectiveness_confidence_reason: str = Field(description="Reason for confidence score.")
    effectiveness_confidence_recommendation: str = Field(description="Actionable recommendation for confidence.")
    
    effectiveness_professionalism_reason: str = Field(description="Reason for professionalism score.")
    effectiveness_professionalism_recommendation: str = Field(description="Actionable recommendation for professionalism.")
    
    effectiveness_engagement_reason: str = Field(description="Reason for engagement score.")
    effectiveness_engagement_recommendation: str = Field(description="Actionable recommendation for engagement.")
    
    effectiveness_persuasiveness_reason: str = Field(description="Reason for persuasiveness score.")
    effectiveness_persuasiveness_recommendation: str = Field(description="Actionable recommendation for persuasiveness.")
    
    effectiveness_leadership_reason: str = Field(description="Reason for leadership presence score.")
    effectiveness_leadership_recommendation: str = Field(description="Actionable recommendation for leadership presence.")

    # Content textual outputs
    content_grammar_quality: str = Field(description="Grammatical analysis and quality assessment description.")
    content_vocabulary_richness: str = Field(description="Vocabulary richness and wording assessment description.")
    
    # Lists
    detailed_strengths: List[str] = Field(description="Top 5 evidence-based communication strengths observed.")
    areas_for_improvement: List[str] = Field(description="Top 5 evidence-based improvement areas.")
    
    # Action Plans
    action_immediate: List[str] = Field(description="List of 2-3 immediate action points.")
    action_short_term: List[str] = Field(description="List of 2-3 short-term action points.")
    action_long_term: List[str] = Field(description="List of 2-3 long-term action points.")
    
    expected_answer: str = Field(description="An ideal, comprehensive, expert-level response to the topic question.")
    corrected_transcript: str = Field(description="The transcript cleaned up grammatically without altering the spoken facts.")
    summary: str = Field(description="Concise summary of candidate spoken content.")
    missing_concepts: List[str] = Field(description="List of key technical concepts/definitions missing from candidate response.")

def evaluate_speech_with_groq(prompt: str) -> Dict[str, Any]:
    """
    Calls the Groq API to analyze the speech transcript when Gemini is rate-limited.
    """
    if not settings.GROQ_API_KEY:
        raise ValueError("GROQ_API_KEY is not configured.")

    headers = {
        "Authorization": f"Bearer {settings.GROQ_API_KEY}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "model": "llama-3.3-70b-versatile",
        "messages": [
            {"role": "system", "content": "You are an elite communication twin mentor. Return your response as a valid JSON object matching the requested fields."},
            {"role": "user", "content": prompt + "\nOutput your response in clean JSON format."}
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.1
    }
    
    logger.info("Calling Groq API for fallback speech evaluation...")
    res = requests.post(
        "https://api.groq.com/openai/v1/chat/completions",
        headers=headers,
        json=payload,
        timeout=25
    )
    
    if res.status_code != 200:
        raise RuntimeError(f"Groq API returned status code {res.status_code}: {res.text}")
        
    res_json = res.json()
    raw_response = res_json["choices"][0]["message"]["content"]
    
    from app.services.topic_generator import extract_and_parse_json
    parsed_data = extract_and_parse_json(raw_response)
    return parsed_data

def evaluate_speech_with_gemini(topic: str, category: str, transcript: str,
                                 scores: Dict[str, Any]) -> Dict[str, Any]:
    """
    Calls Gemini API to generate the professional qualitative report sections,
    strictly aligned with the pre-calculated formulaic scores.
    """
    prompt = f"""
    You are an elite communication twin mentor and technical public speaking coach.
    Analyze the candidate's speech and generate the qualitative elements of a professional 10-section analysis report.
    
    CRITICAL PROJECT RULES:
    1. PRIORITIZE ACCURACY OVER CREATIVITY. Produce highly objective, repeatable, and deterministic analysis.
    2. Zero Tolerance for Hallucinations. Do not invent details or assume candidates said things they did not say.
    3. Ground all statements strictly in the Spoken Transcript and Pre-calculated Scores provided.
    4. Provide concrete, observable evidence for every suggestion, reason, and recommendation.
    
    Topic: "{topic}"
    Category: "{category}"
    Spoken Transcript:
    \"\"\"{transcript}\"\"\"

    CRITICAL INSTRUCTION:
    Your qualitative feedback (reasons, evidence, suggestions) MUST align with the following pre-calculated formulaic scores:
    
    --- Pre-calculated Scores (0-100 scale) ---
    Overall Score: {scores['overall_score']} ({scores['rating']})
    
    Speech Analysis:
    - Speaking Rate: {scores['speech_analysis']['speaking_rate']['score']} (WPM: {scores['speech_analysis']['speaking_rate']['wpm']})
    - Clarity: {scores['speech_analysis']['clarity']['score']}
    - Pronunciation: {scores['speech_analysis']['pronunciation']['score']}
    - Fluency: {scores['speech_analysis']['fluency']['score']} (Pauses: {scores['speech_analysis']['fluency']['pause_count']})
    - Fillers: {scores['speech_analysis']['fillers']['score']} (Filler Words: {scores['speech_analysis']['fillers']['filler_count']})
    - Confidence: {scores['speech_analysis']['confidence']['score']}
    
    Body Language Analysis:
    - Eye Contact: {scores['body_language_analysis']['eye_contact']['score']}
    - Facial Expressions: {scores['body_language_analysis']['facial_expressions']['score']}
    - Posture: {scores['body_language_analysis']['posture']['score']}
    - Gestures: {scores['body_language_analysis']['gestures']['score']}
    - Head Movement: {scores['body_language_analysis']['head_movement']['score']}
    
    Communication Effectiveness:
    - Confidence: {scores['communication_effectiveness']['confidence']['score']}
    - Professionalism: {scores['communication_effectiveness']['professionalism']['score']}
    - Engagement: {scores['communication_effectiveness']['engagement']['score']}
    - Persuasiveness: {scores['communication_effectiveness']['persuasiveness']['score']}
    - Leadership Presence: {scores['communication_effectiveness']['leadership_presence']['score']}

    Content Analysis:
    - Grammar Quality: {scores['content_analysis']['grammar_quality']}
    - Vocabulary Richness: {scores['content_analysis']['vocabulary_richness']}
    - Top Filler Words: {json.dumps(scores['content_analysis']['top_filler_words'])}
    
    Please provide descriptions (Reasons, Evidence, Suggestions, Recommendations, Detailed lists, and Action Plans) that match these scores exactly.
    Make your feedback constructive, evidence-based, and highly actionable.
    """

    if settings.GEMINI_API_KEY:
        try:
            from google import genai
            from google.genai import types

            client = genai.Client(api_key=settings.GEMINI_API_KEY)
            
            import time
            max_retries = 3
            response = None
            last_err = None
            for attempt in range(max_retries):
                try:
                    logger.info(f"Calling Gemini model gemini-2.5-flash (attempt {attempt + 1}/{max_retries})...")
                    response = client.models.generate_content(
                        model='gemini-2.5-flash',
                        contents=prompt,
                        config=types.GenerateContentConfig(
                            response_mime_type="application/json",
                            response_schema=GeminiReportOutput,
                            temperature=0.1,
                            max_output_tokens=4096,
                            thinking_config=types.ThinkingConfig(
                                thinking_budget=2048
                            )
                        )
                    )
                    break
                except Exception as ex:
                    last_err = ex
                    time.sleep(2)
            
            if response is not None and response.text:
                return json.loads(response.text)
            elif last_err:
                raise last_err
        except Exception as e:
            logger.warning(f"Gemini evaluation failed: {e}. Trying Groq fallback...")
            
    if settings.GROQ_API_KEY:
        try:
            return evaluate_speech_with_groq(prompt)
        except Exception as groq_err:
            logger.error(f"Groq fallback failed: {groq_err}")
            
    raise ValueError("No AI services available for speech evaluation.")
