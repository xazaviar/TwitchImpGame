import { io, Socket } from "socket.io-client";
import type { ServerToClientEvents, ClientToServerEvents } from "@imp/shared";

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: AppSocket | null = null;

export function getSocket(): AppSocket {
  if (!socket) {
    socket = io({
      autoConnect: false,
      withCredentials: true,
    });
  }
  return socket;
}
