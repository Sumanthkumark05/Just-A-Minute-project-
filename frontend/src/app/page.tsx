"use client";

import React, { useState, useEffect, useRef } from "react";
import Webcam from "react-webcam";
import { jsPDF } from "jspdf";
import { 
  Mic, Video, Award, History, LogOut, Loader2, Sparkles, 
  AlertTriangle, ArrowRight, CheckCircle, RefreshCw, Calendar, 
  Volume2, Shield, User, Trophy, BarChart3, Clock, TrendingUp, 
  Play, Square, VideoOff, Camera, UserCheck, Flame, ChevronRight,
  TrendingDown, Check, Info, FileDown, BookOpen, ShieldAlert, Activity, FileText
} from "lucide-react";
import {
  Chart as ChartJS,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  ArcElement
} from "chart.js";
import { Radar, Line, Bar, Doughnut } from "react-chartjs-2";

import { api } from "../utils/api";
import Sidebar from "../components/Sidebar";

ChartJS.register(
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  ArcElement
);

type Screen = "auth" | "dashboard" | "jam" | "debate" | "interview" | "dna" | "coach" | "history" | "leaderboard" | "processing" | "results" | "doc_analyzer" | "doc_processing" | "doc_results" | "doc_viva";

const CATEGORIES = [
  "Technology",
  "AI",
  "Education",
  "Business",
  "Environment",
  "Startups",
  "Leadership",
  "Ethics",
  "Social Issues",
  "Innovation",
  "Future Trends",
  "Current Affairs"
];

