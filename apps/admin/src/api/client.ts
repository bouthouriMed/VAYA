const TOKEN_STORAGE_KEY = 'vaya_admin_token';
const ADMIN_STORAGE_KEY = 'vaya_admin_session';

export function getApiBaseUrl(): string {
  return import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api/v1';
}

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function storeSession(token: string, admin: unknown): void {
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
  localStorage.setItem(ADMIN_STORAGE_KEY, JSON.stringify(admin));
}

export function getStoredAdmin<T>(): T | null {
  const raw = localStorage.getItem(ADMIN_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(ADMIN_STORAGE_KEY);
}

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/** Fired on any 401 so the app-level session listener can redirect to
 *  login — kept decoupled from React (this module has no hook access) via
 *  a plain DOM CustomEvent, listened to once in AuthContext. */
function notifyUnauthorized(): void {
  window.dispatchEvent(new CustomEvent('vaya-admin:unauthorized'));
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  params?: Record<string, string | number | undefined>;
}

function buildUrl(path: string, params?: RequestOptions['params']): string {
  const url = new URL(`${getApiBaseUrl()}${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.params), {
      method: options.method ?? 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError('Network error — could not reach the VAYA API', 0);
  }

  if (response.status === 401) {
    notifyUnauthorized();
  }

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    let code: string | undefined;
    try {
      // The API always nests its error under `error` (AppError's shape,
      // e.g. {"error":{"code":"CONFLICT","message":"..."}}), not at the
      // response body's top level — reading data.message/data.code
      // directly here always came back undefined, so every admin-panel
      // error silently fell back to the generic "Request failed (N)"
      // regardless of what the server actually said.
      const data = (await response.json()) as { error?: { message?: string; code?: string } };
      if (data.error?.message) message = data.error.message;
      code = data.error?.code;
    } catch {
      // non-JSON error body — keep the generic message
    }
    throw new ApiError(message, response.status, code);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** For the two document-file endpoints, which return raw image bytes, not
 *  JSON — see admin-verification.service.ts's getVerificationDocumentFile.
 *  Caller owns revoking the returned object URL (URL.revokeObjectURL) once
 *  it's no longer displayed, to avoid leaking memory across document views. */
export async function fetchDocumentObjectUrl(path: string): Promise<string> {
  const token = getStoredToken();
  const response = await fetch(buildUrl(path), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (response.status === 401) notifyUnauthorized();
  if (!response.ok) throw new ApiError(`Could not load document (${response.status})`, response.status);
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}
