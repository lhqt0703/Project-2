import { lazy, Suspense, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useRoomContext, type RoomData } from "../context/RoomContext";
import { socket, startRoomRecovery } from "../socket";

const CoTyPhuRoom = lazy(() => import("./CoTyPhuRoom"));
const Room = lazy(() => import("./Room"));

function RoomLoadingScreen() {
  return (
    <div style={{
      minHeight: "100vh",
      background: "#04060f",
      color: "#fff",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "sans-serif"
    }}>
      Đang tải thông tin phòng...
    </div>
  );
}

export default function RoomRouter() {
  const { room, setRoom } = useRoomContext();
  const location = useLocation();
  const roomId = new URLSearchParams(location.search).get("roomId");

  useEffect(() => {
    if (!roomId) return;
    const handleRoomUpdated = (nextRoom: RoomData) => {
      if (nextRoom && nextRoom.id === roomId) {
        setRoom(nextRoom);
      }
    };

    socket.on("roomUpdated", handleRoomUpdated);
    const stopRoomRecovery = startRoomRecovery(roomId);
    return () => {
      socket.off("roomUpdated", handleRoomUpdated);
      stopRoomRecovery();
    };
  }, [roomId, setRoom]);

  if (!room || room.id !== roomId) return <RoomLoadingScreen />;

  return (
    <Suspense fallback={<RoomLoadingScreen />}>
      {room.gameMode === "co_ty_phu" ? <CoTyPhuRoom /> : <Room />}
    </Suspense>
  );
}
