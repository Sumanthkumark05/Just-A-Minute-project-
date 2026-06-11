import os
import shutil
import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.orm import Session as DBSession
from sqlalchemy.orm.attributes import flag_modified

from app.database import get_db
from app.models import User, Document, DocumentTopic, DocumentSession, DocumentReport, KnowledgeGap, VivaSession, CommunicationDNA, DocumentTranscript, DocumentVoiceMetrics, DocumentFaceMetrics
from app.schemas import DocumentOut, DocumentSessionOut, DocumentSessionCreate, VivaSessionStart, VivaSessionOut
from app.auth import get_current_user
from app.config import settings
from app.services.document_service import DocumentService
from app.services.ai_analyzer import analyze_video_speech
from app.services.audio_processor import process_audio

logger = logging.getLogger("jam_analyzer")

router = APIRouter(prefix="/document", tags=["document"])

doc_service = DocumentService()

@router.post("/upload", response_model=DocumentOut)
async def upload_document(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db)
):
    # 1. Validate file extension
    filename = file.filename
    ext = os.path.splitext(filename.lower())[1]
    if ext not in [".pdf", ".doc", ".docx", ".ppt", ".pptx", ".txt", ".md"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file format '{ext}'. Must be PDF, Word, PowerPoint, TXT, or MD."
        )

    # 2. Check size (50 MB limit)
    # We read in chunks to check size
    contents = await file.read()
    size_mb = len(contents) / (1024 * 1024)
    if size_mb > 50:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File exceeds maximum allowed size of 50 MB."
        )

    # Save to uploads directory
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    temp_filepath = os.path.join(settings.UPLOAD_DIR, f"{current_user.id}_{filename}")
    try:
        with open(temp_filepath, "wb") as f:
            f.write(contents)
    except Exception as e:
        logger.error(f"Failed to save uploaded document: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not save file to disk."
        )

    # 3. Parse and analyze document text
    try:
        extracted_text = doc_service.extract_text(temp_filepath, filename)
        doc_analysis = doc_service.analyze_document_content(extracted_text)
        generated_topics = doc_service.generate_topics(doc_analysis, extracted_text)
    except Exception as e:
        logger.error(f"Document analysis service failure: {e}")
        # Clean up file
        if os.path.exists(temp_filepath):
            os.remove(temp_filepath)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process and analyze document content: {str(e)}"
        )

    # 4. Save to database
    db_doc = Document(
        user_id=current_user.id,
        filename=filename,
        file_type=ext,
        file_path=temp_filepath,
        extracted_text=extracted_text,
        title=doc_analysis.get("title", filename),
        summary=doc_analysis.get("summary", ""),
        key_concepts=doc_analysis.get("key_concepts", []),
        keywords=doc_analysis.get("keywords", []),
        learning_objectives=doc_analysis.get("learning_objectives", [])
    )
    db.add(db_doc)
    db.flush() # populate db_doc.id

    db_topics = []
    for topic in generated_topics:
        db_topic = DocumentTopic(
            document_id=db_doc.id,
            topic=topic.get("topic"),
            category=topic.get("category", "General"),
            difficulty=topic.get("difficulty", "Intermediate"),
            talking_points=topic.get("talking_points", []),
            estimated_speaking_time=topic.get("estimated_speaking_time", 60),
            keywords=topic.get("keywords", [])
        )
        db.add(db_topic)
        db_topics.append(db_topic)

    db.commit()
    db.refresh(db_doc)
    return db_doc

