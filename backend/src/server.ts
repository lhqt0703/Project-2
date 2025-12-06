import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";

const app = express();
const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: "*",
  },
});


interface Player {
  id: string;
  name: string;
}

interface Room {
  id: string;
  players: Player[];
  hostId: string; // ai là quản trò
}

const rooms: Record<string, Room> = {};
const activeRooms = new Set<string>(); // chứa toàn bộ mã phòng đã tạo


// Tạo phòng mới

function generateRoomId(activeRooms: Set<string>)  {
  let id;
  do {
    id = String(Math.floor(Math.random() * 1000)).padStart(3, "0");
  } while (activeRooms.has(id));

  activeRooms.add(id);
  return id;
}


// Khi client kết nối
io.on("connection", (socket) => {
  socket.on("createRoom", ({ name }) => {
    const roomId = generateRoomId(activeRooms);

    rooms[roomId] = {
      id: roomId,
      players: [{ id: socket.id, name }],
      hostId: socket.id,
    };

    socket.join(roomId);

    // Gửi lại thông tin phòng cho người tạo
    socket.emit("roomCreated", rooms[roomId]);
  });

  socket.on("joinRoom", ({ roomId, name }) => {
    const room = rooms[roomId];
    if (!room) {
      socket.emit("errorMessage", "Phòng không tồn tại :(");
      return;
    }

    room.players.push({ id: socket.id, name });
    socket.join(roomId);

    // 1) gửi riêng cho người vừa join
    socket.emit("roomJoined", room);

    // 2) gửi cho cả phòng để cập nhật
    io.to(roomId).emit("roomUpdated", room);
  });

  socket.on("getRoom", (roomId) => {
    const room = rooms[roomId];
    if (room) {
      socket.emit("roomUpdated", room);
    } else {
      socket.emit("errorMessage", "Phòng không tồn tại :(");
    }
  });

  console.log("Một client đã kết nối:", socket.id);

  socket.on("disconnect", () => {
    console.log("Client ngắt:", socket.id);

    for (const roomId in rooms) {
      const room = rooms[roomId];
      if (!room) continue;

      // tìm user trong room
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      if (playerIndex !== -1) {
        // xoá user khỏi room
        room.players.splice(playerIndex, 1);

        // nếu phòng trống → xoá phòng
        if (room.players.length === 0) {
          delete rooms[roomId];
          activeRooms.delete(roomId);
          console.log(`Phòng ${roomId} đã đóng vì trống.`);
        } else {
          // nếu còn người → cập nhật room
          io.to(roomId).emit("roomUpdated", room);
        }

        break;
      }
    }
  });

  socket.on("startGame", (roomId) => {
  const room = rooms[roomId];
  if (!room) return;

  // danh sách role tạm (bạn sẽ mở rộng sau)
  const roles = ["Sói", "Dân", "Tiên tri", "Bảo vệ"];

  // random role cho mỗi người
  const playerRoles: Record<string, string> = {};

  room.players.forEach((player) => {
    const role = roles[Math.floor(Math.random() * roles.length)]!;
    playerRoles[player.id] = role;

    // gửi role bí mật cho từng client
    io.to(player.id).emit("yourRole", role);
  });

  // thông báo cho cả phòng rằng game đã bắt đầu
  io.to(roomId).emit("gameStarted");
});


});


// Start server
httpServer.listen(3001, () => {
  console.log("Backend đang chạy tại http://localhost:3001");
});


