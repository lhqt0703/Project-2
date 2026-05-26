import { useState, useCallback, useRef, useEffect } from "react";
import type { GameLogNight, GameLogEntry, EliminationCause } from "../pages/gameRoles/socketEvents";
import { MERCHANT_ITEM_LABELS, type MerchantDecision, type MerchantItemId, type MerchantTradeResult } from "../constants/merchant";
import { ELEMENTAL_BUFF_LABELS } from "../constants/elemental";

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
}

function getRoleName(playerId: string, rolesByPlayerId: RolesByPlayerId): string {
  return rolesByPlayerId[playerId] || "???";
}

function getPlayerName(playerId: string, playerNamesById: PlayerNamesById): string {
  return playerNamesById[playerId] || playerId.slice(0, 8) + "...";
}

function getRolePlayerText(playerId: string, rolesByPlayerId: RolesByPlayerId, playerNamesById: PlayerNamesById, roleOverride?: string | null): string {
  const roleName = roleOverride || getRoleName(playerId, rolesByPlayerId);
  return `${getPlayerName(playerId, playerNamesById)} ${roleName}`;
}

function getRolePlayersText(playerIds: string[] | undefined, rolesByPlayerId: RolesByPlayerId, playerNamesById: PlayerNamesById): string {
  if (!playerIds || playerIds.length === 0) return "(không rõ)";
  return playerIds.map((id) => getRolePlayerText(id, rolesByPlayerId, playerNamesById)).join(", ");
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

function getPlayerNamesText(playerIds: string[] | undefined, playerNamesById: PlayerNamesById): string {
  if (!playerIds || playerIds.length === 0) return "(không ai)";
  return playerIds.map((id) => getPlayerName(id, playerNamesById)).join(", ");
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

function getElementalBuffLogText(buffId: string, rolesByPlayerId: RolesByPlayerId, playerNamesById: PlayerNamesById) {
  const targetRole = ELEMENTAL_BUFF_TARGET_ROLE_BY_ID[buffId];
  const actionText = ELEMENTAL_BUFF_ACTION_BY_ID[buffId];
  if (!targetRole || !actionText) return getBuffLabel(buffId);

  const targetPlayerId = getPlayerIdByRole(rolesByPlayerId, targetRole);
  const targetText = targetPlayerId
    ? getRolePlayerText(targetPlayerId, rolesByPlayerId, playerNamesById)
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

function getEliminationCauseText(causes: EliminationCause[] | undefined, rolesByPlayerId: RolesByPlayerId, playerNamesById: PlayerNamesById): string {
  if (!causes || causes.length === 0) return "Bị loại";
  const parts = causes.map((cause) => {
    if (cause.type === "wolf") {
      const attackersText = getRolePlayersText(cause.attackerIds, rolesByPlayerId, playerNamesById);
      return `Bị ${attackersText} cắn`;
    }
    if (cause.type === "witch_poison") return "Phù thủy quăng bình giết";
    if (cause.type === "merchant_gunpowder") {
      return `Nổ thuốc súng từ ${getRolePlayerText(cause.sourceId, rolesByPlayerId, playerNamesById)}`;
    }
    if (cause.type === "love_link") {
      return `Chết theo cặp đôi với ${getRolePlayerText(cause.sourceId, rolesByPlayerId, playerNamesById)}`;
    }
    if (cause.type === "day_vote") {
      const votersText = getPlayerNamesText(cause.voterIds, playerNamesById);
      return `Bị biểu quyết bởi: ${votersText}`;
    }
    if (cause.type === "trial_verdict") {
      const votersText = getPlayerNamesText(cause.voterIds, playerNamesById);
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
}) {
  const [showPopup, setShowPopup] = useState(false);
  const spanRef = useRef<HTMLSpanElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  const roleName = roleOverride || getRoleName(playerId, rolesByPlayerId);
  const playerName = getPlayerName(playerId, playerNamesById);
  const displayText =
    displayMode === "player"
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
}) {
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
          />
          {idx < playerIds.length - 1 && ", "}
        </span>
      ))}
    </>
  );
}

