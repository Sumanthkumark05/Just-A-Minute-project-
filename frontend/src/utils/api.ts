const API_BASE = "http://localhost:8000/api";

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

  let res;
  try {
    res = await fetch(`${API_BASE}${endpoint}`, {
      ...fetchOptions,
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      throw new Error("Request timed out. Please try again.");
    }
    throw new Error(err.message || "Failed to connect to the server.");
  }

  if (res.status === 401) {
    logout();
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("auth-expired"));
    }
  }

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: "An error occurred" }));
    let errorMessage = "An error occurred";
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
    throw new Error(errorMessage);
  }

  return res.json();
}

export const api = {
  // Auth API
  logout,
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
  async getTopic(category?: string) {
    const query = category ? `?category=${encodeURIComponent(category)}` : "";
    return fetchAPI(`/jam/topic${query}`);
  },

  async createSession(topic: string, category: string) {
    return fetchAPI("/jam/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic, category }),
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
};
