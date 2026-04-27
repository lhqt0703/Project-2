import { io } from "socket.io-client";

const CLIENT_ID_STORAGE_KEY = "werewolfClientId";

function getOrCreateClientId() {
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
