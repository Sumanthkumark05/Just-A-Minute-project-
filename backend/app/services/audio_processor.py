import os
import subprocess
import logging
import re
from typing import Dict, Any, List, Tuple

logger = logging.getLogger("jam_analyzer")

# Global cached model to avoid reloading on every request
_whisper_model = None

def get_whisper_model():
    global _whisper_model
    if _whisper_model is None:
        try:
            from faster_whisper import WhisperModel
            logger.info("Initializing faster-whisper model (base, cpu, int8)...")
            # Using 'base' model for balance between accuracy and CPU speed
            # Compute type 'int8' optimizes execution on Intel Core CPUs
            _whisper_model = WhisperModel("base", device="cpu", compute_type="int8")
        except Exception as e:
            logger.error(f"Failed to load WhisperModel: {e}")
            raise e
    return _whisper_model

def extract_audio(video_path: str) -> str:
    """
    Extracts the audio channel from a video file into a 16kHz mono WAV file using FFmpeg.
    """
    audio_path = os.path.splitext(video_path)[0] + ".wav"
    
    if os.path.exists(audio_path):
        return audio_path

    logger.info(f"Extracting audio from {video_path} to {audio_path}...")
    try:
        cmd = [
            "ffmpeg", "-y",
            "-i", video_path,
            "-vn",
            "-acodec", "pcm_s16le",
            "-ar", "16000",
            "-ac", "1",
            audio_path
        ]
        # Run FFmpeg silently
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        if result.returncode != 0:
            raise Exception(f"FFmpeg error: {result.stderr}")
        return audio_path
    except FileNotFoundError:
        logger.error("ffmpeg executable not found. Please install ffmpeg via homebrew ('brew install ffmpeg').")
        raise RuntimeError("ffmpeg not found")
    except Exception as e:
        logger.error(f"Audio extraction failed: {e}")
        raise e

def clean_word(word: str) -> str:
    """
    Cleans punctuation and converts word to lowercase.
    """
    return re.sub(r"[^\w\s']", "", word).strip().lower()

def count_filler_words(transcript: str) -> Dict[str, int]:
    """
    Counts filler words in the transcript using case-insensitive regex matching.
    """
    fillers = {
        "um": 0,
        "uh": 0,
        "ah": 0,
        "er": 0,
        "like": 0,
        "you know": 0,
        "actually": 0,
        "basically": 0,
        "literally": 0,
        "sort of": 0,
        "kind of": 0
    }
    if not transcript:
        return fillers
        
    # Replace punctuation with spaces to prevent boundary issues, keep single quotes for contractions
    clean_text = re.sub(r"[^\w\s']", " ", transcript).lower()
    # Normalize whitespace
    clean_text = re.sub(r"\s+", " ", clean_text).strip()
    # Add boundary spaces
    text_with_spaces = f" {clean_text} "
    
    patterns = {
        "um": r"\bum\b",
        "uh": r"\buh\b",
        "ah": r"\bah\b",
        "er": r"\ber\b",
        "like": r"\blike\b",
        "you know": r"\byou\s+know\b",
        "actually": r"\bactually\b",
        "basically": r"\bbasically\b",
        "literally": r"\bliterally\b",
        "sort of": r"\bsort\s+of\b",
        "kind of": r"\bkind\s+of\b"
    }
    
    logger.info(f"Running filler word regex search on transcript of length {len(transcript)}...")
    logger.info(f"Transcript content: \"{transcript}\"")
    for word, pattern in patterns.items():
        matches = re.findall(pattern, text_with_spaces)
        fillers[word] = len(matches)
        if len(matches) > 0:
            logger.info(f"Detected filler word: '{word}' -> count: {len(matches)}")
            
    return fillers

