import { useState, useCallback, useRef, useEffect, createContext, useContext, useMemo } from "react";
import type { GameLogNight, GameLogEntry, EliminationCause } from "../pages/gameRoles/socketEvents";
import { MERCHANT_ITEM_LABELS, type MerchantDecision, type MerchantItemId, type MerchantTradeResult } from "../constants/merchant";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { soundManager } from "../utils/soundManager";

gsap.registerPlugin(useGSAP);
import { ELEMENTAL_BUFF_LABELS, ELEMENTAL_ROLE_SET } from "../constants/elemental";
import { AvifIcon } from "./AvifIcon";
import type { RoomGameRules } from "../context/RoomContext";


type ViewMode = "real-names" | "nick-names" | "real-names-roles" | "nick-names-roles";
const ViewModeContext = createContext<ViewMode>("nick-names");
const RealNamesContext = createContext<Record<string, string>>({});

function getBuffLabel(buffId: string): string {
  return (ELEMENTAL_BUFF_LABELS as Record<string, string>)[buffId] || buffId;
}

type RolesByPlayerId = Record<string, string>;
type PlayerNamesById = Record<string, string>;
type TargetRoleDisplayOrder = "player-role" | "role-player";
type TargetRoleDisplayOrderByPlayerId = Record<string, TargetRoleDisplayOrder>;
type EliminationFocus = {
  night: number;
  targetId: string;
  causes: EliminationCause[];
};

type HighlightPayload = {
  primaryId: string | null;
  secondaryIds?: string[];
  dangerIds?: string[];
};

function filterAndNormalizeNightEntries(
  entries: GameLogEntry[],
  myPlayerId: string | undefined,
  myRole: string | undefined,
  wolves: string[] = [],
  loveState: any = {},
  gameRules: RoomGameRules | undefined
): GameLogEntry[] {
  if (!myPlayerId) return [];

  const isWolf = wolves.includes(myPlayerId);
  const isElemental = ELEMENTAL_ROLE_SET.has(myRole || "");
  const isCupid = myRole === "Thần tình yêu";
  const isLover = loveState?.pairIds?.includes(myPlayerId);

  const filtered: GameLogEntry[] = [];

  for (const entry of entries) {
    if (entry.phase === "day") continue;

    // 1. Mysterious force
    if (entry.type === "mysterious_force_eliminated") {
      filtered.push(entry);
      continue;
    }

    // 2. Angel revive
    if (entry.type === "angel_revive_activated") {
      filtered.push(entry);
      continue;
    }

    // 3. Phe sói
    if (isWolf) {
      if (
        entry.type === "wolf_vote" ||
        entry.type === "wolf_result" ||
        entry.type === "bonus_bite" ||
        entry.type === "ban_soi_aligned" ||
        entry.type === "wild_wolf_conversion"
      ) {
        filtered.push(entry);
        continue;
      }
    }

    // 4. Phe dân làng nguyên tố
    if (isElemental && entry.type === "elemental_buff_vote") {
      filtered.push(entry);
      continue;
    }

    // 5. Thần tình yêu và Cặp đôi
    if (isCupid && entry.type === "love_pair") {
      filtered.push(entry);
      continue;
    }
    if (isLover) {
      if (
        entry.type === "love_pair" ||
        entry.type === "love_escape_vote" ||
        entry.type === "love_escape_missed" ||
        entry.type === "love_escape"
      ) {
        filtered.push(entry);
        continue;
      }
    }

    if (entry.type === "love_link_death") {
      if (myPlayerId && (myPlayerId === entry.targetId || myPlayerId === entry.sourceId)) {
        filtered.push(entry);
      }
      continue;
    }

    if (entry.type === "custom_log") {
      const msg = entry.message || "";
      if (msg.startsWith("__song_trung_guess_wrong__:")) {
        const [_, actorId] = msg.split(":");
        if (myPlayerId === actorId) {
          filtered.push(entry);
        }
        continue;
      }
      if (msg.startsWith("__song_trung_victim_guess_wrong__:")) {
        const [_, actorId] = msg.split(":");
        if (myPlayerId === actorId) {
          filtered.push(entry);
        }
        continue;
      }
    }

    // 6. Tay buôn và Người nhận
    if (myRole === "Tay Buôn" && entry.type === "merchant_trade_offer" && entry.actorId === myPlayerId) {
      filtered.push(entry);
      continue;
    }
    if (entry.type === "merchant_trade_offer" && entry.targetId === myPlayerId) {
      filtered.push(entry);
      continue;
    }
    if (entry.type === "merchant_item_received" && entry.targetId === myPlayerId) {
      const hideItem = gameRules?.merchantHideReceivedItemName === true;
      if (!hideItem) {
        filtered.push(entry);
      }
      continue;
    }
    if (entry.type === "merchant_item_used" && entry.itemId === "poppy-glasses" && entry.actorId === myPlayerId) {
      filtered.push(entry);
      continue;
    }
    if (entry.type === "merchant_item_used" && entry.itemId === "gunpowder-barrel" && entry.sourceId === myPlayerId) {
      const hideItem = gameRules?.merchantHideReceivedItemName === true;
      if (!hideItem) {
        filtered.push(entry);
      }
      continue;
    }

    // 7. Extra time
    if (entry.type === "night_action_extra_time" && entry.targetId === myPlayerId) {
      filtered.push(entry);
      continue;
    }

    // 8. Các hành động đêm khác mà bản thân là actor
    if ("actorId" in entry && entry.actorId === myPlayerId) {
      if (
        entry.type !== "merchant_trade_response" &&
        entry.type !== "merchant_win_condition_completed"
      ) {
        filtered.push(entry);
        continue;
      }
    }
  }

  return filtered;
}

interface GameLogPanelProps {
  nights: GameLogNight[];
  rolesByPlayerId: RolesByPlayerId;
  playerNamesById: PlayerNamesById;
  targetRoleDisplayOrderByPlayerId?: TargetRoleDisplayOrderByPlayerId;
  onHighlightPlayer: (payload: HighlightPayload) => void;
  canViewNightLogs?: boolean;
  isHost?: boolean;
  onAddCustomLog?: (message: string) => void;
  viewMode?: ViewMode;
  onViewModeChange?: (mode: ViewMode) => void;
  playerRealNamesById?: Record<string, string>;
  myPlayerId?: string;
  myRole?: string;
  loveState?: any;
  wolves?: string[];
  wolfBadgeRoles?: Record<string, string>;
  gameRules?: RoomGameRules;
  gameEnded?: boolean;
  isReplay?: boolean;
  isBlindWerewolf?: boolean;
  showAllEntries?: boolean;
}

function getRoleName(playerId: string, rolesByPlayerId: RolesByPlayerId): string {
  return rolesByPlayerId[playerId] || "???";
}

function getPlayerName(playerId: string, playerNamesById: PlayerNamesById): string {
  return playerNamesById[playerId] || playerId.slice(0, 8) + "...";
}

function getRolePlayerText(
  playerId: string,
  rolesByPlayerId: RolesByPlayerId,
  playerNamesById: PlayerNamesById,
  roleOverride?: string | null,
  showRolesOnly?: boolean,
  realNamesById?: Record<string, string>,
  isRealNamesMode?: boolean,
  showRoles?: boolean
): string {
  const roleName = roleOverride || getRoleName(playerId, rolesByPlayerId);
  if (showRolesOnly) return roleName;
  const name = (isRealNamesMode && realNamesById?.[playerId])
    ? realNamesById[playerId]
    : getPlayerName(playerId, playerNamesById);
  return showRoles ? `${name} ${roleName}` : name;
}

function getRolePlayersText(
  playerIds: string[] | undefined,
  rolesByPlayerId: RolesByPlayerId,
  playerNamesById: PlayerNamesById,
  showRolesOnly?: boolean,
  realNamesById?: Record<string, string>,
  isRealNamesMode?: boolean,
  showRoles?: boolean
): string {
  if (!playerIds || playerIds.length === 0) return "(không rõ)";
  return playerIds.map((id) => getRolePlayerText(id, rolesByPlayerId, playerNamesById, null, showRolesOnly, realNamesById, isRealNamesMode, showRoles)).join(", ");
}

function getDefaultTargetRoleDisplayOrder(playerId: string, playerNamesById: PlayerNamesById): TargetRoleDisplayOrder {
  const name = getPlayerName(playerId, playerNamesById).trim();
  const wordCount = name ? name.split(/\s+/).filter(Boolean).length : 0;
  return wordCount >= 2 ? "role-player" : "player-role";
}

function getTargetRoleDisplayOrder(
  playerId: string,
  playerNamesById: PlayerNamesById,
  overrides?: TargetRoleDisplayOrderByPlayerId
): TargetRoleDisplayOrder {
  return overrides?.[playerId] || getDefaultTargetRoleDisplayOrder(playerId, playerNamesById);
}

function getPlayerNamesText(
  playerIds: string[] | undefined,
  playerNamesById: PlayerNamesById,
  rolesByPlayerId?: RolesByPlayerId,
  showRolesOnly?: boolean,
  realNamesById?: Record<string, string>,
  isRealNamesMode?: boolean
): string {
  if (!playerIds || playerIds.length === 0) return "(không ai)";
  return playerIds.map((id) => {
    if (showRolesOnly && rolesByPlayerId) {
      return getRoleName(id, rolesByPlayerId);
    }
    return (isRealNamesMode && realNamesById?.[id]) ? realNamesById[id] : getPlayerName(id, playerNamesById);
  }).join(", ");
}

const ELEMENTAL_BUFF_TARGET_ROLE_BY_ID: Record<string, string | undefined> = {
  "witch-restore-potion": "Phù thủy",
  "guardian-double-protect": "Bảo vệ",
  "seer-check-two": "Tiên tri",
  "hunter-double-shot": "Thợ săn",
  "protector-immortality-permanent": "Hộ nhân",
};

const ELEMENTAL_BUFF_ACTION_BY_ID: Record<string, string | undefined> = {
  "witch-restore-potion": "hồi 1 bình",
  "guardian-double-protect": "bảo vệ 2 người (1 lần)",
  "seer-check-two": "soi 2 người",
  "hunter-double-shot": "bắn 2 phát (không cần chết)",
  "protector-immortality-permanent": "giữ bất tử đến cuối game",
};

function getPlayerIdByRole(rolesByPlayerId: RolesByPlayerId, roleName: string | undefined) {
  if (!roleName) return null;
  return Object.entries(rolesByPlayerId).find(([, role]) => role === roleName)?.[0] || null;
}

function getElementalBuffLogText(
  buffId: string,
  rolesByPlayerId: RolesByPlayerId,
  playerNamesById: PlayerNamesById,
  showRolesOnly?: boolean,
  realNamesById?: Record<string, string>,
  isRealNamesMode?: boolean
) {
  const targetRole = ELEMENTAL_BUFF_TARGET_ROLE_BY_ID[buffId];
  const actionText = ELEMENTAL_BUFF_ACTION_BY_ID[buffId];
  if (!targetRole || !actionText) return getBuffLabel(buffId);

  const targetPlayerId = getPlayerIdByRole(rolesByPlayerId, targetRole);
  const targetText = targetPlayerId
    ? getRolePlayerText(targetPlayerId, rolesByPlayerId, playerNamesById, null, showRolesOnly, realNamesById, isRealNamesMode)
    : targetRole;
  return `${targetText} ${actionText}`;
}

function getMerchantChoiceText(choice: MerchantDecision | null | undefined) {
  if (choice === "up") return "👍🏽";
  if (choice === "down") return "👎🏽";
  return "?";
}

function getMerchantItemText(itemId: MerchantItemId | null | undefined) {
  return itemId ? MERCHANT_ITEM_LABELS[itemId] || itemId : "món đồ";
}

function getMerchantTradeResultText(result: MerchantTradeResult | null | undefined) {
  if (result === "success") return "giao dịch thành công";
  if (result === "failed_wolf") return "giao dịch thất bại, phe sói bị chặn cắn";
  if (result === "failed_villager") return "giao dịch thất bại, mục tiêu bị dính phô mai";
  return "giao dịch thất bại";
}

function getAngelGuessText(guess: string | null | undefined) {
  if (guess === "wolves") return "phe sói";
  if (guess === "villagers") return "phe dân";
  return "không rõ";
}

function getAngelTargetTeamText(team: string | null | undefined) {
  if (team === "wolves") return "phe sói";
  if (team === "villagers") return "phe dân";
  if (team === "third") return "phe 3";
  return "không rõ";
}

function getAngelOutcomeText(entry: Extract<GameLogEntry, { type: "angel_outcome" }>) {
  if (entry.noContest) return "không tính thắng thua vì đoán sai phe";
  if (entry.won) {
    if (entry.targetTeam === "third") return "thắng cùng điều kiện riêng của người được hồi sinh";
    return `thắng cùng ${getAngelTargetTeamText(entry.targetTeam)}`;
  }
  if (entry.targetTeam === "third") return "không thắng vì người được hồi sinh chưa hoàn thành điều kiện riêng";
  return `không thắng vì ${getAngelTargetTeamText(entry.targetTeam)} không thắng ván này`;
}

function isLegacyAngelReviveLog(entry: GameLogEntry) {
  return entry.type === "angel_revive_choice" || entry.type === "angel_revive_revealed";
}

function getEliminationCauseText(
  causes: EliminationCause[] | undefined,
  rolesByPlayerId: RolesByPlayerId,
  playerNamesById: PlayerNamesById,
  showRolesOnly?: boolean,
  realNamesById?: Record<string, string>,
  isRealNamesMode?: boolean
): string {
  if (!causes || causes.length === 0) return "Bị loại";
  const parts = causes.map((cause) => {
    if (cause.type === "wolf") {
      const attackersText = getRolePlayersText(cause.attackerIds, rolesByPlayerId, playerNamesById, showRolesOnly, realNamesById, isRealNamesMode);
      return `Bị ${attackersText} cắn`;
    }
    if (cause.type === "witch_poison") return "Phù thủy quăng bình giết";
    if (cause.type === "merchant_gunpowder") {
      return `Nổ thuốc súng từ ${getRolePlayerText(cause.sourceId, rolesByPlayerId, playerNamesById, null, showRolesOnly, realNamesById, isRealNamesMode)}`;
    }
    if (cause.type === "love_link") {
      return `Chết theo cặp đôi với ${getRolePlayerText(cause.sourceId, rolesByPlayerId, playerNamesById, null, showRolesOnly, realNamesById, isRealNamesMode)}`;
    }
    if (cause.type === "day_vote") {
      const votersText = getPlayerNamesText(cause.voterIds, playerNamesById, rolesByPlayerId, showRolesOnly, realNamesById, isRealNamesMode);
      return `Bị biểu quyết bởi: ${votersText}`;
    }
    if (cause.type === "trial_verdict") {
      const votersText = getPlayerNamesText(cause.voterIds, playerNamesById, rolesByPlayerId, showRolesOnly, realNamesById, isRealNamesMode);
      return `Bị biểu quyết sống/chết bởi: ${votersText}`;
    }
    if (cause.type === "cancer_doctor") {
      return "Thất tình và chết do thả thính nhưng bị Bác sĩ lạnh lùng";
    }
    if (cause.type === "nam_thu_smile") {
      return "Chết do cười";
    }
    if (cause.type === "suy_than_pee") {
      return "Chết do đi đái khi Suy Thận còn sống";
    }
    if (cause.type === "hunter_shot") {
      return "Thợ săn đã bắn trúng";
    }
    if (cause.type === "song_trung_rob") {
      return "Bị Song Trùng cướp vai trò";
    }
    return "Thợ săn đã bắn trúng";
  });
  return parts.join(" và ");
}

function getEliminationSecondaryHighlightIds(causes: EliminationCause[] | undefined): string[] {
  if (!causes || causes.length === 0) return [];
  const wolfCause = causes.find((cause) => cause.type === "wolf");
  if (wolfCause && wolfCause.type === "wolf") return wolfCause.attackerIds;
  const loveCause = causes.find((cause) => cause.type === "love_link");
  return loveCause && loveCause.type === "love_link" ? [loveCause.sourceId] : [];
}

function TimeoutBadge({ message }: { message: string }) {
  const [open, setOpen] = useState(false);
  const badgeRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        popupRef.current && !popupRef.current.contains(e.target as Node) &&
        badgeRef.current && !badgeRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <span style={{ position: "relative", display: "inline-block", marginLeft: 6 }}>
      <button
        ref={badgeRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
        style={{
          border: "none",
          background: "transparent",
          padding: 0,
          cursor: "help",
          fontSize: 14,
          lineHeight: 1,
        }}
        aria-label="Giải thích timeout"
      >
        ⏰
      </button>
      {open && (
        <div
          ref={popupRef}
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: 4,
            background: "var(--surface, #fff)",
            border: "1px solid var(--border, #ccc)",
            borderRadius: 6,
            padding: "6px 10px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
            zIndex: 25,
            whiteSpace: "nowrap",
            fontSize: 13,
          }}
        >
          {message}
        </div>
      )}
    </span>
  );
}