@router.post("/session", response_model=DocumentSessionOut)
def create_document_session(
    payload: DocumentSessionCreate,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db)
):
    # Verify document exists
    doc = db.query(Document).filter(Document.id == payload.document_id, Document.user_id == current_user.id).first()
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found or access denied."
        )

    # Verify topic exists if topic_id is provided
    if payload.topic_id:
        topic = db.query(DocumentTopic).filter(DocumentTopic.id == payload.topic_id, DocumentTopic.document_id == payload.document_id).first()
        if not topic:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Topic not found on selected document."
            )

    db_session = DocumentSession(
        user_id=current_user.id,
        document_id=payload.document_id,
        topic_id=payload.topic_id,
        session_type="presentation",
        topic_title=payload.topic_title,
        instant_start=payload.instant_start,
        preparation_mode=payload.preparation_mode,
        skip_preparation=payload.skip_preparation
    )
    db.add(db_session)
    db.commit()
    db.refresh(db_session)
    return db_session

@router.post("/session/{session_id}/upload", response_model=DocumentSessionOut)
async def upload_document_session_video(
    session_id: str,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db)
):
    # Verify session
    session = db.query(DocumentSession).filter(
        DocumentSession.id == session_id,
        DocumentSession.user_id == current_user.id
    ).first()
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document session not found."
        )

    # Save video locally
    file_ext = os.path.splitext(file.filename)[1] or ".webm"
    video_filename = f"doc_sess_{session_id}{file_ext}"
    video_path = os.path.join(settings.UPLOAD_DIR, video_filename)
    try:
        with open(video_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
    except Exception as e:
        logger.error(f"Failed to save document session video: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Could not save video file: {str(e)}"
        )

    session.video_url = f"/uploads/{video_filename}"
    db.commit()

    # 1. Run standard speech analysis
    try:
        analysis_result = analyze_video_speech(video_path, session.topic_title, "Document Presentation")
    except Exception as e:
        logger.error(f"A/V speech analysis failed for document session: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Video analysis failed: {str(e)}"
        )

    if analysis_result.get("status") == "NO_SPEECH_DETECTED":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=analysis_result.get("feedback", "No speech detected.")
        )

    raw_transcript = analysis_result.get("original_transcript", "")
    corrected_transcript = analysis_result.get("corrected_transcript", "")
    session.raw_transcript = raw_transcript
    session.corrected_transcript = corrected_transcript
    db.commit()

    # Consolidate standard communication metrics
    comm_metrics = {
        "confidence": analysis_result.get("confidence_score", 80),
        "fluency": analysis_result.get("fluency_score", 80),
        "eye_contact": analysis_result.get("eye_contact_score", 80),
        "posture": analysis_result.get("posture_score", 80),
        "vocabulary": analysis_result.get("vocabulary_score", 80),
        "speaking_speed": analysis_result.get("speaking_pace_score", 80),
        "wpm": analysis_result.get("words_per_minute", 130),
        "leadership": analysis_result.get("communication_score", 80),
        "persuasion": analysis_result.get("content_quality_score", 80),
        "engagement": analysis_result.get("engagement_score", 80),
        "filler_words": analysis_result.get("overall_score", 80)
    }

    # 2. Run Comparative Speech-to-Document Analysis
    doc = session.document
    try:
        comp_result = doc_service.evaluate_speech_against_document(
            doc.extracted_text, session.topic_title, raw_transcript, comm_metrics
        )
    except Exception as e:
        logger.error(f"Speech to document comparison failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to evaluate explanation relative to the document."
        )

    # 3. Create DocumentReport record
    db_report = DocumentReport(
        session_id=session.id,
        accuracy_score=comp_result.get("accuracy_score", 75),
        coverage_score=comp_result.get("coverage_score", 70),
        understanding_score=comp_result.get("understanding_score", 72),
        explanation_quality=comp_result.get("explanation_quality", 74),
        technical_correctness=comp_result.get("technical_correctness", 76),
        relevance_score=comp_result.get("relevance_score", 80),
        communication_metrics=comm_metrics,
        suggested_improvements=comp_result.get("suggested_improvements", []),
        coach_recommendations=comp_result.get("coach_recommendations", []),
        follow_up_questions=comp_result.get("follow_up_questions", [])
    )
    db.add(db_report)

    # 4. Save KnowledgeGap records
    for gap in comp_result.get("knowledge_gaps", []):
        db_gap = KnowledgeGap(
            session_id=session.id,
            concept=gap.get("concept", "Omitted Concept"),
            description=gap.get("description", "")
        )
        db.add(db_gap)

    # 5. Save Transcript, Voice, and Face metrics records
    db_transcript = DocumentTranscript(
        session_id=session.id,
        raw_transcript=raw_transcript,
        corrected_transcript=corrected_transcript,
        confidence_score=analysis_result.get("transcript_confidence", 80),
        wpm=comm_metrics["wpm"],
        pauses_detected=[],
        word_timings=[]
    )
    db.add(db_transcript)

    db_voice = DocumentVoiceMetrics(
        session_id=session.id,
        pitch_variation=0.0,
        energy_variation=0.0,
        rhythm_score=float(comm_metrics["wpm"]),
        stability_score=float(analysis_result.get("transcript_confidence", 80)),
        pause_frequency=0.0,
        vocal_verdict="Dynamic" if analysis_result.get("overall_score", 80) >= 75 else "Stable",
        raw_metrics={}
    )
    db.add(db_voice)

    db_face = DocumentFaceMetrics(
        session_id=session.id,
        eye_contact_percentage=float(comm_metrics["eye_contact"]),
        gaze_direction_distribution={},
        head_movement_variance=0.0,
        head_tilt_average=0.0,
        smile_frequency=float(analysis_result.get("emotion_stability_score", 80)),
        attention_score=float(comm_metrics["eye_contact"]),
        engagement_score=float(comm_metrics["engagement"]),
        posture_stability=float(comm_metrics["posture"]),
        attention_heatmap=[]
    )
    db.add(db_face)

    # 5. Update User Communication DNA with new dimensions
    dna = db.query(CommunicationDNA).filter(
        CommunicationDNA.user_id == current_user.id,
        CommunicationDNA.session_id == session_id
    ).first()

    # If no DNA record exists for this session, we create one
    if not dna:
        dna = CommunicationDNA(
            user_id=current_user.id,
            session_id=session_id,
            confidence=comm_metrics["confidence"],
            fluency=comm_metrics["fluency"],
            vocabulary=comm_metrics["vocabulary"],
            storytelling=comm_metrics["persuasion"],
            leadership=comm_metrics["leadership"],
            persuasion=comm_metrics["persuasion"],
            emotional_intelligence=80,
            clarity=analysis_result.get("clarity_score", 8) * 10,
            energy_level=80,
            speaking_speed=comm_metrics["speaking_speed"],
            eye_contact=comm_metrics["eye_contact"],
            posture=comm_metrics["posture"],
            engagement=comm_metrics["engagement"],
            filler_words=comm_metrics["filler_words"],
            profile_summary="Technical Twin Presenter",
            filler_word_frequency=analysis_result.get("filler_words", {})
        )
        db.add(dna)

    # Update new Document Analyzer dimensions on the DNA record
    dna.subject_expertise = comp_result.get("accuracy_score", 75)
    dna.technical_communication = comp_result.get("technical_correctness", 76)
    dna.explanation_skill = comp_result.get("explanation_quality", 74)
    dna.knowledge_retention = comp_result.get("understanding_score", 72)
    dna.teaching_ability = comp_result.get("coverage_score", 70)

    # New requested columns
    dna.technical_communication_skill = comp_result.get("technical_correctness", 76)
    dna.presentation_skill = comm_metrics["fluency"]
    dna.subject_knowledge = comp_result.get("accuracy_score", 75)
    dna.explanation_ability = comp_result.get("explanation_quality", 74)
    dna.communication_confidence = comm_metrics["confidence"]

    db.commit()
    db.refresh(session)
    return session

