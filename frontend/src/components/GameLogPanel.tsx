import { useState, useCallback, useRef, useEffect } from "react";
import type { GameLogNight, GameLogEntry, EliminationCause } from "../pages/gameRoles/socketEvents";

type RolesByPlayerId = Record<string, string>;
type PlayerNamesById = Record<string, string>;
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
  onHighlightPlayer: (payload: HighlightPayload) => void;
  onRequestRefresh?: () => void;
}

function getRoleName(playerId: string, rolesByPlayerId: RolesByPlayerId): string {
  return rolesByPlayerId[playerId] || "???";
}

function getPlayerName(playerId: string, playerNamesById: PlayerNamesById): string {
  return playerNamesById[playerId] || playerId.slice(0, 8) + "...";
}

function getRolesText(playerIds: string[] | undefined, rolesByPlayerId: RolesByPlayerId): string {
  if (!playerIds || playerIds.length === 0) return "(không rõ)";
  return playerIds.map((id) => getRoleName(id, rolesByPlayerId)).join(", ");
}

function getPlayerNamesText(playerIds: string[] | undefined, playerNamesById: PlayerNamesById): string {
  if (!playerIds || playerIds.length === 0) return "(không ai)";
  return playerIds.map((id) => getPlayerName(id, playerNamesById)).join(", ");
}

