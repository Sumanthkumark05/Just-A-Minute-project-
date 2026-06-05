"use client";

import React, { useState, useEffect, useRef } from "react";
import Webcam from "react-webcam";
import { jsPDF } from "jspdf";
import { 
  Mic, Video, Award, History, LogOut, Loader2, Sparkles, 
  AlertTriangle, ArrowRight, CheckCircle, RefreshCw, Calendar, 
  Volume2, Shield, User, Trophy, BarChart3, Clock, TrendingUp, 
  Play, Square, VideoOff, Camera, UserCheck, Flame, ChevronRight,
  TrendingDown, Check, Info, FileDown
} from "lucide-react";
import { 
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, 
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, LineChart, Line, CartesianGrid
} from "recharts";
import { api } from "../utils/api";

type Screen = "auth" | "dashboard" | "topic" | "recording" | "processing" | "results" | "history" | "leaderboard";

export default function Home() {
  const [currentScreen, setCurrentScreen] = useState<Screen>("auth");
  const [mounted, setMounted] = useState(false);
  const [user, setUser] = useState<any>(null);
  
  // Auth Form State
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  // Topic & Prep State
  const [generatedTopic, setGeneratedTopic] = useState("");
  const [generatedCategory, setGeneratedCategory] = useState("");
  const [topicLoading, setTopicLoading] = useState(false);
  const [prepTimer, setPrepTimer] = useState(15);
  const [isPrepActive, setIsPrepActive] = useState(false);

  // Recording State
  const webcamRef = useRef<Webcam>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const [recordingTimer, setRecordingTimer] = useState(60);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedChunks, setRecordedChunks] = useState<Blob[]>([]);
  const [streamError, setStreamError] = useState("");

  // Visualizer Refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameId = useRef<number | null>(null);

  // Current Session & Stats Results
  const [activeSession, setActiveSession] = useState<any>(null);
  const [dashboardStats, setDashboardStats] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [resultsLoading, setResultsLoading] = useState(false);


  // Hydration safe check
  useEffect(() => {
    setMounted(true);
    // Check if token exists
    const token = typeof window !== "undefined" ? localStorage.getItem("jam_token") : null;
    if (token) {
      loadUserProfile();
    }
    
    // Auth expired listener
    const handleAuthExpired = () => {
      setUser(null);
      setCurrentScreen("auth");
    };
    
    window.addEventListener("auth-expired", handleAuthExpired);
    return () => {
      window.removeEventListener("auth-expired", handleAuthExpired);
    };
  }, []);

  // Sync timers
  useEffect(() => {
    let interval: any = null;
    if (isPrepActive && prepTimer > 0) {
      interval = setInterval(() => {
        setPrepTimer((prev) => prev - 1);
      }, 1000);
    } else if (isPrepActive && prepTimer === 0) {
      setIsPrepActive(false);
      startRecordingSession();
    }
    return () => clearInterval(interval);
  }, [isPrepActive, prepTimer]);

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

  // Profiles loading helper
  const loadUserProfile = async (rethrowError = false) => {
    try {
      const profile = await api.getMe();
      setUser(profile);
      fetchDashboardData();
      setCurrentScreen("dashboard");
    } catch (err) {
      api.logout();
      setUser(null);
      setCurrentScreen("auth");
      if (rethrowError) {
        throw err;
      }
    }
  };

  const fetchDashboardData = async () => {
    try {
      const stats = await api.getAnalytics();
      setDashboardStats(stats);
      const hist = await api.getHistory();
      setHistory(hist);
      const lead = await api.getLeaderboard();
      setLeaderboard(lead);
    } catch (err) {
      console.error("Failed to load dashboard statistics:", err);
    }
  };

  // Auth Operations
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setAuthLoading(true);

    try {
      if (isLogin) {
        await api.login(email, password);
      } else {
        await api.signup(email, name, password);
        // Automatically login after signup
        await api.login(email, password);
      }
      await loadUserProfile(true);
    } catch (err: any) {
      setAuthError(err.message || "Authentication failed. Check your parameters.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    api.logout();
    setUser(null);
    setCurrentScreen("auth");
  };

  // Topic Selection
  const handleGenerateTopic = async () => {
    setTopicLoading(true);
    try {
      const data = await api.getTopic();
      setGeneratedTopic(data.topic);
      setGeneratedCategory(data.category);
      setPrepTimer(15);
      setIsPrepActive(true);
      setCurrentScreen("topic");
    } catch (err) {
      console.error("Failed to generate topic:", err);
    } finally {
      setTopicLoading(false);
    }
  };

  // Recording Operations
  const startRecordingSession = async () => {
    setRecordedChunks([]);
    setRecordingTimer(60);
    setIsRecording(true);
    setStreamError("");
    setCurrentScreen("recording");

    // Wait for webcam stream to initialize and start audio visualizer
    setTimeout(() => {
      if (webcamRef.current && webcamRef.current.stream) {
        const stream = webcamRef.current.stream;
        
        // Start Canvas visualizer
        startAudioVisualizer(stream);

        // Setup Media Recorder
        let options = {};
        if (MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")) {
          options = { mimeType: "video/webm;codecs=vp9,opus" };
        } else if (MediaRecorder.isTypeSupported("video/webm")) {
          options = { mimeType: "video/webm" };
        }
        
        try {
          const mediaRecorder = new MediaRecorder(stream, options);
          mediaRecorderRef.current = mediaRecorder;
          mediaRecorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) {
              setRecordedChunks((prev) => [...prev, event.data]);
            }
          };
          mediaRecorder.start();
        } catch (e: any) {
          console.error("Failed to create MediaRecorder:", e);
          setStreamError("MediaRecorder error: " + e.message);
        }
      } else {
        setStreamError("Webcam stream not initialized. Please ensure camera permissions are active.");
      }
    }, 1000);
  };

  const stopRecordingSession = () => {
    setIsRecording(false);
    stopAudioVisualizer();

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    
    // Switch to processing page
    setCurrentScreen("processing");
  };

  // Upload video chunk triggers analysis
  useEffect(() => {
    if (currentScreen === "processing" && recordedChunks.length > 0) {
      uploadAndAnalyzeSpeech();
    }
  }, [currentScreen, recordedChunks]);

  const uploadAndAnalyzeSpeech = async () => {
    try {
      const blob = new Blob(recordedChunks, { type: "video/webm" });
      
      // 1. Create session object
      const session = await api.createSession(generatedTopic, generatedCategory);
      
      // 2. Upload video file blob
      const results = await api.uploadVideo(session.id, blob);
      setActiveSession(results);
      
      // Update local histories
      fetchDashboardData();
      
      setCurrentScreen("results");
    } catch (err) {
      console.error("AI Analysis failed:", err);
      alert("AI analysis encountered an error. Redirecting to dashboard.");
      setCurrentScreen("dashboard");
    }
  };

  // Audio Canvas visualizer setup
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

        canvasCtx.fillStyle = "#18181b";
        canvasCtx.fillRect(0, 0, width, height);

        const barWidth = (width / bufferLength) * 1.5;
        let barHeight;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          barHeight = (dataArray[i] / 255) * height * 0.8;
          canvasCtx.fillStyle = `rgba(139, 92, 246, ${dataArray[i] / 255 + 0.15})`;
          canvasCtx.fillRect(x, height - barHeight, barWidth - 1, barHeight);
          x += barWidth;
        }
      };

      draw();
    } catch (e) {
      console.error("Audio visualizer failed to start:", e);
    }
  };

  const stopAudioVisualizer = () => {
    if (animationFrameId.current) {
      cancelAnimationFrame(animationFrameId.current);
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }
    analyserRef.current = null;
    audioContextRef.current = null;
  };

  // View specific history session details
  const handleViewSessionDetails = async (sessionId: string) => {
    setResultsLoading(true);
    try {
      const session = await api.getSession(sessionId);
      setActiveSession(session);
      setCurrentScreen("results");
    } catch (err) {
      console.error("Failed to load session details:", err);
    } finally {
      setResultsLoading(false);
    }
  };

  // PDF Download Helper
  const handleDownloadPDF = () => {
    if (!activeSession || !activeSession.metrics) return;
    const doc = new jsPDF();
    const m = activeSession.metrics;

    // Dark layout style
    doc.setFillColor(9, 9, 11);
    doc.rect(0, 0, 210, 297, "F");

    doc.setFont("Helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(139, 92, 246);
    doc.text("JAM AI SPEECH REPORT", 20, 30);

    doc.setFontSize(10);
    doc.setTextColor(161, 161, 170);
    doc.text(`Generated on: ${new Date(activeSession.created_at).toLocaleString()}`, 20, 38);

    doc.setDrawColor(39, 39, 42);
    doc.line(20, 42, 190, 42);

    doc.setFontSize(12);
    doc.setTextColor(250, 250, 250);
    doc.text("Session Metadata", 20, 52);
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(161, 161, 170);
    doc.text(`Topic: ${activeSession.topic}`, 20, 60);
    doc.text(`Category: ${activeSession.category}`, 20, 66);
    doc.text(`Duration: 60 Seconds`, 20, 72);

    doc.setFont("Helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(250, 250, 250);
    doc.text("Performance Scores", 20, 85);
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Confidence Score: ${m.confidence_score}%`, 20, 93);
    doc.text(`Fluency Score: ${m.fluency_score}%`, 20, 99);
    doc.text(`Grammar Score: ${m.grammar_score}%`, 20, 105);
    doc.text(`Pronunciation Score: ${m.pronunciation_score}%`, 20, 111);
    doc.text(`Communication Score: ${m.communication_score}%`, 20, 117);
    doc.text(`Speaking Pace: ${m.words_per_minute} WPM`, 20, 123);

    doc.setFont("Helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Speech Transcript", 20, 136);
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(200, 200, 200);
    const splitTranscript = doc.splitTextToSize(activeSession.transcript || "", 170);
    doc.text(splitTranscript, 20, 144);

    // Page 2: Actionable feedback
    doc.addPage();
    doc.setFillColor(9, 9, 11);
    doc.rect(0, 0, 210, 297, "F");

    doc.setFont("Helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(139, 92, 246);
    doc.text("Actionable AI Coaching Feedback", 20, 30);

    doc.setFontSize(12);
    doc.setTextColor(250, 250, 250);
    doc.text("Strengths:", 20, 42);
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(161, 161, 170);
    let y = 50;
    m.strengths.forEach((s: string) => {
      doc.text(`- ${s}`, 25, y);
      y += 8;
    });

    doc.setFont("Helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(250, 250, 250);
    doc.text("Areas for Improvement:", 20, y + 6);
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(161, 161, 170);
    y += 14;
    m.improvements.forEach((imp: string) => {
      doc.text(`- ${imp}`, 25, y);
      y += 8;
    });

    doc.setFont("Helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(250, 250, 250);
    doc.text("Recommended Coaching Exercises:", 20, y + 6);
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(161, 161, 170);
    y += 14;
    m.exercises.forEach((ex: string) => {
      doc.text(`- ${ex}`, 25, y);
      y += 8;
    });

    doc.save(`JAM_Report_${activeSession.id.substring(0, 8)}.pdf`);
  };

  // Recharts score mapping
  const getRadarData = (metrics: any) => {
    if (!metrics) return [];
    return [
      { subject: "Accuracy", A: metrics.accuracy_score || 0, fullMark: 100 },
      { subject: "Fluency", A: metrics.fluency_score, fullMark: 100 },
      { subject: "Grammar", A: metrics.grammar_score, fullMark: 100 },
      { subject: "Pronunciation", A: metrics.pronunciation_score, fullMark: 100 },
      { subject: "Confidence", A: metrics.confidence_score, fullMark: 100 },
      { subject: "Communication", A: metrics.communication_score, fullMark: 100 },
    ];
  };

  const getPieData = (dist: any) => {
    if (!dist) return [];
    return Object.keys(dist).map(key => ({
      name: key,
      value: dist[key]
    }));
  };

  const PIE_COLORS = ["#8b5cf6", "#ec4899", "#3b82f6", "#10b981", "#f59e0b"];

  if (!mounted) return null;

  return (
    <div className="flex-1 flex flex-col relative z-10 font-sans">
      {/* Header bar (Visible on all screens except Auth) */}
      {currentScreen !== "auth" && (
        <header className="glass sticky top-0 z-30 border-b border-white/5 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setCurrentScreen("dashboard")}>
            <div className="h-10 w-10 rounded-xl bg-primary/20 flex items-center justify-center border border-primary/30 pulse-glow">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="font-display font-bold text-lg text-white">JAM AI</h1>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">Speech Analyzer</p>
            </div>
          </div>

          <div className="flex items-center gap-5">
            {user && (
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-full bg-zinc-800 flex items-center justify-center border border-zinc-700">
                  <User className="h-4 w-4 text-zinc-300" />
                </div>
                <div className="hidden sm:block text-left">
                  <p className="text-xs font-semibold text-zinc-200">{user.name}</p>
                  <p className="text-[10px] text-zinc-500">{user.email}</p>
                </div>
                {dashboardStats?.streak > 0 && (
                  <div className="flex items-center gap-1 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                    <Flame className="h-3.5 w-3.5 text-amber-500 animate-pulse" />
                    <span className="text-[10px] font-bold text-amber-500">{dashboardStats.streak} Day Streak</span>
                  </div>
                )}
              </div>
            )}

            <button 
              onClick={handleLogout} 
              className="text-zinc-400 hover:text-red-400 p-2 rounded-lg hover:bg-white/5 transition-all"
              title="Logout"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </header>
      )}

      {/* Main Container screen routers */}
      <main className="flex-1 flex flex-col max-w-7xl mx-auto w-full p-4 sm:p-6 md:p-8">
        
        {/* ================================= AUTH SCREEN ================================= */}
        {currentScreen === "auth" && (
          <div className="flex-1 flex items-center justify-center py-12">
            <div className="glass hover-glow w-full max-w-md p-8 rounded-2xl border border-white/5 flex flex-col relative overflow-hidden">
              {/* Blur gradient background decorators */}
              <div className="absolute top-0 right-0 h-40 w-40 bg-primary/10 rounded-full blur-3xl -z-10"></div>
              <div className="absolute bottom-0 left-0 h-40 w-40 bg-blue-500/5 rounded-full blur-3xl -z-10"></div>

              <div className="text-center mb-8">
                <div className="h-12 w-12 rounded-2xl bg-primary/20 flex items-center justify-center border border-primary/30 mx-auto mb-4 pulse-glow">
                  <Sparkles className="h-6 w-6 text-primary" />
                </div>
                <h2 className="font-display font-bold text-2xl text-white">JAM AI Analyzer</h2>
                <p className="text-sm text-zinc-400 mt-1.5">Elevate your public speaking via generative AI</p>
              </div>

              {authError && (
                <div className="mb-5 bg-red-500/10 border border-red-500/20 px-4 py-3 rounded-xl flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-300 leading-relaxed">{authError}</p>
                </div>
              )}

              <form onSubmit={handleAuthSubmit} className="flex flex-col gap-4">
                {!isLogin && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-zinc-400">Full Name</label>
                    <input 
                      type="text" 
                      required 
                      value={name} 
                      onChange={(e) => setName(e.target.value)} 
                      placeholder="John Doe"
                      className="glass-input px-4 py-2.5 rounded-xl text-sm text-white" 
                    />
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-zinc-400">Email Address</label>
                  <input 
                    type="email" 
                    required 
                    value={email} 
                    onChange={(e) => setEmail(e.target.value)} 
                    placeholder="john@example.com"
                    className="glass-input px-4 py-2.5 rounded-xl text-sm text-white" 
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-zinc-400">Password</label>
                  <input 
                    type="password" 
                    required 
                    minLength={6}
                    value={password} 
                    onChange={(e) => setPassword(e.target.value)} 
                    placeholder="••••••••"
                    className="glass-input px-4 py-2.5 rounded-xl text-sm text-white" 
                  />
                </div>

                <button 
                  type="submit" 
                  disabled={authLoading}
                  className="mt-2 w-full py-3 bg-primary hover:bg-primary/90 text-white font-semibold rounded-xl text-sm transition-all flex items-center justify-center gap-2 hover:scale-[1.01] cursor-pointer"
                >
                  {authLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      {isLogin ? "Sign In" : "Register"}
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </form>

              <div className="mt-6 text-center border-t border-white/5 pt-5">
                <button 
                  onClick={() => {
                    setIsLogin(!isLogin);
                    setAuthError("");
                  }} 
                  className="text-xs text-primary hover:underline"
                >
                  {isLogin ? "Don't have an account? Sign Up" : "Already have an account? Sign In"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================================= DASHBOARD SCREEN ================================= */}
        {currentScreen === "dashboard" && (
          <div className="flex-1 flex flex-col gap-8 animate-fade-in">
            {/* Quick Actions / Topics launcher */}
            <div className="glass rounded-2xl border border-white/5 p-8 flex flex-col md:flex-row items-center justify-between gap-6 relative overflow-hidden">
              <div className="absolute top-0 right-0 h-40 w-40 bg-primary/10 rounded-full blur-3xl -z-10"></div>
              <div>
                <h2 className="font-display font-extrabold text-2xl sm:text-3xl text-white">Generate Your Next Topic</h2>
                <p className="text-sm text-zinc-400 mt-2 max-w-xl leading-relaxed">
                  You will get 15 seconds to prepare your thoughts on a randomly generated topic and 60 seconds to speak on webcam.
                </p>
              </div>

              <button 
                onClick={handleGenerateTopic}
                disabled={topicLoading}
                className="w-full md:w-auto shrink-0 bg-primary hover:bg-primary/90 text-white px-6 py-4 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2.5 pulse-glow cursor-pointer"
              >
                {topicLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Sparkles className="h-4.5 w-4.5" />
                    Start new JAM Session
                  </>
                )}
              </button>
            </div>

            {/* Performance KPI Cards */}
            {dashboardStats && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="glass rounded-xl border border-white/5 p-5">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Total Sessions</p>
                  <h3 className="font-display text-2xl font-bold mt-1 text-white">{dashboardStats.total_sessions}</h3>
                  <p className="text-[10px] text-zinc-500 mt-2 flex items-center gap-1">
                    <Calendar className="h-3 w-3 text-zinc-500" /> Speech attempts
                  </p>
                </div>
                <div className="glass rounded-xl border border-white/5 p-5">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Avg Confidence</p>
                  <h3 className="font-display text-2xl font-bold mt-1 text-white">{dashboardStats.avg_confidence}%</h3>
                  <p className="text-[10px] text-zinc-500 mt-2 flex items-center gap-1">
                    <UserCheck className="h-3 w-3 text-zinc-500" /> Facial / Posture confidence
                  </p>
                </div>
                <div className="glass rounded-xl border border-white/5 p-5">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Avg Fluency</p>
                  <h3 className="font-display text-2xl font-bold mt-1 text-white">{dashboardStats.avg_fluency}%</h3>
                  <p className="text-[10px] text-zinc-500 mt-2 flex items-center gap-1">
                    <Volume2 className="h-3 w-3 text-zinc-500" /> Speech smoothness
                  </p>
                </div>
                <div className="glass rounded-xl border border-white/5 p-5">
                  <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Avg Communication</p>
                  <h3 className="font-display text-2xl font-bold mt-1 text-white">{dashboardStats.avg_communication}%</h3>
                  <p className="text-[10px] text-zinc-500 mt-2 flex items-center gap-1">
                    <TrendingUp className="h-3 w-3 text-zinc-500" /> Idea clarity & Vocabulary
                  </p>
                </div>
              </div>
            )}

            {/* Charts & Leaderboards split */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Progress Line chart */}
              <div className="glass rounded-2xl border border-white/5 p-6 lg:col-span-2 flex flex-col h-[380px]">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-display text-base font-bold text-white">AI Improvement Tracker</h3>
                    <p className="text-[10px] text-zinc-400">Score progress mapped over completed sessions</p>
                  </div>
                  <BarChart3 className="h-4 w-4 text-zinc-400" />
                </div>
                
                <div className="flex-1 min-h-0">
                  {dashboardStats && dashboardStats.progress_data && dashboardStats.progress_data.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={dashboardStats.progress_data}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                        <XAxis dataKey="date" stroke="#71717a" fontSize={9} />
                        <YAxis stroke="#71717a" fontSize={9} domain={[50, 100]} />
                        <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: "8px" }} />
                        <Legend wrapperStyle={{ fontSize: "10px" }} />
                        <Line type="monotone" dataKey="confidence" name="Confidence" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} />
                        <Line type="monotone" dataKey="fluency" name="Fluency" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                        <Line type="monotone" dataKey="communication" name="Communication" stroke="#ec4899" strokeWidth={2} dot={{ r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center">
                      <BarChart3 className="h-10 w-10 text-zinc-700 mb-2" />
                      <p className="text-xs text-zinc-500">Not enough session data. Complete your first session to track progress.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Leaderboard panel */}
              <div className="glass rounded-2xl border border-white/5 p-6 flex flex-col h-[380px]">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-amber-500 animate-bounce" />
                    <h3 className="font-display text-base font-bold text-white">Public Leaderboard</h3>
                  </div>
                  <p className="text-[10px] text-zinc-400">Top evaluators</p>
                </div>

                <div className="flex-1 overflow-y-auto flex flex-col gap-2">
                  {leaderboard && leaderboard.length > 0 ? (
                    leaderboard.map((entry) => (
                      <div key={entry.name} className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-900/60 border border-white/5 hover:border-white/10 transition-all">
                        <div className="flex items-center gap-3">
                          <span className={`w-5 text-center text-xs font-bold ${
                            entry.rank === 1 ? "text-amber-500 text-sm" : entry.rank === 2 ? "text-zinc-300" : entry.rank === 3 ? "text-amber-700" : "text-zinc-600"
                          }`}>
                            #{entry.rank}
                          </span>
                          <div>
                            <p className="text-xs font-semibold text-white">{entry.name}</p>
                            <p className="text-[10px] text-zinc-500">{entry.sessions_count} sessions completed</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-bold text-primary">{entry.average_score}%</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center py-10">
                      <Trophy className="h-8 w-8 text-zinc-700 mb-2" />
                      <p className="text-xs text-zinc-500">No rankings available yet.</p>
                    </div>
                  )}
                </div>
              </div>

            </div>

            {/* History Table */}
            <div className="glass rounded-2xl border border-white/5 p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <History className="h-4.5 w-4.5 text-primary" />
                  <h3 className="font-display text-base font-bold text-white">Speech History</h3>
                </div>
                <p className="text-[10px] text-zinc-400">Review past attempts & AI transcripts</p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-white/5 text-zinc-500 uppercase tracking-widest text-[9px] font-bold">
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Category</th>
                      <th className="py-3 px-4">Topic</th>
                      <th className="py-3 px-4 text-center">Score</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history && history.length > 0 ? (
                      history.map((h) => (
                        <tr key={h.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-all">
                          <td className="py-3.5 px-4 text-zinc-400 font-mono whitespace-nowrap">
                            {new Date(h.created_at).toLocaleDateString()}
                          </td>
                          <td className="py-3.5 px-4 font-semibold text-zinc-300">
                            {h.category}
                          </td>
                          <td className="py-3.5 px-4 text-zinc-200 max-w-sm truncate">
                            {h.topic}
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                              h.overall_score >= 85 ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                              h.overall_score >= 70 ? "bg-primary/10 text-primary border border-primary/20" :
                              h.overall_score > 0 ? "bg-amber-500/10 text-amber-500 border border-amber-500/20" :
                              "bg-zinc-800 text-zinc-400"
                            }`}>
                              {h.overall_score > 0 ? `${h.overall_score}%` : "In Prep"}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-right whitespace-nowrap">
                            <button
                              onClick={() => handleViewSessionDetails(h.id)}
                              disabled={resultsLoading}
                              className="text-primary hover:text-primary/80 font-semibold hover:underline inline-flex items-center gap-1 hover:translate-x-0.5 transition-all cursor-pointer"
                            >
                              Report
                              <ChevronRight className="h-3 w-3" />
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-zinc-500">
                          No speech history found. Generate a topic above to begin.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        )}

        {/* ================================= TOPIC PREP SCREEN ================================= */}
        {currentScreen === "topic" && (
          <div className="flex-1 flex flex-col items-center justify-center max-w-xl mx-auto py-12">
            <div className="glass w-full p-8 rounded-2xl border border-white/5 relative overflow-hidden flex flex-col text-center">
              
              <div className="absolute top-0 right-0 h-40 w-40 bg-primary/10 rounded-full blur-3xl -z-10"></div>
              
              <span className="text-[10px] font-bold text-primary uppercase tracking-widest bg-primary/10 border border-primary/20 px-3 py-1 rounded-full mx-auto mb-4">
                Category: {generatedCategory}
              </span>
              
              <h2 className="font-display font-extrabold text-2xl text-white mt-2 leading-relaxed">
                "{generatedTopic}"
              </h2>
              
              <p className="text-xs text-zinc-400 mt-4 leading-relaxed max-w-sm mx-auto">
                Take a moment to structure your argument. Introduce the topic, discuss 2-3 key arguments, and end with a conclusion.
              </p>

              {/* Prep Countdown Circle */}
              <div className="h-32 w-32 rounded-full border-4 border-primary/25 bg-zinc-900/60 flex flex-col items-center justify-center mx-auto my-8 relative">
                {/* pulsing overlay */}
                <div className="absolute inset-0 rounded-full border-4 border-primary/60 scale-[1.03] animate-ping opacity-25"></div>
                <Clock className="h-4 w-4 text-primary mb-1 animate-pulse" />
                <span className="font-display text-4xl font-extrabold text-white">{prepTimer}</span>
                <span className="text-[8px] text-zinc-500 uppercase tracking-widest font-bold">seconds left</span>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={() => {
                    setIsPrepActive(false);
                    setCurrentScreen("dashboard");
                  }}
                  className="flex-1 py-3 bg-zinc-900 hover:bg-zinc-800 border border-white/5 text-zinc-400 font-semibold rounded-xl text-sm transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setIsPrepActive(false);
                    startRecordingSession();
                  }}
                  className="flex-1 py-3 bg-primary hover:bg-primary/95 text-white font-semibold rounded-xl text-sm transition-all flex items-center justify-center gap-2.5 pulse-glow cursor-pointer"
                >
                  <Play className="h-4 w-4" />
                  Speak Now
                </button>
              </div>

            </div>
          </div>
        )}

        {/* ================================= RECORDING SCREEN ================================= */}
        {currentScreen === "recording" && (
          <div className="flex-1 flex flex-col lg:flex-row gap-6 items-stretch justify-center py-6">
            
            {/* Webcam viewport & recorder */}
            <div className="flex-1 glass border border-white/5 rounded-2xl p-4 flex flex-col justify-between items-center relative overflow-hidden bg-zinc-950/80">
              
              {streamError && (
                <div className="absolute inset-0 bg-zinc-950/95 flex flex-col items-center justify-center p-8 text-center z-20">
                  <VideoOff className="h-10 w-10 text-red-500 mb-3" />
                  <h4 className="text-white font-bold mb-1">Webcam Permission Required</h4>
                  <p className="text-xs text-zinc-400 max-w-sm leading-relaxed mb-4">{streamError}</p>
                  <button onClick={startRecordingSession} className="px-4 py-2 bg-primary text-white text-xs font-bold rounded-lg cursor-pointer">
                    Retry Access
                  </button>
                </div>
              )}

              {/* Status Header Overlay */}
              <div className="w-full flex items-center justify-between pb-3 border-b border-white/5 relative z-10">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-red-500 animate-ping"></div>
                  <span className="text-[10px] font-bold text-red-500 uppercase tracking-widest">Webcam Live Recording</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-zinc-500">Timer:</span>
                  <span className="text-sm font-mono font-bold text-white bg-zinc-900 border border-white/5 px-2 py-0.5 rounded">
                    00:{recordingTimer < 10 ? `0${recordingTimer}` : recordingTimer}
                  </span>
                </div>
              </div>

              {/* Camera Preview stream */}
              <div className="flex-1 w-full my-4 flex items-center justify-center relative rounded-xl overflow-hidden border border-white/5 bg-black">
                <Webcam
                  audio={true}
                  muted={true}
                  ref={webcamRef}
                  videoConstraints={{
                    width: 640,
                    height: 480,
                    facingMode: "user"
                  }}
                  className="h-full w-full object-cover scale-x-[-1]"
                />
                
                {/* Floating prompt card overlay */}
                <div className="absolute top-4 left-4 right-4 bg-zinc-950/80 border border-white/5 px-4 py-2.5 rounded-xl text-center backdrop-blur-md">
                  <p className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest">Topic to speak on:</p>
                  <p className="text-xs font-semibold text-white mt-0.5">"{generatedTopic}"</p>
                </div>
              </div>

              {/* Visualizer canvas & controls */}
              <div className="w-full flex items-center justify-between pt-3 border-t border-white/5 relative z-10 gap-4">
                <div className="flex-1 max-w-[200px] border border-white/5 rounded-lg overflow-hidden h-8 bg-zinc-900 relative">
                  <canvas ref={canvasRef} className="w-full h-full" width={200} height={32}></canvas>
                  <div className="absolute inset-0 flex items-center gap-1.5 px-2 pointer-events-none">
                    <Volume2 className="h-3 w-3 text-zinc-400" />
                    <span className="text-[8px] text-zinc-500 font-bold uppercase tracking-widest">Mic visualizer</span>
                  </div>
                </div>

                <button
                  onClick={stopRecordingSession}
                  className="bg-red-600 hover:bg-red-500 hover:scale-[1.02] text-white px-6 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer"
                >
                  <Square className="h-3.5 w-3.5 fill-white" />
                  Stop & Analyze
                </button>
              </div>

            </div>

            {/* Speaking Tips Sidebar */}
            <div className="w-full lg:w-72 glass border border-white/5 rounded-2xl p-6 flex flex-col justify-between shrink-0">
              <div>
                <h3 className="font-display font-bold text-sm text-white mb-4">Coach Speaking Guidelines</h3>
                <div className="flex flex-col gap-4">
                  <div className="flex gap-2.5">
                    <div className="h-5 w-5 bg-primary/10 rounded border border-primary/20 flex items-center justify-center text-primary text-[10px] font-bold">1</div>
                    <div>
                      <p className="text-xs font-semibold text-zinc-200">Maintain Direct Eye Contact</p>
                      <p className="text-[10px] text-zinc-500 leading-relaxed mt-0.5">Look directly at the green camera light, not at the screen or key frames.</p>
                    </div>
                  </div>
                  <div className="flex gap-2.5">
                    <div className="h-5 w-5 bg-primary/10 rounded border border-primary/20 flex items-center justify-center text-primary text-[10px] font-bold">2</div>
                    <div>
                      <p className="text-xs font-semibold text-zinc-200">Avoid Filler Words</p>
                      <p className="text-[10px] text-zinc-500 leading-relaxed mt-0.5">If you need time to think, pause silently for 1-2 seconds instead of saying "um", "ah", or "like".</p>
                    </div>
                  </div>
                  <div className="flex gap-2.5">
                    <div className="h-5 w-5 bg-primary/10 rounded border border-primary/20 flex items-center justify-center text-primary text-[10px] font-bold">3</div>
                    <div>
                      <p className="text-xs font-semibold text-zinc-200">Pace Your Voice</p>
                      <p className="text-[10px] text-zinc-500 leading-relaxed mt-0.5">A normal conversational pace is around 120-150 words per minute. Do not rush!</p>
                    </div>
                  </div>
                  <div className="flex gap-2.5">
                    <div className="h-5 w-5 bg-primary/10 rounded border border-primary/20 flex items-center justify-center text-primary text-[10px] font-bold">4</div>
                    <div>
                      <p className="text-xs font-semibold text-zinc-200">Open Posture</p>
                      <p className="text-[10px] text-zinc-500 leading-relaxed mt-0.5">Sit up straight, roll your shoulders back, and use natural hand gestures.</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-white/5 text-[9px] text-zinc-500 uppercase tracking-widest text-center font-bold">
                Speak until timer reaches 0
              </div>
            </div>

          </div>
        )}

        {/* ================================= PROCESSING SCREEN ================================= */}
        {currentScreen === "processing" && (
          <div className="flex-1 flex flex-col items-center justify-center max-w-md mx-auto text-center py-16 animate-pulse">
            <div className="h-16 w-16 bg-primary/10 border border-primary/20 rounded-full flex items-center justify-center mb-6 pulse-glow relative">
              <Loader2 className="h-8 w-8 text-primary animate-spin" />
            </div>
            
            <h2 className="font-display font-extrabold text-2xl text-white">AI Coach Analyzing Video...</h2>
            <p className="text-sm text-zinc-400 mt-2 leading-relaxed">
              We are transcribing speech audio, scanning facial confidence, body posture, analyzing filler words, and checking grammatical fluency.
            </p>
            
            <div className="mt-8 w-full glass rounded-xl border border-white/5 p-4 flex flex-col gap-2.5 text-left text-xs">
              <div className="flex items-center justify-between text-zinc-400">
                <span>Transcribing Speech (Whisper)</span>
                <Check className="h-4 w-4 text-primary" />
              </div>
              <div className="flex items-center justify-between text-zinc-400">
                <span>Vocal Tone & Pacing Analysis</span>
                <Check className="h-4 w-4 text-primary" />
              </div>
              <div className="flex items-center justify-between text-zinc-400">
                <span>Computer Vision Expression Tracker</span>
                <div className="h-1.5 w-1.5 bg-primary rounded-full animate-ping"></div>
              </div>
              <div className="flex items-center justify-between text-zinc-500">
                <span>Generating Detailed Performance Report</span>
                <span className="text-[9px] tracking-widest uppercase font-bold text-zinc-600">Pending</span>
              </div>
            </div>
          </div>
        )}

        {/* ================================= RESULTS SCREEN ================================= */}
        {currentScreen === "results" && activeSession && activeSession.metrics && (
          <div className="flex-1 flex flex-col gap-8 animate-fade-in pb-12">
            
            {/* Header / Meta summary */}
            <div className="glass rounded-2xl border border-white/5 p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <span className="text-[9px] font-bold text-primary bg-primary/10 border border-primary/20 px-2.5 py-0.5 rounded-full uppercase tracking-widest">
                  Topic Category: {activeSession.category}
                </span>
                <h2 className="font-display font-extrabold text-xl text-white mt-1.5">"{activeSession.topic}"</h2>
                <p className="text-[10px] text-zinc-400 mt-1">Completed: {new Date(activeSession.created_at).toLocaleString()}</p>
                {activeSession.metrics?.transcript_confidence < 70 && (
                  <div className="mt-2 inline-flex items-center gap-1.5 bg-red-500/10 border border-red-500/20 px-2.5 py-1 rounded-lg">
                    <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
                    <span className="text-[10px] font-bold text-red-400">Low Audio Confidence ({activeSession.metrics.transcript_confidence}%). AI Evaluation may be inaccurate.</span>
                  </div>
                )}
              </div>

              <div className="flex gap-3 w-full sm:w-auto shrink-0">
                <button
                  onClick={() => setCurrentScreen("dashboard")}
                  className="flex-1 sm:flex-initial px-4 py-2.5 bg-zinc-900 border border-white/5 text-zinc-400 text-xs font-semibold rounded-xl hover:bg-zinc-800 transition-all cursor-pointer"
                >
                  Dashboard
                </button>
                <button
                  onClick={handleDownloadPDF}
                  className="flex-1 sm:flex-initial px-4 py-2.5 bg-primary hover:bg-primary/90 text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-2 pulse-glow transition-all cursor-pointer"
                >
                  <FileDown className="h-4 w-4" />
                  Download PDF Report
                </button>
              </div>
            </div>

            {/* Skill Score Breakdown Grid */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
              <div className="glass rounded-xl border border-white/5 p-4 text-center">
                <p className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold">Weighted Score</p>
                <h3 className="font-display text-2xl font-black mt-1.5 text-primary">{activeSession.metrics.accuracy_score}%</h3>
              </div>
              <div className="glass rounded-xl border border-white/5 p-4 text-center">
                <p className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold">Audio Confidence</p>
                <h3 className="font-display text-2xl font-bold mt-1.5 text-white">{activeSession.metrics.transcript_confidence}%</h3>
              </div>
              <div className="glass rounded-xl border border-white/5 p-4 text-center">
                <p className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold">Fluency Score</p>
                <h3 className="font-display text-2xl font-bold mt-1.5 text-white">{activeSession.metrics.fluency_score}%</h3>
              </div>
              <div className="glass rounded-xl border border-white/5 p-4 text-center">
                <p className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold">Grammar Score</p>
                <h3 className="font-display text-2xl font-bold mt-1.5 text-white">{activeSession.metrics.grammar_score}%</h3>
              </div>
              <div className="glass rounded-xl border border-white/5 p-4 text-center">
                <p className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold">Relevance Score</p>
                <h3 className="font-display text-2xl font-bold mt-1.5 text-white">{activeSession.metrics.semantic_similarity_score}%</h3>
              </div>
              <div className="glass rounded-xl border border-white/5 p-4 text-center">
                <p className="text-[9px] text-zinc-500 uppercase tracking-widest font-bold">Pronunciation</p>
                <h3 className="font-display text-2xl font-bold mt-1.5 text-white">{activeSession.metrics.pronunciation_score}%</h3>
              </div>
            </div>

            {/* Averages & Radar split */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Score radar chart */}
              <div className="glass rounded-2xl border border-white/5 p-6 h-[460px] flex flex-col">
                <h3 className="font-display text-sm font-bold text-white mb-2">Speech Skill Metrics</h3>
                <div className="flex-1 min-h-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="70%" data={getRadarData(activeSession.metrics)}>
                      <PolarGrid stroke="#27272a" />
                      <PolarAngleAxis dataKey="subject" stroke="#a1a1aa" fontSize={10} />
                      <PolarRadiusAxis stroke="#27272a" angle={30} domain={[0, 100]} />
                      <Radar name="User Score" dataKey="A" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.35} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Emotion breakdown */}
              <div className="glass rounded-2xl border border-white/5 p-6 h-[460px] flex flex-col">
                <h3 className="font-display text-sm font-bold text-white mb-2">Emotion Analysis</h3>
                <div className="flex-1 min-h-0 flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={getPieData(activeSession.metrics.emotion_distribution)}
                        cx="50%"
                        cy="45%"
                        innerRadius={50}
                        outerRadius={75}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {getPieData(activeSession.metrics.emotion_distribution).map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: "8px" }} />
                      <Legend 
                        layout="horizontal" 
                        align="center" 
                        verticalAlign="bottom"
                        wrapperStyle={{ fontSize: "10px", color: "#a1a1aa" }} 
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Filler word frequency */}
              <div className="glass rounded-2xl border border-white/5 p-6 h-[460px] flex flex-col">
                <h3 className="font-display text-sm font-bold text-white mb-2">Filler Word Frequency</h3>
                <div className="flex-1 min-h-0">
                  {(() => {
                    const fillerWords = activeSession.metrics?.filler_words || {};
                    const chartData = Object.keys(fillerWords)
                      .map(key => ({
                        word: key,
                        count: fillerWords[key] || 0
                      }))
                      .filter(item => item.count > 0);

                    if (chartData.length === 0) {
                      return (
                        <div className="flex flex-col items-center justify-center h-full text-zinc-400 space-y-2">
                          <svg className="w-12 h-12 text-zinc-500/80 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <p className="text-sm font-semibold text-zinc-300">Perfect Fluency!</p>
                          <p className="text-xs text-zinc-500">No filler words detected in your speech.</p>
                        </div>
                      );
                    }

                    return (
                      <div className="flex flex-col h-full space-y-4">
                        {/* Bar Chart Section */}
                        <div className="h-[180px] min-h-0">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                              <XAxis dataKey="word" stroke="#a1a1aa" fontSize={10} />
                              <YAxis stroke="#a1a1aa" fontSize={10} allowDecimals={false} />
                              <Tooltip contentStyle={{ backgroundColor: "#18181b", border: "1px solid #27272a", borderRadius: "8px" }} />
                              <Bar dataKey="count" fill="#ec4899" radius={[4, 4, 0, 0]} maxBarSize={25} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                        
                        {/* List/Table Section */}
                        <div className="flex-1 overflow-y-auto pr-1 border-t border-white/5 pt-3">
                          <table className="w-full text-left text-xs">
                            <thead>
                              <tr className="text-zinc-500 font-bold uppercase tracking-wider text-[10px]">
                                <th className="pb-2">Filler Word</th>
                                <th className="pb-2 text-center">Count</th>
                                <th className="pb-2 text-right">Freq / Min</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5 text-zinc-300">
                              {chartData.map((item) => {
                                const wpm = activeSession.metrics?.words_per_minute || 0;
                                const totalWords = (activeSession.metrics?.original_transcript || activeSession.transcript || "").split(/\s+/).filter(Boolean).length;
                                const freq = totalWords > 0 && wpm > 0 ? ((item.count / totalWords) * wpm).toFixed(1) : "0.0";
                                return (
                                  <tr key={item.word} className="hover:bg-white/5">
                                    <td className="py-2 font-mono text-pink-400 font-semibold">{item.word}</td>
                                    <td className="py-2 text-center font-bold text-white">{item.count}</td>
                                    <td className="py-2 text-right font-semibold text-zinc-400">{freq}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

            </div>

            {/* Speaking Pace & Transcript */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Transcript */}
              <div className="glass rounded-2xl border border-white/5 p-6 lg:col-span-2 flex flex-col h-[340px]">
                <h3 className="font-display text-sm font-bold text-white mb-3">Speech Transcript</h3>
                <div className="flex-1 overflow-y-auto pr-2">
                  <p className="text-[10px] text-zinc-400 mb-1 font-semibold uppercase tracking-wider">Original Audio Transcript</p>
                  <p className="text-xs text-zinc-300 leading-relaxed bg-zinc-950/60 p-4 rounded-xl border border-white/5 mb-3">
                    {activeSession.metrics.original_transcript || activeSession.transcript}
                  </p>
                  <p className="text-[10px] text-zinc-400 mb-1 font-semibold uppercase tracking-wider text-primary">Contextually Corrected Transcript</p>
                  <p className="text-xs text-zinc-200 leading-relaxed bg-primary/5 p-4 rounded-xl border border-primary/20">
                    {activeSession.metrics.corrected_transcript || activeSession.transcript}
                  </p>
                  
                  <h4 className="text-xs font-bold text-white mt-4 mb-2">Speech Summary</h4>
                  <p className="text-[11px] text-zinc-400 leading-relaxed bg-zinc-900/40 p-3 rounded-lg border border-white/5">
                    {activeSession.summary}
                  </p>
                </div>
              </div>

              {/* Pace & Key stats details */}
              <div className="glass rounded-2xl border border-white/5 p-6 flex flex-col h-[340px] justify-between">
                <div>
                  <h3 className="font-display text-sm font-bold text-white mb-4">Fluency Details</h3>
                  
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between border-b border-white/5 pb-2">
                      <span className="text-xs text-zinc-400">Speaking Pace</span>
                      <span className="text-sm font-bold text-white font-mono">{activeSession.metrics.words_per_minute} WPM</span>
                    </div>
                    
                    <div className="flex flex-col gap-1 border-b border-white/5 pb-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-400">Tempo Health</span>
                        <span className={`text-[10px] font-bold ${
                          activeSession.metrics.words_per_minute >= 115 && activeSession.metrics.words_per_minute <= 145 
                            ? "text-emerald-400" : "text-amber-500"
                        }`}>
                          {activeSession.metrics.words_per_minute >= 115 && activeSession.metrics.words_per_minute <= 145 
                            ? "Ideal Range" : activeSession.metrics.words_per_minute > 145 ? "Too Fast" : "Too Slow"
                          }
                        </span>
                      </div>
                      <p className="text-[10px] text-zinc-500">Conversational range: 110 - 150 words per minute.</p>
                    </div>

                    <div className="flex items-center justify-between border-b border-white/5 pb-2">
                      <span className="text-xs text-zinc-400">Repeated words / Pauses</span>
                      <span className="text-sm font-bold text-amber-500 font-mono">
                        {activeSession.metrics.mistakes.filter((m: string) => m.toLowerCase().includes("pause") || m.toLowerCase().includes("repeat")).length} Flagged
                      </span>
                    </div>
                  </div>
                </div>

                <div className="bg-primary/5 border border-primary/10 rounded-xl p-4 flex items-start gap-2.5">
                  <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <p className="text-[10px] text-zinc-400 leading-relaxed">
                    Fluency checks score grammar, fillers, repeat vocabulary words, pacing, and overall vocal cadence logic.
                  </p>
                </div>
              </div>

            </div>

            {/* Coach actionable feedback */}
            <div className="glass rounded-2xl border border-white/5 p-8 relative overflow-hidden">
              <div className="absolute top-0 right-0 h-40 w-40 bg-primary/10 rounded-full blur-3xl -z-10"></div>
              
              <h3 className="font-display font-bold text-base text-white mb-6 flex items-center gap-2">
                <Sparkles className="h-4.5 w-4.5 text-primary" />
                Actionable AI Coach Feedback
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Strengths */}
                <div className="bg-emerald-500/5 border border-emerald-500/10 p-5 rounded-xl">
                  <h4 className="text-xs font-bold text-emerald-400 mb-3 flex items-center gap-1.5">
                    <CheckCircle className="h-4 w-4" />
                    Key Strengths
                  </h4>
                  <ul className="flex flex-col gap-2.5 text-xs text-zinc-300">
                    {activeSession.metrics.strengths.map((str: string, index: number) => (
                      <li key={index} className="flex items-start gap-2">
                        <span className="text-emerald-400 mt-0.5 shrink-0">•</span>
                        <span>{str}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Improvements */}
                <div className="bg-red-500/5 border border-red-500/10 p-5 rounded-xl">
                  <h4 className="text-xs font-bold text-red-400 mb-3 flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4" />
                    Areas to Improve
                  </h4>
                  <ul className="flex flex-col gap-2.5 text-xs text-zinc-300">
                    {activeSession.metrics.improvements.map((imp: string, index: number) => (
                      <li key={index} className="flex items-start gap-2">
                        <span className="text-red-400 mt-0.5 shrink-0">•</span>
                        <span>{imp}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Recommended Exercises */}
                <div className="bg-primary/5 border border-primary/10 p-5 rounded-xl">
                  <h4 className="text-xs font-bold text-primary mb-3 flex items-center gap-1.5">
                    <TrendingUp className="h-4 w-4" />
                    Recommended Exercises
                  </h4>
                  <ul className="flex flex-col gap-2.5 text-xs text-zinc-300">
                    {activeSession.metrics.exercises.map((ex: string, index: number) => (
                      <li key={index} className="flex items-start gap-2">
                        <span className="text-primary mt-0.5 shrink-0">•</span>
                        <span>{ex}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

          </div>
        )}

      </main>
    </div>
  );
}
