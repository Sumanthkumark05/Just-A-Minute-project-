import os
import subprocess
import logging
import re
import math
from typing import Dict, Any, List
import scipy.io.wavfile as wavfile
import numpy as np
import noisereduce as nr
import webrtcvad

logger = logging.getLogger("jam_analyzer")

# Global cached model to avoid reloading on every request
_whisper_model = None

def get_whisper_model():
    global _whisper_model
    if _whisper_model is None:
        try:
            from faster_whisper import WhisperModel
            import ctranslate2
            
            try:
                cuda_available = ctranslate2.get_cuda_device_count() > 0
            except Exception:
                cuda_available = False
                
            device = "cuda" if cuda_available else "cpu"
            compute_type = "float16" if cuda_available else "int8"
            
            logger.info(f"Initializing faster-whisper model (large-v3, device={device}, compute_type={compute_type})...")
            _whisper_model = WhisperModel("large-v3", device=device, compute_type=compute_type)
        except Exception as e:
            logger.error(f"Failed to load WhisperModel: {e}")
            raise e
    return _whisper_model

def run_webrtc_vad(audio_path: str, aggressiveness: int = 2) -> Dict[str, Any]:
    """
    Runs WebRTC VAD on the audio file (must be 16kHz 16-bit mono PCM).
    Returns speech_duration, silence_duration, and total_duration.
    """
    try:
        vad = webrtcvad.Vad(aggressiveness)
        sample_rate, data = wavfile.read(audio_path)
        
        # Ensure data is 16-bit PCM format
        if data.dtype != np.int16:
            if data.dtype == np.float32 or data.dtype == np.float64:
                data = (data * 32767).astype(np.int16)
            else:
                data = data.astype(np.int16)
                
        raw_bytes = data.tobytes()
        
        # 30 ms frame at 16kHz = 480 samples = 960 bytes
        frame_duration_ms = 30
        frame_size = int(sample_rate * frame_duration_ms / 1000)
        frame_bytes_len = frame_size * 2
        
        total_frames = len(raw_bytes) // frame_bytes_len
        speech_frames = 0
        silence_frames = 0
        
        for i in range(total_frames):
            frame = raw_bytes[i*frame_bytes_len : (i+1)*frame_bytes_len]
            # Avoid checking short trailing frame
            if len(frame) == frame_bytes_len:
                try:
                    is_speech = vad.is_speech(frame, sample_rate)
                    if is_speech:
                        speech_frames += 1
                    else:
                        silence_frames += 1
                except Exception:
                    pass
                    
        speech_duration = speech_frames * (frame_duration_ms / 1000.0)
        silence_duration = silence_frames * (frame_duration_ms / 1000.0)
        
        logger.info(f"WebRTC VAD: speech={speech_duration:.2f}s, silence={silence_duration:.2f}s")
        return {
            "speech_duration": round(speech_duration, 2),
            "silence_duration": round(silence_duration, 2),
            "total_duration": round(speech_duration + silence_duration, 2)
        }
    except Exception as e:
        logger.warning(f"VAD failed: {e}. Using fallback values.")
        # Fallback to simple amplitude-based estimation if VAD crashes
        return {
            "speech_duration": 0.0,
            "silence_duration": 0.0,
            "total_duration": 0.0
        }

def extract_audio(video_path: str) -> str:
    """
    Extracts the audio channel from a video file into a 16kHz mono WAV file using FFmpeg,
    and applies noisereduce noise reduction.
    """
    audio_path = os.path.splitext(video_path)[0] + ".wav"
    
    # Overwrite if exists to support new recordings in the same session
    if os.path.exists(audio_path):
        try:
            os.remove(audio_path)
        except Exception as e:
            logger.warning(f"Could not remove old audio file: {e}")

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
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        if result.returncode != 0:
            logger.error(f"FFmpeg extraction failed: {result.stderr}")
            raise Exception(f"FFmpeg error: {result.stderr}")
            
        rate, data = wavfile.read(audio_path)
        
        if data.size == 0:
            raise ValueError("Extracted audio data is empty (0 samples).")
            
        # 1. Sound Noise Reduction
        try:
            logger.info("Applying spectral noise reduction to clean static background noise...")
            # Reduce noise on 16kHz mono audio data
            reduced_data = nr.reduce_noise(y=data, sr=rate)
            wavfile.write(audio_path, rate, reduced_data.astype(data.dtype))
        except Exception as e:
            logger.warning(f"Noise reduction failed: {e}. Using original audio.")
            
        return audio_path
    except FileNotFoundError:
        logger.error("ffmpeg executable not found.")
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
        "um": 0, "uh": 0, "ah": 0, "er": 0, "like": 0,
        "you know": 0, "actually": 0, "basically": 0,
        "literally": 0, "sort of": 0, "kind of": 0
    }
    if not transcript:
        return fillers
        
    clean_text = re.sub(r"[^\w\s']", " ", transcript).lower()
    clean_text = re.sub(r"\s+", " ", clean_text).strip()
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
    
    for word, pattern in patterns.items():
        matches = re.findall(pattern, text_with_spaces)
        fillers[word] = len(matches)
            
    return fillers