function getEliminationCauseText(causes: EliminationCause[] | undefined, rolesByPlayerId: RolesByPlayerId): string {
  if (!causes || causes.length === 0) return "Bị loại";
  const parts = causes.map((cause) => {
    if (cause.type === "wolf") {
      const attackersText = getRolesText(cause.attackerIds, rolesByPlayerId);
      return `Bị ${attackersText} cắn`;
    }
    if (cause.type === "witch_poison") return "Phù thủy quăng bình giết";
    if (cause.type === "day_vote") {
      const votersText = getRolesText(cause.voterIds, rolesByPlayerId);
      return `Bị biểu quyết bởi: ${votersText}`;
    }
    if (cause.type === "trial_verdict") {
      const votersText = getRolesText(cause.voterIds, rolesByPlayerId);
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
  onEliminationFocusChange?: (focus: EliminationFocus | null) => void;
  onHighlightPlayer: (payload: HighlightPayload) => void;
}) {
  const [showPopup, setShowPopup] = useState(false);
  const spanRef = useRef<HTMLSpanElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  const roleName = getRoleName(playerId, rolesByPlayerId);
  const playerName = getPlayerName(playerId, playerNamesById);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowPopup(true);
    onHighlightPlayer({ primaryId: playerId, secondaryIds: secondaryHighlightIds || [], dangerIds: dangerHighlightIds || [] });
    onEliminationFocusChange?.(eliminationFocus || null);
  }, [playerId, secondaryHighlightIds, dangerHighlightIds, eliminationFocus, onHighlightPlayer, onEliminationFocusChange]);

  useEffect(() => {
    if (!showPopup) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        popupRef.current && !popupRef.current.contains(e.target as Node) &&
        spanRef.current && !spanRef.current.contains(e.target as Node)
      ) {
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
          textDecoration: "underline",
          textDecorationStyle: "dotted",
          opacity: dimmed ? 0.28 : 1,
          transition: "opacity 180ms ease",
        }}
      >
        {roleName}
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
          Người chơi: <strong>{playerName}</strong>
          {tooltipDetail ? <span> | {tooltipDetail}</span> : null}
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
  rolesByPlayerId,
  playerNamesById,
  eliminationFocus,
  onEliminationFocusChange,
  onHighlightPlayer,
}: {
  night: number;
  entry: GameLogEntry;
  dayVotersByTarget: Record<string, string[]>;
  rolesByPlayerId: RolesByPlayerId;
  playerNamesById: PlayerNamesById;
  eliminationFocus: EliminationFocus | null;
  onEliminationFocusChange: (focus: EliminationFocus | null) => void;
  onHighlightPlayer: (payload: HighlightPayload) => void;
}) {
  const isCauseLineForFocus = (f: EliminationFocus) => {
    const causeTypes = new Set((f.causes || []).map((c) => c.type));
    if (entry.type === "eliminated" && (entry.targetIds || []).includes(f.targetId)) return true;
    if (causeTypes.has("wolf") && entry.type === "wolf_result" && (entry.targetIds || []).includes(f.targetId)) return true;
    if ((causeTypes.has("day_vote") || causeTypes.has("trial_verdict")) && entry.type === "day_result" && entry.targetId === f.targetId) return true;
    if (causeTypes.has("day_vote") && entry.type === "day_vote" && (entry.voteBreakdown || []).some((v) => v.targetId === f.targetId)) return true;
    if (causeTypes.has("trial_verdict") && entry.type === "trial_verdict" && entry.targetId === f.targetId) return true;
    if (causeTypes.has("witch_poison") && entry.type === "witch_poison" && entry.targetId === f.targetId) return true;
    if (causeTypes.has("hunter_shot") && entry.type === "hunter_shot" && entry.targetId === f.targetId) return true;
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
            const selectedByText = `Bị chọn bởi: ${getRolesText(v.voterIds, rolesByPlayerId)}`;
            return (
              <span key={v.targetId}>
                <RoleSpan
                  playerId={v.targetId}
                  rolesByPlayerId={rolesByPlayerId}
                  playerNamesById={playerNamesById}
                  tooltipDetail={selectedByText}
                  secondaryHighlightIds={v.voterIds}
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
        return <li style={lineStyle}>Biểu quyết ngày: không ai vote</li>;
      }
      return (
        <li style={lineStyle}>
          Biểu quyết ngày:{" "}
          {entry.voteBreakdown.map((v, idx) => {
            const selectedByText = `Bị vote bởi: ${getRolesText(v.voterIds, rolesByPlayerId)}`;
            return (
              <span key={v.targetId}>
                <RoleSpan
                  playerId={v.targetId}
                  rolesByPlayerId={rolesByPlayerId}
                  playerNamesById={playerNamesById}
                  tooltipDetail={selectedByText}
                  secondaryHighlightIds={v.voterIds}
                  onEliminationFocusChange={onEliminationFocusChange}
                  onHighlightPlayer={onHighlightPlayer}
                />
                {idx < entry.voteBreakdown.length - 1 && ", "}
              </span>
            );
          })}
        </li>
      );

    case "wolf_result":
      if (!entry.targetIds || entry.targetIds.length === 0) {
        return <li style={lineStyle}>Phe sói không thống nhất được lựa chọn cắn ai</li>;
      }
      return (
        <li style={lineStyle}>
          Sói cắn:{" "}
          <RolesListSpan
            playerIds={entry.targetIds}
            rolesByPlayerId={rolesByPlayerId}
            playerNamesById={playerNamesById}
            getTooltipDetail={(pid) => {
              const selectedBy = entry.selectedByByTarget?.[pid] || [];
              if (!selectedBy.length) return undefined;
              return `Bị chọn bởi: ${getRolesText(selectedBy, rolesByPlayerId)}`;
            }}
            getSecondaryHighlightIds={(pid) => entry.selectedByByTarget?.[pid] || []}
            onEliminationFocusChange={onEliminationFocusChange}
            onHighlightPlayer={onHighlightPlayer}
          />
        </li>
      );

    case "day_result":
      if (!entry.targetId) {
        return <li style={lineStyle}>Kết quả biểu quyết: hòa phiếu / không ai bị loại</li>;
      }
      {
        const voterIds = dayVotersByTarget[entry.targetId] || [];
        const tooltipDetail = voterIds.length ? `Bị vote bởi: ${getRolesText(voterIds, rolesByPlayerId)}` : undefined;
        return (
          <li style={lineStyle}>
            Kết quả biểu quyết:{" "}
            <RoleSpan
              playerId={entry.targetId}
              rolesByPlayerId={rolesByPlayerId}
              playerNamesById={playerNamesById}
              tooltipDetail={tooltipDetail}
              secondaryHighlightIds={voterIds}
              onEliminationFocusChange={onEliminationFocusChange}
              onHighlightPlayer={onHighlightPlayer}
            />
            {" "}bị lên giàn
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
            Kết quả sống/chết cho
          </ActionSpan>{" "}
          {entry.targetId && (
            <RoleSpan
              playerId={entry.targetId}
              rolesByPlayerId={rolesByPlayerId}
              playerNamesById={playerNamesById}
              secondaryHighlightIds={liveVoterIds}
              dangerHighlightIds={dieVoterIds}
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

    case "guardian_protect":
      if (entry.actorId && entry.targetId && entry.actorId === entry.targetId) {
        return (
          <li style={lineStyle}>
            {entry.actorId ? <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> : "Bảo vệ"} đã bảo vệ bản thân
          </li>
        );
      }
      return (
        <li style={lineStyle}>
          {entry.actorId ? <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> : "Bảo vệ"} đã bảo vệ:{" "}
          {entry.targetId && <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />}
        </li>
      );

    case "witch_heal":
      if (entry.actorId && entry.targetId && entry.actorId === entry.targetId) {
        return (
          <li style={lineStyle}>
            {entry.actorId ? <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> : "Phù thủy"} dùng bình cứu lên bản thân
          </li>
        );
      }
      return (
        <li style={lineStyle}>
          {entry.actorId ? <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> : "Phù thủy"} dùng bình cứu cho:{" "}
          {entry.targetId && <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />}
        </li>
      );

    case "witch_poison":
      return (
        <li style={lineStyle}>
          {entry.actorId ? <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> : "Phù thủy"} dùng bình giết:{" "}
          {entry.targetId && <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />}
        </li>
      );

    case "seer_check":
      return (
        <li style={lineStyle}>
          {entry.actorId ? <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> : "Tiên tri"} soi:{" "}
          {entry.targetId && <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />}
          {" -> "}
          <span style={{ fontWeight: 600, color: entry.isWolf ? "#e74c3c" : "#27ae60" }}>
            {entry.isWolf ? "Sói" : "Dân"}
          </span>
        </li>
      );

    case "hunter_mark":
      return (
        <li style={lineStyle}>
          {entry.actorId ? <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> : "Thợ săn"} ghim:{" "}
          {entry.targetId && <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />}
        </li>
      );

    case "hunter_shot":
      return (
        <li style={lineStyle}>
          {entry.actorId ? <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> : "Thợ săn"} bắn:{" "}
          {entry.targetId && <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />}
        </li>
      );

    case "spirit_wolf_decision":
      return (
        <li style={lineStyle}>
          Linh sói quyết định: <span style={{ fontWeight: 600 }}>{entry.saved ? "CỨU" : "KHÔNG CỨU"}</span>
          {entry.timedOut ? (
            <TimeoutBadge message="Quá thời gian chờ thực hiện hành động" />
          ) : null}
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
              getTooltipDetail={(pid) => getEliminationCauseText(entry.causesByTarget?.[pid], rolesByPlayerId)}
              getSecondaryHighlightIds={(pid) => {
                const causes = entry.causesByTarget?.[pid] || [];
                const wolfCause = causes.find((c) => c.type === "wolf");
                return wolfCause && wolfCause.type === "wolf" ? wolfCause.attackerIds : [];
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
              onEliminationFocusChange={onEliminationFocusChange}
              onHighlightPlayer={onHighlightPlayer}
            />
          )}
        </li>
      );

    case "no_death":
      return <li style={{ ...lineStyle, opacity: dimmed ? 0.28 : 0.75 }}>Đêm qua không ai bị loại</li>;

    default:
      return <li style={lineStyle}>(log không rõ)</li>;
  }
}

export default function GameLogPanel({
  nights,
  rolesByPlayerId,
  playerNamesById,
  onHighlightPlayer,
  onRequestRefresh,
}: GameLogPanelProps) {
  const [eliminationFocus, setEliminationFocus] = useState<EliminationFocus | null>(null);

  return (
    <div style={{ marginTop: 12, padding: 12, border: "1px solid var(--border)", borderRadius: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <h3 style={{ margin: 0 }}>Nhật ký ván chơi</h3>
        {onRequestRefresh && (
          <button onClick={onRequestRefresh}>Refresh log</button>
        )}
      </div>

      {(nights || []).map((n) => {
        const nightEntries = (n.entries || []).filter((e) => e.phase !== "day");
        const displayNightEntries = nightEntries.filter((e) => !(e.type === "wolf_vote" && (e.voteBreakdown?.length || 0) <= 1));
        const dayEntries = (n.entries || []).filter(
          (e) => {
            if (e.phase !== "day") return false;
            if (e.type === "saved_by_guardian" || e.type === "saved_by_witch" || e.type === "trial_started") return false;
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
                    rolesByPlayerId={rolesByPlayerId}
                    playerNamesById={playerNamesById}
                    eliminationFocus={eliminationFocus}
                    onEliminationFocusChange={setEliminationFocus}
                    onHighlightPlayer={onHighlightPlayer}
                  />
                ))}
              </ul>
            )}

            {dayEntries.length > 0 && (
              <>
                <div style={{ fontWeight: 600, fontSize: 15, marginTop: 10, opacity: dimBucket ? 0.3 : 1, transition: "opacity 180ms ease" }}>🌞 Ngày {n.night + 1}</div>
                <ul style={{ margin: "6px 0 0 18px" }}>
                  {dayEntries.map((entry, idx) => (
                    <LogEntryLine
                      key={`day-${idx}`}
                      night={n.night}
                      entry={entry}
                      dayVotersByTarget={dayVotersByTarget}
                      rolesByPlayerId={rolesByPlayerId}
                      playerNamesById={playerNamesById}
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
