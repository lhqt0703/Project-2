import { useState, useCallback, useRef, useEffect } from "react";
import type { GameLogNight, GameLogEntry, EliminationCause } from "../pages/gameRoles/socketEvents";

type RolesByPlayerId = Record<string, string>;
type PlayerNamesById = Record<string, string>;
type EliminationFocus = {
  night: number;
  targetId: string;
  causes: EliminationCause[];
};

interface GameLogPanelProps {
  nights: GameLogNight[];
  rolesByPlayerId: RolesByPlayerId;
  playerNamesById: PlayerNamesById;
  onHighlightPlayer: (payload: { primaryId: string | null; secondaryIds?: string[] }) => void;
  onRequestRefresh?: () => void;
}

// Helper: get role display name for a playerId
function getRoleName(playerId: string, rolesByPlayerId: RolesByPlayerId): string {
  return rolesByPlayerId[playerId] || "???";
}

// Helper: get player name for a playerId
function getPlayerName(playerId: string, playerNamesById: PlayerNamesById): string {
  return playerNamesById[playerId] || playerId.slice(0, 8) + "...";
}

function getRolesText(playerIds: string[] | undefined, rolesByPlayerId: RolesByPlayerId): string {
  if (!playerIds || playerIds.length === 0) return "(không rõ)";
  return playerIds.map((id) => getRoleName(id, rolesByPlayerId)).join(", ");
}

function findFirstPlayerIdByRole(rolesByPlayerId: RolesByPlayerId, roleName: string): string | null {
  for (const [playerId, role] of Object.entries(rolesByPlayerId)) {
    if (role === roleName) return playerId;
  }
  return null;
}

function getEliminationCauseText(causes: EliminationCause[] | undefined, rolesByPlayerId: RolesByPlayerId): string {
  if (!causes || causes.length === 0) return "Bị loại";
  const parts = causes.map((cause) => {
    if (cause.type === "wolf") {
      const attackersText = getRolesText(cause.attackerIds, rolesByPlayerId);
      return `Bị ${attackersText} cắn`;
    }
    if (cause.type === "witch_poison") return "Phù thủy quăng bình giết";
    return "Thợ săn đã bắn trúng";
  });
  return parts.join(" và ");
}

