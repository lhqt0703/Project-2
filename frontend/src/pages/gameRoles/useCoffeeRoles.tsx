import { useCallback, useEffect, useMemo, useState } from "react";
import ConfirmModal from "../../components/ConfirmModal";
import { clientId, socket } from "../../socket";
import type { CoffeePrivateStatePayload, GamePhase } from "./socketEvents";

const COFFEE_MAKER_ROLE = "Người pha cà phê";
const COFFEE_HERB_ROLES = new Set(["Linh Chi", "Đông Trùng"]);

export function useCoffeeRoles({
  roomId,
  phase,
  role,
  deadPlayers,
  privateState,
  allNightActionsSimultaneous,
  currentNightTurnRole,
  nightActionDeadline,
  nightActionNow,
}: {
  roomId: string | null;
  phase: GamePhase;
  role: string | null;
  deadPlayers: string[];
  privateState: CoffeePrivateStatePayload;
  allNightActionsSimultaneous: boolean;
  currentNightTurnRole: string | null;
  nightActionDeadline: number | null;
  nightActionNow: number;
}) {
  const [makerTargets, setMakerTargets] = useState<string[]>([]);
  const [herbTarget, setHerbTarget] = useState<string | null>(null);
  const [confirmKind, setConfirmKind] = useState<"maker" | "herb" | null>(null);

  useEffect(() => {
    setMakerTargets([]);
    setHerbTarget(null);
    setConfirmKind(null);
  }, [phase]);

  useEffect(() => {
    if (privateState.makerTargetsTonight) {
      setMakerTargets(privateState.makerTargetsTonight);
    }
    if (privateState.herbTargetTonight) {
      setHerbTarget(privateState.herbTargetTonight);
    }
  }, [privateState.herbTargetTonight, privateState.makerTargetsTonight]);

  const turnIsAvailable = useMemo(() => {
    if (phase !== "night" || !clientId || deadPlayers.includes(clientId)) return false;
    if (allNightActionsSimultaneous) {
      return !nightActionDeadline || nightActionNow < nightActionDeadline;
    }
    return currentNightTurnRole === role;
  }, [allNightActionsSimultaneous, currentNightTurnRole, deadPlayers, nightActionDeadline, nightActionNow, phase, role]);

  const canMakerAct = turnIsAvailable
    && role === COFFEE_MAKER_ROLE
    && !privateState.makerTargetsTonight
    && !privateState.makerFoundBoth
    && (privateState.makerMaxUses === 0 || privateState.makerUsesUsed < privateState.makerMaxUses);

  const canHerbAct = turnIsAvailable
    && COFFEE_HERB_ROLES.has(role || "")
    && !privateState.herbTargetTonight
    && !privateState.herbFoundMaker;

  const onPlayerClick = useCallback((playerId: string) => {
    if (!canMakerAct && !canHerbAct) return false;
    if (playerId === clientId) return true;

    if (canMakerAct) {
      setMakerTargets((previous) => {
        const next = previous.includes(playerId)
          ? previous.filter((id) => id !== playerId)
          : previous.length < 2
            ? [...previous, playerId]
            : [previous[1]!, playerId];
        setConfirmKind(next.length === 2 ? "maker" : null);
        return next;
      });
      return true;
    }

    setHerbTarget(playerId);
    setConfirmKind("herb");
    return true;
  }, [canHerbAct, canMakerAct]);

  const confirm = useCallback(() => {
    if (!roomId) return;
    if (confirmKind === "maker" && canMakerAct && makerTargets.length === 2) {
      socket.emit("coffeeMakerSearch", { roomId, targetIds: makerTargets });
    } else if (confirmKind === "herb" && canHerbAct && herbTarget) {
      socket.emit("coffeeHerbSearch", { roomId, targetId: herbTarget });
    }
    setConfirmKind(null);
  }, [canHerbAct, canMakerAct, confirmKind, herbTarget, makerTargets, roomId]);

  const modal = (
    <ConfirmModal
      open={confirmKind !== null}
      title="Xác nhận tìm kiếm"
      message={confirmKind === "maker"
        ? "Bạn có chắc chắn muốn kiểm tra hai người chơi này trong cùng đêm không?"
        : `Bạn có chắc chắn muốn kiểm tra người này có phải ${COFFEE_MAKER_ROLE} không?`}
      onConfirm={confirm}
      onCancel={() => setConfirmKind(null)}
    />
  );

  return {
    onPlayerClick,
    modal,
    playerPositionsProps: {
      selectedOutlinePlayerId: phase === "night" && role && COFFEE_HERB_ROLES.has(role)
        ? (herbTarget || privateState.herbTargetTonight)
        : null,
      selectedOutlinePlayerIds: phase === "night" && role === COFFEE_MAKER_ROLE
        ? (privateState.makerTargetsTonight || makerTargets)
        : [],
    },
  };
}
