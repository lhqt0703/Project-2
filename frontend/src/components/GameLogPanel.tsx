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


type ViewMode = "roles" | "names-roles" | "real-names";
const ViewModeContext = createContext<ViewMode>("names-roles");
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
  isRealNamesMode?: boolean
): string {
  const roleName = roleOverride || getRoleName(playerId, rolesByPlayerId);
  if (showRolesOnly) return roleName;
  const name = (isRealNamesMode && realNamesById?.[playerId])
    ? realNamesById[playerId]
    : getPlayerName(playerId, playerNamesById);
  return `${name} ${roleName}`;
}

function getRolePlayersText(
  playerIds: string[] | undefined,
  rolesByPlayerId: RolesByPlayerId,
  playerNamesById: PlayerNamesById,
  showRolesOnly?: boolean,
  realNamesById?: Record<string, string>,
  isRealNamesMode?: boolean
): string {
  if (!playerIds || playerIds.length === 0) return "(không rõ)";
  return playerIds.map((id) => getRolePlayerText(id, rolesByPlayerId, playerNamesById, null, showRolesOnly, realNamesById, isRealNamesMode)).join(", ");
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
    return "Thợ săn đã bắn trúng";
  });
  return parts.join(" và ");
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
            zIndex: 1000,
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
            zIndex: 1000,
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
  const isRealNamesMode = viewMode === "real-names";
  const showRolesOnly = showRolesOnlyProp ?? (viewMode === "roles");

  const roleName = roleOverride || getRoleName(playerId, rolesByPlayerId);
  const playerName = (isRealNamesMode && realNamesById[playerId])
    ? realNamesById[playerId]
    : getPlayerName(playerId, playerNamesById);
  const displayText =
    showRolesOnly
      ? roleName
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
          transition: "opacity 180ms ease",
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
            zIndex: 1000,
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
  const viewMode = useContext(ViewModeContext);
  const showRolesOnly = showRolesOnlyProp ?? (viewMode === "roles");

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
}: {
  emoji: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <li className="game-log-item" style={style}>
      <span className="game-log-item-icon">
        <AvifIcon name={emoji} />
      </span>
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
}) {
  const viewMode = useContext(ViewModeContext);
  const realNamesById = useContext(RealNamesContext);
  const showRolesOnly = viewMode === "roles";
  const isRealNamesMode = viewMode === "real-names";
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
      : getRolePlayersText(playerIds, rolesByPlayerId, playerNamesById, showRolesOnly, realNamesById, isRealNamesMode);

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
    transition: "opacity 180ms ease",
  };

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
            const selectedByText = `Bị chọn bởi: ${getRolePlayersText(v.voterIds, rolesByPlayerId, playerNamesById, showRolesOnly, realNamesById, isRealNamesMode)}`;
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
              return `Bị chọn bởi: ${getRolePlayersText(selectedBy, rolesByPlayerId, playerNamesById, showRolesOnly, realNamesById, isRealNamesMode)}`;
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
      const liveNamesText = getPlayerNamesText(liveVoterIds, playerNamesById);
      const dieNamesText = getPlayerNamesText(dieVoterIds, playerNamesById);
      const allVoteTooltip = `Người chơi sống: ${liveNamesText}\nNgười chơi chết: ${dieNamesText}`;

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

    case "guardian_protect":
      if (entry.actorId && entry.targetId && entry.actorId === entry.targetId) {
        return (
          <LogItem emoji="🛡️" style={lineStyle}>
            <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> đã tự bảo vệ bản thân
          </LogItem>
        );
      }
      return (
        <LogItem emoji="🛡️" style={lineStyle}>
          {entry.actorId ? <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={entry.targetId ? [entry.targetId] : []} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> : "Bảo vệ"} bảo vệ{" "}
          {entry.targetId && <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode={getTargetDisplayMode(entry.targetId)} popupMode="none" secondaryHighlightIds={entry.actorId ? [entry.actorId] : []} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />}
        </LogItem>
      );

    case "protector_bless":
      return (
        <LogItem emoji="✨" style={lineStyle}>
          <RoleSpan
            playerId={entry.actorId}
            rolesByPlayerId={rolesByPlayerId}
            playerNamesById={playerNamesById}
            displayMode="player"
            popupMode="none"
            secondaryHighlightIds={[entry.targetId]}
            onEliminationFocusChange={onEliminationFocusChange}
            onHighlightPlayer={onHighlightPlayer}
          />{" "}trao bất tử cho{" "}
          <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode={getTargetDisplayMode(entry.targetId)} popupMode="none" secondaryHighlightIds={[entry.actorId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />
          {entry.permanent ? <span style={{ opacity: 0.75 }}> đến cuối game</span> : null}
        </LogItem>
      );

    case "protector_save":
      return (
        <LogItem emoji="👼" style={lineStyle}>
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

    case "witch_heal":
      return (
        <LogItem emoji="🧪" style={lineStyle}>
          {entry.actorId ? <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.targetId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> : "Phù thủy"} dùng bình cứu cho{" "}
          {entry.targetId && <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode={getTargetDisplayMode(entry.targetId)} popupMode="none" secondaryHighlightIds={[entry.actorId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />}
        </LogItem>
      );

    case "witch_poison":
      return (
        <LogItem emoji="🧪" style={lineStyle}>
          {entry.actorId ? <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.targetId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> : "Phù thủy"} dùng bình giết{" "}
          {entry.targetId && <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode={getTargetDisplayMode(entry.targetId)} popupMode="none" secondaryHighlightIds={[entry.actorId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />}
        </LogItem>
      );

    case "seer_check": {
      const targetRoleTooltip = `${getPlayerName(entry.targetId, playerNamesById)} là ${getRoleName(entry.targetId, rolesByPlayerId)}`;
      if (entry.blockedByMerchantItem === "invisibility-cloak") {
        return (
          <LogItem emoji="🔮" style={lineStyle}>
            {entry.actorId ? <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.targetId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> : "Tiên tri"} soi{" "}
            {entry.targetId && <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="tooltipOnly" tooltipDetail={targetRoleTooltip} secondaryHighlightIds={[entry.actorId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />}{" "}
            nhưng {getMerchantItemText(entry.blockedByMerchantItem)} chặn lại khiến kết quả ra{" "}
            <span style={{ fontWeight: 600, color: "#27ae60" }}>Dân</span>
          </LogItem>
        );
      }
      return (
        <LogItem emoji="🔮" style={lineStyle}>
          {entry.actorId ? <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.targetId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> : "Tiên tri"} soi{" "}
          {entry.targetId && <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="tooltipOnly" tooltipDetail={targetRoleTooltip} secondaryHighlightIds={[entry.actorId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />}
          {" ra "}
          <span style={{ fontWeight: 600, color: entry.isWolf ? "#e74c3c" : "#27ae60" }}>
            {entry.isWolf ? "Sói" : "Dân"}
          </span>
        </LogItem>
      );
    }

    case "hunter_mark":
      return (
        <LogItem emoji="🎯" style={lineStyle}>
          {entry.actorId ? <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.targetId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> : "Thợ săn"} ghim{" "}
          {entry.targetId && <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode={getTargetDisplayMode(entry.targetId)} popupMode="none" secondaryHighlightIds={[entry.actorId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />}
        </LogItem>
      );

    case "hunter_shot":
      if (entry.blockedByMerchantItem === "iron-armor") {
        return (
          <LogItem emoji="💥" style={lineStyle}>
            {entry.actorId ? <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.targetId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> : "Thợ săn"} bắn{" "}
            {entry.targetId && <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode={getTargetDisplayMode(entry.targetId)} popupMode="none" secondaryHighlightIds={[entry.actorId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />}{" "}
            nhưng {getMerchantItemText(entry.blockedByMerchantItem)} đã chặn lại viên đạn
          </LogItem>
        );
      }
      return (
        <LogItem emoji="💥" style={lineStyle}>
          {entry.actorId ? <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.targetId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> : "Thợ săn"} bắn{" "}
          {entry.targetId && <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode={getTargetDisplayMode(entry.targetId)} popupMode="none" secondaryHighlightIds={[entry.actorId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />}
        </LogItem>
      );

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
            <LogItem emoji="💼" style={lineStyle}>
              Bạn đã đề nghị giao dịch với{" "}
              <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.actorId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />
            </LogItem>
          );
        }
        if (myPlayerId === entry.targetId) {
          return (
            <LogItem emoji="💼" style={lineStyle}>
              Tay Buôn đã đề nghị giao dịch với bạn
            </LogItem>
          );
        }
      }
      return (
        <LogItem emoji="💼" style={lineStyle}>
          <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.targetId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> đề nghị giao dịch với{" "}
          <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode={getTargetDisplayMode(entry.targetId)} popupMode="none" secondaryHighlightIds={[entry.actorId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />: {getMerchantItemText(entry.itemId)} / {getMerchantChoiceText(entry.merchantChoice)}
        </LogItem>
      );
    }

    case "merchant_trade_response":
      return (
        <LogItem emoji="🤝" style={lineStyle}>
          <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode={getTargetDisplayMode(entry.targetId)} popupMode="none" secondaryHighlightIds={[entry.actorId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> phản hồi {getMerchantChoiceText(entry.targetChoice)} với giao dịch {getMerchantItemText(entry.itemId)} của{" "}
          <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.targetId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> ({getMerchantChoiceText(entry.merchantChoice)}) - {getMerchantTradeResultText(entry.result)}
        </LogItem>
      );

    case "merchant_item_received": {
      const isPlayerView = !isHost && !gameEnded;
      if (isPlayerView && myPlayerId && myPlayerId === entry.targetId) {
        return (
          <LogItem emoji="🎁" style={lineStyle}>
            Đã nhận {getMerchantItemText(entry.itemId)}
            <span style={{ opacity: 0.72 }}> (hiệu lực đêm {entry.appliesNight})</span>
          </LogItem>
        );
      }
      return (
        <LogItem emoji="🎁" style={lineStyle}>
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
            <LogItem emoji="👼" style={lineStyle}>
              Đã quyết định theo {getAngelGuessText(resolvedGuess)} và hồi sinh{" "}
              <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.actorId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />
            </LogItem>
          );
        }
        return (
          <LogItem emoji="👼" style={lineStyle}>
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
                  <span style={{ opacity: 0.75, cursor: "pointer", textDecoration: "underline dotted" }}> - tình yêu sóng gió</span>
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

    case "love_link_death":
      return (
        <LogItem emoji="💔" style={lineStyle}>
          <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.sourceId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> chết theo vì{" "}
          <RoleSpan playerId={entry.sourceId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.targetId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> đã chết
        </LogItem>
      );

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

    case "ban_soi_aligned":
      return (
        <LogItem emoji="🦠" style={lineStyle}>
          <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode={getTargetDisplayMode(entry.targetId)} popupMode="none" onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> đã trở thành sói
        </LogItem>
      );

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

    case "saved_by_guardian":
      return null;

    case "saved_by_witch":
      return null;

    case "mysterious_force_eliminated":
      return (
        <LogItem emoji="💀" style={lineStyle}>
          <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> đã bị thế lực bí ẩn hốt mất xác
        </LogItem>
      );

    case "eliminated": {
      const hideEliminationDetails = playerOnlyDayLogs && isDayPhase;
      return (
        <LogItem emoji="💀" style={lineStyle}>
          Người chơi đã bị loại:{" "}
          {entry.targetIds && (
            <RolesListSpan
              playerIds={entry.targetIds}
              rolesByPlayerId={rolesByPlayerId}
              playerNamesById={playerNamesById}
              getTooltipDetail={hideEliminationDetails ? undefined : (pid) => getEliminationCauseText(entry.causesByTarget?.[pid], rolesByPlayerId, playerNamesById, showRolesOnly, realNamesById, isRealNamesMode)}
              getSecondaryHighlightIds={hideEliminationDetails ? undefined : (pid) => {
                const causes = entry.causesByTarget?.[pid] || [];
                const wolfCause = causes.find((c) => c.type === "wolf");
                if (wolfCause && wolfCause.type === "wolf") return wolfCause.attackerIds;
                const loveCause = causes.find((c) => c.type === "love_link");
                return loveCause && loveCause.type === "love_link" ? [loveCause.sourceId] : [];
              }}
              getEliminationFocus={hideEliminationDetails ? undefined : (pid) => ({
                night,
                targetId: pid,
                causes: entry.causesByTarget?.[pid] || [],
              })}
              getItemDimmed={hideEliminationDetails ? undefined : (pid) => {
                if (!eliminationFocus) return false;
                if (eliminationFocus.night !== night) return false;
                if (!(entry.targetIds || []).includes(eliminationFocus.targetId)) return false;
                return pid !== eliminationFocus.targetId;
              }}
              getDisplayMode={getTargetDisplayMode}
              popupMode={hideEliminationDetails ? "none" : "tooltipOnly"}
              onEliminationFocusChange={onEliminationFocusChange}
              onHighlightPlayer={onHighlightPlayer}
            />
          )}
        </LogItem>
      );
    }

    case "no_death":
      return <LogItem emoji="☮️" style={lineStyle}>Đêm qua không ai bị loại</LogItem>;

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

    case "custom_log":
      return <LogItem emoji="📝" style={lineStyle}>{entry.message}</LogItem>;

    default:
      return <LogItem emoji="📝" style={lineStyle}>(log không rõ)</LogItem>;
  }
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
}: GameLogPanelProps) {
  const [localViewMode, setLocalViewMode] = useState<ViewMode>("names-roles");
  const viewMode = viewModeProp ?? localViewMode;
  const setViewMode = onViewModeChange ?? setLocalViewMode;

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownOpen]);

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
          background: linear-gradient(145deg, rgba(23, 26, 33, 0.72) 0%, rgba(15, 17, 21, 0.9) 100%);
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
          flex-wrap: wrap;
        }

        .game-log-panel-title {
          font-size: 20px;
          font-weight: 800;
          background: linear-gradient(135deg, #ffffff 0%, #a29bfe 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          margin: 0;
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .game-log-toggle-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          background: linear-gradient(135deg, rgba(108, 92, 231, 0.18) 0%, rgba(109, 68, 232, 0.12) 100%);
          border: 1px solid rgba(108, 92, 231, 0.4);
          color: #a29bfe;
          padding: 8px 16px;
          border-radius: 20px;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 4px 12px rgba(108, 92, 231, 0.08);
          user-select: none;
        }

        .game-log-toggle-btn:hover {
          background: linear-gradient(135deg, rgba(108, 92, 231, 0.28) 0%, rgba(109, 68, 232, 0.22) 100%);
          border-color: rgba(108, 92, 231, 0.7);
          box-shadow: 0 6px 16px rgba(108, 92, 231, 0.15);
          transform: translateY(-1px);
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
          z-index: 50;
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
      `}</style>

      <div ref={containerRef} className="game-log-panel-container">
        <div className="game-log-panel-header">
          <h3 className="game-log-panel-title">
            <AvifIcon name="📜" style={{ marginRight: 6 }} /> Nhật ký ván chơi
          </h3>
          {canViewNightLogs && (
            <div ref={dropdownRef} style={{ position: "relative" }}>
              <button
                type="button"
                className="game-log-toggle-btn"
                onClick={() => setDropdownOpen(prev => !prev)}
              >
                <span>🎭</span> Chế độ xem: {
                  viewMode === "roles"
                    ? "Chỉ hiện Vai trò"
                    : viewMode === "real-names"
                      ? "Chỉ hiện tên thật"
                      : "Tên & Vai trò"
                }
              </button>
              {dropdownOpen && (
                <div style={{
                  position: "absolute",
                  top: "calc(100% + 6px)",
                  right: 0,
                  background: "rgba(30, 27, 57, 0.95)",
                  backdropFilter: "blur(12px)",
                  border: "1px solid rgba(108, 92, 231, 0.4)",
                  borderRadius: 12,
                  boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
                  padding: "6px 0",
                  zIndex: 200,
                  minWidth: 160,
                  display: "flex",
                  flexDirection: "column",
                }}>
                  <button
                    type="button"
                    onClick={() => { setViewMode("names-roles"); setDropdownOpen(false); }}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: viewMode === "names-roles" ? "#a29bfe" : "#cbd5e1",
                      padding: "8px 16px",
                      textAlign: "left",
                      cursor: "pointer",
                      fontWeight: viewMode === "names-roles" ? "bold" : "normal",
                      fontSize: "13px",
                      backgroundColor: viewMode === "names-roles" ? "rgba(108, 92, 231, 0.15)" : "transparent",
                    }}
                  >
                    Tên & Vai trò
                  </button>
                  <button
                    type="button"
                    onClick={() => { setViewMode("roles"); setDropdownOpen(false); }}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: viewMode === "roles" ? "#a29bfe" : "#cbd5e1",
                      padding: "8px 16px",
                      textAlign: "left",
                      cursor: "pointer",
                      fontWeight: viewMode === "roles" ? "bold" : "normal",
                      fontSize: "13px",
                      backgroundColor: viewMode === "roles" ? "rgba(108, 92, 231, 0.15)" : "transparent",
                    }}
                  >
                    Chỉ hiện Vai trò
                  </button>
                  <button
                    type="button"
                    onClick={() => { setViewMode("real-names"); setDropdownOpen(false); }}
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
                </div>
              )}
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
          const isPlayerView = !isHost && !gameEnded && !isReplay;
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
            if (e.type === "saved_by_witch" || e.type === "saved_by_guardian" || e.type === "elemental_buff") return false;
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
              if (e.type === "saved_by_guardian" || e.type === "saved_by_witch" || e.type === "trial_started") return false;
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
              return true;
            }
          );
          const dayVoteEntry = dayEntries.find((e) => e.type === "day_vote");
          const dayVotersByTarget: Record<string, string[]> =
            dayVoteEntry && dayVoteEntry.type === "day_vote"
              ? Object.fromEntries((dayVoteEntry.voteBreakdown || []).map((v) => [v.targetId, v.voterIds || []]))
              : {};
          const dimBucket = !!eliminationFocus && eliminationFocus.night !== n.night;

          return (
            <div key={n.night} style={{ opacity: dimBucket ? 0.42 : 1, transition: "all 240ms ease", marginTop: 14 }}>
              {canViewNightLogs && (
                <div className="game-log-night-section">
                  <div className="game-log-phase-header game-log-night-header">
                    <AvifIcon name="🌙" style={{ marginRight: 6 }} /> Đêm {n.night}
                  </div>
                  {displayNightEntries.length === 0 ? (
                    <div className="game-log-empty-msg">Không có hành động nào đã xảy ra</div>
                  ) : (
                    <ul className="game-log-list">
                      {displayNightEntries.map((entry, idx) => (
                        <LogEntryLine
                          key={idx}
                          night={n.night}
                          entry={entry}
                          dayVotersByTarget={dayVotersByTarget}
                          legacyAngelGuessByPair={legacyAngelGuessByPair}
                          playerOnlyDayLogs={!isHost && !gameEnded && !isReplay}
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
                          isHost={isHost}
                        />
                      ))}
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
                        playerOnlyDayLogs={!isHost && !gameEnded && !isReplay}
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
                        isHost={isHost}
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
