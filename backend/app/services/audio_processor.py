import os
import subprocess
import logging
import re
from typing import Dict, Any, List, Tuple
import scipy.io.wavfile as wavfile
import numpy as np
import noisereduce as nr

logger = logging.getLogger("jam_analyzer")

# Global cached model to avoid reloading on every request
_whisper_model = None

def get_whisper_model():
    global _whisper_model
    if _whisper_model is None:
        try:
            from faster_whisper import WhisperModel
            logger.info("Initializing faster-whisper model (base, cpu, int8)...")
            # Using 'large-v3' model for highest transcription accuracy
            # Compute type 'int8' optimizes execution on Intel Core CPUs
            _whisper_model = WhisperModel("large-v3", device="cpu", compute_type="int8")
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
            
        # Apply noise reduction
        logger.info("Applying background noise reduction...")
        rate, data = wavfile.read(audio_path)
        
        # Check if empty or corrupted
        if data.size == 0:
            raise ValueError("Extracted audio data is empty (0 samples).")
            
        # Check maximum amplitude for silence detection (16-bit PCM has values up to 32768)
        max_amplitude = np.abs(data).max()
        duration = len(data) / rate
        logger.info(f"Audio details - Duration: {duration:.2f}s, Sample Rate: {rate}Hz, Max Amplitude: {max_amplitude}")
        
        if max_amplitude < 100:
            raise ValueError("Audio file is silent or volume is extremely low.")
            
        reduced_noise = nr.reduce_noise(y=data, sr=rate, prop_decrease=0.8)
        wavfile.write(audio_path, rate, reduced_noise)
        
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
        "um": r"\bu+m+\b",
        "uh": r"\bu+h+\b",
        "ah": r"\ba+h+\b",
        "er": r"\be+r+\b",
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

