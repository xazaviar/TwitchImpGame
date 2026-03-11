import { useEffect, useRef, useState } from "react";
import { getSocket, type AppSocket } from "../lib/socket.js";

export function useSocket() {
  const socketRef = useRef<AppSocket>(getSocket());
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = socketRef.current;

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    if (!socket.connected) {
      socket.connect();
    } else {
      setConnected(true);
    }

    return () => {
      socket.off("connect");
      socket.off("disconnect");
    };
  }, []);

  return { socket: socketRef.current, connected };
}
