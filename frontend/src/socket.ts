import { io } from "socket.io-client";

declare global {
  interface Window {
    __werewolfSocketLog?: Array<{
      at: string;
      direction: "in" | "out";
      event: string;
      args: unknown[];
    }>;
  }
}

const CLIENT_ID_STORAGE_KEY = "werewolfClientId";
const DEV_CLIENT_ID_SESSION_KEY = "werewolfDevClientId";
const SOCKET_LOG_LIMIT = 300;

function getDevClientIdOverride() {
  const allowDevClientId =
    import.meta.env.DEV || import.meta.env.VITE_ALLOW_DEV_CLIENT_ID === "true";
  if (!allowDevClientId) return null;

  const params = new URLSearchParams(window.location.search);
  const queryClientId = params.get("devClientId")?.trim();
  if (queryClientId) {
    window.sessionStorage.setItem(DEV_CLIENT_ID_SESSION_KEY, queryClientId);
    return queryClientId;
  }

  return window.sessionStorage.getItem(DEV_CLIENT_ID_SESSION_KEY);
}

function getOrCreateClientId() {
  const devClientId = getDevClientIdOverride();
  if (devClientId) return devClientId;

  const existing = window.localStorage.getItem(CLIENT_ID_STORAGE_KEY);
  if (existing) return existing;

  const nextId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `client_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  window.localStorage.setItem(CLIENT_ID_STORAGE_KEY, nextId);
  return nextId;
}

const backendUrl =
  import.meta.env.VITE_BACKEND_URL ??
  `${window.location.protocol}//${window.location.hostname}:3001`;

export const clientId = getOrCreateClientId();

export const socket = io(backendUrl, {
  auth: { clientId },
});

function cloneForSocketLog(value: unknown) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

function recordSocketLog(direction: "in" | "out", event: string, args: unknown[]) {
  const next = {
    at: new Date().toISOString(),
    direction,
    event,
    args: args.map(cloneForSocketLog),
  };
  window.__werewolfSocketLog = [...(window.__werewolfSocketLog || []), next].slice(-SOCKET_LOG_LIMIT);
}

socket.onAny((event, ...args) => {
  recordSocketLog("in", event, args);
});

(socket as any).onAnyOutgoing?.((event: string, ...args: unknown[]) => {
  recordSocketLog("out", event, args);
});
