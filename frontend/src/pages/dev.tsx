import { useState, useEffect, useRef } from "react";
import { socket } from "../socket";
import { shootWinnerConfettiFromSides } from "../utils/winnerConfetti";
import { AvifIcon, iconMap } from "../components/AvifIcon";
import { scannedIcons } from "../constants/scannedIcons";
import Orb from "../components/Orb";
import nenLungAsset from "../assets/nền lưng.avif";
import { VillagerVictoryAnimation } from "../components/VillagerVictoryAnimation";
import { GameFinishedModal } from "../components/GameFinishedModal";


const AVA_IMAGES = import.meta.glob("../assets/Ava/*.avif", { eager: true, import: "default" }) as Record<string, string>;
const sampleAvatarUrl = Object.values(AVA_IMAGES)[0] || "";

interface MockPlayerCircleProps {
  name: string;
  size: number;
  scaleFactor: number;
  isDead?: boolean;
  avatarType?: "masked" | "solid" | "none";
  isSeerResult?: boolean;
  seerResultIsWolf?: boolean;
  isVerdictLiveHighlighted?: boolean;
  isVerdictDieHighlighted?: boolean;
  isWitchDanger?: boolean;
  isCursedHighlighted?: boolean;
  cursedHighlightIsDanger?: boolean;
  nightActionProgress?: "none" | "pending" | "done";
  isDietQuyOrange?: boolean;
  isDietQuyRed?: boolean;
  isSecondaryHighlighted?: boolean;
  isTrialWhite?: boolean;
  isHighlighted?: boolean;
  isActiveNightRoleBadge?: boolean;
  isTrialOrange?: boolean;
  isTrialGreen?: boolean;
  showWolfBadge?: boolean;
  showWolfVoteBadge?: boolean;
  voteCount?: number;
  wolfCount?: number;
  shaking?: boolean;
  isProtectedByGuardian?: boolean;
}

function MockPlayerCircle({
  name,
  size,
  scaleFactor,
  isDead = false,
  avatarType = "masked",
  isSeerResult = false,
  seerResultIsWolf = false,
  isVerdictLiveHighlighted = false,
  isVerdictDieHighlighted = false,
  isWitchDanger = false,
  isCursedHighlighted = false,
  cursedHighlightIsDanger = false,
  nightActionProgress = "none",
  isDietQuyOrange = false,
  isDietQuyRed = false,
  isSecondaryHighlighted = false,
  isTrialWhite = false,
  isHighlighted = false,
  isActiveNightRoleBadge = false,
  isTrialOrange = false,
  isTrialGreen = false,
  showWolfBadge = false,
  showWolfVoteBadge = false,
  voteCount = 1,
  wolfCount = 2,
  shaking = false,
  isProtectedByGuardian = false,
}: MockPlayerCircleProps) {
  const scalePx = (value: number, min = 1) => Math.max(min, Math.round(value * scaleFactor));
  const circleSizePx = scalePx(size, 34);
  const circleRadiusPx = circleSizePx / 2;
  const badgeOffsetPx = scalePx(10, 6);
  const badgePadding = `${scalePx(2, 1)}px ${scalePx(6, 3)}px`;
  const badgeFontSizePx = scalePx(11, 8);
  const dashCamXoay = { inset: -scalePx(6, 4), border: `${scalePx(2, 1)}px dashed #f59e0b` };

  const maskedAvatarUrl = avatarType === "masked" ? sampleAvatarUrl : undefined;

  return (
    <div
      className={`player-circle-token ${isDead ? "is-dead" : ""} ${shaking ? "witch-danger" : ""}`}
      style={{
        position: "relative",
        width: circleSizePx,
        height: circleSizePx,
        borderRadius: circleRadiusPx,
        backgroundImage: maskedAvatarUrl
          ? `url("${nenLungAsset}")`
          : undefined,
        backgroundColor: avatarType === "solid" ? "#3b82f6" : (avatarType === "none" ? "rgba(255,255,255,0.05)" : undefined),
        backgroundPosition: maskedAvatarUrl ? "center" : undefined,
        backgroundSize: maskedAvatarUrl ? "cover" : undefined,
        backgroundRepeat: maskedAvatarUrl ? "no-repeat" : undefined,
        border: `${scalePx(2, 1)}px solid rgba(255,255,255,0.2)`,
        boxSizing: "border-box"
      }}
    >
      {maskedAvatarUrl && (
        <>
          {/* 1. Phần thân nhân vật được bo tròn theo vòng tròn */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "inherit",
              overflow: "hidden",
              pointerEvents: "none",
              zIndex: 0,
            }}
          >
            <img
              src={maskedAvatarUrl}
              alt=""
              style={{
                position: "absolute",
                bottom: 0,
                left: "50%",
                transform: "translateX(-50%)",
                width: "115%",
                height: "115%",
                objectFit: "contain",
                objectPosition: "bottom center",
              }}
            />
            {/* Overlay tối nhẹ lên thân nhân vật */}
            <div style={{
              position: "absolute",
              inset: 0,
              borderRadius: "inherit",
              zIndex: 1
            }} />
          </div>

          {/* 2. Phần đầu nhân vật nhô lên ngoài vòng tròn */}
          <img
            src={maskedAvatarUrl}
            alt=""
            style={{
              position: "absolute",
              bottom: 0,
              left: "50%",
              transform: "translateX(-50%)",
              width: "115%",
              height: "115%",
              objectFit: "contain",
              objectPosition: "bottom center",
              clipPath: "inset(0 0 40% 0)",
              pointerEvents: "none",
              zIndex: 0,
            }}
          />
        </>
      )}

      {/* Concentric Halo Rings */}
      {isSeerResult && (
        <div className={`player-halo halo-seer ${seerResultIsWolf ? "halo-seer-wolf" : ""}`} style={{ inset: -scalePx(6, 4), border: `${scalePx(4, 1)}px solid ${seerResultIsWolf ? "#ef4444" : "#f1f5f9"}` }} />
      )}
      {isVerdictLiveHighlighted && (
        <div className="player-halo halo-live" style={{ inset: -scalePx(6, 4), border: `${scalePx(2, 1)}px solid #10b981` }} />
      )}
      {isVerdictDieHighlighted && (
        <div className="player-halo halo-die" style={{ inset: -scalePx(6, 4), border: `${scalePx(2, 1)}px solid #ef4444` }} />
      )}
      {isWitchDanger && (
        <div className="player-halo halo-danger" style={{ inset: -scalePx(6, 4), border: `${scalePx(2.5, 1.5)}px solid #dc2626` }} />
      )}
      {isCursedHighlighted && (
        <div className={`player-halo halo-cursed ${cursedHighlightIsDanger ? "halo-cursed-wolf" : ""}`} style={{ inset: -scalePx(6, 4), border: `${scalePx(4, 1)}px solid ${cursedHighlightIsDanger ? "#dc2626" : "#e2e8f0"}` }} />
      )}
      {nightActionProgress === "pending" && (
        <div className="player-halo halo-dash-cam-xoay" style={dashCamXoay} />
      )}
      {nightActionProgress === "done" && (
        <div className="player-halo halo-night-done" style={{ inset: -scalePx(6, 4), border: `${scalePx(2, 1)}px solid #10b981` }} />
      )}
      {isDietQuyOrange && (
        <div className="player-halo halo-dietquy-orange" style={{ inset: -scalePx(6, 4), border: `${scalePx(2, 1)}px solid #ff9800` }} />
      )}
      {isDietQuyRed && (
        <div className="player-halo halo-dietquy-red" style={{ inset: -scalePx(6, 4), border: `${scalePx(2, 1)}px solid #ef4444` }} />
      )}

      {/* Concentric Rings */}
      {isSecondaryHighlighted && (
        <div className="player-halo" style={{ inset: -scalePx(10, 6), border: `${scalePx(4, 1)}px solid #ffffff`, boxShadow: "0 0 10px rgba(255, 255, 255, 0.8)" }} />
      )}
      {(isTrialGreen || isTrialWhite) && (
        <div
          className={`player-halo ${isTrialGreen ? "halo-trial-green" : "halo-trial-white"}`}
          style={{
            inset: isTrialGreen ? -scalePx(12, 8) : -scalePx(10, 6),
            border: isTrialGreen ? `${scalePx(2.5, 2)}px solid #34d399` : `${scalePx(2, 1)}px solid #f1f5f9`,
            transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        />
      )}

      {/* Outer Concentric Rings */}
      {isHighlighted && (
        <div className="player-halo halo-spotlight" style={{ inset: -scalePx(10, 6), border: `${scalePx(4, 1)}px solid #ffffff`, boxShadow: "0 0 10px rgba(255, 255, 255, 0.8)" }} />
      )}
      {isActiveNightRoleBadge && (
        <div className="player-halo halo-active-role" style={{ inset: -scalePx(10, 6), border: `${scalePx(2.5, 1.5)}px solid #ffd700` }} />
      )}
      {isTrialOrange && (
        <div className="player-halo halo-dash-cam-xoay" style={dashCamXoay} />
      )}
      {isProtectedByGuardian && (
        <Orb hue={0} />
      )}

      {/* Badges and Indicators */}
      {showWolfVoteBadge && (
        <div style={{
          position: "absolute",
          top: -badgeOffsetPx,
          right: -badgeOffsetPx,
          background: "linear-gradient(135deg, #ef5350, #c62828)",
          color: "#fff",
          borderRadius: badgeOffsetPx,
          padding: badgePadding,
          fontSize: badgeFontSizePx,
          fontWeight: "bold",
          zIndex: 2,
          boxShadow: "0 2px 6px rgba(198, 40, 40, 0.4), inset 0 1px 1px rgba(255, 255, 255, 0.2)",
          border: "1px solid rgba(255, 255, 255, 0.15)",
        }}>
          {voteCount}/{wolfCount}
        </div>
      )}

      {showWolfBadge && (
        <div style={{
          position: "absolute",
          bottom: -badgeOffsetPx,
          left: "50%",
          transform: "translateX(-50%)",
          background: "linear-gradient(135deg, #422213, #2d1307)",
          color: "#ff6b6b",
          padding: badgePadding,
          borderRadius: scalePx(6, 3),
          fontSize: badgeFontSizePx,
          fontWeight: "bold",
          border: "1px solid rgba(239, 68, 68, 0.35)",
          boxShadow: "0 2px 6px rgba(0,0,0,0.45), inset 0 1px 1px rgba(255, 255, 255, 0.15)",
          display: "flex",
          alignItems: "center",
          gap: scalePx(3, 2),
          width: "max-content",
          zIndex: 2,
          animation: "badgeFadeIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
        }}>
          <AvifIcon name="🐺" style={{ width: "1.15em", height: "1.15em" }} /> Sói
        </div>
      )}

      {(() => {
        const hasAvatar = avatarType !== "none";
        const hasRoleBadge = showWolfBadge;
        const isNameAtBottom = hasAvatar && !hasRoleBadge;
        return (
          <div style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            transform: isNameAtBottom ? `translate(-50%, ${circleSizePx / 2.2}px)` : "translate(-50%, -50%)",
            textAlign: "center",
            pointerEvents: "none",
            zIndex: 1,
            width: "max-content",
          }}>
            <div style={{
              fontWeight: 600,
              opacity: isDead ? 0.45 : 1,
              color: isDead ? "#94a3b8" : "#f8fafc",
              fontFamily: "'Inter', system-ui, sans-serif",
              fontSize: scalePx(12, 9),
              letterSpacing: "-0.01em",
              textShadow: hasAvatar ? "0 2px 4px rgba(0,0,0,0.95), 0 0 6px rgba(0,0,0,0.95)" : "0 1px 2px rgba(0,0,0,0.6)",
            }}>{name}</div>
          </div>
        );
      })()}
    </div>
  );
}

