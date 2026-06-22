import { useCallback, useEffect, useMemo, useState } from "react";
import { socket, clientId } from "../../socket";
import type { AngelAlignmentGuess, AngelReviveStatePayload, GamePhase } from "./socketEvents";
import nenLaiAsset from "../../assets/Nền lai.avif";
import cThienSuAsset from "../../assets/C Thiên Sứ.avif";

const ANGEL_ROLE = "Thiên Sứ";

type RoomLike = {
  hostId?: string;
  players: Array<{ id: string; name: string }>;
};

function getPlayerName(room: RoomLike, playerId: string | null) {
  if (!playerId) return "người chơi này";
  return room.players.find((player) => player.id === playerId)?.name || "người chơi này";
}

export function useAngelRole({
  roomId,
  phase,
  role,
  room,
  deadPlayers,
  angelState,
}: {
  roomId: string | null;
  phase: GamePhase;
  role: string | null;
  room: RoomLike;
  deadPlayers: string[];
  angelState: AngelReviveStatePayload;
}) {
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [showChoiceModal, setShowChoiceModal] = useState(false);
  const [showSuccessPanel, setShowSuccessPanel] = useState(true);
  const [isFading, setIsFading] = useState(false);

  useEffect(() => {
    if (phase === "day" && angelState.selectedTargetId) {
      setShowSuccessPanel(true);
      setIsFading(false);
      const fadeTimeout = setTimeout(() => {
        setIsFading(true);
      }, 5000);
      const hideTimeout = setTimeout(() => {
        setShowSuccessPanel(false);
      }, 7000);
      return () => {
        clearTimeout(fadeTimeout);
        clearTimeout(hideTimeout);
      };
    } else {
      setShowSuccessPanel(true);
      setIsFading(false);
    }
  }, [angelState.selectedTargetId, phase]);

  const canRevive = useMemo(() => {
    if (role !== ANGEL_ROLE) return false;
    if (phase !== "day") return false;
    if (!clientId || !deadPlayers.includes(clientId)) return false;
    return angelState.canRevive === true;
  }, [angelState.canRevive, deadPlayers, phase, role]);

  const onPlayerClick = useCallback((playerId: string) => {
    if (!canRevive) return false;
    if (!clientId) return true;
    if (playerId === clientId) return true;
    if (playerId === room.hostId) return true;
    if (!deadPlayers.includes(playerId)) return false;

    setSelectedTargetId(playerId);
    setShowChoiceModal(true);
    return true;
  }, [canRevive, deadPlayers, room.hostId]);

  const confirmChoice = useCallback((guess: AngelAlignmentGuess) => {
    if (!roomId || !selectedTargetId || !canRevive) return;
    socket.emit("angelChooseRevive", { roomId, targetId: selectedTargetId, guess });
    setShowChoiceModal(false);
  }, [canRevive, roomId, selectedTargetId]);

  const effectiveTargetId = (showChoiceModal ? selectedTargetId : null) || angelState.selectedTargetId;
  const targetName = getPlayerName(room, effectiveTargetId);
  const highlightedTargetId =
    canRevive && selectedTargetId && deadPlayers.includes(selectedTargetId)
      ? selectedTargetId
      : angelState.selectedTargetId;

  const modal = canRevive && showChoiceModal && selectedTargetId ? (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0,0,0,0.32)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          width: "min(92vw, 520px)",
          position: "relative",
          top: "-14.5dvh",
        }}
      >
        <img
          src={cThienSuAsset}
          alt="C Thiên Sứ"
          style={{
            height: "25rem",
            objectFit: "contain",
            marginBottom: "-13%",
            zIndex: -11,
            pointerEvents: "none",
            filter: "drop-shadow(0 8px 24px rgba(0,0,0,0.6))",
          }}
        />
        <div
          style={{
            width: "100%",
            position: "relative",
            borderRadius: 14,
            boxShadow: "0 18px 50px rgba(0,0,0,0.4)",
            border: "1px solid var(--border)",
            overflow: "hidden",
            zIndex: 0,
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage: `url(${nenLaiAsset})`,
              backgroundSize: "cover",
              backgroundPosition: "top",
              filter: "blur(8px)",
              zIndex: 0,
              opacity: 0.9,
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(20, 20, 20, 0.65)",
              backdropFilter: "blur(4px)",
              zIndex: 0,
            }}
          />
          <div
            style={{
              position: "relative",
              zIndex: 2,
              padding: "48px 24px 24px 24px",
              color: "#ffffff",
            }}
          >
            <button
              onClick={() => setShowChoiceModal(false)}
              style={{
                position: "absolute",
                top: 14,
                right: 14,
                background: "none",
                border: "none",
                color: "#ffffff",
                fontSize: "20px",
                cursor: "pointer",
                zIndex: 3,
                padding: 4,
                lineHeight: 1,
                opacity: 0.7,
                transition: "all 0.2s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = "1";
                e.currentTarget.style.transform = "scale(1.15)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = "0.7";
                e.currentTarget.style.transform = "scale(1)";
              }}
            >
              ✕
            </button>
            <h2 style={{ marginTop: 0, textAlign: "center", fontSize: "20px", fontWeight: "bold", textShadow: "0 2px 8px rgba(0,0,0,0.8)" }}>
              Sự lựa chọn
            </h2>
            <p style={{ lineHeight: 1.55, marginBottom: 20, textAlign: "center", fontSize: "15px", textShadow: "0 2px 4px rgba(0,0,0,0.8)" }}>
              Bạn tin rằng <strong>{targetName}</strong> thuộc phe nào?
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", marginBottom: 16 }}>
              <button
                onClick={() => confirmChoice("villagers")}
                style={{
                  flex: 1,
                  padding: "12px 20px",
                  borderRadius: 8,
                  border: "1px solid rgba(52, 211, 153, 0.4)",
                  background: "rgba(52, 211, 153, 0.15)",
                  color: "#34d399",
                  cursor: "pointer",
                  fontWeight: "bold",
                  fontSize: "15px",
                  transition: "all 0.2s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(52, 211, 153, 0.25)";
                  e.currentTarget.style.boxShadow = "0 0 12px rgba(52, 211, 153, 0.4)";
                  e.currentTarget.style.transform = "translateY(-1px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(52, 211, 153, 0.15)";
                  e.currentTarget.style.boxShadow = "none";
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                Phe dân 🌱
              </button>
              <button
                onClick={() => confirmChoice("wolves")}
                style={{
                  flex: 1,
                  padding: "12px 20px",
                  borderRadius: 8,
                  border: "1px solid rgba(248, 113, 113, 0.4)",
                  background: "rgba(248, 113, 113, 0.15)",
                  color: "#f87171",
                  cursor: "pointer",
                  fontWeight: "bold",
                  fontSize: "15px",
                  transition: "all 0.2s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(248, 113, 113, 0.25)";
                  e.currentTarget.style.boxShadow = "0 0 12px rgba(248, 113, 113, 0.4)";
                  e.currentTarget.style.transform = "translateY(-1px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(248, 113, 113, 0.15)";
                  e.currentTarget.style.boxShadow = "none";
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                Phe sói 🐺
              </button>
            </div>
            <div style={{ textAlign: "center", fontSize: "11px", opacity: 0.72, letterSpacing: "0.2px", textShadow: "0 1px 2px rgba(0,0,0,0.8)" }}>
              Hành động này không công khai. Hãy cẩn thận đừng để bị lộ
            </div>
          </div>
        </div>
      </div>
    </div>
  ) : null;

  const panel = useMemo(() => {
    if (canRevive) {
      return (
        <div style={{ marginTop: 10, padding: "8px 10px", borderRadius: 8, background: "rgba(255, 214, 102, 0.16)", border: "1px solid rgba(173, 120, 20, 0.28)" }}>
          <strong>Thiên Sứ:</strong> Bạn có thể âm thầm chọn một người đã chết để hồi sinh. Hãy cẩn thận đừng để lộ.
        </div>
      );
    }

    if (role === ANGEL_ROLE && angelState.selectedTargetId) {
      if (phase === "day") {
        if (!showSuccessPanel) return null;
        return (
          <div
            style={{
              marginTop: 10,
              padding: "8px 10px",
              borderRadius: 8,
              background: "rgba(255, 214, 102, 0.12)",
              border: "1px solid rgba(173, 120, 20, 0.22)",
              opacity: isFading ? 0 : 1,
              transition: "opacity 2s ease",
            }}
          >
            Đã hồi sinh <strong>{targetName}</strong>, nhưng thần thức sẽ cần thời gian đêm đến để có thể tỉnh lại...
          </div>
        );
      } else {
        return (
          <div style={{ marginTop: 10, padding: "8px 10px", borderRadius: 8, background: "rgba(255, 214, 102, 0.12)", border: "1px solid rgba(173, 120, 20, 0.22)" }}>
            <strong>{targetName}</strong> đã hồi sinh và bắt đầu có thể thực hiện được kỹ năng nhưng qua đêm nay mới sẽ lộ diện
          </div>
        );
      }
    }

    if (angelState.reviveStage === "pending") {
      return (
        <div style={{ marginTop: 10, padding: "8px 10px", borderRadius: 8, background: "rgba(255, 214, 102, 0.12)", border: "1px solid rgba(173, 120, 20, 0.22)" }}>
          Bạn đã được Thiên Sứ hồi sinh. Hãy chuẩn bị hành động và cẩn thận kẻo bị lộ.
        </div>
      );
    }

    if (angelState.reviveStage === "hidden") {
      return (
        <div style={{ marginTop: 10, padding: "8px 10px", borderRadius: 8, background: "rgba(255, 214, 102, 0.12)", border: "1px solid rgba(173, 120, 20, 0.22)" }}>
          Thiên Sứ đã đưa bạn trở lại trong âm thầm. Đêm nay bạn có thể hành động nếu vai trò có kỹ năng, nhưng hãy cẩn thận kẻo bị lộ.
        </div>
      );
    }

    return null;
  }, [angelState.reviveStage, angelState.selectedTargetId, canRevive, role, targetName, phase, showSuccessPanel, isFading]);

  return {
    onPlayerClick,
    modal,
    panel,
    playerPositionsProps: {
      selectedOutlinePlayerId: highlightedTargetId,
    },
  };
}
