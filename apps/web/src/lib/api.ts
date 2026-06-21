import { API_URL } from "./config";
import { getAccessToken, refresh } from "./session";

export type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
};

export type AuthResult = {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
};

export type Chart =
  | { type: "stat"; label: string; value: unknown }
  | { type: "line"; x: string; y: string }
  | { type: "bar"; x: string; y: string }
  | { type: "table"; columns: string[] };

export type AskMeta = {
  confidence: "high" | "medium" | "low";
  retried: boolean;
  provider: string;
  promptTokens: number;
  completionTokens: number;
};

export type AskResult =
  | {
      status: "ok";
      sql: string;
      cached: boolean;
      rowCount: number;
      latencyMs: number;
      chart: Chart;
      rows: Record<string, unknown>[];
      meta: AskMeta;
    }
  | { status: "blocked"; reason: string; meta: AskMeta }
  | { status: "error"; sql: string; error: string; meta: AskMeta };

export type DataSource = {
  id: string;
  name: string;
  kind: string;
  createdAt: string;
};

export type Conversation = {
  id: string;
  title: string | null;
  dataSourceId: string;
  createdAt: string;
};

function safeJson(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function errorMessage(body: unknown, status: number): string {
  if (body && typeof body === "object" && "message" in body) {
    const message = (body as { message: unknown }).message;
    if (Array.isArray(message)) return message.join(", ");
    if (typeof message === "string") return message;
  }
  return `Request failed (${status})`;
}

type CallOptions = { method?: string; body?: unknown; token?: string };

async function call(
  path: string,
  options: CallOptions,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const res = await fetch(`${API_URL}${path}`, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  return { ok: res.ok, status: res.status, data: safeJson(await res.text()) };
}

async function publicFetch<T>(path: string, options: CallOptions = {}): Promise<T> {
  const result = await call(path, options);
  if (!result.ok) throw new Error(errorMessage(result.data, result.status));
  return result.data as T;
}

async function authedFetch<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const token = getAccessToken();
  let result = await call(path, { ...options, token: token ?? undefined });
  if (result.status === 401) {
    const refreshed = await refresh();
    if (refreshed) {
      result = await call(path, { ...options, token: refreshed });
    }
  }
  if (!result.ok) throw new Error(errorMessage(result.data, result.status));
  return result.data as T;
}

export const authApi = {
  register: (body: { email: string; password: string; name?: string }) =>
    publicFetch<AuthResult>("/auth/register", { method: "POST", body }),
  login: (body: { email: string; password: string }) =>
    publicFetch<AuthResult>("/auth/login", { method: "POST", body }),
  guest: () => publicFetch<AuthResult>("/auth/guest", { method: "POST" }),
};

export const dataSourcesApi = {
  list: () => authedFetch<DataSource[]>("/datasources"),
  create: (body: { name: string; schema: string }) =>
    authedFetch<DataSource>("/datasources", { method: "POST", body }),
  get: (id: string) =>
    authedFetch<DataSource & { snapshot: { id: string } | null }>(
      `/datasources/${id}`,
    ),
  introspect: (id: string) =>
    authedFetch<{ id: string }>(`/datasources/${id}/introspect`, {
      method: "POST",
    }),
};

export const conversationsApi = {
  list: () => authedFetch<Conversation[]>("/conversations"),
  create: (body: { dataSourceId: string; title?: string }) =>
    authedFetch<Conversation>("/conversations", { method: "POST", body }),
  ask: (id: string, question: string) =>
    authedFetch<AskResult>(`/conversations/${id}/ask`, {
      method: "POST",
      body: { question },
    }),
};
