import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useRoomContext, type RoomData } from "../context/RoomContext";
import { socket } from "../socket";
import CoTyPhuRoom from "./CoTyPhuRoom";
import Room from "./Room";

export default function RoomRouter() {
  const { room, setRoom } = useRoomContext();
  const location = useLocation();
  const roomId = new URLSearchParams(location.search).get("roomId");
  const [loading, setLoading] = useState(!room || (!!roomId && room.id !== roomId));

  useEffect(() => {
    if (!roomId) return;
    if (room && room.id === roomId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const syncRoom = () => socket.emit("getRoom", roomId);
    const handleRoomUpdated = (nextRoom: RoomData) => {
      if (nextRoom && nextRoom.id === roomId) {
        setRoom(nextRoom);
        setLoading(false);
      }
    };

    syncRoom();
    socket.on("roomUpdated", handleRoomUpdated);
    socket.on("connect", syncRoom);
    return () => {
      socket.off("roomUpdated", handleRoomUpdated);
      socket.off("connect", syncRoom);
    };
  }, [roomId, room?.id, setRoom]);

  if (loading || !room || room.id !== roomId) {
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

  return room.gameMode === "co_ty_phu" ? <CoTyPhuRoom /> : <Room />;
}
