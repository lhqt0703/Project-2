

import { useEffect, useMemo, useRef, useState } from "react";
import { socket } from "../socket";
import { useLocation } from "react-router-dom";
import { useRoomContext } from "../context/RoomContext";
import PlayerPositions from "../components/PlayerPositions";
import type { GamePhase } from "./gameRoles/socketEvents";
import { useSeerRole } from "./gameRoles/useSeerRole";
import { useWolfRole } from "./gameRoles/useWolfRole";
import { useGuardianRole } from "./gameRoles/useGuardianRole";
import { useGameSocketSync } from "./gameRoles/useGameSocketSync";
import { useWitchRole } from "./gameRoles/useWitchRole";
import { useHunterRole } from "./gameRoles/useHunterRole";

export default function Game() {
  const { role, room, setRoom } = useRoomContext();
  const location = useLocation();
  const query = new URLSearchParams(location.search);
  const roomId = query.get("roomId");
  const debugAnim = query.get("debugAnim") === "1";
  const hostId = localStorage.getItem("hostId");
  const sync = useGameSocketSync({ roomId, setRoom });
  const phase: GamePhase = sync.phase;
  const deadPlayers = sync.deadPlayers;

  const roomForRoles = useMemo(
    () =>
      room ??
      ({
        players: [],
        wolfVotes: undefined,
        wolfVotes2: undefined,
        deadPlayers: [],
        playerRoles: {},
      } as any),
    [room]
  );

  // Cinematic beat: quick burst -> ~1s slow-mo -> quick finish.
  const HUNTER_BULLET_ANIM_MS = 1000;
  const [hunterBulletAnim, setHunterBulletAnim] = useState<
    | {
        fromPlayerId: string;
        toPlayerId: string;
        startedAt: number;
        durationMs: number;
      }
    | null
  >(null);
  const hunterBulletTimeoutRef = useRef<number | null>(null);
  const lastHunterShotRef = useRef<{ hunterId: string; targetId: string } | null>(null);

  const playHunterShotAnim = (hunterId: string, targetId: string) => {
    if (!hunterId || !targetId || hunterId === targetId) return;

    if (hunterBulletTimeoutRef.current) {
      window.clearTimeout(hunterBulletTimeoutRef.current);
      hunterBulletTimeoutRef.current = null;
    }

    setHunterBulletAnim({
      fromPlayerId: hunterId,
      toPlayerId: targetId,
      startedAt: performance.now(),
      durationMs: HUNTER_BULLET_ANIM_MS,
    });

    hunterBulletTimeoutRef.current = window.setTimeout(() => {
      setHunterBulletAnim(null);
      hunterBulletTimeoutRef.current = null;
    }, HUNTER_BULLET_ANIM_MS);
  };

  useEffect(() => {
    const shot = sync.hunterShot;
    if (!shot?.hunterId || !shot?.targetId) return;

    lastHunterShotRef.current = { hunterId: shot.hunterId, targetId: shot.targetId };

    playHunterShotAnim(shot.hunterId, shot.targetId);
  }, [sync.hunterShotSeq]);

  useEffect(() => {
    if (!debugAnim) return;
    if (!room) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "h" || !e.shiftKey) return;

      const alive = room.players
        .map(p => p.id)
        .filter(id => !deadPlayers.includes(id));
      if (alive.length < 2) return;

      const from = alive[Math.floor(Math.random() * alive.length)]!;
      let to = from;
      for (let i = 0; i < 10 && to === from; i++) {
        to = alive[Math.floor(Math.random() * alive.length)]!;
      }
      if (to === from) return;
      playHunterShotAnim(from, to);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [debugAnim, room, deadPlayers]);

  const deadPlayersOverrideForRender = useMemo(() => {
    if (!hunterBulletAnim) return deadPlayers;
    const { fromPlayerId, toPlayerId } = hunterBulletAnim;
    return deadPlayers.filter((id) => id !== fromPlayerId && id !== toPlayerId);
  }, [deadPlayers, hunterBulletAnim]);

  const seer = useSeerRole({
    roomId,
    phase,
    role,
    deadPlayers,
    seerResult: sync.seerResult,
  });
  const wolf = useWolfRole({
    roomId,
    phase,
    role,
    room: roomForRoles,
    deadPlayers,
    wolfLocked: sync.wolfLocked,
    wolfDeadline: sync.wolfDeadline,
    wolves: sync.wolves,
    activeWolves: sync.activeWolves,
    wolfMaxTargets: sync.wolfMaxTargets,
  });
  const guardian = useGuardianRole({
    roomId,
    phase,
    role,
    deadPlayers,
    guardianProtectedSeq: sync.guardianProtectedSeq,
    guardianProtectedTargetId: sync.guardianProtectedTargetId,
  });

  const witch = useWitchRole({
    roomId,
    phase,
    role,
    room: roomForRoles,
    deadPlayers,
    witchPendingDeathTargetIds: sync.witchPendingDeathTargetIds,
    witchPotions: sync.witchPotions,
  });

  const hunter = useHunterRole({
    roomId,
    phase,
    role,
    deadPlayers,
    hunterTargetSeq: sync.hunterTargetSeq,
    hunterTargetId: sync.hunterTargetId,
  });

  // Note: all socket subscriptions are centralized in useGameSocketSync.

  useEffect(() => {
    // Khi host rời khi game đang diễn ra
    const handleHostDisconnected = () => {
      alert(
        "Chủ phòng đã rời đi. Bạn có thể chờ chủ phòng quay lại hoặc thoát khỏi phòng."
      );
      // Có thể thêm logic cho phép người chơi tự thoát hoặc chờ
    };
    socket.on("hostDisconnected", handleHostDisconnected);
    return () => {
      socket.off("hostDisconnected", handleHostDisconnected);
    };
  }, []);

  useEffect(() => {
    const handleErrorMessage = (msg: string) => {
      if (msg) alert(msg);
    };
    socket.on("errorMessage", handleErrorMessage);
    return () => {
      socket.off("errorMessage", handleErrorMessage);
    };
  }, []);

  // Xử lý click vào avatar người chơi
  const handlePlayerClick = (playerId: string) => {
    // Nếu người chơi đã chết thì không được chọn họ nữa
    if (deadPlayers.includes(playerId)) return;

    if (seer.onPlayerClick(playerId)) return;
    if (wolf.onPlayerClick(playerId)) return;
    if (guardian.onPlayerClick(playerId)) return;
    if (witch.onPlayerClick(playerId)) return;
    if (hunter.onPlayerClick(playerId)) return;
  };

  return (
    <div style={{ padding: 20 }}>
      {!room && (
        <p>
          Hình như có gì đó sai sai... Lẽ ra bạn không nên thấy được những dòng này
        </p>
      )}
      <h1>Trò chơi bắt đầu!</h1>
      <h2>Vai trò của bạn là: {role}</h2>
      {phase === "day" ? (
        <h1>🌞 Ban ngày – Thảo luận</h1>
      ) : (
        <h1>🌙 Ban đêm – Các vai trò thực hiện hành động</h1>
      )}

      {debugAnim && (
        <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
          <button
            onClick={() => {
              if (!room) return;
              const alive = room.players
                .map(p => p.id)
                .filter(id => !deadPlayers.includes(id));
              if (alive.length < 2) return;
              const from = alive[0]!;
              const to = alive.find(id => id !== from) || null;
              if (!to) return;
              playHunterShotAnim(from, to);
            }}
          >
            Test shot
          </button>

          <button
            onClick={() => {
              const last = lastHunterShotRef.current;
              if (!last) return;
              playHunterShotAnim(last.hunterId, last.targetId);
            }}
          >
            Replay last shot
          </button>

          <div style={{ opacity: 0.7, fontSize: 12, alignSelf: "center" }}>
            Tip: Shift+H để random shot
          </div>
        </div>
      )}
      {/* Hiển thị bố cục vị trí người chơi khi có room.positions */}
      {room?.positions && (
        <div style={{ margin: "32px auto" }}>
          <PlayerPositions
            mode="view"
            onPlayerClick={handlePlayerClick}
            seerResult={seer.seerResult}
            deadPlayersOverride={deadPlayersOverrideForRender}
            bulletAnimation={hunterBulletAnim}
            selectedOutlinePlayerId={
              guardian.playerPositionsProps.selectedOutlinePlayerId ||
              witch.playerPositionsProps.selectedOutlinePlayerId ||
              hunter.playerPositionsProps.selectedOutlinePlayerId ||
              null
            }
            selectedOutlinePlayerIds={(wolf.playerPositionsProps.selectedOutlinePlayerIds || []).filter(
              (id): id is string => !!id
            )}
            dangerPlayerIds={witch.playerPositionsProps.dangerPlayerIds}
            showWolfVoteBadges={wolf.playerPositionsProps.showWolfVoteBadges}
            wolfVoteVoterIds={wolf.playerPositionsProps.wolfVoteVoterIds}
            showWolfBadges={wolf.playerPositionsProps.showWolfBadges}
            wolfBadgePlayerIds={wolf.playerPositionsProps.wolfBadgePlayerIds}
          />
        </div>
      )}
      {seer.modal}
      {guardian.modal}

      {hunter.modal}

      {witch.panel}


    {/* Host controls */}
    {socket.id === hostId && (
      <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
        <button
          onClick={() =>
            socket.emit("changePhase", { roomId, phase: "night" })
          }
        >
          Bắt đầu đêm
        </button>
        <button
          onClick={() =>
            socket.emit("changePhase", { roomId, phase: "day" })
          }
        >
          Bắt đầu ngày
        </button>
      </div>
    )}

    {wolf.panel}
  
    </div>
  );
}