@router.get("/session/{session_id}", response_model=DocumentSessionOut)
def get_document_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db)
):
    session = db.query(DocumentSession).filter(
        DocumentSession.id == session_id,
        DocumentSession.user_id == current_user.id
    ).first()
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found."
        )
    return session

@router.post("/viva/start", response_model=VivaSessionOut)
def start_viva_session(
    payload: VivaSessionStart,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db)
):
    # Verify document
    doc = db.query(Document).filter(Document.id == payload.document_id, Document.user_id == current_user.id).first()
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found."
        )

    # Generate questions based on mode
    try:
        questions = doc_service.generate_viva_questions(doc.extracted_text, payload.mode)
    except Exception as e:
        logger.error(f"Failed to generate viva questions: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate viva questions from the document."
        )

    qa_list = [{"question": q, "user_answer_transcript": "", "evaluation": None} for q in questions]

    viva = VivaSession(
        user_id=current_user.id,
        document_id=payload.document_id,
        mode=payload.mode,
        questions_answers=qa_list,
        overall_score=0
    )
    db.add(viva)
    db.commit()
    db.refresh(viva)
    return viva

@router.post("/viva/{viva_id}/answer", response_model=VivaSessionOut)
async def submit_viva_answer(
    viva_id: str,
    question_index: int,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db)
):
    # Verify viva session
    viva = db.query(VivaSession).filter(
        VivaSession.id == viva_id,
        VivaSession.user_id == current_user.id
    ).first()
    if not viva:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Viva session not found."
        )

    # Save audio/video file temporarily
    file_ext = os.path.splitext(file.filename)[1] or ".webm"
    temp_ans_path = os.path.join(settings.UPLOAD_DIR, f"viva_{viva_id}_q{question_index}{file_ext}")
    try:
        with open(temp_ans_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
        logger.warning(f"Saved viva answer file {temp_ans_path} with size: {len(content)} bytes")
    except Exception as e:
        logger.error(f"Failed to save viva audio response: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Could not save answer audio file."
        )

    # Transcribe speech
    try:
        speech_results = process_audio(temp_ans_path)
        logger.warning(f"Speech results for Viva answer: {speech_results}")
    except Exception as e:
        logger.error(f"Speech enunciation failed: {e}")
        if os.path.exists(temp_ans_path):
            os.remove(temp_ans_path)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to extract audio or transcribe user speech."
        )

    answer_transcript = speech_results.get("transcript", "") or speech_results.get("raw_transcript", "")
    if not answer_transcript.strip():
        if os.path.exists(temp_ans_path):
            os.remove(temp_ans_path)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No speech detected in your answer."
        )

    # Grade response
    doc = viva.document
    questions_answers = list(viva.questions_answers or [])
    if question_index < 0 or question_index >= len(questions_answers):
        if os.path.exists(temp_ans_path):
            os.remove(temp_ans_path)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid question index."
        )

    question = questions_answers[question_index]["question"]
    try:
        evaluation = doc_service.evaluate_viva_response(
            doc.extracted_text, question, answer_transcript
        )
    except Exception as e:
        logger.error(f"Failed to grade viva response: {e}")
        if os.path.exists(temp_ans_path):
            os.remove(temp_ans_path)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to evaluate your response against the document."
        )

    # Clean up file
    if os.path.exists(temp_ans_path):
        os.remove(temp_ans_path)

    # Update database
    questions_answers[question_index]["user_answer_transcript"] = answer_transcript
    questions_answers[question_index]["evaluation"] = evaluation
    viva.questions_answers = questions_answers
    flag_modified(viva, "questions_answers")

    # Re-calculate overall score
    graded_scores = [qa["evaluation"]["score"] for qa in questions_answers if qa.get("evaluation") is not None]
    if graded_scores:
        viva.overall_score = sum(graded_scores) // len(graded_scores)

    db.commit()
    db.refresh(viva)
    return viva

@router.get("/viva/{viva_id}", response_model=VivaSessionOut)
def get_viva_session(
    viva_id: str,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db)
):
    viva = db.query(VivaSession).filter(
        VivaSession.id == viva_id,
        VivaSession.user_id == current_user.id
    ).first()
    if not viva:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Viva session not found."
        )
    return viva
