import { io, Socket } from "socket.io-client";
import type { ServerToClientEvents, ClientToServerEvents } from "@imp/shared";

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: AppSocket | null = null;

export function getSocket(): AppSocket {
  if (!socket) {
    const token = localStorage.getItem("hh_auth_token");
    socket = io({
      autoConnect: false,
      withCredentials: true,
      auth: token ? { token } : undefined,
    });
  }
  return socket;
}

/** Reconnect socket with a new auth token */
export function reconnectWithToken(token: string): void {
  localStorage.setItem("hh_auth_token", token);
  if (socket) {
    socket.disconnect();
    socket.auth = { token };
    socket.connect();
  }
}

/** Get the stored auth token */
export function getAuthToken(): string | null {
  return localStorage.getItem("hh_auth_token");
}

/** Clear auth */
export function clearAuth(): void {
  localStorage.removeItem("hh_auth_token");
  localStorage.removeItem("hh_user");
  if (socket) {
    socket.disconnect();
    socket.auth = {};
    socket.connect();
  }
}