function ActionSpan({
  children,
  tooltipDetail,
  highlightPayload,
  onHighlightPlayer,
}: {
  children: React.ReactNode;
  tooltipDetail?: string;
  highlightPayload: HighlightPayload;
  onHighlightPlayer: (payload: HighlightPayload) => void;
}) {
  const [showPopup, setShowPopup] = useState(false);
  const spanRef = useRef<HTMLSpanElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowPopup(true);
    onHighlightPlayer(highlightPayload);
  }, [highlightPayload, onHighlightPlayer]);

  useEffect(() => {
    if (!showPopup) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        popupRef.current && !popupRef.current.contains(e.target as Node) &&
        spanRef.current && !spanRef.current.contains(e.target as Node)
      ) {
        setShowPopup(false);
        onHighlightPlayer({ primaryId: null, secondaryIds: [], dangerIds: [] });
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showPopup, onHighlightPlayer]);

  return (
    <span style={{ position: "relative", display: "inline-block" }}>
      <span ref={spanRef} onClick={handleClick} style={{ cursor: "pointer" }}>
        {children}
      </span>
      {showPopup && (
        <div
          ref={popupRef}
          className="game-log-tooltip"
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: 4,
            background: "var(--surface, #fff)",
            border: "1px solid var(--border, #ccc)",
            borderRadius: 6,
            padding: "6px 10px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
            zIndex: 25,
            whiteSpace: "pre-line",
            wordBreak: "break-word",
            maxWidth: "min(320px, calc(100vw - 48px))",
            width: "max-content",
            fontSize: 13,
          }}
        >
          {tooltipDetail ? tooltipDetail : "Nhấn ra ngoài để tắt highlight"}
        </div>
      )}
    </span>
  );
}

function RoleSpan({
  playerId,
  rolesByPlayerId,
  playerNamesById,
  tooltipDetail,
  secondaryHighlightIds,
  dangerHighlightIds,
  eliminationFocus,
  dimmed,
  displayMode = "role",
  popupMode = "default",
  roleOverride,
  onEliminationFocusChange,
  onHighlightPlayer,
  showRolesOnly: showRolesOnlyProp,
}: {
  playerId: string;
  rolesByPlayerId: RolesByPlayerId;
  playerNamesById: PlayerNamesById;
  tooltipDetail?: string;
  secondaryHighlightIds?: string[];
  dangerHighlightIds?: string[];
  eliminationFocus?: EliminationFocus;
  dimmed?: boolean;
  displayMode?: "role" | "player" | "player-role" | "role-player";
  popupMode?: "default" | "tooltipOnly" | "none";
  roleOverride?: string | null;
  onEliminationFocusChange?: (focus: EliminationFocus | null) => void;
  onHighlightPlayer: (payload: HighlightPayload) => void;
  showRolesOnly?: boolean;
}) {
  const [showPopup, setShowPopup] = useState(false);
  const spanRef = useRef<HTMLSpanElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  const viewModeContext = useContext(ViewModeContext);
  const realNamesById = useContext(RealNamesContext);

  const viewMode = viewModeContext;
  const isRealNamesMode = viewMode === "real-names" || viewMode === "real-names-roles";
  const showRoles = viewMode === "real-names-roles" || viewMode === "nick-names-roles";
  const showRolesOnly = showRolesOnlyProp ?? false;

  const roleName = roleOverride || getRoleName(playerId, rolesByPlayerId);
  const playerName = (isRealNamesMode && realNamesById[playerId])
    ? realNamesById[playerId]
    : getPlayerName(playerId, playerNamesById);
  const displayText =
    showRolesOnly
      ? roleName
      : !showRoles
        ? playerName
        : displayMode === "player"
          ? playerName
          : displayMode === "player-role"
            ? `${playerName} ${roleName}`
            : displayMode === "role-player"
              ? `${roleName} ${playerName}`
              : roleName;

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowPopup(true);
    onHighlightPlayer({ primaryId: playerId, secondaryIds: secondaryHighlightIds || [], dangerIds: dangerHighlightIds || [] });
    onEliminationFocusChange?.(eliminationFocus || null);
  }, [playerId, secondaryHighlightIds, dangerHighlightIds, eliminationFocus, onHighlightPlayer, onEliminationFocusChange]);

  useEffect(() => {
    if (!showPopup) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const clickedPopup = popupRef.current?.contains(target) ?? false;
      const clickedSpan = spanRef.current?.contains(target) ?? false;
      if (!clickedPopup && !clickedSpan) {
        setShowPopup(false);
        onHighlightPlayer({ primaryId: null, secondaryIds: [], dangerIds: [] });
        onEliminationFocusChange?.(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showPopup, onHighlightPlayer, onEliminationFocusChange]);

  return (
    <span style={{ position: "relative", display: "inline-block" }}>
      <span
        ref={spanRef}
        onClick={handleClick}
        style={{
          cursor: "pointer",
          fontWeight: 600,
          color: "var(--accent, #6c5ce7)",
          textDecorationStyle: "dotted",
          opacity: dimmed ? 0.28 : 1,
          transition: "opacity 280ms ease",
          filter: dimmed ? "blur(4px)" : "none",
        }}
      >
        {displayText}
      </span>
      {showPopup && popupMode !== "none" && (
        <div
          ref={popupRef}
          className="game-log-tooltip"
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: 4,
            background: "var(--surface, #fff)",
            border: "1px solid var(--border, #ccc)",
            borderRadius: 6,
            padding: "6px 10px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
            zIndex: 25,
            whiteSpace: "pre-line",
            wordBreak: "break-word",
            maxWidth: "min(320px, calc(100vw - 48px))",
            width: "max-content",
            fontSize: 13,
          }}
        >
          {popupMode === "tooltipOnly" ? (
            tooltipDetail || "Nhấn ra ngoài để tắt highlight"
          ) : (
            <>
              Người chơi: <strong>{playerName}</strong>
              {tooltipDetail ? <span> | {tooltipDetail}</span> : null}
            </>
          )}
        </div>
      )}
    </span>
  );
}

function RolesListSpan({
  playerIds,
  rolesByPlayerId,
  playerNamesById,
  getTooltipDetail,
  getSecondaryHighlightIds,
  getEliminationFocus,
  getItemDimmed,
  getRoleOverride,
  getDisplayMode,
  displayMode,
  popupMode,
  onEliminationFocusChange,
  onHighlightPlayer,
  showRolesOnly: showRolesOnlyProp,
}: {
  playerIds: string[];
  rolesByPlayerId: RolesByPlayerId;
  playerNamesById: PlayerNamesById;
  getTooltipDetail?: (playerId: string) => string | undefined;
  getSecondaryHighlightIds?: (playerId: string) => string[];
  getEliminationFocus?: (playerId: string) => EliminationFocus | undefined;
  getItemDimmed?: (playerId: string) => boolean;
  getRoleOverride?: (playerId: string) => string | null | undefined;
  getDisplayMode?: (playerId: string) => "role" | "player" | "player-role" | "role-player";
  displayMode?: "role" | "player" | "player-role" | "role-player";
  popupMode?: "default" | "tooltipOnly" | "none";
  onEliminationFocusChange?: (focus: EliminationFocus | null) => void;
  onHighlightPlayer: (payload: HighlightPayload) => void;
  showRolesOnly?: boolean;
}) {
  const showRolesOnly = showRolesOnlyProp ?? false;

  return (
    <>
      {playerIds.map((pid, idx) => (
        <span key={pid}>
          <RoleSpan
            playerId={pid}
            rolesByPlayerId={rolesByPlayerId}
            playerNamesById={playerNamesById}
            tooltipDetail={getTooltipDetail?.(pid)}
            secondaryHighlightIds={getSecondaryHighlightIds?.(pid)}
            eliminationFocus={getEliminationFocus?.(pid)}
            dimmed={getItemDimmed?.(pid)}
            displayMode={getDisplayMode?.(pid) || displayMode}
            popupMode={popupMode}
            roleOverride={getRoleOverride?.(pid)}
            onEliminationFocusChange={onEliminationFocusChange}
            onHighlightPlayer={onHighlightPlayer}
            showRolesOnly={showRolesOnly}
          />
          {idx < playerIds.length - 1 && ", "}
        </span>
      ))}
    </>
  );
}

function LogItem({
  emoji,
  style,
  children,
  hideIcon,
}: {
  emoji: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
  hideIcon?: boolean;
}) {
  return (
    <li className="game-log-item" style={style}>
      {!hideIcon && (
        <span className="game-log-item-icon">
          <AvifIcon name={emoji} />
        </span>
      )}
      <span className="game-log-item-content">{children}</span>
    </li>
  );
}