def analyze_speech_metrics(words: List[Dict[str, Any]], duration: float) -> Dict[str, Any]:
    """
    Calculates detailed speech metrics from timestamped words.
    """
    total_words_count = len(words)
    if total_words_count == 0 or duration == 0:
        return {
            "transcript": "",
            "words_per_minute": 0,
            "filler_words": {
                "um": 0, "uh": 0, "ah": 0, "er": 0, "like": 0, "you know": 0,
                "actually": 0, "basically": 0, "literally": 0, "sort of": 0, "kind of": 0
            },
            "pause_count": 0,
            "pause_duration": 0.0,
            "vocabulary_score": 0,
            "speaking_pace_score": 0
        }

    # Reconstruct transcript and extract cleaned words list
    transcript_parts = []
    clean_words = []
    
    pauses_count = 0
    total_pause_duration = 0.0
    prev_end = 0.0
    
    i = 0
    while i < len(words):
        word_data = words[i]
        raw_word = word_data["word"]
        start = word_data["start"]
        end = word_data["end"]
        
        transcript_parts.append(raw_word)
        cleaned = clean_word(raw_word)
        
        if cleaned:
            clean_words.append(cleaned)
            
            # Sequence checking for "you know" to advance the index correctly in transcript parts
            if cleaned == "you" and i + 1 < len(words):
                next_cleaned = clean_word(words[i+1]["word"])
                if next_cleaned == "know":
                    clean_words.append(next_cleaned)
                    transcript_parts.append(words[i+1]["word"])
                    end = words[i+1]["end"]
                    i += 1
            
            # Pause detection between words (gap > 1.5 seconds)
            if prev_end > 0:
                gap = start - prev_end
                if gap > 1.5:
                    pauses_count += 1
                    total_pause_duration += gap
            
            prev_end = end
        i += 1

    # Safe transcript reconstitution:
    # Build the transcript by joining tokens. Since faster-whisper tokens may or may not contain leading spaces,
    # we can process them sequentially, adding a space between tokens if needed.
    reconstructed_tokens = []
    for token in transcript_parts:
        if not reconstructed_tokens:
            reconstructed_tokens.append(token)
        else:
            prev = reconstructed_tokens[-1]
            need_space = True
            if prev.endswith(" ") or token.startswith(" "):
                need_space = False
            elif token in [".", ",", "!", "?", ";", ":"]:
                need_space = False
            
            if need_space:
                reconstructed_tokens.append(" " + token)
            else:
                reconstructed_tokens.append(token)
                
    transcript = "".join(reconstructed_tokens).strip()
    # Normalize double spaces if any
    transcript = re.sub(r"\s+", " ", transcript)
    
    # Calculate robust filler word counts from the final transcript
    filler_counts = count_filler_words(transcript)
    
    # Calculate WPM based on actual speaking time (total duration minus long pause gaps)
    speaking_time = duration - total_pause_duration
    if speaking_time < 5.0:
        speaking_time = duration  # fallback to avoid division by near-zero or negative
        
    wpm = int((total_words_count / speaking_time) * 60)
    
    # Speaking Pace Score: optimal is between 120 and 150 WPM
    target_pace = 135
    speaking_pace_score = max(30, int(100 - abs(wpm - target_pace) * 1.5))
    if wpm == 0:
        speaking_pace_score = 0
        
    # Vocabulary Richness Score (Type-Token Ratio)
    unique_words_count = len(set(clean_words))
    ttr = (unique_words_count / len(clean_words)) * 100 if clean_words else 0
    vocabulary_score = min(100, max(10, int(ttr * 1.6)))
    
    return {
        "transcript": transcript,
        "words_per_minute": wpm,
        "filler_words": filler_counts,
        "pause_count": pauses_count,
        "pause_duration": round(total_pause_duration, 2),
        "vocabulary_score": vocabulary_score,
        "speaking_pace_score": speaking_pace_score
    }

def process_audio(video_path: str) -> Dict[str, Any]:
    """
    Extracts audio and runs the transcription pipeline.
    """
    audio_path = None
    try:
        audio_path = extract_audio(video_path)
        model = get_whisper_model()
        
        logger.info("Transcribing audio file...")
        segments, info = model.transcribe(audio_path, beam_size=5, word_timestamps=True)
        
        all_words = []
        for segment in segments:
            if segment.words:
                for word in segment.words:
                    all_words.append({
                        "word": word.word,
                        "start": word.start,
                        "end": word.end
                    })
        
        duration = info.duration
        metrics = analyze_speech_metrics(all_words, duration)
        metrics["duration"] = round(duration, 2)
        
        logger.info(f"Audio processing complete. Duration: {duration}s, WPM: {metrics['words_per_minute']}")
        return metrics
    except Exception as e:
        logger.error(f"Error processing speech: {e}")
        # Clean up temporary WAV file if it exists
        if audio_path and os.path.exists(audio_path):
            try:
                os.remove(audio_path)
            except:
                pass
        raise e
    finally:
        # Always clean up temporary audio file to save disk space
        if audio_path and os.path.exists(audio_path):
            try:
                os.remove(audio_path)
            except:
                pass
