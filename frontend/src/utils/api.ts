const API_BASE = process.env.NEXT_PUBLIC_API_URL
  ? `${process.env.NEXT_PUBLIC_API_URL}/api`
  : "http://localhost:8000/api";

const BACKEND_ROOT = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

console.log(`[API] Base URL configured as: ${API_BASE}`);


export function setToken(token: string) {
  if (typeof window !== "undefined") {
    localStorage.setItem("jam_token", token);
  }
}

export function getToken(): string | null {
  if (typeof window !== "undefined") {
    return localStorage.getItem("jam_token");
  }
  return null;
}

export function logout() {
  if (typeof window !== "undefined") {
    localStorage.removeItem("jam_token");
  }
}

async function fetchAPI(endpoint: string, options: RequestInit & { timeout?: number } = {}) {
  const { timeout, ...fetchOptions } = options;
  const token = getToken();
  const headers = new Headers(fetchOptions.headers || {});

  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const controller = new AbortController();
  const timeoutMs = timeout ?? 15000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const fullUrl = `${API_BASE}${endpoint}`;
  const method = (fetchOptions.method || "GET").toUpperCase();
  const payloadSize = fetchOptions.body instanceof FormData
    ? "[FormData — size unknown at fetch time]"
    : fetchOptions.body
      ? `${String(fetchOptions.body).length} bytes`
      : "no body";

  console.log(`[API] ▶ Request started: ${method} ${fullUrl} | payload: ${payloadSize}`);

  let res: Response;
  try {
    res = await fetch(fullUrl, {
      ...fetchOptions,
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      const msg = `[API] ✗ TIMEOUT after ${timeoutMs}ms — ${method} ${fullUrl}`;
      console.error(msg);
      throw new Error(`Request timed out after ${timeoutMs / 1000}s. The backend may still be processing — please wait and refresh.`);
    }
    // Network-level failure (CORS block, server down, DNS failure, etc.)
    const networkMsg = err.message || "Unknown network error";
    console.error(`[API] ✗ NETWORK ERROR — ${method} ${fullUrl}\n  └─ ${networkMsg}`);
    // Try to give an actionable message
    if (networkMsg.includes("Failed to fetch") || networkMsg.includes("NetworkError")) {
      throw new Error(
        `Cannot reach backend at ${BACKEND_ROOT}. ` +
        `Verify the backend is running (uvicorn main:app --port 8000) and CORS allows http://localhost:3000.`
      );
    }
    throw new Error(`Network error: ${networkMsg}`);
  }

  console.log(`[API] ◀ Response: ${method} ${fullUrl} → HTTP ${res.status} ${res.statusText}`);

  if (res.status === 401) {
    logout();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("auth-expired"));
    }
  }

  if (!res.ok) {
    let rawBody = "";
    try {
      rawBody = await res.text();
    } catch (_) {
      rawBody = "<could not read response body>";
    }
    console.error(
      `[API] ✗ HTTP ${res.status} — ${method} ${fullUrl}\n` +
      `  └─ Response body: ${rawBody.slice(0, 500)}`
    );
    let errorMessage = `HTTP ${res.status} error`;
    try {
      const errorData = JSON.parse(rawBody);
      if (typeof errorData.detail === "string") {
        errorMessage = errorData.detail;
      } else if (Array.isArray(errorData.detail)) {
        errorMessage = errorData.detail
          .map((err: any) => {
            const field = err.loc && err.loc.length > 1 ? err.loc.slice(1).join(".") : (err.loc ? err.loc.join(".") : "");
            return field ? `${field}: ${err.msg}` : err.msg;
          })
          .join(", ");
      } else if (errorData.detail && typeof errorData.detail === "object") {
        errorMessage = JSON.stringify(errorData.detail);
      } else if (errorData.message) {
        errorMessage = errorData.message;
      }
    } catch (_) {
      // rawBody wasn't JSON — use it directly (trimmed)
      errorMessage = rawBody.slice(0, 300) || `HTTP ${res.status}`;
    }
    throw new Error(errorMessage);
  }

  return res.json();
}