function LogEntryLine({
  night,
  entry,
  dayVotersByTarget,
  legacyAngelGuessByPair,
  playerOnlyDayLogs,
  rolesByPlayerId,
  playerNamesById,
  targetRoleDisplayOrderByPlayerId,
  eliminationFocus,
  onEliminationFocusChange,
  onHighlightPlayer,
  myPlayerId,
  loveState,
  wolves,
  wolfBadgeRoles,
  gameEnded,
  isHost,
  isBlindWerewolf,
  nightEntries,
  hideIcon,
}: {
  night: number;
  entry: GameLogEntry;
  dayVotersByTarget: Record<string, string[]>;
  legacyAngelGuessByPair: Record<string, string | null | undefined>;
  playerOnlyDayLogs: boolean;
  rolesByPlayerId: RolesByPlayerId;
  playerNamesById: PlayerNamesById;
  targetRoleDisplayOrderByPlayerId?: TargetRoleDisplayOrderByPlayerId;
  eliminationFocus: EliminationFocus | null;
  onEliminationFocusChange: (focus: EliminationFocus | null) => void;
  onHighlightPlayer: (payload: HighlightPayload) => void;
  myPlayerId?: string;
  loveState?: any;
  wolves?: string[];
  wolfBadgeRoles?: Record<string, string>;
  gameEnded?: boolean;
  isHost?: boolean;
  isBlindWerewolf?: boolean;
  nightEntries?: GameLogEntry[];
  hideIcon?: boolean;
}) {
  const viewMode = useContext(ViewModeContext);
  const realNamesById = useContext(RealNamesContext);
  const showRolesOnly = false;
  const isRealNamesMode = viewMode === "real-names" || viewMode === "real-names-roles";
  const showRoles = viewMode === "real-names-roles" || viewMode === "nick-names-roles";
  const isDayPhase = entry.phase === "day";
  const getTargetDisplayMode = (playerId: string) =>
    playerOnlyDayLogs && isDayPhase
      ? "player"
      : getTargetRoleDisplayOrder(playerId, playerNamesById, targetRoleDisplayOrderByPlayerId);
  const getDayLogDisplayMode = (displayMode: "role" | "player" | "player-role" | "role-player") =>
    playerOnlyDayLogs && isDayPhase && (displayMode === "player-role" || displayMode === "role-player")
      ? "player"
      : displayMode;
  const getVotersText = (playerIds: string[] | undefined) =>
    isDayPhase
      ? getPlayerNamesText(playerIds, playerNamesById, rolesByPlayerId, showRolesOnly, realNamesById, isRealNamesMode)
      : getRolePlayersText(playerIds, rolesByPlayerId, playerNamesById, showRolesOnly, realNamesById, isRealNamesMode, showRoles);

  const isCauseLineForFocus = (f: EliminationFocus) => {
    const causeTypes = new Set((f.causes || []).map((c) => c.type));
    if (entry.type === "eliminated" && (entry.targetIds || []).includes(f.targetId)) return true;
    if (causeTypes.has("wolf") && entry.type === "wolf_result" && (entry.targetIds || []).includes(f.targetId)) return true;
    if ((causeTypes.has("day_vote") || causeTypes.has("trial_verdict")) && entry.type === "day_result" && entry.targetId === f.targetId) return true;
    if (causeTypes.has("day_vote") && entry.type === "day_vote" && (entry.voteBreakdown || []).some((v) => v.targetId === f.targetId)) return true;
    if (causeTypes.has("trial_verdict") && entry.type === "trial_verdict" && entry.targetId === f.targetId) return true;
    if (causeTypes.has("witch_poison") && entry.type === "witch_poison" && entry.targetId === f.targetId) return true;
    if (causeTypes.has("hunter_shot") && entry.type === "hunter_shot" && entry.targetId === f.targetId) return true;
    if (causeTypes.has("love_link") && entry.type === "love_link_death" && entry.targetId === f.targetId) return true;
    return false;
  };

  const dimmed = !!eliminationFocus && (eliminationFocus.night !== night || !isCauseLineForFocus(eliminationFocus));
  const lineStyle: React.CSSProperties = {
    opacity: dimmed ? 0.28 : 1,
    transition: "opacity 280ms ease",
    filter: dimmed ? "blur(4px)" : "none",
  };

  if (isBlindWerewolf && !isHost && !gameEnded && entry.phase === "night" && "actorId" in entry) {
    const actorId = (entry as any).actorId;
    if (actorId === myPlayerId) {
      const targetId = (entry as any).targetId ||
        ((entry as any).targetIds && (entry as any).targetIds[0]) ||
        (entry.type === "soi_mu_wolf_suicide" ? actorId : null);
      if (targetId) {
        return (
          <LogItem emoji="👤" style={lineStyle} hideIcon={hideIcon}>
            Bạn đã chọn{" "}
            <RoleSpan
              playerId={targetId}
              rolesByPlayerId={rolesByPlayerId}
              playerNamesById={playerNamesById}
              displayMode={getTargetDisplayMode(targetId)}
              popupMode="none"
              secondaryHighlightIds={[actorId]}
              onEliminationFocusChange={onEliminationFocusChange}
              onHighlightPlayer={onHighlightPlayer}
            />
          </LogItem>
        );
      }
    }
  }

  switch (entry.type) {
    case "wolf_vote": {
      const isPlayerView = !isHost && !gameEnded;
      if (isPlayerView && myPlayerId && wolves && wolves.includes(myPlayerId)) {
        const lines: React.ReactNode[] = [];
        const renderWolfVotersList = (voterIds: string[]) => {
          return (
            <RolesListSpan
              playerIds={voterIds}
              rolesByPlayerId={rolesByPlayerId}
              playerNamesById={playerNamesById}
              getRoleOverride={(pid) => wolfBadgeRoles?.[pid] || rolesByPlayerId[pid]}
              displayMode="role-player"
              onHighlightPlayer={onHighlightPlayer}
            />
          );
        };
        (entry.voteBreakdown || []).forEach((v) => {
          const hasMe = v.voterIds.includes(myPlayerId);
          if (hasMe) {
            lines.push(
              <div key={`me-${v.targetId}`} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span>bạn nhắm đến:</span>{" "}
                <RoleSpan
                  playerId={v.targetId}
                  rolesByPlayerId={rolesByPlayerId}
                  playerNamesById={playerNamesById}
                  displayMode={getTargetDisplayMode(v.targetId)}
                  onHighlightPlayer={onHighlightPlayer}
                />
              </div>
            );
            const others = v.voterIds.filter(id => id !== myPlayerId);
            if (others.length > 0) {
              lines.push(
                <div key={`others-co-${v.targetId}`} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  {renderWolfVotersList(others)} nhắm đến:{" "}
                  <RoleSpan
                    playerId={v.targetId}
                    rolesByPlayerId={rolesByPlayerId}
                    playerNamesById={playerNamesById}
                    displayMode={getTargetDisplayMode(v.targetId)}
                    onHighlightPlayer={onHighlightPlayer}
                  />
                </div>
              );
            }
          } else {
            lines.push(
              <div key={`others-${v.targetId}`} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                {renderWolfVotersList(v.voterIds)} nhắm đến:{" "}
                <RoleSpan
                  playerId={v.targetId}
                  rolesByPlayerId={rolesByPlayerId}
                  playerNamesById={playerNamesById}
                  displayMode={getTargetDisplayMode(v.targetId)}
                  onHighlightPlayer={onHighlightPlayer}
                />
              </div>
            );
          }
        });

        if (lines.length === 0) {
          return <LogItem emoji="🐺" style={lineStyle}>Các sói nhắm đến: (không ai cả)</LogItem>;
        }
        return (
          <LogItem emoji="🐺" style={lineStyle}>
            <div style={{ display: "grid", gap: 4 }}>
              {lines}
            </div>
          </LogItem>
        );
      }

      if (!entry.voteBreakdown || entry.voteBreakdown.length === 0) {
        return <LogItem emoji="🐺" style={lineStyle}>Các sói nhắm đến: (không ai cả)</LogItem>;
      }
      return (
        <LogItem emoji="🐺" style={lineStyle}>
          Các sói nhắm đến:{" "}
          {entry.voteBreakdown.map((v, idx) => {
            const selectedByText = `Bị chọn bởi: ${getRolePlayersText(v.voterIds, rolesByPlayerId, playerNamesById, showRolesOnly, realNamesById, isRealNamesMode, showRoles)}`;
            return (
              <span key={v.targetId}>
                <RoleSpan
                  playerId={v.targetId}
                  rolesByPlayerId={rolesByPlayerId}
                  playerNamesById={playerNamesById}
                  tooltipDetail={selectedByText}
                  secondaryHighlightIds={v.voterIds}
                  displayMode={getTargetDisplayMode(v.targetId)}
                  popupMode="tooltipOnly"
                  onEliminationFocusChange={onEliminationFocusChange}
                  onHighlightPlayer={onHighlightPlayer}
                />
                {idx < entry.voteBreakdown.length - 1 && ", "}
              </span>
            );
          })}
        </LogItem>
      );
    }

    case "day_vote":
      if (!entry.voteBreakdown || entry.voteBreakdown.length === 0) {
        return <LogItem emoji="🗳️" style={lineStyle}>Biểu quyết đã được bỏ qua</LogItem>;
      }
      return (
        <LogItem emoji="🗳️" style={lineStyle}>
          Người bị nghi ngờ:{" "}
          {entry.voteBreakdown.map((v, idx) => {
            const selectedByText = `Bị vote bởi: ${getVotersText(v.voterIds)}`;
            return (
              <span key={v.targetId}>
                <RoleSpan
                  playerId={v.targetId}
                  rolesByPlayerId={rolesByPlayerId}
                  playerNamesById={playerNamesById}
                  tooltipDetail={selectedByText}
                  secondaryHighlightIds={v.voterIds}
                  displayMode={getTargetDisplayMode(v.targetId)}
                  popupMode="tooltipOnly"
                  onEliminationFocusChange={onEliminationFocusChange}
                  onHighlightPlayer={onHighlightPlayer}
                />
                {idx < entry.voteBreakdown.length - 1 && ", "}
              </span>
            );
          })}
        </LogItem>
      );

    case "day_vote_skipped":
      return <LogItem emoji="🗳️" style={lineStyle}>Biểu quyết đã được bỏ qua</LogItem>;

    case "wolf_result":
      if (!entry.targetIds || entry.targetIds.length === 0) {
        return <LogItem emoji="🐺" style={lineStyle}>Các sói không thống nhất được sẽ cắn ai</LogItem>;
      }
      {
        const isPlayerView = !isHost && !gameEnded;
        const targetIdsToRender = isPlayerView
          ? entry.targetIds.filter(id => !(entry.villageChiefDelayedTargetIds || []).includes(id))
          : entry.targetIds;

        if (targetIdsToRender.length === 0) return null;

        const renderTargetList = (playerIds: string[]) => (
          <RolesListSpan
            playerIds={playerIds}
            rolesByPlayerId={rolesByPlayerId}
            playerNamesById={playerNamesById}
            getTooltipDetail={isPlayerView ? undefined : (pid) => {
              const selectedBy = entry.selectedByByTarget?.[pid] || [];
              if (!selectedBy.length) return undefined;
              return `Bị chọn bởi: ${getRolePlayersText(selectedBy, rolesByPlayerId, playerNamesById, showRolesOnly, realNamesById, isRealNamesMode, showRoles)}`;
            }}
            getSecondaryHighlightIds={isPlayerView ? undefined : (pid) => entry.selectedByByTarget?.[pid] || []}
            getDisplayMode={isPlayerView ? () => "player" : getTargetDisplayMode}
            popupMode={isPlayerView ? "none" : "tooltipOnly"}
            onEliminationFocusChange={onEliminationFocusChange}
            onHighlightPlayer={onHighlightPlayer}
          />
        );

        if (isPlayerView) {
          return (
            <LogItem emoji="🩸" style={lineStyle}>
              {renderTargetList(targetIdsToRender)}
              {" đã bị cắn"}
            </LogItem>
          );
        }

        const villageChiefDelayedIds = (entry.villageChiefDelayedTargetIds || []).filter((pid) => entry.targetIds.includes(pid));
        const villageChiefDelayedSet = new Set(villageChiefDelayedIds);
        const normalTargetIds = entry.targetIds.filter((pid) => !villageChiefDelayedSet.has(pid));

        return (
          <LogItem emoji="🩸" style={lineStyle}>
            {normalTargetIds.length > 0 && (
              <>
                {renderTargetList(normalTargetIds)}
                {" đã bị cắn"}
              </>
            )}
            {normalTargetIds.length > 0 && villageChiefDelayedIds.length > 0 ? "; " : null}
            {villageChiefDelayedIds.map((pid, idx) => (
              <span key={pid}>
                <RoleSpan
                  playerId={pid}
                  rolesByPlayerId={rolesByPlayerId}
                  playerNamesById={playerNamesById}
                  secondaryHighlightIds={entry.selectedByByTarget?.[pid] || []}
                  displayMode={getTargetDisplayMode(pid)}
                  popupMode="none"
                  onEliminationFocusChange={onEliminationFocusChange}
                  onHighlightPlayer={onHighlightPlayer}
                />
                {" đã bị cắn và chỉ còn cầm cự được đến đêm sau"}
                {idx < villageChiefDelayedIds.length - 1 ? "; " : null}
              </span>
            ))}
          </LogItem>
        );
      }

    case "day_result":
      if (!entry.targetId) {
        return <LogItem emoji="⚖️" style={lineStyle}>Kết quả biểu quyết: hòa phiếu / không ai lên giàn</LogItem>;
      }
      {
        const voterIds = dayVotersByTarget[entry.targetId] || [];
        const tooltipDetail = voterIds.length ? `Bị vote bởi: ${getVotersText(voterIds)}` : undefined;
        return (
          <LogItem emoji="⚖️" style={lineStyle}>
            Kết quả biểu quyết:{" "}
            <RoleSpan
              playerId={entry.targetId}
              rolesByPlayerId={rolesByPlayerId}
              playerNamesById={playerNamesById}
              tooltipDetail={tooltipDetail}
              secondaryHighlightIds={voterIds}
              displayMode={getTargetDisplayMode(entry.targetId)}
              popupMode="tooltipOnly"
              onEliminationFocusChange={onEliminationFocusChange}
              onHighlightPlayer={onHighlightPlayer}
            />
            {" "}lên giàn
          </LogItem>
        );
      }

    case "trial_started":
      return null;

    case "trial_verdict": {
      const liveVoterIds = entry.liveVoterIds || [];
      const dieVoterIds = entry.dieVoterIds || [];
      const abstainVoterIds = entry.abstainVoterIds || [];
      const liveNamesText = getPlayerNamesText(liveVoterIds, playerNamesById);
      const dieNamesText = getPlayerNamesText(dieVoterIds, playerNamesById);
      const abstainNamesText = getPlayerNamesText(abstainVoterIds, playerNamesById);
      const allVoteTooltip = `Người chơi sống: ${liveNamesText}\nNgười chơi chết: ${dieNamesText}\nNgười chơi bỏ phiếu trống: ${abstainNamesText}`;

      return (
        <LogItem emoji="⚖️" style={lineStyle}>
          <ActionSpan
            highlightPayload={{ primaryId: entry.targetId, secondaryIds: liveVoterIds, dangerIds: dieVoterIds }}
            tooltipDetail={allVoteTooltip}
            onHighlightPlayer={onHighlightPlayer}
          >
            Kết quả cho
          </ActionSpan>{" "}
          {entry.targetId && (
            <RoleSpan
              playerId={entry.targetId}
              rolesByPlayerId={rolesByPlayerId}
              playerNamesById={playerNamesById}
              secondaryHighlightIds={liveVoterIds}
              dangerHighlightIds={dieVoterIds}
              displayMode={getTargetDisplayMode(entry.targetId)}
              popupMode="none"
              onEliminationFocusChange={onEliminationFocusChange}
              onHighlightPlayer={onHighlightPlayer}
            />
          )}:
          {" "}
          <ActionSpan
            highlightPayload={{ primaryId: entry.targetId, secondaryIds: liveVoterIds, dangerIds: dieVoterIds }}
            tooltipDetail={allVoteTooltip}
            onHighlightPlayer={onHighlightPlayer}
          >
            <span style={{ color: entry.executed ? "#e74c3c" : "#27ae60" }}>
              {entry.executed ? "CHẾT" : "SỐNG"}
            </span>
          </ActionSpan>
          {" ("}
          <ActionSpan
            highlightPayload={{ primaryId: null, secondaryIds: liveVoterIds, dangerIds: [] }}
            tooltipDetail={`Người chơi chọn Sống: ${liveNamesText}`}
            onHighlightPlayer={onHighlightPlayer}
          >
            Sống {entry.liveVotes}
          </ActionSpan>
          {" - "}
          <ActionSpan
            highlightPayload={{ primaryId: null, secondaryIds: [], dangerIds: dieVoterIds }}
            tooltipDetail={`Người chơi chọn Chết: ${dieNamesText}`}
            onHighlightPlayer={onHighlightPlayer}
          >
            Chết {entry.dieVotes}
          </ActionSpan>
          {" - "}
          <ActionSpan
            highlightPayload={{ primaryId: null, secondaryIds: [], dangerIds: [] }}
            tooltipDetail={`Người chơi bỏ phiếu trống: ${abstainNamesText}`}
            onHighlightPlayer={onHighlightPlayer}
          >
            Trống {entry.abstainVotes ?? abstainVoterIds.length}
          </ActionSpan>
          {")"}
        </LogItem>
      );
    }

    case "bonus_bite":
      return <LogItem emoji="⚠️" style={{ ...lineStyle, fontStyle: "italic" }}>Đêm nay Sói được cắn 2 người (do Sói con đã chết)</LogItem>;

    case "night_action_extra_time":
      return (
        <LogItem emoji="⏰" style={lineStyle}>
          <RoleSpan
            playerId={entry.targetId}
            rolesByPlayerId={rolesByPlayerId}
            playerNamesById={playerNamesById}
            displayMode={getDayLogDisplayMode("role-player")}
            popupMode="none"
            roleOverride={entry.roleName}
            onEliminationFocusChange={onEliminationFocusChange}
            onHighlightPlayer={onHighlightPlayer}
          />{" "}
          đã được quản trò cộng thêm thời gian hành động
          {entry.extraSeconds ? <span style={{ opacity: 0.72 }}> (+{entry.extraSeconds}s)</span> : null}
        </LogItem>
      );

    case "guardian_protect": {
      const isPlayerActor = !isHost && !gameEnded && myPlayerId && entry.actorId === myPlayerId;
      if (entry.actorId && entry.targetId && entry.actorId === entry.targetId) {
        return (
          <LogItem emoji="🛡️" style={lineStyle}>
            {isPlayerActor ? "Đã" : <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />} tự bảo vệ bản thân
          </LogItem>
        );
      }
      return (
        <LogItem emoji="🛡️" style={lineStyle}>
          {isPlayerActor ? "Đã" : (entry.actorId ? <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={entry.targetId ? [entry.targetId] : []} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> : "Bảo vệ")} bảo vệ{" "}
          {entry.targetId && <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode={getTargetDisplayMode(entry.targetId)} popupMode="none" secondaryHighlightIds={entry.actorId ? [entry.actorId] : []} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />}
        </LogItem>
      );
    }

    case "protector_bless": {
      const isPlayerActor = !isHost && !gameEnded && myPlayerId && entry.actorId === myPlayerId;
      return (
        <LogItem emoji="✨" style={lineStyle}>
          {isPlayerActor ? "Đã" : (
            <RoleSpan
              playerId={entry.actorId}
              rolesByPlayerId={rolesByPlayerId}
              playerNamesById={playerNamesById}
              displayMode="player"
              popupMode="none"
              secondaryHighlightIds={[entry.targetId]}
              onEliminationFocusChange={onEliminationFocusChange}
              onHighlightPlayer={onHighlightPlayer}
            />
          )} trao bất tử cho{" "}
          <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode={getTargetDisplayMode(entry.targetId)} popupMode="none" secondaryHighlightIds={[entry.actorId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />
          {entry.permanent ? <span style={{ opacity: 0.75 }}> đến cuối game</span> : null}
        </LogItem>
      );
    }

    case "protector_save":
      return (
        <LogItem emoji="✨" style={lineStyle}>
          Bất tử của{" "}
          {entry.actorId ? <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode={getDayLogDisplayMode("player-role")} popupMode="none" secondaryHighlightIds={[entry.targetId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> : "Hộ nhân"}{" "}
          chặn một lần chết lên{" "}
          <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode={getTargetDisplayMode(entry.targetId)} popupMode="none" secondaryHighlightIds={entry.actorId ? [entry.actorId] : []} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />
          {/* {entry.permanent ? <span style={{ opacity: 0.75 }}> (vẫn còn hiệu lực)</span> : null} */}
        </LogItem>
      );

    case "village_chief_revealed":
      return (
        <LogItem emoji="👑" style={lineStyle}>
          <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> lộ diện bản thân là Trưởng Làng và tiếp tục sống
        </LogItem>
      );

    case "village_chief_delayed_death":
      return (
        <LogItem emoji="🥀" style={lineStyle}>
          <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode={getTargetDisplayMode(entry.targetId)} popupMode="none" onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> đã hết máu
        </LogItem>
      );

    case "village_chief_extra_vote_started":
      return (
        <LogItem emoji="👑" style={lineStyle}>
          Trưởng làng{" "}
          <RoleSpan playerId={entry.chiefId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> đã mở thêm một lượt biểu quyết
        </LogItem>
      );

    case "witch_heal": {
      const isPlayerActor = !isHost && !gameEnded && myPlayerId && entry.actorId === myPlayerId;
      return (
        <LogItem emoji="🧪" style={lineStyle}>
          {isPlayerActor ? "Đã" : (entry.actorId ? <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.targetId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> : "Phù thủy")} dùng bình cứu cho{" "}
          {entry.targetId && <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode={getTargetDisplayMode(entry.targetId)} popupMode="none" secondaryHighlightIds={[entry.actorId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />}
        </LogItem>
      );
    }

    case "witch_poison": {
      const isPlayerActor = !isHost && !gameEnded && myPlayerId && entry.actorId === myPlayerId;
      return (
        <LogItem emoji="🧪" style={lineStyle}>
          {isPlayerActor ? "Đã" : (entry.actorId ? <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.targetId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> : "Phù thủy")} dùng bình giết{" "}
          {entry.targetId && <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode={getTargetDisplayMode(entry.targetId)} popupMode="none" secondaryHighlightIds={[entry.actorId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />}
        </LogItem>
      );
    }

    case "coffee_maker_search": {
      const isPlayerActor = !isHost && !gameEnded && myPlayerId === entry.actorId;
      return (
        <LogItem emoji="☕" style={lineStyle}>
          {isPlayerActor ? "Bạn đã chọn" : (
            <>
              <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={entry.targetIds} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> đã chọn
            </>
          )}{" "}
          <RolesListSpan
            playerIds={entry.targetIds}
            rolesByPlayerId={rolesByPlayerId}
            playerNamesById={playerNamesById}
            displayMode="player"
            popupMode="none"
            onEliminationFocusChange={onEliminationFocusChange}
            onHighlightPlayer={onHighlightPlayer}
          />
        </LogItem>
      );
    }

    case "coffee_herb_search": {
      const isPlayerActor = !isHost && !gameEnded && myPlayerId === entry.actorId;
      return (
        <LogItem emoji="🌿" style={lineStyle}>
          {isPlayerActor ? "Bạn đã chọn" : (
            <>
              <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.targetId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> ({entry.herbRole}) đã chọn
            </>
          )}{" "}
          <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.actorId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />
        </LogItem>
      );
    }

    case "seer_check": {
      const isPlayerActor = !isHost && !gameEnded && myPlayerId && entry.actorId === myPlayerId;
      const targetRoleTooltip = `${getPlayerName(entry.targetId, playerNamesById)} là ${getRoleName(entry.targetId, rolesByPlayerId)}`;
      if (entry.blockedByMerchantItem === "invisibility-cloak") {
        return (
          <LogItem emoji="🔮" style={lineStyle}>
            {isPlayerActor ? "Đã" : (entry.actorId ? <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.targetId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> : "Tiên tri")} soi{" "}
            {entry.targetId && <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="tooltipOnly" tooltipDetail={targetRoleTooltip} secondaryHighlightIds={[entry.actorId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />}{" "}
            nhưng {getMerchantItemText(entry.blockedByMerchantItem)} chặn lại khiến kết quả ra{" "}
            <span style={{ fontWeight: 600, color: "#27ae60" }}>Dân</span>
          </LogItem>
        );
      }
      return (
        <LogItem emoji="🔮" style={lineStyle}>
          {isPlayerActor ? "Đã" : (entry.actorId ? <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.targetId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> : "Tiên tri")} soi{" "}
          {entry.targetId && <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="tooltipOnly" tooltipDetail={targetRoleTooltip} secondaryHighlightIds={[entry.actorId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />}
          {" ra "}
          <span style={{ fontWeight: 600, color: entry.isWolf ? "#e74c3c" : "#27ae60" }}>
            {entry.isWolf ? "Sói" : "Dân"}
          </span>
        </LogItem>
      );
    }

    case "hunter_mark": {
      const isPlayerActor = !isHost && !gameEnded && myPlayerId && entry.actorId === myPlayerId;
      return (
        <LogItem emoji="🎯" style={lineStyle}>
          {isPlayerActor ? "Đã" : (entry.actorId ? <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.targetId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> : "Thợ săn")} ghim{" "}
          {entry.targetId && <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode={getTargetDisplayMode(entry.targetId)} popupMode="none" secondaryHighlightIds={[entry.actorId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />}
        </LogItem>
      );
    }

    case "hunter_shot": {
      const isPlayerActor = !isHost && !gameEnded && myPlayerId && entry.actorId === myPlayerId;
      if (entry.blockedByMerchantItem === "iron-armor") {
        return (
          <LogItem emoji="💥" style={lineStyle}>
            {isPlayerActor ? "Đã" : (entry.actorId ? <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.targetId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> : "Thợ săn")} bắn{" "}
            {entry.targetId && <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode={getTargetDisplayMode(entry.targetId)} popupMode="none" secondaryHighlightIds={[entry.actorId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />}{" "}
            nhưng {getMerchantItemText(entry.blockedByMerchantItem)} đã chặn lại viên đạn
          </LogItem>
        );
      }
      return (
        <LogItem emoji="💥" style={lineStyle}>
          {isPlayerActor ? "Đã" : (entry.actorId ? <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.targetId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> : "Thợ săn")} bắn{" "}
          {entry.targetId && <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode={getTargetDisplayMode(entry.targetId)} popupMode="none" secondaryHighlightIds={[entry.actorId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />}
        </LogItem>
      );
    }

    case "cursed_sniff": {
      const blockedIds = entry.blockedByMintPlayerIds || [];
      if (blockedIds.length > 0 && !entry.hasWolf) {
        return (
          <LogItem emoji="🐺" style={lineStyle}>
            <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.targetId, ...blockedIds]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> không ngửi thấy mùi sói xung quanh{" "}
            <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.actorId, ...blockedIds]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> do{" "}
            <RolesListSpan playerIds={blockedIds} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode={getDayLogDisplayMode("player-role")} popupMode="none" onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> đã có {getMerchantItemText("mint")} chặn lại mùi
          </LogItem>
        );
      }
      return (
        <LogItem emoji="🐺" style={lineStyle}>
          <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.targetId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> đánh hơi quanh{" "}
          <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.actorId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> và{" "}
          <span style={{ fontWeight: 700, color: entry.hasWolf ? "#e74c3c" : "#27ae60" }}>{entry.hasWolf ? "thấy có mùi sói" : "không thấy có mùi sói"}</span>
        </LogItem>
      );
    }

    case "merchant_trade_offer": {
      const isPlayerView = !isHost && !gameEnded;
      if (isPlayerView && myPlayerId) {
        if (myPlayerId === entry.actorId) {
          return (
            <LogItem emoji="🫴🏽" style={lineStyle}>
              Bạn đã đề nghị giao dịch với{" "}
              <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.actorId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />
            </LogItem>
          );
        }
        if (myPlayerId === entry.targetId) {
          return (
            <LogItem emoji="🫴🏽" style={lineStyle}>
              Tay Buôn đã đề nghị giao dịch với bạn
            </LogItem>
          );
        }
      }
      return (
        <LogItem emoji="🫴🏽" style={lineStyle}>
          <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.targetId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> đề nghị giao dịch với{" "}
          <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode={getTargetDisplayMode(entry.targetId)} popupMode="none" secondaryHighlightIds={[entry.actorId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />: {getMerchantItemText(entry.itemId)} / {getMerchantChoiceText(entry.merchantChoice)}
        </LogItem>
      );
    }

    case "merchant_trade_response":
      return (
        <LogItem emoji="🫱🏾‍🫲🏽" style={lineStyle}>
          <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode={getTargetDisplayMode(entry.targetId)} popupMode="none" secondaryHighlightIds={[entry.actorId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> phản hồi {getMerchantChoiceText(entry.targetChoice)} với giao dịch {getMerchantItemText(entry.itemId)} của{" "}
          <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.targetId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> ({getMerchantChoiceText(entry.merchantChoice)}) - {getMerchantTradeResultText(entry.result)}
        </LogItem>
      );

    case "merchant_item_received": {
      const isPlayerView = !isHost && !gameEnded;
      if (isPlayerView && myPlayerId && myPlayerId === entry.targetId) {
        return (
          <LogItem emoji="📦" style={lineStyle}>
            Đã nhận {getMerchantItemText(entry.itemId)}
            <span style={{ opacity: 0.72 }}> (hiệu lực đêm {entry.appliesNight})</span>
          </LogItem>
        );
      }
      return (
        <LogItem emoji="📦" style={lineStyle}>
          <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode={getTargetDisplayMode(entry.targetId)} popupMode="none" onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> nhận {getMerchantItemText(entry.itemId)}
          <span style={{ opacity: 0.72 }}> (hiệu lực đêm {entry.appliesNight})</span>
        </LogItem>
      );
    }

    case "merchant_item_expired":
      return (
        null
      );

    case "merchant_item_used": {
      const isPlayerView = !isHost && !gameEnded;
      if (entry.itemId === "poppy-glasses" && entry.actorId && entry.targetId) {
        if (isPlayerView && myPlayerId && myPlayerId === entry.actorId) {
          return (
            <LogItem emoji="✨" style={lineStyle}>
              Bạn đã thấy{" "}
              <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.actorId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> được bảo vệ
            </LogItem>
          );
        }
        return (
          <LogItem emoji="✨" style={lineStyle}>
            <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.targetId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> đã thấy{" "}
            <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode={getTargetDisplayMode(entry.targetId)} popupMode="none" secondaryHighlightIds={[entry.actorId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> được bảo vệ {/* thông qua {getMerchantItemText(entry.itemId)} */}
          </LogItem>
        );
      }
      if (entry.itemId === "gunpowder-barrel" && entry.sourceId) {
        if (isPlayerView && myPlayerId && myPlayerId === entry.sourceId) {
          return (
            <LogItem emoji="✨" style={lineStyle}>
              Thùng thuốc súng đã phát nổ
            </LogItem>
          );
        }
        return (
          <LogItem emoji="✨" style={lineStyle}>
            {getMerchantItemText(entry.itemId)} trên{" "}
            <RoleSpan playerId={entry.sourceId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode={getDayLogDisplayMode("player-role")} popupMode="none" secondaryHighlightIds={entry.targetIds || []} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> phát nổ
            {entry.targetIds?.length ? (
              <>
                {" "}khiến{" "}
                <RolesListSpan playerIds={entry.targetIds} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} getDisplayMode={getTargetDisplayMode} popupMode="none" onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> chết chùm chung theo
              </>
            ) : null}
          </LogItem>
        );
      }
      if (entry.itemId === "moth-cocoon" && entry.targetId) {
        return (
          <LogItem emoji="✨" style={lineStyle}>
            Bướm đêm đã kéo dài hiệu lực hoa bảo vệ lên{" "}
            <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode={getTargetDisplayMode(entry.targetId)} popupMode="none" onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> thêm đêm nay
          </LogItem>
        );
      }
      return null;
    }

    case "merchant_win_condition_completed":
      return (
        <LogItem emoji="🏆" style={lineStyle}>
          <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode={getDayLogDisplayMode("player-role")} popupMode="none" onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> đã hoàn thành điều kiện thắng của Tay Buôn với {entry.successfulTrades} giao dịch thành công
          <span style={{ opacity: 0.72 }}> (mốc {entry.requiredTrades})</span>
          <span style={{ opacity: 0.72 }}> (ván chơi vẫn tiếp tục)</span>
        </LogItem>
      );

    case "angel_revive_choice":
      return null;

    case "angel_revive_revealed":
      return null;

    case "angel_revive_activated":
      {
        const isPlayerView = !isHost && !gameEnded;
        const legacyGuess = legacyAngelGuessByPair[`${entry.actorId}:${entry.targetId}`];
        const resolvedGuess = entry.guess ?? legacyGuess;
        if (isPlayerView) {
          return (
            <LogItem emoji="🪽" style={lineStyle}>
              Đã quyết định theo {getAngelGuessText(resolvedGuess)} và hồi sinh{" "}
              <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.actorId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />
            </LogItem>
          );
        }
        return (
          <LogItem emoji="🪽" style={lineStyle}>
            Thiên sứ{" "}
            <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.targetId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />{" "}
            quyết định theo {getAngelGuessText(resolvedGuess)} và hồi sinh{" "}
            <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.actorId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />
          </LogItem>
        );
      }

    case "angel_outcome": // kiểm tra lại cái này❓
      return (
        <LogItem emoji="🌟" style={lineStyle}>
          <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode={getDayLogDisplayMode("player-role")} popupMode="none" secondaryHighlightIds={[entry.targetId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> {getAngelOutcomeText(entry)} với lựa chọn hồi sinh{" "}
          <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode={getTargetDisplayMode(entry.targetId)} popupMode="none" secondaryHighlightIds={[entry.actorId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />
        </LogItem>
      );

    case "love_pair": {
      const isPlayerView = !isHost && !gameEnded;
      if (isPlayerView && myPlayerId) {
        if (myPlayerId === entry.actorId) {
          return (
            <LogItem emoji="💖" style={lineStyle}>
              Đã bắn tên vào{" "}
              <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player-role" popupMode="none" secondaryHighlightIds={[entry.actorId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />
              {entry.targetWolfAligned ? (
                <ActionSpan
                  highlightPayload={{ primaryId: null }}
                  tooltipDetail="sẽ có thể thể thắng riêng khi cả hai còn sống đến khi trong làng chỉ còn lại x người khác"
                  onHighlightPlayer={onHighlightPlayer}
                >
                  <span style={{ opacity: 0.75, cursor: "pointer", textDecoration: "underline dotted" }}>{/* tình yêu trắc trở */}</span>
                </ActionSpan>
              ) : null}
            </LogItem>
          );
        }
        if (myPlayerId === entry.targetId) {
          return (
            <LogItem emoji="💖" style={lineStyle}>
              <strong>*pặc~*</strong>
            </LogItem>
          );
        }
      }
      return (
        <LogItem emoji="💖" style={lineStyle}>
          <RoleSpan
            playerId={entry.actorId}
            rolesByPlayerId={rolesByPlayerId}
            playerNamesById={playerNamesById}
            displayMode="player"
            popupMode="none"
            secondaryHighlightIds={[entry.targetId]}
            onEliminationFocusChange={onEliminationFocusChange}
            onHighlightPlayer={onHighlightPlayer}
          />{" "}ghép đôi với{" "}
          <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode={getTargetDisplayMode(entry.targetId)} popupMode="none" secondaryHighlightIds={[entry.actorId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />
          {entry.targetWolfAligned ? (
            <ActionSpan
              highlightPayload={{ primaryId: null }}
              tooltipDetail="sẽ có thể thể thắng riêng khi cả hai còn sống đến khi trong làng chỉ còn lại x người khác"
              onHighlightPlayer={onHighlightPlayer}
            >
              <span style={{ opacity: 0.75, cursor: "pointer", textDecoration: "underline dotted" }}> - tình yêu sóng gió</span>
            </ActionSpan>
          ) : null}
        </LogItem>
      );
    }

    case "love_escape_vote": {
      const isPlayerView = !isHost && !gameEnded;
      if (isPlayerView && myPlayerId) {
        if (myPlayerId === entry.actorId) {
          return (
            <LogItem emoji="🕊️" style={lineStyle}>
              Bạn muốn ra khỏi làng, đang chờ{" "}
              <RoleSpan playerId={entry.partnerId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.actorId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />{" "} phản hồi
            </LogItem>
          );
        }
        if (myPlayerId === entry.partnerId) {
          return (
            <LogItem emoji="🕊️" style={lineStyle}>
              <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.partnerId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />{" "}
              muốn ra khỏi làng, đang chờ bạn phản hồi
            </LogItem>
          );
        }
      }
      return (
        <LogItem emoji="🕊️" style={lineStyle}>
          <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.partnerId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> muốn ra khỏi làng, đang chờ{" "}
          <RoleSpan playerId={entry.partnerId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.actorId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />{" "} phản hồi
        </LogItem>
      );
    }

    case "love_escape_missed": {
      const isPlayerView = !isHost && !gameEnded;
      if (isPlayerView && myPlayerId) {
        if (myPlayerId === entry.partnerId) {
          return (
            <LogItem emoji="🕊️" style={lineStyle}>
              bạn không đồng ý ra khỏi làng
            </LogItem>
          );
        }
        if (myPlayerId === entry.actorId) {
          return (
            <LogItem emoji="🕊️" style={lineStyle}>
              <RoleSpan playerId={entry.partnerId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.actorId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> không đồng ý ra khỏi làng
            </LogItem>
          );
        }
      }
      return (
        <LogItem emoji="🕊️" style={lineStyle}>
          <RoleSpan playerId={entry.partnerId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.actorId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> không đồng ý ra khỏi làng
        </LogItem>
      );
    }

    case "love_escape":
      {
        const isPlayerView = !isHost && !gameEnded;
        const pairNames = (entry.targetIds || []).map((id) => showRolesOnly ? getRoleName(id, rolesByPlayerId) : ((isRealNamesMode && realNamesById[id]) ? realNamesById[id] : getPlayerName(id, playerNamesById))).join(" và ") || "(không ai)";
        if (isPlayerView && myPlayerId && loveState?.pairIds?.includes(myPlayerId)) {
          return (
            <LogItem emoji="🕊️" style={lineStyle}>
              Đã cùng nhau ra khỏi làng
            </LogItem>
          );
        }
        return (
          <LogItem emoji="🕊️" style={lineStyle}>
            <ActionSpan
              highlightPayload={{ primaryId: null, secondaryIds: entry.targetIds || [], dangerIds: [] }}
              tooltipDetail={pairNames}
              onHighlightPlayer={onHighlightPlayer}
            >
              Cặp đôi
            </ActionSpan>{" "}đã cùng nhau ra khỏi làng
          </LogItem>
        );
      }

    case "love_link_death": {
      const hasAccess = !!(
        isHost ||
        gameEnded ||
        (myPlayerId && (myPlayerId === entry.targetId || myPlayerId === entry.sourceId))
      );

      if (!hasAccess) {
        return null;
      }

      return (
        <LogItem emoji="💔" style={lineStyle}>
          <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.sourceId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> chết theo vì{" "}
          <RoleSpan playerId={entry.sourceId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.targetId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> đã chết
        </LogItem>
      );
    }

    case "spirit_wolf_decision": {
      const isPlayerView = !isHost && !gameEnded;
      if (isPlayerView && myPlayerId) {
        return (
          <LogItem emoji="🐺" style={lineStyle}>
            Đã quyết định: <span style={{ fontWeight: 600 }}>{entry.saved ? "CỨU" : "KHÔNG CỨU"}</span>
          </LogItem>
        );
      }
      return (
        <LogItem emoji="🐺" style={lineStyle}>
          {entry.actorId ? <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode={getDayLogDisplayMode("player-role")} popupMode="none" onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> : "Linh sói"} quyết định: <span style={{ fontWeight: 600 }}>{entry.saved ? "CỨU" : "KHÔNG CỨU"}</span>
          {entry.timedOut ? (
            <TimeoutBadge message="Quá thời gian chờ thực hiện hành động" />
          ) : null}
        </LogItem>
      );
    }

    case "ban_soi_aligned": {
      if (!isHost && !gameEnded) {
        return null;
      }
      return (
        <LogItem emoji="🦠" style={lineStyle}>
          <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode={getTargetDisplayMode(entry.targetId)} popupMode="none" onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> đã trở thành sói
        </LogItem>
      );
    }

    case "wild_wolf_conversion":
      if (!entry.targetId || entry.reason === "no_target") {
        return (
          <LogItem emoji="🦠" style={lineStyle}>
            {entry.actorId ? (
              <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={entry.targetId ? [entry.targetId] : []} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />
            ) : "Sói Dại"}{" "}
            không thể lây nhiễm
            {entry.targetId ? (
              <>
                {" "}do{" "}
                <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={entry.actorId ? [entry.actorId] : []} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />
              </>
            ) : null}{" "}
            không có vết cắn
          </LogItem>
        );
      }
      if (entry.success) {
        return (
          <LogItem emoji="🦠" style={lineStyle}>
            <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} secondaryHighlightIds={entry.actorId ? [entry.actorId] : []} displayMode={getTargetDisplayMode(entry.targetId)} popupMode="none" roleOverride={entry.previousTargetRole} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />{" "}
            đã bị lây dại từ{" "}
            {entry.actorId ? (
              <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.targetId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />
            ) : "Sói Dại"}{" "}
            và trở thành sói
          </LogItem>
        );
      }
      return (
        <LogItem emoji="🦠" style={lineStyle}>
          {entry.actorId ? (
            <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.targetId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />
          ) : "Sói Dại"}{" "}
          không lây dại được{" "}
          <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} secondaryHighlightIds={entry.actorId ? [entry.actorId] : []} displayMode={getTargetDisplayMode(entry.targetId)} popupMode="none" roleOverride={entry.previousTargetRole} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />
          {" "}vì được cứu khỏi vết cắn, kỹ năng chưa bị tính là đã dùng
        </LogItem>
      );

    case "saved_by_guardian": {
      const isPlayerView = !isHost && !gameEnded;
      const myRole = myPlayerId ? rolesByPlayerId[myPlayerId] : undefined;
      const isGuardian = myRole === "Bảo vệ";

      const customLineStyle: React.CSSProperties = {
        ...lineStyle,
        background: "linear-gradient(45deg, #75f7782b, transparent)",
      };

      if (isPlayerView && isGuardian) {
        return (
          <LogItem emoji="🛡️" style={customLineStyle}>
            Kết giới đã cứu{" "}
            {entry.targetIds && entry.targetIds.length > 0 ? (
              <RolesListSpan
                playerIds={entry.targetIds}
                rolesByPlayerId={rolesByPlayerId}
                playerNamesById={playerNamesById}
                getDisplayMode={getTargetDisplayMode}
                popupMode="none"
                onEliminationFocusChange={onEliminationFocusChange}
                onHighlightPlayer={onHighlightPlayer}
              />
            ) : (
              "(không rõ)"
            )}
            {" "}thành công
          </LogItem>
        );
      }

      return (
        <LogItem emoji="🛡️" style={customLineStyle}>
          Kết giới của{" "}
          {entry.actorId ? (
            <RoleSpan
              playerId={entry.actorId}
              rolesByPlayerId={rolesByPlayerId}
              playerNamesById={playerNamesById}
              displayMode="player"
              popupMode="none"
              onEliminationFocusChange={onEliminationFocusChange}
              onHighlightPlayer={onHighlightPlayer}
            />
          ) : (
            "Bảo vệ"
          )}{" "}
          đã cứu{" "}
          {entry.targetIds && entry.targetIds.length > 0 ? (
            <RolesListSpan
              playerIds={entry.targetIds}
              rolesByPlayerId={rolesByPlayerId}
              playerNamesById={playerNamesById}
              getDisplayMode={getTargetDisplayMode}
              popupMode="none"
              onEliminationFocusChange={onEliminationFocusChange}
              onHighlightPlayer={onHighlightPlayer}
            />
          ) : (
            "(không rõ)"
          )}{" "}
          thành công
        </LogItem>
      );
    }

    case "saved_by_witch":
      return (
        <LogItem emoji="🧪" style={lineStyle}>
          Phù thủy đã cứu{" "}
          {entry.targetIds && entry.targetIds.length > 0 ? (
            <RolesListSpan
              playerIds={entry.targetIds}
              rolesByPlayerId={rolesByPlayerId}
              playerNamesById={playerNamesById}
              getDisplayMode={getTargetDisplayMode}
              popupMode="none"
              onEliminationFocusChange={onEliminationFocusChange}
              onHighlightPlayer={onHighlightPlayer}
            />
          ) : (
            "(không rõ)"
          )}
        </LogItem>
      );

    case "mysterious_force_eliminated":
      return (
        <LogItem emoji="💀" style={lineStyle}>
          <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> đã bị thế lực bí ẩn hốt mất xác
        </LogItem>
      );

    case "eliminated": {
      const hideEliminationDetails = playerOnlyDayLogs;
      const targetIds = entry.targetIds || [];
      const renderEliminatedTarget = (pid: string, idx: number) => {
        const causes = entry.causesByTarget?.[pid] || [];
        const elimFocus: EliminationFocus = {
          night,
          targetId: pid,
          causes,
        };
        const causeText = hideEliminationDetails
          ? ""
          : getEliminationCauseText(causes, rolesByPlayerId, playerNamesById, showRolesOnly, realNamesById, isRealNamesMode);
        const secondaryHighlightIds = hideEliminationDetails ? [] : getEliminationSecondaryHighlightIds(causes);
        return (
          <span key={pid}>
            <RoleSpan
              playerId={pid}
              rolesByPlayerId={rolesByPlayerId}
              playerNamesById={playerNamesById}
              tooltipDetail={undefined}
              secondaryHighlightIds={secondaryHighlightIds}
              displayMode={getTargetDisplayMode(pid)}
              popupMode="none"
              eliminationFocus={elimFocus}
              onEliminationFocusChange={onEliminationFocusChange}
              onHighlightPlayer={onHighlightPlayer}
            />
            {causeText ? <span style={{ opacity: 0.82 }}> ({causeText})</span> : null}
            {idx < targetIds.length - 1 ? ", " : null}
          </span>
        );
      };
      return (
        <LogItem emoji="💀" style={lineStyle}>
          Người chơi bị loại khỏi cuộc chơi: {targetIds.length > 0 ? targetIds.map((pid, idx) => renderEliminatedTarget(pid, idx)) : "(không rõ)"}
        </LogItem>
      );
    }

    case "no_death":
      return <LogItem emoji="🍃" style={lineStyle}>Đêm qua không ai bị loại</LogItem>;

    case "elemental_guess": {
      const isPlayerView = !isHost && !gameEnded;
      const targetRoleTooltip = `${getPlayerName(entry.targetId, playerNamesById)} là ${getRoleName(entry.targetId, rolesByPlayerId)}`;
      if (isPlayerView && myPlayerId && entry.actorId === myPlayerId) {
        return (
          <LogItem emoji="🌪️" style={lineStyle}>
            Đã nghĩ{" "}
            <RoleSpan
              playerId={entry.targetId}
              rolesByPlayerId={rolesByPlayerId}
              playerNamesById={playerNamesById}
              displayMode="player"
              popupMode="none"
              secondaryHighlightIds={[entry.actorId]}
              onEliminationFocusChange={onEliminationFocusChange}
              onHighlightPlayer={onHighlightPlayer}
            />{" cũng là dân làng nguyên tố"}
          </LogItem>
        );
      }
      return (
        <LogItem emoji="🌪️" style={lineStyle}>
          <RoleSpan
            playerId={entry.actorId}
            rolesByPlayerId={rolesByPlayerId}
            playerNamesById={playerNamesById}
            displayMode="player"
            popupMode="none"
            secondaryHighlightIds={[entry.targetId]}
            onEliminationFocusChange={onEliminationFocusChange}
            onHighlightPlayer={onHighlightPlayer}
          />{" nghĩ "}
          <RoleSpan
            playerId={entry.targetId}
            rolesByPlayerId={rolesByPlayerId}
            playerNamesById={playerNamesById}
            displayMode="player"
            popupMode="tooltipOnly"
            tooltipDetail={targetRoleTooltip}
            secondaryHighlightIds={[entry.actorId]}
            onEliminationFocusChange={onEliminationFocusChange}
            onHighlightPlayer={onHighlightPlayer}
          />{" cũng là dân làng nguyên tố"} - {entry.isCorrect ? "✅" : "❌"}{" "}
        </LogItem>
      );
    }

    case "elemental_guess_summary": {
      const correctIds = entry.correctIds || [];
      if (entry.correctCount <= 0) {
        return <LogItem emoji="🌪️" style={lineStyle}>Không dân làng nguyên tố nào chọn đúng</LogItem>;
      }
      return (
        <LogItem emoji="🌪️" style={lineStyle}>
          Có{" "}
          <ActionSpan
            highlightPayload={{ primaryId: null, secondaryIds: correctIds, dangerIds: [] }}
            tooltipDetail={getRolePlayersText(correctIds, rolesByPlayerId, playerNamesById, showRolesOnly, realNamesById, isRealNamesMode)}
            onHighlightPlayer={onHighlightPlayer}
          >
            <span style={{ fontWeight: 600 }}>{entry.correctCount}</span>
          </ActionSpan>{" "}
          dân làng nguyên tố chọn đúng
          {entry.triggeredBuffVote && entry.nextBuffVoteNight ? (
            <span style={{ opacity: 0.75 }}> - mở chọn buff vào đêm {entry.nextBuffVoteNight}</span>
          ) : null}
        </LogItem>
      );
    }

    case "elemental_buff_vote": {
      if (!entry.chosenBuffId || !entry.tier) {
        return <LogItem emoji="⚡" style={lineStyle}>Không hiệu ứng hỗ trợ nào được chọn</LogItem>;
      }
      const chosenVoterIds =
        entry.chosenVoterIds ||
        (entry.voteBreakdown || []).find((v) => v.buffId === entry.chosenBuffId)?.voterIds ||
        [];
      const targetRole = ELEMENTAL_BUFF_TARGET_ROLE_BY_ID[entry.chosenBuffId];
      const targetPlayerId = getPlayerIdByRole(rolesByPlayerId, targetRole);
      const tooltipDetail = `${entry.randomTieBreak ? "Được chọn ngẫu nhiên do hòa phiếu | " : ""}Người chọn hiệu ứng này: ${getRolePlayersText(chosenVoterIds, rolesByPlayerId, playerNamesById, showRolesOnly, realNamesById, isRealNamesMode)}`;
      return (
        <LogItem emoji="⚡" style={lineStyle}>
          Hiệu ứng hỗ trợ từ dân làng nguyên tố:{" "}
          <ActionSpan
            highlightPayload={{ primaryId: targetPlayerId, secondaryIds: chosenVoterIds, dangerIds: [] }}
            tooltipDetail={tooltipDetail}
            onHighlightPlayer={onHighlightPlayer}
          >
            <span style={{ fontWeight: 600 }}>{getElementalBuffLogText(entry.chosenBuffId, rolesByPlayerId, playerNamesById, showRolesOnly, realNamesById, isRealNamesMode)}</span>
          </ActionSpan>
        </LogItem>
      );
    }

    case "elemental_buff": {
      return null;
    }

    case "host_ended_game":
      return <LogItem emoji="🛑" style={lineStyle}>Quản trò đã cho ngừng ván chơi</LogItem>;

    case "soi_mu_villager_choose": {
      const actorRole = getRoleName(entry.actorId, rolesByPlayerId);
      const targetDisplayMode = getTargetDisplayMode(entry.targetId);

      if (actorRole === "Phù thủy") {
        const wolfBiteEntry = (nightEntries || []).find(e => e.type === "soi_mu_wolf_bite");
        const wolfBittenId = wolfBiteEntry ? (wolfBiteEntry as any).targetId : null;

        if (wolves && wolves.includes(entry.targetId)) {
          return (
            <LogItem emoji="🧪" style={lineStyle} hideIcon={hideIcon}>
              <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.targetId]} onHighlightPlayer={onHighlightPlayer} />{" "}
              đã quăng bình giết{" "}
              <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode={targetDisplayMode} popupMode="none" secondaryHighlightIds={[entry.actorId]} onHighlightPlayer={onHighlightPlayer} />
            </LogItem>
          );
        } else if (wolfBittenId && entry.targetId === wolfBittenId) {
          return (
            <LogItem emoji="🧪" style={lineStyle} hideIcon={hideIcon}>
              <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.targetId]} onHighlightPlayer={onHighlightPlayer} />{" "}
              đã dùng bình cứu{" "}
              <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode={targetDisplayMode} popupMode="none" secondaryHighlightIds={[entry.actorId]} onHighlightPlayer={onHighlightPlayer} />
            </LogItem>
          );
        } else {
          return (
            <LogItem emoji="👤" style={lineStyle} hideIcon={hideIcon}>
              <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.targetId]} onHighlightPlayer={onHighlightPlayer} />{" "}
              {actorRole}{" "}
              <ActionSpan highlightPayload={{ primaryId: entry.actorId, secondaryIds: [entry.targetId] }} onHighlightPlayer={onHighlightPlayer}>
                chọn
              </ActionSpan>{" "}
              <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode={targetDisplayMode} popupMode="none" secondaryHighlightIds={[entry.actorId]} onHighlightPlayer={onHighlightPlayer} />
            </LogItem>
          );
        }
      }

      if (actorRole === "Đàn bà") {
        return (
          <LogItem emoji="👄" style={lineStyle} hideIcon={hideIcon}>
            <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode={targetDisplayMode} popupMode="none" secondaryHighlightIds={[entry.actorId]} onHighlightPlayer={onHighlightPlayer} />{" "}
            đã bị vô hiệu chức năng vì bị dính những niềm đau từ đàn bà mang tới
          </LogItem>
        );
      }

      if (actorRole === "Thợ săn") {
        return (
          <LogItem emoji="🎯" style={lineStyle} hideIcon={hideIcon}>
            <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.targetId]} onHighlightPlayer={onHighlightPlayer} />{" "}
            ghim{" "}
            <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode={targetDisplayMode} popupMode="none" secondaryHighlightIds={[entry.actorId]} onHighlightPlayer={onHighlightPlayer} />
          </LogItem>
        );
      }

      if (actorRole === "Tiên tri") {
        return (
          <LogItem emoji="🔮" style={lineStyle} hideIcon={hideIcon}>
            <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.targetId]} onHighlightPlayer={onHighlightPlayer} />{" "}
            chọn soi{" "}
            <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode={targetDisplayMode} popupMode="none" secondaryHighlightIds={[entry.actorId]} onHighlightPlayer={onHighlightPlayer} />
          </LogItem>
        );
      }

      const tooltipText = `Lựa chọn của ${actorRole.toLowerCase()} sẽ không gây ảnh hưởng gì lên mục tiêu`;
      return (
        <LogItem emoji="👤" style={lineStyle} hideIcon={hideIcon}>
          <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.targetId]} onHighlightPlayer={onHighlightPlayer} />{" "}
          {actorRole}{" "}
          <ActionSpan tooltipDetail={tooltipText} highlightPayload={{ primaryId: entry.actorId, secondaryIds: [entry.targetId] }} onHighlightPlayer={onHighlightPlayer}>
            chọn
          </ActionSpan>{" "}
          <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode={targetDisplayMode} popupMode="none" secondaryHighlightIds={[entry.actorId]} onHighlightPlayer={onHighlightPlayer} />
        </LogItem>
      );
    }

    case "soi_mu_wolf_bite": {
      const targetRole = getRoleName(entry.targetId, rolesByPlayerId);
      return (
        <LogItem emoji="🩸" style={lineStyle}>
          <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.targetId]} onHighlightPlayer={onHighlightPlayer} />{" "}
          {entry.wolfLabel} đã cắn{" "}
          <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.actorId]} onHighlightPlayer={onHighlightPlayer} />{" "}
          {targetRole}
        </LogItem>
      );
    }

    case "soi_mu_wolf_suicide": {
      return (
        <LogItem emoji="🐺" style={lineStyle}>
          <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" onHighlightPlayer={onHighlightPlayer} />{" "}
          {entry.wolfLabel} đã tự cắn bản thân
        </LogItem>
      );
    }

    case "soi_mu_wolf_inactive_choose": {
      const actorName = getPlayerName(entry.actorId, playerNamesById);
      const tooltipText = `Do ${entry.activeWolfLabel} còn sống nên lựa chọn của ${actorName} không có tác dụng`;
      return (
        <LogItem emoji="🐺" style={lineStyle}>
          <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.targetId]} onHighlightPlayer={onHighlightPlayer} />{" "}
          {entry.wolfLabel}{" "}
          <ActionSpan tooltipDetail={tooltipText} highlightPayload={{ primaryId: entry.actorId, secondaryIds: [entry.targetId] }} onHighlightPlayer={onHighlightPlayer}>
            chọn
          </ActionSpan>{" "}
          <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.actorId]} onHighlightPlayer={onHighlightPlayer} />
        </LogItem>
      );
    }

    case "soi_mu_ariana_trade": {
      const actorThumbEmoji = entry.actorThumb === "up" ? "👍🏽" : "👎🏽";
      const targetThumbEmoji = entry.targetThumb === "up" ? "👍🏽" : "👎🏽";
      return (
        <LogItem emoji="🫱🏾‍🫲🏽" style={lineStyle}>
          <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.targetId]} onHighlightPlayer={onHighlightPlayer} />{" "}
          chọn{" "}
          <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.actorId]} onHighlightPlayer={onHighlightPlayer} />{" "}
          và ấn {actorThumbEmoji}
          {entry.targetThumb === null ? " - ..." : " - còn "}
          {entry.targetThumb !== null && (
            <>
              <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.actorId]} onHighlightPlayer={onHighlightPlayer} />{" "}
              ấn {targetThumbEmoji}
            </>
          )}
        </LogItem>
      );
    }

    case "custom_log": {
      const msg = entry.message || "";
      if (msg.startsWith("__song_trung_victim_muted__:")) {
        const [_, targetId, cupidId] = msg.split(":");
        return (
          <LogItem emoji="🔇" style={lineStyle}>
            {targetId && <RoleSpan playerId={targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />}{" "}
            đã bị câm lặng và không còn là cặp đôi với{" "}
            {cupidId && <RoleSpan playerId={cupidId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />}
          </LogItem>
        );
      }
      if (msg.startsWith("__song_trung_lovers_paired__:")) {
        const [_, cupidId, actorId] = msg.split(":");
        const isCupid = myPlayerId === cupidId;
        const isSongTrung = myPlayerId === actorId;

        if (!gameEnded && (isCupid || isSongTrung)) {
          const partnerId = isCupid ? actorId : cupidId;
          return (
            <LogItem emoji="🖤" style={lineStyle}>
              Bạn và{" "}
              {partnerId && <RoleSpan playerId={partnerId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />}{" "}
              đã trở thành cặp đôi phe ba
            </LogItem>
          );
        }

        return (
          <LogItem emoji="🖤" style={lineStyle}>
            {cupidId && <RoleSpan playerId={cupidId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />}{" "}
            và{" "}
            {actorId && <RoleSpan playerId={actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />}{" "}
            đã trở thành cặp đôi phe ba
          </LogItem>
        );
      }
      if (msg.startsWith("__song_trung_rob_single__:")) {
        const [_, actorId, targetId, victimRole] = msg.split(":");
        const isSongTrung = myPlayerId === actorId;

        if (!gameEnded && isSongTrung) {
          return (
            <LogItem emoji="🎭" style={lineStyle}>
              Đã rút cạn linh hồn của{" "}
              {targetId && <RoleSpan playerId={targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />}{" "}
              và chiếm đoạt vai trò <span style={{ fontWeight: 600, color: "#c084fc" }}>{victimRole}</span>
            </LogItem>
          );
        }

        return (
          <LogItem emoji="🎭" style={lineStyle}>
            {actorId && <RoleSpan playerId={actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />}{" "}
            đã rút cạn linh hồn của{" "}
            {targetId && <RoleSpan playerId={targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />}{" "}
            và chiếm đoạt vai trò <span style={{ fontWeight: 600, color: "#c084fc" }}>{victimRole}</span>
          </LogItem>
        );
      }
      if (msg.startsWith("__song_trung_guess_wrong__:")) {
        const [_, actorId, targetId] = msg.split(":");
        const isSongTrung = myPlayerId === actorId;
        const hasAccess = isHost || gameEnded || isSongTrung;

        if (!hasAccess) {
          return null;
        }

        const wrongBgStyle: React.CSSProperties = {
          ...lineStyle,
          background: "linear-gradient(45deg, hsl(0deg 83.51% 57.95% / 19%), transparent)",
          padding: "4px 8px",
          borderRadius: "6px",
        };

        if (!gameEnded && isSongTrung) {
          return (
            <LogItem emoji="🎭" style={wrongBgStyle}>
              Đã nghĩ{" "}
              {targetId && <RoleSpan playerId={targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />}{" "}
              là nửa kia của Thần Tình Yêu
            </LogItem>
          );
        }

        return (
          <LogItem emoji="🎭" style={wrongBgStyle}>
            {actorId && <RoleSpan playerId={actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />}{" "}
            nghĩ{" "}
            {targetId && <RoleSpan playerId={targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />}{" "}
            là nửa kia của Thần Tình Yêu
          </LogItem>
        );
      }
      if (msg.startsWith("__song_trung_victim_guess_wrong__:")) {
        const [_, actorId, targetId] = msg.split(":");
        const isVictim = myPlayerId === actorId;
        const hasAccess = isHost || gameEnded || isVictim;

        if (!hasAccess) {
          return null;
        }

        const wrongBgStyle: React.CSSProperties = {
          ...lineStyle,
          background: "linear-gradient(45deg, hsl(0deg 83.51% 57.95% / 19%), transparent)",
          padding: "4px 8px",
          borderRadius: "6px",
        };

        if (!gameEnded && isVictim) {
          return (
            <LogItem emoji="🎭" style={wrongBgStyle}>
              Đã nghĩ{" "}
              {targetId && <RoleSpan playerId={targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />}{" "}
              là Song Trùng
            </LogItem>
          );
        }

        return (
          <LogItem emoji="🎭" style={wrongBgStyle}>
            {actorId && <RoleSpan playerId={actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />}{" "}
            nghĩ{" "}
            {targetId && <RoleSpan playerId={targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />}{" "}
            là Song Trùng
          </LogItem>
        );
      }
      return <LogItem emoji="📝" style={lineStyle}>{entry.message}</LogItem>;
    }

    default:
      return <LogItem emoji="📝" style={lineStyle}>(log không rõ)</LogItem>;
  }
}

function groupLogEntries(
  entries: GameLogEntry[],
  rolesByPlayerId: Record<string, string>,
  wolves: string[],
  nightEntries: GameLogEntry[],
  isBlindWerewolf: boolean,
  isPlayerViewForGroup: boolean,
  myPlayerId?: string,
  gameEnded?: boolean,
  isHost?: boolean
): (GameLogEntry | { type: "log_thread_group"; title: string; entries: GameLogEntry[]; icon?: string })[] {
  let currentEntries = entries;
  let collapsedGroup: { type: "log_thread_group"; title: string; entries: GameLogEntry[]; icon?: string } | null = null;

  if (isBlindWerewolf && !isPlayerViewForGroup) {
    const noImpactChoose: GameLogEntry[] = [];
    const otherEntries: GameLogEntry[] = [];

    const isNoImpactVillagerChoose = (entry: GameLogEntry) => {
      if (entry.type !== "soi_mu_villager_choose") return false;
      const actorRole = rolesByPlayerId[entry.actorId];
      if (actorRole === "Phù thủy") {
        const wolfBiteEntry = nightEntries.find(e => e.type === "soi_mu_wolf_bite");
        const wolfBittenId = wolfBiteEntry ? (wolfBiteEntry as any).targetId : null;
        if (wolves && wolves.includes(entry.targetId)) return false;
        if (wolfBittenId && entry.targetId === wolfBittenId) return false;
      }
      if (actorRole === "Đàn bà" || actorRole === "Thợ săn" || actorRole === "Tiên tri") return false;
      return true;
    };

    for (const entry of entries) {
      if (isNoImpactVillagerChoose(entry)) {
        noImpactChoose.push(entry);
      } else {
        otherEntries.push(entry);
      }
    }

    if (noImpactChoose.length > 0) {
      collapsedGroup = {
        type: "log_thread_group",
        title: "Các lựa chọn không gây tác động",
        entries: noImpactChoose,
        icon: "👤"
      };
    }
    currentEntries = otherEntries;
  }

  const result: (GameLogEntry | { type: "log_thread_group"; title: string; entries: GameLogEntry[]; icon?: string })[] = [];
  if (collapsedGroup) {
    result.push(collapsedGroup);
  }

  for (const entry of currentEntries) {
    if (entry.type === "song_trung_rob") {
      const { actorId, targetId, victimRole, cupidId, staysAlive } = entry;
      const isSongTrung = myPlayerId === actorId;
      const isCupid = myPlayerId === cupidId;

      const hasAccess = !!(
        isHost ||
        gameEnded ||
        (myPlayerId && (isSongTrung || isCupid))
      );

      if (!hasAccess) {
        continue;
      }

      if (isCupid && !isHost && !gameEnded) {
        result.push({
          type: "custom_log",
          phase: "night",
          message: `__song_trung_lovers_paired__:${cupidId}:${actorId}`
        });
      } else {
        if (!staysAlive) {
          if (isHost || gameEnded || isSongTrung) {
            result.push({
              type: "custom_log",
              phase: "night",
              message: `__song_trung_rob_single__:${actorId}:${targetId}:${victimRole}:false`
            });
          }
          result.push({
            type: "custom_log",
            phase: "night",
            message: `__song_trung_lovers_paired__:${cupidId}:${actorId}`
          });
        } else {
          const childEntries: GameLogEntry[] = [];
          childEntries.push({
            type: "custom_log",
            phase: "night",
            message: `__song_trung_victim_muted__:${targetId}:${cupidId}`
          });
          childEntries.push({
            type: "custom_log",
            phase: "night",
            message: `__song_trung_lovers_paired__:${cupidId}:${actorId}`
          });

          result.push({
            type: "log_thread_group",
            title: `__song_trung_rob_title__:${actorId}:${targetId}:${victimRole}:${staysAlive ? "true" : "false"}`,
            entries: childEntries,
            icon: "🎭"
          });
        }
      }
    } else if (entry.type === "custom_log" && entry.message?.startsWith("__song_trung_guess_wrong__:")) {
      const [_, actorId] = entry.message.split(":");
      const isSongTrung = myPlayerId === actorId;
      const hasAccess = !!(isHost || gameEnded || isSongTrung);
      if (hasAccess) {
        result.push(entry);
      }
    } else if (entry.type === "custom_log" && entry.message?.startsWith("__song_trung_victim_guess_wrong__:")) {
      const [_, actorId] = entry.message.split(":");
      const isVictim = myPlayerId === actorId;
      const hasAccess = !!(isHost || gameEnded || isVictim);
      if (hasAccess) {
        result.push(entry);
      }
    } else {
      result.push(entry);
    }
  }

  return result;
}

function LogThreadGroup({
  night,
  entries,
  dayVotersByTarget,
  legacyAngelGuessByPair,
  playerOnlyDayLogs,
  rolesByPlayerId,
  playerNamesById,
  targetRoleDisplayOrderByPlayerId,
  eliminationFocus,
  onEliminationFocusChange,
  onHighlightPlayer,
  myPlayerId,
  loveState,
  wolves,
  wolfBadgeRoles,
  gameEnded,
  isHost,
  isBlindWerewolf,
  nightEntries,
  title,
  icon,
}: {
  night: number;
  entries: GameLogEntry[];
  dayVotersByTarget: Record<string, string[]>;
  legacyAngelGuessByPair: Record<string, string | null | undefined>;
  playerOnlyDayLogs: boolean;
  rolesByPlayerId: RolesByPlayerId;
  playerNamesById: PlayerNamesById;
  targetRoleDisplayOrderByPlayerId?: TargetRoleDisplayOrderByPlayerId;
  eliminationFocus: EliminationFocus | null;
  onEliminationFocusChange: (focus: EliminationFocus | null) => void;
  onHighlightPlayer: (payload: HighlightPayload) => void;
  myPlayerId?: string;
  loveState?: any;
  wolves?: string[];
  wolfBadgeRoles?: Record<string, string>;
  gameEnded?: boolean;
  isHost?: boolean;
  isBlindWerewolf?: boolean;
  nightEntries?: GameLogEntry[];
  title?: string;
  icon?: string;
}) {
  const [isCollapsed, setIsCollapsed] = useState(true);

  const lineStyle: React.CSSProperties = {
    opacity: 1,
    transition: "opacity 280ms ease",
  };

  let renderedTitle: React.ReactNode = title;
  if (title && title.startsWith("__song_trung_rob_title__:")) {
    const [_, actorId, targetId, victimRole, staysAliveStr] = title.split(":");
    const staysAlive = staysAliveStr === "true";
    const isSongTrung = myPlayerId === actorId;

    if (!gameEnded && isSongTrung) {
      if (staysAlive) {
        renderedTitle = (
          <>
            Đã giam cầm linh hồn của{" "}
            {targetId && <RoleSpan playerId={targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />}{" "}
            và chiếm đoạt vai trò <span style={{ fontWeight: 600, color: "#c084fc" }}>{victimRole}</span>
          </>
        );
      } else {
        renderedTitle = (
          <>
            Đã rút cạn linh hồn của{" "}
            {targetId && <RoleSpan playerId={targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />}{" "}
            và chiếm đoạt vai trò <span style={{ fontWeight: 600, color: "#c084fc" }}>{victimRole}</span>
          </>
        );
      }
    } else {
      if (staysAlive) {
        renderedTitle = (
          <>
            {actorId && <RoleSpan playerId={actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />}{" "}
            đã giam cầm linh hồn của{" "}
            {targetId && <RoleSpan playerId={targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />}{" "}
            và chiếm đoạt vai trò <span style={{ fontWeight: 600, color: "#c084fc" }}>{victimRole}</span>
          </>
        );
      } else {
        renderedTitle = (
          <>
            {actorId && <RoleSpan playerId={actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />}{" "}
            đã rút cạn linh hồn của{" "}
            {targetId && <RoleSpan playerId={targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />}{" "}
            và chiếm đoạt vai trò <span style={{ fontWeight: 600, color: "#c084fc" }}>{victimRole}</span>
          </>
        );
      }
    }
  }

  return (
    <div className="log-thread-group" style={{ marginBottom: 12, padding: "6px 8px", ...lineStyle }}>
      {/* Header dòng tiêu đề */}
      <div className="log-thread-header" style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span className="game-log-item-icon" style={{ flexShrink: 0, width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <AvifIcon name={icon || "👤"} />
        </span>
        <span className="log-thread-title" style={{ fontWeight: 600, color: "#cbd5e1", fontSize: "14px" }}>
          {renderedTitle || "Các lựa chọn không gây tác động"}
        </span>
      </div>

      {/* Phần thân chứa line và nội dung */}
      <div className="log-thread-body" style={{ position: "relative", marginTop: 4 }}>
        {/* Đường dọc chính chạy suốt từ trên xuống dưới và tự động co giãn mượt mà */}
        <div
          style={{
            position: "absolute",
            left: 10, // Căn giữa thẳng hàng với các nhánh ngang (24px paddingLeft - 14px left = 10px)
            top: -4,  // Bắt đầu ngay dưới avatar tiêu đề
            bottom: 17, // Kết thúc chính xác tại điểm rẽ ngang của nút toggle (tâm nút toggle)
            width: 2,
            background: "rgb(162, 155, 254)",
            pointerEvents: "none",
            filter: "brightness(0.5)",
          }}
        />

        {/* Danh sách con co giãn mượt mà sử dụng CSS Grid */}
        <div
          className="log-thread-children"
          style={{
            display: "grid",
            gridTemplateRows: isCollapsed ? "0fr" : "1fr",
            opacity: isCollapsed ? 0 : 1,
            overflow: "hidden",
            transition: "grid-template-rows 320ms cubic-bezier(0.4, 0, 0.2, 1), opacity 240ms ease, margin-bottom 320ms ease",
            marginBottom: isCollapsed ? 0 : 8,
          }}
        >
          <div style={{ overflow: "hidden", display: "flex", flexDirection: "column", gap: 8 }}>
            {entries.map((childEntry, idx) => {
              return (
                <div key={idx} style={{ display: "flex", alignItems: "center", position: "relative", paddingLeft: 24 }}>
                  {/* Nhánh lưới cho dòng con bọc trong 1 div để áp filter brightness(0.5) và dùng màu solid rgb(162, 155, 254) */}
                  <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 24, pointerEvents: "none", filter: "brightness(0.5)" }}>
                    {/* Nhánh ngang cong nối tới từng lựa chọn con từ đường dọc chính của cha */}
                    <div
                      style={{
                        position: "absolute",
                        left: 10,
                        top: -12,
                        width: 10,
                        height: 30,
                        borderLeft: "2px solid rgb(162, 155, 254)",
                        borderBottom: "2px solid rgb(162, 155, 254)",
                        borderBottomLeftRadius: 6
                      }}
                    />
                  </div>

                  <ul style={{ marginLeft: 4, width: "100%", padding: 0, margin: 0, listStyleType: "none" }}>
                    <LogEntryLine
                      night={night}
                      entry={childEntry}
                      dayVotersByTarget={dayVotersByTarget}
                      legacyAngelGuessByPair={legacyAngelGuessByPair}
                      playerOnlyDayLogs={playerOnlyDayLogs}
                      rolesByPlayerId={rolesByPlayerId}
                      playerNamesById={playerNamesById}
                      targetRoleDisplayOrderByPlayerId={targetRoleDisplayOrderByPlayerId}
                      eliminationFocus={eliminationFocus}
                      onEliminationFocusChange={onEliminationFocusChange}
                      onHighlightPlayer={onHighlightPlayer}
                      myPlayerId={myPlayerId}
                      loveState={loveState}
                      wolves={wolves}
                      wolfBadgeRoles={wolfBadgeRoles}
                      gameEnded={gameEnded}
                      isHost={isHost}
                      isBlindWerewolf={isBlindWerewolf}
                      nightEntries={nightEntries}
                      hideIcon={true}
                    />
                  </ul>
                </div>
              );
            })}
          </div>
        </div>

        {/* Nút bấm toggle */}
        <div style={{ display: "flex", alignItems: "center", position: "relative", height: 28, paddingLeft: 24 }}>
          {/* Nhánh lưới cho nút toggle (luôn là nhánh cong rẽ vào từ đường dọc chính của cha, không thò đuôi) */}
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 24, pointerEvents: "none", filter: "brightness(0.5)" }}>
            <div
              style={{
                position: "absolute",
                left: 10,
                top: 0,
                width: 10,
                height: 16,
                borderLeft: "2px solid rgb(162, 155, 254)",
                borderBottom: "2px solid rgb(162, 155, 254)",
                borderBottomLeftRadius: 6
              }}
            />
          </div>

          <div
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="log-thread-toggle-btn"
            style={{
              background: "linear-gradient(135deg, rgba(162, 155, 254, 0.08) 0%, rgba(108, 92, 231, 0.04) 100%)",
              border: "1px solid rgba(162, 155, 254, 0.3)",
              color: "#a29bfe",
              fontSize: "12.5px",
              fontWeight: 600,
              padding: "4px 12px",
              borderRadius: "12px",
              cursor: "pointer",
              marginLeft: 4,
              display: "flex",
              alignItems: "center",
              gap: 4,
              userSelect: "none",
              outline: "none",
              transition: "all 0.2s ease"
            }}
          >
            {isCollapsed ? "Xem thêm ∨" : "Thu gọn ∧"}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function GameLogPanel({
  nights,
  rolesByPlayerId,
  playerNamesById,
  targetRoleDisplayOrderByPlayerId,
  onHighlightPlayer,
  canViewNightLogs = true,
  isHost = false,
  onAddCustomLog,
  viewMode: viewModeProp,
  onViewModeChange,
  playerRealNamesById,
  myPlayerId,
  myRole,
  loveState,
  wolves,
  wolfBadgeRoles,
  gameRules,
  gameEnded = false,
  isReplay = false,
  isBlindWerewolf,
  showAllEntries = false,
}: GameLogPanelProps) {
  const [localViewMode, setLocalViewMode] = useState<ViewMode>("nick-names");
  const viewMode = viewModeProp ?? localViewMode;
  const setViewMode = onViewModeChange ?? setLocalViewMode;

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isGlowing, setIsGlowing] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const selectModeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [hideNightLogs, setHideNightLogs] = useState(() => {
    return localStorage.getItem("game-hide-night-logs") === "true";
  });
  const handleHideNightLogsChange = (val: boolean) => {
    setHideNightLogs(val);
    localStorage.setItem("game-hide-night-logs", String(val));
  };

  useEffect(() => {
    if (gameEnded && !isHost && hideNightLogs) {
      handleHideNightLogsChange(false);
    }
  }, [gameEnded, isHost, hideNightLogs]);

  useEffect(() => {
    if (!dropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
        setIsExpanded(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownOpen]);

  useEffect(() => {
    return () => {
      if (selectModeTimerRef.current) {
        clearTimeout(selectModeTimerRef.current);
      }
    };
  }, []);

  const selectMode = useCallback((newMode: ViewMode) => {
    if (selectModeTimerRef.current) {
      clearTimeout(selectModeTimerRef.current);
    }

    if (newMode !== viewMode) {
      setViewMode(newMode);
      setDropdownOpen(false);
      setIsGlowing(true);

      selectModeTimerRef.current = setTimeout(() => {
        setIsGlowing(false);
        setIsExpanded(false);
        selectModeTimerRef.current = null;
      }, 1000);
    } else {
      setDropdownOpen(false);
      setIsExpanded(false);
    }
  }, [viewMode, setViewMode]);

  const [eliminationFocus, setEliminationFocus] = useState<EliminationFocus | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Hoạt ảnh staggered trượt lên + hiện dần cho các log mới
  useGSAP(() => {
    const items = containerRef.current?.querySelectorAll(".game-log-item");
    if (!items || !items.length) return;

    // Lọc ra các log item mới chưa chạy hoạt ảnh
    const newItems = Array.from(items).filter(el => !el.classList.contains("has-animated"));

    if (newItems.length > 0) {
      // Đánh dấu đã chạy để tránh lập lại
      newItems.forEach(el => el.classList.add("has-animated"));

      // Chỉ phát nhạc log nếu đây là dòng đơn phát sinh mới (tránh ồn khi load lịch sử lúc vào game)
      if (newItems.length === 1) {
        soundManager.play("logAdded");
      }

      gsap.fromTo(
        newItems,
        { opacity: 0, y: 15, scale: 0.97 },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 0.4,
          stagger: gsap.utils.clamp(0.01, 0.08, 0.45 / newItems.length), // Tự động giảm trễ khi số lượng log nổ ra lớn
          ease: "power2.out",
        }
      );
    }
  }, { dependencies: [nights], scope: containerRef });
  const legacyAngelGuessByPair = Object.fromEntries(
    (nights || [])
      .flatMap((n) => n.entries || [])
      .filter((e) => e.type === "angel_revive_choice")
      .map((e) => [`${e.actorId}:${e.targetId}`, e.guess])
  );

  const rolesByEntry = useMemo(() => {
    const entryMap = new Map<GameLogEntry, RolesByPlayerId>();
    const currentRoles = { ...rolesByPlayerId };

    // Walk backwards chronologically through nights and entries
    for (let i = nights.length - 1; i >= 0; i--) {
      const n = nights[i];
      const entries = n.entries || [];
      for (let j = entries.length - 1; j >= 0; j--) {
        const entry = entries[j];

        // If we hit the wild wolf conversion event where the target got successfully transformed,
        // revert their role in our walking roles state. That way, this log and all earlier logs
        // will show their original role before transformation.
        if (entry.type === "wild_wolf_conversion" && entry.success && entry.targetId && entry.previousTargetRole) {
          currentRoles[entry.targetId] = entry.previousTargetRole;
        }

        entryMap.set(entry, { ...currentRoles });
      }
    }
    return entryMap;
  }, [nights, rolesByPlayerId]);

  return (
    <ViewModeContext.Provider value={viewMode}>
      <RealNamesContext.Provider value={playerRealNamesById || {}}>
        <style>{`
        .game-log-panel-container {
          margin-top: 24px;
          padding: 24px;
          background: linear-gradient(145deg, rgba(14, 16, 20, 0.5) 0%, rgba(15, 17, 21, 0.7) 100%);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 16px;
          box-shadow: 0 16px 48px rgba(0, 0, 0, 0.55);
          backdrop-filter: blur(16px);
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .game-log-panel-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          padding-bottom: 16px;
          margin-bottom: 24px;
          gap: 16px;
          flex-wrap: nowrap;
          position: relative;
          min-height: 38px;
        }

        .game-log-panel-title {
          font-size: 20px;
          font-weight: 800;
          margin: 0;
          display: flex;
          align-items: center;
          gap: 0px;
        }

        .title-icon {
          display: flex;
          align-items: center;
          z-index: 2;
          position: relative;
        }

        .title-text-wrapper {
          display: inline-block;
          max-width: 200px;
          opacity: 1;
          overflow: hidden;
          white-space: nowrap;
          margin-left: -4px;
          z-index: 1;
          position: relative;
          transition: max-width 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s ease;
        }

        .title-text-wrapper.collapsed {
          max-width: 0;
          opacity: 0;
        }

        .title-text {
          display: inline-block;
          padding-left: 10px;
          background: linear-gradient(135deg, #ffffff 0%, #a29bfe 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          transition: transform 0.35s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .title-text-wrapper.collapsed .title-text {
          transform: translateX(-100%);
        }

        .game-log-toggle-wrapper {
          position: absolute;
          right: 0;
          z-index: 10;
          display: flex;
          align-items: center;
        }

        .game-log-toggle-btn {
          display: flex;
          align-items: center;
          background: linear-gradient(135deg, rgba(108, 92, 231, 0.18) 0%, rgba(109, 68, 232, 0.12) 100%);
          border: 1px solid rgba(108, 92, 231, 0.4);
          color: #a29bfe;
          padding: 8px 16px;
          border-radius: 20px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 4px 12px rgba(108, 92, 231, 0.08);
          user-select: none;
          white-space: nowrap;
          overflow: hidden;
        }

        .btn-base-text {
          display: inline-block;
        }

        .btn-suffix-wrapper {
          display: inline-block;
          max-width: 0;
          opacity: 0;
          overflow: hidden;
          white-space: nowrap;
          transition: max-width 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease, margin-left 0.35s ease;
        }

        .game-log-toggle-btn.expanded {
          background: linear-gradient(135deg, rgba(30, 27, 57, 0.98) 0%, rgba(20, 18, 41, 0.95) 100%);
          border-color: rgba(108, 92, 231, 0.6);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
        }

        .game-log-toggle-btn.glowing {
          border-color: rgba(162, 155, 254, 0.9) !important;
          box-shadow: 0 0 20px rgba(162, 155, 254, 0.8), inset 0 0 10px rgba(162, 155, 254, 0.5) !important;
          animation: pulse-glow 1s infinite alternate;
        }

        @keyframes pulse-glow {
          0% {
            box-shadow: 0 0 8px rgba(162, 155, 254, 0.4), inset 0 0 4px rgba(162, 155, 254, 0.2);
          }
          100% {
            box-shadow: 0 0 22px rgba(162, 155, 254, 0.9), inset 0 0 12px rgba(162, 155, 254, 0.6);
          }
        }

        .game-log-toggle-btn.expanded .btn-suffix-wrapper {
          max-width: 180px;
          opacity: 1;
          margin-left: 2px;
          transition: max-width 0.35s cubic-bezier(0.4, 0, 0.2, 1), margin-left 0.35s ease, opacity 0.2s ease 0.1s;
        }

        .game-log-toggle-btn:hover {
          background: linear-gradient(135deg, rgba(108, 92, 231, 0.28) 0%, rgba(109, 68, 232, 0.22) 100%);
          border-color: rgba(108, 92, 231, 0.7);
          box-shadow: 0 6px 16px rgba(108, 92, 231, 0.15);
        }

        .game-log-toggle-btn:active {
          transform: translateY(1px);
        }

        .game-log-night-section, .game-log-day-section {
          margin-bottom: 20px;
          border-radius: 12px;
          /* overflow: hidden; -- Removed to prevent clipping tooltips */
          transition: all 0.3s ease;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
        }

        .game-log-night-section {
          background: rgba(108, 92, 231, 0.03);
          border: 1px solid rgba(108, 92, 231, 0.1);
          max-height: 2700px; /* Tofuedited chỉnh độ dài tối đa của cái khung log đêm */
          transition: max-height 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s ease, margin 0.35s ease, border-color 0.35s ease;
        }

        .game-log-night-section.collapsed-night {
          max-height: 0 !important;
          opacity: 0 !important;
          margin-bottom: 0 !important;
          border-top-width: 0 !important;
          border-bottom-width: 0 !important;
          border-color: transparent !important;
          overflow: hidden !important;
          pointer-events: none;
        }

        .game-log-day-section {
          background: rgba(255, 152, 0, 0.02);
          border: 1px solid rgba(255, 152, 0, 0.07);
        }

        .game-log-phase-header {
          padding: 12px 20px;
          font-weight: 800;
          font-size: 13.5px;
          text-transform: uppercase;
          letter-spacing: 0.8px;
          display: flex;
          align-items: center;
          gap: 10px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.04);
          border-top-left-radius: 11px;
          border-top-right-radius: 11px;
        }

        .game-log-night-header {
          color: #a29bfe;
          background: rgba(108, 92, 231, 0.08);
        }

        .game-log-day-header {
          color: #ffeaa7;
          background: rgba(255, 152, 0, 0.04);
        }

        .game-log-list {
          list-style: none;
          margin: 0;
          padding: 14px 20px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .game-log-item {
          position: relative;
          z-index: 1;
          opacity: 0; /* Ẩn mặc định để GSAP trượt hiện dần */
          font-size: 14px;
          line-height: 1.6;
          color: rgba(232, 232, 232, 0.95);
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 6px 8px;
          border-radius: 8px;
          transition: background 0.2s ease, transform 0.2s ease;
        }

        .game-log-item.has-animated {
          opacity: 1; /* Cố định hiển thị cho log cũ đã chạy hoạt ảnh */
        }

        .game-log-item:hover {
          background: rgba(255, 255, 255, 0.03);
          transform: translateX(2px);
          z-index: 2;
        }

        .game-log-item:has(.game-log-tooltip) {
          z-index: 21;
        }

        .game-log-item-icon {
          flex-shrink: 0;
          font-size: 16px;
          width: 26px;
          height: 26px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 6px;
          box-shadow: 0 2px 6px rgba(0,0,0,0.1);
        }

        .game-log-item-content {
          flex: 1;
          align-self: center;
        }

        .game-log-empty-msg {
          padding: 16px 24px;
          font-style: italic;
          color: rgba(232, 232, 232, 0.45);
          font-size: 13.5px;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        /* Dropdown Menu Animation Styles */
        .game-log-dropdown-menu {
          position: absolute;
          top: calc(100% + 6px);
          right: 0;
          background: rgba(30, 27, 57, 0.95);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(108, 92, 231, 0.4);
          border-radius: 12px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.5);
          padding: 0;
          z-index: 22;
          min-width: 170px;
          display: flex;
          flex-direction: column;
          opacity: 0;
          max-height: 0;
          overflow: hidden;
          pointer-events: none;
          transition: max-height 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s ease, padding 0.35s ease;
        }

        .game-log-dropdown-menu.open {
          opacity: 1;
          max-height: 250px;
          padding: 6px 0;
          pointer-events: auto;
        }

        /* Neon Checkbox Styles */
        .neon-checkbox {
          --primary: #00ffaa;
          --primary-dark: #00cc88;
          --primary-light: #88ffdd;
          --size: 20px;
          position: relative;
          width: var(--size);
          height: var(--size);
          cursor: pointer;
          -webkit-tap-highlight-color: transparent;
        }

        .neon-checkbox input {
          display: none;
        }

        .neon-checkbox__frame {
          position: relative;
          width: 100%;
          height: 100%;
        }

        .neon-checkbox__box {
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.8);
          border-radius: 4px;
          border: 2px solid var(--primary-dark);
          transition: all 0.4s ease;
        }

        .neon-checkbox__check-container {
          position: absolute;
          inset: 1px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .neon-checkbox__check {
          width: 90%;
          height: 90%;
          fill: none;
          stroke: var(--primary);
          stroke-width: 3;
          stroke-linecap: round;
          stroke-linejoin: round;
          stroke-dasharray: 40;
          stroke-dashoffset: 40;
          transform-origin: center;
          transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .neon-checkbox__glow {
          position: absolute;
          inset: -2px;
          border-radius: 6px;
          background: var(--primary);
          opacity: 0;
          transform: scale(1.2);
          transition: all 0.4s ease;
        }

        .neon-checkbox__borders {
          position: absolute;
          inset: 0;
          border-radius: 4px;
          overflow: hidden;
        }

        .neon-checkbox__borders span {
          position: absolute;
          width: 25px;
          height: 1px;
          background: var(--primary);
          opacity: 0;
          transition: opacity 0.4s ease;
        }

        .neon-checkbox__borders span:nth-child(1) {
          top: 0;
          left: -100%;
          animation: borderFlow1 2s linear infinite;
        }

        .neon-checkbox__borders span:nth-child(2) {
          top: -100%;
          right: 0;
          width: 1px;
          height: 25px;
          animation: borderFlow2 2s linear infinite;
        }

        .neon-checkbox__borders span:nth-child(3) {
          bottom: 0;
          right: -100%;
          animation: borderFlow3 2s linear infinite;
        }

        .neon-checkbox__borders span:nth-child(4) {
          bottom: -100%;
          left: 0;
          width: 1px;
          height: 25px;
          animation: borderFlow4 2s linear infinite;
        }

        .neon-checkbox__particles span {
          position: absolute;
          width: 3px;
          height: 3px;
          background: var(--primary);
          border-radius: 50%;
          opacity: 0;
          pointer-events: none;
          top: 50%;
          left: 50%;
          box-shadow: 0 0 6px var(--primary);
        }

        .neon-checkbox__rings {
          position: absolute;
          inset: -15px;
          pointer-events: none;
        }

        .neon-checkbox__rings .ring {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          border: 1px solid var(--primary);
          opacity: 0;
          transform: scale(0);
        }

        .neon-checkbox__sparks span {
          position: absolute;
          width: 15px;
          height: 1px;
          background: linear-gradient(90deg, var(--primary), transparent);
          opacity: 0;
        }

        /* Hover Effects */
        .neon-checkbox:hover .neon-checkbox__box {
          border-color: var(--primary);
          transform: scale(1.05);
        }

        /* Checked State */
        .neon-checkbox input:checked ~ .neon-checkbox__frame .neon-checkbox__box {
          border-color: var(--primary);
          background: rgba(0, 255, 170, 0.1);
        }

        .neon-checkbox input:checked ~ .neon-checkbox__frame .neon-checkbox__check {
          stroke-dashoffset: 0;
          transform: scale(1.1);
        }

        .neon-checkbox input:checked ~ .neon-checkbox__frame .neon-checkbox__glow {
          opacity: 0.2;
          filter: blur(8px);
        }

        .neon-checkbox input:checked ~ .neon-checkbox__frame .neon-checkbox__borders span {
          opacity: 1;
        }

        /* Particle Animations */
        .neon-checkbox input:checked ~ .neon-checkbox__frame .neon-checkbox__particles span {
          animation: particleExplosion 0.6s ease-out forwards;
        }

        .neon-checkbox input:checked ~ .neon-checkbox__frame .neon-checkbox__rings .ring {
          animation: ringPulse 0.6s ease-out forwards;
        }

        .neon-checkbox input:checked ~ .neon-checkbox__frame .neon-checkbox__sparks span {
          animation: sparkFlash 0.6s ease-out forwards;
        }

        /* Animations */
        @keyframes borderFlow1 {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(200%);
          }
        }

        @keyframes borderFlow2 {
          0% {
            transform: translateY(0);
          }
          100% {
            transform: translateY(200%);
          }
        }

        @keyframes borderFlow3 {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-200%);
          }
        }

        @keyframes borderFlow4 {
          0% {
            transform: translateY(0);
          }
          100% {
            transform: translateY(-200%);
          }
        }

        @keyframes particleExplosion {
          0% {
            transform: translate(-50%, -50%) scale(1);
            opacity: 0;
          }
          20% {
            opacity: 1;
          }
          100% {
            transform: translate(
                calc(-50% + var(--x, 15px)),
                calc(-50% + var(--y, 15px))
              )
              scale(0);
            opacity: 0;
          }
        }

        @keyframes ringPulse {
          0% {
            transform: scale(0);
            opacity: 1;
          }
          100% {
            transform: scale(2);
            opacity: 0;
          }
        }

        @keyframes sparkFlash {
          0% {
            transform: rotate(var(--r, 0deg)) translateX(0) scale(1);
            opacity: 1;
          }
          100% {
            transform: rotate(var(--r, 0deg)) translateX(20px) scale(0);
            opacity: 0;
          }
        }

        /* Particle Positions */
        .neon-checkbox__particles span:nth-child(1) {
          --x: 18px;
          --y: -18px;
        }
        .neon-checkbox__particles span:nth-child(2) {
          --x: -18px;
          --y: -18px;
        }
        .neon-checkbox__particles span:nth-child(3) {
          --x: 18px;
          --y: 18px;
        }
        .neon-checkbox__particles span:nth-child(4) {
          --x: -18px;
          --y: 18px;
        }
        .neon-checkbox__particles span:nth-child(5) {
          --x: 25px;
          --y: 0px;
        }
        .neon-checkbox__particles span:nth-child(6) {
          --x: -25px;
          --y: 0px;
        }
        .neon-checkbox__particles span:nth-child(7) {
          --x: 0px;
          --y: 25px;
        }
        .neon-checkbox__particles span:nth-child(8) {
          --x: 0px;
          --y: -25px;
        }
        .neon-checkbox__particles span:nth-child(9) {
          --x: 15px;
          --y: -22px;
        }
        .neon-checkbox__particles span:nth-child(10) {
          --x: -15px;
          --y: 22px;
        }
        .neon-checkbox__particles span:nth-child(11) {
          --x: 22px;
          --y: 15px;
        }
        .neon-checkbox__particles span:nth-child(12) {
          --x: -22px;
          --y: -15px;
        }

        /* Spark Rotations */
        .neon-checkbox__sparks span:nth-child(1) {
          --r: 0deg;
          top: 50%;
          left: 50%;
        }
        .neon-checkbox__sparks span:nth-child(2) {
          --r: 90deg;
          top: 50%;
          left: 50%;
        }
        .neon-checkbox__sparks span:nth-child(3) {
          --r: 180deg;
          top: 50%;
          left: 50%;
        }
        .neon-checkbox__sparks span:nth-child(4) {
          --r: 270deg;
          top: 50%;
          left: 50%;
        }

        /* Ring Delays */
        .neon-checkbox__rings .ring:nth-child(1) {
          animation-delay: 0s;
        }
        .neon-checkbox__rings .ring:nth-child(2) {
          animation-delay: 0.1s;
        }
        .neon-checkbox__rings .ring:nth-child(3) {
          animation-delay: 0.2s;
        }
      `}</style>

        <div ref={containerRef} className="game-log-panel-container">
          <div className="game-log-panel-header" style={{ paddingRight: canViewNightLogs ? 130 : undefined }}>
            <h3 className="game-log-panel-title">
              <span className="title-icon">
                <AvifIcon name="📜" style={{ marginRight: 0 }} />
              </span>
              <span className={`title-text-wrapper ${isExpanded ? "collapsed" : ""}`}>
                <span className="title-text">Diễn biến sự kiện</span>
              </span>
            </h3>
            {canViewNightLogs && (
              <div ref={dropdownRef} className="game-log-toggle-wrapper">
                <div
                  className={`game-log-toggle-btn ${isExpanded ? "expanded" : ""} ${isGlowing ? "glowing" : ""}`}
                  onClick={() => {
                    if (dropdownOpen) {
                      setDropdownOpen(false);
                      setIsExpanded(false);
                    } else {
                      setDropdownOpen(true);
                      setIsExpanded(true);
                    }
                  }}
                >
                  <span className="btn-base-text">Chế độ xem</span>
                  <span className="btn-suffix-wrapper">
                    <span className="btn-suffix-text">
                      hiện tại: {
                        viewMode === "real-names"
                          ? "Chỉ hiện tên thật"
                          : viewMode === "nick-names"
                            ? "Chỉ hiện nghệ danh"
                            : viewMode === "real-names-roles"
                              ? "Tên thật & vai trò"
                              : "Nghệ danh & vai trò"
                      }
                    </span>
                  </span>
                </div>
                <div className={`game-log-dropdown-menu ${dropdownOpen ? "open" : ""}`}>
                  {!isHost && !gameEnded && (
                    <div style={{
                      padding: "8px 16px",
                      borderBottom: "1px solid rgba(108, 92, 231, 0.2)",
                      marginBottom: 4,
                      display: "flex",
                      alignItems: "center"
                    }}>
                      <label style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 10,
                        fontSize: "13px",
                        color: "#cbd5e1",
                        cursor: "pointer",
                        userSelect: "none",
                        width: "100%"
                      }}>
                        <span>Ẩn diễn biến đêm</span>
                        <div className="neon-checkbox" style={{ flexShrink: 0 }}>
                          <input
                            type="checkbox"
                            checked={hideNightLogs}
                            onChange={(e) => handleHideNightLogsChange(e.target.checked)}
                          />
                          <div className="neon-checkbox__frame">
                            <div className="neon-checkbox__box">
                              <div className="neon-checkbox__check-container">
                                <svg viewBox="0 0 24 24" className="neon-checkbox__check">
                                  <path d="M3,12.5l7,7L21,5" />
                                </svg>
                              </div>
                              <div className="neon-checkbox__glow" />
                              <div className="neon-checkbox__borders">
                                <span /><span /><span /><span />
                              </div>
                            </div>
                            <div className="neon-checkbox__effects">
                              <div className="neon-checkbox__particles">
                                <span /><span /><span /><span /> <span /><span /><span /><span /> <span /><span /><span /><span />
                              </div>
                              <div className="neon-checkbox__rings">
                                <div className="ring" />
                                <div className="ring" />
                                <div className="ring" />
                              </div>
                              <div className="neon-checkbox__sparks">
                                <span /><span /><span /><span />
                              </div>
                            </div>
                          </div>
                        </div>
                      </label>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => selectMode("real-names")}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: viewMode === "real-names" ? "#a29bfe" : "#cbd5e1",
                      padding: "8px 16px",
                      textAlign: "left",
                      cursor: "pointer",
                      fontWeight: viewMode === "real-names" ? "bold" : "normal",
                      fontSize: "13px",
                      backgroundColor: viewMode === "real-names" ? "rgba(108, 92, 231, 0.15)" : "transparent",
                    }}
                  >
                    Chỉ hiện tên thật
                  </button>
                  <button
                    type="button"
                    onClick={() => selectMode("nick-names")}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: viewMode === "nick-names" ? "#a29bfe" : "#cbd5e1",
                      padding: "8px 16px",
                      textAlign: "left",
                      cursor: "pointer",
                      fontWeight: viewMode === "nick-names" ? "bold" : "normal",
                      fontSize: "13px",
                      backgroundColor: viewMode === "nick-names" ? "rgba(108, 92, 231, 0.15)" : "transparent",
                    }}
                  >
                    Chỉ hiện nghệ danh
                  </button>
                  {(isHost || gameEnded || isReplay) && (
                    <button
                      type="button"
                      onClick={() => selectMode("real-names-roles")}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: viewMode === "real-names-roles" ? "#a29bfe" : "#cbd5e1",
                        padding: "8px 16px",
                        textAlign: "left",
                        cursor: "pointer",
                        fontWeight: viewMode === "real-names-roles" ? "bold" : "normal",
                        fontSize: "13px",
                        backgroundColor: viewMode === "real-names-roles" ? "rgba(108, 92, 231, 0.15)" : "transparent",
                      }}
                    >
                      Tên thật & vai trò
                    </button>
                  )}
                  {(isHost || gameEnded || isReplay) && (
                    <button
                      type="button"
                      onClick={() => selectMode("nick-names-roles")}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: viewMode === "nick-names-roles" ? "#a29bfe" : "#cbd5e1",
                        padding: "8px 16px",
                        textAlign: "left",
                        cursor: "pointer",
                        fontWeight: viewMode === "nick-names-roles" ? "bold" : "normal",
                        fontSize: "13px",
                        backgroundColor: viewMode === "nick-names-roles" ? "rgba(108, 92, 231, 0.15)" : "transparent",
                      }}
                    >
                      Nghệ danh & vai trò
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {isHost && onAddCustomLog && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const input = form.elements.namedItem("customLogMsg") as HTMLInputElement;
                if (input && input.value.trim()) {
                  onAddCustomLog(input.value.trim());
                  input.value = "";
                }
              }}
              style={{
                display: "flex",
                gap: "10px",
                marginBottom: "20px",
                background: "rgba(255, 255, 255, 0.03)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                padding: "12px 16px",
                borderRadius: "12px",
                alignItems: "center"
              }}
            >
              <span style={{ fontSize: "16px" }}>✍️</span>
              <input
                name="customLogMsg"
                type="text"
                placeholder="Thêm điều cần bổ sung vào nhật ký..."
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "none",
                  color: "#fff",
                  fontSize: "13.5px",
                  outline: "none"
                }}
              />
              <button
                type="submit"
                style={{
                  background: "linear-gradient(135deg, #6c5ce7 0%, #4834d4 100%)",
                  border: "none",
                  color: "#fff",
                  padding: "6px 16px",
                  borderRadius: "8px",
                  fontSize: "12px",
                  fontWeight: "bold",
                  cursor: "pointer",
                  boxShadow: "0 4px 12px rgba(108, 92, 231, 0.2)",
                  transition: "all 0.2s ease"
                }}
              >
                Ghi log
              </button>
            </form>
          )}

          {(nights || []).map((n) => {
            const nightEntries = canViewNightLogs ? (n.entries || []).filter((e) => e.phase !== "day") : [];
            const hasFullLogAccess = isHost || showAllEntries;
            const isPlayerView = !hasFullLogAccess && !gameEnded && !isReplay;
            const processedNightEntries = isPlayerView
              ? filterAndNormalizeNightEntries(
                nightEntries,
                myPlayerId,
                myRole,
                wolves,
                loveState,
                gameRules
              )
              : nightEntries;

            const displayNightEntries = processedNightEntries.filter((e) => {
              if (isLegacyAngelReviveLog(e)) return false;
              if (e.type === "elemental_buff") return false;
              if (!isPlayerView && e.type === "wolf_vote" && (e.voteBreakdown?.length || 0) <= 1) return false;
              if (e.type === "custom_log" && e.message?.startsWith("[Bước ")) return false;
              return true;
            });
            const rawDayEntries = (n.entries || []).filter((e) => e.phase === "day" && !isLegacyAngelReviveLog(e));
            const hasSkippedDayVote = rawDayEntries.some(
              (e) => e.type === "day_vote_skipped" || (e.type === "day_vote" && (e.voteBreakdown?.length || 0) === 0)
            );
            const dayEntries = rawDayEntries.filter(
              (e) => {
                if (e.type === "trial_started") return false;
                if (hasSkippedDayVote && e.type === "day_result" && !e.targetId) return false;
                if (e.type === "custom_log" && e.message?.startsWith("[Bước ")) return false;
                if (e.type === "eliminated") {
                  const targetIds = e.targetIds || [];
                  const trialVerdictOnly =
                    targetIds.length > 0 &&
                    targetIds.every((pid) => {
                      const causes = e.causesByTarget?.[pid] || [];
                      return causes.length > 0 && causes.every((c) => c.type === "trial_verdict");
                    });
                  if (trialVerdictOnly) return false;
                }
                if (e.type === "love_link_death") {
                  if (isPlayerView) {
                    const hasAccess = !!(myPlayerId && (myPlayerId === e.targetId || myPlayerId === e.sourceId));
                    if (!hasAccess) return false;
                  }
                }
                if (e.type === "custom_log" && e.message?.startsWith("__song_trung_victim_guess_wrong__:")) {
                  if (isPlayerView) {
                    const [_, actorId] = e.message.split(":");
                    if (myPlayerId !== actorId) return false;
                  }
                }
                return true;
              }
            );
            const dayVoteEntry = dayEntries.find((e) => e.type === "day_vote");
            const dayVotersByTarget: Record<string, string[]> =
              dayVoteEntry && dayVoteEntry.type === "day_vote"
                ? Object.fromEntries((dayVoteEntry.voteBreakdown || []).map((v) => [v.targetId, v.voterIds || []]))
                : {};
            const dimBucket = !!eliminationFocus && eliminationFocus.night !== n.night;

            const isPlayerViewForGroup = !hasFullLogAccess && !gameEnded;
            const groupedNightEntries = groupLogEntries(
              displayNightEntries,
              rolesByEntry.get(nightEntries[0] || {} as any) || rolesByPlayerId,
              wolves || [],
              nightEntries,
              isBlindWerewolf === true,
              isPlayerViewForGroup,
              myPlayerId,
              gameEnded,
              hasFullLogAccess
            );

            return (
              <div key={n.night} style={{ opacity: dimBucket ? 0.42 : 1, transition: "all 240ms ease", marginTop: 14 }}>
                {canViewNightLogs && (
                  <div className={`game-log-night-section ${hideNightLogs ? "collapsed-night" : ""}`}>
                    <div className="game-log-phase-header game-log-night-header">
                      <AvifIcon name="🌙" style={{ marginRight: 6 }} /> Đêm {n.night}
                    </div>
                    {displayNightEntries.length === 0 ? (
                      <div className="game-log-empty-msg">Không có hành động nào đã xảy ra</div>
                    ) : (
                      <ul className="game-log-list">
                        {groupedNightEntries.map((entry, idx) => {
                          if ("type" in entry && entry.type === "log_thread_group") {
                            return (
                              <LogThreadGroup
                                key={`group-${idx}`}
                                night={n.night}
                                entries={entry.entries}
                                title={entry.title}
                                icon={entry.icon}
                                dayVotersByTarget={dayVotersByTarget}
                                legacyAngelGuessByPair={legacyAngelGuessByPair}
                                playerOnlyDayLogs={isPlayerView}
                                rolesByPlayerId={rolesByEntry.get(n.entries?.[0] || {} as any) || rolesByPlayerId}
                                playerNamesById={playerNamesById}
                                targetRoleDisplayOrderByPlayerId={targetRoleDisplayOrderByPlayerId}
                                eliminationFocus={eliminationFocus}
                                onEliminationFocusChange={setEliminationFocus}
                                onHighlightPlayer={onHighlightPlayer}
                                myPlayerId={myPlayerId}
                                loveState={loveState}
                                wolves={wolves}
                                wolfBadgeRoles={wolfBadgeRoles}
                                gameEnded={gameEnded}
                                isHost={hasFullLogAccess}
                                isBlindWerewolf={isBlindWerewolf}
                                nightEntries={nightEntries}
                              />
                            );
                          }
                          return (
                            <LogEntryLine
                              key={idx}
                              night={n.night}
                              entry={entry as GameLogEntry}
                              dayVotersByTarget={dayVotersByTarget}
                              legacyAngelGuessByPair={legacyAngelGuessByPair}
                              playerOnlyDayLogs={isPlayerView}
                              rolesByPlayerId={rolesByEntry.get(entry as GameLogEntry) || rolesByPlayerId}
                              playerNamesById={playerNamesById}
                              targetRoleDisplayOrderByPlayerId={targetRoleDisplayOrderByPlayerId}
                              eliminationFocus={eliminationFocus}
                              onEliminationFocusChange={setEliminationFocus}
                              onHighlightPlayer={onHighlightPlayer}
                              myPlayerId={myPlayerId}
                              loveState={loveState}
                              wolves={wolves}
                              wolfBadgeRoles={wolfBadgeRoles}
                              gameEnded={gameEnded}
                              isHost={hasFullLogAccess}
                              isBlindWerewolf={isBlindWerewolf}
                              nightEntries={nightEntries}
                            />
                          );
                        })}
                      </ul>
                    )}
                  </div>
                )}

                {dayEntries.length > 0 && (
                  <div className="game-log-day-section">
                    <div className="game-log-phase-header game-log-day-header">
                      <AvifIcon name="🌞" style={{ marginRight: 6 }} /> Ngày {n.night}
                    </div>
                    <ul className="game-log-list">
                      {dayEntries.map((entry, idx) => (
                        <LogEntryLine
                          key={`day-${idx}`}
                          night={n.night}
                          entry={entry}
                          dayVotersByTarget={dayVotersByTarget}
                          legacyAngelGuessByPair={legacyAngelGuessByPair}
                          playerOnlyDayLogs={isPlayerView}
                          rolesByPlayerId={rolesByEntry.get(entry) || rolesByPlayerId}
                          playerNamesById={playerNamesById}
                          targetRoleDisplayOrderByPlayerId={targetRoleDisplayOrderByPlayerId}
                          eliminationFocus={eliminationFocus}
                          onEliminationFocusChange={setEliminationFocus}
                          onHighlightPlayer={onHighlightPlayer}
                          myPlayerId={myPlayerId}
                          loveState={loveState}
                          wolves={wolves}
                          wolfBadgeRoles={wolfBadgeRoles}
                          gameEnded={gameEnded}
                          isHost={hasFullLogAccess}
                          isBlindWerewolf={isBlindWerewolf}
                        />
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </RealNamesContext.Provider>
    </ViewModeContext.Provider>
  );
}
