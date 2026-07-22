import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clientId, emitSocketAction, requestRoomSync, socket } from "../../socket";
import type { GamePhase } from "./socketEvents";
import { AvifIcon } from "../../components/AvifIcon";
import { getAvatarUrlByFileName, MASKED_AVATAR_MAP } from "../../components/PlayerPositions";
import nenLungAsset from "../../assets/nền lưng.avif";
import ConfirmModal from "../../components/ConfirmModal";


type Player = { id: string; name: string; connected?: boolean; playerAvatar?: string };

type RoomLike = {
  players: Player[];
  deadPlayers?: string[];
  wolfVotes?: Record<string, string | null>;
  wolfVotes2?: Record<string, string | null>;
  wildWolfConvertAvailableTonight?: boolean;
  wildWolfConvertRequestedTonight?: boolean;
  daNghichState?: {
    wolfVotes?: Record<string, string | null>;
    wolfVotes2?: Record<string, string | null>;
    banSoiWolfAligned?: boolean;
    wildWolfConvertAvailableTonight?: boolean;
    wildWolfConvertRequestedTonight?: boolean;
    wildWolfConvertedSelf?: boolean;
  };
  gameRules?: {
    wolfNightActionDurationSec?: number;
    wolfCanBiteWolf?: boolean;
  };
};

const MiniToken = ({ playerId, players }: { playerId: string; players: Player[] }) => {
  const p = players.find((x) => x.id === playerId);
  if (!p) return null;

  let avatarUrl: string | undefined = undefined;
  let maskedAvatarUrl: string | undefined = undefined;

  if (p.playerAvatar) {
    const customUrl = getAvatarUrlByFileName(p.playerAvatar);
    if (customUrl) {
      if (p.playerAvatar.trim().toUpperCase().startsWith("M ")) {
        maskedAvatarUrl = customUrl;
      } else {
        avatarUrl = customUrl;
      }
    }
  }

  if (!avatarUrl && !maskedAvatarUrl) {
    maskedAvatarUrl = MASKED_AVATAR_MAP[playerId];
    if (playerId.startsWith("dev-")) {
      const parts = playerId.split("-");
      const lastPart = parts[parts.length - 1];
      const idx = parseInt(lastPart, 10);
      if (!isNaN(idx) && idx >= 1 && idx <= 7) {
        const VIP_IDS = [
          "046fa88a-a719-47c3-8b97-ddfc8337cf83",
          "f7d9652f-ac74-4557-81a2-7c2731a77d37",
          "397d9740-e21b-4ade-941f-25912aefd591",
          "d64474be-88b2-4f67-bf0d-310c3c9de7f5",
          "8dfc1d63-988f-460d-8569-8a1964be99a0",
          "ec0c6c66-9ce7-4d86-ac12-25824af15b79",
          "9bc9009c-13b3-4ba6-bbdd-a7189b477ccd"
        ];
        const vipId = VIP_IDS[idx - 1];
        if (!maskedAvatarUrl) maskedAvatarUrl = MASKED_AVATAR_MAP[vipId];
      }
    }
  }

  return (
    <div
      title={p.name}
      style={{
        width: 24,
        height: 24,
        borderRadius: "50%",
        backgroundImage: maskedAvatarUrl 
          ? `url(${nenLungAsset})` 
          : (avatarUrl ? `url(${avatarUrl})` : undefined),
        backgroundPosition: "center",
        backgroundSize: "cover",
        backgroundRepeat: "no-repeat",
        position: "relative",
        border: "1px solid rgba(255, 255, 255, 0.45)",
        boxShadow: "0 1px 3px rgba(0,0,0,0.5)",
        overflow: maskedAvatarUrl ? "visible" : "hidden",
        flexShrink: 0
      }}
    >
      {maskedAvatarUrl && (
        <>
          <div style={{ position: "absolute", inset: 0, borderRadius: "50%", overflow: "hidden" }}>
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
          </div>
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
              clipPath: "inset(0 0 20% 0)",
            }}
          />
        </>
      )}
    </div>
  );
};

