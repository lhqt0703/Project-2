

import { useEffect } from "react";
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
  const hostId = localStorage.getItem("hostId");
  const sync = useGameSocketSync({ roomId, setRoom });
  const phase: GamePhase = sync.phase;
  const deadPlayers = sync.deadPlayers;


  if (!room) return <p>Hình như có gì đó sai sai... Lẽ ra bạn không nên thấy được những dòng này</p>;

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
    room,
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
    room,
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
      <h1>Trò chơi bắt đầu!</h1>
      <h2>Vai trò của bạn là: {role}</h2>
      {phase === "day" ? (
        <h1>🌞 Ban ngày – Thảo luận</h1>
      ) : (
        <h1>🌙 Ban đêm – Các vai trò thực hiện hành động</h1>
      )}
      {/* Hiển thị bố cục vị trí người chơi khi có room.positions */}
      {room?.positions && (
        <div style={{ margin: "32px auto" }}>
          <PlayerPositions
            mode="view"
            onPlayerClick={handlePlayerClick}
            seerResult={seer.seerResult}
            selectedOutlinePlayerId={
              guardian.playerPositionsProps.selectedOutlinePlayerId ||
              witch.playerPositionsProps.selectedOutlinePlayerId ||
              hunter.playerPositionsProps.selectedOutlinePlayerId ||
              null
            }
            selectedOutlinePlayerIds={wolf.playerPositionsProps.selectedOutlinePlayerIds}
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