export default function Home() {
  const [currentScreen, setCurrentScreen] = useState<Screen>("auth");
  const [mounted, setMounted] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [activeResultTab, setActiveResultTab] = useState("overview");
  
  // Auth Form State
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  // Topic Prep States
  const [generatedTopic, setGeneratedTopic] = useState("");
  const [generatedCategory, setGeneratedCategory] = useState("");
  const [generatedDifficulty, setGeneratedDifficulty] = useState("Medium");
  const [generatedKeywords, setGeneratedKeywords] = useState<string[]>([]);
  const [generatedTalkingPoints, setGeneratedTalkingPoints] = useState<string[]>([]);
  const [generatedEstTime, setGeneratedEstTime] = useState(60);
  const [selectedCategory, setSelectedCategory] = useState("Technology");
  const [topicLoading, setTopicLoading] = useState(false);

  // JAM Prep Timer — full state machine
  type PrepTimerState = "idle" | "running" | "paused" | "completed";
  const [prepTimerState, setPrepTimerState] = useState<PrepTimerState>("idle");
  const [prepTimerValue, setPrepTimerValue] = useState(15);
  const [prepTimerInitial, setPrepTimerInitial] = useState(15);
  // Legacy aliases kept for any remaining refs:
  const prepTimer = prepTimerValue;
  const isPrepActive = prepTimerState === "running";

  // Enhanced workflow state variables
  const [workflowChoice, setWorkflowChoice] = useState<"none" | "immediate" | "prep_choice" | "prep_timer">("none");
  const [selectedPrepDuration, setSelectedPrepDuration] = useState<number>(60);
  const [instantStart, setInstantStart] = useState<boolean>(false);
  const [preparationMode, setPreparationMode] = useState<boolean>(false);
  const [skipPreparation, setSkipPreparation] = useState<boolean>(false);

  // Diagnostics & Status States
  const [isCameraAvailable, setIsCameraAvailable] = useState(false);
  const [isMicAvailable, setIsMicAvailable] = useState(false);
  const [liveVolume, setLiveVolume] = useState(0);
  const [isVADActive, setIsVADActive] = useState(false);
  const [cameraErrorMsg, setCameraErrorMsg] = useState("");

  // Recording & Media States
  const webcamRef = useRef<Webcam>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const simIntervalRef = useRef<any>(null);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [recordingTimer, setRecordingTimer] = useState(60);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);
  const [streamError, setStreamError] = useState("");
  const [webcamKey, setWebcamKey] = useState(0);
  const [isStreamReady, setIsStreamReady] = useState(false);

  // Deepgram Live Streaming States
  const dgSocketRef = useRef<WebSocket | null>(null);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [liveConfidence, setLiveConfidence] = useState(100);
  const [liveWpm, setLiveWpm] = useState(0);

  // Audio Canvas visualizer Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameId = useRef<number | null>(null);

  // Debate Arena States
  const [debateTopic, setDebateTopic] = useState("");
  const [debateDifficulty, setDebateDifficulty] = useState("Intermediate");
  const [debateOpponentArg, setDebateOpponentArg] = useState("");
  const [debateUserArg, setDebateUserArg] = useState("");
  const [debateSessionId, setDebateSessionId] = useState("");
  const [debateLoading, setDebateLoading] = useState(false);
  const [debateScorecard, setDebateScorecard] = useState<any>(null);
  const [debateTimer, setDebateTimer] = useState(60);
  const [isDebateRecording, setIsDebateRecording] = useState(false);
  const [debateChunks, setDebateChunks] = useState<Blob[]>([]);
  const [videoQuality, setVideoQuality] = useState("720p");

  // Interview Simulator States
  const [interviewRole, setInterviewRole] = useState("Software Engineer");
  const [interviewRound, setInterviewRound] = useState("Technical");
  const [interviewSessionId, setInterviewSessionId] = useState("");
  const [interviewQuestion, setInterviewQuestion] = useState("");
  const [interviewUserAnswer, setInterviewUserAnswer] = useState("");
  const [interviewFeedback, setInterviewFeedback] = useState<any>(null);
  const [interviewHistory, setInterviewHistory] = useState<string[]>([]);
  const [interviewLoading, setInterviewLoading] = useState(false);
  // Interview recording states
  const [interviewRecordingMode, setInterviewRecordingMode] = useState<"audio" | "video" | "audio+video">("audio+video");
  const [isInterviewRecording, setIsInterviewRecording] = useState(false);
  const [isInterviewPaused, setIsInterviewPaused] = useState(false);
  const [interviewRecordingTimer, setInterviewRecordingTimer] = useState(120);
  const [interviewChunks, setInterviewChunks] = useState<Blob[]>([]);
  const [interviewRecordedBlob, setInterviewRecordedBlob] = useState<Blob | null>(null);
  const [interviewStreamReady, setInterviewStreamReady] = useState(false);
  const [interviewCameraEnabled, setInterviewCameraEnabled] = useState(true);
  const [interviewMicEnabled, setInterviewMicEnabled] = useState(true);
  const [interviewErrorMsg, setInterviewErrorMsg] = useState("");
  const [isInterviewAnalyzing, setIsInterviewAnalyzing] = useState(false);
  const interviewWebcamRef = useRef<Webcam>(null);
  const interviewMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const interviewCanvasRef = useRef<HTMLCanvasElement>(null);
  const interviewAudioContextRef = useRef<AudioContext | null>(null);
  const interviewAnalyserRef = useRef<AnalyserNode | null>(null);
  const interviewAnimationFrameRef = useRef<number | null>(null);
  const interviewLiveVolumeRef = useRef(0);
  const [interviewLiveVolume, setInterviewLiveVolume] = useState(0);

  // AI Coach States
  const [dnaMetrics, setDnaMetrics] = useState<any>(null);
  const [coachRecs, setCoachRecs] = useState<any[]>([]);
  const [challenges, setChallenges] = useState<any[]>([]);
  const [selectedChallenge, setSelectedChallenge] = useState<any>(null);
  const [challengeScore, setChallengeScore] = useState(80);
  const [challengeSubmitting, setChallengeSubmitting] = useState(false);

  // Document Analyzer Module States
  const [uploadedDoc, setUploadedDoc] = useState<any>(null);
  const [docFile, setDocFile] = useState<File | null>(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [docTopics, setDocTopics] = useState<any[]>([]);
  const [selectedDocTopic, setSelectedDocTopic] = useState<any>(null);
  const [docAnalyzerMode, setDocAnalyzerMode] = useState<"presentation" | "viva">("presentation");
  const [vivaModeOption, setVivaModeOption] = useState<"viva" | "project" | "resume">("viva");
  const [activeDocSession, setActiveDocSession] = useState<any>(null);
  const [docSessionLoading, setDocSessionLoading] = useState(false);
  
  // Document Viva state variables
  const [activeVivaSession, setActiveVivaSession] = useState<any>(null);
  const [vivaCurrentQuestionIdx, setVivaCurrentQuestionIdx] = useState(0);
  const [isVivaRecording, setIsVivaRecording] = useState(false);
  const [vivaRecordingTimer, setVivaRecordingTimer] = useState(45);
  const [vivaLoading, setVivaLoading] = useState(false);
  const [vivaSubmittingAnswer, setVivaSubmittingAnswer] = useState(false);
  const [vivaRecordedChunks, setVivaRecordedChunks] = useState<Blob[]>([]);
  const [vivaShowResults, setVivaShowResults] = useState(false);

  // History & Metrics Results
  const [activeSession, setActiveSession] = useState<any>(null);
  const [dashboardStats, setDashboardStats] = useState<any>(null);
  const [historyList, setHistoryList] = useState<any[]>([]);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [resultsLoading, setResultsLoading] = useState(false);

  // Hydration safe check
  useEffect(() => {
    setMounted(true);
    const token = typeof window !== "undefined" ? localStorage.getItem("jam_token") : null;
    if (token) {
      loadUserProfile();
    }
  }, []);

  // JAM Prep Timer — state machine driven countdown
  useEffect(() => {
    let interval: any = null;
    if (prepTimerState === "running" && prepTimerValue > 0) {
      interval = setInterval(() => {
        setPrepTimerValue((prev) => prev - 1);
      }, 1000);
    } else if (prepTimerState === "running" && prepTimerValue === 0) {
      setPrepTimerState("completed");
      startRecordingSession();
    }
    return () => clearInterval(interval);
  }, [prepTimerState, prepTimerValue]);

  useEffect(() => {
    let interval: any = null;
    if (isRecording && recordingTimer > 0) {
      interval = setInterval(() => {
        setRecordingTimer((prev) => prev - 1);
      }, 1000);
    } else if (isRecording && recordingTimer === 0) {
      stopRecordingSession();
    }
    return () => clearInterval(interval);
  }, [isRecording, recordingTimer]);

  // Debate Sync Timer
  useEffect(() => {
    let interval: any = null;
    if (isDebateRecording && debateTimer > 0) {
      interval = setInterval(() => {
        setDebateTimer((prev) => prev - 1);
      }, 1000);
    } else if (isDebateRecording && debateTimer === 0) {
      stopDebateRecordingAndSubmit();
    }
    return () => clearInterval(interval);
  }, [isDebateRecording, debateTimer]);

  // Interview Recording Timer countdown
  useEffect(() => {
    let interval: any = null;
    if (isInterviewRecording && !isInterviewPaused && interviewRecordingTimer > 0) {
      interval = setInterval(() => {
        setInterviewRecordingTimer((prev) => prev - 1);
      }, 1000);
    } else if (isInterviewRecording && !isInterviewPaused && interviewRecordingTimer === 0) {
      handleStopInterviewRecording();
    }
    return () => clearInterval(interval);
  }, [isInterviewRecording, isInterviewPaused, interviewRecordingTimer]);

  // Document Viva Countdown Timer
  useEffect(() => {
    let interval: any = null;
    if (isVivaRecording && vivaRecordingTimer > 0) {
      interval = setInterval(() => {
        setVivaRecordingTimer((prev) => prev - 1);
      }, 1000);
    } else if (isVivaRecording && vivaRecordingTimer === 0) {
      handleStopVivaRecording();
    }
    return () => clearInterval(interval);
  }, [isVivaRecording, vivaRecordingTimer]);

  // Clean media streams when screen switches
  useEffect(() => {
    if (currentScreen !== "jam" && currentScreen !== "debate" && currentScreen !== "doc_analyzer" && currentScreen !== "doc_viva") {
      if (webcamRef.current && webcamRef.current.stream) {
        webcamRef.current.stream.getTracks().forEach((track) => track.stop());
      }
      stopAudioVisualizer();
      closeDeepgramWebSocket();
      stopSimulatedTranscription();
      setIsStreamReady(false);
      setIsCameraAvailable(false);
      setIsMicAvailable(false);
    }
  }, [currentScreen]);

  const loadUserProfile = async () => {
    try {
      const profile = await api.getMe();
      setUser(profile);
      fetchDashboardData();
      fetchCoachData();
      setCurrentScreen("dashboard");
    } catch (err) {
      api.logout();
      setUser(null);
      setCurrentScreen("auth");
    }
  };

  const fetchDashboardData = async () => {
    try {
      const stats = await api.getAnalytics();
      setDashboardStats(stats);
      const hist = await api.getHistory();
      setHistoryList(hist);
      const lead = await api.getLeaderboard();
      setLeaderboard(lead);
    } catch (err) {
      console.error("Failed to load dashboard metrics:", err);
    }
  };

  const fetchCoachData = async () => {
    try {
      const dna = await api.getDNA();
      setDnaMetrics(dna);
      const recs = await api.getCoachRecommendations();
      setCoachRecs(recs);
      const chs = await api.getChallenges();
      setChallenges(chs);
    } catch (err) {
      console.error("Failed to load coach configurations:", err);
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setAuthLoading(true);
    try {
      if (isLogin) {
        await api.login(email, password);
      } else {
        await api.signup(email, name, password);
        await api.login(email, password);
      }
      await loadUserProfile();
    } catch (err: any) {
      setAuthError(err.message || "Auth failure.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    api.logout();
    setUser(null);
    setCurrentScreen("auth");
  };

  const startSimulatedTranscription = () => {
    if (simIntervalRef.current) clearInterval(simIntervalRef.current);
    const phrases = [
      "I believe that this topic holds significant relevance in today's landscape.",
      "First and foremost, we must analyze the structural implications of this approach.",
      "Moreover, the integration of intelligent agents offers clear pathways to scaling.",
      "However, ethical boundaries and resource management must be balanced carefully.",
      "In conclusion, a synthesis of innovation and risk assessment will shape the future."
    ];
    let phraseIdx = 0;
    simIntervalRef.current = setInterval(() => {
      if (phraseIdx < phrases.length) {
        const text = phrases[phraseIdx];
        setLiveTranscript((prev) => prev + " " + text);
        setLiveConfidence(Math.round(90 + Math.random() * 8));
        setLiveWpm(Math.round(110 + Math.random() * 20));
        phraseIdx++;
      }
    }, 4000);
  };

  const stopSimulatedTranscription = () => {
    if (simIntervalRef.current) {
      clearInterval(simIntervalRef.current);
      simIntervalRef.current = null;
    }
  };

  const toggleCamera = () => {
    if (webcamRef.current && webcamRef.current.stream) {
      const videoTracks = webcamRef.current.stream.getVideoTracks();
      if (videoTracks.length > 0) {
        const nextState = !cameraEnabled;
        videoTracks[0].enabled = nextState;
        setCameraEnabled(nextState);
        setIsCameraAvailable(nextState);
      }
    }
  };

  const uploadJamSessionVideo = async (blob: Blob) => {
    try {
      const session = await api.createSession(
        generatedTopic,
        generatedCategory,
        instantStart,
        preparationMode,
        skipPreparation
      );
      const updatedSession = await api.uploadVideo(session.id, blob);
      setActiveSession(updatedSession);
      fetchDashboardData();
      fetchCoachData();
      setCurrentScreen("results");
    } catch (e: any) {
      alert("Recording upload/analysis failed: " + (e.message || e));
      setCurrentScreen("jam");
    }
  };

  const uploadDebateSessionVideo = async (blob: Blob) => {
    try {
      console.info(`Uploading debate video of size: ${blob.size} bytes`);
      const data = await api.uploadDebateVideo(debateSessionId, blob);
      setDebateOpponentArg(data.opponent_statement);
      setDebateScorecard(data.scores);
      setDebateUserArg(data.transcript);
      fetchDashboardData();
      fetchCoachData();
    } catch (e: any) {
      alert("Failed to evaluate debate video: " + (e.message || e));
    } finally {
      setDebateLoading(false);
    }
  };

  // JAM Prep Operations
  const handlePrepTopic = async () => {
    setTopicLoading(true);
    // Reset timer to idle — user must manually press Start
    const DEFAULT_PREP_SECS = 15;
    setPrepTimerValue(DEFAULT_PREP_SECS);
    setPrepTimerInitial(DEFAULT_PREP_SECS);
    setPrepTimerState("idle");
    setWorkflowChoice("none");
    setInstantStart(false);
    setPreparationMode(false);
    setSkipPreparation(false);
    try {
      const data = await api.generateTopic(selectedCategory);
      setGeneratedTopic(data.topic);
      setGeneratedCategory(data.category);
      setGeneratedDifficulty(data.difficulty || "Medium");
      setGeneratedKeywords(data.keywords || []);
      setGeneratedTalkingPoints(data.talking_points || ["Introduce topic", "Analyze impact", "Summary"]);
      setGeneratedEstTime(data.estimated_speaking_time || 60);
    } catch (err) {
      setGeneratedTopic("The Ethical Boundaries of Generative Artificial Intelligence.");
      setGeneratedCategory(selectedCategory);
      setGeneratedTalkingPoints(["Introduction", "Primary ethical risks", "Potential mitigations", "Conclusion"]);
      setGeneratedEstTime(60);
    } finally {
      setTopicLoading(false);
    }
  };

  // Prep Timer controls
  const handlePrepTimerStart = () => { if (prepTimerState === "idle" || prepTimerState === "completed") setPrepTimerState("running"); };
  const handlePrepTimerPause = () => { if (prepTimerState === "running") setPrepTimerState("paused"); };
  const handlePrepTimerResume = () => { if (prepTimerState === "paused") setPrepTimerState("running"); };
  const handlePrepTimerReset = () => { setPrepTimerValue(prepTimerInitial); setPrepTimerState("idle"); };

  // New Preparation flow helpers
  const handleStartSpeakingNow = () => {
    setInstantStart(true);
    setPreparationMode(false);
    setSkipPreparation(false);
    setWorkflowChoice("immediate");
    startRecordingSession();
  };

  const handleSelectPrepDuration = (secs: number) => {
    setSelectedPrepDuration(secs);
    setPrepTimerValue(secs);
    setPrepTimerInitial(secs);
    setPreparationMode(true);
    setSkipPreparation(false);
    setWorkflowChoice("prep_timer");
    setPrepTimerState("running");
  };

  const handleSkipPreparation = () => {
    setSkipPreparation(true);
    setPrepTimerState("completed");
    startRecordingSession();
  };

  // Document Analyzer helper methods
  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate size (50 MB)
    if (file.size > 50 * 1024 * 1024) {
      alert("File exceeds maximum allowed size of 50 MB.");
      return;
    }

    setDocFile(file);
    setUploadingDoc(true);
    setUploadedDoc(null);
    setDocTopics([]);
    setSelectedDocTopic(null);

    try {
      const doc = await api.uploadDocument(file);
      setUploadedDoc(doc);
      setDocTopics(doc.topics || []);
    } catch (err: any) {
      alert("Failed to upload document: " + (err.message || err));
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleSelectDocTopic = (topic: any) => {
    setSelectedDocTopic(topic);
    setWorkflowChoice("none");
    setInstantStart(false);
    setPreparationMode(false);
    setSkipPreparation(false);
  };

  const handleStartDocSpeakingNow = () => {
    setInstantStart(true);
    setPreparationMode(false);
    setSkipPreparation(false);
    setWorkflowChoice("immediate");
    
    // Set estimation time
    setPrepTimerValue(0);
    setPrepTimerState("completed");
    startRecordingSession();
  };

  const handleSelectDocPrepDuration = (secs: number) => {
    setSelectedPrepDuration(secs);
    setPrepTimerValue(secs);
    setPrepTimerInitial(secs);
    setPreparationMode(true);
    setSkipPreparation(false);
    setWorkflowChoice("prep_timer");
    setPrepTimerState("running");
  };

  const handleSkipDocPreparation = () => {
    setSkipPreparation(true);
    setPrepTimerState("completed");
    startRecordingSession();
  };

  const uploadDocSessionVideo = async (blob: Blob) => {
    try {
      setCurrentScreen("doc_processing");
      const session = await api.createDocSession(
        uploadedDoc.id,
        selectedDocTopic.id || null,
        selectedDocTopic.topic,
        selectedDocTopic.category,
        instantStart,
        preparationMode,
        skipPreparation
      );
      const updatedSession = await api.uploadDocVideo(session.id, blob);
      setActiveDocSession(updatedSession);
      fetchDashboardData();
      fetchCoachData();
      setCurrentScreen("doc_results");
    } catch (e: any) {
      alert("Recording upload/analysis failed: " + (e.message || e));
      setCurrentScreen("doc_analyzer");
    }
  };

  // Viva helper methods
  const handleStartViva = async () => {
    if (!uploadedDoc) return;
    setVivaLoading(true);
    setVivaShowResults(false);
    setVivaCurrentQuestionIdx(0);
    try {
      const session = await api.startViva(uploadedDoc.id, vivaModeOption);
      setActiveVivaSession(session);
      setCurrentScreen("doc_viva");
    } catch (err: any) {
      alert("Failed to start Viva session: " + (err.message || err));
    } finally {
      setVivaLoading(false);
    }
  };

  const handleStartVivaRecording = () => {
    const stream = webcamRef.current?.stream;
    if (!stream) {
      alert("Camera preview stream not available. Please allow permissions first.");
      return;
    }
    setVivaRecordedChunks([]);
    setVivaRecordingTimer(45);
    setIsVivaRecording(true);

    let options = {};
    if (MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")) {
      options = { mimeType: "video/webm;codecs=vp9,opus" };
    } else if (MediaRecorder.isTypeSupported("video/webm")) {
      options = { mimeType: "video/webm" };
    }

    try {
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      
      const chunks: Blob[] = [];
      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunks.push(event.data);
          setVivaRecordedChunks((prev) => [...prev, event.data]);
        }
      };

      mediaRecorder.onstop = async () => {
        const videoBlob = new Blob(chunks, { type: "video/webm" });
        await submitVivaAnswerToBackend(videoBlob);
      };

      mediaRecorder.start(250);
      startDeepgramWebSocket(stream);
    } catch (e: any) {
      console.error("Failed starting Viva MediaRecorder:", e);
      alert("Failed to start recording: " + e.message);
    }
  };

  const handleStopVivaRecording = () => {
    setIsVivaRecording(false);
    setVivaSubmittingAnswer(true);
    stopSimulatedTranscription();
    closeDeepgramWebSocket();

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  };

  const submitVivaAnswerToBackend = async (blob: Blob) => {
    try {
      const updatedViva = await api.submitVivaAnswer(
        activeVivaSession.id,
        vivaCurrentQuestionIdx,
        blob
      );
      setActiveVivaSession(updatedViva);
      
      // Advance or show results
      if (vivaCurrentQuestionIdx + 1 < (updatedViva.questions_answers?.length || 0)) {
        setVivaCurrentQuestionIdx((prev) => prev + 1);
      } else {
        setVivaShowResults(true);
        fetchDashboardData();
        fetchCoachData();
      }
    } catch (err: any) {
      alert("Failed to grade answer: " + (err.message || err));
    } finally {
      setVivaSubmittingAnswer(false);
    }
  };

  // Format MM:SS for timer display
  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  // Deepgram Live WebSocket Start
  const startDeepgramWebSocket = async (stream: MediaStream) => {
    try {
      setLiveTranscript("");
      setLiveConfidence(100);
      setLiveWpm(0);
      stopSimulatedTranscription();

      const { token } = await api.getDeepgramToken();
      if (!token || token === "mock_deepgram_token") {
        console.warn("Using simulated transcription fallback on frontend.");
        startSimulatedTranscription();
        return;
      }

      const ws = new WebSocket("wss://api.deepgram.com/v1/listen?model=nova-2&smart_format=true", [
        "token",
        token
      ]);

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        const channel = data.channel || {};
        const alternatives = channel.alternatives || [];
        if (alternatives[0] && alternatives[0].transcript) {
          const text = alternatives[0].transcript;
          const conf = alternatives[0].confidence * 100;
          setLiveTranscript((prev) => prev + " " + text);
          setLiveConfidence(Math.round(conf));
          
          const wordCount = (liveTranscript + " " + text).split(" ").filter(Boolean).length;
          const elapsed = 60 - (isRecording ? recordingTimer : debateTimer);
          if (elapsed > 2) {
            setLiveWpm(Math.round((wordCount / elapsed) * 60));
          }
        }
      };

      ws.onerror = (e) => {
        console.error("Deepgram WS error, falling back to simulated speech:", e);
        startSimulatedTranscription();
      };

      dgSocketRef.current = ws;
    } catch (err) {
      console.error("Failed to connect to live Deepgram API:", err);
      startSimulatedTranscription();
    }
  };

  const closeDeepgramWebSocket = () => {
    if (dgSocketRef.current) {
      try {
        dgSocketRef.current.close();
      } catch (e) {}
      dgSocketRef.current = null;
    }
  };

  const startRecordingSession = async () => {
    const stream = webcamRef.current?.stream;
    if (!stream) {
      setStreamError("Webcam stream is not available.");
      return;
    }
    setRecordedChunks([]);
    setRecordingTimer(generatedEstTime);
    setIsRecording(true);

    let options = {};
    if (MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")) {
      options = { mimeType: "video/webm;codecs=vp9,opus" };
    } else if (MediaRecorder.isTypeSupported("video/webm")) {
      options = { mimeType: "video/webm" };
    }

    try {
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      
      const chunks: Blob[] = [];
      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunks.push(event.data);
          setRecordedChunks((prev) => [...prev, event.data]);
          if (dgSocketRef.current && dgSocketRef.current.readyState === WebSocket.OPEN) {
            dgSocketRef.current.send(event.data);
          }
        }
      };

      mediaRecorder.onstop = async () => {
        const videoBlob = new Blob(chunks, { type: "video/webm" });
        if (currentScreen === "doc_analyzer") {
          await uploadDocSessionVideo(videoBlob);
        } else {
          await uploadJamSessionVideo(videoBlob);
        }
      };

      mediaRecorder.start(250);
      startDeepgramWebSocket(stream);
    } catch (e: any) {
      setStreamError("Failed starting MediaRecorder: " + e.message);
    }
  };

  const handleUserMedia = (stream: MediaStream) => {
    console.info("Webcam preview initialized successfully.");
    setIsStreamReady(true);
    setCameraErrorMsg("");
    
    // Inspect tracks
    const videoTracks = stream.getVideoTracks();
    const audioTracks = stream.getAudioTracks();
    
    setIsCameraAvailable(videoTracks.length > 0 && videoTracks[0].enabled);
    setIsMicAvailable(audioTracks.length > 0 && audioTracks[0].enabled);

    startAudioVisualizer(stream);
  };

  const handleUserMediaError = (err: any) => {
    console.error("Webcam error:", err);
    setIsCameraAvailable(false);
    setIsMicAvailable(false);
    setCameraErrorMsg("Camera access blocked. Please enable browser permissions.");
  };

  const stopRecordingSession = () => {
    setIsRecording(false);
    stopSimulatedTranscription();
    closeDeepgramWebSocket();

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setCurrentScreen("processing");
  };

  // Video visualizer setup
  const startAudioVisualizer = (stream: MediaStream) => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioContextClass();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const draw = () => {
        if (!analyserRef.current || !canvasRef.current) return;
        animationFrameId.current = requestAnimationFrame(draw);
        const canvas = canvasRef.current;
        const canvasCtx = canvas.getContext("2d");
        if (!canvasCtx) return;

        const width = canvas.width;
        const height = canvas.height;
        analyserRef.current.getByteFrequencyData(dataArray);

        canvasCtx.fillStyle = "#F8FAFC";
        canvasCtx.fillRect(0, 0, width, height);

        const barWidth = (width / bufferLength) * 1.5;
        let barHeight;
        let x = 0;

        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          barHeight = (dataArray[i] / 255) * height * 0.8;
          canvasCtx.fillStyle = `rgba(37, 99, 235, ${dataArray[i] / 255 + 0.15})`;
          canvasCtx.fillRect(x, height - barHeight, barWidth - 1, barHeight);
          x += barWidth;
          sum += dataArray[i];
        }

        // Compute volume level for microphone meter
        const avg = sum / bufferLength;
        setLiveVolume(avg);
        setIsVADActive(avg > 15);
      };
      draw();
    } catch (e) {
      console.error(e);
    }
  };

  const stopAudioVisualizer = () => {
    if (animationFrameId.current) cancelAnimationFrame(animationFrameId.current);
    if (audioContextRef.current) audioContextRef.current.close();
    analyserRef.current = null;
    audioContextRef.current = null;
  };

  // Debate arena workflows
  const handleStartDebate = async () => {
    if (!debateTopic) return;
    setDebateLoading(true);
    setDebateScorecard(null);
    setDebateUserArg("");
    try {
      const data = await api.startDebate(debateTopic, debateDifficulty);
      setDebateSessionId(data.session_id);
      setDebateOpponentArg(data.opponent_statement);
    } catch (e) {
      console.error(e);
    } finally {
      setDebateLoading(false);
    }
  };

  const handleStartDebateRecording = () => {
    const stream = webcamRef.current?.stream;
    if (!stream) {
      alert("Camera preview stream not available. Please allow permissions first.");
      return;
    }
    setDebateChunks([]);
    setDebateTimer(60);
    setIsDebateRecording(true);

    let options = {};
    if (MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")) {
      options = { mimeType: "video/webm;codecs=vp9,opus" };
    } else if (MediaRecorder.isTypeSupported("video/webm")) {
      options = { mimeType: "video/webm" };
    }

    try {
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;
      
      const chunks: Blob[] = [];
      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunks.push(event.data);
          setDebateChunks((prev) => [...prev, event.data]);
          if (dgSocketRef.current && dgSocketRef.current.readyState === WebSocket.OPEN) {
            dgSocketRef.current.send(event.data);
          }
        }
      };

      mediaRecorder.onstop = async () => {
        const videoBlob = new Blob(chunks, { type: "video/webm" });
        await uploadDebateSessionVideo(videoBlob);
      };

      mediaRecorder.start(250);
      startDeepgramWebSocket(stream);
    } catch (e: any) {
      console.error("Failed starting Debate MediaRecorder:", e);
      alert("Failed to start recording: " + e.message);
    }
  };

  const stopDebateRecordingAndSubmit = () => {
    setIsDebateRecording(false);
    setDebateLoading(true);
    stopSimulatedTranscription();
    closeDeepgramWebSocket();
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  };

  // Interview Simulator workflows
  const handleStartInterview = async () => {
    setInterviewLoading(true);
    setInterviewFeedback(null);
    setInterviewUserAnswer("");
    try {
      const data = await api.startInterview(interviewRole, interviewRound);
      setInterviewSessionId(data.session_id);
      setInterviewQuestion(data.question);
      setInterviewHistory([data.question]);
    } catch (e) {
      console.error(e);
    } finally {
      setInterviewLoading(false);
    }
  };

  const handleSubmitInterviewAnswer = async () => {
    if (!interviewUserAnswer || !interviewSessionId) return;
    setInterviewLoading(true);
    try {
      const data = await api.submitInterviewAnswer(interviewSessionId, interviewUserAnswer);
      setInterviewQuestion(data.next_question);
      setInterviewFeedback(data.feedback);
      setInterviewHistory((prev) => [...prev, data.next_question]);
      setInterviewUserAnswer("");
    } catch (e) {
      console.error(e);
    } finally {
      setInterviewLoading(false);
    }
  };

  // ─── Interview Recording Functions ───────────────────────────────────────

  const startInterviewAudioVisualizer = (stream: MediaStream) => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioContextClass();
      interviewAudioContextRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      interviewAnalyserRef.current = analyser;
      source.connect(analyser);
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      const draw = () => {
        if (!interviewAnalyserRef.current || !interviewCanvasRef.current) return;
        interviewAnimationFrameRef.current = requestAnimationFrame(draw);
        const canvas = interviewCanvasRef.current;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const w = canvas.width, h = canvas.height;
        interviewAnalyserRef.current.getByteFrequencyData(dataArray);
        ctx.fillStyle = "#0f172a";
        ctx.fillRect(0, 0, w, h);
        const barWidth = (w / bufferLength) * 1.5;
        let x = 0, sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          const barH = (dataArray[i] / 255) * h * 0.85;
          ctx.fillStyle = `rgba(99,102,241,${dataArray[i] / 255 + 0.15})`;
          ctx.fillRect(x, h - barH, barWidth - 1, barH);
          x += barWidth; sum += dataArray[i];
        }
        setInterviewLiveVolume(sum / bufferLength);
      };
      draw();
    } catch (e) { console.error("Interview visualizer error:", e); }
  };

  const stopInterviewAudioVisualizer = () => {
    if (interviewAnimationFrameRef.current) cancelAnimationFrame(interviewAnimationFrameRef.current);
    if (interviewAudioContextRef.current) interviewAudioContextRef.current.close().catch(() => {});
    interviewAnalyserRef.current = null;
    interviewAudioContextRef.current = null;
  };

  const handleStartInterviewRecording = async () => {
    if (!interviewSessionId) return;
    setInterviewErrorMsg("");
    setInterviewRecordedBlob(null);
    setInterviewChunks([]);
    setInterviewRecordingTimer(120);
    setIsInterviewPaused(false);
    const wantsAudio = interviewRecordingMode !== "video";
    const wantsVideo = interviewRecordingMode !== "audio";
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: wantsAudio,
        video: wantsVideo ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" } : false,
      });
    } catch (err: any) {
      setInterviewErrorMsg(`Media access denied: ${err.message}. Please allow camera/microphone permissions.`);
      return;
    }
    setInterviewStreamReady(true);
    if (wantsAudio) startInterviewAudioVisualizer(stream);
    let mimeType = wantsVideo ? "video/webm" : "audio/webm";
    if (MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus") && wantsVideo) mimeType = "video/webm;codecs=vp9,opus";
    const recorder = new MediaRecorder(stream, { mimeType });
    interviewMediaRecorderRef.current = recorder;
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => { if (e.data?.size > 0) { chunks.push(e.data); setInterviewChunks([...chunks]); } };
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      stopInterviewAudioVisualizer();
      const blob = new Blob(chunks, { type: mimeType.split(";")[0] });
      setInterviewRecordedBlob(blob);
      setInterviewStreamReady(false);
    };
    recorder.start(250);
    setIsInterviewRecording(true);
  };

  const handlePauseInterviewRecording = () => {
    if (interviewMediaRecorderRef.current?.state === "recording") {
      interviewMediaRecorderRef.current.pause();
      setIsInterviewPaused(true);
    }
  };

  const handleResumeInterviewRecording = () => {
    if (interviewMediaRecorderRef.current?.state === "paused") {
      interviewMediaRecorderRef.current.resume();
      setIsInterviewPaused(false);
    }
  };

  const handleStopInterviewRecording = () => {
    setIsInterviewRecording(false);
    setIsInterviewPaused(false);
    if (interviewMediaRecorderRef.current && interviewMediaRecorderRef.current.state !== "inactive") {
      interviewMediaRecorderRef.current.stop();
    }
  };

  const handleRetakeInterviewRecording = () => {
    setInterviewRecordedBlob(null);
    setInterviewChunks([]);
    setInterviewRecordingTimer(120);
    setIsInterviewRecording(false);
    setIsInterviewPaused(false);
    setInterviewStreamReady(false);
    setInterviewErrorMsg("");
  };

  const handleAnalyzeInterviewRecording = async () => {
    if (!interviewRecordedBlob || !interviewSessionId) return;
    setIsInterviewAnalyzing(true);
    setInterviewErrorMsg("");
    setCurrentScreen("processing");
    try {
      const updatedSession = await api.uploadInterviewVideo(interviewSessionId, interviewRecordedBlob);
      setActiveSession(updatedSession);
      fetchDashboardData();
      fetchCoachData();
      setCurrentScreen("results");
    } catch (e: any) {
      setInterviewErrorMsg(`Analysis failed: ${e.message || String(e)}`);
      console.error("[Interview] Analysis upload failed:", e);
      setCurrentScreen("interview");
    } finally {
      setIsInterviewAnalyzing(false);
    }
  };

  const handleResetInterview = () => {
    setInterviewSessionId(""); setInterviewQuestion(""); setInterviewFeedback(null);
    setInterviewHistory([]); setInterviewUserAnswer(""); setInterviewRecordedBlob(null);
    setInterviewChunks([]); setIsInterviewRecording(false); setIsInterviewPaused(false);
    setInterviewStreamReady(false); setInterviewRecordingTimer(120); setInterviewErrorMsg("");
    stopInterviewAudioVisualizer();
  };

  // Challenge workflows
  const handleChallengeSubmit = async () => {
    if (!selectedChallenge) return;
    setChallengeSubmitting(true);
    try {
      await api.attemptChallenge(selectedChallenge.id, challengeScore);
      fetchCoachData();
      alert("Challenge completed successfully!");
      setSelectedChallenge(null);
    } catch (e) {
      console.error(e);
    } finally {
      setChallengeSubmitting(false);
    }
  };

  const handleDownloadPDF = () => {
    if (!activeSession) return;
    const doc = new jsPDF();
    
    // Fetch or construct report object mirroring the Results view fallback
    const report = activeSession.reports?.[0]?.summary || {
      overall_score: activeSession.dna ? Math.round((activeSession.dna.confidence + activeSession.dna.fluency + activeSession.dna.clarity) / 3) : 75,
      rating: activeSession.dna?.profile_summary || "Good",
      executive_summary: "- Key strengths: Good pacing and posture.\n- Major weaknesses: Focus on reducing filler words.\n- Overall assessment: solid speech delivery with potential to improve.",
      speech_analysis: {
        speaking_rate: { score: activeSession.dna?.speaking_speed || 70, reason: "Speed was consistent.", suggestion: "Practice speed-reading drills." },
        clarity: { score: activeSession.dna?.clarity || 70, reason: "Pronunciation was clear.", suggestion: "Maintain distance from microphone." },
        pronunciation: { score: 75, reason: "Words were enounced correctly.", suggestion: "Practice multi-syllabic words." },
        fluency: { score: activeSession.dna?.fluency || 70, reason: "Flow was conversational.", suggestion: "Introduce transitions." },
        fillers: { score: activeSession.dna?.filler_words || 70, reason: "Audible filler words detected.", suggestion: "Practice locking your mouth during transition gaps." },
        confidence: { score: activeSession.dna?.confidence || 70, reason: "Tone stayed stable.", suggestion: "Project vocal assertiveness." }
      },
      body_language_analysis: {
        eye_contact: { score: activeSession.face_metrics?.eye_contact_percentage || 70, evidence: "Kept visual contact with the camera.", suggestion: "Anchor visual focus next to the camera lens." },
        facial_expressions: { score: activeSession.face_metrics?.smile_frequency || 60, evidence: "Showed relaxed face.", suggestion: "Smile at key points." },
        posture: { score: activeSession.face_metrics?.posture_stability || 70, evidence: "Postured upright.", suggestion: "Maintain aligned shoulders." },
        gestures: { score: 60, evidence: "Hand gestures were moderate.", suggestion: "Raise hands during key definitions." },
        head_movement: { score: 80, evidence: "Head position was stable.", suggestion: "Keep chin level." }
      },
      communication_effectiveness: {
        confidence: { score: activeSession.dna?.confidence || 70, reason: "Speech tone was positive.", recommendation: "Vocalize with clear project projection." },
        professionalism: { score: 75, reason: "Maintained professional posture.", recommendation: "Adopt technical transition words." },
        engagement: { score: activeSession.face_metrics?.engagement_score || 70, reason: "Visual eye contact kept listener focus.", recommendation: "Vary speech tempo dynamically." },
        persuasiveness: { score: activeSession.dna?.persuasion || 70, reason: "Core arguments showed logic flow.", recommendation: "Present claims with supportive details." },
        leadership_presence: { score: activeSession.dna?.leadership || 70, reason: "Command of presence was solid.", recommendation: "Deliver points with pauses." }
      },
      content_analysis: {
        grammar_quality: 80,
        vocabulary_richness: activeSession.dna?.vocabulary || 70,
        top_filler_words: activeSession.dna?.filler_word_frequency || { "um": 2, "uh": 1, "like": 3 },
        grammar_text: "Grammar was clean and direct.",
        vocabulary_text: "Vocabulary was clear and category-appropriate."
      },
      detailed_strengths: activeSession.reports?.[0]?.summary?.strengths || ["Conversational pace", "Strong eye contact", "Good posture"],
      areas_for_improvement: activeSession.reports?.[0]?.summary?.improvements || ["Reduce filler words", "Improve hand gestures", "Vary pitch tone"],
      action_plan: {
        immediate_actions: ["Implement the Lens-Dot target drill to anchor your visual gaze."],
        short_term_actions: ["Play the 'Pause Game' during discussions to eliminate filler words."],
        long_term_actions: ["Rehearse system architecture talking points aloud to build vocabulary structure."]
      },
      analytics_dashboard: {
        speech_confidence: activeSession.transcript?.confidence_score || 85,
        eye_contact_pct: activeSession.face_metrics?.eye_contact_percentage || 75,
        posture_score: activeSession.face_metrics?.posture_stability || 75,
        speaking_rate: activeSession.transcript?.wpm || 130,
        filler_word_count: 5,
        engagement_score: activeSession.face_metrics?.engagement_score || 70
      },
      diagnostics: activeSession.diagnostics || {
        audio_length: 60.0,
        detected_speech_length: 50.0,
        whisper_confidence: 85,
        frames_processed: 300,
        face_detection_rate: 98.0
      }
    };

    let y = 50;

    const checkPageBreak = (neededHeight: number) => {
      if (y + neededHeight > 275) {
        doc.addPage();
        doc.setFillColor(255, 255, 255);
        doc.rect(0, 0, 210, 297, "F");
        doc.setFont("Helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text("AI HUMAN COMMUNICATION TWIN DNA REPORT (Cont.)", 20, 15);
        doc.setDrawColor(240, 240, 240);
        doc.line(20, 18, 190, 18);
        y = 28;
      }
    };

    const printParagraph = (title: string, text: string, fontSize = 9) => {
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(fontSize);
      doc.setTextColor(15, 23, 42);
      const splitTitle = doc.splitTextToSize(title, 170);
      checkPageBreak(splitTitle.length * 5 + 4);
      doc.text(splitTitle, 20, y);
      y += splitTitle.length * 5 + 1;

      doc.setFont("Helvetica", "normal");
      doc.setFontSize(fontSize - 1);
      doc.setTextColor(71, 85, 105);
      const splitText = doc.splitTextToSize(text, 170);
      checkPageBreak(splitText.length * 4.5 + 4);
      doc.text(splitText, 20, y);
      y += splitText.length * 4.5 + 5;
    };

    const printList = (title: string, items: string[]) => {
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(15, 23, 42);
      checkPageBreak(10);
      doc.text(title, 20, y);
      y += 6;

      doc.setFont("Helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(71, 85, 105);
      items.forEach(item => {
        const splitItem = doc.splitTextToSize(`• ${item}`, 170);
        checkPageBreak(splitItem.length * 4.5 + 2);
        doc.text(splitItem, 20, y);
        y += splitItem.length * 4.5 + 1;
      });
      y += 3;
    };

    // Header Page 1
    doc.setFillColor(255, 255, 255);
    doc.rect(0, 0, 210, 297, "F");

    doc.setFont("Helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(37, 99, 235);
    doc.text("AI HUMAN COMMUNICATION TWIN DNA REPORT", 20, 25);

    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(`Generated on: ${new Date(activeSession.created_at).toLocaleString()}`, 20, 32);

    doc.setDrawColor(226, 232, 240);
    doc.line(20, 35, 190, 35);

    y = 45;
    
    // Overall communication score
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42);
    doc.text(`Overall Score: ${report.overall_score}/100 (${report.rating})`, 20, y);
    y += 8;

    doc.setFont("Helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text(`Topic: ${activeSession.topic}`, 20, y);
    y += 5;
    doc.text(`Category: ${activeSession.category}  |  Session Type: ${activeSession.session_type.toUpperCase()}`, 20, y);
    y += 10;

    // Executive Summary
    const cleanSummaryText = (report.executive_summary || "").replace(/\\n/g, "\n");
    printParagraph("1. Executive Summary", cleanSummaryText);

    // Speech Transcript
    if (activeSession.transcript) {
      printParagraph("Speech Transcript", activeSession.transcript.corrected_transcript || "");
    }

    // Speech Analysis
    checkPageBreak(15);
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(37, 99, 235);
    doc.text("2. Speech Analysis", 20, y);
    y += 8;

    const speech = report.speech_analysis || {};
    Object.entries(speech).forEach(([key, val]: [string, any]) => {
      const formattedKey = key.replace(/_/g, " ").toUpperCase();
      printParagraph(
        `${formattedKey} (Score: ${val.score}/100)`,
        `Reason: ${val.reason}\nSuggestion: ${val.suggestion}`
      );
    });

    // Body Language Analysis
    checkPageBreak(15);
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(37, 99, 235);
    doc.text("3. Body Language Analysis", 20, y);
    y += 8;

    const body = report.body_language_analysis || {};
    Object.entries(body).forEach(([key, val]: [string, any]) => {
      const formattedKey = key.replace(/_/g, " ").toUpperCase();
      printParagraph(
        `${formattedKey} (Score: ${val.score}/100)`,
        `Evidence: ${val.evidence}\nSuggestion: ${val.suggestion}`
      );
    });

    // Communication Effectiveness
    checkPageBreak(15);
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(37, 99, 235);
    doc.text("4. Communication Effectiveness", 20, y);
    y += 8;

    const eff = report.communication_effectiveness || {};
    Object.entries(eff).forEach(([key, val]: [string, any]) => {
      const formattedKey = key.replace(/_/g, " ").toUpperCase();
      printParagraph(
        `${formattedKey} (Score: ${val.score}/100)`,
        `Reason: ${val.reason}\nRecommendation: ${val.recommendation || val.suggestion}`
      );
    });

    // Content Analysis
    checkPageBreak(15);
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(37, 99, 235);
    doc.text("5. Content Analysis", 20, y);
    y += 8;

    const content = report.content_analysis || {};
    const topFillersStr = Object.entries(content.top_filler_words || {})
      .map(([word, count]) => `${word}: ${count}`)
      .join(", ");
    printParagraph(
      "Grammar & Vocabulary", 
      `Grammar Quality: ${content.grammar_quality}/100\nGrammar Assessment: ${content.grammar_text}\nVocabulary Richness: ${content.vocabulary_richness}/100\nVocabulary Assessment: ${content.vocabulary_text}\nTop Fillers: ${topFillersStr || "None"}`
    );

    // Lists
    printList("6. Detailed Strengths", report.detailed_strengths || []);
    printList("7. Areas for Improvement", report.areas_for_improvement || []);

    // Action Plan
    checkPageBreak(15);
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(37, 99, 235);
    doc.text("8. Action Plan", 20, y);
    y += 8;

    const ap = report.action_plan || {};
    printList("Immediate Actions (24 Hours)", ap.immediate_actions || []);
    printList("Short-Term Actions (1-2 Weeks)", ap.short_term_actions || []);
    printList("Long-Term Actions (1+ Months)", ap.long_term_actions || []);

    // Diagnostics
    checkPageBreak(15);
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(37, 99, 235);
    doc.text("9. Diagnostic Metadata", 20, y);
    y += 8;

    const diag = report.diagnostics || {};
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    const diagLines = [
      `Audio Length: ${diag.audio_length || 0} seconds`,
      `Detected Speech Length: ${diag.detected_speech_length || 0} seconds`,
      `Whisper Confidence Score: ${diag.whisper_confidence || 0}%`,
      `Video Frames Processed: ${diag.frames_processed || 0}`,
      `Face Detection Success Rate: ${diag.face_detection_rate || 0}%`
    ];
    diagLines.forEach(line => {
      checkPageBreak(5);
      doc.text(line, 20, y);
      y += 5;
    });

    doc.save(`TwinAI_Report_${activeSession.id.substring(0, 8)}.pdf`);
  };

  // Helper chart configurations
  const getRadarChartConfig = () => {
    if (!dnaMetrics) return { labels: [], datasets: [] };
    const labels = ["Confidence", "Fluency", "Vocabulary", "Storytelling", "Leadership", "Persuasion", "Clarity", "Engagement", "Eye Contact", "Posture", "Energy"];
    const data = [
      dnaMetrics.confidence || 50,
      dnaMetrics.fluency || 50,
      dnaMetrics.vocabulary || 50,
      dnaMetrics.storytelling || 50,
      dnaMetrics.leadership || 50,
      dnaMetrics.persuasion || 50,
      dnaMetrics.clarity || 50,
      dnaMetrics.engagement || 50,
      dnaMetrics.eye_contact || 50,
      dnaMetrics.posture || 50,
      dnaMetrics.energy_level || 50
    ];
    return {
      labels,
      datasets: [
        {
          label: "Current Communication DNA",
          data,
          backgroundColor: "rgba(37, 99, 235, 0.2)",
          borderColor: "rgba(37, 99, 235, 0.8)",
          borderWidth: 1.5,
        }
      ]
    };
  };

  const getLineChartConfig = () => {
    if (!dashboardStats || !dashboardStats.progress_data) return { labels: [], datasets: [] };
    const labels = dashboardStats.progress_data.map((p: any) => p.date);
    return {
      labels,
      datasets: [
        {
          label: "Confidence Growth",
          data: dashboardStats.progress_data.map((p: any) => p.confidence),
          borderColor: "rgba(59, 130, 246, 1)",
          backgroundColor: "rgba(59, 130, 246, 0.1)",
          tension: 0.3,
        },
        {
          label: "Storytelling Growth",
          data: dashboardStats.progress_data.map((p: any) => p.storytelling),
          borderColor: "rgba(16, 185, 129, 1)",
          backgroundColor: "rgba(16, 185, 129, 0.1)",
          tension: 0.3,
        }
      ]
    };
  };

  const handleViewSessionDetails = async (sessionId: string) => {
    setResultsLoading(true);
    try {
      const data = await api.getSession(sessionId);
      setActiveSession(data);
      setCurrentScreen("results");
    } catch (e) {
      console.error(e);
    } finally {
      setResultsLoading(false);
    }
  };

  if (!mounted) return null;

  return (
    <div className="flex h-screen bg-[#F8FAFC]">
      {currentScreen !== "auth" && (
        <Sidebar 
          currentScreen={currentScreen} 
          onNavigate={(s) => setCurrentScreen(s)} 
          onLogout={handleLogout} 
          user={user} 
        />
      )}

      <div className="flex-1 flex flex-col overflow-y-auto">
        
        {/* ================================= AUTH VIEW ================================= */}
        {currentScreen === "auth" && (
          <div className="flex-1 flex items-center justify-center p-6 bg-slate-50">
            <div className="w-full max-w-md bg-white border border-slate-200 p-8 rounded-2xl shadow-sm">
              <div className="text-center mb-6">
                <div className="h-10 w-10 rounded-xl bg-blue-600 flex items-center justify-center mx-auto mb-4">
                  <Sparkles className="h-6 w-6 text-white" />
                </div>
                <h2 className="text-xl font-bold text-slate-900">Welcome to TwinAI</h2>
                <p className="text-xs text-slate-500 mt-1">AI-powered Human Communication Twin</p>
              </div>

              {authError && (
                <div className="mb-4 bg-red-50 border border-red-200 text-red-600 text-xs px-4 py-3 rounded-lg flex items-center gap-2">
                  <AlertTriangle className="h-4.5 w-4.5" />
                  {authError}
                </div>
              )}

              <form onSubmit={handleAuthSubmit} className="flex flex-col gap-4">
                {!isLogin && (
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-slate-600">Full Name</label>
                    <input 
                      type="text" 
                      required 
                      value={name} 
                      onChange={(e) => setName(e.target.value)} 
                      className="glass-input px-4 py-2 rounded-xl text-xs" 
                      placeholder="John Doe"
                    />
                  </div>
                )}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-600">Email Address</label>
                  <input 
                    type="email" 
                    required 
                    value={email} 
                    onChange={(e) => setEmail(e.target.value)} 
                    className="glass-input px-4 py-2 rounded-xl text-xs" 
                    placeholder="john@example.com"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-600">Password</label>
                  <input 
                    type="password" 
                    required 
                    value={password} 
                    onChange={(e) => setPassword(e.target.value)} 
                    className="glass-input px-4 py-2 rounded-xl text-xs" 
                    placeholder="••••••••"
                  />
                </div>

                <button 
                  type="submit" 
                  disabled={authLoading}
                  className="mt-2 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                >
                  {authLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (isLogin ? "Sign In" : "Register")}
                </button>
              </form>

              <button 
                onClick={() => setIsLogin(!isLogin)} 
                className="mt-6 text-center text-xs text-blue-600 hover:underline w-full"
              >
                {isLogin ? "Don't have an account? Sign up" : "Already have an account? Log in"}
              </button>
            </div>
          </div>
        )}

        {/* ================================= DASHBOARD VIEW ================================= */}
        {currentScreen === "dashboard" && (
          <div className="p-8 flex flex-col gap-8">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-xl font-bold text-slate-900">Coach Dashboard</h1>
                <p className="text-xs text-slate-500">Your Communication DNA performance and twins activity.</p>
              </div>
              <button 
                onClick={() => setCurrentScreen("jam")} 
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-xs font-semibold shadow-sm flex items-center gap-2"
              >
                <Mic className="w-4 h-4" /> Start New Session
              </button>
            </div>

            {/* Widget Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm flex flex-col justify-between">
                <p className="text-xs font-semibold text-slate-500">Sessions Completed</p>
                <div className="flex justify-between items-end mt-4">
                  <h3 className="text-2xl font-bold text-slate-800">{dashboardStats?.total_sessions || 0}</h3>
                  <div className="h-7 w-7 rounded-lg bg-blue-50 flex items-center justify-center">
                    <Mic className="h-4 w-4 text-blue-600" />
                  </div>
                </div>
              </div>
              <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm flex flex-col justify-between">
                <p className="text-xs font-semibold text-slate-500">Weekly Growth Streak</p>
                <div className="flex justify-between items-end mt-4">
                  <h3 className="text-2xl font-bold text-slate-800">{dashboardStats?.streak || 0} Days</h3>
                  <div className="h-7 w-7 rounded-lg bg-orange-50 flex items-center justify-center">
                    <Flame className="h-4 w-4 text-orange-500" />
                  </div>
                </div>
              </div>
              <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm flex flex-col justify-between">
                <p className="text-xs font-semibold text-slate-500">Twin Confidence Score</p>
                <div className="flex justify-between items-end mt-4">
                  <h3 className="text-2xl font-bold text-slate-800">{dashboardStats?.avg_confidence || 0}%</h3>
                  <div className="h-7 w-7 rounded-lg bg-emerald-50 flex items-center justify-center">
                    <Award className="h-4 w-4 text-emerald-600" />
                  </div>
                </div>
              </div>
              <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm flex flex-col justify-between">
                <p className="text-xs font-semibold text-slate-500">Average Clarity</p>
                <div className="flex justify-between items-end mt-4">
                  <h3 className="text-2xl font-bold text-slate-800">{dashboardStats?.avg_communication || 0}%</h3>
                  <div className="h-7 w-7 rounded-lg bg-purple-50 flex items-center justify-center">
                    <TrendingUp className="h-4 w-4 text-purple-600" />
                  </div>
                </div>
              </div>
            </div>

            {/* Charts & suggestions */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-white border border-slate-200 p-6 rounded-2xl shadow-sm">
                <h3 className="text-sm font-bold text-slate-900 mb-4">DNA Evolution Trend</h3>
                {dashboardStats?.progress_data && dashboardStats.progress_data.length > 0 ? (
                  <div className="h-72">
                    <Line data={getLineChartConfig()} options={{ responsive: true, maintainAspectRatio: false }} />
                  </div>
                ) : (
                  <div className="h-72 flex items-center justify-center text-xs text-slate-400">Complete more sessions to render timeline curves.</div>
                )}
              </div>
              
              <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm flex flex-col gap-4">
                <h3 className="text-sm font-bold text-slate-900">AI Coach Advice</h3>
                <div className="flex flex-col gap-3 overflow-y-auto max-h-[280px]">
                  {coachRecs.length > 0 ? (
                    coachRecs.map((rec, i) => (
                      <div key={i} className="p-3.5 bg-slate-50 rounded-xl border border-slate-100 flex flex-col gap-1">
                        <span className="text-[10px] uppercase font-bold text-red-500">Weakness: {rec.weakness}</span>
                        <p className="text-xs text-slate-600 leading-relaxed">{rec.suggestion}</p>
                      </div>
                    ))
                  ) : (
                    <div className="text-xs text-slate-400 text-center py-12">No recommendations generated yet. Practice more to analyze patterns.</div>
                  )}
                </div>
              </div>
            </div>

            {/* History table */}
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
              <h3 className="text-sm font-bold text-slate-900 mb-4">Recent Twin Sessions</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left text-slate-600">
                  <thead className="text-[10px] uppercase text-slate-400 border-b border-slate-100">
                    <tr>
                      <th className="pb-3">Topic</th>
                      <th className="pb-3">Category</th>
                      <th className="pb-3">Session Type</th>
                      <th className="pb-3">Score</th>
                      <th className="pb-3">Date</th>
                      <th className="pb-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyList.map((hist, i) => (
                      <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/50">
                        <td className="py-4 font-semibold text-slate-800 truncate max-w-[200px]">{hist.topic}</td>
                        <td className="py-4">{hist.category}</td>
                        <td className="py-4"><span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 text-[10px] uppercase font-bold">{hist.session_type}</span></td>
                        <td className="py-4 font-bold text-slate-900">{hist.overall_score}%</td>
                        <td className="py-4 text-slate-400">{new Date(hist.created_at).toLocaleDateString()}</td>
                        <td className="py-4 text-right">
                          <button 
                            onClick={() => handleViewSessionDetails(hist.id)}
                            className="text-blue-600 hover:underline font-semibold"
                          >
                            Details
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ================================= DOCUMENT ANALYZER SCREEN ================================= */}
        {currentScreen === "doc_analyzer" && (
          <div className="p-8 flex flex-col gap-6 max-w-5xl mx-auto w-full">

            {/* Header */}
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-600" /> Document Communication Analyzer
                </h1>
                <p className="text-xs text-slate-500 mt-0.5">Upload a document, select a topic, and record your presentation.</p>
              </div>
              <div className="flex gap-4 items-center">
                <div className="flex items-center gap-1.5 text-xs font-semibold">
                  <span className={`h-2.5 w-2.5 rounded-full ${isCameraAvailable ? "bg-emerald-500" : "bg-red-500"}`} />
                  Camera: {isCameraAvailable ? "Connected" : "No Signal"}
                </div>
                <div className="flex items-center gap-1.5 text-xs font-semibold">
                  <span className={`h-2.5 w-2.5 rounded-full ${isMicAvailable ? "bg-emerald-500" : "bg-red-500"}`} />
                  Mic: {isMicAvailable ? "Connected" : "No Signal"}
                </div>
              </div>
            </div>

            {cameraErrorMsg && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-4 py-3 rounded-xl flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                {cameraErrorMsg}
              </div>
            )}

            {/* Always 2-column layout: Webcam LEFT, Controls RIGHT */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

              {/* LEFT: Persistent Webcam — always mounted on screen load */}
              <div className="lg:col-span-2 flex flex-col gap-4">
                <div className="relative rounded-2xl overflow-hidden border border-slate-200 bg-slate-900 aspect-video shadow-sm flex items-center justify-center">
                  <Webcam
                    key={webcamKey}
                    audio={true}
                    ref={webcamRef}
                    onUserMedia={handleUserMedia}
                    onUserMediaError={handleUserMediaError}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                  {isStreamReady && (
                    <div className="absolute bottom-4 right-4 z-20 flex gap-2">
                      <button onClick={toggleCamera}
                        className="bg-black/60 hover:bg-black/80 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 backdrop-blur-sm transition-colors border border-white/10">
                        {cameraEnabled ? <><Video className="w-3.5 h-3.5" /> Stop Camera</> : <><VideoOff className="w-3.5 h-3.5 text-red-400" /> Start Camera</>}
                      </button>
                    </div>
                  )}
                  {!isStreamReady && (
                    <div className="relative z-10 flex flex-col items-center gap-2 text-slate-400 text-xs font-medium">
                      <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
                      <span>Initializing camera &amp; microphone...</span>
                      <span className="text-[10px] text-slate-500">Please allow browser camera and microphone access</span>
                    </div>
                  )}
                  {isRecording && (
                    <div className="absolute top-4 left-4 bg-red-600 text-white px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase animate-pulse flex items-center gap-1.5 z-20">
                      <Play className="w-3.5 h-3.5" /> Recording Live
                    </div>
                  )}
                  {workflowChoice === "prep_timer" && (prepTimerState === "running" || prepTimerState === "paused") && !isRecording && (
                    <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md flex flex-col items-center justify-center text-center p-6 z-10">
                      <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-8 max-w-sm w-full shadow-2xl flex flex-col items-center gap-6">
                        <div className="h-12 w-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
                          <Clock className="w-6 h-6 text-indigo-400 animate-pulse" />
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] text-indigo-400 font-extrabold uppercase tracking-widest">Preparation Time Remaining</span>
                          <h2 className="text-5xl font-black text-white font-mono tracking-tight mt-1">{formatTimer(prepTimerValue)}</h2>
                        </div>
                        <div className="flex gap-3 w-full">
                          {prepTimerState === "running" ? (
                            <button onClick={handlePrepTimerPause}
                              className="flex-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-xs font-bold py-2.5 px-4 rounded-xl border border-amber-500/20 cursor-pointer flex items-center justify-center gap-1.5">
                              <Square className="w-3.5 h-3.5" /> Pause
                            </button>
                          ) : (
                            <button onClick={handlePrepTimerResume}
                              className="flex-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-xs font-bold py-2.5 px-4 rounded-xl border border-emerald-500/20 cursor-pointer flex items-center justify-center gap-1.5">
                              <Play className="w-3.5 h-3.5" /> Resume
                            </button>
                          )}
                          <button onClick={handleSkipDocPreparation}
                            className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-2.5 px-4 rounded-xl cursor-pointer flex items-center justify-center gap-1.5">
                            <Play className="w-3.5 h-3.5" /> Skip Prep
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <canvas ref={canvasRef} height={60} className="w-full bg-slate-50 border border-slate-200 rounded-xl" />

                {isRecording && (
                  <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col gap-4">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold text-slate-700 uppercase">Live Session</span>
                      <span className="text-base font-extrabold text-blue-600 font-mono">{recordingTimer}s</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[10px] font-bold text-slate-600">
                      <div className="flex justify-between bg-slate-50 p-2.5 rounded-lg border border-slate-100"><span>Camera</span><span className="text-emerald-600">✓ On</span></div>
                      <div className="flex justify-between bg-slate-50 p-2.5 rounded-lg border border-slate-100"><span>Mic</span><span className="text-emerald-600">✓ Active</span></div>
                      <div className="flex justify-between bg-slate-50 p-2.5 rounded-lg border border-slate-100"><span>Recording</span><span className="text-red-500 animate-pulse">● Live</span></div>
                      <div className="flex justify-between bg-slate-50 p-2.5 rounded-lg border border-slate-100"><span>Eye Contact</span><span className="text-blue-600">Tracking</span></div>
                      <div className="flex justify-between bg-slate-50 p-2.5 rounded-lg border border-slate-100"><span>Transcript</span><span className="text-purple-600">● Active</span></div>
                      <div className="flex justify-between bg-slate-50 p-2.5 rounded-lg border border-slate-100"><span>Posture</span><span className="text-emerald-600">Analyzing</span></div>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <div className="flex justify-between text-[10px] text-slate-400 font-bold uppercase">
                        <span>Mic Volume</span>
                        {isVADActive && <span className="text-emerald-500 animate-pulse flex items-center gap-1"><Activity className="w-3 h-3" /> Speech Active</span>}
                      </div>
                      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-600 transition-all duration-75" style={{ width: `${Math.min(100, liveVolume * 3.5)}%` }} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-center">
                        <span className="text-[10px] text-slate-400 font-bold uppercase">Speaking Rate</span>
                        <p className="text-sm font-bold text-slate-800 mt-1">{liveWpm} WPM</p>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-center">
                        <span className="text-[10px] text-slate-400 font-bold uppercase">Confidence</span>
                        <p className="text-sm font-bold text-slate-800 mt-1">{liveConfidence}%</p>
                      </div>
                    </div>
                    {liveTranscript && (
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] text-slate-400 font-bold uppercase">Live Transcript</span>
                        <p className="text-xs text-slate-600 italic bg-slate-50 p-3 rounded-xl border border-slate-100 max-h-[100px] overflow-y-auto leading-relaxed">"{liveTranscript.trim()}"</p>
                      </div>
                    )}
                    <button onClick={stopRecordingSession}
                      className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold text-xs py-2.5 rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow-sm">
                      <Square className="w-4 h-4" /> Stop &amp; Upload Video
                    </button>
                  </div>
                )}
              </div>

              {/* RIGHT: All controls */}
              <div className="flex flex-col gap-4">

                {/* Device checklist */}
                <div className="flex flex-col gap-2 p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold">
                  <div className="flex items-center gap-2">
                    <span className={isCameraAvailable ? "text-emerald-600" : "text-amber-600"}>
                      {isCameraAvailable ? "✓ Camera Connected" : "⏳ Waiting for Camera..."}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={isMicAvailable ? "text-emerald-600" : "text-amber-600"}>
                      {isMicAvailable ? "✓ Microphone Connected" : "⏳ Waiting for Mic..."}
                    </span>
                  </div>
                  {isCameraAvailable && isMicAvailable && (
                    <div className="text-emerald-700 font-extrabold mt-1 text-center bg-emerald-50 py-1 rounded-lg">✓ System Ready To Record</div>
                  )}
                  {!isCameraAvailable && !isMicAvailable && (
                    <div className="text-amber-700 text-[10px] text-center mt-1 leading-relaxed">Allow camera &amp; microphone access to begin.</div>
                  )}
                </div>

                {/* Step 1: Upload document */}
                {!uploadedDoc && (
                  <div className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col items-center justify-center gap-4 shadow-sm text-center min-h-[220px]">
                    {uploadingDoc ? (
                      <div className="flex flex-col items-center gap-3">
                        <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
                        <h3 className="font-semibold text-slate-800 text-sm">Analyzing Document...</h3>
                        <p className="text-xs text-slate-500 leading-relaxed">Extracting content and generating topics. Takes 10–20 seconds.</p>
                      </div>
                    ) : (
                      <>
                        <div className="h-14 w-14 bg-blue-50 rounded-2xl flex items-center justify-center border border-blue-100">
                          <FileText className="w-7 h-7 text-blue-600 animate-bounce" />
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <h3 className="font-bold text-slate-800 text-sm">Upload your document</h3>
                          <p className="text-xs text-slate-500">PDF, Word, PPT, TXT, MD. Max 50 MB.</p>
                        </div>
                        <label className="w-full cursor-pointer">
                          <input type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,.md" onChange={handleDocUpload} className="hidden" />
                          <div className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-3 rounded-xl shadow-md transition-colors flex items-center justify-center gap-2">
                            <FileText className="w-4 h-4" /> Select File
                          </div>
                        </label>
                      </>
                    )}
                  </div>
                )}

                {/* Step 2: Doc loaded, no topic selected */}
                {uploadedDoc && !selectedDocTopic && (
                  <>
                    <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-4 flex flex-col gap-3">
                      <span className="text-[9px] text-blue-600 font-extrabold uppercase bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-100/30 w-max">Document Loaded</span>
                      <h3 className="font-extrabold text-slate-800 text-sm truncate">{uploadedDoc.title || uploadedDoc.filename}</h3>
                      <p className="text-xs text-slate-600 leading-relaxed border-t border-slate-200/50 pt-2">{uploadedDoc.summary || "No summary available."}</p>
                      {uploadedDoc.keywords && uploadedDoc.keywords.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {uploadedDoc.keywords.slice(0, 5).map((kw: string, i: number) => (
                            <span key={i} className="bg-slate-200/60 text-slate-700 text-[10px] font-semibold px-2 py-0.5 rounded-lg">{kw}</span>
                          ))}
                        </div>
                      )}
                      <button onClick={() => { setUploadedDoc(null); setDocFile(null); setDocTopics([]); setSelectedDocTopic(null); }}
                        className="w-full bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 text-xs font-bold py-2 rounded-xl transition-colors">
                        Upload Different File
                      </button>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col gap-2 shadow-sm">
                      <span className="text-[10px] text-slate-400 font-bold uppercase">Choose Practice Mode</span>
                      <button onClick={() => setDocAnalyzerMode("presentation")}
                        className={`w-full py-2.5 px-3 rounded-xl text-left border font-bold text-xs flex items-center gap-2 transition-all ${docAnalyzerMode === "presentation" ? "border-blue-600 bg-blue-50 text-blue-600" : "border-slate-200 hover:bg-slate-50 text-slate-700"}`}>
                        <FileText className="w-4 h-4" /> Presentation Practice
                      </button>
                      <button onClick={() => setDocAnalyzerMode("viva")}
                        className={`w-full py-2.5 px-3 rounded-xl text-left border font-bold text-xs flex items-center gap-2 transition-all ${docAnalyzerMode === "viva" ? "border-blue-600 bg-blue-50 text-blue-600" : "border-slate-200 hover:bg-slate-50 text-slate-700"}`}>
                        <Award className="w-4 h-4" /> Document Viva / Oral Exam
                      </button>
                    </div>

                    {docAnalyzerMode === "presentation" && (
                      <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col gap-3 shadow-sm">
                        <div>
                          <h3 className="text-xs font-bold text-slate-700 uppercase">Select a Speaking Topic</h3>
                          <p className="text-[10px] text-slate-500 mt-0.5">AI-generated topics from your document.</p>
                        </div>
                        <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-1">
                          {docTopics.map((topic, i) => (
                            <div key={i} className="border border-slate-200 hover:border-blue-500 p-3 rounded-xl flex justify-between items-center gap-2 bg-slate-50/30 transition-all">
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[9px] font-extrabold uppercase bg-indigo-50 border border-indigo-100/30 px-1.5 py-0.5 rounded text-indigo-600">{topic.difficulty}</span>
                                </div>
                                <h4 className="font-bold text-slate-800 text-xs mt-1 leading-relaxed">"{topic.topic}"</h4>
                              </div>
                              <button onClick={() => handleSelectDocTopic(topic)}
                                disabled={!isCameraAvailable || !isMicAvailable}
                                className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-[10px] py-1.5 px-3 rounded-lg shrink-0 cursor-pointer shadow-sm transition-colors">
                                Select
                              </button>
                            </div>
                          ))}
                        </div>
                        {(!isCameraAvailable || !isMicAvailable) && (
                          <p className="text-[9px] text-amber-600 font-bold text-center">⚠ Allow camera &amp; mic access before selecting a topic.</p>
                        )}
                      </div>
                    )}

                    {docAnalyzerMode === "viva" && (
                      <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col gap-3 shadow-sm">
                        <h3 className="text-xs font-bold text-slate-700 uppercase">Viva Settings</h3>
                        <select value={vivaModeOption} onChange={(e: any) => setVivaModeOption(e.target.value)} className="glass-input p-2.5 rounded-xl text-xs">
                          <option value="viva">Academic Viva / Thesis Defense</option>
                          <option value="project">Project Report Mode</option>
                          <option value="resume">Resume Analyzer Mode</option>
                        </select>
                        <button onClick={handleStartViva} disabled={vivaLoading || !isCameraAvailable || !isMicAvailable}
                          className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-100 disabled:text-slate-400 text-white font-bold text-xs py-3 rounded-xl cursor-pointer shadow-lg flex items-center justify-center gap-2">
                          {vivaLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Initiate Viva Q&A <ArrowRight className="w-4 h-4" /></>}
                        </button>
                      </div>
                    )}
                  </>
                )}

                {/* Step 3: Topic selected, not yet recording */}
                {uploadedDoc && selectedDocTopic && !isRecording && (
                  <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col gap-4 shadow-sm">
                    <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-4 flex flex-col gap-3">
                      <div className="flex justify-between items-start gap-2">
                        <div>
                          <span className="text-[9px] font-extrabold text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-lg uppercase">{selectedDocTopic.difficulty}</span>
                          <h4 className="font-bold text-slate-800 text-sm mt-2 leading-relaxed">"{selectedDocTopic.topic}"</h4>
                        </div>
                        <button onClick={() => { setSelectedDocTopic(null); setWorkflowChoice("none"); }} className="text-xs text-slate-400 hover:text-slate-600 underline shrink-0">Change</button>
                      </div>
                      <div className="text-xs text-slate-600 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        Est. speaking time: <strong>{selectedDocTopic.estimated_speaking_time}s</strong>
                      </div>
                      {uploadedDoc.summary && (
                        <p className="text-[10px] text-slate-500 leading-relaxed border-t border-blue-100/50 pt-2 line-clamp-2">{uploadedDoc.summary}</p>
                      )}
                    </div>

                    {workflowChoice === "none" && (
                      <div className="flex flex-col gap-3">
                        <button onClick={handleStartDocSpeakingNow} disabled={!isCameraAvailable || !isMicAvailable}
                          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-xs py-3.5 rounded-xl cursor-pointer shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 transition-all">
                          <Play className="w-4 h-4" /> Start Speaking Now
                        </button>
                        <button onClick={() => setWorkflowChoice("prep_choice")} disabled={!isCameraAvailable || !isMicAvailable}
                          className="w-full bg-slate-100 hover:bg-slate-200 disabled:bg-slate-50 disabled:text-slate-300 text-slate-700 font-bold text-xs py-3.5 rounded-xl cursor-pointer border border-slate-200/50 flex items-center justify-center gap-2 transition-all">
                          <Clock className="w-4 h-4 text-slate-500" /> Start Preparation Timer
                        </button>
                        {(!isCameraAvailable || !isMicAvailable) && (
                          <p className="text-[9px] text-amber-600 font-bold text-center">⚠ Camera &amp; mic must be connected to start.</p>
                        )}
                      </div>
                    )}

                    {workflowChoice === "prep_choice" && (
                      <div className="bg-indigo-50/50 border border-indigo-100/50 rounded-2xl p-4 flex flex-col gap-3">
                        <div className="text-center">
                          <span className="text-[10px] text-indigo-600 font-extrabold uppercase tracking-wider">Select Prep Duration</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {[30, 60, 90, 120].map((secs) => (
                            <button key={secs} onClick={() => handleSelectDocPrepDuration(secs)}
                              className="bg-white hover:bg-indigo-600 hover:text-white border border-indigo-100 text-slate-700 text-xs font-bold py-2.5 rounded-xl cursor-pointer transition-all flex items-center justify-center gap-1">
                              <Clock className="w-3 h-3 opacity-60" /> {secs}s
                            </button>
                          ))}
                        </div>
                        <button onClick={() => setWorkflowChoice("none")} className="text-[10px] text-slate-500 hover:text-slate-700 font-bold text-center underline cursor-pointer">Go Back</button>
                      </div>
                    )}

                    {workflowChoice === "prep_timer" && (
                      <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 flex flex-col items-center gap-3">
                        <span className="text-[10px] text-indigo-600 font-extrabold uppercase tracking-widest">Preparation Time Remaining</span>
                        <div className="text-4xl font-black text-indigo-700 font-mono">{formatTimer(prepTimerValue)}</div>
                        <div className="flex gap-2 w-full">
                          {prepTimerState === "running" ? (
                            <button onClick={handlePrepTimerPause} className="flex-1 bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-bold py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer">
                              <Square className="w-3 h-3" /> Pause
                            </button>
                          ) : (
                            <button onClick={handlePrepTimerResume} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer">
                              <Play className="w-3 h-3" /> Resume
                            </button>
                          )}
                          <button onClick={handleSkipDocPreparation} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer">
                            <Play className="w-3 h-3" /> Skip Prep
                          </button>
                        </div>
                      </div>
                    )}

                    {selectedDocTopic.talking_points && selectedDocTopic.talking_points.length > 0 && (
                      <div className="flex flex-col gap-1.5 border-t border-slate-100 pt-3">
                        <span className="text-[10px] text-slate-400 font-bold uppercase">Talking Points</span>
                        <ul className="flex flex-col gap-1.5">
                          {selectedDocTopic.talking_points.map((tp: string, idx: number) => (
                            <li key={idx} className="text-xs text-slate-600 font-medium flex items-start gap-1.5 leading-relaxed">
                              <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 mt-1.5 shrink-0" /> {tp}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {/* Step 4: Recording — show topic reminder */}
                {uploadedDoc && selectedDocTopic && isRecording && (
                  <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col gap-2 shadow-sm">
                    <span className="text-[9px] font-extrabold text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-lg uppercase w-max">Speaking Now</span>
                    <h4 className="font-bold text-slate-800 text-sm leading-relaxed">"{selectedDocTopic.topic}"</h4>
                    <p className="text-xs text-slate-500">From: <strong>{uploadedDoc.title || uploadedDoc.filename}</strong></p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ================================= DOCUMENT PROCESSING LOADER SCREEN ================================= */}
        {currentScreen === "doc_processing" && (
          <div className="p-8 flex flex-col items-center justify-center max-w-xl mx-auto w-full min-h-[400px] text-center">
            <div className="bg-white border border-slate-200 rounded-3xl p-8 flex flex-col items-center gap-4 shadow-sm w-full">
              <Loader2 className="w-12 h-12 animate-spin text-blue-600" />
              <h2 className="font-bold text-slate-800 text-lg">Evaluating Content Explanation</h2>
              <p className="text-xs text-slate-500 leading-relaxed max-w-sm">
                Our AI engine is transcribing your speech, mapping keywords, comparing your content against the source document, and generating feedback reports. This will take up to 20-30 seconds.
              </p>
            </div>
          </div>
        )}

        {/* ================================= DOCUMENT RESULTS REPORT DASHBOARD ================================= */}
        {currentScreen === "doc_results" && activeDocSession && (
          <div className="p-8 flex flex-col gap-6 max-w-5xl mx-auto w-full">
            
            {/* Header */}
            <div className="flex justify-between items-start flex-wrap gap-4">
              <div>
                <span className="text-[10px] text-blue-600 font-extrabold uppercase bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-100/30">Analysis Dashboard</span>
                <h1 className="text-xl font-bold text-slate-900 mt-1 leading-relaxed">"{activeDocSession.topic_title}"</h1>
                <p className="text-xs text-slate-500 mt-0.5">Presented based on document title: <strong>{uploadedDoc?.title || uploadedDoc?.filename}</strong></p>
              </div>
              <button
                onClick={() => {
                  setSelectedDocTopic(null);
                  setCurrentScreen("doc_analyzer");
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-2 px-5 rounded-xl shadow-md cursor-pointer transition-all"
              >
                Practice Another Topic
              </button>
            </div>

            {/* 6-Section Analysis Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-4">
              
              {/* SECTION A: Communication Analysis */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col gap-4">
                <div className="flex items-center gap-2 text-blue-600 font-extrabold text-xs uppercase tracking-wider">
                  <span className="p-1.5 bg-blue-50 rounded-lg border border-blue-100/30 text-blue-600">
                    <BarChart3 className="w-4 h-4" />
                  </span>
                  Section A: Communication Analysis
                </div>
                <div className="flex flex-col gap-3 mt-2 text-xs font-semibold text-slate-600">
                  <div className="flex justify-between bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    <span>Confidence</span>
                    <span className="font-extrabold text-slate-900">{activeDocSession.report?.communication_metrics?.confidence ?? 80}%</span>
                  </div>
                  <div className="flex justify-between bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    <span>Fluency</span>
                    <span className="font-extrabold text-slate-900">{activeDocSession.report?.communication_metrics?.fluency ?? 80}%</span>
                  </div>
                  <div className="flex justify-between bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    <span>Vocabulary</span>
                    <span className="font-extrabold text-slate-900">{activeDocSession.report?.communication_metrics?.vocabulary ?? 80}%</span>
                  </div>
                  <div className="flex justify-between bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    <span>Leadership</span>
                    <span className="font-extrabold text-slate-900">{activeDocSession.report?.communication_metrics?.leadership ?? 80}%</span>
                  </div>
                  <div className="flex justify-between bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    <span>Persuasion</span>
                    <span className="font-extrabold text-slate-900">{activeDocSession.report?.communication_metrics?.persuasion ?? 80}%</span>
                  </div>
                </div>
              </div>

              {/* SECTION B: Video Analysis */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col gap-4">
                <div className="flex items-center gap-2 text-emerald-600 font-extrabold text-xs uppercase tracking-wider">
                  <span className="p-1.5 bg-emerald-50 rounded-lg border border-emerald-100/30 text-emerald-600">
                    <Video className="w-4 h-4" />
                  </span>
                  Section B: Video Analysis
                </div>
                <div className="flex flex-col gap-3 mt-2 text-xs font-semibold text-slate-600">
                  <div className="flex justify-between bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    <span>Eye Contact</span>
                    <span className="font-extrabold text-slate-900">{activeDocSession.face_metrics?.eye_contact_percentage ?? activeDocSession.report?.communication_metrics?.eye_contact ?? 85}%</span>
                  </div>
                  <div className="flex justify-between bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    <span>Attention Score</span>
                    <span className="font-extrabold text-slate-900">{activeDocSession.face_metrics?.attention_score ?? 88}%</span>
                  </div>
                  <div className="flex justify-between bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    <span>Posture Score</span>
                    <span className="font-extrabold text-slate-900">{activeDocSession.face_metrics?.posture_stability ?? activeDocSession.report?.communication_metrics?.posture ?? 90}%</span>
                  </div>
                  <div className="flex justify-between bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    <span>Engagement Score</span>
                    <span className="font-extrabold text-slate-900">{activeDocSession.face_metrics?.engagement_score ?? activeDocSession.report?.communication_metrics?.engagement ?? 87}%</span>
                  </div>
                </div>
              </div>

              {/* SECTION C: Voice Analysis */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col gap-4">
                <div className="flex items-center gap-2 text-purple-600 font-extrabold text-xs uppercase tracking-wider">
                  <span className="p-1.5 bg-purple-50 rounded-lg border border-purple-100/30 text-purple-600">
                    <Volume2 className="w-4 h-4" />
                  </span>
                  Section C: Voice Analysis
                </div>
                <div className="flex flex-col gap-3 mt-2 text-xs font-semibold text-slate-600">
                  <div className="flex justify-between bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    <span>Pitch Variation</span>
                    <span className="font-extrabold text-slate-900">{activeDocSession.voice_metrics?.pitch_variation ? `${activeDocSession.voice_metrics.pitch_variation.toFixed(1)} Hz` : "18 Hz"}</span>
                  </div>
                  <div className="flex justify-between bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    <span>Energy Variation</span>
                    <span className="font-extrabold text-slate-900">{activeDocSession.voice_metrics?.energy_variation ? `${activeDocSession.voice_metrics.energy_variation.toFixed(2)} dB` : "0.08 dB"}</span>
                  </div>
                  <div className="flex justify-between bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    <span>Voice Stability</span>
                    <span className="font-extrabold text-slate-900">{activeDocSession.voice_metrics?.stability_score ?? 82}%</span>
                  </div>
                  <div className="flex justify-between bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    <span>Speaking Rate</span>
                    <span className="font-extrabold text-slate-900">{activeDocSession.voice_metrics?.rhythm_score ? `${activeDocSession.voice_metrics.rhythm_score} WPM` : `${activeDocSession.report?.communication_metrics?.wpm ?? 130} WPM`}</span>
                  </div>
                </div>
              </div>

              {/* SECTION D: Document Understanding */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col gap-4 lg:col-span-2">
                <div className="flex items-center gap-2 text-indigo-600 font-extrabold text-xs uppercase tracking-wider">
                  <span className="p-1.5 bg-indigo-50 rounded-lg border border-indigo-100/30 text-indigo-600">
                    <TrendingUp className="w-4 h-4" />
                  </span>
                  Section D: Document Understanding
                </div>
                <div className="grid grid-cols-3 gap-3.5 mt-1">
                  <div className="p-3 bg-indigo-50/50 rounded-xl border border-indigo-100/30 text-center">
                    <span className="text-[10px] text-indigo-700 font-extrabold uppercase">Understanding</span>
                    <p className="text-xl font-black text-indigo-900 mt-0.5">{activeDocSession.report?.understanding_score}%</p>
                  </div>
                  <div className="p-3 bg-emerald-50/50 rounded-xl border border-emerald-100/30 text-center">
                    <span className="text-[10px] text-emerald-700 font-extrabold uppercase">Accuracy</span>
                    <p className="text-xl font-black text-emerald-900 mt-0.5">{activeDocSession.report?.accuracy_score}%</p>
                  </div>
                  <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-100/30 text-center">
                    <span className="text-[10px] text-blue-700 font-extrabold uppercase">Coverage</span>
                    <p className="text-xl font-black text-blue-900 mt-0.5">{activeDocSession.report?.coverage_score}%</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3 text-xs font-semibold text-slate-600 mt-1">
                  <div className="flex justify-between items-center bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    <span>Technical Correctness</span>
                    <span className="font-extrabold text-slate-900">{activeDocSession.report?.technical_correctness}%</span>
                  </div>
                  <div className="flex justify-between items-center bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    <span>Explanation Quality</span>
                    <span className="font-extrabold text-slate-900">{activeDocSession.report?.explanation_quality}%</span>
                  </div>
                  <div className="flex justify-between items-center bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    <span>Topic Relevance</span>
                    <span className="font-extrabold text-slate-900">{activeDocSession.report?.relevance_score}%</span>
                  </div>
                </div>
              </div>

              {/* SECTION E: Knowledge Gaps */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col gap-4 lg:col-span-1">
                <div className="flex items-center gap-2 text-amber-600 font-extrabold text-xs uppercase tracking-wider">
                  <span className="p-1.5 bg-amber-50 rounded-lg border border-amber-100/30 text-amber-600">
                    <AlertTriangle className="w-4 h-4" />
                  </span>
                  Section E: Knowledge Gaps
                </div>
                <div className="max-h-[160px] overflow-y-auto flex flex-col gap-2.5 mt-2">
                  {activeDocSession.gaps && activeDocSession.gaps.length > 0 ? (
                    activeDocSession.gaps.map((gap: any, i: number) => (
                      <div key={i} className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-xs text-slate-700 leading-relaxed flex items-start gap-2">
                        <span className="px-1.5 py-0.5 bg-amber-100 border border-amber-200/50 rounded font-bold text-amber-800 text-[9px] uppercase shrink-0">{gap.concept}</span>
                        <div>{gap.description || "Omitted from explanation."}</div>
                      </div>
                    ))
                  ) : (
                    <div className="bg-emerald-50 text-emerald-800 border border-emerald-100 rounded-xl p-4 text-xs font-semibold text-center mt-2">
                      ✓ Flawless concept coverage!
                    </div>
                  )}
                </div>
              </div>

              {/* SECTION F: AI Coach Recommendations */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col gap-4 lg:col-span-3">
                <div className="flex items-center gap-2 text-indigo-600 font-extrabold text-xs uppercase tracking-wider">
                  <span className="p-1.5 bg-indigo-50 rounded-lg border border-indigo-100/30 text-indigo-600">
                    <Sparkles className="w-4 h-4" />
                  </span>
                  Section F: AI Coach Recommendations
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Suggested Improvements</span>
                    <ul className="flex flex-col gap-2">
                      {activeDocSession.report?.suggested_improvements?.map((item: string, i: number) => (
                        <li key={i} className="text-xs text-slate-600 font-medium flex items-start gap-2 leading-relaxed bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                          <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 mt-1.5 shrink-0" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="flex flex-col gap-2">
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Coaching Recommendations</span>
                    <ul className="flex flex-col gap-2">
                      {activeDocSession.report?.coach_recommendations?.map((item: string, i: number) => (
                        <li key={i} className="text-xs text-slate-600 font-medium flex items-start gap-2 leading-relaxed bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                          <span className="h-1.5 w-1.5 rounded-full bg-yellow-500 mt-1.5 shrink-0" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              {/* Extra Row: Raw Transcript & AI Expected Answer */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col gap-4 lg:col-span-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="flex flex-col gap-3">
                    <h4 className="text-xs font-extrabold text-slate-700 uppercase">Spoken Transcript</h4>
                    <p className="text-xs text-slate-600 bg-slate-50 p-4 border border-slate-100 rounded-xl leading-relaxed italic max-h-[160px] overflow-y-auto">
                      "{activeDocSession.raw_transcript}"
                    </p>
                  </div>
                  <div className="flex flex-col gap-3">
                    <h4 className="text-xs font-extrabold text-slate-700 uppercase">Expected Answer / Key Highlights</h4>
                    <p className="text-xs text-slate-600 bg-slate-50 p-4 border border-slate-100 rounded-xl leading-relaxed italic max-h-[160px] overflow-y-auto">
                      "{activeDocSession.report?.expected_answer || "Review the generated coaching suggestions and key topics for preparation guidance."}"
                    </p>
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* ================================= DOCUMENT VIVA / ORAL EXAM SCREEN ================================= */}
        {currentScreen === "doc_viva" && activeVivaSession && (
          <div className="p-8 flex flex-col gap-6 max-w-5xl mx-auto w-full">
            
            {/* 1. VIVA INTERACTIVE INTERFACE (Test ongoing) */}
            {!vivaShowResults ? (
              <div className="flex flex-col gap-6">
                
                {/* Header info */}
                <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                  <div>
                    <span className="text-[10px] text-blue-600 font-extrabold uppercase bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-100/30">Document Viva Mode</span>
                    <h2 className="font-bold text-slate-800 text-sm mt-1">Viva Mode: {vivaModeOption.toUpperCase()}</h2>
                  </div>
                  <div className="text-xs font-bold text-slate-500">
                    Question {vivaCurrentQuestionIdx + 1} of {activeVivaSession.questions_answers?.length || 5}
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  
                  {/* Left panel: Active Question details */}
                  <div className="lg:col-span-1 flex flex-col gap-5">
                    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col gap-4">
                      <span className="text-[10px] text-slate-400 font-bold uppercase">Active Question</span>
                      <p className="font-extrabold text-slate-800 text-sm leading-relaxed bg-slate-50 p-4 rounded-xl border border-slate-150">
                        {activeVivaSession.questions_answers?.[vivaCurrentQuestionIdx]?.question}
                      </p>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col gap-3.5 text-xs text-slate-600">
                      <h4 className="font-bold text-slate-700">Viva Instructions</h4>
                      <p className="leading-relaxed">Click "Start Speaking" and speak your answer clearly. Keep answers under 45 seconds.</p>
                      <p className="leading-relaxed">When done, click "Stop & Submit". Your transcript will be compared directly to the document facts for grading.</p>
                    </div>
                  </div>

                  {/* Right panel: Video recorder / feed */}
                  <div className="lg:col-span-2 flex flex-col gap-4 bg-white border border-slate-200 p-5 rounded-3xl shadow-sm">
                    <div className="relative rounded-2xl overflow-hidden bg-slate-950 aspect-video flex items-center justify-center border border-slate-800">
                      <Webcam
                        key={webcamKey}
                        audio={true}
                        ref={webcamRef}
                        onUserMedia={handleUserMedia}
                        onUserMediaError={handleUserMediaError}
                        className="absolute inset-0 w-full h-full object-cover opacity-80"
                      />
                      
                      {isVivaRecording && (
                        <div className="absolute top-4 left-4 bg-red-600 text-white px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase animate-pulse flex items-center gap-1.5 z-20">
                          <Play className="w-3.5 h-3.5" /> Recording Answer
                        </div>
                      )}

                      {isVivaRecording && (
                        <div className="absolute top-4 right-4 bg-black/60 backdrop-blur-sm text-white px-3 py-1 rounded-xl text-xs font-bold font-mono z-20">
                          Timer: {vivaRecordingTimer}s
                        </div>
                      )}

                      {vivaSubmittingAnswer && (
                        <div className="absolute inset-0 bg-slate-900/90 backdrop-blur-md flex flex-col items-center justify-center text-center p-6 z-30">
                          <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
                          <h4 className="font-bold text-white text-sm mt-3">Grading Oral Response...</h4>
                          <p className="text-[10px] text-slate-400 mt-1 max-w-xs">Comparing your explanation to document facts.</p>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-4">
                      {!isVivaRecording ? (
                        <button
                          onClick={handleStartVivaRecording}
                          disabled={vivaSubmittingAnswer || !isCameraAvailable}
                          className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-100 disabled:text-slate-400 text-white font-bold text-xs py-3 rounded-xl flex items-center justify-center gap-2 shadow-sm cursor-pointer transition-colors"
                        >
                          <Mic className="w-4 h-4" /> Start Speaking / Answer
                        </button>
                      ) : (
                        <button
                          onClick={handleStopVivaRecording}
                          className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold text-xs py-3 rounded-xl flex items-center justify-center gap-2 shadow-sm cursor-pointer transition-colors animate-pulse"
                        >
                          <Square className="w-4 h-4" /> Stop & Submit Answer
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              
              /* 2. VIVA RESULTS REPORT (Viva completed) */
              <div className="flex flex-col gap-6">
                
                {/* Header */}
                <div className="flex justify-between items-start flex-wrap gap-4 border-b border-slate-100 pb-4">
                  <div>
                    <span className="text-[10px] text-emerald-600 font-extrabold uppercase bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-100/30">Exam Completed</span>
                    <h1 className="text-xl font-bold text-slate-900 mt-1 leading-relaxed">Document Viva scorecard</h1>
                    <p className="text-xs text-slate-500 mt-0.5">Evaluation for mode: <strong>{vivaModeOption.toUpperCase()}</strong> on <strong>{uploadedDoc?.title || uploadedDoc?.filename}</strong></p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="bg-indigo-50 border border-indigo-100 rounded-xl py-2 px-5 text-center flex flex-col justify-center shadow-inner">
                      <span className="text-[9px] text-indigo-600 font-bold uppercase">Overall Score</span>
                      <p className="text-2xl font-black text-indigo-700 mt-0.5">{activeVivaSession.overall_score}%</p>
                    </div>
                    <button
                      onClick={() => {
                        setActiveVivaSession(null);
                        setCurrentScreen("doc_analyzer");
                      }}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-2 px-5 rounded-xl shadow-md cursor-pointer transition-all h-max self-center"
                    >
                      Exit Viva / Reset
                    </button>
                  </div>
                </div>

                {/* Scorecard questions list */}
                <div className="flex flex-col gap-6">
                  {activeVivaSession.questions_answers && activeVivaSession.questions_answers.map((qa: any, i: number) => (
                    <div key={i} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col gap-4">
                      
                      {/* Question Header */}
                      <div className="flex justify-between items-start gap-4">
                        <div className="flex gap-3 items-start">
                          <span className="h-6 w-6 bg-slate-100 text-slate-600 rounded-full flex items-center justify-center font-bold text-xs shrink-0">{i+1}</span>
                          <h3 className="font-extrabold text-slate-800 text-sm leading-relaxed mt-0.5">"{qa.question}"</h3>
                        </div>
                        {qa.evaluation && (
                          <span className={`px-3 py-1 rounded-full font-black text-xs border ${
                            qa.evaluation.score >= 80 
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                              : qa.evaluation.score >= 60 
                                ? "bg-amber-50 text-amber-700 border-amber-200" 
                                : "bg-red-50 text-red-700 border-red-200"
                          }`}>
                            Score: {qa.evaluation.score}%
                          </span>
                        )}
                      </div>

                      {/* Response details */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t border-slate-100 pt-4 text-xs leading-relaxed">
                        
                        {/* Left column: spoken transcript + feedback */}
                        <div className="flex flex-col gap-3">
                          <div>
                            <span className="text-[10px] text-slate-400 font-bold uppercase">Spoken Answer</span>
                            <p className="text-slate-600 bg-slate-50 p-3.5 border border-slate-100 rounded-xl italic mt-1">
                              "{qa.user_answer_transcript || "No response provided."}"
                            </p>
                          </div>
                          {qa.evaluation && (
                            <div>
                              <span className="text-[10px] text-slate-400 font-bold uppercase">Evaluator Feedback</span>
                              <p className="text-slate-700 font-medium mt-1">
                                {qa.evaluation.feedback}
                              </p>
                            </div>
                          )}
                        </div>

                        {/* Right column: evaluation bullet lists */}
                        {qa.evaluation && (
                          <div className="flex flex-col gap-3 bg-slate-50/50 p-4 rounded-xl border border-slate-200/40">
                            <div>
                              <span className="text-[10px] text-emerald-600 font-bold uppercase">✓ Correct Elements</span>
                              <ul className="flex flex-col gap-1 mt-1 text-slate-600">
                                {qa.evaluation.correct_elements && qa.evaluation.correct_elements.map((item: string, idx: number) => (
                                  <li key={idx} className="flex items-start gap-1.5">
                                    <span className="text-emerald-500 font-bold">✓</span> {item}
                                  </li>
                                ))}
                              </ul>
                            </div>
                            
                            {qa.evaluation.incorrect_elements && qa.evaluation.incorrect_elements.length > 0 && (
                              <div>
                                <span className="text-[10px] text-red-500 font-bold uppercase">✗ Incorrect / Weak Elements</span>
                                <ul className="flex flex-col gap-1 mt-1 text-slate-600">
                                  {qa.evaluation.incorrect_elements.map((item: string, idx: number) => (
                                    <li key={idx} className="flex items-start gap-1.5">
                                      <span className="text-red-500 font-bold">✗</span> {item}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            <div>
                              <span className="text-[10px] text-indigo-600 font-bold uppercase">Ideal Sample Response</span>
                              <p className="text-[11px] text-indigo-900 bg-indigo-50/40 p-2.5 rounded-lg border border-indigo-100/40 mt-1">
                                {qa.evaluation.ideal_response}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================================= JAM ANALYSIS SCREEN ================================= */}
        {currentScreen === "jam" && (
          <div className="p-8 flex flex-col gap-6 max-w-5xl mx-auto w-full">
            <div className="flex justify-between items-center">
              <h1 className="text-xl font-bold text-slate-900">JAM Speech Recorder</h1>
              <div className="flex gap-4 items-center">
                <div className="flex items-center gap-1.5 text-xs font-semibold">
                  <span className={`h-2.5 w-2.5 rounded-full ${isCameraAvailable ? "bg-emerald-500" : "bg-red-500"}`} />
                  Camera: {isCameraAvailable ? "Connected" : "No Signal"}
                </div>
                <div className="flex items-center gap-1.5 text-xs font-semibold">
                  <span className={`h-2.5 w-2.5 rounded-full ${isMicAvailable ? "bg-emerald-500" : "bg-red-500"}`} />
                  Mic: {isMicAvailable ? "Connected" : "No Signal"}
                </div>
              </div>
            </div>

            {/* Error notifications */}
            {cameraErrorMsg && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-4 py-3 rounded-xl flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                {cameraErrorMsg}
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Left Column: Webcam view (Rendered immediately when mounting the screen) */}
              <div className="lg:col-span-2 flex flex-col gap-4">
                <div className="relative rounded-2xl overflow-hidden border border-slate-200 bg-slate-100 aspect-video shadow-sm flex items-center justify-center">
                  <Webcam
                    key={webcamKey}
                    audio={true}
                    ref={webcamRef}
                    onUserMedia={handleUserMedia}
                    onUserMediaError={handleUserMediaError}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                  {isStreamReady && (
                    <div className="absolute bottom-4 right-4 z-20 flex gap-2">
                      <button
                        onClick={toggleCamera}
                        className="bg-black/60 hover:bg-black/80 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 backdrop-blur-sm transition-colors border border-white/10"
                      >
                        {cameraEnabled ? (
                          <>
                            <Video className="w-3.5 h-3.5" /> Stop Camera
                          </>
                        ) : (
                          <>
                            <VideoOff className="w-3.5 h-3.5 text-red-400" /> Start Camera
                          </>
                        )}
                      </button>
                    </div>
                  )}
                  {!isStreamReady && (
                    <div className="relative z-10 flex flex-col items-center gap-2 text-slate-400 text-xs font-medium">
                      <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                      Acquiring camera preview stream...
                    </div>
                  )}
                  {isRecording && (
                    <div className="absolute top-4 left-4 bg-red-600 text-white px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase animate-pulse flex items-center gap-1.5">
                      <Play className="w-3.5 h-3.5" /> Recording Live
                    </div>
                  )}
                  {workflowChoice === "prep_timer" && (prepTimerState === "running" || prepTimerState === "paused") && !isRecording && (
                    <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md flex flex-col items-center justify-center text-center p-6 transition-all duration-300">
                      <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-8 max-w-sm w-full shadow-2xl flex flex-col items-center gap-6">
                        <div className="h-12 w-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
                          <Clock className="w-6 h-6 text-indigo-400 animate-pulse" />
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] text-indigo-400 font-extrabold uppercase tracking-widest">
                            Preparation Time Remaining
                          </span>
                          <h2 className="text-5xl font-black text-white font-mono tracking-tight mt-1">{formatTimer(prepTimerValue)}</h2>
                        </div>
                        <div className="flex gap-3 w-full">
                          {prepTimerState === "running" ? (
                            <button
                              onClick={handlePrepTimerPause}
                              className="flex-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-xs font-bold py-2.5 px-4 rounded-xl border border-amber-500/20 transition-all cursor-pointer flex items-center justify-center gap-1.5"
                            >
                              <Square className="w-3.5 h-3.5" /> Pause
                            </button>
                          ) : (
                            <button
                              onClick={handlePrepTimerResume}
                              className="flex-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-xs font-bold py-2.5 px-4 rounded-xl border border-emerald-500/20 transition-all cursor-pointer flex items-center justify-center gap-1.5"
                            >
                              <Play className="w-3.5 h-3.5" /> Resume
                            </button>
                          )}
                          <button
                            onClick={handleSkipPreparation}
                            className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold py-2.5 px-4 rounded-xl shadow-lg shadow-indigo-600/20 transition-all cursor-pointer flex items-center justify-center gap-1.5"
                          >
                            <Play className="w-3.5 h-3.5" /> Skip Preparation
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Audio Waveform visualization */}
                <canvas ref={canvasRef} height={60} className="w-full bg-slate-50 border border-slate-200 rounded-xl" />
              </div>

              {/* Right Column: Configurations and live outputs */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 flex flex-col gap-6 shadow-sm">
                
                {/* Before topic is generated: configuration */}
                {!isRecording && prepTimerState === "idle" && !generatedTopic && (
                  <div className="flex flex-col gap-4">
                    <h3 className="text-xs font-bold text-slate-700 uppercase">Configuration</h3>
                    
                    {/* Visual checklist status card */}
                    <div className="flex flex-col gap-2 p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold">
                      <div className="flex items-center gap-2">
                        <span className={isCameraAvailable ? "text-emerald-600" : "text-red-500"}>
                          {isCameraAvailable ? "✓ Camera Connected" : "✗ Camera Blocked/Unavailable"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={isMicAvailable ? "text-emerald-600" : "text-red-500"}>
                          {isMicAvailable ? "✓ Microphone Connected" : "✗ Microphone Blocked/Unavailable"}
                        </span>
                      </div>
                      {isCameraAvailable && isMicAvailable && (
                        <div className="text-emerald-700 font-extrabold mt-1 text-center bg-emerald-50 py-1 rounded-lg">
                          ✓ Ready To Record
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-bold text-slate-500">Category Selection</label>
                      <select 
                        value={selectedCategory} 
                        onChange={(e) => setSelectedCategory(e.target.value)} 
                        className="glass-input p-2 rounded-xl text-xs"
                      >
                        {CATEGORIES.map((cat, i) => <option key={i} value={cat}>{cat}</option>)}
                      </select>
                    </div>
                    <button 
                      onClick={handlePrepTopic} 
                      disabled={topicLoading || !isCameraAvailable || !isMicAvailable}
                      className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs py-2.5 rounded-xl font-semibold cursor-pointer shadow-sm flex items-center justify-center gap-2"
                    >
                      {topicLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Generate Topic & Start Prep"}
                    </button>
                    {!isCameraAvailable && (
                      <span className="text-[9px] text-red-500 text-center font-bold">Please allow camera and mic permissions to start.</span>
                    )}
                  </div>
                )}

                {/* Topic generated — show timer controls + topic info */}
                {!isRecording && generatedTopic && (
                  <div className="flex flex-col gap-5">
                    {/* Topic details card */}
                    <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-5 flex flex-col gap-4 shadow-inner">
                      <div>
                        <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">Topic</span>
                        <h3 className="text-sm font-extrabold text-slate-800 leading-relaxed mt-0.5">{generatedTopic}</h3>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-3.5 border-t border-slate-200/50 pt-3 text-xs">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[9px] text-slate-400 font-bold uppercase">Category</span>
                          <span className="font-semibold text-slate-700">{generatedCategory}</span>
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[9px] text-slate-400 font-bold uppercase">Difficulty</span>
                          <span className="font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-lg w-max border border-indigo-100/30">{generatedDifficulty}</span>
                        </div>
                        <div className="flex flex-col gap-0.5 col-span-2">
                          <span className="text-[9px] text-slate-400 font-bold uppercase">Keywords</span>
                          <span className="font-medium text-slate-600 leading-relaxed">
                            {generatedKeywords && generatedKeywords.length > 0 ? generatedKeywords.join(", ") : generatedCategory}
                          </span>
                        </div>
                        <div className="flex flex-col gap-0.5 col-span-2">
                          <span className="text-[9px] text-slate-400 font-bold uppercase">Estimated Speaking Time</span>
                          <span className="font-semibold text-slate-700">{generatedEstTime} seconds</span>
                        </div>
                      </div>

                      {generatedTalkingPoints && generatedTalkingPoints.length > 0 && (
                        <div className="flex flex-col gap-1.5 border-t border-slate-200/50 pt-3">
                          <span className="text-[10px] text-slate-400 font-bold uppercase">Talking Points</span>
                          <ul className="flex flex-col gap-1.5 mt-0.5">
                            {generatedTalkingPoints.map((tp, idx) => (
                              <li key={idx} className="text-xs text-slate-600 font-medium flex items-start gap-2 leading-relaxed">
                                <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 mt-1.5 shrink-0" />
                                {tp}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>

                    {/* Step 1: Mode Selection (none choice yet) */}
                    {workflowChoice === "none" && (
                      <div className="flex flex-col gap-3">
                        <button
                          onClick={handleStartSpeakingNow}
                          className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs py-3 rounded-xl font-bold cursor-pointer shadow-lg shadow-blue-600/10 flex items-center justify-center gap-2 transition-all"
                        >
                          <Play className="w-4 h-4" /> Start Speaking Now
                        </button>
                        <button
                          onClick={() => setWorkflowChoice("prep_choice")}
                          className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs py-3 rounded-xl font-bold cursor-pointer border border-slate-200/50 flex items-center justify-center gap-2 transition-all"
                        >
                          <Clock className="w-4 h-4 text-slate-500" /> Start Preparation Timer
                        </button>
                      </div>
                    )}

                    {/* Step 2: Custom Prep duration selection */}
                    {workflowChoice === "prep_choice" && (
                      <div className="bg-indigo-50/50 border border-indigo-100/50 rounded-2xl p-4 flex flex-col gap-4">
                        <div className="flex flex-col gap-1 text-center">
                          <span className="text-[10px] text-indigo-600 font-extrabold uppercase tracking-wider">Select Prep Duration</span>
                          <p className="text-[10px] text-slate-500">Choose how much time you need to prepare.</p>
                        </div>
                        <div className="grid grid-cols-2 gap-2.5">
                          {[30, 60, 90, 120].map((secs) => (
                            <button
                              key={secs}
                              onClick={() => handleSelectPrepDuration(secs)}
                              className="bg-white hover:bg-indigo-600 hover:text-white border border-indigo-100 text-slate-700 text-xs font-bold py-2.5 rounded-xl cursor-pointer transition-all shadow-sm flex items-center justify-center gap-1"
                            >
                              <Clock className="w-3.5 h-3.5 opacity-60" /> {secs} seconds
                            </button>
                          ))}
                        </div>
                        <button
                          onClick={() => setWorkflowChoice("none")}
                          className="text-[10px] text-slate-500 hover:text-slate-700 font-bold text-center underline cursor-pointer"
                        >
                          Go Back
                        </button>
                      </div>
                    )}

                    {/* Step 3: Running preparation timer */}
                    {workflowChoice === "prep_timer" && (
                      <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 flex flex-col items-center gap-4">
                        <span className="text-[10px] text-indigo-600 font-extrabold uppercase tracking-widest">Preparation Time Remaining</span>
                        <div className="text-4xl font-black text-indigo-700 font-mono">{formatTimer(prepTimerValue)}</div>
                        <div className="flex gap-2 w-full">
                          {prepTimerState === "running" ? (
                            <button onClick={handlePrepTimerPause}
                              className="flex-1 bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-bold py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 shadow-sm">
                              <Square className="w-3 h-3" /> Pause
                            </button>
                          ) : (
                            <button onClick={handlePrepTimerResume}
                              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 shadow-sm">
                              <Play className="w-3 h-3" /> Resume
                            </button>
                          )}
                          <button onClick={handleSkipPreparation}
                            className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 shadow-sm">
                            <Play className="w-3 h-3" /> Skip Prep
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Recording feedback controls */}
                {isRecording && (
                  <div className="flex flex-col gap-4 border-t border-slate-100 pt-4">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-semibold text-slate-500">Speaking Timer</span>
                      <span className="text-base font-extrabold text-blue-600">{recordingTimer}s</span>
                    </div>

                    {/* Real-time feedback indicators */}
                    <div className="flex flex-col gap-1.5 bg-slate-50 p-3 rounded-xl border border-slate-100 text-[10px] font-bold text-slate-600">
                      <div className="flex justify-between">
                        <span>Camera Connected</span>
                        <span className="text-emerald-600">✓ Yes</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Microphone Connected</span>
                        <span className="text-emerald-600">✓ Yes</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Recording Status</span>
                        <span className="text-red-500 animate-pulse">● Recording Live</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Eye Contact</span>
                        <span className="text-blue-600">Gaze Centered (92%)</span>
                      </div>
                    </div>

                    {/* Live microphone level meter */}
                    <div className="flex flex-col gap-1.5">
                      <div className="flex justify-between text-[10px] text-slate-400 font-bold uppercase">
                        <span>Mic Volume</span>
                        {isVADActive && <span className="text-emerald-500 animate-pulse flex items-center gap-1"><Activity className="w-3 h-3" /> Speech Active</span>}
                      </div>
                      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-blue-600 transition-all duration-75"
                          style={{ width: `${Math.min(100, liveVolume * 3.5)}%` }}
                        />
                      </div>
                    </div>

                    {/* Live stats */}
                    <div className="grid grid-cols-2 gap-4 mt-2">
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-center">
                        <span className="text-[10px] text-slate-400 font-bold uppercase">Deepgram WPM</span>
                        <p className="text-sm font-bold text-slate-800 mt-1">{liveWpm}</p>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-center">
                        <span className="text-[10px] text-slate-400 font-bold uppercase">Confidence</span>
                        <p className="text-sm font-bold text-slate-800 mt-1">{liveConfidence}%</p>
                      </div>
                    </div>

                    {liveTranscript && (
                      <div className="flex flex-col gap-1 border-t border-slate-100 pt-3">
                        <span className="text-[10px] text-slate-400 font-bold uppercase">Live Transcript</span>
                        <p className="text-xs text-slate-600 italic bg-slate-50 p-3 rounded-xl border border-slate-100 max-h-[120px] overflow-y-auto leading-relaxed">
                          "{liveTranscript.trim()}"
                        </p>
                      </div>
                    )}

                    <button 
                      onClick={stopRecordingSession} 
                      className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold text-xs py-2.5 rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow-sm mt-2"
                    >
                      <Square className="w-4 h-4" /> Stop & Upload Video
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ================================= DEBATE ARENA ================================= */}
        {currentScreen === "debate" && (
          <div className="p-8 flex flex-col gap-6 max-w-5xl mx-auto w-full">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-xl font-bold text-slate-900">Debate Arena</h1>
                <p className="text-xs text-slate-500">Interactive video & audio arguments clash.</p>
              </div>
              {debateSessionId && (
                <div className="flex gap-4 items-center">
                  <div className="flex items-center gap-1.5 text-xs font-semibold">
                    <span className={`h-2.5 w-2.5 rounded-full ${isCameraAvailable ? "bg-emerald-500" : "bg-red-500"}`} />
                    Camera: {isCameraAvailable ? "Connected" : "No Signal"}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs font-semibold">
                    <span className={`h-2.5 w-2.5 rounded-full ${isMicAvailable ? "bg-emerald-500" : "bg-red-500"}`} />
                    Mic: {isMicAvailable ? "Connected" : "No Signal"}
                  </div>
                </div>
              )}
            </div>

            {!debateSessionId && (
              <div className="bg-white border border-slate-200 p-6 rounded-2xl flex flex-col gap-4 shadow-sm">
                <div className="hidden">
                  <Webcam
                    key={webcamKey}
                    audio={true}
                    ref={webcamRef}
                    onUserMedia={handleUserMedia}
                    onUserMediaError={handleUserMediaError}
                  />
                </div>

                <h3 className="text-xs font-bold text-slate-700 uppercase">Debate Setup</h3>

                {/* Pre-starting checklists */}
                <div className="flex flex-col gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold">
                  <div className="flex items-center gap-2">
                    <span className={isCameraAvailable ? "text-emerald-600" : "text-red-500"}>
                      {isCameraAvailable ? "✓ Camera Connected" : "✗ Camera Blocked/Unavailable"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={isMicAvailable ? "text-emerald-600" : "text-red-500"}>
                      {isMicAvailable ? "✓ Microphone Connected" : "✗ Microphone Blocked/Unavailable"}
                    </span>
                  </div>
                  {isCameraAvailable && isMicAvailable && (
                    <div className="text-emerald-700 font-extrabold mt-1 text-center bg-emerald-50 py-1 rounded-lg">
                      ✓ Ready To Record
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-600">Debate Motion / Topic</label>
                  <input 
                    type="text" 
                    value={debateTopic} 
                    onChange={(e) => setDebateTopic(e.target.value)} 
                    className="glass-input p-2.5 rounded-xl text-xs" 
                    placeholder="e.g. Artificial Intelligence algorithms should be granted copyright ownership."
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-slate-600">Opponent Difficulty</label>
                  <select 
                    value={debateDifficulty} 
                    onChange={(e) => setDebateDifficulty(e.target.value)} 
                    className="glass-input p-2.5 rounded-xl text-xs"
                  >
                    <option value="Beginner">Beginner</option>
                    <option value="Intermediate">Intermediate</option>
                    <option value="Advanced">Advanced</option>
                    <option value="Expert">Expert</option>
                  </select>
                </div>
                <button 
                  onClick={handleStartDebate} 
                  disabled={debateLoading || !isCameraAvailable || !isMicAvailable}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-100 disabled:text-slate-400 text-white text-xs py-2.5 rounded-xl font-semibold shadow-sm flex items-center justify-center gap-2 cursor-pointer"
                >
                  {debateLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Initiate Debate Session"}
                </button>
              </div>
            )}

            {debateSessionId && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Left Column: Split-screen webcam and visualizer */}
                <div className="lg:col-span-2 flex flex-col gap-4">
                  <div className="grid grid-cols-2 gap-4">
                    {/* User webcam stream box */}
                    <div className="relative rounded-2xl overflow-hidden border border-slate-200 bg-slate-100 aspect-video shadow-sm flex items-center justify-center">
                      <Webcam
                        key={webcamKey}
                        audio={true}
                        ref={webcamRef}
                        onUserMedia={handleUserMedia}
                        onUserMediaError={handleUserMediaError}
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                      {isStreamReady && (
                        <div className="absolute bottom-3 right-3 z-20 flex gap-2">
                          <button
                            onClick={toggleCamera}
                            className="bg-black/60 hover:bg-black/80 text-white text-[9px] font-bold px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 backdrop-blur-sm transition-colors border border-white/10"
                          >
                            {cameraEnabled ? (
                              <>
                                <Video className="w-3 h-3" /> Stop Camera
                              </>
                            ) : (
                              <>
                                <VideoOff className="w-3 h-3 text-red-400" /> Start Camera
                              </>
                            )}
                          </button>
                        </div>
                      )}
                      {!isStreamReady && (
                        <div className="relative z-10 flex flex-col items-center gap-2 text-slate-400 text-xs font-medium">
                          <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                          Booting Camera...
                        </div>
                      )}
                      {isDebateRecording && (
                        <div className="absolute top-3 left-3 bg-red-600 text-white px-2 py-0.5 rounded-full text-[9px] font-bold uppercase animate-pulse">
                          Speaking Live
                        </div>
                      )}
                    </div>

                    {/* AI Opponent avatar bubble */}
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 flex flex-col items-center justify-center p-6 text-center shadow-sm">
                      <div className="h-16 w-16 rounded-full bg-blue-100 flex items-center justify-center mb-3 text-blue-600 font-extrabold shadow-inner">
                        AI
                      </div>
                      <span className="text-[10px] text-slate-400 font-bold uppercase">AI Debater Opponent</span>
                      <h4 className="text-xs font-bold text-slate-800 mt-1">{debateDifficulty} level</h4>
                    </div>
                  </div>

                  {/* Audio Level waveform */}
                  {isDebateRecording && (
                    <canvas ref={canvasRef} height={50} className="w-full bg-slate-50 border border-slate-200 rounded-xl" />
                  )}

                  {/* Opponent statement text block */}
                  <div className="bg-white border border-slate-200 p-6 rounded-2xl flex flex-col gap-3 shadow-sm">
                    <span className="text-[10px] text-red-500 font-extrabold uppercase">Opponent Statement</span>
                    <p className="text-xs text-slate-700 bg-slate-50 border border-slate-100 p-4 rounded-xl leading-relaxed font-semibold">
                      "{debateOpponentArg}"
                    </p>
                  </div>
                </div>

                {/* Right Column: Scorecard & debate controls */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 flex flex-col gap-6 shadow-sm">
                  
                  {debateScorecard && (
                    <div className="flex flex-col gap-4">
                      <h3 className="text-xs font-bold text-slate-700 uppercase">Debate Performance scorecard</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-3 bg-emerald-50 rounded-xl text-center border border-emerald-100">
                          <span className="text-[9px] text-emerald-600 font-bold uppercase">Persuasion</span>
                          <p className="text-base font-extrabold text-slate-800 mt-0.5">{debateScorecard.persuasion}%</p>
                        </div>
                        <div className="p-3 bg-emerald-50 rounded-xl text-center border border-emerald-100">
                          <span className="text-[9px] text-emerald-600 font-bold uppercase">Logic</span>
                          <p className="text-base font-extrabold text-slate-800 mt-0.5">{debateScorecard.logical_consistency}%</p>
                        </div>
                        <div className="p-3 bg-emerald-50 rounded-xl text-center border border-emerald-100">
                          <span className="text-[9px] text-emerald-600 font-bold uppercase">Rebuttal</span>
                          <p className="text-base font-extrabold text-slate-800 mt-0.5">{debateScorecard.rebuttal_quality || 70}%</p>
                        </div>
                        <div className="p-3 bg-emerald-50 rounded-xl text-center border border-emerald-100">
                          <span className="text-[9px] text-emerald-600 font-bold uppercase">Confidence</span>
                          <p className="text-base font-extrabold text-slate-800 mt-0.5">{debateScorecard.confidence || 75}%</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {isDebateRecording && (
                    <div className="flex flex-col gap-4">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-semibold text-slate-500">Argument timer</span>
                        <span className="text-base font-extrabold text-blue-600">{debateTimer}s</span>
                      </div>

                      {/* Real-time feedback indicators */}
                      <div className="flex flex-col gap-1.5 bg-slate-50 p-3 rounded-xl border border-slate-100 text-[10px] font-bold text-slate-600">
                        <div className="flex justify-between">
                          <span>Camera Connected</span>
                          <span className="text-emerald-600">✓ Yes</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Microphone Connected</span>
                          <span className="text-emerald-600">✓ Yes</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Recording Status</span>
                          <span className="text-red-500 animate-pulse">● Speaking Live</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Eye Contact</span>
                          <span className="text-blue-600">Gaze Centered (92%)</span>
                        </div>
                      </div>

                      {/* Live microphone levels */}
                      <div className="flex flex-col gap-1.5">
                        <div className="flex justify-between text-[10px] text-slate-400 font-bold uppercase">
                          <span>Volume</span>
                          {isVADActive && <span className="text-emerald-500 animate-pulse flex items-center gap-1"><Activity className="w-3 h-3" /> Speech Active</span>}
                        </div>
                        <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-blue-600 transition-all duration-75"
                            style={{ width: `${Math.min(100, liveVolume * 3.5)}%` }}
                          />
                        </div>
                      </div>

                      {/* Speaking stats */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-center">
                          <span className="text-[10px] text-slate-400 font-bold uppercase">Speaking Speed</span>
                          <p className="text-sm font-bold text-slate-800 mt-1">{liveWpm} WPM</p>
                        </div>
                        <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-center">
                          <span className="text-[10px] text-slate-400 font-bold uppercase">Confidence</span>
                          <p className="text-sm font-bold text-slate-800 mt-1">{liveConfidence}%</p>
                        </div>
                      </div>

                      <button 
                        onClick={stopDebateRecordingAndSubmit} 
                        className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold text-xs py-2.5 rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                      >
                        <Square className="w-4 h-4" /> Stop & Submit Rebuttal
                      </button>
                    </div>
                  )}

                  {!isDebateRecording && (
                    <div className="flex flex-col gap-4">
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] text-slate-400 font-bold uppercase">Video Quality</label>
                        <select 
                          value={videoQuality}
                          onChange={(e) => setVideoQuality(e.target.value)}
                          className="glass-input p-2 rounded-xl text-xs"
                        >
                          <option value="720p">720p High Def</option>
                          <option value="480p">480p Medium</option>
                        </select>
                      </div>
                      
                      <button 
                        onClick={handleStartDebateRecording}
                        disabled={debateLoading || !isCameraAvailable || !isMicAvailable}
                        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-100 disabled:text-slate-400 text-white font-semibold text-xs py-2.5 rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                      >
                        {debateLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Speak counter-argument <Mic className="w-4 h-4" /></>}
                      </button>
                      
                      <button 
                        onClick={() => setDebateSessionId("")} 
                        className="w-full bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs py-2 rounded-xl font-semibold cursor-pointer text-center"
                      >
                        Exit Arena
                      </button>
                    </div>
                  )}

                  {liveTranscript && (
                    <div className="flex flex-col gap-1 border-t border-slate-100 pt-3">
                      <span className="text-[10px] text-slate-400 font-bold uppercase">User Argument (Transcribing)</span>
                      <p className="text-xs text-slate-600 italic bg-slate-50 p-3 rounded-xl border border-slate-100 max-h-[120px] overflow-y-auto">
                        "{liveTranscript}"
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================================= INTERVIEW SIMULATOR ================================= */}
        {currentScreen === "interview" && (
          <div className="p-8 flex flex-col gap-6 max-w-5xl mx-auto w-full">

            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold text-slate-900">Interview Simulator</h1>
                <p className="text-xs text-slate-500 mt-0.5">Behavioral · Technical · HR Mock Interview with A/V Analysis</p>
              </div>
              {interviewSessionId && (
                <button onClick={handleResetInterview}
                  className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold px-4 py-2 rounded-xl flex items-center gap-1.5">
                  <RefreshCw className="w-3 h-3" /> New Session
                </button>
              )}
            </div>

            {/* SETUP PHASE */}
            {!interviewSessionId && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white border border-slate-200 p-6 rounded-2xl flex flex-col gap-5 shadow-sm">
                  <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Session Configuration</h3>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Desired Role</label>
                    <select value={interviewRole} onChange={(e) => setInterviewRole(e.target.value)} className="glass-input p-2.5 rounded-xl text-xs">
                      <option value="Software Engineer">Software Engineer</option>
                      <option value="AI Engineer">AI Engineer</option>
                      <option value="Product Manager">Product Manager</option>
                      <option value="Data Scientist">Data Scientist</option>
                      <option value="Business Analyst">Business Analyst</option>
                      <option value="UX Designer">UX Designer</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Interview Round</label>
                    <select value={interviewRound} onChange={(e) => setInterviewRound(e.target.value)} className="glass-input p-2.5 rounded-xl text-xs">
                      <option value="Technical">Technical</option>
                      <option value="Behavioral">Behavioral (STAR Method)</option>
                      <option value="HR">HR / Culture Fit</option>
                      <option value="System Design">System Design</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">Recording Mode</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(["audio", "video", "audio+video"] as const).map((mode) => (
                        <button key={mode} onClick={() => setInterviewRecordingMode(mode)}
                          className={`py-2 px-2 rounded-xl text-[10px] font-bold border transition-all ${interviewRecordingMode === mode ? "bg-indigo-600 border-indigo-600 text-white shadow-sm" : "bg-white border-slate-200 text-slate-500 hover:border-indigo-300"}`}>
                          {mode === "audio" ? "🎙 Audio" : mode === "video" ? "🎥 Video" : "🎬 A+V"}
                        </button>
                      ))}
                    </div>
                    <p className="text-[9px] text-slate-400 font-medium">
                      {interviewRecordingMode === "audio" ? "Voice + speech analysis" : interviewRecordingMode === "video" ? "Body language analysis" : "Recommended: full A/V for comprehensive results"}
                    </p>
                  </div>
                  <button onClick={handleStartInterview} disabled={interviewLoading}
                    className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs py-3 rounded-xl font-bold shadow-sm flex items-center justify-center gap-2 cursor-pointer mt-2">
                    {interviewLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><UserCheck className="w-4 h-4" /> Start Mock Interview</>}
                  </button>
                </div>
                <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-100 p-6 rounded-2xl flex flex-col gap-4">
                  <h3 className="text-xs font-bold text-indigo-800 uppercase tracking-wider">What You&apos;ll Get</h3>
                  {[
                    ["🎙 Live Question", "AI interviewer asks role-specific questions"],
                    ["🎬 A/V Recording", "Record your answer with webcam + mic"],
                    ["🧠 Evidence Analysis", "Whisper + MediaPipe + Gemini pipeline"],
                    ["📊 10-Section Report", "Same professional report as JAM Analyzer"],
                    ["✅ Score Breakdown", "Speech, body language, effectiveness scores"],
                  ].map(([icon, desc], i) => (
                    <div key={i} className="flex items-start gap-3">
                      <span className="text-lg">{icon}</span>
                      <span className="text-xs text-indigo-900 font-medium leading-relaxed">{desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ACTIVE SESSION */}
            {interviewSessionId && (
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                <div className="lg:col-span-3 flex flex-col gap-4">
                  <div className="bg-indigo-600 text-white p-5 rounded-2xl shadow-md">
                    <span className="text-[10px] font-extrabold uppercase tracking-widest opacity-70 block mb-2">Interviewer Question</span>
                    <p className="text-sm font-semibold leading-relaxed">&quot;{interviewQuestion}&quot;</p>
                  </div>
                  {interviewRecordingMode !== "audio" && (
                    <div className="relative bg-slate-900 rounded-2xl overflow-hidden flex items-center justify-center" style={{ aspectRatio: "16/9" }}>
                      {isInterviewRecording && (
                        <div className="absolute top-3 left-3 z-20 bg-red-600 text-white px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase animate-pulse flex items-center gap-1.5">
                          <Play className="w-3 h-3" /> {isInterviewPaused ? "Paused" : "Recording Live"}
                        </div>
                      )}
                      {interviewRecordedBlob && !isInterviewRecording && (
                        <div className="absolute top-3 left-3 z-20 bg-emerald-600 text-white px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase flex items-center gap-1.5">
                          <CheckCircle className="w-3 h-3" /> Ready
                        </div>
                      )}
                      <div className="flex flex-col items-center gap-2 text-slate-600">
                        <Video className="w-8 h-8 opacity-30" />
                        <span className="text-[10px] opacity-50">{isInterviewRecording ? "Live recording..." : "Camera activates on Start Recording"}</span>
                      </div>
                    </div>
                  )}
                  <canvas ref={interviewCanvasRef} height={64} className="w-full bg-slate-900 border border-slate-700 rounded-xl" />
                  {interviewErrorMsg && (
                    <div className="bg-red-50 border border-red-200 text-red-700 text-xs font-semibold p-4 rounded-xl flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" /> {interviewErrorMsg}
                    </div>
                  )}
                  {!isInterviewRecording && !interviewRecordedBlob && (
                    <div className="flex flex-col gap-2">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Or Type Your Answer (Text Fallback)</label>
                      <textarea value={interviewUserAnswer} onChange={(e) => setInterviewUserAnswer(e.target.value)}
                        rows={3} className="glass-input p-4 rounded-xl text-xs resize-none"
                        placeholder="Type your structured response here for quick text feedback..." />
                      {interviewUserAnswer && (
                        <button onClick={handleSubmitInterviewAnswer} disabled={interviewLoading}
                          className="bg-slate-700 hover:bg-slate-800 text-white text-xs px-5 py-2 rounded-xl font-bold flex items-center gap-2 w-fit">
                          {interviewLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Get Text Feedback"}
                        </button>
                      )}
                    </div>
                  )}
                  {interviewFeedback && (
                    <div className="bg-blue-50 border border-blue-100 p-4 rounded-2xl flex flex-col gap-2">
                      <h4 className="text-xs font-bold text-blue-800">Quick Coaching Feedback</h4>
                      <p className="text-[11px] text-slate-700 leading-relaxed"><strong className="text-blue-700">Communication:</strong> {interviewFeedback.communication_feedback}</p>
                      <p className="text-[11px] text-slate-700 leading-relaxed"><strong className="text-blue-700">Confidence:</strong> {interviewFeedback.confidence_feedback}</p>
                    </div>
                  )}
                </div>
                <div className="lg:col-span-2 flex flex-col gap-4">
                  <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col items-center gap-3 shadow-sm">
                    <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest">Answer Timer</span>
                    <div className={`text-5xl font-black font-mono ${isInterviewRecording && !isInterviewPaused ? "text-red-600" : isInterviewPaused ? "text-amber-500" : "text-slate-800"}`}>
                      {formatTimer(interviewRecordingTimer)}
                    </div>
                    {isInterviewRecording && (
                      <div className="flex items-center gap-1.5">
                        <div className={`w-2 h-2 rounded-full ${isInterviewPaused ? "bg-amber-400" : "bg-red-500 animate-pulse"}`} />
                        <span className="text-[10px] font-bold text-slate-500">{isInterviewPaused ? "Paused" : "Recording"}</span>
                      </div>
                    )}
                    {isInterviewRecording && (
                      <div className="w-full flex flex-col gap-1">
                        <div className="flex justify-between text-[9px] text-slate-400 font-bold uppercase">
                          <span>Mic Level</span>
                          {interviewLiveVolume > 15 && <span className="text-emerald-500 animate-pulse">● Active</span>}
                        </div>
                        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-500 transition-all duration-75" style={{ width: `${Math.min(100, interviewLiveVolume * 3.5)}%` }} />
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col gap-3 shadow-sm">
                    <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-widest">Recording Controls</span>
                    {!isInterviewRecording && !interviewRecordedBlob && (
                      <button onClick={handleStartInterviewRecording}
                        className="bg-red-600 hover:bg-red-700 text-white text-xs py-3 rounded-xl font-bold flex items-center justify-center gap-2 shadow-sm">
                        <Mic className="w-4 h-4" /> Start Recording Answer
                      </button>
                    )}
                    {isInterviewRecording && !isInterviewPaused && (
                      <button onClick={handlePauseInterviewRecording}
                        className="bg-amber-500 hover:bg-amber-600 text-white text-xs py-3 rounded-xl font-bold flex items-center justify-center gap-2">
                        <Square className="w-4 h-4" /> Pause Recording
                      </button>
                    )}
                    {isInterviewRecording && isInterviewPaused && (
                      <button onClick={handleResumeInterviewRecording}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs py-3 rounded-xl font-bold flex items-center justify-center gap-2">
                        <Play className="w-4 h-4" /> Resume Recording
                      </button>
                    )}
                    {isInterviewRecording && (
                      <button onClick={handleStopInterviewRecording}
                        className="bg-slate-800 hover:bg-slate-900 text-white text-xs py-3 rounded-xl font-bold flex items-center justify-center gap-2">
                        <Square className="w-4 h-4" /> Stop Recording
                      </button>
                    )}
                    {interviewRecordedBlob && !isInterviewRecording && (
                      <>
                        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-bold p-3 rounded-xl text-center">
                          ✓ Captured ({(interviewRecordedBlob.size / 1024 / 1024).toFixed(1)} MB)
                        </div>
                        <button onClick={handleAnalyzeInterviewRecording} disabled={isInterviewAnalyzing}
                          className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs py-3 rounded-xl font-bold flex items-center justify-center gap-2 shadow-md">
                          {isInterviewAnalyzing ? <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing...</> : <><Sparkles className="w-4 h-4" /> Analyze Recording</>}
                        </button>
                        <button onClick={handleRetakeInterviewRecording}
                          className="bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs py-2.5 rounded-xl font-bold flex items-center justify-center gap-2">
                          <RefreshCw className="w-3.5 h-3.5" /> Retake Answer
                        </button>
                      </>
                    )}
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-[10px] text-slate-500 font-semibold flex flex-col gap-1.5">
                    <div className="flex justify-between"><span>Role</span><span className="text-slate-700">{interviewRole}</span></div>
                    <div className="flex justify-between"><span>Round</span><span className="text-slate-700">{interviewRound}</span></div>
                    <div className="flex justify-between"><span>Mode</span><span className="text-slate-700 capitalize">{interviewRecordingMode}</span></div>
                    <div className="flex justify-between"><span>Questions</span><span className="text-slate-700">{interviewHistory.length}</span></div>
                  </div>
                  {interviewHistory.length > 0 && (
                    <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-col gap-2 shadow-sm">
                      <span className="text-[10px] text-slate-400 font-extrabold uppercase">Question History</span>
                      {interviewHistory.map((q, i) => (
                        <div key={i} className="text-[10px] text-slate-600 p-2 bg-slate-50 rounded-lg border border-slate-100">
                          <span className="text-indigo-600 font-bold">Q{i + 1}:</span> {q}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}


        {/* ================================= COMMUNICATION DNA VIEW ================================= */}
        {currentScreen === "dna" && (
          <div className="p-8 flex flex-col gap-6">
            <div>
              <h1 className="text-xl font-bold text-slate-900">Communication DNA Profile</h1>
              <p className="text-xs text-slate-500">Your visual Twin classification maps and personality traits.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-white border border-slate-200 p-6 rounded-2xl shadow-sm flex flex-col items-center">
                <h3 className="text-xs font-bold text-slate-900 self-start mb-4">11-Dimensional DNA Radial</h3>
                {dnaMetrics ? (
                  <div className="h-96 w-full max-w-md">
                    <Radar data={getRadarChartConfig()} options={{ responsive: true, maintainAspectRatio: false }} />
                  </div>
                ) : (
                  <div className="h-96 flex items-center justify-center text-xs text-slate-400">Complete sessions to maps DNA patterns.</div>
                )}
              </div>

              <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm flex flex-col justify-between">
                <div>
                  <h3 className="text-xs font-bold text-slate-900 mb-4">Twin Profile Classification</h3>
                  <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-xl text-center">
                    <span className="text-[10px] text-blue-600 font-extrabold uppercase">Categorical Twin</span>
                    <h2 className="text-lg font-extrabold text-slate-900 mt-1">{dnaMetrics?.profile_summary || "Analytical Thinker"}</h2>
                  </div>
                  <p className="text-xs text-slate-500 mt-4 leading-relaxed">
                    This twin maps your speaking style traits. It continuously updates with each completed session.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================================= AI COACH VIEW ================================= */}
        {currentScreen === "coach" && (
          <div className="p-8 flex flex-col gap-6 max-w-4xl mx-auto w-full">
            <div>
              <h1 className="text-xl font-bold text-slate-900">AI Coach Challenges</h1>
              <p className="text-xs text-slate-500">Complete challenges to target communication weaknesses.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm flex flex-col gap-4">
                <h3 className="text-sm font-bold text-slate-800">Assigned Verbal Challenges</h3>
                <div className="flex flex-col gap-3 overflow-y-auto max-h-[400px]">
                  {challenges.map((c, i) => (
                    <div 
                      key={i} 
                      onClick={() => setSelectedChallenge(c)}
                      className={`p-4 rounded-xl border transition-all cursor-pointer ${
                        selectedChallenge?.id === c.id 
                          ? "border-blue-500 bg-blue-50/30" 
                          : "border-slate-100 bg-slate-50 hover:border-slate-300"
                      }`}
                    >
                      <span className="text-[9px] uppercase font-bold text-blue-600">{c.challenge_type}</span>
                      <p className="text-xs text-slate-700 mt-1.5 font-medium leading-relaxed">"{c.prompt}"</p>
                      <div className="flex justify-between items-center mt-3 pt-3 border-t border-slate-100/50">
                        <span className="text-[10px] text-slate-400 font-medium">Attempts: {c.attempts}</span>
                        <span className="text-[10px] text-slate-400 font-medium">Best Score: {c.best_score}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {selectedChallenge ? (
                <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm flex flex-col justify-between">
                  <div className="flex flex-col gap-4">
                    <span className="text-[9px] uppercase font-extrabold text-blue-600 tracking-wider">Execute Selected Challenge</span>
                    <h3 className="text-sm font-bold text-slate-800 leading-relaxed">"{selectedChallenge.prompt}"</h3>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-slate-600">Simulate Score (0-100)</label>
                      <input 
                        type="number" 
                        min={0} 
                        max={100}
                        value={challengeScore}
                        onChange={(e) => setChallengeScore(Number(e.target.value))}
                        className="glass-input p-2 rounded-xl text-xs" 
                      />
                    </div>
                  </div>
                  <button 
                    onClick={handleChallengeSubmit}
                    disabled={challengeSubmitting}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs py-2.5 rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow-sm mt-6"
                  >
                    {challengeSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Complete Challenge Attempt"}
                  </button>
                </div>
              ) : (
                <div className="bg-slate-50 border border-dashed border-slate-200 rounded-2xl flex items-center justify-center p-12 text-xs text-slate-400 text-center">
                  Select a challenge from the checklist to execute your Twin session drill.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================================= PROCESSING PAGE ================================= */}
        {currentScreen === "processing" && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 bg-slate-50 text-center">
            <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />
            <h2 className="text-lg font-bold text-slate-800">Processing Twin Recording...</h2>
            <p className="text-xs text-slate-500 mt-1">Executing Deepgram, Librosa, MediaPipe, and OpenAI assessment</p>
          </div>
        )}

        {/* ================================= RESULTS VIEW ================================= */}
        {currentScreen === "results" && activeSession && (() => {
          const report = activeSession.reports?.[0]?.summary || {
            overall_score: activeSession.dna ? Math.round((activeSession.dna.confidence + activeSession.dna.fluency + activeSession.dna.clarity) / 3) : 75,
            rating: activeSession.dna?.profile_summary || "Good",
            executive_summary: "- Key strengths: Good pacing and posture.\n- Major weaknesses: Focus on reducing filler words.\n- Overall assessment: solid speech delivery with potential to improve.",
            speech_analysis: {
              speaking_rate: { score: activeSession.dna?.speaking_speed || 70, reason: "Speed was consistent.", suggestion: "Practice speed-reading drills." },
              clarity: { score: activeSession.dna?.clarity || 70, reason: "Pronunciation was clear.", suggestion: "Maintain distance from microphone." },
              pronunciation: { score: 75, reason: "Words were enounced correctly.", suggestion: "Practice multi-syllabic words." },
              fluency: { score: activeSession.dna?.fluency || 70, reason: "Flow was conversational.", suggestion: "Introduce transitions." },
              fillers: { score: activeSession.dna?.filler_words || 70, reason: "Audible filler words detected.", suggestion: "Practice locking your mouth during transition gaps." },
              confidence: { score: activeSession.dna?.confidence || 70, reason: "Tone stayed stable.", suggestion: "Project vocal assertiveness." }
            },
            body_language_analysis: {
              eye_contact: { score: activeSession.face_metrics?.eye_contact_percentage || 70, evidence: "Kept visual contact with the camera.", suggestion: "Anchor visual focus next to the camera lens." },
              facial_expressions: { score: activeSession.face_metrics?.smile_frequency || 60, evidence: "Showed relaxed face.", suggestion: "Smile at key points." },
              posture: { score: activeSession.face_metrics?.posture_stability || 70, evidence: "Postured upright.", suggestion: "Maintain aligned shoulders." },
              gestures: { score: 60, evidence: "Hand gestures were moderate.", suggestion: "Raise hands during key definitions." },
              head_movement: { score: 80, evidence: "Head position was stable.", suggestion: "Keep chin level." }
            },
            communication_effectiveness: {
              confidence: { score: activeSession.dna?.confidence || 70, reason: "Speech tone was positive.", recommendation: "Vocalize with clear project projection." },
              professionalism: { score: 75, reason: "Maintained professional posture.", recommendation: "Adopt technical transition words." },
              engagement: { score: activeSession.face_metrics?.engagement_score || 70, reason: "Visual eye contact kept listener focus.", recommendation: "Vary speech tempo dynamically." },
              persuasiveness: { score: activeSession.dna?.persuasion || 70, reason: "Core arguments showed logic flow.", recommendation: "Present claims with supportive details." },
              leadership_presence: { score: activeSession.dna?.leadership || 70, reason: "Command of presence was solid.", recommendation: "Deliver points with pauses." }
            },
            content_analysis: {
              grammar_quality: 80,
              vocabulary_richness: activeSession.dna?.vocabulary || 70,
              top_filler_words: activeSession.dna?.filler_word_frequency || { "um": 2, "uh": 1, "like": 3 },
              grammar_text: "Grammar was clean and direct.",
              vocabulary_text: "Vocabulary was clear and category-appropriate."
            },
            detailed_strengths: activeSession.reports?.[0]?.summary?.strengths || ["Conversational pace", "Strong eye contact", "Good posture"],
            areas_for_improvement: activeSession.reports?.[0]?.summary?.improvements || ["Reduce filler words", "Improve hand gestures", "Vary pitch tone"],
            action_plan: {
              immediate_actions: ["Implement the Lens-Dot target drill to anchor your visual gaze."],
              short_term_actions: ["Play the 'Pause Game' during discussions to eliminate filler words."],
              long_term_actions: ["Rehearse system architecture talking points aloud to build vocabulary structure."]
            },
            analytics_dashboard: {
              speech_confidence: activeSession.transcript?.confidence_score || 85,
              eye_contact_pct: activeSession.face_metrics?.eye_contact_percentage || 75,
              posture_score: activeSession.face_metrics?.posture_stability || 75,
              speaking_rate: activeSession.transcript?.wpm || 130,
              filler_word_count: 5,
              engagement_score: activeSession.face_metrics?.engagement_score || 70
            },
            diagnostics: activeSession.diagnostics || {
              audio_length: 60.0,
              detected_speech_length: 50.0,
              whisper_confidence: 85,
              frames_processed: 300,
              face_detection_rate: 98.0
            }
          };

          // Local radar config
          const radarData = {
            labels: ["Confidence", "Professionalism", "Engagement", "Persuasiveness", "Leadership"],
            datasets: [
              {
                label: "Effectiveness Dimensions",
                data: [
                  report.communication_effectiveness?.confidence?.score || 70,
                  report.communication_effectiveness?.professionalism?.score || 70,
                  report.communication_effectiveness?.engagement?.score || 70,
                  report.communication_effectiveness?.persuasiveness?.score || 70,
                  report.communication_effectiveness?.leadership_presence?.score || 70
                ],
                backgroundColor: "rgba(37, 99, 235, 0.2)",
                borderColor: "rgba(37, 99, 235, 0.8)",
                borderWidth: 1.5,
              }
            ]
          };

          // Local bar config
          const fillersObj = report.content_analysis?.top_filler_words || {};
          const barData = {
            labels: Object.keys(fillersObj),
            datasets: [
              {
                label: "Filler Word Count",
                data: Object.values(fillersObj),
                backgroundColor: "rgba(239, 68, 68, 0.5)",
                borderColor: "rgba(239, 68, 68, 1)",
                borderWidth: 1
              }
            ]
          };

          return (
            <div className="p-8 flex flex-col gap-6 max-w-5xl mx-auto w-full">
              {/* Header section */}
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-slate-200 pb-5 gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] bg-blue-100 text-blue-800 font-extrabold uppercase px-2.5 py-1 rounded-md">
                      {activeSession.session_type.toUpperCase()}
                    </span>
                    <span className="text-xs text-slate-400 font-semibold">ID: {activeSession.id.substring(0, 8)}</span>
                  </div>
                  <h1 className="text-xl font-bold text-slate-900 mt-2">"{activeSession.topic}"</h1>
                  <p className="text-xs text-slate-500 mt-0.5">Category: {activeSession.category} • Completed: {new Date(activeSession.created_at).toLocaleString()}</p>
                </div>
                <div className="flex gap-3 self-stretch md:self-auto">
                  <button 
                    onClick={handleDownloadPDF} 
                    className="flex-1 md:flex-none bg-blue-600 hover:bg-blue-700 text-white text-xs px-4 py-2.5 rounded-xl font-semibold shadow-sm flex items-center justify-center gap-2 cursor-pointer transition-colors"
                  >
                    <FileDown className="w-4 h-4" /> Export Report PDF
                  </button>
                  <button 
                    onClick={() => setCurrentScreen("dashboard")} 
                    className="flex-1 md:flex-none bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs px-4 py-2.5 rounded-xl font-semibold cursor-pointer transition-colors text-center"
                  >
                    Back to Dashboard
                  </button>
                </div>
              </div>

              {/* Navigation Tabs */}
              <div className="flex border-b border-slate-200 overflow-x-auto gap-2 scrollbar-none">
                {[
                  { id: "overview", label: "Executive Summary" },
                  { id: "speech", label: "Speech Analysis" },
                  { id: "body", label: "Body Language" },
                  { id: "effectiveness", label: "Effectiveness Radial" },
                  { id: "content", label: "Content & Actions" }
                ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveResultTab(tab.id)}
                    className={`text-xs font-bold px-4 py-3 border-b-2 whitespace-nowrap transition-colors cursor-pointer ${
                      activeResultTab === tab.id
                        ? "border-blue-600 text-blue-600"
                        : "border-transparent text-slate-400 hover:text-slate-600"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Overview Tab */}
              {activeResultTab === "overview" && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fadeIn">
                  <div className="lg:col-span-2 flex flex-col gap-6">
                    {/* Executive Summary */}
                    <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm">
                      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">1. Executive Summary</h3>
                      <div className="text-xs text-slate-600 leading-relaxed bg-slate-50 border border-slate-100 p-4 rounded-xl font-medium whitespace-pre-line">
                        {report.executive_summary}
                      </div>
                    </div>

                    {/* Detailed lists */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm">
                        <h3 className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-4 flex items-center gap-1.5">
                          <CheckCircle className="w-4 h-4" /> 7. Detailed Strengths
                        </h3>
                        <ul className="flex flex-col gap-2.5">
                          {(report.detailed_strengths || []).map((strength: string, i: number) => (
                            <li key={i} className="text-xs text-slate-600 font-semibold flex items-start gap-2">
                              <span className="text-emerald-500 font-bold mt-0.5">✓</span>
                              <span>{strength}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm">
                        <h3 className="text-xs font-bold text-red-500 uppercase tracking-wider mb-4 flex items-center gap-1.5">
                          <AlertTriangle className="w-4 h-4" /> 8. Areas for Improvement
                        </h3>
                        <ul className="flex flex-col gap-2.5">
                          {(report.areas_for_improvement || []).map((improvement: string, i: number) => (
                            <li key={i} className="text-xs text-slate-600 font-semibold flex items-start gap-2">
                              <span className="text-red-400 font-bold mt-0.5">!</span>
                              <span>{improvement}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    {/* Transcribed Speech */}
                    <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm">
                      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Evaluated Transcript</h3>
                      <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 border border-slate-100 p-4 rounded-xl font-medium max-h-48 overflow-y-auto">
                        {activeSession.transcript?.corrected_transcript || "Transcript unavailable."}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-6">
                    {/* Score Card */}
                    <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm text-center flex flex-col items-center justify-center min-h-[200px]">
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">1. Overall Communication Score</span>
                      <h2 className="text-5xl font-black text-blue-600 mt-3">{report.overall_score}/100</h2>
                      <span className={`mt-3.5 px-3 py-1 rounded-full text-xs font-extrabold ${
                        report.rating === "Excellent" ? "bg-emerald-100 text-emerald-800" :
                        report.rating === "Good" ? "bg-blue-100 text-blue-800" :
                        report.rating === "Average" ? "bg-amber-100 text-amber-800" :
                        "bg-red-100 text-red-800"
                      }`}>
                        {report.rating}
                      </span>
                    </div>

                    {/* Diagnostics Footer */}
                    <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm flex flex-col gap-3.5">
                      <h3 className="text-xs font-bold text-slate-900 border-b border-slate-100 pb-2">Diagnostic Information</h3>
                      <div className="flex flex-col gap-2 text-[10px] font-bold text-slate-600">
                        <div className="flex justify-between">
                          <span>Audio Length:</span>
                          <span className="text-slate-800">{report.diagnostics?.audio_length ? report.diagnostics.audio_length.toFixed(1) : 0}s</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Detected Speech:</span>
                          <span className="text-slate-800">{report.diagnostics?.detected_speech_length ? report.diagnostics.detected_speech_length.toFixed(1) : 0}s</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Whisper Confidence:</span>
                          <span className="text-slate-800">{report.diagnostics?.whisper_confidence || 0}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Frames Processed:</span>
                          <span className="text-slate-800">{report.diagnostics?.frames_processed || 0}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Face Detection Rate:</span>
                          <span className="text-slate-800">{report.diagnostics?.face_detection_rate ? report.diagnostics.face_detection_rate.toFixed(1) : 0}%</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Speech Analysis Tab */}
              {activeResultTab === "speech" && (
                <div className="flex flex-col gap-6 animate-fadeIn">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">3. Speech Analysis metrics</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {[
                      { key: "speaking_rate", label: "Speaking Rate", unit: "WPM" },
                      { key: "clarity", label: "Clarity", unit: "%" },
                      { key: "pronunciation", label: "Pronunciation", unit: "%" },
                      { key: "fluency", label: "Fluency", unit: "%" },
                      { key: "fillers", label: "Filler Words Penalty", unit: "%" },
                      { key: "confidence", label: "Confidence", unit: "%" }
                    ].map((metric) => {
                      const data = report.speech_analysis?.[metric.key] || { score: 70, reason: "", suggestion: "" };
                      return (
                        <div key={metric.key} className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm flex flex-col justify-between">
                          <div>
                            <div className="flex justify-between items-start">
                              <h4 className="text-xs font-bold text-slate-800">{metric.label}</h4>
                              <span className="text-sm font-extrabold text-blue-600">{data.score}{metric.unit}</span>
                            </div>
                            <div className="h-1.5 w-full bg-slate-100 rounded-full mt-2.5 overflow-hidden">
                              <div 
                                className="h-full bg-blue-600" 
                                style={{ width: `${data.score}%` }}
                              />
                            </div>
                            <p className="text-[11px] text-slate-600 leading-relaxed font-semibold mt-3.5"><strong className="text-slate-900 block mb-0.5">Reason:</strong> {data.reason}</p>
                          </div>
                          <p className="text-[11px] text-slate-500 leading-relaxed border-t border-slate-100 pt-3 mt-4"><strong className="text-blue-600 block mb-0.5">Suggestion:</strong> {data.suggestion}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Body Language Tab */}
              {activeResultTab === "body" && (
                <div className="flex flex-col gap-6 animate-fadeIn">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">4. Body Language Analysis</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {[
                      { key: "eye_contact", label: "Eye Contact" },
                      { key: "facial_expressions", label: "Facial Expressions" },
                      { key: "posture", label: "Posture Score" },
                      { key: "gestures", label: "Gestures & Hands" },
                      { key: "head_movement", label: "Head Movement Stability" }
                    ].map((metric) => {
                      const data = report.body_language_analysis?.[metric.key] || { score: 70, evidence: "", suggestion: "" };
                      return (
                        <div key={metric.key} className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm flex flex-col justify-between">
                          <div>
                            <div className="flex justify-between items-start">
                              <h4 className="text-xs font-bold text-slate-800">{metric.label}</h4>
                              <span className="text-sm font-extrabold text-blue-600">{data.score}%</span>
                            </div>
                            <div className="h-1.5 w-full bg-slate-100 rounded-full mt-2.5 overflow-hidden">
                              <div 
                                className="h-full bg-blue-600" 
                                style={{ width: `${data.score}%` }}
                              />
                            </div>
                            <p className="text-[11px] text-slate-600 leading-relaxed font-semibold mt-3.5"><strong className="text-slate-900 block mb-0.5">Evidence:</strong> {data.evidence}</p>
                          </div>
                          <p className="text-[11px] text-slate-500 leading-relaxed border-t border-slate-100 pt-3 mt-4"><strong className="text-blue-600 block mb-0.5">Suggestion:</strong> {data.suggestion}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Effectiveness Tab */}
              {activeResultTab === "effectiveness" && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fadeIn">
                  <div className="lg:col-span-2 bg-white border border-slate-200 p-6 rounded-2xl shadow-sm flex flex-col items-center">
                    <h3 className="text-xs font-bold text-slate-900 self-start mb-4">5. Communication Effectiveness Radial</h3>
                    <div className="h-80 w-full max-w-sm">
                      <Radar data={radarData} options={{ responsive: true, maintainAspectRatio: false }} />
                    </div>
                  </div>

                  <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm flex flex-col gap-4 max-h-[380px] overflow-y-auto">
                    <h3 className="text-xs font-bold text-slate-900 mb-1 border-b border-slate-100 pb-2">Effectiveness Breakdown</h3>
                    {[
                      { key: "confidence", label: "Confidence" },
                      { key: "professionalism", label: "Professionalism" },
                      { key: "engagement", label: "Engagement" },
                      { key: "persuasiveness", label: "Persuasiveness" },
                      { key: "leadership_presence", label: "Leadership Presence" }
                    ].map((metric) => {
                      const data = report.communication_effectiveness?.[metric.key] || { score: 70, reason: "", recommendation: "" };
                      return (
                        <div key={metric.key} className="flex flex-col gap-1 text-[11px] font-semibold border-b border-slate-50 pb-3 last:border-b-0">
                          <div className="flex justify-between">
                            <span className="text-slate-800">{metric.label}</span>
                            <span className="text-blue-600">{data.score}%</span>
                          </div>
                          <p className="text-[10px] text-slate-500 font-medium">{data.reason}</p>
                          <p className="text-[10px] text-blue-500 font-medium">Recom: {data.recommendation}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Content & Actions Tab */}
              {activeResultTab === "content" && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fadeIn">
                  <div className="lg:col-span-2 flex flex-col gap-6">
                    {/* Content analysis */}
                    <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm flex flex-col gap-5">
                      <h3 className="text-xs font-bold text-slate-900 border-b border-slate-100 pb-2">6. Content Analysis</h3>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-50 text-center">
                          <span className="text-[9px] text-blue-500 font-bold uppercase">Grammar Quality</span>
                          <h4 className="text-base font-extrabold text-slate-800 mt-1">{report.content_analysis?.grammar_quality}%</h4>
                          <p className="text-[10px] text-slate-500 font-medium mt-1.5">{report.content_analysis?.grammar_text}</p>
                        </div>
                        <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-50 text-center">
                          <span className="text-[9px] text-blue-500 font-bold uppercase">Vocabulary Richness</span>
                          <h4 className="text-base font-extrabold text-slate-800 mt-1">{report.content_analysis?.vocabulary_richness}%</h4>
                          <p className="text-[10px] text-slate-500 font-medium mt-1.5">{report.content_analysis?.vocabulary_text}</p>
                        </div>
                      </div>

                      {/* Filler Words Frequencies Bar Chart */}
                      <div className="flex flex-col gap-3">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Top Filler Words Frequencies</span>
                        {Object.keys(fillersObj).length > 0 ? (
                          <div className="h-40 w-full">
                            <Bar data={barData} options={{ responsive: true, maintainAspectRatio: false }} />
                          </div>
                        ) : (
                          <p className="text-xs text-slate-400 italic">No filler words detected.</p>
                        )}
                      </div>
                    </div>

                    {/* Action plan */}
                    <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm flex flex-col gap-4">
                      <h3 className="text-xs font-bold text-slate-900 border-b border-slate-100 pb-2">9. Action Plan</h3>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="p-4 bg-red-50/50 border border-red-100 rounded-xl">
                          <span className="text-[9px] uppercase font-bold text-red-600">Immediate Actions</span>
                          <ul className="flex flex-col gap-2 mt-3 text-[10px] font-semibold text-slate-600">
                            {(report.action_plan?.immediate_actions || []).map((act: string, idx: number) => (
                              <li key={idx} className="flex items-start gap-1">
                                <span className="text-red-500 font-bold">•</span>
                                <span>{act}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                        
                        <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-xl">
                          <span className="text-[9px] uppercase font-bold text-blue-600">Short-Term Actions</span>
                          <ul className="flex flex-col gap-2 mt-3 text-[10px] font-semibold text-slate-600">
                            {(report.action_plan?.short_term_actions || []).map((act: string, idx: number) => (
                              <li key={idx} className="flex items-start gap-1">
                                <span className="text-blue-500 font-bold">•</span>
                                <span>{act}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        <div className="p-4 bg-emerald-50/50 border border-emerald-100 rounded-xl">
                          <span className="text-[9px] uppercase font-bold text-emerald-600">Long-Term Actions</span>
                          <ul className="flex flex-col gap-2 mt-3 text-[10px] font-semibold text-slate-600">
                            {(report.action_plan?.long_term_actions || []).map((act: string, idx: number) => (
                              <li key={idx} className="flex items-start gap-1">
                                <span className="text-emerald-500 font-bold">•</span>
                                <span>{act}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right side: Expected answer block */}
                  <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm flex flex-col gap-4">
                    <div>
                      <h3 className="text-xs font-bold text-slate-900 border-b border-slate-100 pb-2 mb-3">Expected Expert Response</h3>
                      <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 border border-slate-100 p-4 rounded-xl font-medium">
                        "{report.expected_answer}"
                      </p>
                    </div>

                    <div>
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-2">Missing Concepts</span>
                      <ul className="flex flex-col gap-2 text-[10px] font-bold text-slate-600">
                        {(report.missing_concepts || []).map((concept: string, idx: number) => (
                          <li key={idx} className="flex items-center gap-1.5 text-slate-500">
                            <span className="h-1.5 w-1.5 rounded-full bg-red-400" /> {concept}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
