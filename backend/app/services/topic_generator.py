import json
import logging
import re
import requests
from typing import Dict, Any, List, Optional
from pydantic import BaseModel
from app.config import settings

logger = logging.getLogger("jam_analyzer")

SYSTEM_PROMPT = """You are an expert JAM (Just A Minute) topic and question generator.

Generate one highly engaging, unique public speaking topic.

Requirements:
- Suitable for 1-2 minutes of speaking.
- Not generic and not repetitive.
- Encourage critical thinking.
- Professional and interview-friendly.
- The category MUST be one of: Technology, AI, Education, Business, Environment, Startups, Leadership, Ethics, Social Issues, Innovation, Future Trends, Current Affairs.
- The difficulty MUST be one of: Beginner, Intermediate, Advanced, Expert.
- Provide 3-4 structured talking_points to guide the speaker.
- Provide 3-5 relevant keywords.
- Return JSON only.

Output:

{
  "topic": "",
  "category": "",
  "difficulty": "",
  "keywords": [],
  "talking_points": [],
  "estimated_speaking_time": 60
}"""

class GeneratedTopicSchema(BaseModel):
    topic: str
    category: str
    difficulty: str
    keywords: List[str]
    talking_points: List[str]
    estimated_speaking_time: int

def extract_and_parse_json(raw_text: str) -> Dict[str, Any]:
    """
    Extracts and parses JSON from the raw text response of the LLM.
    Handles potential markdown fences and conversational headers/footers.
    """
    cleaned_text = raw_text.strip()
    try:
        return json.loads(cleaned_text)
    except json.JSONDecodeError:
        pass

    # Regex search for first '{' to last '}'
    match = re.search(r"(\{.*\})", cleaned_text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1).strip())
        except json.JSONDecodeError:
            pass

    raise ValueError("Invalid response: The response content could not be parsed as JSON.")

def validate_topic_data(parsed_data: Any) -> Dict[str, Any]:
    """
    Validates that the generated data conforms to the required keys and types.
    """
    if not isinstance(parsed_data, dict):
        raise ValueError("The parsed response is not a JSON object.")
        
    required_keys = ["topic", "category", "difficulty", "keywords", "talking_points", "estimated_speaking_time"]
    for key in required_keys:
        if key not in parsed_data:
            # Fallback default values
            if key == "talking_points":
                parsed_data["talking_points"] = ["Introduce the concept", "Highlight key impacts", "Conclude with future outlook"]
            elif key == "estimated_speaking_time":
                parsed_data["estimated_speaking_time"] = 60
            else:
                raise ValueError(f"The model response is missing the required key '{key}'.")

    if not isinstance(parsed_data["topic"], str) or not isinstance(parsed_data["category"], str) or not isinstance(parsed_data["difficulty"], str) or not isinstance(parsed_data["keywords"], list) or not isinstance(parsed_data["talking_points"], list) or not isinstance(parsed_data["estimated_speaking_time"], int):
        raise ValueError("The parsed response JSON has invalid field types.")
        
    return parsed_data

def call_gemini_topic_generator(model_name: str, user_content: str) -> Dict[str, Any]:
    """
    Calls the Gemini API to generate the topic.
    """
    if not settings.GEMINI_API_KEY:
        raise ValueError("Model unavailable: GEMINI_API_KEY is not configured.")

    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=settings.GEMINI_API_KEY)
        prompt = f"System Prompt:\n{SYSTEM_PROMPT}\n\nUser Message:\n{user_content}"
        
        logger.info("Calling Gemini API for topic generation...")
        response = client.models.generate_content(
            model=model_name or 'gemini-2.5-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=GeneratedTopicSchema,
                temperature=0.85
            )
        )
    except Exception as e:
        error_msg = "Model unavailable: Connection to the Gemini API failed."
        logger.error(f"{error_msg} details: {e}")
        raise RuntimeError(error_msg)

    res_text = response.text
    if not res_text:
        raise RuntimeError("Empty response: The Gemini API returned an empty response.")

    try:
        parsed_data = json.loads(res_text)
    except Exception as json_err:
        raise RuntimeError(f"Invalid response: Failed to parse Gemini response as JSON. Details: {json_err}")

    try:
        return validate_topic_data(parsed_data)
    except Exception as val_err:
        raise RuntimeError(f"Invalid response: {val_err}")

