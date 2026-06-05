import logging
from typing import Dict, Any, List, Tuple
import cv2
import numpy as np

logger = logging.getLogger("jam_analyzer")

# We defer importing mediapipe to avoid overhead if unused,
# but it will be available in python 3.11 environment.

def estimate_gaze_hit(left_eye_pts: List[np.ndarray], left_iris_pt: np.ndarray,
                      right_eye_pts: List[np.ndarray], right_iris_pt: np.ndarray) -> bool:
    """
    Checks if the gaze is centered (looking at camera/screen) based on relative iris horizontal offset.
    Returns True if gaze is within the center bounding box, False if looking away.
    """
    # Left eye: outer corner index 33 (first), inner corner index 133 (second)
    left_outer, left_inner = left_eye_pts[0], left_eye_pts[1]
    left_width = np.linalg.norm(left_inner - left_outer)
    if left_width == 0:
        return False
        
    # Project iris onto the horizontal eye axis
    left_ratio = (left_iris_pt[0] - left_outer[0]) / left_width
    
    # Right eye: inner corner index 362 (first), outer corner index 263 (second)
    right_inner, right_outer = right_eye_pts[0], right_eye_pts[1]
    right_width = np.linalg.norm(right_outer - right_inner)
    if right_width == 0:
        return False
        
    right_ratio = (right_iris_pt[0] - right_inner[0]) / right_width

    # Ideal horizontal gaze ratio is ~0.50 (centered).
    # Gaze is considered centered if both iris ratios are within [0.35, 0.65] range.
    horizontal_ok = (0.35 <= left_ratio <= 0.65) and (0.35 <= right_ratio <= 0.65)
    
    return bool(horizontal_ok)

def estimate_head_pose(landmarks: Any, img_w: int, img_h: int) -> Tuple[float, float, float, np.ndarray]:
    """
    Solves Perspective-n-Point (solvePnP) using 6 key 2D facial landmarks against a 3D model
    to estimate the Pitch, Yaw, and Roll of the head.
    """
    # 3D generic head model points (in world coordinates)
    model_points = np.array([
        (0.0, 0.0, 0.0),             # Nose tip (landmark 4)
        (0.0, -330.0, -65.0),        # Chin (landmark 152)
        (-225.0, 170.0, -135.0),     # Left eye outer corner (landmark 33)
        (225.0, 170.0, -135.0),      # Right eye outer corner (landmark 263)
        (-150.0, -150.0, -125.0),    # Left mouth corner (landmark 61)
        (150.0, -150.0, -125.0)      # Right mouth corner (landmark 291)
    ], dtype=np.float32)

    # Fetch corresponding 2D points from face mesh (index mapping)
    key_indices = [4, 152, 33, 263, 61, 291]
    image_points_list = []
    for idx in key_indices:
        lm = landmarks.landmark[idx]
        image_points_list.append((lm.x * img_w, lm.y * img_h))
    image_points = np.array(image_points_list, dtype=np.float32)

    # Camera intrinsic properties (approximate using image dimensions)
    focal_length = img_w
    center = (img_w / 2, img_h / 2)
    camera_matrix = np.array([
        [focal_length, 0, center[0]],
        [0, focal_length, center[1]],
        [0, 0, 1]
    ], dtype=np.float32)
    
    # Assume no lens distortion
    dist_coeffs = np.zeros((4, 1), dtype=np.float32)

    # Solve PnP
    success, rvec, tvec = cv2.solvePnP(
        model_points, image_points, camera_matrix, dist_coeffs, flags=cv2.SOLVEPNP_ITERATIVE
    )

    if not success:
        return 0.0, 0.0, 0.0, np.zeros(3)

    # Convert rotation vector to rotation matrix
    rmat, _ = cv2.Rodrigues(rvec)

    # Extract rotation angles (Euler angles in degrees)
    pitch = np.arcsin(-rmat[2, 0]) * 180 / np.pi
    yaw = np.arctan2(rmat[2, 1], rmat[2, 2]) * 180 / np.pi
    roll = np.arctan2(rmat[1, 0], rmat[0, 0]) * 180 / np.pi

    # Return angles and the 3D translation vector (displacement of head)
    return float(pitch), float(yaw), float(roll), tvec.flatten()

