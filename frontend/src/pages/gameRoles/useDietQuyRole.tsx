import { useCallback, useEffect, useMemo, useState } from "react";
import { socket, clientId } from "../../socket";
import type { GamePhase } from "./socketEvents";
import ConfirmModal from "../../components/ConfirmModal";

type Player = { id: string; name: string; connected?: boolean };

type RoomLike = {
  id: string;
  hostId: string;
  gameMode?: "da_nghich" | "diet_quy";
  nightTurnPlayerId?: string | null;
  nightTurnRole?: string | null;
  nightCount?: number;
  players: Player[];
  deadPlayers?: string[];
  dietQuyMonkProtectedPlayerId?: string | null;
  dietQuyPoisonedPlayerId?: string | null;
  dietQuyRedCharmPlayerId?: string | null;
  dietQuyImpKillPlayerId?: string | null;
  dietQuyMayorReplacementId?: string | null;
};

const DIET_QUY_TOWNSFOLK = [
  "Thợ giặt", "Thủ thư", "Điều tra viên", "Đầu bếp", "Đồng cảm", 
  "Thầy bói", "Chôn cất", "Nhà sư", "Nuôi quạ", "Trinh nữ", 
  "Diệt quỷ", "Chiến sĩ", "Thị trưởng"
];
const DIET_QUY_MINIONS = ["Độc thủ", "Gián điệp", "Phò"];
const DIET_QUY_DEMON = ["Ác Quỷ"];
const DIET_QUY_TRAVELERS = ["Người ẩn dật", "Thánh nhân"];
const ALL_ROLES = [...DIET_QUY_TOWNSFOLK, ...DIET_QUY_TRAVELERS, ...DIET_QUY_MINIONS, ...DIET_QUY_DEMON];