def call_groq_topic_generator(model_name: str, user_content: str) -> Dict[str, Any]:
    """
    Calls the Groq API to generate the topic using requests.
    """
    if not settings.GROQ_API_KEY:
        raise ValueError("Model unavailable: GROQ_API_KEY is not configured.")

    headers = {
        "Authorization": f"Bearer {settings.GROQ_API_KEY}",
        "Content-Type": "application/json"
    }

    selected_model = model_name or "llama-3.3-70b-versatile"
    payload = {
        "model": selected_model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_content}
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.85
    }

    logger.info(f"Calling Groq API ({selected_model}) for topic generation...")
    try:
        res = requests.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers=headers,
            json=payload,
            timeout=15
        )
    except requests.exceptions.Timeout as t_err:
        error_msg = "API timeout: The topic generation request timed out."
        logger.error(f"{error_msg} details: {t_err}")
        raise RuntimeError(error_msg)
    except requests.exceptions.RequestException as req_err:
        error_msg = "Model unavailable: Connection to the Groq API failed."
        logger.error(f"{error_msg} details: {req_err}")
        raise RuntimeError(error_msg)

    if res.status_code != 200:
        if res.status_code == 404:
            error_msg = f"Model unavailable: The specified Groq model '{selected_model}' was not found or is unavailable."
        elif res.status_code == 429:
            error_msg = "Model unavailable: The Groq topic generation service is currently rate limited."
        else:
            error_msg = f"Empty response: The Groq model returned a status code {res.status_code}."
        logger.error(f"{error_msg} Raw Response: {res.text}")
        raise RuntimeError(error_msg)

    try:
        res_json = res.json()
    except Exception as parse_err:
        error_msg = "Invalid response: The Groq API returned a non-JSON response payload."
        logger.error(f"{error_msg} details: {parse_err}")
        raise RuntimeError(error_msg)

    choices = res_json.get("choices", [])
    if not choices or not choices[0].get("message") or not choices[0]["message"].get("content"):
        error_msg = "Empty response: The Groq model returned an empty choice or content payload."
        logger.error(error_msg)
        raise RuntimeError(error_msg)

    raw_response = choices[0]["message"]["content"]
    try:
        parsed_data = extract_and_parse_json(raw_response)
    except Exception as json_err:
        error_msg = f"Invalid response: {str(json_err)}"
        logger.error(error_msg)
        raise RuntimeError(error_msg)

    try:
        return validate_topic_data(parsed_data)
    except Exception as val_err:
        raise RuntimeError(f"Invalid response: {val_err}")

def generate_topic_from_llm(category: Optional[str] = None, exclude_topics: Optional[List[str]] = None) -> Dict[str, Any]:
    """
    Generates a unique discussion topic using Gemini or Groq depending on config.
    Implements a fallback mechanism if the primary provider fails.
    """
    # 1. Build the prompt/user message
    user_content = ""
    if category:
        user_content += f"Selected Category: {category}\n"
    else:
        user_content += "Selected Category: Any Category (Choose a random engaging category from general public speaking themes)\n"

    if exclude_topics:
        clean_excludes = [t.strip() for t in exclude_topics if t and t.strip()]
        if clean_excludes:
            user_content += f"Do not generate any of the following topics: {json.dumps(clean_excludes)}\n"

    # 2. Determine primary provider
    primary_provider = None
    model_config = settings.TOPIC_GENERATOR_MODEL.lower() if settings.TOPIC_GENERATOR_MODEL else ""

    if model_config.startswith("gemini"):
        primary_provider = "gemini"
    elif model_config.startswith("groq") or "llama" in model_config:
        primary_provider = "groq"
    else:
        # If TOPIC_GENERATOR_MODEL is empty, determine by key presence
        if settings.GEMINI_API_KEY:
            primary_provider = "gemini"
        elif settings.GROQ_API_KEY:
            primary_provider = "groq"

    if not primary_provider:
        error_msg = "Model unavailable: Neither GEMINI_API_KEY nor GROQ_API_KEY is configured."
        logger.error(error_msg)
        raise ValueError(error_msg)

    # 3. Call with fallback support
    errors = []
    
    # Try primary
    if primary_provider == "gemini":
        try:
            return call_gemini_topic_generator(settings.TOPIC_GENERATOR_MODEL, user_content)
        except Exception as e:
            errors.append(f"Gemini error: {e}")
            logger.warning(f"Gemini topic generation failed: {e}. Attempting fallback to Groq...")
            if settings.GROQ_API_KEY:
                try:
                    return call_groq_topic_generator("", user_content)
                except Exception as fallback_e:
                    errors.append(f"Groq fallback error: {fallback_e}")
    else:
        try:
            return call_groq_topic_generator(settings.TOPIC_GENERATOR_MODEL, user_content)
        except Exception as e:
            errors.append(f"Groq error: {e}")
            logger.warning(f"Groq topic generation failed: {e}. Attempting fallback to Gemini...")
            if settings.GEMINI_API_KEY:
                try:
                    return call_gemini_topic_generator("", user_content)
                except Exception as fallback_e:
                    errors.append(f"Gemini fallback error: {fallback_e}")

    # If all attempts failed, raise appropriate error
    combined_errors = " | ".join(errors)
    if any("Model unavailable:" in err for err in errors):
        # If one of the primary/fallback configurations failed due to missing API keys
        raise ValueError(f"Model unavailable: {combined_errors}")
    elif any("API timeout" in err for err in errors):
        raise RuntimeError(f"API timeout: {combined_errors}")
    elif any("Empty response" in err for err in errors):
        raise RuntimeError(f"Empty response: {combined_errors}")
    else:
        raise RuntimeError(f"Invalid response: {combined_errors}")
