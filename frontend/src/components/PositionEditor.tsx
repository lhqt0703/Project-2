import React, { useEffect, useRef, useState } from "react";
import { socket } from "../socket";

interface Player {
  id: string;
  name: string;
  connected?: boolean;
}

interface PlayerPosition {
  playerId: string;
  x: number;
  y: number;
}

export default function PositionEditor({
  roomId,
  players,
  positionsFromServer,
  isEditor,
  onClose,
}: {
  roomId: string;
  players: Player[];
  positionsFromServer?: PlayerPosition[];
  isEditor: boolean;
  onClose: () => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [positions, setPositions] = useState<PlayerPosition[]>([]);
  const [dragging, setDragging] = useState<string | null>(null);

  // map positions (server) -> local state
  useEffect(() => {
    if (positionsFromServer && positionsFromServer.length === players.length) {
      setPositions(positionsFromServer);
      return;
    }
    // else generate circle
    const ids = players.map(p => p.id);
    const n = ids.length;
    const newPos: PlayerPosition[] = ids.map((id, i) => {
      const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
      const x = 0.5 + 0.35 * Math.cos(angle);
      const y = 0.5 + 0.35 * Math.sin(angle);
      return { playerId: id, x, y };
    });
    setPositions(newPos);
  }, [players, positionsFromServer]);

  
  const onPointerDown = (e: React.PointerEvent, playerId: string) => {
    if (!isEditor) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    setDragging(playerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const clampedX = Math.max(0, Math.min(1, x));
    const clampedY = Math.max(0, Math.min(1, y));
    setPositions(prev => prev.map(p => p.playerId === dragging ? { ...p, x: clampedX, y: clampedY } : p));
  };

  const onPointerUp = async () => {
    if (!dragging) return;
    // emit updated positions to server
    socket.emit("updatePositions", { roomId, positions });
    setDragging(null);
  };

  // allow keyboard save/cancel
  useEffect(() => {
    const handler = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") onClose();
      if (ev.key === "Enter") socket.emit("updatePositions", { roomId, positions });
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [positions, roomId, onClose]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.35)",
        zIndex: 2000,
      }}
      onPointerUp={onPointerUp}
    >
      <div style={{ background: "#fff", padding: 16, borderRadius: 10, width: 620, maxWidth: "95%" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3>Sắp xếp vị trí người chơi</h3>
          <div>
            <button onClick={() => { socket.emit("updatePositions", { roomId, positions }); onClose(); }}>Lưu</button>{" "}
            <button onClick={onClose}>Đóng</button>
          </div>
        </div>

        <div
          ref={containerRef}
          style={{
            marginTop: 12,
            width: "100%",
            height: 500,
            background: "#f7f7f7",
            borderRadius: 8,
            position: "relative",
            overflow: "hidden",
            touchAction: "none",
          }}
          onPointerMove={onPointerMove}
        >
          {/* draw center marker */}
          <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", pointerEvents: "none", opacity: 0.6 }}>
            <div style={{ width: 8, height: 8, borderRadius: 4, background: "#999" }} />
          </div>

          {positions.map((pos) => {
            const p = players.find(x => x.id === pos.playerId)!;
            const left = `${pos.x * 100}%`;
            const top = `${pos.y * 100}%`;
            return (
              <div
                key={pos.playerId}
                onPointerDown={(e) => onPointerDown(e, pos.playerId)}
                style={{
                  position: "absolute",
                  left,
                  top,
                  transform: "translate(-50%,-50%)",
                  width: 80,
                  height: 80,
                  borderRadius: 40,
                  background: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "2px solid #444",
                  userSelect: "none",
                  cursor: isEditor ? "grab" : "default",
                }}
              >
                <div style={{ textAlign: "center", fontSize: 12 }}>
                  <div style={{ fontWeight: "bold" }}>{p.name}</div>
                  <div style={{ fontSize: 11, opacity: 0.7 }}>{p.id === socket.id ? "(Bạn)" : ""}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}