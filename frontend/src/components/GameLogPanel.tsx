import { useState, useCallback, useRef, useEffect, createContext, useContext } from "react";
import type { GameLogNight, GameLogEntry, EliminationCause } from "../pages/gameRoles/socketEvents";
import { MERCHANT_ITEM_LABELS, type MerchantDecision, type MerchantItemId, type MerchantTradeResult } from "../constants/merchant";
import { ELEMENTAL_BUFF_LABELS } from "../constants/elemental";

const ShowRolesOnlyContext = createContext<boolean>(false);

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

interface GameLogPanelProps {
  nights: GameLogNight[];
  rolesByPlayerId: RolesByPlayerId;
  playerNamesById: PlayerNamesById;
  targetRoleDisplayOrderByPlayerId?: TargetRoleDisplayOrderByPlayerId;
  onHighlightPlayer: (payload: HighlightPayload) => void;
  canViewNightLogs?: boolean;
  isHost?: boolean;
  onAddCustomLog?: (message: string) => void;
}

function getRoleName(playerId: string, rolesByPlayerId: RolesByPlayerId): string {
  return rolesByPlayerId[playerId] || "???";
}

function getPlayerName(playerId: string, playerNamesById: PlayerNamesById): string {
  return playerNamesById[playerId] || playerId.slice(0, 8) + "...";
}

function getRolePlayerText(playerId: string, rolesByPlayerId: RolesByPlayerId, playerNamesById: PlayerNamesById, roleOverride?: string | null, showRolesOnly?: boolean): string {
  const roleName = roleOverride || getRoleName(playerId, rolesByPlayerId);
  if (showRolesOnly) return roleName;
  return `${getPlayerName(playerId, playerNamesById)} ${roleName}`;
}

