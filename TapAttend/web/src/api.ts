const TOKEN_KEY = "tapattend_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = (data as { detail?: string }).detail || "Request failed";
    throw new Error(detail);
  }
  return data as T;
}

export type Me = {
  id: string;
  full_name: string;
  email: string;
  role: "owner" | "hr" | "employee";
  org_id: string;
  org_name: string;
  country: string;
  device_fingerprint: string | null;
};

export type UserRow = {
  id: string;
  full_name: string;
  email: string;
  role: string;
  device_fingerprint: string | null;
};

export type Point = {
  id: string;
  token_uid: string;
  location_name: string | null;
  latitude: number | null;
  longitude: number | null;
  radius_meters: number;
  is_active: boolean;
};

export type LogRow = {
  id: string;
  event_type: "in" | "out";
  scan_method: "nfc" | "qr";
  recorded_at: string;
  user_name?: string | null;
  location_name?: string | null;
};

export const api = {
  login: (email: string, password: string) =>
    request<{ access_token: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  registerOrg: (body: { org_name: string; full_name: string; email: string; password: string }) =>
    request<{ access_token: string }>("/api/auth/register-org", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  me: () => request<Me>("/api/auth/me"),
  users: () => request<UserRow[]>("/api/users"),
  createUser: (body: { full_name: string; email: string; password: string; role: string }) =>
    request<UserRow>("/api/users", { method: "POST", body: JSON.stringify(body) }),
  points: () => request<Point[]>("/api/points"),
  createPoint: (body: Record<string, unknown>) =>
    request<Point>("/api/points", { method: "POST", body: JSON.stringify(body) }),
  logs: () => request<LogRow[]>("/api/attendance/logs"),
  mine: () => request<LogRow[]>("/api/attendance/mine"),
  summary: () =>
    request<{ scans_today: number; present_employees: number; total_employees: number }>(
      "/api/attendance/today-summary"
    ),
};