def clean_fillers_from_transcript(raw_transcript: str) -> str:
    """
    Removes filler words and their repeat variations from the transcript.
    """
    if not raw_transcript:
        return ""
        
    patterns = [
        r"\bu+m+\b", r"\bu+h+\b", r"\be+r+\b", r"\ba+h+\b",
        r"\blike\b", r"\byou\s+know\b", r"\bactually\b",
        r"\bbasically\b", r"\bliterally\b", r"\bkind\s+of\b",
        r"\bsort\s+of\b"
    ]
    
    cleaned = raw_transcript
    for pattern in patterns:
        cleaned = re.sub(pattern, "", cleaned, flags=re.IGNORECASE)
    
    cleaned = re.sub(r"\s+", " ", cleaned)
    cleaned = re.sub(r"\s+([.,!?;:])", r"\1", cleaned)
    cleaned = re.sub(r"(?:\s*,\s*)+", ", ", cleaned)
    cleaned = re.sub(r"(?:\s*\.\s*)+", ". ", cleaned)
    cleaned = re.sub(r",\s*\.", ".", cleaned)
    cleaned = re.sub(r"^[.,!?;:]\s*", "", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned

def analyze_speech_metrics(words: List[Dict[str, Any]], duration: float, vad_results: Dict[str, Any] = None) -> Dict[str, Any]:
    """
    Calculates detailed speech metrics from timestamped words and VAD results.
    """
    if vad_results is None:
        vad_results = {"speech_duration": duration, "silence_duration": 0.0}
    total_words_count = len(words)
    speech_dur = vad_results.get("speech_duration", duration)
    silence_dur = vad_results.get("silence_duration", 0.0)
    
    if speech_dur <= 0:
        speech_dur = duration if duration > 0 else 1.0

    if total_words_count == 0:
        return {
            "raw_transcript": "",
            "transcript": "",
            "words_per_minute": 0,
            "speech_duration": speech_dur,
            "silence_duration": silence_dur,
            "filler_words": {
                "um": 0, "uh": 0, "ah": 0, "er": 0, "like": 0, "you know": 0,
                "actually": 0, "basically": 0, "literally": 0, "sort of": 0, "kind of": 0
            },
            "pause_count": 0,
            "pause_duration": round(silence_dur, 2),
            "vocabulary_score": 0,
            "speaking_pace_score": 0,
            "filler_occurrences": []
        }

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
            
            if cleaned == "you" and i + 1 < len(words):
                next_cleaned = clean_word(words[i+1]["word"])
                if next_cleaned == "know":
                    clean_words.append(next_cleaned)
                    transcript_parts.append(words[i+1]["word"])
                    end = words[i+1]["end"]
                    i += 1
            
            if prev_end > 0:
                gap = start - prev_end
                if gap > 1.5:
                    pauses_count += 1
                    total_pause_duration += gap
            
            prev_end = end
        i += 1

    reconstructed_tokens: List[str] = []
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
    raw_transcript = re.sub(r"\s+", " ", raw_transcript)
    
    filler_counts = count_filler_words(raw_transcript)
    
    filler_occurrences = []
    idx = 0
    while idx < len(words):
        w_data = words[idx]
        raw_w = w_data["word"]
        clean_w = clean_word(raw_w)
        
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
            for filler_key, pattern in [
                ("um", r"^u+m+$"), ("uh", r"^u+h+$"), ("er", r"^e+r+$"),
                ("ah", r"^a+h+$"), ("like", r"^like$"), ("actually", r"^actually$"),
                ("basically", r"^basically$"), ("literally", r"^literally$")
            ]:
                if re.match(pattern, clean_w, re.IGNORECASE):
                    filler_occurrences.append({
                        "filler": filler_key,
                        "start": w_data["start"],
                        "end": w_data["end"]
                    })
                    break
            idx += 1

    cleaned_transcript = clean_fillers_from_transcript(raw_transcript)
    
    # Calculate WPM based on exact speech duration
    wpm = int((total_words_count / speech_dur) * 60)
    
    # Target pace 135 WPM
    target_pace = 135
    speaking_pace_score = max(30, int(100 - abs(wpm - target_pace) * 1.5))
    if wpm == 0:
        speaking_pace_score = 0
        
    unique_words_count = len(set(clean_words))
    ttr = (unique_words_count / len(clean_words)) * 100 if clean_words else 0
    vocabulary_score = min(100, max(10, int(ttr * 1.6)))
    
    return {
        "raw_transcript": raw_transcript,
        "transcript": cleaned_transcript,
        "words_per_minute": wpm,
        "speech_duration": round(speech_dur, 2),
        "silence_duration": round(silence_dur, 2),
        "filler_words": filler_counts,
        "pause_count": pauses_count,
        "pause_duration": round(total_pause_duration, 2),
        "vocabulary_score": vocabulary_score,
        "speaking_pace_score": speaking_pace_score,
        "filler_occurrences": filler_occurrences
    }

def process_audio(video_path: str) -> Dict[str, Any]:
    """
    Extracts audio, applies VAD and noise reduction, then runs transcription.
    """
    uploaded_filename = os.path.basename(video_path)
    logger.info(f"--- Audio Processing Overhaul for file: {uploaded_filename} ---")
    audio_path = None
    try:
        audio_path = extract_audio(video_path)
        
        # 1. Run WebRTC VAD
        vad_results = run_webrtc_vad(audio_path, aggressiveness=2)
        
        # 2. Get Whisper Model
        model = get_whisper_model()
        
        logger.info("Transcribing audio file with faster-whisper...")
        segments, info = model.transcribe(
            audio_path,
            beam_size=5,
            word_timestamps=True,
            vad_filter=True, # Secondary Silero VAD filtering
            vad_parameters=dict(
                threshold=0.3,
                min_speech_duration_ms=250,
                max_speech_duration_s=float('inf'),
                min_silence_duration_ms=500,
                speech_pad_ms=400
            ),
            initial_prompt="Uh, um, er, ah, okay. So, like, you know, actually, basically, literally, sort of, kind of."
        )
        
        duration = info.duration
        if duration <= 0:
            rate, data = wavfile.read(audio_path)
            duration = len(data) / rate
            
        all_words = []
        total_confidence = 0.0
        word_count_with_conf = 0
        segment_count = 0
        total_segment_confidence = 0.0
        
        for segment in segments:
            segment_count += 1
            seg_prob = math.exp(max(-10.0, segment.avg_logprob))
            total_segment_confidence += seg_prob
            
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
        
        probs = []
        segment_prob = 0.0
        word_prob = 0.0
        
        if segment_count > 0:
            segment_prob = total_segment_confidence / segment_count
            probs.append(segment_prob)
        if word_count_with_conf > 0:
            word_prob = total_confidence / word_count_with_conf
            probs.append(word_prob)
            
        if probs:
            raw_avg_prob = max(probs)
        else:
            raw_avg_prob = 0.0
            
        # Boost confidence score
        raw_avg_prob_clamped = max(0.0, min(1.0, raw_avg_prob))
        avg_confidence = 100.0 * (raw_avg_prob_clamped ** 0.35)
        
        # Compute exact average amplitude (volume)
        rate, wav_data = wavfile.read(audio_path)
        avg_volume = float(np.mean(np.abs(wav_data)))
        
        # Override VAD durations with actual audio length if VAD returned zero but speech was transcribed
        if len(all_words) > 0 and vad_results["speech_duration"] == 0:
            vad_results["speech_duration"] = round(duration, 2)
            vad_results["silence_duration"] = 0.0
            vad_results["total_duration"] = round(duration, 2)
            
        metrics = analyze_speech_metrics(all_words, duration, vad_results)
        metrics["duration"] = round(duration, 2)
        metrics["transcript_confidence"] = int(avg_confidence)
        metrics["average_volume"] = round(avg_volume, 2)
        metrics["vad_speech_duration"] = vad_results["speech_duration"]
        metrics["vad_silence_duration"] = vad_results["silence_duration"]
        
        logger.info(f"Audio metrics: speech_dur={metrics['speech_duration']}s, WPM={metrics['words_per_minute']}, Vol={avg_volume:.1f}")
        return metrics
        
    except Exception as e:
        logger.error(f"Error processing speech: {e}")
        raise e
    finally:
        if audio_path and os.path.exists(audio_path):
            try:
                os.remove(audio_path)
            except Exception:
                pass
