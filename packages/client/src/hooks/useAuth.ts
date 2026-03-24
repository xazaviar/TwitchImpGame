import { useEffect, useState, useCallback } from "react";
import { reconnectWithToken, getAuthToken, clearAuth } from "../lib/socket.js";

interface TwitchUser {
  twitchId: string;
  username: string;
  displayName: string;
}

export function useAuth() {
  const [user, setUser] = useState<TwitchUser | null>(() => {
    const stored = localStorage.getItem("hh_user");
    return stored ? JSON.parse(stored) : null;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for auth token in URL (redirect from OAuth)
    const params = new URLSearchParams(window.location.search);
    const authToken = params.get("auth");

    if (authToken) {
      // Store token and clean URL
      localStorage.setItem("hh_auth_token", authToken);
      window.history.replaceState({}, "", window.location.pathname);
      reconnectWithToken(authToken);
    }

    // Validate stored token
    const token = getAuthToken();
    if (token) {
      fetch("/api/auth/me", {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => {
          if (res.ok) return res.json();
          throw new Error("Invalid token");
        })
        .then((data: TwitchUser) => {
          setUser(data);
          localStorage.setItem("hh_user", JSON.stringify(data));
          // Ensure socket is connected with token
          reconnectWithToken(token);
        })
        .catch(() => {
          // Token expired or invalid
          clearAuth();
          setUser(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = useCallback(() => {
    // Redirect to Twitch OAuth via our server
    window.location.href = "/api/auth/viewer";
  }, []);

  const logout = useCallback(() => {
    clearAuth();
    setUser(null);
  }, []);

  return { user, loading, login, logout };
}
