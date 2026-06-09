/**
 * HTTP client for the e-learning module.
 *
 * Keeps the same public surface as the original Shalom apiService (get/post/put/
 * patch/delete + ApiError types) so ported feature services work nearly unchanged,
 * but targets the Pingan Spring backend under `/api/fn` and authenticates with the
 * Pingan JWT (via TokenService) instead of a Supabase session.
 */
import { learningApiUrl, getLearningAuthToken } from "./apiConfig";

const TIMEOUT = 15000;
const MAX_RETRIES = 2;
const RETRY_DELAY = 1000;

export class ApiError extends Error {
  status?: number;
  statusCode?: number;
  code?: string;
  details?: any;
  data?: any;

  constructor(message: string, status?: number, code?: string, details?: any) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.statusCode = status;
    this.code = code;
    this.details = details;
    this.data = details;
  }
}

export class NetworkError extends ApiError {
  constructor(message = "Network connection failed") {
    super(message, 0, "NETWORK_ERROR");
    this.name = "NetworkError";
  }
}

export class TimeoutError extends ApiError {
  constructor(message = "Request timed out") {
    super(message, 408, "TIMEOUT_ERROR");
    this.name = "TimeoutError";
  }
}

type Method = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

interface RequestConfig {
  url: string;
  method: Method;
  headers?: Record<string, string>;
  body?: any;
  params?: Record<string, string>;
  timeout?: number;
  retries?: number;
}

const CODE_MAP: Record<number, string> = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  429: "RATE_LIMIT",
  500: "SERVER_ERROR",
  502: "BAD_GATEWAY",
  503: "SERVICE_UNAVAILABLE",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const buildQuery = (params?: Record<string, string>): string => {
  if (!params) return "";
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) sp.append(k, String(v));
  });
  const s = sp.toString();
  return s ? `?${s}` : "";
};

const isJson = (res: Response) =>
  (res.headers?.get?.("content-type") || "").toLowerCase().includes("application/json");

async function parseJson(res: Response): Promise<any> {
  if (res.status === 204 || res.status === 205) return {};
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

class ApiService {
  async request<T = any>(config: RequestConfig): Promise<T> {
    const { url, method, body, params, timeout = TIMEOUT, retries = MAX_RETRIES } = config;
    const fullUrl = `${learningApiUrl(url)}${buildQuery(params)}`;

    const token = await getLearningAuthToken();
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...(config.headers || {}),
    };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const isRaw =
      body instanceof FormData ||
      (typeof Blob !== "undefined" && body instanceof Blob) ||
      body instanceof ArrayBuffer;
    if (!isRaw && body !== undefined && method !== "GET") {
      headers["Content-Type"] = "application/json";
    }

    const options: RequestInit = { method, headers };
    if (body !== undefined && method !== "GET") {
      options.body = isRaw || typeof body === "string" ? body : JSON.stringify(body);
    }

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);
        const res = await fetch(fullUrl, { ...options, signal: controller.signal });
        clearTimeout(timer);

        if (!res.ok) {
          const errBody = isJson(res) ? await parseJson(res) : { message: await res.text() };
          const message =
            errBody?.message || errBody?.error || errBody?.reason || `HTTP ${res.status}`;
          throw new ApiError(message, res.status, CODE_MAP[res.status] || "HTTP_ERROR", errBody);
        }

        return (isJson(res) ? await parseJson(res) : {}) as T;
      } catch (error) {
        if (error instanceof ApiError) throw error;
        if (error instanceof Error && error.name === "AbortError") {
          if (attempt < retries) {
            await sleep(RETRY_DELAY * (attempt + 1));
            continue;
          }
          throw new TimeoutError();
        }
        if (attempt < retries) {
          await sleep(RETRY_DELAY * (attempt + 1));
          continue;
        }
        throw new NetworkError(error instanceof Error ? error.message : "Network error");
      }
    }
    throw new ApiError("Max retries exceeded", undefined, "MAX_RETRIES_EXCEEDED");
  }

  get<T = any>(url: string, params?: Record<string, string>, config?: Partial<RequestConfig>) {
    return this.request<T>({ url, method: "GET", params, ...config });
  }
  post<T = any>(url: string, body?: any, config?: Partial<RequestConfig>) {
    return this.request<T>({ url, method: "POST", body, ...config });
  }
  put<T = any>(url: string, body?: any, config?: Partial<RequestConfig>) {
    return this.request<T>({ url, method: "PUT", body, ...config });
  }
  patch<T = any>(url: string, body?: any, config?: Partial<RequestConfig>) {
    return this.request<T>({ url, method: "PATCH", body, ...config });
  }
  delete<T = any>(url: string, config?: Partial<RequestConfig>) {
    return this.request<T>({ url, method: "DELETE", ...config });
  }
}

export const apiService = new ApiService();
export default apiService;