export function useDietQuyRole({
  roomId,
  phase,
  role,
  room,
  deadPlayers,
}: {
  roomId: string | null;
  phase: GamePhase;
  role: string | null;
  room: RoomLike | null;
  deadPlayers: string[];
}) {
  const isHost = room?.hostId === clientId;

  // Active player target selections
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  // Fortune Teller (Thầy bói) 2-target selection
  const [ftSelectedIds, setFtSelectedIds] = useState<string[]>([]);
  const [showFtConfirm, setShowFtConfirm] = useState(false);

  // Host selections
  const [hostSelectedIds, setHostSelectedIds] = useState<string[]>([]);
  const [hostSelectedRole, setHostSelectedRole] = useState<string>("");

  // Role info received from server
  const [washerwomanInfo, setWasherwomanInfo] = useState<{ targetIds: string[]; townsfolkRole: string } | null>(null);
  const [librarianInfo, setLibrarianInfo] = useState<{ targetIds: string[]; role: string } | null>(null);
  const [investigatorInfo, setInvestigatorInfo] = useState<{ targetIds: string[]; minionRole: string } | null>(null);
  const [fortuneTellerResult, setFortuneTellerResult] = useState<string | null>(null);
  const [ravenkeeperResult, setRavenkeeperResult] = useState<string | null>(null);
  const [chefInfo, setChefInfo] = useState<number | null>(null);
  const [empathInfo, setEmpathInfo] = useState<number | null>(null);
  const [undertakerInfo, setUndertakerInfo] = useState<string | null>(null);

  // Bind info listeners
  useEffect(() => {
    const handleWw = (data: any) => setWasherwomanInfo(data);
    const handleLib = (data: any) => setLibrarianInfo(data);
    const handleInv = (data: any) => setInvestigatorInfo(data);
    const handleFt = (data: any) => setFortuneTellerResult(data.result);
    const handleRk = (data: any) => setRavenkeeperResult(data.role);
    const handleChef = (data: any) => setChefInfo(data.count);
    const handleEmpath = (data: any) => setEmpathInfo(data.count);
    const handleUndertaker = (data: any) => setUndertakerInfo(data.role);

    socket.on("dietQuyWasherwomanInfo", handleWw);
    socket.on("dietQuyLibrarianInfo", handleLib);
    socket.on("dietQuyInvestigatorInfo", handleInv);
    socket.on("dietQuyFortuneTellerResult", handleFt);
    socket.on("dietQuyRavenkeeperResult", handleRk);
    socket.on("dietQuyChefInfo", handleChef);
    socket.on("dietQuyEmpathInfo", handleEmpath);
    socket.on("dietQuyUndertakerInfo", handleUndertaker);

    return () => {
      socket.off("dietQuyWasherwomanInfo", handleWw);
      socket.off("dietQuyLibrarianInfo", handleLib);
      socket.off("dietQuyInvestigatorInfo", handleInv);
      socket.off("dietQuyFortuneTellerResult", handleFt);
      socket.off("dietQuyRavenkeeperResult", handleRk);
      socket.off("dietQuyChefInfo", handleChef);
      socket.off("dietQuyEmpathInfo", handleEmpath);
      socket.off("dietQuyUndertakerInfo", handleUndertaker);
    };
  }, []);

  // Reset states on phase changes
  useEffect(() => {
    if (phase === "day") {
      setSelectedTargetId(null);
      setShowConfirm(false);
      setFtSelectedIds([]);
      setShowFtConfirm(false);
      setHostSelectedIds([]);
      setHostSelectedRole("");
    }
  }, [phase]);

  const isMyNightTurnActive = useMemo(() => {
    if (phase !== "night" || !room) return false;
    return room.nightTurnPlayerId === clientId;
  }, [phase, room]);

  const onPlayerClick = useCallback(
    (playerId: string) => {
      if (!room || room.gameMode !== "diet_quy") return false;

      // Host interactions
      if (isHost && phase === "night") {
        const turnRole = room.nightTurnRole;

        // Washerwoman/Librarian/Investigator target selections
        if (turnRole === "Thợ giặt" || turnRole === "Thủ thư" || turnRole === "Điều tra viên") {
          setHostSelectedIds((prev) => {
            if (prev.includes(playerId)) {
              return prev.filter((id) => id !== playerId);
            }
            if (prev.length < 2) {
              return [...prev, playerId];
            }
            return [prev[1]!, playerId];
          });
          return true;
        }

        // Red Charm selection during Fortune Teller's turn
        if (turnRole === "Thầy bói") {
          socket.emit("dietQuyHostConfirmRedCharm", { roomId, targetId: playerId });
          return true;
        }

        // Mayor redirection target selection
        if (turnRole === "Ác Quỷ") {
          socket.emit("dietQuyHostSelectMayorReplacement", { roomId, replacementId: playerId });
          return true;
        }

        return false;
      }

      // Active player interactions
      if (!isMyNightTurnActive) return false;

      // Fortune Teller selects 2 targets
      if (role === "Thầy bói") {
        setFtSelectedIds((prev) => {
          if (prev.includes(playerId)) {
            return prev.filter((id) => id !== playerId);
          }
          if (prev.length < 2) {
            return [...prev, playerId];
          }
          return [prev[1]!, playerId];
        });
        return true;
      }

      // Monk cannot protect self
      if (role === "Nhà sư" && playerId === clientId) return true;

      // Poisoner, Monk, Imp, Ravenkeeper select 1 target
      setSelectedTargetId(playerId);
      setShowConfirm(true);
      return true;
    },
    [isMyNightTurnActive, role, room, isHost, phase, roomId]
  );

  const confirmAction = useCallback(() => {
    if (!roomId || !selectedTargetId) return;
    socket.emit("dietQuyPlayerAction", { roomId, targetId: selectedTargetId });
    setShowConfirm(false);
  }, [roomId, selectedTargetId]);

  const confirmFtAction = useCallback(() => {
    if (!roomId || ftSelectedIds.length !== 2) return;
    socket.emit("dietQuyPlayerAction", { roomId, targetIds: ftSelectedIds });
    setShowFtConfirm(false);
  }, [roomId, ftSelectedIds]);

  const confirmHostAction = useCallback(() => {
    if (!roomId || hostSelectedIds.length !== 2) return;
    const turnRole = room?.nightTurnRole;

    if (turnRole === "Thợ giặt") {
      socket.emit("dietQuyHostSelectTargets", {
        roomId,
        targetIds: hostSelectedIds,
        townsfolkRole: hostSelectedRole,
      });
    } else if (turnRole === "Thủ thư") {
      socket.emit("dietQuyHostSelectTargets", {
        roomId,
        targetIds: hostSelectedIds,
        minionRole: hostSelectedRole, // Out of standard Outsider, pass role directly
      });
    } else if (turnRole === "Điều tra viên") {
      socket.emit("dietQuyHostSelectTargets", {
        roomId,
        targetIds: hostSelectedIds,
        minionRole: hostSelectedRole,
      });
    }

    setHostSelectedIds([]);
    setHostSelectedRole("");
  }, [roomId, hostSelectedIds, hostSelectedRole, room?.nightTurnRole]);

  // Render Host control panel during night
  const hostPanel = useMemo(() => {
    if (!isHost || phase !== "night" || !room) return null;
    const turnRole = room.nightTurnRole;

    if (turnRole === "Thợ giặt" || turnRole === "Thủ thư" || turnRole === "Điều tra viên") {
      // Pick available roles for dropdown
      let dropdownRoles = ALL_ROLES;
      if (turnRole === "Thợ giặt") dropdownRoles = DIET_QUY_TOWNSFOLK;
      else if (turnRole === "Điều tra viên") dropdownRoles = DIET_QUY_MINIONS;

      const isConfirmDisabled = hostSelectedIds.length !== 2 || !hostSelectedRole;

      return (
        <div style={{
          background: "var(--surface-muted)",
          padding: 16,
          borderRadius: 12,
          border: "2px dashed var(--accent)",
          marginTop: 15,
          color: "#fff"
        }}>
          <h3>Host: Thiết lập thông tin cho {turnRole}</h3>
          <p>Chọn đúng 2 người chơi trên vòng tròn để gửi thông tin:</p>
          <div style={{ margin: "10px 0" }}>
            Đã chọn: <b>{hostSelectedIds.map(id => room.players.find(p => p.id === id)?.name || id).join(", ") || "Chưa chọn"}</b>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10 }}>
            <span>Chọn vai trò tiết lộ:</span>
            <select
              value={hostSelectedRole}
              onChange={(e) => setHostSelectedRole(e.target.value)}
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                background: "#1a1f26",
                color: "#fff",
                border: "1px solid var(--border-strong)"
              }}
            >
              <option value="">-- Chọn vai trò --</option>
              {dropdownRoles.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <button
            onClick={confirmHostAction}
            disabled={isConfirmDisabled}
            style={{
              marginTop: 15,
              padding: "8px 16px",
              background: isConfirmDisabled ? "#555" : "var(--accent)",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              cursor: isConfirmDisabled ? "not-allowed" : "pointer"
            }}
          >
            Xác nhận thông tin
          </button>
        </div>
      );
    }

    if (turnRole === "Thầy bói") {
      return (
        <div style={{
          background: "var(--surface-muted)",
          padding: 12,
          borderRadius: 12,
          border: "1px dashed var(--accent)",
          marginTop: 15,
          color: "#fff"
        }}>
          <h4>Host: Chọn mục tiêu Red Charm (Thầy bói nhận thông tin giả)</h4>
          <p>Click vào 1 người trên vòng tròn để gán Red Charm.</p>
          <p>Hiện tại: <b>{room.dietQuyRedCharmPlayerId ? room.players.find(p => p.id === room.dietQuyRedCharmPlayerId)?.name : "Chưa có"}</b></p>
        </div>
      );
    }

    if (turnRole === "Ác Quỷ") {
      // Find if Imp targeted the Mayor
      const impTargetId = room.dietQuyImpKillPlayerId;
      const isMayorTarget = impTargetId && room.playerRoles?.[impTargetId] === "Thị trưởng" && room.dietQuyPoisonedPlayerId !== impTargetId;

      if (isMayorTarget) {
        return (
          <div style={{
            background: "var(--surface-muted)",
            padding: 16,
            borderRadius: 12,
            border: "2px solid #e74c3c",
            marginTop: 15,
            color: "#fff"
          }}>
            <h3 style={{ color: "#e74c3c" }}>Host: Thị trưởng bị Ác Quỷ nhắm tới!</h3>
            <p>Chọn 1 người chơi thế mạng (Click trên vòng tròn):</p>
            <p>Thế mạng hiện tại: <b>{room.dietQuyMayorReplacementId ? room.players.find(p => p.id === room.dietQuyMayorReplacementId)?.name : "Chưa chọn (Mayor sẽ chết)"}</b></p>
          </div>
        );
      }
    }

    return null;
  }, [isHost, phase, room, hostSelectedIds, hostSelectedRole, confirmHostAction]);

  // Render active player control panel
  const playerPanel = useMemo(() => {
    if (!isMyNightTurnActive || !room) return null;

    if (role === "Thầy bói") {
      const isFtConfirmDisabled = ftSelectedIds.length !== 2;
      return (
        <div style={{
          background: "var(--surface-muted)",
          padding: 12,
          borderRadius: 12,
          border: "1px solid var(--accent)",
          marginTop: 15,
          color: "#fff"
        }}>
          <h3>🔮 Lượt kiểm tra của Thầy bói</h3>
          <p>Chọn đúng 2 người trên vòng tròn để kiểm tra xem có ai là Quỷ không:</p>
          <div style={{ margin: "10px 0" }}>
            Đã chọn: <b>{ftSelectedIds.map(id => room.players.find(p => p.id === id)?.name || id).join(", ") || "Chưa chọn"}</b>
          </div>
          <button
            onClick={() => setShowFtConfirm(true)}
            disabled={isFtConfirmDisabled}
            style={{
              padding: "8px 16px",
              background: isFtConfirmDisabled ? "#555" : "var(--accent)",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              cursor: isFtConfirmDisabled ? "not-allowed" : "pointer"
            }}
          >
            Xác nhận kiểm tra
          </button>
        </div>
      );
    }

    if (role === "Gián điệp") {
      return (
        <div style={{
          background: "var(--surface-muted)",
          padding: 12,
          borderRadius: 12,
          border: "1px solid var(--accent)",
          marginTop: 15,
          color: "#fff"
        }}>
          <h3>👁️ Gián điệp xem thông tin</h3>
          <p>Hãy xem danh sách vai trò hiện tại (tất cả mọi người) trên màn hình của bạn.</p>
          <button
            onClick={() => socket.emit("dietQuyPlayerAction", { roomId, targetId: null })}
            style={{
              marginTop: 10,
              padding: "8px 16px",
              background: "var(--accent)",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              cursor: "pointer"
            }}
          >
            Hoàn tất xem
          </button>
        </div>
      );
    }

    // Default 1-target panels (Poisoner, Monk, Imp, Ravenkeeper)
    let title = "Đêm Diệt Quỷ";
    let desc = "Click chọn 1 người trên vòng tròn để thực hiện kỹ năng.";
    if (role === "Độc thủ") {
      title = "🧪 Độc thủ đầu độc";
      desc = "Chọn 1 người chơi để đầu độc kỹ năng của họ tối nay.";
    } else if (role === "Nhà sư") {
      title = "🛡️ Nhà sư bảo vệ";
      desc = "Chọn 1 người chơi khác để bảo vệ họ khỏi sự tấn công của Ác Quỷ đêm nay.";
    } else if (role === "Ác Quỷ") {
      title = "👿 Ác Quỷ tấn công";
      desc = "Chọn 1 người chơi để tiêu diệt. Tự tiêu diệt bản thân sẽ giúp truyền Quỷ sang Tay sai.";
    } else if (role === "Nuôi quạ") {
      title = "🐦 Nuôi quạ kiểm tra";
      desc = "Bạn đã hy sinh! Chọn 1 người chơi để kiểm tra vai trò thực tế của họ.";
    }

    return (
      <div style={{
        background: "var(--surface-muted)",
        padding: 12,
        borderRadius: 12,
        border: "1px solid var(--accent)",
        marginTop: 15,
        color: "#fff"
      }}>
        <h3>{title}</h3>
        <p>{desc}</p>
      </div>
    );
  }, [isMyNightTurnActive, role, room, ftSelectedIds, roomId]);

  // Confirmation messages
  const confirmMessage = useMemo(() => {
    if (!selectedTargetId || !room) return "";
    const targetName = room.players.find(p => p.id === selectedTargetId)?.name || "Người chơi";
    if (role === "Độc thủ") return `Bạn muốn đầu độc ${targetName} đêm nay?`;
    if (role === "Nhà sư") return `Bạn muốn bảo vệ ${targetName} đêm nay?`;
    if (role === "Ác Quỷ") return `Bạn muốn tiêu diệt ${targetName} đêm nay?`;
    if (role === "Nuôi quạ") return `Bạn muốn kiểm tra vai trò của ${targetName}?`;
    return `Xác nhận hành động lên người chơi ${targetName}?`;
  }, [selectedTargetId, role, room]);

  const panel = (
    <>
      {playerPanel}
      {hostPanel}
      <ConfirmModal
        open={showConfirm && !!selectedTargetId}
        title="Xác nhận hành động"
        message={confirmMessage}
        onConfirm={confirmAction}
        onCancel={() => {
          setShowConfirm(false);
          setSelectedTargetId(null);
        }}
      />
      <ConfirmModal
        open={showFtConfirm}
        title="Xác nhận kiểm tra"
        message="Xác nhận kiểm tra 2 người chơi này?"
        onConfirm={confirmFtAction}
        onCancel={() => setShowFtConfirm(false)}
      />
    </>
  );

  return {
    onPlayerClick,
    panel,
    washerwomanInfo,
    librarianInfo,
    investigatorInfo,
    fortuneTellerResult,
    ravenkeeperResult,
    chefInfo,
    empathInfo,
    undertakerInfo,
    playerPositionsProps: {
      selectedOutlinePlayerId: isMyNightTurnActive && role !== "Thầy bói" ? selectedTargetId : null,
      dietQuyOrangeHighlightPlayerIds: isMyNightTurnActive && role === "Thầy bói" ? ftSelectedIds : (isHost && phase === "night" && room?.nightTurnRole === "Thầy bói" && room?.dietQuyRedCharmPlayerId ? [room.dietQuyRedCharmPlayerId] : []),
      dietQuyRedHighlightPlayerIds: isHost && phase === "night" && ["Thợ giặt", "Thủ thư", "Điều tra viên"].includes(room?.nightTurnRole || "") ? hostSelectedIds : (isHost && phase === "night" && room?.nightTurnRole === "Ác Quỷ" && room?.dietQuyMayorReplacementId ? [room.dietQuyMayorReplacementId] : []),
    }
  };
}