def process_video(video_path: str) -> Dict[str, Any]:
    """
    Decodes the video and runs the Face Mesh CV pipeline.
    Process at 5 FPS to ensure fast execution on CPU.
    """
    import av
    # Import mediapipe locally so dependencies are checked at call time
    import mediapipe as mp
    mp_face_mesh = mp.solutions.face_mesh
    
    logger.info(f"Opening video file for visual analysis: {video_path}")
    try:
        container = av.open(video_path)
        video_stream = container.streams.video[0]
    except Exception as e:
        logger.error(f"Failed to open video file {video_path} via PyAV: {e}")
        raise ValueError(f"Could not open video file: {video_path}")
        
    width = video_stream.width
    height = video_stream.height
    avg_rate = video_stream.average_rate
    fps = float(avg_rate) if avg_rate is not None else 30.0
    
    # Run at 5 FPS: process every Nth frame
    sample_rate = max(1, int(fps / 5))
    
    # Stats accumulators
    processed_count = 0
    face_detected_count = 0
    eye_contact_frames = 0
    good_posture_frames = 0
    smile_frames = 0
    
    # Trackers for posture stability (head movement variance)
    head_translations = []
    nose_positions = []
    
    # Emotion temporal smoothing stats
    smoothed_emotions = np.array([0.0, 1.0, 0.0, 0.0, 0.0]) # Confident, Neutral, Nervous, Happy, Anxious
    emotion_history = [] # track dominant over time to compute stability
    alpha = 0.20 # EMA smoothing parameter
    
    # Initialize Face Mesh with Refined Landmarks enabled (adds iris data)
    face_mesh = mp_face_mesh.FaceMesh(
        static_image_mode=False,
        max_num_faces=1,
        refine_landmarks=True,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5
    )
    
    frame_idx = 0
    for frame in container.decode(video_stream):
        if frame_idx % sample_rate == 0:
            processed_count += 1
            # Convert PyAV VideoFrame directly to RGB numpy array
            rgb_frame = frame.to_ndarray(format='rgb24')
            results = face_mesh.process(rgb_frame)
            
            if results.multi_face_landmarks:
                face_detected_count += 1
                landmarks = results.multi_face_landmarks[0]
                
                # 1. Gaze / Eye Contact tracking (refined landmarks 468+ must be present)
                if len(landmarks.landmark) >= 478:
                    left_outer = np.array([landmarks.landmark[33].x, landmarks.landmark[33].y])
                    left_inner = np.array([landmarks.landmark[133].x, landmarks.landmark[133].y])
                    left_iris = np.array([landmarks.landmark[468].x, landmarks.landmark[468].y])
                    
                    right_inner = np.array([landmarks.landmark[362].x, landmarks.landmark[362].y])
                    right_outer = np.array([landmarks.landmark[263].x, landmarks.landmark[263].y])
                    right_iris = np.array([landmarks.landmark[473].x, landmarks.landmark[473].y])
                    
                    gaze_ok = estimate_gaze_hit([left_outer, left_inner], left_iris,
                                                [right_inner, right_outer], right_iris)
                    if gaze_ok:
                        eye_contact_frames += 1
                
                # 2. Head Pose (Euler angles and translation vector)
                pitch, yaw, roll, tvec = estimate_head_pose(landmarks, width, height)
                head_translations.append(tvec)
                
                # Nose tip position
                nose_lm = landmarks.landmark[4]
                nose_positions.append([nose_lm.x, nose_lm.y, nose_lm.z])
                
                # Pitch/Yaw thresholds: within [-12, +12] degrees is centered
                if -12 <= pitch <= 12 and -12 <= yaw <= 12:
                    good_posture_frames += 1
                    posture_good = True
                else:
                    posture_good = False
                    
                # 3. Smile ratio
                m_left = np.array([landmarks.landmark[61].x * width, landmarks.landmark[61].y * height])
                m_right = np.array([landmarks.landmark[291].x * width, landmarks.landmark[291].y * height])
                e_left = np.array([landmarks.landmark[33].x * width, landmarks.landmark[33].y * height])
                e_right = np.array([landmarks.landmark[263].x * width, landmarks.landmark[263].y * height])
                
                mouth_w = np.linalg.norm(m_right - m_left)
                face_w = np.linalg.norm(e_right - e_left)
                smile_ratio = mouth_w / face_w if face_w > 0 else 0
                
                is_smiling = smile_ratio > 0.54
                if is_smiling:
                    smile_frames += 1
                
                # 4. Instantaneous Frame Emotion Classification
                frame_emotions = np.array([0.0, 0.0, 0.0, 0.0, 0.0])
                if is_smiling:
                    frame_emotions[3] = 0.8  # Happy
                    frame_emotions[0] = 0.2  # Confident
                elif not posture_good:
                    frame_emotions[2] = 0.6  # Nervous (looking away / tilting)
                    frame_emotions[4] = 0.2  # Anxious
                    frame_emotions[1] = 0.2  # Neutral
                elif len(landmarks.landmark) >= 478 and not gaze_ok:
                    frame_emotions[2] = 0.7  # Nervous (lack of eye contact)
                    frame_emotions[4] = 0.1  # Anxious
                    frame_emotions[1] = 0.2  # Neutral
                else:
                    frame_emotions[0] = 0.7  # Confident
                    frame_emotions[1] = 0.3  # Neutral
                    
                smoothed_emotions = alpha * frame_emotions + (1 - alpha) * smoothed_emotions
                emotion_history.append(smoothed_emotions.copy())
                
        frame_idx += 1
        
    container.close()
    face_mesh.close()
    
    # 5. Final Statistics Aggregation
    if face_detected_count == 0:
        logger.warning("No face was detected in any frame of the video.")
        return {
            "eye_contact_score": 0,
            "posture_score": 0,
            "confidence_score": 0,
            "engagement_score": 0,
            "emotion_distribution": {"Confident": 0, "Neutral": 100, "Nervous": 0, "Happy": 0, "Anxious": 0},
            "dominant_emotion": "Neutral",
            "emotion_stability_score": 0,
            "fidgeting_index": 0.0
        }
        
    eye_contact_score = int((eye_contact_frames / face_detected_count) * 100)
    posture_score = int((good_posture_frames / face_detected_count) * 100)
    
    # Fidgeting Index / Posture stability: variance of nose coordinates
    nose_variance = np.var(nose_positions, axis=0) if nose_positions else [0, 0, 0]
    # Sum of variance in X, Y, Z. Scaling it so a stable head is near 0.
    fidgeting_val = float(np.sum(nose_variance) * 1000) # multiplier to get it in readable scale
    
    # Deduct score if fidgeting is very high
    stability_penalty = min(40, int(fidgeting_val * 1.5))
    confidence_score = max(30, int(posture_score * 0.5 + eye_contact_score * 0.5) - stability_penalty)
    
    # Engagement score: horizontal gaze + posture stability + smiling baseline
    smile_pct = (smile_frames / face_detected_count) * 100
    engagement_score = int(eye_contact_score * 0.5 + posture_score * 0.3 + min(100, smile_pct * 5) * 0.2)
    
    # Average the smoothed emotions over the entire session
    avg_emotions = np.mean(emotion_history, axis=0)
    emotions_dict = {
        "Confident": round(float(avg_emotions[0]) * 100, 1),
        "Neutral": round(float(avg_emotions[1]) * 100, 1),
        "Nervous": round(float(avg_emotions[2]) * 100, 1),
        "Happy": round(float(avg_emotions[3]) * 100, 1),
        "Anxious": round(float(avg_emotions[4]) * 100, 1)
    }
    
    # Get dominant emotion
    emotion_names = ["Confident", "Neutral", "Nervous", "Happy", "Anxious"]
    dominant_idx = np.argmax(avg_emotions)
    dominant_emotion = emotion_names[dominant_idx]
    
    # Emotion Stability Score: 100 - average variance across frame-by-frame emotions
    # High variance means emotions fluctuate wildly. Low variance means stable delivery.
    emotion_vars = np.var(emotion_history, axis=0)
    avg_variance = float(np.mean(emotion_vars))
    emotion_stability_score = max(40, int(100 - avg_variance * 400)) # scaled to range 40-100
    
    logger.info(f"Visual analysis complete. Face detected frames: {face_detected_count}/{processed_count}")
    logger.info(f"Eye Contact: {eye_contact_score}%, Posture: {posture_score}%, Confidence: {confidence_score}%")
    
    return {
        "eye_contact_score": eye_contact_score,
        "posture_score": posture_score,
        "confidence_score": confidence_score,
        "engagement_score": engagement_score,
        "emotion_distribution": emotions_dict,
        "dominant_emotion": dominant_emotion,
        "emotion_stability_score": emotion_stability_score,
        "fidgeting_index": round(fidgeting_val, 4)
    }