function LogEntryLine({
  night,
  entry,
  dayVotersByTarget,
  legacyAngelGuessByPair,
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
  rolesByPlayerId: RolesByPlayerId;
  playerNamesById: PlayerNamesById;
  targetRoleDisplayOrderByPlayerId?: TargetRoleDisplayOrderByPlayerId;
  eliminationFocus: EliminationFocus | null;
  onEliminationFocusChange: (focus: EliminationFocus | null) => void;
  onHighlightPlayer: (payload: HighlightPayload) => void;
}) {
  const isDayPhase = entry.phase === "day";
  const getTargetDisplayMode = (playerId: string) =>
    getTargetRoleDisplayOrder(playerId, playerNamesById, targetRoleDisplayOrderByPlayerId);
  const getVotersText = (playerIds: string[] | undefined) =>
    isDayPhase
      ? getPlayerNamesText(playerIds, playerNamesById)
      : getRolePlayersText(playerIds, rolesByPlayerId, playerNamesById);

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
        return <li style={lineStyle}>Phe sói nhắm đến: (không ai cả)</li>;
      }
      return (
        <li style={lineStyle}>
          Phe sói nhắm đến:{" "}
          {entry.voteBreakdown.map((v, idx) => {
            const selectedByText = `Bị chọn bởi: ${getRolePlayersText(v.voterIds, rolesByPlayerId, playerNamesById)}`;
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
        </li>
      );

    case "day_vote":
      if (!entry.voteBreakdown || entry.voteBreakdown.length === 0) {
        return <li style={lineStyle}>Biểu quyết đã được bỏ qua</li>;
      }
      return (
        <li style={lineStyle}>
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
        </li>
      );

    case "day_vote_skipped":
      return <li style={lineStyle}>Biểu quyết đã được bỏ qua</li>;

    case "wolf_result":
      if (!entry.targetIds || entry.targetIds.length === 0) {
        return <li style={lineStyle}>Phe sói không thống nhất được sẽ cắn ai</li>;
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
              return `Bị chọn bởi: ${getRolePlayersText(selectedBy, rolesByPlayerId, playerNamesById)}`;
            }}
            getSecondaryHighlightIds={(pid) => entry.selectedByByTarget?.[pid] || []}
            getDisplayMode={getTargetDisplayMode}
            popupMode="none"
            onEliminationFocusChange={onEliminationFocusChange}
            onHighlightPlayer={onHighlightPlayer}
          />
        );

        return (
          <li style={lineStyle}>
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
          </li>
        );
      }

    case "day_result":
      if (!entry.targetId) {
        return <li style={lineStyle}>Kết quả biểu quyết: hòa phiếu / không ai lên giàn</li>;
      }
      {
        const voterIds = dayVotersByTarget[entry.targetId] || [];
        const tooltipDetail = voterIds.length ? `Bị vote bởi: ${getVotersText(voterIds)}` : undefined;
        return (
          <li style={lineStyle}>
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
          </li>
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
        <li style={lineStyle}>
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
        </li>
      );
    }

    case "bonus_bite":
      return <li style={{ ...lineStyle, fontStyle: "italic", opacity: dimmed ? 0.28 : 0.85 }}>⚠️ Đêm nay Sói được cắn 2 người (do Sói con đã chết)</li>;

    case "night_action_extra_time":
      return (
        <li style={lineStyle}>
          <RoleSpan
            playerId={entry.targetId}
            rolesByPlayerId={rolesByPlayerId}
            playerNamesById={playerNamesById}
            displayMode="role-player"
            popupMode="none"
            roleOverride={entry.roleName}
            onEliminationFocusChange={onEliminationFocusChange}
            onHighlightPlayer={onHighlightPlayer}
          />{" "}
          đã được quản trò cộng thêm thời gian hành động
          {entry.extraSeconds ? <span style={{ opacity: 0.72 }}> (+{entry.extraSeconds}s)</span> : null}
        </li>
      );

    case "guardian_protect":
      if (entry.actorId && entry.targetId && entry.actorId === entry.targetId) {
        return (
          <li style={lineStyle}>
            <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> đã tự bảo vệ bản thân
          </li>
        );
      }
      return (
        <li style={lineStyle}>
          {entry.actorId ? <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={entry.targetId ? [entry.targetId] : []} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> : "Bảo vệ"} bảo vệ{" "}
          {entry.targetId && <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode={getTargetDisplayMode(entry.targetId)} popupMode="none" secondaryHighlightIds={entry.actorId ? [entry.actorId] : []} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />}
        </li>
      );

    case "protector_bless":
      return (
        <li style={lineStyle}>
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
        </li>
      );

    case "protector_save":
      return (
        <li style={lineStyle}>
          Bất tử của{" "}
          {entry.actorId ? <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player-role" popupMode="none" secondaryHighlightIds={[entry.targetId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> : "Hộ nhân"}{" "}
          chặn một lần chết lên{" "}
          <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode={getTargetDisplayMode(entry.targetId)} popupMode="none" secondaryHighlightIds={entry.actorId ? [entry.actorId] : []} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />
          {/* {entry.permanent ? <span style={{ opacity: 0.75 }}> (vẫn còn hiệu lực)</span> : null} */}
        </li>
      );

    case "village_chief_revealed":
      return (
        <li style={lineStyle}>
          <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> lộ diện bản thân là Trưởng Làng và tiếp tục sống
        </li>
      );

    case "village_chief_delayed_death":
      return (
        <li style={lineStyle}>
          <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode={getTargetDisplayMode(entry.targetId)} popupMode="none" onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> đã hết máu
        </li>
      );

    case "village_chief_extra_vote_started":
      return (
        <li style={lineStyle}>
          Trưởng làng{" "}
          <RoleSpan playerId={entry.chiefId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> đã mở thêm một lượt biểu quyết
        </li>
      );

    case "witch_heal":
      return (
        <li style={lineStyle}>
          {entry.actorId ? <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.targetId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> : "Phù thủy"} dùng bình cứu cho{" "}
          {entry.targetId && <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode={getTargetDisplayMode(entry.targetId)} popupMode="none" secondaryHighlightIds={[entry.actorId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />}
        </li>
      );

    case "witch_poison":
      return (
        <li style={lineStyle}>
          {entry.actorId ? <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.targetId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> : "Phù thủy"} dùng bình giết{" "}
          {entry.targetId && <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode={getTargetDisplayMode(entry.targetId)} popupMode="none" secondaryHighlightIds={[entry.actorId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />}
        </li>
      );

    case "seer_check": {
      const targetRoleTooltip = `${getPlayerName(entry.targetId, playerNamesById)} là ${getRoleName(entry.targetId, rolesByPlayerId)}`;
      if (entry.blockedByMerchantItem === "invisibility-cloak") {
        return (
          <li style={lineStyle}>
            {entry.actorId ? <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.targetId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> : "Tiên tri"} soi{" "}
            {entry.targetId && <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="tooltipOnly" tooltipDetail={targetRoleTooltip} secondaryHighlightIds={[entry.actorId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />}{" "}
            nhưng {getMerchantItemText(entry.blockedByMerchantItem)} chặn lại khiến kết quả ra{" "}
            <span style={{ fontWeight: 600, color: "#27ae60" }}>Dân</span>
          </li>
        );
      }
      return (
        <li style={lineStyle}>
          {entry.actorId ? <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.targetId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> : "Tiên tri"} soi{" "}
          {entry.targetId && <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="tooltipOnly" tooltipDetail={targetRoleTooltip} secondaryHighlightIds={[entry.actorId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />}
          {" ra "}
          <span style={{ fontWeight: 600, color: entry.isWolf ? "#e74c3c" : "#27ae60" }}>
            {entry.isWolf ? "Sói" : "Dân"}
          </span>
        </li>
      );
    }

    case "hunter_mark":
      return (
        <li style={lineStyle}>
          {entry.actorId ? <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.targetId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> : "Thợ săn"} ghim{" "}
          {entry.targetId && <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode={getTargetDisplayMode(entry.targetId)} popupMode="none" secondaryHighlightIds={[entry.actorId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />}
        </li>
      );

    case "hunter_shot":
      if (entry.blockedByMerchantItem === "iron-armor") {
        return (
          <li style={lineStyle}>
            {entry.actorId ? <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.targetId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> : "Thợ săn"} bắn{" "}
            {entry.targetId && <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode={getTargetDisplayMode(entry.targetId)} popupMode="none" secondaryHighlightIds={[entry.actorId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />}{" "}
            nhưng {getMerchantItemText(entry.blockedByMerchantItem)} đã chặn lại viên đạn
          </li>
        );
      }
      return (
        <li style={lineStyle}>
          {entry.actorId ? <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.targetId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> : "Thợ săn"} bắn{" "}
          {entry.targetId && <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode={getTargetDisplayMode(entry.targetId)} popupMode="none" secondaryHighlightIds={[entry.actorId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />}
        </li>
      );

    case "cursed_sniff": {
      const blockedIds = entry.blockedByMintPlayerIds || [];
      if (blockedIds.length > 0 && !entry.hasWolf) {
        return (
          <li style={lineStyle}>
            <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.targetId, ...blockedIds]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> không ngửi thấy mùi sói xung quanh{" "}
            <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.actorId, ...blockedIds]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> do{" "}
            <RolesListSpan playerIds={blockedIds} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player-role" popupMode="none" onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> đã có {getMerchantItemText("mint")} chặn lại mùi
          </li>
        );
      }
      return (
        <li style={lineStyle}>
          <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.targetId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> đánh hơi quanh{" "}
          <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.actorId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> và thấy{" "}
          <span style={{ fontWeight: 700, color: entry.hasWolf ? "#e74c3c" : "#27ae60" }}>{entry.hasWolf ? "có mùi sói" : "không có mùi sói"}</span>
        </li>
      );
    }

    case "merchant_trade_offer":
      return (
        <li style={lineStyle}>
          <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.targetId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> đề nghị giao dịch với{" "}
          <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode={getTargetDisplayMode(entry.targetId)} popupMode="none" secondaryHighlightIds={[entry.actorId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />: {getMerchantItemText(entry.itemId)} / {getMerchantChoiceText(entry.merchantChoice)}
        </li>
      );

    case "merchant_trade_response":
      return (
        <li style={lineStyle}>
          <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode={getTargetDisplayMode(entry.targetId)} popupMode="none" secondaryHighlightIds={[entry.actorId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> phản hồi {getMerchantChoiceText(entry.targetChoice)} với giao dịch {getMerchantItemText(entry.itemId)} của{" "}
          <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.targetId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> ({getMerchantChoiceText(entry.merchantChoice)}) - {getMerchantTradeResultText(entry.result)}
        </li>
      );

    case "merchant_item_received":
      return (
        <li style={lineStyle}>
          <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode={getTargetDisplayMode(entry.targetId)} popupMode="none" onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> nhận {getMerchantItemText(entry.itemId)}
          <span style={{ opacity: 0.72 }}> (hiệu lực đêm {entry.appliesNight})</span>
        </li>
      );

    case "merchant_item_expired":
      return (
        null
      );

    case "merchant_item_used":
      if (entry.itemId === "poppy-glasses" && entry.actorId && entry.targetId) {
        return (
          <li style={lineStyle}>
            <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.targetId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> đã thấy{" "}
            <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode={getTargetDisplayMode(entry.targetId)} popupMode="none" secondaryHighlightIds={[entry.actorId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> được bảo vệ {/* thông qua {getMerchantItemText(entry.itemId)} */}
          </li>
        );
      }
      if (entry.itemId === "gunpowder-barrel" && entry.sourceId) {
        return (
          <li style={lineStyle}>
            {getMerchantItemText(entry.itemId)} trên{" "}
            <RoleSpan playerId={entry.sourceId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player-role" popupMode="none" secondaryHighlightIds={entry.targetIds || []} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> phát nổ
            {entry.targetIds?.length ? (
              <>
                {" "}khiến{" "}
                <RolesListSpan playerIds={entry.targetIds} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} getDisplayMode={getTargetDisplayMode} popupMode="none" onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> chết chùm chung theo
              </>
            ) : null}
          </li>
        );
      }
      if (entry.itemId === "moth-cocoon" && entry.targetId) {
        return (
          <li style={lineStyle}>
            Bướm đêm đã kéo dài hiệu lực hoa bảo vệ lên{" "}
            <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode={getTargetDisplayMode(entry.targetId)} popupMode="none" onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> thêm đêm nay
          </li>
        );
      }
      return null;

    case "merchant_win_condition_completed":
      return (
        <li style={lineStyle}>
          <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player-role" popupMode="none" onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> đã hoàn thành điều kiện thắng của Tay Buôn với {entry.successfulTrades} giao dịch thành công
          <span style={{ opacity: 0.72 }}> (mốc {entry.requiredTrades})</span>
          <span style={{ opacity: 0.72 }}> (ván chơi vẫn tiếp tục)</span>
        </li>
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
          <li style={lineStyle}>
            Thiên sứ{" "}
            <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.targetId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />{" "}
            quyết định theo {getAngelGuessText(resolvedGuess)} và hồi sinh{" "}
            <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.actorId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />
          </li>
        );
      }

    case "angel_outcome":
      return (
        <li style={lineStyle}>
          <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player-role" popupMode="none" secondaryHighlightIds={[entry.targetId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> {getAngelOutcomeText(entry)} với lựa chọn hồi sinh{" "}
          <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode={getTargetDisplayMode(entry.targetId)} popupMode="none" secondaryHighlightIds={[entry.actorId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />
        </li>
      );

    case "love_pair":
      return (
        <li style={lineStyle}>
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
        </li>
      );

    case "love_escape_vote":
      return (
        <li style={lineStyle}>
          <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.partnerId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> muốn ra khỏi làng, đang chờ{" "}
          <RoleSpan playerId={entry.partnerId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.actorId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />
        </li>
      );

    case "love_escape_missed":
      return (
        <li style={lineStyle}>
          <RoleSpan playerId={entry.partnerId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.actorId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> không đồng ý ra khỏi làng
        </li>
      );

    case "love_escape": {
      const pairNames = (entry.targetIds || []).map((id) => getPlayerName(id, playerNamesById)).join(" và ") || "(không ai)";
      return (
        <li style={lineStyle}>
          <ActionSpan
            highlightPayload={{ primaryId: null, secondaryIds: entry.targetIds || [], dangerIds: [] }}
            tooltipDetail={pairNames}
            onHighlightPlayer={onHighlightPlayer}
          >
            Cặp đôi
          </ActionSpan>{" "}đã cùng nhau ra khỏi làng
        </li>
      );
    }

    case "love_link_death":
      return (
        <li style={lineStyle}>
          <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.sourceId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> chết theo vì{" "}
          <RoleSpan playerId={entry.sourceId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.targetId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> đã chết
        </li>
      );

    case "spirit_wolf_decision":
      return (
        <li style={lineStyle}>
          {entry.actorId ? <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player-role" popupMode="none" onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> : "Linh sói"} quyết định: <span style={{ fontWeight: 600 }}>{entry.saved ? "CỨU" : "KHÔNG CỨU"}</span>
          {entry.timedOut ? (
            <TimeoutBadge message="Quá thời gian chờ thực hiện hành động" />
          ) : null}
        </li>
      );

    case "ban_soi_aligned":
      return (
        <li style={lineStyle}>
          <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode={getTargetDisplayMode(entry.targetId)} popupMode="none" onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> đã trở thành sói
        </li>
      );

    case "wild_wolf_conversion":
      if (!entry.targetId || entry.reason === "no_target") {
        return (
          <li style={lineStyle}>
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
          </li>
        );
      }
      if (entry.success) {
        return (
          <li style={lineStyle}>
            <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} secondaryHighlightIds={entry.actorId ? [entry.actorId] : []} displayMode={getTargetDisplayMode(entry.targetId)} popupMode="none" roleOverride={entry.previousTargetRole} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />{" "}
            đã bị lây dại từ{" "}
            {entry.actorId ? (
              <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.targetId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />
            ) : "Sói Dại"}{" "}
            và trở thành sói
          </li>
        );
      }
      return (
        <li style={lineStyle}>
          {entry.actorId ? (
            <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" secondaryHighlightIds={[entry.targetId]} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />
          ) : "Sói Dại"}{" "}
          không lây dại được{" "}
          <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} secondaryHighlightIds={entry.actorId ? [entry.actorId] : []} displayMode={getTargetDisplayMode(entry.targetId)} popupMode="none" roleOverride={entry.previousTargetRole} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />
          {" "}vì được cứu khỏi vết cắn, kỹ năng chưa bị tính là đã dùng
        </li>
      );

    case "saved_by_guardian":
      return null;

    case "saved_by_witch":
      return null;

    case "mysterious_force_eliminated":
      return (
        <li style={lineStyle}>
          <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} displayMode="player" popupMode="none" onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> đã bị thế lực bí ẩn hốt mất xác
        </li>
      );

    case "eliminated":
      return (
        <li style={lineStyle}>
          Người chơi đã bị loại:{" "}
          {entry.targetIds && (
            <RolesListSpan
              playerIds={entry.targetIds}
              rolesByPlayerId={rolesByPlayerId}
              playerNamesById={playerNamesById}
              getTooltipDetail={(pid) => getEliminationCauseText(entry.causesByTarget?.[pid], rolesByPlayerId, playerNamesById)}
              getSecondaryHighlightIds={(pid) => {
                const causes = entry.causesByTarget?.[pid] || [];
                const wolfCause = causes.find((c) => c.type === "wolf");
                if (wolfCause && wolfCause.type === "wolf") return wolfCause.attackerIds;
                const loveCause = causes.find((c) => c.type === "love_link");
                return loveCause && loveCause.type === "love_link" ? [loveCause.sourceId] : [];
              }}
              getEliminationFocus={(pid) => ({
                night,
                targetId: pid,
                causes: entry.causesByTarget?.[pid] || [],
              })}
              getItemDimmed={(pid) => {
                if (!eliminationFocus) return false;
                if (eliminationFocus.night !== night) return false;
                if (!(entry.targetIds || []).includes(eliminationFocus.targetId)) return false;
                return pid !== eliminationFocus.targetId;
              }}
              getDisplayMode={getTargetDisplayMode}
              popupMode="tooltipOnly"
              onEliminationFocusChange={onEliminationFocusChange}
              onHighlightPlayer={onHighlightPlayer}
            />
          )}
        </li>
      );

    case "no_death":
      return <li style={{ ...lineStyle, opacity: dimmed ? 0.28 : 0.75 }}>Đêm qua không ai bị loại</li>;

    case "elemental_guess": {
      const targetRoleTooltip = `${getPlayerName(entry.targetId, playerNamesById)} là ${getRoleName(entry.targetId, rolesByPlayerId)}`;
      return (
        <li style={lineStyle}>
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
        </li>
      );
    }

    case "elemental_guess_summary": {
      const correctIds = entry.correctIds || [];
      if (entry.correctCount <= 0) {
        return <li style={lineStyle}>Không dân làng nguyên tố nào chọn đúng</li>;
      }
      return (
        <li style={lineStyle}>
          Có{" "}
          <ActionSpan
            highlightPayload={{ primaryId: null, secondaryIds: correctIds, dangerIds: [] }}
            tooltipDetail={getRolePlayersText(correctIds, rolesByPlayerId, playerNamesById)}
            onHighlightPlayer={onHighlightPlayer}
          >
            <span style={{ fontWeight: 600 }}>{entry.correctCount}</span>
          </ActionSpan>{" "}
          dân làng nguyên tố chọn đúng
          {entry.triggeredBuffVote && entry.nextBuffVoteNight ? (
            <span style={{ opacity: 0.75 }}> - mở chọn buff vào đêm {entry.nextBuffVoteNight}</span>
          ) : null}
        </li>
      );
    }

    case "elemental_buff_vote": {
      if (!entry.chosenBuffId || !entry.tier) {
        return <li style={lineStyle}>Không hiệu ứng hỗ trợ nào được chọn</li>;
      }
      const chosenVoterIds =
        entry.chosenVoterIds ||
        (entry.voteBreakdown || []).find((v) => v.buffId === entry.chosenBuffId)?.voterIds ||
        [];
      const targetRole = ELEMENTAL_BUFF_TARGET_ROLE_BY_ID[entry.chosenBuffId];
      const targetPlayerId = getPlayerIdByRole(rolesByPlayerId, targetRole);
      const tooltipDetail = `${entry.randomTieBreak ? "Được chọn ngẫu nhiên do hòa phiếu | " : ""}Người chọn hiệu ứng này: ${getRolePlayersText(chosenVoterIds, rolesByPlayerId, playerNamesById)}`;
      return (
        <li style={lineStyle}>
          Hiệu ứng hỗ trợ từ dân làng nguyên tố:{" "}
          <ActionSpan
            highlightPayload={{ primaryId: targetPlayerId, secondaryIds: chosenVoterIds, dangerIds: [] }}
            tooltipDetail={tooltipDetail}
            onHighlightPlayer={onHighlightPlayer}
          >
            <span style={{ fontWeight: 600 }}>{getElementalBuffLogText(entry.chosenBuffId, rolesByPlayerId, playerNamesById)}</span>
          </ActionSpan>
        </li>
      );
    }

    case "elemental_buff": {
      return null;
    }

    case "host_ended_game":
      return <li style={lineStyle}>Quản trò đã cho ngừng trò chơi</li>;

    default:
      return <li style={lineStyle}>(log không rõ)</li>;
  }
}

export default function GameLogPanel({
  nights,
  rolesByPlayerId,
  playerNamesById,
  targetRoleDisplayOrderByPlayerId,
  onHighlightPlayer,
  canViewNightLogs = true,
}: GameLogPanelProps) {
  const [eliminationFocus, setEliminationFocus] = useState<EliminationFocus | null>(null);
  const legacyAngelGuessByPair = Object.fromEntries(
    (nights || [])
      .flatMap((n) => n.entries || [])
      .filter((e) => e.type === "angel_revive_choice")
      .map((e) => [`${e.actorId}:${e.targetId}`, e.guess])
  );

  return (
    <div style={{ marginTop: 12, padding: 12, border: "1px solid var(--border)", borderRadius: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <h3 style={{ margin: 0 }}>Nhật ký ván chơi</h3>
      </div>

      {(nights || []).map((n) => {
        const nightEntries = canViewNightLogs ? (n.entries || []).filter((e) => e.phase !== "day") : [];
        const displayNightEntries = nightEntries.filter((e) => {
          if (isLegacyAngelReviveLog(e)) return false;
          if (e.type === "saved_by_witch" || e.type === "saved_by_guardian" || e.type === "elemental_buff") return false;
          if (e.type === "wolf_vote" && (e.voteBreakdown?.length || 0) <= 1) return false;
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
          <div key={n.night} style={{ marginTop: 14 }}>
            {canViewNightLogs && (
              <>
                <div style={{ fontWeight: 600, fontSize: 15, opacity: dimBucket ? 0.3 : 1, transition: "opacity 180ms ease" }}>🌙 Đêm {n.night}</div>
                {displayNightEntries.length === 0 ? (
                  <div style={{ opacity: dimBucket ? 0.3 : 0.75, marginLeft: 18, transition: "opacity 180ms ease" }}>Không có sự kiện.</div>
                ) : (
                  <ul style={{ margin: "6px 0 0 18px" }}>
                    {displayNightEntries.map((entry, idx) => (
                      <LogEntryLine
                        key={idx}
                        night={n.night}
                        entry={entry}
                        dayVotersByTarget={dayVotersByTarget}
                        legacyAngelGuessByPair={legacyAngelGuessByPair}
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
              </>
            )}

            {dayEntries.length > 0 && (
              <>
                <div style={{ fontWeight: 600, fontSize: 15, marginTop: 10, opacity: dimBucket ? 0.3 : 1, transition: "opacity 180ms ease" }}>🌞 Ngày {n.night}</div>
                <ul style={{ margin: "6px 0 0 18px" }}>
                  {dayEntries.map((entry, idx) => (
                    <LogEntryLine
                      key={`day-${idx}`}
                      night={n.night}
                      entry={entry}
                      dayVotersByTarget={dayVotersByTarget}
                      legacyAngelGuessByPair={legacyAngelGuessByPair}
                      rolesByPlayerId={rolesByPlayerId}
                      playerNamesById={playerNamesById}
                      targetRoleDisplayOrderByPlayerId={targetRoleDisplayOrderByPlayerId}
                      eliminationFocus={eliminationFocus}
                      onEliminationFocusChange={setEliminationFocus}
                      onHighlightPlayer={onHighlightPlayer}
                    />
                  ))}
                </ul>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
