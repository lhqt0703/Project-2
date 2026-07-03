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

  let existing = window.localStorage.getItem(CLIENT_ID_STORAGE_KEY);
  
  // ponytail: cookie fallback backup if localStorage is cleared by browser
  if (!existing) {
    const match = document.cookie.match(new RegExp('(^| )' + CLIENT_ID_STORAGE_KEY + '=([^;]+)'));
    if (match) {
      existing = match[2];
      window.localStorage.setItem(CLIENT_ID_STORAGE_KEY, existing);
    }
  }
  
  if (existing) return existing;


  /* 
  Cách 1 (Ưu tiên): Sử dụng tính năng sinh mã ngẫu nhiên bảo mật của trình duyệt là crypto.randomUUID(). Cách này tạo ra các ID dạng ngẫu nhiên như 046fa88a-.... Hầu hết các trình duyệt hiện đại chạy trên giao thức an toàn https:// đều dùng cách này.
  Cách 2 (Dự phòng): Nếu trình duyệt quá cũ hoặc chạy trên giao thức không an toàn (http:// - nơi trình duyệt khóa tính năng crypto), hệ thống sẽ tự tạo ID thủ công bằng công thức: client_ + Thời gian hiện tại + Ký tự ngẫu nhiên */
  const nextId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `client_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  window.localStorage.setItem(CLIENT_ID_STORAGE_KEY, nextId);
  // ponytail: set secure long-lived cookie as client ID backup
  document.cookie = `${CLIENT_ID_STORAGE_KEY}=${nextId}; max-age=${10 * 365 * 24 * 60 * 60}; path=/; SameSite=Lax; Secure`;
  return nextId;
}

const backendUrl =
  import.meta.env.VITE_BACKEND_URL ??
  `https://s.gummybears.io.vn`;
  //`${window.location.protocol}//${window.location.hostname}:3001`;

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

let hasDevPlayer = false;

socket.onAny((event, ...args) => {
  if (event === "roomUpdated" || event === "roomJoined") {
    const room = args[0];
    if (room && typeof room === "object" && Array.isArray(room.players)) {
      const containsDev = room.players.some((p: any) => p && typeof p.id === "string" && p.id.startsWith("dev-"));
      hasDevPlayer = containsDev;
    }
  }

  recordSocketLog("in", event, args);
  if (hasDevPlayer) {
    console.log(`%c[Socket IN] ${event}`, "color: #10b981; font-weight: bold", args);
  }
});

(socket as any).onAnyOutgoing?.((event: string, ...args: unknown[]) => {
  recordSocketLog("out", event, args);
  if (hasDevPlayer) {
    console.log(`%c[Socket OUT] ${event}`, "color: #3b82f6; font-weight: bold", args);
  }
});

