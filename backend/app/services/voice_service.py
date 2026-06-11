import os
import logging
import numpy as np
import librosa

logger = logging.getLogger("jam_analyzer")

class VoiceService:
    def analyze_audio(self, wav_path: str) -> dict:
        """
        Loads the audio WAV file using Librosa and computes:
        - pitch_variation (F0 standard deviation)
        - energy_variation (RMS amplitude standard deviation)
        - speaking_rate (tempo beats per minute)
        - stability_score (0-100 metric based on RMS continuity)
        - pause_frequency (number of quiet frames divided by duration)
        - vocal_verdict ("Monotone vs Dynamic", "Calm vs Energetic", etc.)
        """
        if not os.path.exists(wav_path):
            logger.error(f"Audio file does not exist for acoustic analysis: {wav_path}")
            return self.get_empty_metrics("Audio file missing.")

        try:
            logger.info(f"Running Librosa voice intelligence extraction on: {wav_path}")
            # Load with mono channel and default sampling rate
            y, sr = librosa.load(wav_path, sr=None, mono=True)
            
            duration = librosa.get_duration(y=y, sr=sr)
            if duration < 1.0:
                logger.warning(f"Audio duration {duration:.2f}s is too short for Librosa extraction.")
                return self.get_empty_metrics("Audio duration too short.")

            # 1. Fundamental Frequency (F0) Tracking
            # Use YIN algorithm for pitch detection (more reliable than pip track)
            f0, _, _ = librosa.pyin(
                y, 
                fmin=librosa.note_to_hz('C2'), 
                fmax=librosa.note_to_hz('C7'), 
                sr=sr
            )
            
            valid_pitches = f0[~np.isnan(f0)]
            if len(valid_pitches) > 0:
                pitch_mean = float(np.mean(valid_pitches))
                pitch_variation = float(np.std(valid_pitches))
            else:
                pitch_mean = 0.0
                pitch_variation = 0.0

            # 2. Sound Energy (Loudness) Variation
            rms = librosa.feature.rms(y=y)
            energy_mean = float(np.mean(rms))
            energy_variation = float(np.std(rms))

            # 3. Tempo & Rhythm
            # Estimate tempo beats per minute
            tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
            speaking_rate = float(tempo[0]) if isinstance(tempo, np.ndarray) else float(tempo)
            
            # Clamp speaking rate to normal ranges
            if speaking_rate < 30.0 or speaking_rate > 240.0:
                speaking_rate = 120.0 # fallback default

            # 4. Pause and silence frequency
            # Frame energy below 10% of mean energy is marked silent/pause
            threshold = energy_mean * 0.1
            silent_frames = np.sum(rms < threshold)
            total_frames = rms.shape[1]
            pause_ratio = float(silent_frames / total_frames) if total_frames > 0 else 0.0
            
            # Stability score (0-100) based on energy variance
            stability_score = max(30, int(100 - (energy_variation * 400)))
            stability_score = min(100, stability_score)

            # 5. Verbal Verdict mappings
            verdict_parts = []
            if pitch_variation < 30.0:
                verdict_parts.append("Monotone")
            else:
                verdict_parts.append("Dynamic")

            if energy_mean < 0.02:
                verdict_parts.append("Calm")
            else:
                verdict_parts.append("Energetic")

            if energy_variation > 0.08:
                verdict_parts.append("Unstable")
            else:
                verdict_parts.append("Stable")
                
            vocal_verdict = " & ".join(verdict_parts)

            logger.info(f"Librosa extraction metrics: Pitch Std: {pitch_variation:.2f}Hz, Energy Std: {energy_variation:.4f}, Verdict: {vocal_verdict}")

            return {
                "pitch_variation": pitch_variation,
                "energy_variation": energy_variation,
                "rhythm_score": max(40.0, 100 - abs(speaking_rate - 120.0) * 0.5),
                "stability_score": float(stability_score),
                "pause_frequency": pause_ratio,
                "vocal_verdict": vocal_verdict,
                "raw_metrics": {
                    "pitch_mean": pitch_mean,
                    "energy_mean": energy_mean,
                    "speaking_rate": speaking_rate,
                    "duration": duration
                }
            }

        except Exception as e:
            logger.error(f"Failed during Librosa acoustic analysis: {e}")
            return self.get_empty_metrics(f"Analysis failed: {str(e)}")

    def get_empty_metrics(self, error_message: str) -> dict:
        return {
            "pitch_variation": 0.0,
            "energy_variation": 0.0,
            "rhythm_score": 0.0,
            "stability_score": 0.0,
            "pause_frequency": 0.0,
            "vocal_verdict": "Flat / Silent",
            "raw_metrics": {"error": error_message}
        }
