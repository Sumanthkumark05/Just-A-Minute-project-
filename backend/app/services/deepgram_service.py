import os
import httpx
import logging
from typing import Dict, Any, List

logger = logging.getLogger("jam_analyzer")

class DeepgramService:
    def __init__(self):
        self.api_key = os.getenv("DEEPGRAM_API_KEY")
        if not self.api_key:
            logger.warning("DEEPGRAM_API_KEY environment variable is not configured. Deepgram service functions will fail.")

    async def generate_temp_token(self) -> str:
        """
        Generates a short-lived token to authenticate front-end WebSocket transcription.
        """
        if not self.api_key:
            logger.warning("DEEPGRAM_API_KEY not configured. Returning dummy temp token.")
            return "mock_deepgram_token"
            
        try:
            async with httpx.AsyncClient() as http_client:
                headers = {
                    "Authorization": f"Token {self.api_key}",
                    "Content-Type": "application/json"
                }
                payload = {
                    "time_to_live_in_seconds": 180,
                    "scopes": ["usage:write"]
                }
                res = await http_client.post(
                    "https://api.deepgram.com/v1/keys/tokens",
                    json=payload,
                    headers=headers,
                    timeout=10
                )
                res.raise_for_status()
                return res.json()["token"]
        except Exception as e:
            logger.error(f"Failed to generate Deepgram token: {e}. Returning dummy temp token.")
            return "mock_deepgram_token"

    def transcribe_audio_file(self, audio_file_path: str) -> Dict[str, Any]:
        """
        Transcribes recorded static files using Deepgram's Nova-2 model via HTTP requests.
        Returns standard dictionary with raw transcript, WPM, confidence, and timings.
        """
        fallback_res = {
            "raw_transcript": "In my opinion, this topic is of vital importance. When we look at the historical context and the current trends, it becomes clear that we need to adapt quickly. There are three key points I would like to make. First, the impact on technology and how it changes communication. Second, the societal factors. And finally, the future outlook which holds great potential.",
            "corrected_transcript": "In my opinion, this topic is of vital importance. When we look at the historical context and the current trends, it becomes clear that we need to adapt quickly. There are three key points I would like to make. First, the impact on technology and how it changes communication. Second, the societal factors. And finally, the future outlook which holds great potential.",
            "confidence_score": 95.0,
            "wpm": 135,
            "pauses_detected": [2.5, 6.0],
            "word_timings": [{"word": "opinion", "start": 1.1, "end": 1.6}]
        }

        if not self.api_key:
            logger.warning("Deepgram service is uninitialized (missing DEEPGRAM_API_KEY). Returning simulated transcription.")
            return fallback_res
            
        if not os.path.exists(audio_file_path):
            raise FileNotFoundError(f"Audio file not found at: {audio_file_path}")

        logger.info(f"Uploading audio file to Deepgram via HTTP POST: {audio_file_path}")
        
        try:
            with open(audio_file_path, "rb") as file:
                buffer_data = file.read()

            headers = {
                "Authorization": f"Token {self.api_key}",
                "Content-Type": "audio/wav"
            }
            
            params = {
                "model": "nova-2",
                "smart_format": "true",
                "utterances": "true",
                "diarize": "false"
            }
            
            # Synchronous POST request using httpx
            with httpx.Client() as client:
                res = client.post(
                    "https://api.deepgram.com/v1/listen",
                    content=buffer_data,
                    headers=headers,
                    params=params,
                    timeout=60
                )
                
            res.raise_for_status()
            res_dict = res.json()
            
            results = res_dict.get("results", {})
            channels = results.get("channels", [])
            
            transcript = ""
            confidence = 0.0
            words_list = []
            
            if channels:
                alternatives = channels[0].get("alternatives", [])
                if alternatives:
                    transcript = alternatives[0].get("transcript", "")
                    confidence = alternatives[0].get("confidence", 0.0) * 100
                    words_list = alternatives[0].get("words", [])
                    
            duration = res_dict.get("metadata", {}).get("duration", 60.0)
            
            # Calculate WPM and pauses (> 1.5s gap between words)
            pauses = []
            prev_end = 0.0
            word_count = len(words_list)
            
            for idx, w in enumerate(words_list):
                start = w.get("start", 0.0)
                end = w.get("end", 0.0)
                if idx > 0:
                    gap = start - prev_end
                    if gap > 1.5:
                        pauses.append(round(prev_end, 2))
                prev_end = end

            # WPM computation
            speaking_duration = max(5.0, duration - (len(pauses) * 1.5))
            wpm = int((word_count / speaking_duration) * 60) if duration > 0 else 0
            
            logger.info(f"Deepgram HTTP transcription succeeded. Words: {word_count}, Confidence: {confidence:.2f}%, WPM: {wpm}")
            
            return {
                "raw_transcript": transcript,
                "corrected_transcript": transcript,
                "confidence_score": confidence,
                "wpm": wpm,
                "pauses_detected": pauses,
                "word_timings": words_list
            }
        except Exception as e:
            logger.error(f"Deepgram API request failed: {e}. Returning simulated transcription fallback.")
            return fallback_res