export const api = {
  // Auth API
  logout,

  /**
   * Verifies the backend is reachable and healthy.
   * Returns true when healthy, false when unreachable.
   */
  async checkHealth(): Promise<{ ok: boolean; status?: string; error?: string }> {
    try {
      const res = await fetch(`${BACKEND_ROOT}/health`, { method: "GET" });
      if (res.ok) {
        const data = await res.json();
        console.log(`[API] ✓ Health check passed — backend status: ${data.status}`);
        return { ok: true, status: data.status };
      }
      return { ok: false, error: `HTTP ${res.status}` };
    } catch (err: any) {
      console.error(`[API] ✗ Health check failed — backend may be down: ${err.message}`);
      return { ok: false, error: err.message };
    }
  },

  /**
   * Fetches the debug/system module availability report.
   */
  async checkSystemModules() {
    try {
      const res = await fetch(`${BACKEND_ROOT}/debug/system`, { method: "GET" });
      const data = await res.json();
      console.log(`[API] System module check:`, data);
      return data;
    } catch (err: any) {
      console.error(`[API] System module check failed:`, err.message);
      return null;
    }
  },

  async signup(email: string, name: string, password: string) {
    return fetchAPI("/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name, password }),
    });
  },

  async login(email: string, password: string) {
    const data = await fetchAPI("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (data.access_token) {
      setToken(data.access_token);
    }
    return data;
  },

  async getMe() {
    return fetchAPI("/auth/me");
  },

  // JAM API
  async generateTopic(category?: string) {
    const query = category ? `?category=${encodeURIComponent(category)}` : "";
    return fetchAPI(`/generate-topic${query}`);
  },

  async getTopic(category?: string) {
    return this.generateTopic(category);
  },

  async createSession(
    topic: string,
    category: string,
    instantStart = false,
    preparationMode = false,
    skipPreparation = false
  ) {
    return fetchAPI("/jam/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic,
        category,
        instant_start: instantStart,
        preparation_mode: preparationMode,
        skip_preparation: skipPreparation
      }),
    });
  },

  async uploadVideo(sessionId: string, videoBlob: Blob, filename = "recording.webm") {
    const formData = new FormData();
    formData.append("file", videoBlob, filename);

    return fetchAPI(`/jam/session/${sessionId}/upload`, {
      method: "POST",
      body: formData, // Fetch automatically sets content-type for FormData
      timeout: 120000, // 2 minutes timeout for video upload
    });
  },

  async getSession(sessionId: string) {
    return fetchAPI(`/jam/session/${sessionId}`);
  },

  async getHistory() {
    return fetchAPI("/jam/history");
  },

  async getLeaderboard() {
    return fetchAPI("/jam/leaderboard");
  },

  async getAnalytics() {
    return fetchAPI("/jam/analytics");
  },

  // Deepgram WebSocket Token
  async getDeepgramToken() {
    return fetchAPI("/deepgram/token");
  },

  // Debate Arena API
  async startDebate(topic: string, difficulty: string) {
    return fetchAPI(`/debate/start?topic=${encodeURIComponent(topic)}&difficulty=${encodeURIComponent(difficulty)}`, {
      method: "POST"
    });
  },

  async submitDebateArgument(sessionId: string, argument: string) {
    return fetchAPI(`/debate/${sessionId}/argue?user_argument=${encodeURIComponent(argument)}`, {
      method: "POST"
    });
  },

  async uploadDebateVideo(sessionId: string, videoBlob: Blob, filename = "debate.webm") {
    const formData = new FormData();
    formData.append("file", videoBlob, filename);
    return fetchAPI(`/debate/session/${sessionId}/upload`, {
      method: "POST",
      body: formData,
      timeout: 120000,
    });
  },

  // Interview Simulator API
  async startInterview(role: string, roundType: string) {
    return fetchAPI(`/interview/start?role=${encodeURIComponent(role)}&round_type=${encodeURIComponent(roundType)}`, {
      method: "POST"
    });
  },

  async submitInterviewAnswer(sessionId: string, answer: string) {
    return fetchAPI(`/interview/${sessionId}/answer?user_answer=${encodeURIComponent(answer)}`, {
      method: "POST"
    });
  },

  /**
   * Uploads a recorded interview video/audio blob for full evidence-based analysis.
   * Uses the same pipeline as JAM Analyzer (Whisper + MediaPipe + Gemini).
   * Returns a full SessionOut with 10-section report.
   */
  async uploadInterviewVideo(sessionId: string, videoBlob: Blob, filename = "interview.webm") {
    const formData = new FormData();
    formData.append("file", videoBlob, filename);
    console.log(`[API] ▶ Uploading interview recording — session: ${sessionId}, size: ${videoBlob.size} bytes`);
    return fetchAPI(`/interview/session/${sessionId}/upload`, {
      method: "POST",
      body: formData,
      timeout: 180000, // 3 minutes — interview analysis may take longer
    });
  },

  // AI Coach API
  async getDNA() {
    return fetchAPI("/coach/dna");
  },

  async getCoachRecommendations() {
    return fetchAPI("/coach/recommendations");
  },

  async getChallenges() {
    return fetchAPI("/coach/challenges");
  },

  async attemptChallenge(challenge_id: string, score: number) {
    return fetchAPI(`/coach/challenge/${challenge_id}/attempt?score=${score}`, {
      method: "POST"
    });
  },

  // Document-Based Communication Analyzer API
  async uploadDocument(file: File) {
    const formData = new FormData();
    formData.append("file", file);
    return fetchAPI("/document/upload", {
      method: "POST",
      body: formData,
      timeout: 60000,
    });
  },

  async createDocSession(
    documentId: string,
    topicId: string | null,
    topicTitle: string,
    category: string,
    instantStart = false,
    preparationMode = false,
    skipPreparation = false
  ) {
    return fetchAPI("/document/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        document_id: documentId,
        topic_id: topicId,
        topic_title: topicTitle,
        category,
        instant_start: instantStart,
        preparation_mode: preparationMode,
        skip_preparation: skipPreparation
      }),
    });
  },

  async uploadDocVideo(sessionId: string, videoBlob: Blob, filename = "doc_recording.webm") {
    const formData = new FormData();
    formData.append("file", videoBlob, filename);
    return fetchAPI(`/document/session/${sessionId}/upload`, {
      method: "POST",
      body: formData,
      timeout: 180000,
    });
  },

  async getDocSession(sessionId: string) {
    return fetchAPI(`/document/session/${sessionId}`);
  },

  async startViva(documentId: string, mode: string) {
    return fetchAPI("/document/viva/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ document_id: documentId, mode }),
    });
  },

  async submitVivaAnswer(vivaId: string, questionIndex: number, videoBlob: Blob, filename = "viva_recording.webm") {
    const formData = new FormData();
    formData.append("file", videoBlob, filename);
    return fetchAPI(`/document/viva/${vivaId}/answer?question_index=${questionIndex}`, {
      method: "POST",
      body: formData,
      timeout: 120000,
    });
  },

  async getVivaSession(vivaId: string) {
    return fetchAPI(`/document/viva/${vivaId}`);
  }
};
