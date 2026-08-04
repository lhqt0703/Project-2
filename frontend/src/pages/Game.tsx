import { lazy, Suspense, useEffect, useState } from "react";
import { useRoomContext, DEFAULT_ROOM_GAME_RULES } from "../context/RoomContext";
import { socket } from "../socket";
import { useLocation, useNavigate } from "react-router-dom";
import ConfirmModal from "../components/ConfirmModal";

// Lazy-load the mode-specific game pages
const GameDaNghich = lazy(() => import("./GameDaNghich"));
const GameDietQuy = lazy(() => import("./GameDietQuy"));
const GameSoiMu = lazy(() => import("./GameSoiMu"));
const GameCoTyPhu = lazy(() => import("./GameCoTyPhu"));

export default function Game() {
  const { room, setRoom } = useRoomContext();
  const location = useLocation();
  const nav = useNavigate();
  const query = new URLSearchParams(location.search);
  const roomId = query.get("roomId");

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!roomId) return;
    if (room && room.id === roomId) return;

    if (roomId === "mock-8" || roomId === "mock-dusk") {
      const isDebugHeartExplosion = new URLSearchParams(window.location.search).get("debugHeartExplosion") === "1";
      const isDebugNightTransition = new URLSearchParams(window.location.search).get("debugNightTransition") === "1";
      setRoom({
        id: roomId,
        hostId: "P1",
        gameMode: "da_nghich",
        players: [
          { id: "P1", name: "Player 1" },
          { id: "P2", name: "Player 2" },
          { id: "P3", name: "Player 3" },
          { id: "P4", name: "Player 4" },
          { id: "P5", name: "Player 5" },
          { id: "P6", name: "Player 6" },
          { id: "P7", name: "Player 7" },
          { id: "P8", name: "Player 8" },
        ],
        positions: [
          { playerId: "P1", x: 0.415, y: 0.16 },
          { playerId: "P2", x: 0.585, y: 0.16 },
          { playerId: "P3", x: 0.27, y: 0.32 },
          { playerId: "P4", x: 0.73, y: 0.32 },
          { playerId: "P5", x: 0.27, y: 0.54 },
          { playerId: "P6", x: 0.73, y: 0.54 },
          { playerId: "P7", x: 0.415, y: 0.7 },
          { playerId: "P8", x: 0.585, y: 0.7 },
        ],
        roles: ["Sói Dại", "Tiên tri", "Phù thủy", "Bảo vệ", "Thợ săn", "Thần tình yêu", "Dân làng", "Sói thường"],
        phase: roomId === "mock-dusk" ? "dusk" : "night",
        nightTransitionEndsAt: isDebugNightTransition ? Date.now() + 3_900 : null,
        nightCount: isDebugHeartExplosion ? 2 : 1,
        nightTurnRemainingMs: 690 * 1000,
        nightTurnPaused: true,
        deadPlayers: [],
        gameRules: {
          ...DEFAULT_ROOM_GAME_RULES,
          twoHeartsFirstTwoNights: true,
        },
        daNghichState: {
          sharedHeartsVisible: isDebugHeartExplosion ? true : undefined,
          playerHearts: isDebugHeartExplosion ? {
            P2: 2,
            P3: 2,
            P4: 2,
            P5: 2,
            P6: 2,
            P7: 2,
            P8: 2,
          } : undefined,
        },
      });
      return;
    }

    // Gửi yêu cầu lấy thông tin phòng từ server
    socket.emit("getRoom", roomId);

    const handleRoomUpdated = (updatedRoom: any) => {
      if (updatedRoom && updatedRoom.id === roomId) {
        setRoom(updatedRoom);
      }
    };

    const handleErrorMessage = (message: string) => {
      setErrorMsg(message || "Có lỗi xảy ra khi tải phòng.");
    };

    socket.on("roomUpdated", handleRoomUpdated);
    socket.on("errorMessage", handleErrorMessage);

    const handleConnect = () => {
      if (roomId !== "mock-8" && roomId !== "mock-dusk") {
        socket.emit("getRoom", roomId);
      }
    };
    socket.on("connect", handleConnect);

    return () => {
      socket.off("roomUpdated", handleRoomUpdated);
      socket.off("errorMessage", handleErrorMessage);
      socket.off("connect", handleConnect);
    };
  }, [room, roomId, setRoom]);

  if (!room) {
    return (
      <div
        className="page-shell game-page"
        style={{
          padding: "1.25rem",
          minHeight: "100vh",
          backgroundColor: "#0f1115",
          display: "flex",
          alignItems: "center",
          justifyContent: "center"
        }}
      >
        {errorMsg && (
          <ConfirmModal
            open={true}
            title="Thông báo"
            message={errorMsg}
            infoOnly={true}
            closeText="Quay lại sảnh"
            onConfirm={() => {
              setErrorMsg(null);
              nav("/lobby");
            }}
            onCancel={() => {
              setErrorMsg(null);
              nav("/lobby");
            }}
          />
        )}
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <div
        /* style={{ 
          color: "#fff", 
          display: "flex", 
          alignItems: "center", 
          justifyContent: "center", 
          minHeight: "100vh",
          backgroundColor: "#0f1115",
          fontFamily: "var(--font-family, sans-serif)",
          fontSize: "1.25rem"
        }} */
        >
          {/* Đang tải giao diện trò chơi... */}
        </div>
      }
    >
      {room.gameMode === "co_ty_phu" ? (
        <GameCoTyPhu />
      ) : room.gameMode === "diet_quy" ? (
        <GameDietQuy />
      ) : room.gameMode === "soi_mu" ? (
        <GameSoiMu />
      ) : (
        <GameDaNghich />
      )}
    </Suspense>
  );
}
