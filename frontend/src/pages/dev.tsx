import { useState, useEffect, useRef } from "react";
import { socket } from "../socket";
import { shootWinnerConfettiFromSides } from "../utils/winnerConfetti";

export default function DevSpawn() {
  // Spawner States
  const [roomId, setRoomId] = useState("");
  const [count, setCount] = useState(5);
  const [prefix, setPrefix] = useState("P");
  const [debugAnim, setDebugAnim] = useState(true);

  // Replay States
  const [savedMatches, setSavedMatches] = useState<string[]>([]);
  const [selectedMatch, setSelectedMatch] = useState("");
  const [activeReplayRoomId, setActiveReplayRoomId] = useState<string | null>(null);
  const [replayIndex, setReplayIndex] = useState(0);
  const [totalSteps, setTotalSteps] = useState(0);
  const [gameLogs, setGameLogs] = useState<any[]>([]);
  const [replayFinished, setReplayFinished] = useState(false);
  const [replayError, setReplayError] = useState("");

  const terminalEndRef = useRef<HTMLDivElement>(null);

  // Load Saved Matches on Mount
  useEffect(() => {
    socket.emit("listSavedMatches", (res: any) => {
      if (res?.matches) {
        setSavedMatches(res.matches);
        if (res.matches.length > 0) {
          setSelectedMatch(res.matches[0]);
        }
      }
    });

    const handleSavedMatches = (res: any) => {
      if (res?.matches) {
        setSavedMatches(res.matches);
        if (res.matches.length > 0 && !selectedMatch) {
          setSelectedMatch(res.matches[0]);
        }
      }
    };
    socket.on("savedMatchesList", handleSavedMatches);

    return () => {
      socket.off("savedMatchesList", handleSavedMatches);
    };
  }, []);

  // Listen to Replay Room Updates
  useEffect(() => {
    if (!activeReplayRoomId) return;

    const handleRoomUpdated = (room: any) => {
      if (room.id === activeReplayRoomId) {
        setReplayIndex(room.replayIndex || 0);
        setTotalSteps(room.replayEvents?.length || 0);
        if (room.replayEvents && room.replayIndex >= room.replayEvents.length) {
          setReplayFinished(true);
        } else {
          setReplayFinished(false);
        }
      }
    };

    const handleGameLogUpdated = (payload: any) => {
      if (payload.roomId === activeReplayRoomId) {
        setGameLogs(payload.nights || []);
      }
    };

    socket.on("roomCreated", handleRoomUpdated);
    socket.on("roomUpdated", handleRoomUpdated);
    socket.on("gameLogUpdated", handleGameLogUpdated);

    return () => {
      socket.off("roomCreated", handleRoomUpdated);
      socket.off("roomUpdated", handleRoomUpdated);
      socket.off("gameLogUpdated", handleGameLogUpdated);
    };
  }, [activeReplayRoomId]);

  // Scroll to bottom of terminal when logs update
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [gameLogs]);

  // Actions
  const spawn = () => {
    const rid = (roomId || "").trim();
    if (!rid) return;
    const spawnBatchId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}_${Math.random().toString(36).slice(2)}`;

    for (let i = 1; i <= count; i++) {
      const params = new URLSearchParams();
      params.set("roomId", rid);
      params.set("name", `${prefix}${i}`);
      const devId = `dev-${spawnBatchId}-${i}`;
      params.set("devClientId", devId);
      window.open(`/?${params.toString()}`, "_blank");
    }
  };

  const openGame = (opts?: { debugAnim?: boolean; replayRoomId?: string }) => {
    const rid = opts?.replayRoomId || (roomId || "").trim();
    if (!rid) return;
    const params = new URLSearchParams();
    params.set("roomId", rid);
    if (opts?.debugAnim) params.set("debugAnim", "1");
    window.open(`/game?${params.toString()}`, "_blank");
  };

  const handleStartReplay = () => {
    if (!selectedMatch) return;
    setReplayError("");
    socket.emit("startScenarioReplay", { fileName: selectedMatch }, (res: any) => {
      if (res?.ok && res.roomId && res.room) {
        setActiveReplayRoomId(res.roomId);
        setReplayIndex(res.room.replayIndex || 0);
        setTotalSteps(res.room.replayEvents?.length || 0);
        setGameLogs(res.room.gameLog || []);
        setReplayFinished(false);
      } else {
        setReplayError(res?.error || "Không thể khởi tạo replay room.");
      }
    });
  };

  const handleNextStep = () => {
    if (!activeReplayRoomId) return;
    socket.emit("nextReplayStep", { roomId: activeReplayRoomId }, (res: any) => {
      if (res?.ok) {
        if (res.finished) {
          setReplayFinished(true);
        }
      }
    });
  };

  // Flattened entries helper
  const allLogEntries = gameLogs.reduce((acc: any[], night: any) => {
    return [...acc, ...(night.entries || [])];
  }, []);

  return (
    <div style={{
      minHeight: "100vh",
      background: "radial-gradient(ellipse at top, #1e1b4b, #0f0c1b, #07050f)",
      color: "#e2e8f0",
      fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
      padding: "32px",
      boxSizing: "border-box"
    }}>
      {/* Header Banner */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        borderBottom: "1px solid rgba(99, 102, 241, 0.2)",
        paddingBottom: "20px",
        marginBottom: "32px",
      }}>
        <div>
          <h1 style={{
            fontSize: "2.25rem",
            fontWeight: 800,
            margin: 0,
            background: "linear-gradient(135deg, #a78bfa, #6366f1, #3b82f6)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            letterSpacing: "-0.025em"
          }}>
            Antigravity Dev Center
          </h1>
          <p style={{ margin: "4px 0 0 0", color: "#94a3b8", fontSize: "0.875rem" }}>
            Quản trị & phát lại kịch bản nâng cao dành cho nhà phát triển Dạ Nghịch
          </p>
        </div>
        <div style={{
          background: "rgba(16, 185, 129, 0.1)",
          border: "1px solid rgba(16, 185, 129, 0.2)",
          borderRadius: "9999px",
          padding: "6px 16px",
          display: "flex",
          alignItems: "center",
          gap: "8px",
          fontSize: "0.875rem",
          fontWeight: 600,
          color: "#34d399",
        }}>
          <span style={{
            width: "8px",
            height: "8px",
            background: "#10b981",
            borderRadius: "50%",
            boxShadow: "0 0 8px #10b981"
          }} />
          Môi Trường Development Sẵn Sàng
        </div>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(480px, 1fr))",
        gap: "32px",
        alignItems: "start"
      }}>
        {/* PANEL LEFT: Spawner Utility */}
        <div style={{
          background: "rgba(30, 27, 75, 0.25)",
          backdropFilter: "blur(12px)",
          border: "1px solid rgba(99, 102, 241, 0.15)",
          borderRadius: "16px",
          padding: "24px",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
        }}>
          <h2 style={{ fontSize: "1.5rem", fontWeight: 700, margin: "0 0 20px 0", display: "flex", alignItems: "center", gap: "10px" }}>
            <span>🤖</span> Trình Tạo Player Ảo
          </h2>

          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, color: "#94a3b8", marginBottom: "6px" }}>
                Mã Phòng (Room ID):
              </label>
              <input
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                placeholder="Nhập mã phòng 3 số, vd: 123"
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  borderRadius: "8px",
                  border: "1px solid rgba(99, 102, 241, 0.2)",
                  background: "rgba(15, 12, 30, 0.6)",
                  color: "#f1f5f9",
                  fontSize: "1rem",
                  outline: "none",
                  transition: "all 0.2s",
                  boxSizing: "border-box"
                }}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, color: "#94a3b8", marginBottom: "6px" }}>
                  Số Lượng Player:
                </label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={count}
                  onChange={(e) => setCount(Math.max(1, Number(e.target.value)))}
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: "8px",
                    border: "1px solid rgba(99, 102, 241, 0.2)",
                    background: "rgba(15, 12, 30, 0.6)",
                    color: "#f1f5f9",
                    fontSize: "1rem",
                    outline: "none",
                    boxSizing: "border-box"
                  }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, color: "#94a3b8", marginBottom: "6px" }}>
                  Prefix Tên:
                </label>
                <input
                  value={prefix}
                  onChange={(e) => setPrefix(e.target.value)}
                  placeholder="Vd: P"
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: "8px",
                    border: "1px solid rgba(99, 102, 241, 0.2)",
                    background: "rgba(15, 12, 30, 0.6)",
                    color: "#f1f5f9",
                    fontSize: "1rem",
                    outline: "none",
                    boxSizing: "border-box"
                  }}
                />
              </div>
            </div>

            <label style={{
              display: "flex",
              gap: "10px",
              alignItems: "center",
              cursor: "pointer",
              userSelect: "none",
              background: "rgba(99, 102, 241, 0.05)",
              padding: "12px",
              borderRadius: "8px",
              border: "1px dashed rgba(99, 102, 241, 0.2)"
            }}>
              <input
                type="checkbox"
                checked={debugAnim}
                onChange={(e) => setDebugAnim(e.target.checked)}
                style={{ width: "18px", height: "18px", accentColor: "#6366f1", cursor: "pointer" }}
              />
              <span style={{ fontSize: "0.875rem", color: "#cbd5e1" }}>
                Kích hoạt debug anim cho Thợ Săn (chỉ test game)
              </span>
            </label>

            <button
              onClick={spawn}
              disabled={!roomId.trim()}
              style={{
                width: "100%",
                padding: "14px",
                borderRadius: "8px",
                border: "none",
                background: roomId.trim()
                  ? "linear-gradient(135deg, #7c3aed, #4f46e5)"
                  : "rgba(99, 102, 241, 0.15)",
                color: roomId.trim() ? "#ffffff" : "#64748b",
                fontWeight: 700,
                fontSize: "1rem",
                cursor: roomId.trim() ? "pointer" : "not-allowed",
                boxShadow: roomId.trim() ? "0 4px 14px rgba(124, 58, 237, 0.4)" : "none",
                transition: "all 0.2s",
              }}
            >
              Spawn Mở Tab Player Hàng Loạt 🚀
            </button>
          </div>

          {/* Quick links to open host page */}
          <div style={{ marginTop: "24px", borderTop: "1px solid rgba(99, 102, 241, 0.15)", paddingTop: "20px" }}>
            <h3 style={{ fontSize: "1rem", fontWeight: 600, margin: "0 0 12px 0", color: "#a78bfa" }}>
              Liên kết nhanh Host/Game
            </h3>
            <div style={{ display: "flex", gap: "12px" }}>
              <button
                onClick={() => openGame({ debugAnim: false })}
                disabled={!roomId.trim()}
                style={{
                  flex: 1,
                  padding: "10px",
                  borderRadius: "8px",
                  border: "1px solid rgba(99, 102, 241, 0.3)",
                  background: "rgba(99, 102, 241, 0.1)",
                  color: "#cbd5e1",
                  fontWeight: 600,
                  fontSize: "0.875rem",
                  cursor: roomId.trim() ? "pointer" : "not-allowed",
                  transition: "all 0.2s",
                }}
              >
                Mở Trang Game chính
              </button>
              <button
                onClick={() => openGame({ debugAnim: true })}
                disabled={!roomId.trim()}
                style={{
                  flex: 1,
                  padding: "10px",
                  borderRadius: "8px",
                  border: "1px solid rgba(239, 68, 68, 0.3)",
                  background: "rgba(239, 68, 68, 0.1)",
                  color: "#fca5a5",
                  fontWeight: 600,
                  fontSize: "0.875rem",
                  cursor: roomId.trim() ? "pointer" : "not-allowed",
                  transition: "all 0.2s",
                }}
              >
                Mở Trang Game (Debug Anim)
              </button>
            </div>
            <button
              onClick={shootWinnerConfettiFromSides}
              style={{
                width: "100%",
                marginTop: "12px",
                padding: "10px",
                borderRadius: "8px",
                border: "1px solid rgba(250, 204, 21, 0.35)",
                background: "rgba(250, 204, 21, 0.12)",
                color: "#fde68a",
                fontWeight: 700,
                fontSize: "0.875rem",
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              Test hiệu ứng thắng
            </button>
          </div>
        </div>

        {/* PANEL RIGHT: Scenario Replay Center */}
        <div style={{
          background: "rgba(30, 27, 75, 0.25)",
          backdropFilter: "blur(12px)",
          border: "1px solid rgba(139, 92, 246, 0.15)",
          borderRadius: "16px",
          padding: "24px",
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
        }}>
          <h2 style={{ fontSize: "1.5rem", fontWeight: 700, margin: "0 0 20px 0", display: "flex", alignItems: "center", gap: "10px", color: "#a78bfa" }}>
            <span>🎬</span> Trình Phát Lại Kịch Bản (Scenario Replayer)
          </h2>

          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {/* Match file loader */}
            <div>
              <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, color: "#cbd5e1", marginBottom: "6px" }}>
                Chọn Lịch Sử Trận Đấu đã lưu:
              </label>
              <div style={{ display: "flex", gap: "10px" }}>
                <select
                  value={selectedMatch}
                  onChange={(e) => setSelectedMatch(e.target.value)}
                  style={{
                    flex: 1,
                    padding: "10px 14px",
                    borderRadius: "8px",
                    border: "1px solid rgba(139, 92, 246, 0.3)",
                    background: "rgba(15, 12, 30, 0.8)",
                    color: "#f1f5f9",
                    fontSize: "0.95rem",
                    outline: "none",
                  }}
                >
                  {savedMatches.length === 0 ? (
                    <option value="">(Không có trận đấu nào được lưu)</option>
                  ) : (
                    savedMatches.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))
                  )}
                </select>
                <button
                  onClick={handleStartReplay}
                  disabled={!selectedMatch}
                  style={{
                    padding: "10px 20px",
                    borderRadius: "8px",
                    border: "none",
                    background: "linear-gradient(135deg, #a78bfa, #7c3aed)",
                    color: "#ffffff",
                    fontWeight: 700,
                    cursor: selectedMatch ? "pointer" : "not-allowed",
                    boxShadow: selectedMatch ? "0 4px 10px rgba(139, 92, 246, 0.3)" : "none",
                  }}
                >
                  Khởi Tạo Replay
                </button>
              </div>
              {replayError && (
                <div style={{ color: "#ef4444", fontSize: "0.875rem", marginTop: "6px" }}>
                  ⚠️ {replayError}
                </div>
              )}
            </div>

            {/* Active Replay Controls */}
            {activeReplayRoomId && (
              <div style={{
                background: "rgba(15, 12, 30, 0.5)",
                borderRadius: "12px",
                border: "1px solid rgba(139, 92, 246, 0.15)",
                padding: "20px"
              }}>
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "16px"
                }}>
                  <div>
                    <span style={{ fontSize: "0.875rem", color: "#94a3b8" }}>Phòng Replay hoạt động:</span>
                    <strong style={{ display: "block", color: "#f1f5f9", fontSize: "1.1rem" }}>{activeReplayRoomId}</strong>
                  </div>
                  <button
                    onClick={() => openGame({ replayRoomId: activeReplayRoomId })}
                    style={{
                      padding: "8px 16px",
                      borderRadius: "6px",
                      border: "1px solid rgba(167, 139, 250, 0.4)",
                      background: "rgba(167, 139, 250, 0.1)",
                      color: "#c084fc",
                      fontWeight: 600,
                      fontSize: "0.825rem",
                      cursor: "pointer",
                    }}
                  >
                    🚪 Xem Canvas Replay
                  </button>
                </div>

                {/* Progress Bar */}
                <div style={{ marginBottom: "20px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.825rem", color: "#94a3b8", marginBottom: "6px" }}>
                    <span>Tiến Trình Replay</span>
                    <span>Bước {replayIndex} / {totalSteps}</span>
                  </div>
                  <div style={{ width: "100%", height: "8px", background: "rgba(255,255,255,0.08)", borderRadius: "9999px", overflow: "hidden" }}>
                    <div style={{
                      width: `${totalSteps > 0 ? (replayIndex / totalSteps) * 100 : 0}%`,
                      height: "100%",
                      background: "linear-gradient(90deg, #a78bfa, #3b82f6)",
                      borderRadius: "9999px",
                      transition: "width 0.3s ease-out"
                    }} />
                  </div>
                </div>

                {/* Control Buttons */}
                <button
                  onClick={handleNextStep}
                  disabled={replayFinished || totalSteps === 0}
                  style={{
                    width: "100%",
                    padding: "12px",
                    borderRadius: "8px",
                    border: "none",
                    background: replayFinished ? "rgba(16, 185, 129, 0.2)" : "linear-gradient(135deg, #3b82f6, #1d4ed8)",
                    color: replayFinished ? "#34d399" : "#ffffff",
                    fontWeight: 700,
                    fontSize: "0.95rem",
                    cursor: (replayFinished || totalSteps === 0) ? "default" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "8px"
                  }}
                >
                  {replayFinished ? (
                    <><span>🎉</span> Đã hoàn tất kịch bản phát lại</>
                  ) : (
                    <>Bước Tiếp Theo ➡️</>
                  )}
                </button>
              </div>
            )}

            {/* Event Terminal / Live Logs */}
            {activeReplayRoomId && (
              <div>
                <label style={{ display: "block", fontSize: "0.875rem", fontWeight: 600, color: "#a78bfa", marginBottom: "8px" }}>
                  Bảng Theo Dõi Sự Kiện (Live Event Terminal):
                </label>
                <div style={{
                  background: "#03000a",
                  border: "1px solid rgba(139, 92, 246, 0.25)",
                  borderRadius: "8px",
                  padding: "16px",
                  height: "220px",
                  overflowY: "auto",
                  fontFamily: "'Courier New', Courier, monospace",
                  fontSize: "0.85rem",
                  color: "#34d399",
                  boxShadow: "inset 0 2px 10px rgba(0,0,0,0.8)"
                }}>
                  {allLogEntries.length === 0 ? (
                    <div style={{ color: "#64748b", fontStyle: "italic" }}>
                      [Terminal] Đang chờ bước kế tiếp... Bấm &quot;Bước Tiếp Theo&quot; để phát kịch bản.
                    </div>
                  ) : (
                    allLogEntries.filter((log: any) => log.message).map((log: any, idx: number) => {
                      const isNight = log.phase === "night";
                      return (
                        <div key={idx} style={{
                          marginBottom: "8px",
                          borderBottom: "1px solid rgba(255,255,255,0.03)",
                          paddingBottom: "4px"
                        }}>
                          <span style={{ color: isNight ? "#a78bfa" : "#fbbf24", marginRight: "8px", fontWeight: "bold" }}>
                            [{isNight ? "ĐÊM" : "NGÀY"}]
                          </span>
                          <span style={{ color: "#e2e8f0" }}>{log.message}</span>
                        </div>
                      );
                    })
                  )}
                  <div ref={terminalEndRef} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