// Clickable role span component
function RoleSpan({
  playerId,
  rolesByPlayerId,
  playerNamesById,
  tooltipDetail,
  secondaryHighlightIds,
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
  eliminationFocus?: EliminationFocus;
  dimmed?: boolean;
  onEliminationFocusChange?: (focus: EliminationFocus | null) => void;
  onHighlightPlayer: (payload: { primaryId: string | null; secondaryIds?: string[] }) => void;
}) {
  const [showPopup, setShowPopup] = useState(false);
  const spanRef = useRef<HTMLSpanElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  const roleName = getRoleName(playerId, rolesByPlayerId);
  const playerName = getPlayerName(playerId, playerNamesById);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowPopup(true);
    onHighlightPlayer({ primaryId: playerId, secondaryIds: secondaryHighlightIds || [] });
    onEliminationFocusChange?.(eliminationFocus || null);
  }, [playerId, secondaryHighlightIds, eliminationFocus, onHighlightPlayer, onEliminationFocusChange]);

  // Close on click outside
  useEffect(() => {
    if (!showPopup) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        popupRef.current && !popupRef.current.contains(e.target as Node) &&
        spanRef.current && !spanRef.current.contains(e.target as Node)
      ) {
        setShowPopup(false);
        onHighlightPlayer({ primaryId: null, secondaryIds: [] });
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

// Multiple roles span (e.g., list of eliminated players)
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
  onHighlightPlayer: (payload: { primaryId: string | null; secondaryIds?: string[] }) => void;
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

// Render a single log entry
function LogEntryLine({
  night,
  entry,
  rolesByPlayerId,
  playerNamesById,
  eliminationFocus,
  onEliminationFocusChange,
  onHighlightPlayer,
}: {
  night: number;
  entry: GameLogEntry;
  rolesByPlayerId: RolesByPlayerId;
  playerNamesById: PlayerNamesById;
  eliminationFocus: EliminationFocus | null;
  onEliminationFocusChange: (focus: EliminationFocus | null) => void;
  onHighlightPlayer: (payload: { primaryId: string | null; secondaryIds?: string[] }) => void;
}) {
  const isCauseLineForFocus = (f: EliminationFocus) => {
    const causeTypes = new Set((f.causes || []).map((c) => c.type));
    if (entry.type === "eliminated" && (entry.targetIds || []).includes(f.targetId)) return true;
    if (causeTypes.has("wolf") && entry.type === "wolf_result" && (entry.targetIds || []).includes(f.targetId)) return true;
    if (causeTypes.has("witch_poison") && entry.type === "witch_poison" && entry.targetId === f.targetId) return true;
    if (causeTypes.has("hunter_shot") && entry.type === "hunter_shot" && entry.targetId === f.targetId) return true;
    return false;
  };

  const dimmed = !!eliminationFocus && (
    eliminationFocus.night !== night || !isCauseLineForFocus(eliminationFocus)
  );
  const lineStyle: React.CSSProperties = {
    opacity: dimmed ? 0.28 : 1,
    transition: "opacity 180ms ease",
  };

  switch (entry.type) {
    case "wolf_vote":
      if (!entry.voteBreakdown || entry.voteBreakdown.length === 0) {
        return <li style={lineStyle}>Sói chọn cắn: (không ai chọn)</li>;
      }
      return (
        <li style={lineStyle}>
          Sói chọn cắn:{" "}
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

    case "wolf_result":
      if (!entry.targetIds || entry.targetIds.length === 0) {
        return <li style={lineStyle}>Sói cắn: (không ai)</li>;
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

    case "bonus_bite":
      return <li style={{ ...lineStyle, fontStyle: "italic", opacity: dimmed ? 0.28 : 0.85 }}>⚠️ Đêm nay Sói được cắn 2 người (do Sói con đã chết)</li>;

    case "guardian_protect":
      return (
        <li style={lineStyle}>
          {entry.actorId ? <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> : "Bảo vệ"} bảo vệ:{" "}
          {entry.targetId && <RoleSpan playerId={entry.targetId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />}
        </li>
      );

    case "witch_heal":
      return (
        <li style={lineStyle}>
          {entry.actorId ? <RoleSpan playerId={entry.actorId} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} /> : "Phù thủy"} dùng bình cứu:{" "}
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
          {" → "}
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
        </li>
      );

    case "saved_by_guardian":
      {
      const guardianId = findFirstPlayerIdByRole(rolesByPlayerId, "Bảo vệ");
      return (
        <li style={lineStyle}>
          {guardianId ? (
            <RoleSpan
              playerId={guardianId}
              rolesByPlayerId={rolesByPlayerId}
              playerNamesById={playerNamesById}
              onEliminationFocusChange={onEliminationFocusChange}
              onHighlightPlayer={onHighlightPlayer}
            />
          ) : (
            "Bảo vệ"
          )}{" "}
          cứu khỏi vết cắn cho:{" "}
          {entry.targetIds && <RolesListSpan playerIds={entry.targetIds} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />}
        </li>
      );
      }

    case "saved_by_witch":
      {
      const witchId = findFirstPlayerIdByRole(rolesByPlayerId, "Phù thủy");
      return (
        <li style={lineStyle}>
          {witchId ? (
            <RoleSpan
              playerId={witchId}
              rolesByPlayerId={rolesByPlayerId}
              playerNamesById={playerNamesById}
              onEliminationFocusChange={onEliminationFocusChange}
              onHighlightPlayer={onHighlightPlayer}
            />
          ) : (
            "Phù thủy"
          )}{" "}
          dùng bình cứu cho:{" "}
          {entry.targetIds && <RolesListSpan playerIds={entry.targetIds} rolesByPlayerId={rolesByPlayerId} playerNamesById={playerNamesById} onEliminationFocusChange={onEliminationFocusChange} onHighlightPlayer={onHighlightPlayer} />}
        </li>
      );
      }

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
      return <li style={{ ...lineStyle, opacity: dimmed ? 0.28 : 0.75 }}>Không ai bị loại.</li>;

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
  // Group entries by night + day
  // Night entries: phase !== "day"
  // Day entries: phase === "day" (shown after night)
  const [eliminationFocus, setEliminationFocus] = useState<EliminationFocus | null>(null);

  return (
    <div style={{ marginTop: 12, padding: 12, border: "1px solid var(--border)", borderRadius: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <h3 style={{ margin: 0 }}>Nhật ký ván chơi</h3>
        {onRequestRefresh && (
          <button onClick={onRequestRefresh}>Refresh log</button>
        )}
      </div>

      {(!nights || nights.length === 0) && (
        <p style={{ marginTop: 8, opacity: 0.8 }}>Chưa có log (thường sẽ bắt đầu ghi từ đêm 1).</p>
      )}

      {(nights || []).map((n) => {
        const nightEntries = (n.entries || []).filter(e => e.phase !== "day");
        const displayNightEntries = nightEntries.filter((e) => !(e.type === "wolf_vote" && (e.voteBreakdown?.length || 0) <= 1));
        const dayEntries = (n.entries || []).filter(e => e.phase === "day");
        const dimBucket = !!eliminationFocus && eliminationFocus.night !== n.night;

        return (
          <div key={n.night} style={{ marginTop: 14 }}>
            {/* Night section */}
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
                    rolesByPlayerId={rolesByPlayerId}
                    playerNamesById={playerNamesById}
                    eliminationFocus={eliminationFocus}
                    onEliminationFocusChange={setEliminationFocus}
                    onHighlightPlayer={onHighlightPlayer}
                  />
                ))}
              </ul>
            )}

            {/* Day section (if any day events) */}
            {dayEntries.length > 0 && (
              <>
                <div style={{ fontWeight: 600, fontSize: 15, marginTop: 10, opacity: dimBucket ? 0.3 : 1, transition: "opacity 180ms ease" }}>🌞 Ngày {n.night + 1}</div>
                <ul style={{ margin: "6px 0 0 18px" }}>
                  {dayEntries.map((entry, idx) => (
                    <LogEntryLine
                      key={`day-${idx}`}
                      night={n.night}
                      entry={entry}
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
