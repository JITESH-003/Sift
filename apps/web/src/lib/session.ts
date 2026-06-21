import { API_URL } from "./config";
import type { AuthResult, AuthUser } from "./api";

type Session = {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
};

const LOGGED_OUT: Session = {
  user: null,
  accessToken: null,
  refreshToken: null,
};

const KEYS = {
  access: "sift.accessToken",
  refresh: "sift.refreshToken",
  user: "sift.user",
};

let cache: Session | null = null;
const listeners = new Set<() => void>();

function load(): Session {
  if (cache) return cache;
  if (typeof window === "undefined") return LOGGED_OUT;
  const accessToken = localStorage.getItem(KEYS.access);
  const refreshToken = localStorage.getItem(KEYS.refresh);
  const userRaw = localStorage.getItem(KEYS.user);
  cache =
    accessToken && userRaw
      ? { user: JSON.parse(userRaw) as AuthUser, accessToken, refreshToken }
      : LOGGED_OUT;
  return cache;
}

function emit() {
  listeners.forEach((listener) => listener());
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSnapshot(): Session {
  return load();
}

export function getServerSnapshot(): Session {
  return LOGGED_OUT;
}

export function getAccessToken(): string | null {
  return load().accessToken;
}

export function setSession(result: AuthResult | null) {
  if (result) {
    localStorage.setItem(KEYS.access, result.accessToken);
    localStorage.setItem(KEYS.refresh, result.refreshToken);
    localStorage.setItem(KEYS.user, JSON.stringify(result.user));
    cache = {
      user: result.user,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    };
  } else {
    localStorage.removeItem(KEYS.access);
    localStorage.removeItem(KEYS.refresh);
    localStorage.removeItem(KEYS.user);
    cache = LOGGED_OUT;
  }
  emit();
}

let inFlight: Promise<string | null> | null = null;

export function refresh(): Promise<string | null> {
  inFlight ??= doRefresh().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function doRefresh(): Promise<string | null> {
  const current = load();
  if (!current.refreshToken) return null;
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { Authorization: `Bearer ${current.refreshToken}` },
    });
    if (!res.ok) {
      setSession(null);
      return null;
    }
    const data = (await res.json()) as {
      accessToken: string;
      refreshToken: string;
    };
    localStorage.setItem(KEYS.access, data.accessToken);
    localStorage.setItem(KEYS.refresh, data.refreshToken);
    cache = {
      user: current.user,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
    };
    emit();
    return data.accessToken;
  } catch {
    return null;
  }
}
