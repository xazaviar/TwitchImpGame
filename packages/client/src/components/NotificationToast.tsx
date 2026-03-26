import { useEffect } from "react";
import { useGameStore } from "../stores/game.store";
import type { NotificationType } from "../stores/game.store";

const TYPE_COLORS: Record<NotificationType, string> = {
  gold: "#ffd700",
  xp: "#4fc3f7",
  level_up: "#4caf50",
  skill: "#ce93d8",
  item: "#ff9800",
};


export function NotificationToast() {
  const notifications = useGameStore((s) => s.notifications);
  const removeNotification = useGameStore((s) => s.removeNotification);

  return (
    <div
      style={{
        position: "fixed",
        top: "1rem",
        right: "1rem",
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
        pointerEvents: "none",
      }}
    >
      {notifications.map((n) => (
        <NotificationItem
          key={n.id}
          id={n.id}
          message={n.message}
          type={n.type}
          onExpire={removeNotification}
        />
      ))}
    </div>
  );
}

function NotificationItem({
  id,
  message,
  type,
  onExpire,
}: {
  id: string;
  message: string;
  type: NotificationType;
  onExpire: (id: string) => void;
}) {
  useEffect(() => {
    const timer = setTimeout(() => onExpire(id), 5000);
    return () => clearTimeout(timer);
  }, [id, onExpire]);

  const color = TYPE_COLORS[type];

  return (
    <div
      style={{
        backgroundColor: "rgba(0, 0, 0, 0.85)",
        border: `1px solid ${color}`,
        borderLeft: `3px solid ${color}`,
        borderRadius: "4px",
        padding: "0.5rem 1rem",
        color: "#eee",
        fontSize: "0.9rem",
        minWidth: "180px",
        maxWidth: "300px",
        pointerEvents: "auto",
        animation: "slideInRight 0.3s ease-out",
      }}
    >
      <span style={{ color, fontWeight: "bold", marginRight: "0.5rem" }}>
        {message}
      </span>
    </div>
  );
}
