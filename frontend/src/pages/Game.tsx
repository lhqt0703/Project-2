import { lazy, Suspense, useEffect, useState } from "react";
import { useRoomContext } from "../context/RoomContext";
import { socket } from "../socket";
import { useLocation, useNavigate } from "react-router-dom";
import ConfirmModal from "../components/ConfirmModal";

// Lazy-load the mode-specific game pages
const GameDaNghich = lazy(() => import("./GameDaNghich"));
const GameDietQuy = lazy(() => import("./GameDietQuy"));
const GameSoiMu = lazy(() => import("./GameSoiMu"));

export default function Game() {
  const { room, setRoom } = useRoomContext();
  const location = useLocation();
  const nav = useNavigate();
  const query = new URLSearchParams(location.search);
  const roomId = query.get("roomId");

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (room || !roomId) return;

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
      socket.emit("getRoom", roomId);
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
      {room.gameMode === "diet_quy" ? (
        <GameDietQuy />
      ) : room.gameMode === "soi_mu" ? (
        <GameSoiMu />
      ) : (
        <GameDaNghich />
      )}
    </Suspense>
  );
}