export default function DevSpawn() {
  // Spawner States
  const [roomId, setRoomId] = useState("");
  const [count, setCount] = useState(5);
  const [prefix, setPrefix] = useState("P");
  const [debugAnim, setDebugAnim] = useState(true);


  const [villagerVictoryAnimOpen, setVillagerVictoryAnimOpen] = useState(false);
  const [gameFinishedModalOpen, setGameFinishedModalOpen] = useState(false);
  const [testWinner, setTestWinner] = useState<string | null>(null);
  const [testScoreResult, setTestScoreResult] = useState<any>(null);


  // --- PLAYER HALO SHOWCASE STATES ---
  const [haloCircleSize, setHaloCircleSize] = useState(80);
  const [haloScaleFactor, setHaloScaleFactor] = useState(1.0);
  const [haloAvatarType, setHaloAvatarType] = useState<"masked" | "solid" | "none">("masked");
  const [haloIsDead, setHaloIsDead] = useState(false);
  const [haloShaking, setHaloShaking] = useState(false);
  const [haloName, setHaloName] = useState("Dân Làng");

  const [playgroundHalos, setPlaygroundHalos] = useState({
    isSeerResult: false,
    seerResultIsWolf: false,
    isVerdictLiveHighlighted: false,
    isVerdictDieHighlighted: false,
    isWitchDanger: false,
    isCursedHighlighted: false,
    cursedHighlightIsDanger: false,
    nightActionProgress: "none" as "none" | "pending" | "done",
    isDietQuyOrange: false,
    isDietQuyRed: false,
    isSecondaryHighlighted: false,
    isTrialWhite: false,
    isHighlighted: false,
    isActiveNightRoleBadge: false,
    isTrialOrange: false,
    isTrialGreen: false,
    showWolfBadge: false,
    showWolfVoteBadge: false,
    voteCount: 1,
    wolfCount: 2,
    isProtectedByGuardian: false,
  });

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

  // --- ICON EXPLORER UTILITY ---
  const allIconFiles = import.meta.glob("../assets/icon/*.avif", { eager: true, import: "default" }) as Record<string, string>;
  const [activeIconTab, setActiveIconTab] = useState<"code" | "files">("code");

  // Gom nhóm các emoji được quét từ code
  const emojiGroupMap = new Map<string, {
    emoji: string;
    usages: Array<{ file: string; line: number; usage: "AvifIcon" | "Direct"; codeSnippet: string }>;
  }>();

  scannedIcons.forEach(item => {
    if (!emojiGroupMap.has(item.emoji)) {
      emojiGroupMap.set(item.emoji, { emoji: item.emoji, usages: [] });
    }
    emojiGroupMap.get(item.emoji)!.usages.push(item);
  });

  const groupedScannedIcons = Array.from(emojiGroupMap.values()).sort((a, b) => b.usages.length - a.usages.length);

  // Danh sách các file avif thực tế trong thư mục assets/icon
  const avifFiles = Object.keys(allIconFiles).map(key => key.split("/").pop() || "").sort();

  // Danh sách các file avif đã được map trong AvifIcon.tsx
  const mappedFiles = new Set(
    Object.values(iconMap).map(src => {
      // Lấy phần tên tệp tin cuối cùng, ví dụ "ok.avif"
      const parts = src.split(/[/\\]/);
      const filename = parts[parts.length - 1];
      // Nếu có query param từ vite (?import) thì bỏ đi
      return filename.split("?")[0];
    })
  );

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

  const openMockGame = (opts: {
    debugAnim?: boolean;
    debugCupid?: boolean;
    debugHeartExplosion?: boolean;
    debugWitch?: boolean;
    debugNightTransition?: boolean;
  }) => {
    const params = new URLSearchParams();
    params.set("roomId", "mock-8");
    if (opts.debugAnim) params.set("debugAnim", "1");
    if (opts.debugCupid) params.set("debugCupid", "1");
    if (opts.debugHeartExplosion) params.set("debugHeartExplosion", "1");
    if (opts.debugWitch) params.set("debugWitch", "1");
    if (opts.debugNightTransition) params.set("debugNightTransition", "1");
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
            <div style={{ display: "flex", gap: "12px", marginTop: "12px" }}>
              <button
                onClick={() => openMockGame({ debugAnim: true, debugCupid: true, debugHeartExplosion: true, debugWitch: true })}
                style={{
                  flex: 1,
                  padding: "10px",
                  borderRadius: "8px",
                  border: "1px solid rgba(139, 92, 246, 0.4)",
                  background: "rgba(139, 92, 246, 0.15)",
                  color: "#d8b4fe",
                  fontWeight: 600,
                  fontSize: "0.875rem",
                  cursor: "pointer",
                  transition: "all 0.2s",
                  textAlign: "center"
                }}
              >
                Mở Phòng Thử Nghiệm Tổng Hợp (Mock-8) 🧪
              </button>
            </div>
            <div style={{ display: "flex", gap: "12px", marginTop: "12px" }}>
              <button
                onClick={() => openMockGame({ debugNightTransition: true })}
                style={{
                  flex: 1,
                  padding: "10px",
                  borderRadius: "8px",
                  border: "1px solid rgba(255, 255, 255, 0.38)",
                  background: "rgba(255, 255, 255, 0.12)",
                  color: "#ffffff",
                  fontWeight: 600,
                  fontSize: "0.875rem",
                  cursor: "pointer",
                  transition: "all 0.2s",
                  textAlign: "center"
                }}
              >
                Test chuyển cảnh Hoàng hôn → Đêm (Mock-8)
              </button>
            </div>
            <div style={{ display: "flex", gap: "12px", marginTop: "12px" }}>
              <button
                onClick={() => window.open("/game?roomId=mock-dusk", "_blank")}
                style={{
                  flex: 1,
                  padding: "10px",
                  borderRadius: "8px",
                  border: "1px solid rgba(251, 146, 60, 0.4)",
                  background: "rgba(251, 146, 60, 0.15)",
                  color: "#ffedd5",
                  fontWeight: 600,
                  fontSize: "0.875rem",
                  cursor: "pointer",
                  transition: "all 0.2s",
                  textAlign: "center"
                }}
              >
                Test Dusk Masonry & RoleCard3D (Mock-Dusk) 🌥️
              </button>
            </div>

            <button
              onClick={() => {
                setTestWinner("villagers");
                setTestScoreResult({
                  gameId: "mock-game-1",
                  mvp: { playerId: "p1", name: "Người Chơi MVP", score: 100 },
                  ranking: [
                    { playerId: "p1", name: "Người Chơi MVP", role: "Thiên Sứ", team: "villagers", aliveAtEnd: true, totalScore: 100 },
                    { playerId: "p2", name: "Sói Bị Đẩy Văng", role: "Sói", team: "wolves", aliveAtEnd: false, totalScore: 20 }
                  ]
                });
                setVillagerVictoryAnimOpen(true);
              }}
              style={{
                width: "100%",
                marginTop: "12px",
                padding: "10px",
                borderRadius: "8px",
                border: "1px solid rgba(52, 152, 219, 0.35)",
                background: "rgba(52, 152, 219, 0.12)",
                color: "#99ccff",
                fontWeight: 700,
                fontSize: "0.875rem",
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              Test Phe Dân thắng
            </button>
            <button
              onClick={() => {
                setTestWinner("wolves");
                setTestScoreResult({
                  gameId: "mock-game-2",
                  mvp: { playerId: "p2", name: "Sói Con", score: 120 },
                  ranking: [
                    { playerId: "p1", name: "Dân Thường", role: "Dân làng", team: "villagers", aliveAtEnd: false, totalScore: 30 },
                    { playerId: "p2", name: "Sói Con", role: "Sói", team: "wolves", aliveAtEnd: true, totalScore: 120 }
                  ]
                });
                shootWinnerConfettiFromSides("wolves");
                setGameFinishedModalOpen(true);
              }}
              style={{
                width: "100%",
                marginTop: "8px",
                padding: "10px",
                borderRadius: "8px",
                border: "1px solid rgba(231, 76, 60, 0.35)",
                background: "rgba(231, 76, 60, 0.12)",
                color: "#ff9999",
                fontWeight: 700,
                fontSize: "0.875rem",
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              Test Phe Sói thắng
            </button>
            <button
              onClick={() => {
                setTestWinner("lovers");
                setTestScoreResult({
                  gameId: "mock-game-3",
                  mvp: [
                    { playerId: "p1", name: "Cupid", score: 95 },
                    { playerId: "p2", name: "Sói", score: 95 }
                  ],
                  ranking: [
                    { playerId: "p1", name: "Cupid", role: "Thần tình yêu", team: "couple", aliveAtEnd: true, totalScore: 95 },
                    { playerId: "p2", name: "Sói", role: "Sói", team: "couple", aliveAtEnd: true, totalScore: 95 }
                  ]
                });
                shootWinnerConfettiFromSides("lovers", {
                  pairIds: ["p1", "p2"],
                  rolesByPlayerId: {
                    p1: "Thần tình yêu",
                    p2: "Sói thường"
                  }
                });
                setGameFinishedModalOpen(true);
              }}
              style={{
                width: "100%",
                marginTop: "8px",
                padding: "10px",
                borderRadius: "8px",
                border: "1px solid rgba(253, 121, 168, 0.35)",
                background: "rgba(253, 121, 168, 0.12)",
                color: "#ffb3d9",
                fontWeight: 700,
                fontSize: "0.875rem",
                cursor: "pointer",
                transition: "all 0.2s",
              }}

            >
              Test Cặp đôi Sói + Cupid thắng
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

      {/* PANEL BOTTOM: Icon & Emoji Explorer */}
      <div style={{
        marginTop: "32px",
        background: "rgba(30, 27, 75, 0.25)",
        backdropFilter: "blur(12px)",
        border: "1px solid rgba(99, 102, 241, 0.15)",
        borderRadius: "16px",
        padding: "24px",
        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
      }}>
        <h2 style={{ fontSize: "1.5rem", fontWeight: 700, margin: "0 0 20px 0", display: "flex", alignItems: "center", gap: "10px", color: "#6366f1" }}>
          <span>🔍</span> Trình Khám Phá & Quản Lý Biểu Tượng (Icon Explorer)
        </h2>

        {/* Tab Headers */}
        <div style={{ display: "flex", gap: "12px", borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: "12px", marginBottom: "20px" }}>
          <button
            onClick={() => setActiveIconTab("code")}
            style={{
              padding: "8px 16px",
              borderRadius: "8px",
              border: "none",
              background: activeIconTab === "code" ? "rgba(99, 102, 241, 0.2)" : "transparent",
              color: activeIconTab === "code" ? "#a5b4fc" : "#94a3b8",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.2s"
            }}
          >
            Biểu tượng dùng trong Code ({groupedScannedIcons.length})
          </button>
          <button
            onClick={() => setActiveIconTab("files")}
            style={{
              padding: "8px 16px",
              borderRadius: "8px",
              border: "none",
              background: activeIconTab === "files" ? "rgba(99, 102, 241, 0.2)" : "transparent",
              color: activeIconTab === "files" ? "#a5b4fc" : "#94a3b8",
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.2s"
            }}
          >
            Tệp tin ảnh trong thư mục icon/ ({avifFiles.length})
          </button>
        </div>

        {/* Tab Content: CODE SCAN */}
        {activeIconTab === "code" && (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid rgba(255,255,255,0.08)", color: "#94a3b8", fontSize: "0.9rem" }}>
                  <th style={{ padding: "12px" }}>Emoji</th>
                  <th style={{ padding: "12px" }}>Avif Preview</th>
                  <th style={{ padding: "12px" }}>Trạng Thái Mapping</th>
                  <th style={{ padding: "12px" }}>Chi Tiết Vị Trí Sử Dụng</th>
                </tr>
              </thead>
              <tbody>
                {groupedScannedIcons.map(({ emoji, usages }) => {
                  const isMapped = emoji in iconMap;
                  const hasDirectUsage = usages.some(u => u.usage === "Direct");

                  return (
                    <tr key={emoji} style={{
                      borderBottom: "1px solid rgba(255,255,255,0.05)",
                      background: hasDirectUsage ? "rgba(234, 179, 8, 0.02)" : "transparent",
                      transition: "background 0.2s"
                    }}>
                      {/* Emoji */}
                      <td style={{ padding: "16px 12px", fontSize: "1.75rem", verticalAlign: "top" }}>{emoji}</td>

                      {/* Avif Preview */}
                      <td style={{ padding: "16px 12px", verticalAlign: "top" }}>
                        {isMapped ? (
                          <div style={{ display: "inline-flex", alignItems: "center", gap: "8px", background: "rgba(255,255,255,0.03)", padding: "6px 12px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.05)" }}>
                            <AvifIcon name={emoji} style={{ width: 28, height: 28 }} />
                            <span style={{ fontSize: "0.8rem", color: "#64748b" }}>(avif)</span>
                          </div>
                        ) : (
                          <span style={{ color: "#ef4444", fontSize: "0.85rem" }}>-</span>
                        )}
                      </td>

                      {/* Mapping Status */}
                      <td style={{ padding: "16px 12px", verticalAlign: "top" }}>
                        {isMapped ? (
                          <div style={{ color: "#10b981", fontSize: "0.875rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}>
                            <span>🟢</span> Đã map thành công
                          </div>
                        ) : (
                          <div style={{ color: "#ef4444", fontSize: "0.875rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}>
                            <span>🔴</span> CHƯA MAP (Chỉ hiện emoji gốc)
                          </div>
                        )}
                        {hasDirectUsage && (
                          <div style={{
                            marginTop: "8px",
                            display: "inline-block",
                            background: "rgba(234, 179, 8, 0.15)",
                            color: "#f59e0b",
                            border: "1px solid rgba(234, 179, 8, 0.3)",
                            borderRadius: "6px",
                            padding: "4px 8px",
                            fontSize: "0.75rem",
                            fontWeight: "bold"
                          }}>
                            ⚠️ Có {usages.filter(u => u.usage === "Direct").length} chỗ gõ cứng
                          </div>
                        )}
                      </td>

                      {/* Usages Detail */}
                      <td style={{ padding: "16px 12px", verticalAlign: "top" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                          {usages.map((u, idx) => (
                            <div key={idx} style={{
                              background: "rgba(255, 255, 255, 0.02)",
                              border: u.usage === "Direct" ? "1px dashed rgba(234, 179, 8, 0.25)" : "1px solid rgba(255, 255, 255, 0.03)",
                              borderRadius: "8px",
                              padding: "8px 12px"
                            }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                                <span style={{ fontFamily: "monospace", color: "#6366f1", fontSize: "0.8rem", fontWeight: "bold" }}>
                                  {u.file}:{u.line}
                                </span>
                                {u.usage === "Direct" ? (
                                  <span style={{ color: "#f59e0b", background: "rgba(234, 179, 8, 0.1)", padding: "2px 6px", borderRadius: "4px", fontSize: "0.675rem", fontWeight: "bold" }}>
                                    ⚠️ GÕ CỨNG TRỰC TIẾP
                                  </span>
                                ) : (
                                  <span style={{ color: "#10b981", background: "rgba(16, 185, 129, 0.1)", padding: "2px 6px", borderRadius: "4px", fontSize: "0.675rem", fontWeight: "bold" }}>
                                    DÙNG AVIFICON
                                  </span>
                                )}
                              </div>
                              <div style={{
                                fontFamily: "monospace",
                                fontSize: "0.775rem",
                                color: "#94a3b8",
                                background: "#03000a",
                                padding: "4px 8px",
                                borderRadius: "4px",
                                overflowX: "auto",
                                borderLeft: u.usage === "Direct" ? "3px solid #f59e0b" : "3px solid #10b981"
                              }}>
                                {u.codeSnippet}
                              </div>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab Content: FILE SCAN */}
        {activeIconTab === "files" && (
          <div>
            <div style={{
              background: "rgba(99, 102, 241, 0.05)",
              border: "1px dashed rgba(99, 102, 241, 0.2)",
              borderRadius: "8px",
              padding: "12px 16px",
              marginBottom: "20px",
              fontSize: "0.875rem",
              color: "#94a3b8"
            }}>
              💡 Đây là toàn bộ các tệp tin hình ảnh `.avif` trong thư mục <code>src/assets/icon/</code>. Những tệp tin có nhãn màu đỏ nghĩa là bạn đã copy vào thư mục nhưng chưa định nghĩa nó trong <code>AvifIcon.tsx</code>.
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "16px" }}>
              {avifFiles.map(filename => {
                const isMapped = mappedFiles.has(filename);
                const fileSrc = allIconFiles[`../assets/icon/${filename}`];

                // Tìm emoji tương ứng đã được map với file này
                const associatedEmoji = Object.keys(iconMap).find(key => {
                  const src = iconMap[key];
                  const parts = src.split(/[/\\]/);
                  const fName = parts[parts.length - 1].split("?")[0];
                  return fName === filename;
                });

                return (
                  <div key={filename} style={{
                    background: "rgba(15, 12, 30, 0.4)",
                    border: isMapped ? "1px solid rgba(255,255,255,0.05)" : "1px solid rgba(239, 68, 68, 0.3)",
                    borderRadius: "12px",
                    padding: "16px",
                    display: "flex",
                    alignItems: "center",
                    gap: "16px",
                    boxShadow: isMapped ? "none" : "0 0 10px rgba(239, 68, 68, 0.1)"
                  }}>
                    {/* Image Preview */}
                    <div style={{
                      width: 48,
                      height: 48,
                      borderRadius: "8px",
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      overflow: "hidden"
                    }}>
                      <img src={fileSrc} alt={filename} style={{ width: 32, height: 32, objectFit: "contain" }} />
                    </div>

                    {/* File Details */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: "0.9rem",
                        fontWeight: "bold",
                        color: "#f1f5f9",
                        textOverflow: "ellipsis",
                        overflow: "hidden",
                        whiteSpace: "nowrap"
                      }} title={filename}>
                        {filename}
                      </div>
                      <div style={{ marginTop: "6px" }}>
                        {isMapped ? (
                          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.775rem", color: "#10b981", fontWeight: 600 }}>
                            <span>🟢</span> Được dùng cho: <span style={{ fontSize: "1.2rem" }}>{associatedEmoji}</span>
                          </div>
                        ) : (
                          <div style={{ color: "#ef4444", fontSize: "0.75rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "4px" }}>
                            <span>⚠️</span> CHƯA DÙNG (Chưa map)
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* PANEL BOTTOM: Player Circle Halo Showcase & Playground */}
      <div style={{
        marginTop: "32px",
        background: "rgba(30, 27, 75, 0.25)",
        backdropFilter: "blur(12px)",
        border: "1px solid rgba(99, 102, 241, 0.15)",
        borderRadius: "16px",
        padding: "24px",
        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.4)",
      }}>
        <style>{`
          @keyframes witchDangerShake {
            0% { transform: translate(-50%, -50%) translateX(0); }
            20% { transform: translate(-50%, -50%) translateX(-2px); }
            40% { transform: translate(-50%, -50%) translateX(2px); }
            60% { transform: translate(-50%, -50%) translateX(-2px); }
            80% { transform: translate(-50%, -50%) translateX(2px); }
            100% { transform: translate(-50%, -50%) translateX(0); }
          }
          @keyframes boardPop {
            0% { transform: scale(0); opacity: 0; }
            70% { transform: scale(1.15); opacity: 0.9; }
            100% { transform: scale(1); opacity: 1; }
          }
          @keyframes dashMove {
            to { stroke-dashoffset: -40; }
          }
          .witch-danger {
            animation: witchDangerShake 500ms infinite !important;
            position: absolute !important;
            left: 50% !important;
            top: 50% !important;
          }
          @keyframes playerHeartShake {
            0% { transform: translateX(0); }
            20% { transform: translateX(-1px); }
            40% { transform: translateX(1px); }
            60% { transform: translateX(-1px); }
            80% { transform: translateX(1px); }
            100% { transform: translateX(0); }
          }

          /* PREMIUM REVAMP KEYFRAMES */
          @keyframes rotateGlow {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
          @keyframes rotateGlowCounter {
            from { transform: rotate(360deg); }
            to { transform: rotate(0deg); }
          }
          @keyframes badgeFadeIn {
            0% { opacity: 0; transform: translate(-50%, 12px) scale(0.8); }
            70% { opacity: 0.9; transform: translate(-50%, -2px) scale(1.05); }
            100% { opacity: 1; transform: translate(-50%, 0) scale(1); }
          }
          @keyframes breatheSoft {
            0%, 100% { opacity: 0.65; transform: scale(1); }
            50% { opacity: 1; transform: scale(1.03); }
          }
          @keyframes warningPulse {
            0%, 100% { box-shadow: 0 0 10px rgba(220, 38, 38, 0.4), inset 0 0 4px rgba(220, 38, 38, 0.2); border-color: rgba(220, 38, 38, 0.7); }
            50% { box-shadow: 0 0 20px rgba(220, 38, 38, 0.85), inset 0 0 8px rgba(220, 38, 38, 0.45); border-color: rgba(255, 107, 107, 1); }
          }
          @keyframes activeRolePulse {
            0%, 100% { box-shadow: 0 0 12px rgba(255, 215, 0, 0.4), inset 0 0 6px rgba(255, 215, 0, 0.2); }
            50% { box-shadow: 0 0 24px rgba(255, 215, 0, 0.75), inset 0 0 10px rgba(255, 215, 0, 0.4); }
          }
          @keyframes pulseCaution {
            0%, 100% { opacity: 0.9; box-shadow: 0 2px 6px rgba(0,0,0,0.3); }
            50% { opacity: 1; box-shadow: 0 2px 10px rgba(245, 158, 11, 0.35); }
          }

          /* CONCENTRIC HALOS */
          .player-halo {
            position: absolute;
            border-radius: 50%;
            pointer-events: none;
            z-index: -1;
            transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
          }
          .halo-live {
            box-shadow: 0 0 16px rgba(16, 185, 129, 0.75), inset 0 0 6px rgba(16, 185, 129, 0.35);
          }
          .halo-die {
            box-shadow: 0 0 16px rgba(239, 68, 68, 0.85), inset 0 0 6px rgba(239, 68, 68, 0.4);
            animation: breatheSoft 2.2s ease-in-out infinite;
          }
          .halo-danger {
            animation: warningPulse 1.2s ease-in-out infinite;
          }
          .halo-spotlight {
            animation: rotateGlow 12s linear infinite;
            box-shadow: 0 0 14px rgba(255, 152, 0, 0.45);
          }
          .halo-secondary {
            animation: rotateGlowCounter 16s linear infinite;
            box-shadow: 0 0 10px rgba(46, 204, 113, 0.25);
          }
          .halo-cursed {
            animation: breatheSoft 2.5s ease-in-out infinite;
            box-shadow: 0 0 16px rgba(255, 255, 255, 0.4);
          }
          .halo-cursed-wolf {
            animation: breatheSoft 2.5s ease-in-out infinite;
            box-shadow: 0 0 16px rgb(255 0 0 / 40%);
          }
          .halo-active-role {
            animation: activeRolePulse 2s ease-in-out infinite;
          }
          .halo-trial-orange {
            animation: rotateGlow 8s linear infinite;
            box-shadow: 0 0 22px rgba(245, 158, 11, 0.75), inset 0 0 10px rgba(245, 158, 11, 0.35);
          }
          .halo-trial-white {
            animation: breatheSoft 2.2s ease-in-out infinite;
            box-shadow: 0 0 14px rgba(241, 245, 249, 0.5);
          }
          .halo-trial-green {
            animation: breatheSoft 2s ease-in-out infinite;
            box-shadow: 0 0 20px rgba(52, 211, 153, 0.65);
          }
          .halo-dash-cam-xoay {
            animation: rotateGlow 14s linear infinite;
            box-shadow: 0 0 12px rgba(245, 158, 11, 0.35);
          }
          .halo-night-done {
            box-shadow: 0 0 12px rgba(16, 185, 129, 0.45);
          }
          .halo-seer {
            animation: breatheSoft 2s ease-in-out infinite;
            box-shadow: 0 0 16px rgba(255, 255, 255, 0.4);
          }
          .halo-seer-wolf {
            animation: breatheSoft 2s ease-in-out infinite;
            box-shadow: 0 0 16px rgb(255 0 0 / 40%);
          }
          .halo-dietquy-orange {
            box-shadow: 0 0 8px #ff9800;
          }
          .halo-dietquy-red {
            box-shadow: 0 0 8px #ef4444;
          }

          /* PREMIUM TOKEN COMPONENT */
          .player-circle-token {
            background: linear-gradient(135deg, rgba(31, 36, 48, 0.94), rgba(23, 26, 33, 0.97));
            box-shadow: 
              inset 0 1px 2px rgba(255, 255, 255, 0.08),
              inset 0 -2px 6px rgba(0, 0, 0, 0.45),
              0 8px 24px rgba(0, 0, 0, 0.35);
            transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
          }
          .player-circle-token:hover {
            transform: translateY(-2px) scale(1.03);
            background: linear-gradient(135deg, rgba(38, 44, 58, 0.96), rgba(28, 32, 41, 0.98));
            box-shadow: 
              inset 0 1px 3px rgba(255, 255, 255, 0.14),
              inset 0 -2px 8px rgba(0, 0, 0, 0.5),
              0 12px 32px rgba(0, 0, 0, 0.45);
          }
        `}</style>

        <h2 style={{ fontSize: "1.5rem", fontWeight: 700, margin: "0 0 20px 0", display: "flex", alignItems: "center", gap: "10px", color: "#f59e0b" }}>
          <span>✨</span> Trình Trưng Bày & Thử Nghiệm Hào Quang (Player Halo Showcase & Playground)
        </h2>

        {/* SECTION 1: PLAYGROUND */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "24px",
          marginBottom: "32px",
          background: "rgba(15, 12, 30, 0.4)",
          padding: "24px",
          borderRadius: "12px",
          border: "1px solid rgba(255,255,255,0.05)"
        }}>
          {/* Controls */}
          <div>
            <h3 style={{ fontSize: "1.1rem", fontWeight: 600, margin: "0 0 16px 0", color: "#cbd5e1", borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: "8px" }}>
              🛠️ Bảng Điều Khiển (Playground Controls)
            </h3>

            {/* Range sliders */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.8rem", color: "#94a3b8", marginBottom: "4px" }}>
                  Kích thước gốc: <strong>{haloCircleSize}px</strong>
                </label>
                <input
                  type="range"
                  min={50}
                  max={150}
                  value={haloCircleSize}
                  onChange={(e) => setHaloCircleSize(Number(e.target.value))}
                  style={{ width: "100%", accentColor: "#f59e0b" }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "0.8rem", color: "#94a3b8", marginBottom: "4px" }}>
                  Hệ số Tỷ lệ (Scale): <strong>{haloScaleFactor.toFixed(1)}</strong>
                </label>
                <input
                  type="range"
                  min={0.5}
                  max={2.0}
                  step={0.1}
                  value={haloScaleFactor}
                  onChange={(e) => setHaloScaleFactor(Number(e.target.value))}
                  style={{ width: "100%", accentColor: "#f59e0b" }}
                />
              </div>
            </div>

            {/* General state inputs */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.8rem", color: "#94a3b8", marginBottom: "4px" }}>Tên Người Chơi:</label>
                <input
                  value={haloName}
                  onChange={(e) => setHaloName(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "6px 10px",
                    borderRadius: "6px",
                    border: "1px solid rgba(255,255,255,0.1)",
                    background: "rgba(0,0,0,0.3)",
                    color: "#fff",
                    fontSize: "0.875rem",
                  }}
                />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "0.8rem", color: "#94a3b8", marginBottom: "4px" }}>Kiểu Avatar:</label>
                <select
                  value={haloAvatarType}
                  onChange={(e) => setHaloAvatarType(e.target.value as any)}
                  style={{
                    width: "100%",
                    padding: "6px 10px",
                    borderRadius: "6px",
                    border: "1px solid rgba(255,255,255,0.1)",
                    background: "rgba(0,0,0,0.3)",
                    color: "#fff",
                    fontSize: "0.875rem",
                  }}
                >
                  <option value="masked">Masked Avatar (Nhô đầu)</option>
                  <option value="solid">Màu Solid</option>
                  <option value="none">Không Avatar</option>
                </select>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "16px" }}>
              <label style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "0.825rem", color: "#cbd5e1", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={haloIsDead}
                  onChange={(e) => setHaloIsDead(e.target.checked)}
                />
                💀 Đã Chết (Is Dead)
              </label>
              <label style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "0.825rem", color: "#cbd5e1", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={haloShaking}
                  onChange={(e) => setHaloShaking(e.target.checked)}
                />
                🫨 Rung Lắc (Witch Danger)
              </label>
            </div>

            {/* Checkbox matrix for concentric halos */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px", borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: "12px" }}>
              <label style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "0.8rem", color: "#e2e8f0", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={playgroundHalos.isSeerResult}
                  onChange={(e) => setPlaygroundHalos({ ...playgroundHalos, isSeerResult: e.target.checked })}
                />
                🔍 Tiên Tri Soi (isSeerResult)
              </label>
              {playgroundHalos.isSeerResult && (
                <label style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "0.8rem", color: "#f87171", cursor: "pointer", marginLeft: "12px" }}>
                  <input
                    type="checkbox"
                    checked={playgroundHalos.seerResultIsWolf}
                    onChange={(e) => setPlaygroundHalos({ ...playgroundHalos, seerResultIsWolf: e.target.checked })}
                  />
                  ↳ Kết quả là Sói (isWolf)
                </label>
              )}
              <label style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "0.8rem", color: "#e2e8f0", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={playgroundHalos.isVerdictLiveHighlighted}
                  onChange={(e) => setPlaygroundHalos({ ...playgroundHalos, isVerdictLiveHighlighted: e.target.checked })}
                />
                🟢 Bình chọn Sống (Live Highlight)
              </label>
              <label style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "0.8rem", color: "#e2e8f0", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={playgroundHalos.isVerdictDieHighlighted}
                  onChange={(e) => setPlaygroundHalos({ ...playgroundHalos, isVerdictDieHighlighted: e.target.checked })}
                />
                🔴 Bình chọn Treo (Die Highlight)
              </label>
              <label style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "0.8rem", color: "#e2e8f0", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={playgroundHalos.isWitchDanger}
                  onChange={(e) => setPlaygroundHalos({ ...playgroundHalos, isWitchDanger: e.target.checked })}
                />
                🧪 Phù Thủy Độc (Witch Danger)
              </label>
              <label style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "0.8rem", color: "#e2e8f0", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={playgroundHalos.isCursedHighlighted}
                  onChange={(e) => setPlaygroundHalos({ ...playgroundHalos, isCursedHighlighted: e.target.checked })}
                />
                ⬜ Bị Nguyền (Cursed Highlight)
              </label>
              {playgroundHalos.isCursedHighlighted && (
                <label style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "0.8rem", color: "#f87171", cursor: "pointer", marginLeft: "12px" }}>
                  <input
                    type="checkbox"
                    checked={playgroundHalos.cursedHighlightIsDanger}
                    onChange={(e) => setPlaygroundHalos({ ...playgroundHalos, cursedHighlightIsDanger: e.target.checked })}
                  />
                  ↳ Hóa Sói (isDanger)
                </label>
              )}

              {/* Night Progress Radio group */}
              <div style={{ gridColumn: "span 2", margin: "4px 0", borderTop: "1px dashed rgba(255,255,255,0.05)", paddingTop: "8px" }}>
                <span style={{ fontSize: "0.8rem", color: "#94a3b8", marginRight: "8px" }}>Hành động Đêm (Night Action):</span>
                <label style={{ display: "inline-flex", alignItems: "center", marginRight: "12px", fontSize: "0.8rem", cursor: "pointer" }}>
                  <input
                    type="radio"
                    name="nightAction"
                    value="none"
                    checked={playgroundHalos.nightActionProgress === "none"}
                    onChange={() => setPlaygroundHalos({ ...playgroundHalos, nightActionProgress: "none" })}
                    style={{ marginRight: "4px" }}
                  /> None
                </label>
                <label style={{ display: "inline-flex", alignItems: "center", marginRight: "12px", fontSize: "0.8rem", cursor: "pointer", color: "#f59e0b" }}>
                  <input
                    type="radio"
                    name="nightAction"
                    value="pending"
                    checked={playgroundHalos.nightActionProgress === "pending"}
                    onChange={() => setPlaygroundHalos({ ...playgroundHalos, nightActionProgress: "pending" })}
                    style={{ marginRight: "4px" }}
                  /> Pending (Dashed Orange)
                </label>
                <label style={{ display: "inline-flex", alignItems: "center", fontSize: "0.8rem", cursor: "pointer", color: "#10b981" }}>
                  <input
                    type="radio"
                    name="nightAction"
                    value="done"
                    checked={playgroundHalos.nightActionProgress === "done"}
                    onChange={() => setPlaygroundHalos({ ...playgroundHalos, nightActionProgress: "done" })}
                    style={{ marginRight: "4px" }}
                  /> Done (Green Solid)
                </label>
              </div>

              <label style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "0.8rem", color: "#e2e8f0", cursor: "pointer", borderTop: "1px dashed rgba(255,255,255,0.05)", paddingTop: "8px" }}>
                <input
                  type="checkbox"
                  checked={playgroundHalos.isDietQuyOrange}
                  onChange={(e) => setPlaygroundHalos({ ...playgroundHalos, isDietQuyOrange: e.target.checked })}
                />
                🟠 Diệt Quỷ Cam (dietquy-orange)
              </label>
              <label style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "0.8rem", color: "#e2e8f0", cursor: "pointer", borderTop: "1px dashed rgba(255,255,255,0.05)", paddingTop: "8px" }}>
                <input
                  type="checkbox"
                  checked={playgroundHalos.isDietQuyRed}
                  onChange={(e) => setPlaygroundHalos({ ...playgroundHalos, isDietQuyRed: e.target.checked })}
                />
                🔴 Diệt Quỷ Đỏ (dietquy-red)
              </label>

              <label style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "0.8rem", color: "#e2e8f0", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={playgroundHalos.isSecondaryHighlighted}
                  onChange={(e) => setPlaygroundHalos({ ...playgroundHalos, isSecondaryHighlighted: e.target.checked })}
                />
                ⚪ Vòng Thứ Cấp (Secondary Glow)
              </label>
              <label style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "0.8rem", color: "#e2e8f0", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={playgroundHalos.isTrialWhite}
                  onChange={(e) => setPlaygroundHalos({ ...playgroundHalos, isTrialWhite: e.target.checked })}
                />
                ⬜ Trial White (Vòng luận tội trắng)
              </label>

              <label style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "0.8rem", color: "#e2e8f0", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={playgroundHalos.isHighlighted}
                  onChange={(e) => setPlaygroundHalos({ ...playgroundHalos, isHighlighted: e.target.checked })}
                />
                🌟 Spotlight (Vòng hào quang vàng xoay)
              </label>
              <label style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "0.8rem", color: "#e2e8f0", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={playgroundHalos.isActiveNightRoleBadge}
                  onChange={(e) => setPlaygroundHalos({ ...playgroundHalos, isActiveNightRoleBadge: e.target.checked })}
                />
                👑 Active Night Role (Vòng vàng nhấp nháy)
              </label>
              <label style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "0.8rem", color: "#f59e0b", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={playgroundHalos.isTrialOrange}
                  onChange={(e) => setPlaygroundHalos({ ...playgroundHalos, isTrialOrange: e.target.checked })}
                />
                🌀 Dash Cam Xoay (Trial Orange / Bị biểu quyết)
              </label>
              <label style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "0.8rem", color: "#34d399", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={playgroundHalos.isProtectedByGuardian}
                  onChange={(e) => setPlaygroundHalos({ ...playgroundHalos, isProtectedByGuardian: e.target.checked })}
                />
                🛡️ Được Bảo Vệ (Orb Đỏ hue 0)
              </label>
              <label style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "0.8rem", color: "#e2e8f0", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={playgroundHalos.isTrialGreen}
                  onChange={(e) => setPlaygroundHalos({ ...playgroundHalos, isTrialGreen: e.target.checked })}
                />
                🟢 Trial Green (Hào quang tha bổng xanh)
              </label>

              {/* Vote badges */}
              <label style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "0.8rem", color: "#f87171", cursor: "pointer", borderTop: "1px dashed rgba(255,255,255,0.05)", paddingTop: "8px" }}>
                <input
                  type="checkbox"
                  checked={playgroundHalos.showWolfVoteBadge}
                  onChange={(e) => setPlaygroundHalos({ ...playgroundHalos, showWolfVoteBadge: e.target.checked })}
                />
                🗳️ Phiếu bầu Sói (Wolf Vote Badge)
              </label>
              <label style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "0.8rem", color: "#fb7185", cursor: "pointer", borderTop: "1px dashed rgba(255,255,255,0.05)", paddingTop: "8px" }}>
                <input
                  type="checkbox"
                  checked={playgroundHalos.showWolfBadge}
                  onChange={(e) => setPlaygroundHalos({ ...playgroundHalos, showWolfBadge: e.target.checked })}
                />
                🐺 Huy hiệu Sói (Wolf Role Badge)
              </label>
            </div>
          </div>

          {/* Live Preview Screen */}
          <div style={{
            background: "radial-gradient(circle, #1a163a 0%, #05030b 100%)",
            borderRadius: "8px",
            border: "1px solid rgba(139, 92, 246, 0.2)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
            minHeight: "350px",
            overflow: "hidden"
          }}>
            {/* Grid overlay for positioning reference */}
            <div style={{
              position: "absolute",
              inset: 0,
              backgroundImage: "linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)",
              backgroundSize: "20px 20px",
              pointerEvents: "none"
            }} />

            {/* The Mock Circle Rendered Live */}
            <div style={{ position: "relative", padding: "40px" }}>
              <MockPlayerCircle
                name={haloName}
                size={haloCircleSize}
                scaleFactor={haloScaleFactor}
                isDead={haloIsDead}
                avatarType={haloAvatarType}
                shaking={haloShaking}
                {...playgroundHalos}
              />
            </div>

            <div style={{
              position: "absolute",
              bottom: "12px",
              fontSize: "0.75rem",
              color: "#94a3b8",
              background: "rgba(0,0,0,0.6)",
              padding: "4px 8px",
              borderRadius: "4px",
              border: "1px solid rgba(255,255,255,0.05)",
              pointerEvents: "none"
            }}>
              Màn Hình Live Preview (Tỉ lệ 1:1)
            </div>
          </div>
        </div>

        {/* SECTION 2: GRID OF ALL INDIVIDUAL HALOS */}
        <div>
          <h3 style={{ fontSize: "1.1rem", fontWeight: 600, margin: "0 0 16px 0", color: "#cbd5e1", borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: "8px" }}>
            📚 Danh sách các vòng hào quang (Individual Halo Library)
          </h3>

          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: "24px"
          }}>
            {/* Halo 1: Seer Result (Villager) */}
            <div style={{ background: "rgba(0,0,0,0.2)", padding: "16px 12px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.03)", display: "flex", flexDirection: "column", alignItems: "center", gap: "24px" }}>
              <span style={{ fontSize: "0.775rem", fontWeight: "bold", color: "#94a3b8", textAlign: "center" }}>1. Tiên Tri Soi (Dân)</span>
              <MockPlayerCircle name="Dân" size={70} scaleFactor={1.0} isSeerResult={true} seerResultIsWolf={false} />
            </div>

            {/* Halo 2: Seer Result (Wolf) */}
            <div style={{ background: "rgba(0,0,0,0.2)", padding: "16px 12px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.03)", display: "flex", flexDirection: "column", alignItems: "center", gap: "24px" }}>
              <span style={{ fontSize: "0.775rem", fontWeight: "bold", color: "#94a3b8", textAlign: "center" }}>2. Tiên Tri Soi (Sói)</span>
              <MockPlayerCircle name="Sói" size={70} scaleFactor={1.0} isSeerResult={true} seerResultIsWolf={true} />
            </div>

            {/* Halo 3: Verdict Live */}
            <div style={{ background: "rgba(0,0,0,0.2)", padding: "16px 12px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.03)", display: "flex", flexDirection: "column", alignItems: "center", gap: "24px" }}>
              <span style={{ fontSize: "0.775rem", fontWeight: "bold", color: "#94a3b8", textAlign: "center" }}>3. Bình chọn Sống</span>
              <MockPlayerCircle name="Sống" size={70} scaleFactor={1.0} isVerdictLiveHighlighted={true} />
            </div>

            {/* Halo 4: Verdict Die */}
            <div style={{ background: "rgba(0,0,0,0.2)", padding: "16px 12px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.03)", display: "flex", flexDirection: "column", alignItems: "center", gap: "24px" }}>
              <span style={{ fontSize: "0.775rem", fontWeight: "bold", color: "#94a3b8", textAlign: "center" }}>4. Bình chọn Treo</span>
              <MockPlayerCircle name="Treo" size={70} scaleFactor={1.0} isVerdictDieHighlighted={true} />
            </div>

            {/* Halo 5: Witch Danger */}
            <div style={{ background: "rgba(0,0,0,0.2)", padding: "16px 12px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.03)", display: "flex", flexDirection: "column", alignItems: "center", gap: "24px" }}>
              <span style={{ fontSize: "0.775rem", fontWeight: "bold", color: "#94a3b8", textAlign: "center" }}>5. Bị Phù Thủy Độc</span>
              <MockPlayerCircle name="Độc" size={70} scaleFactor={1.0} isWitchDanger={true} shaking={true} />
            </div>

            {/* Halo 6: Cursed Highlight (Normal) */}
            <div style={{ background: "rgba(0,0,0,0.2)", padding: "16px 12px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.03)", display: "flex", flexDirection: "column", alignItems: "center", gap: "24px" }}>
              <span style={{ fontSize: "0.775rem", fontWeight: "bold", color: "#94a3b8", textAlign: "center" }}>6. Bị Nguyền (Chưa hóa)</span>
              <MockPlayerCircle name="Nguyền" size={70} scaleFactor={1.0} isCursedHighlighted={true} cursedHighlightIsDanger={false} />
            </div>

            {/* Halo 7: Cursed Highlight (Danger/Wolf) */}
            <div style={{ background: "rgba(0,0,0,0.2)", padding: "16px 12px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.03)", display: "flex", flexDirection: "column", alignItems: "center", gap: "24px" }}>
              <span style={{ fontSize: "0.775rem", fontWeight: "bold", color: "#94a3b8", textAlign: "center" }}>7. Bị Nguyền (Hóa Sói)</span>
              <MockPlayerCircle name="Hóa Sói" size={70} scaleFactor={1.0} isCursedHighlighted={true} cursedHighlightIsDanger={true} />
            </div>

            {/* Halo 8: Night Action Pending */}
            <div style={{ background: "rgba(0,0,0,0.2)", padding: "16px 12px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.03)", display: "flex", flexDirection: "column", alignItems: "center", gap: "24px" }}>
              <span style={{ fontSize: "0.775rem", fontWeight: "bold", color: "#94a3b8", textAlign: "center" }}>8. Đang chờ hành động (Đêm)</span>
              <MockPlayerCircle name="Đợi..." size={70} scaleFactor={1.0} nightActionProgress="pending" />
            </div>

            {/* Halo 9: Night Action Done */}
            <div style={{ background: "rgba(0,0,0,0.2)", padding: "16px 12px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.03)", display: "flex", flexDirection: "column", alignItems: "center", gap: "24px" }}>
              <span style={{ fontSize: "0.775rem", fontWeight: "bold", color: "#94a3b8", textAlign: "center" }}>9. Night Action Xong</span>
              <MockPlayerCircle name="Xong" size={70} scaleFactor={1.0} nightActionProgress="done" />
            </div>

            {/* Halo 10: Diet Quy Orange */}
            <div style={{ background: "rgba(0,0,0,0.2)", padding: "16px 12px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.03)", display: "flex", flexDirection: "column", alignItems: "center", gap: "24px" }}>
              <span style={{ fontSize: "0.775rem", fontWeight: "bold", color: "#94a3b8", textAlign: "center" }}>10. Diệt Quỷ Cam</span>
              <MockPlayerCircle name="Diệt Quỷ" size={70} scaleFactor={1.0} isDietQuyOrange={true} />
            </div>

            {/* Halo 11: Diet Quy Red */}
            <div style={{ background: "rgba(0,0,0,0.2)", padding: "16px 12px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.03)", display: "flex", flexDirection: "column", alignItems: "center", gap: "24px" }}>
              <span style={{ fontSize: "0.775rem", fontWeight: "bold", color: "#94a3b8", textAlign: "center" }}>11. Diệt Quỷ Đỏ</span>
              <MockPlayerCircle name="Diệt Quỷ" size={70} scaleFactor={1.0} isDietQuyRed={true} />
            </div>

            {/* Halo 12: Secondary Highlight */}
            <div style={{ background: "rgba(0,0,0,0.2)", padding: "16px 12px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.03)", display: "flex", flexDirection: "column", alignItems: "center", gap: "24px" }}>
              <span style={{ fontSize: "0.775rem", fontWeight: "bold", color: "#94a3b8", textAlign: "center" }}>12. Vòng Thứ Cấp</span>
              <MockPlayerCircle name="Thứ Cấp" size={70} scaleFactor={1.0} isSecondaryHighlighted={true} />
            </div>

            {/* Halo 13: Trial White */}
            <div style={{ background: "rgba(0,0,0,0.2)", padding: "16px 12px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.03)", display: "flex", flexDirection: "column", alignItems: "center", gap: "24px" }}>
              <span style={{ fontSize: "0.775rem", fontWeight: "bold", color: "#94a3b8", textAlign: "center" }}>13. Trial White</span>
              <MockPlayerCircle name="Luận Tội" size={70} scaleFactor={1.0} isTrialWhite={true} />
            </div>

            {/* Halo 14: Spotlight (Highlighted) */}
            <div style={{ background: "rgba(0,0,0,0.2)", padding: "16px 12px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.03)", display: "flex", flexDirection: "column", alignItems: "center", gap: "24px" }}>
              <span style={{ fontSize: "0.775rem", fontWeight: "bold", color: "#94a3b8", textAlign: "center" }}>14. Spotlight (Vàng xoay)</span>
              <MockPlayerCircle name="Mục Tiêu" size={70} scaleFactor={1.0} isHighlighted={true} />
            </div>

            {/* Halo 15: Active Night Role */}
            <div style={{ background: "rgba(0,0,0,0.2)", padding: "16px 12px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.03)", display: "flex", flexDirection: "column", alignItems: "center", gap: "24px" }}>
              <span style={{ fontSize: "0.775rem", fontWeight: "bold", color: "#94a3b8", textAlign: "center" }}>15. Active Night Role</span>
              <MockPlayerCircle name="Nhấp Nháy" size={70} scaleFactor={1.0} isActiveNightRoleBadge={true} />
            </div>

            {/* Halo 16: Được Bảo Vệ (Orb Đỏ) */}
            <div style={{ background: "rgba(0,0,0,0.2)", padding: "16px 12px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.03)", display: "flex", flexDirection: "column", alignItems: "center", gap: "24px" }}>
              <span style={{ fontSize: "0.775rem", fontWeight: "bold", color: "#94a3b8", textAlign: "center" }}>16. Được Bảo Vệ (Orb Đỏ)</span>
              <MockPlayerCircle name="Bảo Vệ" size={70} scaleFactor={1.0} isProtectedByGuardian={true} />
            </div>

            {/* Halo 17: Trial Green */}
            <div style={{ background: "rgba(0,0,0,0.2)", padding: "16px 12px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.03)", display: "flex", flexDirection: "column", alignItems: "center", gap: "24px" }}>
              <span style={{ fontSize: "0.775rem", fontWeight: "bold", color: "#94a3b8", textAlign: "center" }}>17. Trial Green (Tha bổng)</span>
              <MockPlayerCircle name="Tha Bổng" size={70} scaleFactor={1.0} isTrialGreen={true} />
            </div>

            {/* Halo 18: Trial Orange (Bị Biểu Quyết) */}
            <div style={{ background: "rgba(0,0,0,0.2)", padding: "16px 12px", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.03)", display: "flex", flexDirection: "column", alignItems: "center", gap: "24px" }}>
              <span style={{ fontSize: "0.775rem", fontWeight: "bold", color: "#94a3b8", textAlign: "center" }}>18. Bị Biểu Quyết (Lên giàn)</span>
              <MockPlayerCircle name="Lên Giàn" size={70} scaleFactor={1.0} isTrialOrange={true} />
            </div>
          </div>
        </div>
      </div>
      <VillagerVictoryAnimation
        open={villagerVictoryAnimOpen}
        villagerRole="Thiên Sứ"
        wolfRole="Sói"
        onComplete={() => {
          setVillagerVictoryAnimOpen(false);
          setGameFinishedModalOpen(true);
        }}
      />

      <GameFinishedModal
        open={gameFinishedModalOpen}
        winner={testWinner}
        scoreResult={testScoreResult}
        onClose={() => setGameFinishedModalOpen(false)}
        onBackToLobby={() => {
          setGameFinishedModalOpen(false);
          alert("Quay về phòng chờ!");
        }}
        onOpenScoreboard={() => {
          alert("Mở bảng điểm chi tiết!");
        }}
      />
    </div>
  );
}


