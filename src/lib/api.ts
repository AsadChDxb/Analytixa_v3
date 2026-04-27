import axios from "axios";

const configuredApiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();

function resolveApiBaseUrl() {
  if (!configuredApiBaseUrl) {
    return "/api-proxy";
  }

  if (typeof window !== "undefined") {
    const pageIsSecure = window.location.protocol === "https:";
    const apiIsInsecure = configuredApiBaseUrl.startsWith("http://");
    if (pageIsSecure && apiIsInsecure) {
      return "/api-proxy";
    }
  }

  return configuredApiBaseUrl;
}

export const API_BASE_URL = resolveApiBaseUrl();

export function getAccessToken() {
  if (typeof window === "undefined") {
    return null;
  }

  return localStorage.getItem("accessToken");
}

export function buildApiUrl(path: string) {
  return `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20000,
});

api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error?.response?.status === 401 && typeof window !== "undefined") {
      localStorage.removeItem("accessToken");
      localStorage.removeItem("refreshToken");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export default api;