function getRolePlayersText(playerIds: string[] | undefined, rolesByPlayerId: RolesByPlayerId, playerNamesById: PlayerNamesById, showRolesOnly?: boolean): string {
  if (!playerIds || playerIds.length === 0) return "(không rõ)";
  return playerIds.map((id) => getRolePlayerText(id, rolesByPlayerId, playerNamesById, null, showRolesOnly)).join(", ");
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

function getPlayerNamesText(playerIds: string[] | undefined, playerNamesById: PlayerNamesById, rolesByPlayerId?: RolesByPlayerId, showRolesOnly?: boolean): string {
  if (!playerIds || playerIds.length === 0) return "(không ai)";
  return playerIds.map((id) => {
    if (showRolesOnly && rolesByPlayerId) {
      return getRoleName(id, rolesByPlayerId);
    }
    return getPlayerName(id, playerNamesById);
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

function getElementalBuffLogText(buffId: string, rolesByPlayerId: RolesByPlayerId, playerNamesById: PlayerNamesById, showRolesOnly?: boolean) {
  const targetRole = ELEMENTAL_BUFF_TARGET_ROLE_BY_ID[buffId];
  const actionText = ELEMENTAL_BUFF_ACTION_BY_ID[buffId];
  if (!targetRole || !actionText) return getBuffLabel(buffId);

  const targetPlayerId = getPlayerIdByRole(rolesByPlayerId, targetRole);
  const targetText = targetPlayerId
    ? getRolePlayerText(targetPlayerId, rolesByPlayerId, playerNamesById, null, showRolesOnly)
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

function getEliminationCauseText(causes: EliminationCause[] | undefined, rolesByPlayerId: RolesByPlayerId, playerNamesById: PlayerNamesById, showRolesOnly?: boolean): string {
  if (!causes || causes.length === 0) return "Bị loại";
  const parts = causes.map((cause) => {
    if (cause.type === "wolf") {
      const attackersText = getRolePlayersText(cause.attackerIds, rolesByPlayerId, playerNamesById, showRolesOnly);
      return `Bị ${attackersText} cắn`;
    }
    if (cause.type === "witch_poison") return "Phù thủy quăng bình giết";
    if (cause.type === "merchant_gunpowder") {
      return `Nổ thuốc súng từ ${getRolePlayerText(cause.sourceId, rolesByPlayerId, playerNamesById, null, showRolesOnly)}`;
    }
    if (cause.type === "love_link") {
      return `Chết theo cặp đôi với ${getRolePlayerText(cause.sourceId, rolesByPlayerId, playerNamesById, null, showRolesOnly)}`;
    }
    if (cause.type === "day_vote") {
      const votersText = getPlayerNamesText(cause.voterIds, playerNamesById, rolesByPlayerId, showRolesOnly);
      return `Bị biểu quyết bởi: ${votersText}`;
    }
    if (cause.type === "trial_verdict") {
      const votersText = getPlayerNamesText(cause.voterIds, playerNamesById, rolesByPlayerId, showRolesOnly);
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

  const showRolesOnlyContext = useContext(ShowRolesOnlyContext);
  const showRolesOnly = showRolesOnlyProp ?? showRolesOnlyContext;

  const roleName = roleOverride || getRoleName(playerId, rolesByPlayerId);
  const playerName = getPlayerName(playerId, playerNamesById);
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
  const showRolesOnlyContext = useContext(ShowRolesOnlyContext);
  const showRolesOnly = showRolesOnlyProp ?? showRolesOnlyContext;

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
      <span className="game-log-item-icon">{emoji}</span>
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
}) {
  const showRolesOnly = useContext(ShowRolesOnlyContext);
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
      ? getPlayerNamesText(playerIds, playerNamesById, rolesByPlayerId, showRolesOnly)
      : getRolePlayersText(playerIds, rolesByPlayerId, playerNamesById, showRolesOnly);

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
    case "wolf_vote":
      if (!entry.voteBreakdown || entry.voteBreakdown.length === 0) {
        return <LogItem emoji="🐺" style={lineStyle}>Phe sói nhắm đến: (không ai cả)</LogItem>;
      }
      return (
        <LogItem emoji="🐺" style={lineStyle}>
          Phe sói nhắm đến:{" "}
          {entry.voteBreakdown.map((v, idx) => {
            const selectedByText = `Bị chọn bởi: ${getRolePlayersText(v.voterIds, rolesByPlayerId, playerNamesById, showRolesOnly)}`;
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
        return <LogItem emoji="🐺" style={lineStyle}>Phe sói không thống nhất được sẽ cắn ai</LogItem>;
      }
      {
        const villageChiefDelayedIds = (entry.villageChiefDelayedTargetIds || []).filter((pid) => entry.targetIds.includes(pid));
        const villageChiefDelayedSet = new Set(villageChiefDelayedIds);
        const normalTargetIds = entry.targetIds.filter((pid) => !villageChiefDelayedSet.has(pid));
        const renderTargetList = (playerIds: string[]) => (
          <RolesListSpan
            playerIds={playerIds}
            rolesByPlayerId={rolesByPlayerId}
            playerNamesById={playerNamesById}
            getTooltipDetail={(pid) => {
              const selectedBy = entry.selectedByByTarget?.[pid] || [];
              if (!selectedBy.length) return undefined;
              return `Bị chọn bởi: ${getRolePlayersText(selectedBy, rolesByPlayerId, playerNamesById, showRolesOnly)}`;
            }}
            getSecondaryHighlightIds={(pid) => entry.selectedByByTarget?.[pid] || []}
            getDisplayMode={getTargetDisplayMode}
            popupMode="none"
            onEliminationFocusChange={onEliminationFocusChange}
            onHighlightPlayer={onHighlightPlayer}
          />
        );

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
      const allVoteTooltip = `Người chơi sống: ${liveNamesText} | Người chơi chết: ${dieNamesText}`;

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
          <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.actorId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> và thấy{" "}
          <span style={{ fontWeight: 700, color: entry.hasWolf ? "#e74c3c" : "#27ae60" }}>{entry.hasWolf ? "có mùi sói" : "không có mùi sói"}</span>
        </LogItem>
      );
    }

    case "merchant_trade_offer":
      return (
        <LogItem emoji="💼" style={lineStyle}>
          <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.targetId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> đề nghị giao dịch với{" "}
          <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode={getTargetDisplayMode(entry.targetId)} popupMode="none" secondaryHighlightIds={[entry.actorId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />: {getMerchantItemText(entry.itemId)} / {getMerchantChoiceText(entry.merchantChoice)}
        </LogItem>
      );

    case "merchant_trade_response":
      return (
        <LogItem emoji="🤝" style={lineStyle}>
          <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode={getTargetDisplayMode(entry.targetId)} popupMode="none" secondaryHighlightIds={[entry.actorId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> phản hồi {getMerchantChoiceText(entry.targetChoice)} với giao dịch {getMerchantItemText(entry.itemId)} của{" "}
          <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.targetId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> ({getMerchantChoiceText(entry.merchantChoice)}) - {getMerchantTradeResultText(entry.result)}
        </LogItem>
      );

    case "merchant_item_received":
      return (
        <LogItem emoji="🎁" style={lineStyle}>
          <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode={getTargetDisplayMode(entry.targetId)} popupMode="none" onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> nhận {getMerchantItemText(entry.itemId)}
          <span style={{ opacity: 0.72 }}> (hiệu lực đêm {entry.appliesNight})</span>
        </LogItem>
      );

    case "merchant_item_expired":
      return (
        null
      );

    case "merchant_item_used":
      if (entry.itemId === "poppy-glasses" && entry.actorId && entry.targetId) {
        return (
          <LogItem emoji="✨" style={lineStyle}>
            <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.targetId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> đã thấy{" "}
            <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode={getTargetDisplayMode(entry.targetId)} popupMode="none" secondaryHighlightIds={[entry.actorId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> được bảo vệ {/* thông qua {getMerchantItemText(entry.itemId)} */}
          </LogItem>
        );
      }
      if (entry.itemId === "gunpowder-barrel" && entry.sourceId) {
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
        const legacyGuess = legacyAngelGuessByPair[`${entry.actorId}:${entry.targetId}`];
        const resolvedGuess = entry.guess ?? legacyGuess;
        return (
          <LogItem emoji="👼" style={lineStyle}>
            Thiên sứ{" "}
            <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.targetId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />{" "}
            quyết định theo {getAngelGuessText(resolvedGuess)} và hồi sinh{" "}
            <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.actorId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />
          </LogItem>
        );
      }

    case "angel_outcome":
      return (
        <LogItem emoji="🌟" style={lineStyle}>
          <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode={getDayLogDisplayMode("player-role")} popupMode="none" secondaryHighlightIds={[entry.targetId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> {getAngelOutcomeText(entry)} với lựa chọn hồi sinh{" "}
          <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode={getTargetDisplayMode(entry.targetId)} popupMode="none" secondaryHighlightIds={[entry.actorId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />
        </LogItem>
      );

    case "love_pair":
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
          {entry.targetWolfAligned ? <span style={{ opacity: 0.75 }}> - tình yêu trái phe</span> : null}
        </LogItem>
      );

    case "love_escape_vote":
      return (
        <LogItem emoji="🕊️" style={lineStyle}>
          <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.partnerId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> muốn ra khỏi làng, đang chờ{" "}
          <RoleSpan playerId={entry.partnerId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.actorId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />
        </LogItem>
      );

    case "love_escape_missed":
      return (
        <LogItem emoji="🕊️" style={lineStyle}>
          <RoleSpan playerId={entry.partnerId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.actorId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> không đồng ý ra khỏi làng
        </LogItem>
      );

    case "love_escape": {
      const pairNames = (entry.targetIds || []).map((id) => showRolesOnly ? getRoleName(id, rolesByPlayerId) : getPlayerName(id, playerNamesById)).join(" và ") || "(không ai)";
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

    case "spirit_wolf_decision":
      return (
        <LogItem emoji="🐺" style={lineStyle}>
          {entry.actorId ? <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode={getDayLogDisplayMode("player-role")} popupMode="none" onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> : "Linh sói"} quyết định: <span style={{ fontWeight: 600 }}>{entry.saved ? "CỨU" : "KHÔNG CỨU"}</span>
          {entry.timedOut ? (
            <TimeoutBadge message="Quá thời gian chờ thực hiện hành động" />
          ) : null}
        </LogItem>
      );

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
              getTooltipDetail={hideEliminationDetails ? undefined : (pid) => getEliminationCauseText(entry.causesByTarget?.[pid], rolesByPlayerId, playerNamesById, showRolesOnly)}
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
      const targetRoleTooltip = `${getPlayerName(entry.targetId, playerNamesById)} là ${getRoleName(entry.targetId, rolesByPlayerId)}`;
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
          />{" là dân làng nguyên tố"} - {entry.isCorrect ? "✅" : "❌"}{" "}
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
            tooltipDetail={getRolePlayersText(correctIds, rolesByPlayerId, playerNamesById, showRolesOnly)}
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
      const tooltipDetail = `${entry.randomTieBreak ? "Được chọn ngẫu nhiên do hòa phiếu | " : ""}Người chọn hiệu ứng này: ${getRolePlayersText(chosenVoterIds, rolesByPlayerId, playerNamesById, showRolesOnly)}`;
      return (
        <LogItem emoji="⚡" style={lineStyle}>
          Hiệu ứng hỗ trợ từ dân làng nguyên tố:{" "}
          <ActionSpan
            highlightPayload={{ primaryId: targetPlayerId, secondaryIds: chosenVoterIds, dangerIds: [] }}
            tooltipDetail={tooltipDetail}
            onHighlightPlayer={onHighlightPlayer}
          >
            <span style={{ fontWeight: 600 }}>{getElementalBuffLogText(entry.chosenBuffId, rolesByPlayerId, playerNamesById, showRolesOnly)}</span>
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
}: GameLogPanelProps) {
  const [showRolesOnly, setShowRolesOnly] = useState(false);
  const [eliminationFocus, setEliminationFocus] = useState<EliminationFocus | null>(null);
  const legacyAngelGuessByPair = Object.fromEntries(
    (nights || [])
      .flatMap((n) => n.entries || [])
      .filter((e) => e.type === "angel_revive_choice")
      .map((e) => [`${e.actorId}:${e.targetId}`, e.guess])
  );

  return (
    <ShowRolesOnlyContext.Provider value={showRolesOnly}>
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
          overflow: hidden;
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

        .game-log-item:hover {
          background: rgba(255, 255, 255, 0.03);
          transform: translateX(2px);
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

      <div className="game-log-panel-container">
        <div className="game-log-panel-header">
          <h3 className="game-log-panel-title">
            <span>📜</span> Nhật ký ván chơi
          </h3>
          {canViewNightLogs && (
            <button
              type="button"
              className="game-log-toggle-btn"
              onClick={() => setShowRolesOnly((prev) => !prev)}
            >
              <span>🎭</span> Chế độ xem: {showRolesOnly ? "Chỉ hiện Vai trò" : "Tên & Vai trò"}
            </button>
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
          const displayNightEntries = nightEntries.filter((e) => {
            if (isLegacyAngelReviveLog(e)) return false;
            if (e.type === "saved_by_witch" || e.type === "saved_by_guardian" || e.type === "elemental_buff") return false;
            if (e.type === "wolf_vote" && (e.voteBreakdown?.length || 0) <= 1) return false;
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
                    <span>🌙</span> Đêm {n.night}
                  </div>
                  {displayNightEntries.length === 0 ? (
                    <div className="game-log-empty-msg">Không có sự kiện đêm.</div>
                  ) : (
                    <ul className="game-log-list">
                      {displayNightEntries.map((entry, idx) => (
                        <LogEntryLine
                          key={idx}
                          night={n.night}
                          entry={entry}
                          dayVotersByTarget={dayVotersByTarget}
                          legacyAngelGuessByPair={legacyAngelGuessByPair}
                          playerOnlyDayLogs={!canViewNightLogs}
                          rolesByPlayerId={rolesByPlayerId}
                          playerNamesById={playerNamesById}
                          targetRoleDisplayOrderByPlayerId={targetRoleDisplayOrderByPlayerId}
                          eliminationFocus={eliminationFocus}
                          onEliminationFocusChange={setEliminationFocus}
                          onHighlightPlayer={onHighlightPlayer}
                        />
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {dayEntries.length > 0 && (
                <div className="game-log-day-section">
                  <div className="game-log-phase-header game-log-day-header">
                    <span>🌞</span> Ngày {n.night}
                  </div>
                  <ul className="game-log-list">
                    {dayEntries.map((entry, idx) => (
                      <LogEntryLine
                        key={`day-${idx}`}
                        night={n.night}
                        entry={entry}
                        dayVotersByTarget={dayVotersByTarget}
                        legacyAngelGuessByPair={legacyAngelGuessByPair}
                        playerOnlyDayLogs={!canViewNightLogs}
                        rolesByPlayerId={rolesByPlayerId}
                        playerNamesById={playerNamesById}
                        targetRoleDisplayOrderByPlayerId={targetRoleDisplayOrderByPlayerId}
                        eliminationFocus={eliminationFocus}
                        onEliminationFocusChange={setEliminationFocus}
                        onHighlightPlayer={onHighlightPlayer}
                      />
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </ShowRolesOnlyContext.Provider>
  );
}