def clean_fillers_from_transcript(raw_transcript: str) -> str:
    """
    Removes filler words and their repeat variations from the transcript,
    cleaning up any resulting punctuation/spacing issues.
    """
    if not raw_transcript:
        return ""
        
    patterns = [
        r"\bu+m+\b",
        r"\bu+h+\b",
        r"\be+r+\b",
        r"\ba+h+\b",
        r"\blike\b",
        r"\byou\s+know\b",
        r"\bactually\b",
        r"\bbasically\b",
        r"\bliterally\b",
        r"\bkind\s+of\b",
        r"\bsort\s+of\b"
    ]
    
    cleaned = raw_transcript
    for pattern in patterns:
        cleaned = re.sub(pattern, "", cleaned, flags=re.IGNORECASE)
    
    # Clean up spacing and punctuation
    cleaned = re.sub(r"\s+", " ", cleaned)
    cleaned = re.sub(r"\s+([.,!?;:])", r"\1", cleaned)
    
    # Clean up duplicate punctuation, e.g. ", , ," -> ","
    cleaned = re.sub(r"(?:\s*,\s*)+", ", ", cleaned)
    cleaned = re.sub(r"(?:\s*\.\s*)+", ". ", cleaned)
    cleaned = re.sub(r",\s*\.", ".", cleaned)
    
    # Clean up leading/trailing punctuation and spaces
    cleaned = re.sub(r"^[.,!?;:]\s*", "", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


def analyze_speech_metrics(words: List[Dict[str, Any]], duration: float) -> Dict[str, Any]:
    """
    Calculates detailed speech metrics from timestamped words.
    """
    total_words_count = len(words)
    if total_words_count == 0 or duration == 0:
        return {
            "raw_transcript": "",
            "transcript": "",
            "words_per_minute": 0,
            "filler_words": {
                "um": 0, "uh": 0, "ah": 0, "er": 0, "like": 0, "you know": 0,
                "actually": 0, "basically": 0, "literally": 0, "sort of": 0, "kind of": 0
            },
            "pause_count": 0,
            "pause_duration": 0.0,
            "vocabulary_score": 0,
            "speaking_pace_score": 0,
            "filler_occurrences": []
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
                
    raw_transcript = "".join(reconstructed_tokens).strip()
    # Normalize double spaces if any
    raw_transcript = re.sub(r"\s+", " ", raw_transcript)
    
    # Calculate robust filler word counts from the raw transcript
    filler_counts = count_filler_words(raw_transcript)
    
    # Extract timestamped filler word occurrences
    filler_occurrences = []
    idx = 0
    while idx < len(words):
        w_data = words[idx]
        raw_w = w_data["word"]
        clean_w = clean_word(raw_w)
        
        # Check multi-word fillers first
        is_multi = False
        if idx + 1 < len(words):
            w_data_next = words[idx+1]
            raw_w_next = w_data_next["word"]
            clean_w_next = clean_word(raw_w_next)
            
            phrase = f"{clean_w} {clean_w_next}"
            if phrase in ["you know", "kind of", "sort of"]:
                filler_occurrences.append({
                    "filler": phrase,
                    "start": w_data["start"],
                    "end": w_data_next["end"]
                })
                idx += 2
                is_multi = True
                continue
                
        if not is_multi:
            # Check single word fillers
            for filler_key, pattern in [
                ("um", r"^u+m+$"),
                ("uh", r"^u+h+$"),
                ("er", r"^e+r+$"),
                ("ah", r"^a+h+$"),
                ("like", r"^like$"),
                ("actually", r"^actually$"),
                ("basically", r"^basically$"),
                ("literally", r"^literally$")
            ]:
                if re.match(pattern, clean_w, re.IGNORECASE):
                    filler_occurrences.append({
                        "filler": filler_key,
                        "start": w_data["start"],
                        "end": w_data["end"]
                    })
                    break
            idx += 1

    # Clean transcript of fillers
    cleaned_transcript = clean_fillers_from_transcript(raw_transcript)
    
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
        "raw_transcript": raw_transcript,
        "transcript": cleaned_transcript,
        "words_per_minute": wpm,
        "filler_words": filler_counts,
        "pause_count": pauses_count,
        "pause_duration": round(total_pause_duration, 2),
        "vocabulary_score": vocabulary_score,
        "speaking_pace_score": speaking_pace_score,
        "filler_occurrences": filler_occurrences
    }

def process_audio(video_path: str) -> Dict[str, Any]:
    """
    Extracts audio and runs the transcription pipeline.
    """
    uploaded_filename = os.path.basename(video_path)
    logger.info(f"--- Audio Processing Pipeline Start for file: {uploaded_filename} ---")
    audio_path = None
    try:
        audio_path = extract_audio(video_path)
        logger.info(f"Processed audio path: {audio_path}")
        
        model = get_whisper_model()
        
        logger.info("Transcribing audio file...")
        segments, info = model.transcribe(
            audio_path,
            beam_size=5,
            word_timestamps=True,
            initial_prompt="Uh, um, er, ah, okay. So, like, you know, actually, basically, literally, sort of, kind of."
        )
        
        # Log basic info
        duration = info.duration
        logger.info(f"Whisper audio duration detected: {duration:.2f}s")
        
        all_words = []
        total_confidence = 0.0
        word_count_with_conf = 0
        
        segment_count = 0
        total_segment_confidence = 0.0
        
        for segment in segments:
            segment_count += 1
            # Calculate segment logprob confidence fallback
            import math
            seg_prob = math.exp(max(-10.0, segment.avg_logprob))
            total_segment_confidence += seg_prob
            
            logger.info(f"Segment #{segment_count} text: '{segment.text}'")
            logger.info(f"Segment #{segment_count} raw logprob: {segment.avg_logprob:.4f} (estimated confidence: {seg_prob * 100:.2f}%)")
            
            if segment.words:
                for word in segment.words:
                    word_prob = float(word.probability)
                    all_words.append({
                        "word": word.word,
                        "start": word.start,
                        "end": word.end,
                        "probability": word_prob
                    })
                    total_confidence += word_prob
                    word_count_with_conf += 1
                    logger.debug(f"  Word: '{word.word}' -> probability: {word_prob:.4f}")
        
        # Calculate robust average confidence
        if word_count_with_conf > 0:
            raw_avg_prob = total_confidence / word_count_with_conf
            confidence_source = "word-level probability"
        elif segment_count > 0:
            raw_avg_prob = total_segment_confidence / segment_count
            confidence_source = "segment-level logprob"
        else:
            raw_avg_prob = 0.0
            confidence_source = "no speech detected"
            
        # Apply power-law boost: confidence = 100 * (raw_avg_prob ** 0.35)
        raw_avg_prob_clamped = max(0.0, min(1.0, raw_avg_prob))
        avg_confidence = 100.0 * (raw_avg_prob_clamped ** 0.35)
        
        logger.info(f"Raw confidence calculation: raw_avg_prob = {raw_avg_prob:.4f} -> scaled avg_confidence = {avg_confidence:.2f}% (derived from {confidence_source})")
        
        metrics = analyze_speech_metrics(all_words, duration)
        metrics["duration"] = round(duration, 2)
        metrics["transcript_confidence"] = int(avg_confidence)
        
        logger.info(f"Raw transcript: \"{metrics.get('raw_transcript', '')}\"")
        logger.info(f"Cleaned transcript: \"{metrics.get('transcript', '')}\"")
        logger.info(f"Filler-word extraction results: {metrics.get('filler_words', {})}")
        logger.info(f"--- Audio Processing Pipeline Complete ---")
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