export function useWolfRole({
  roomId,
  phase,
  role,
  room,
  deadPlayers,
  wolfLocked,
  wolfDeadline,
  wolves,
  activeWolves,
  wolfBadgeRoles,
  wolfMaxTargets,
  wolfBiteDisabled,
  allNightActionsSimultaneous,
  currentNightTurnRole,
  nightTurnPaused,
  nightActionNow,
}: {
  roomId: string | null;
  phase: GamePhase;
  role: string | null;
  room: RoomLike;
  deadPlayers: string[];
  wolfLocked: Record<string, boolean> | null;
  wolfDeadline: number | null;
  wolves: string[];
  activeWolves: string[];
  wolfBadgeRoles?: Record<string, string>;
  wolfMaxTargets: number;
  wolfBiteDisabled: boolean;
  allNightActionsSimultaneous: boolean;
  currentNightTurnRole: string | null;
  nightTurnPaused: boolean;
  nightActionNow: number;
}) {
  const [localSelectedTarget, setLocalSelectedTarget] = useState<string | null>(null);
  const [localSelectedTarget2, setLocalSelectedTarget2] = useState<string | null>(null);
  const [hasSubmittedLock, setHasSubmittedLock] = useState(false);
  const [isSubmittingLock, setIsSubmittingLock] = useState(false);
  const hasSubmittedLockRef = useRef(false);
  const [wildWolfConversionPickerOpen, setWildWolfConversionPickerOpen] = useState(false);
  const [wildWolfLocalConversionTarget, setWildWolfLocalConversionTarget] = useState<string | null>(null);
  const [confirmConfig, setConfirmConfig] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
    infoOnly?: boolean;
  } | null>(null);

  const isBanSoiAligned = room.daNghichState?.banSoiWolfAligned === true;
  const isWildWolfConverted = room.daNghichState?.wildWolfConvertedSelf === true;
  const isWolfTeam = useMemo(() => {
    if (role === "Sói" || role === "Sói con" || role === "Sói Dại") return true;
    return role === "Bán sói" && (isBanSoiAligned || isWildWolfConverted);
  }, [isBanSoiAligned, isWildWolfConverted, role]);
  const isWildWolf = role === "Sói Dại";
  const isWildWolfConvertAvailable = room.wildWolfConvertAvailableTonight === true || room.daNghichState?.wildWolfConvertAvailableTonight === true;
  const wildWolfConversionRequested = room.wildWolfConvertRequestedTonight === true || room.daNghichState?.wildWolfConvertRequestedTonight === true;
  const wolfDurationSec =
    typeof room.gameRules?.wolfNightActionDurationSec === "number"
      ? Math.max(0, room.gameRules.wolfNightActionDurationSec)
      : null;

  const activeWolvesAlive = useMemo(() => {
    const effective = (activeWolves.length ? activeWolves : wolves)
      .filter(id => !deadPlayers.includes(id));
    return effective;
  }, [activeWolves, deadPlayers, wolves]);

  const isWolfTurnActive = useMemo(() => {
    if (roomId === "mock-8") return phase === "night";
    if (phase !== "night") return false;
    if (wolfBiteDisabled) return false;
    if (allNightActionsSimultaneous) return true;
    return currentNightTurnRole === "Sói";
  }, [allNightActionsSimultaneous, currentNightTurnRole, phase, wolfBiteDisabled, roomId]);

  useEffect(() => {
    // Reset local selection only when wolf turn actually starts, not when deadline is adjusted on pause/resume.
    if (isWolfTeam && isWolfTurnActive) {
      setLocalSelectedTarget(null);
      setLocalSelectedTarget2(null);
      setWildWolfConversionPickerOpen(false);
      setWildWolfLocalConversionTarget(null);
      hasSubmittedLockRef.current = false;
      setHasSubmittedLock(false);
      setIsSubmittingLock(false);
    }
  }, [isWolfTeam, isWolfTurnActive]);

  useEffect(() => {
    if (clientId && wolfLocked) {
      const serverLocked = !!wolfLocked[clientId];
      if (!serverLocked && hasSubmittedLock) {
        setHasSubmittedLock(false);
        hasSubmittedLockRef.current = false;
      }
    }
  }, [clientId, wolfLocked, hasSubmittedLock]);

  const serverWolfVotes = room.wolfVotes || room.daNghichState?.wolfVotes;
  const serverWolfVotes2 = room.wolfVotes2 || room.daNghichState?.wolfVotes2;

  useEffect(() => {
    if (clientId && isWolfTeam && isWolfTurnActive && serverWolfVotes) {
      const serverVote = serverWolfVotes[clientId] || null;
      if (serverVote !== localSelectedTarget) {
        setLocalSelectedTarget(serverVote);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverWolfVotes, clientId, isWolfTeam, isWolfTurnActive]);

  useEffect(() => {
    if (clientId && isWolfTeam && isWolfTurnActive && serverWolfVotes2) {
      const serverVote2 = serverWolfVotes2[clientId] || null;
      if (serverVote2 !== localSelectedTarget2) {
        setLocalSelectedTarget2(serverVote2);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverWolfVotes2, clientId, isWolfTeam, isWolfTurnActive]);

  const isLocked = useMemo(() => {
    if (clientId && wolfLocked?.[clientId]) return true;
    return hasSubmittedLock || isSubmittingLock;
  }, [hasSubmittedLock, isSubmittingLock, wolfLocked]);

  const canAct = useMemo(() => {
    if (roomId === "mock-8") return isWolfTeam && phase === "night";
    if (phase !== "night") return false;
    if (wolfBiteDisabled) return false;
    if (!isWolfTeam) return false;
    if (clientId && deadPlayers.includes(clientId)) return false;
    if (!allNightActionsSimultaneous) {
      if (currentNightTurnRole !== "Sói") return false;
    }
    return true;
  }, [allNightActionsSimultaneous, currentNightTurnRole, deadPlayers, isWolfTeam, phase, wolfBiteDisabled, roomId]);

  const deadlineReached = !!(wolfDeadline && nightActionNow >= wolfDeadline && !nightTurnPaused);
  const effectiveSelectedTarget = localSelectedTarget || (clientId ? serverWolfVotes?.[clientId] || null : null);
  const effectiveSelectedTarget2 = localSelectedTarget2 || (clientId ? serverWolfVotes2?.[clientId] || null : null);
  const wildWolfConversionCandidateIds = useMemo(
    () =>
      (wolfMaxTargets >= 2
        ? [effectiveSelectedTarget, effectiveSelectedTarget2]
        : [effectiveSelectedTarget]
      ).filter((targetId): targetId is string => !!targetId),
    [effectiveSelectedTarget, effectiveSelectedTarget2, wolfMaxTargets]
  );
  const wildWolfConversionCandidateNames = useMemo(
    () =>
      Object.fromEntries(
        wildWolfConversionCandidateIds.map((targetId) => [
          targetId,
          room.players.find((p) => p.id === targetId)?.name || "đối tượng",
        ])
      ),
    [room.players, wildWolfConversionCandidateIds]
  );
  const wildWolfHalfTimeReached = useMemo(() => {
    if (!wolfDeadline || !wolfDurationSec || wolfDurationSec <= 0) return false;
    const durationMs = Math.floor(wolfDurationSec * 1000);
    return nightActionNow >= wolfDeadline - durationMs / 2;
  }, [nightActionNow, wolfDeadline, wolfDurationSec]);
  const shouldPulseWildWolfConversion =
    isWildWolf &&
    isWildWolfConvertAvailable &&
    !wildWolfConversionRequested &&
    !deadlineReached &&
    !nightTurnPaused &&
    (wolfDurationSec === 0 || wildWolfHalfTimeReached);
  const canPressWildWolfConversion = roomId === "mock-8" ? true : (canAct && !deadlineReached);

  useEffect(() => {
    if (!wildWolfLocalConversionTarget) return;
    if (wildWolfConversionCandidateIds.includes(wildWolfLocalConversionTarget)) return;
    setWildWolfLocalConversionTarget(null);
  }, [wildWolfConversionCandidateIds, wildWolfLocalConversionTarget]);

  const onPlayerClick = useCallback((playerId: string) => {
    if (!canAct) return false;

    // không cho chọn chính mình
    if (playerId === clientId && roomId !== "mock-8") return true;
    // không cho chọn sói khác (trừ khi luật wolfCanBiteWolf được bật)
    if (!room.gameRules?.wolfCanBiteWolf && wolves.includes(playerId) && roomId !== "mock-8") return true;
    // lock vote rồi thì không được chọn nữa
    if (isLocked) return true;
    // hoặc là hết thời gian
    if (deadlineReached) return true;

    if (roomId === "mock-8") {
      setLocalSelectedTarget(playerId);
      return true;
    }

    const isWolfTeamTarget = wolves.includes(playerId);

    // If bonus night: allow selecting up to 2 different targets.
    if (wolfMaxTargets >= 2) {
      // Click same as first => clear both (simple reset)
      if (playerId === localSelectedTarget) {
        setLocalSelectedTarget(null);
        setLocalSelectedTarget2(null);
        socket.emit("wolfChooseTarget", { roomId, targetId: null });
        socket.emit("wolfChooseTarget2", { roomId, targetId: null });
        return true;
      }

      // Click same as second => clear second
      if (playerId === localSelectedTarget2) {
        setLocalSelectedTarget2(null);
        socket.emit("wolfChooseTarget2", { roomId, targetId: null });
        return true;
      }

      // Prevent selecting wolves (already handled), but keep explicit for readability.
      if (!room.gameRules?.wolfCanBiteWolf && isWolfTeamTarget) return true;

      // Fill first then second
      if (!localSelectedTarget) {
        setLocalSelectedTarget(playerId);
        socket.emit("wolfChooseTarget", { roomId, targetId: playerId });
        return true;
      }

      // Must be different from first
      if (playerId === localSelectedTarget) return true;

      setLocalSelectedTarget2(playerId);
      socket.emit("wolfChooseTarget2", { roomId, targetId: playerId });
      return true;
    }

    // Normal night (1 target)
    setLocalSelectedTarget(playerId);
    socket.emit("wolfChooseTarget", { roomId, targetId: playerId });
    return true;
  }, [canAct, deadlineReached, isLocked, localSelectedTarget, localSelectedTarget2, roomId, wolfMaxTargets, wolves]);

  const resetOnPhaseChange = useCallback((_nextPhase: GamePhase) => {
    setLocalSelectedTarget(null);
    setLocalSelectedTarget2(null);
    setWildWolfConversionPickerOpen(false);
    setWildWolfLocalConversionTarget(null);
    hasSubmittedLockRef.current = false;
    // wolf state is owned by parent sync layer
  }, []);

  const isMultiTargetConversion = wolfMaxTargets >= 2 && wildWolfConversionCandidateIds.length === 2;

  const panel =
    isWolfTeam && isWolfTurnActive && clientId && !deadPlayers.includes(clientId) ? (
      <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <button
          disabled={isLocked || !canAct || deadlineReached}
          onClick={() => {
            if (isLocked) return;
            if (deadlineReached) return;
            if (!localSelectedTarget) {
              setConfirmConfig({
                title: "",
                message: "Bạn chưa chọn mục tiêu để cắn",
                infoOnly: true,
                onConfirm: () => setConfirmConfig(null),
              });
              return;
            }

            const proceedToBiteConfirm = () => {
              const name1 = room.players.find(p => p.id === localSelectedTarget)?.name || "đối tượng";
              const name2 = localSelectedTarget2 ? (room.players.find(p => p.id === localSelectedTarget2)?.name || "đối tượng") : null;
              const wildWolfNote = isWildWolf && wildWolfConversionRequested
                ? "\n\nSói Dại sẽ biến mục tiêu đã chọn lây nhiễm thành Sói thường nếu vết cắn được tính."
                : "";

              setConfirmConfig({
                title: "Xác nhận cắn",
                message: name2
                  ? `Bạn có chắc chắn muốn cắn ${name1} và ${name2}?${wildWolfNote}`
                  : `Bạn có chắc chắn muốn cắn ${name1}?${wildWolfNote}`,
                onConfirm: () => {
                  if (!roomId) return;
                  const activeRoomId = roomId;
                  setConfirmConfig(null);
                  if (activeRoomId === "mock-8") {
                    hasSubmittedLockRef.current = true;
                    setHasSubmittedLock(true);
                    return;
                  }

                  setIsSubmittingLock(true);
                  void emitSocketAction("wolfLockVote", {
                    roomId: activeRoomId,
                    targetId: localSelectedTarget,
                    targetId2: localSelectedTarget2,
                  }).then((result) => {
                    setIsSubmittingLock(false);
                    if (result.ok) {
                      hasSubmittedLockRef.current = true;
                      setHasSubmittedLock(true);
                      return;
                    }

                    hasSubmittedLockRef.current = false;
                    setHasSubmittedLock(false);
                    setConfirmConfig({
                      title: "Không thể xác nhận",
                      message: result.message || "Trạng thái lượt cắn đã thay đổi. Phòng đang được đồng bộ lại.",
                      infoOnly: true,
                      onConfirm: () => setConfirmConfig(null),
                    });
                    void requestRoomSync(activeRoomId);
                  });
                }
              });
            };

            if (wolfMaxTargets >= 2 && !localSelectedTarget2) {
              setConfirmConfig({
                title: "Thiếu mục tiêu",
                message: "Đêm nay bạn có thể chọn 2 mục tiêu. Bạn vẫn chưa chọn mục tiêu thứ 2. Vẫn xác nhận CẮN chứ?",
                onConfirm: () => {
                  proceedToBiteConfirm();
                }
              });
            } else {
              proceedToBiteConfirm();
            }
          }}
          style={{
            padding: "8px 12px",
            cursor: isLocked || !canAct || deadlineReached ? "not-allowed" : "pointer",
            opacity: isLocked || !canAct || deadlineReached ? 0.7 : 1,
            height: "38px",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 8,
          }}
        >
          <AvifIcon name="🐺" style={{ marginRight: 4 }} /> CẮN!
        </button>

        {isWildWolf && isWildWolfConvertAvailable && (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <style>{`
              @keyframes wildWolfConversionPulse {
                0%, 100% {
                  opacity: 0.42;
                  box-shadow:
                    inset 0 0 0 2px rgba(236, 58, 58, 0.62),
                    inset 0 0 12px 4px rgba(236, 58, 58, 0.22);
                }
                50% {
                  opacity: 0.84;
                  box-shadow:
                    inset 0 0 0 3px rgba(255, 79, 79, 0.9),
                    inset 0 0 18px 6px rgba(255, 49, 49, 0.34);
                }
              }
              .wild-wolf-convert-btn {
                width: 180px;
                height: 38px;
                position: relative;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                overflow: hidden;
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                border-radius: 8px;
                border: 1px solid rgba(236, 58, 58, 0.45);
                background: rgba(236, 58, 58, 0.12);
                color: #fff;
                font-weight: 600;
                font-size: 13px;
                padding: 0;
              }
              .wild-wolf-convert-btn:hover:not(:disabled) {
                background: rgba(236, 58, 58, 0.22);
              }
              .wild-wolf-btn-text {
                position: absolute;
                transition: opacity 0.25s ease, transform 0.25s ease;
                opacity: 1;
                transform: scale(1);
                white-space: nowrap;
              }
              .wild-wolf-btn-text.hidden {
                opacity: 0;
                transform: scale(0.85);
                pointer-events: none;
              }
              .wild-wolf-btn-tokens {
                position: absolute;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 12px;
                transition: opacity 0.25s ease, transform 0.25s ease;
                opacity: 0;
                transform: scale(0.85);
                pointer-events: none;
              }
              .wild-wolf-btn-tokens.visible {
                opacity: 1;
                transform: scale(1);
                pointer-events: auto;
              }
              .wild-wolf-mini-token-wrapper {
                transition: transform 0.2s ease;
                cursor: pointer;
              }
              .wild-wolf-mini-token-wrapper:hover {
                transform: scale(1.25);
              }
            `}</style>
            <button
              disabled={!canPressWildWolfConversion}
              onClick={() => {
                if (!canPressWildWolfConversion) return;
                if (roomId === "mock-8") {
                  setConfirmConfig({
                    title: "Thông báo",
                    message: "Đã bấm chọn lây nhiễm (giả lập)",
                    infoOnly: true,
                    onConfirm: () => setConfirmConfig(null),
                  });
                  return;
                }
                if (wildWolfConversionRequested) {
                  setWildWolfConversionPickerOpen(false);
                  setWildWolfLocalConversionTarget(null);
                  socket.emit("wildWolfToggleConversion", { roomId, active: false });
                  return;
                }
                if (wildWolfConversionCandidateIds.length === 0) {
                  setConfirmConfig({
                    title: "",
                    message: "Bạn cần chọn mục tiêu cắn trước",
                    infoOnly: true,
                    onConfirm: () => setConfirmConfig(null),
                  });
                  return;
                }
                if (isMultiTargetConversion) {
                  setWildWolfConversionPickerOpen(!wildWolfConversionPickerOpen);
                  return;
                }
                const targetId = wildWolfConversionCandidateIds[0];
                setWildWolfLocalConversionTarget(targetId);
                socket.emit("wildWolfToggleConversion", { roomId, active: true, targetId });
              }}
              className="wild-wolf-convert-btn"
              style={{
                cursor: !canPressWildWolfConversion ? "not-allowed" : "pointer",
                opacity: !canPressWildWolfConversion ? 0.7 : 1,
                animation: shouldPulseWildWolfConversion ? "wildWolfConversionPulse 1.1s ease-in-out infinite" : undefined,
              }}
            >
              <span className={`wild-wolf-btn-text ${wildWolfConversionPickerOpen && !wildWolfConversionRequested ? "hidden" : ""}`}>
                {wildWolfConversionRequested
                  ? "Hủy lây nhiễm"
                  : isMultiTargetConversion
                    ? "Chọn mục tiêu lây nhiễm"
                    : "Biến mục tiêu thành Sói"}
              </span>

              {isMultiTargetConversion && (
                <span className={`wild-wolf-btn-tokens ${wildWolfConversionPickerOpen && !wildWolfConversionRequested ? "visible" : ""}`}>
                  {wildWolfConversionCandidateIds.map((targetId) => (
                    <span
                      key={targetId}
                      className="wild-wolf-mini-token-wrapper"
                      title={`Lây nhiễm ${wildWolfConversionCandidateNames[targetId] || "đối tượng"}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setWildWolfLocalConversionTarget(targetId);
                        setWildWolfConversionPickerOpen(false);
                        socket.emit("wildWolfToggleConversion", { roomId, active: true, targetId });
                      }}
                    >
                      <MiniToken playerId={targetId} players={room.players} />
                    </span>
                  ))}
                </span>
              )}
            </button>
          </div>
        )}

        {confirmConfig && (
          <ConfirmModal
            open={!!confirmConfig}
            title={confirmConfig.title}
            message={confirmConfig.message}
            infoOnly={confirmConfig.infoOnly}
            onConfirm={confirmConfig.onConfirm}
            onCancel={() => setConfirmConfig(null)}
          />
        )}
      </div>
    ) : null;

  return {
    onPlayerClick,
    panel,
    resetOnPhaseChange,
    playerPositionsProps: {
      selectedOutlinePlayerIds:
        isWolfTeam && isWolfTurnActive
          ? [effectiveSelectedTarget, effectiveSelectedTarget2].filter(Boolean)
          : [],
      showWolfVoteBadges: isWolfTeam && isWolfTurnActive && !!clientId && !deadPlayers.includes(clientId),
      wolfVoteVoterIds: activeWolvesAlive,
      showWolfBadges: isWolfTeam && isWolfTurnActive && !!clientId && !deadPlayers.includes(clientId),
      wolfBadgePlayerIds: wolves,
      wolfBadgeRoles: wolfBadgeRoles || {},
    },
  };
}
