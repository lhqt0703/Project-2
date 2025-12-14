import { socket } from "../socket";
import { useRoomContext } from "../context/RoomContext";

export default function PlayerPositions({
  onPlayerClick,
}: {
  onPlayerClick: (playerId: string) => void;
}) {
  const { room } = useRoomContext();

  if (!room) return null;

  // Lấy thông tin sói còn sống và số lượng sói
  const wolfVotes = (room as any).wolfVotes as Record<string, string | null> | undefined;
  const deadPlayers = (room as any).deadPlayers as string[] | undefined;
  const wolvesAlive = room.players.filter(p => room.playerRoles?.[p.id] === "Sói" && !(deadPlayers || []).includes(p.id)).map(p => p.id);
  const wolfCount = wolvesAlive.length;

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 600,
        height: 400,
        background: "#f0f0f0",
        borderRadius: 10,
        position: "relative",
      }}
    >
      {/* center marker */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%,-50%)",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            background: "#666",
          }}
        />
      </div>

      {(room.positions || []).map((pos) => {
        const p = room.players.find((x) => x.id === pos.playerId);
        if (!p) return null;

        const left = `${pos.x * 100}%`;
        const top = `${pos.y * 100}%`;

        const voteCountForThis = wolfVotes ? Object.values(wolfVotes).filter(t => t === pos.playerId).length : 0;
        const isDead = (deadPlayers || []).includes(pos.playerId);

        return (
          <div
            key={pos.playerId}
            style={{
              position: "absolute",
              left,
              top,
              transform: "translate(-50%,-50%)",
              width: 72,
              height: 72,
              borderRadius: 36,
              background: "#fff",
              border: "2px solid #333",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
              cursor: "pointer",
              opacity: isDead ? 0.4 : 1,
            }}
            onClick={() => onPlayerClick(p.id)}
          >
             {wolfCount >= 2 && voteCountForThis > 0 && (
              <div style={{
                position: "absolute",
                top: -10,
                right: -10,
                background: "#b71c1c",
                color: "#fff",
                borderRadius: 10,
                padding: "2px 6px",
                fontSize: 11,
                fontWeight: "bold",
              }}>
                {voteCountForThis}/{wolfCount}
              </div>
            )}

            <div style={{ textAlign: "center" }}>
              <div style={{ fontWeight: "bold" }}>{p.name}</div>
              <div style={{ opacity: 0.6, fontSize: 11 }}>
                {p.id === socket.id ? "(Bạn)" : ""}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
