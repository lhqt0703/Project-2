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
  roles?: string[]; // danh sách role được chọn cho phòng
  rolesLocked?: boolean; // đã xác nhận role chưa
  lockedPlayerIds?: string[]; // danh sách id người chơi lúc xác nhận role
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

  socket.on("rolesSelected", ({ roomId, roles }) => {
    const room = rooms[roomId];
    if (!room) return;

    // lưu danh sách role vào phòng
    room.roles = roles; 

    // 🔒 bộ role đã khóa
    room.rolesLocked = true;  

    // lưu lại danh sách người chơi lúc khóa
    room.lockedPlayerIds = room.players.map(p => p.id); 

    io.to(roomId).emit("rolesReady", roles);
  });

  socket.on("addAutoRoles", ({ roomId, count }) => {
    const room = rooms[roomId];
    if (!room) return;

    if (!room.roles) {
      room.roles = [];
    }
    for (let i = 0; i < count; i++) {
      room.roles.push("Dân");
    }

    io.to(roomId).emit("rolesReady", room.roles);

    // Tự động bắt đầu game sau khi thêm role
    const roles = room.roles;
    if (!roles || roles.length < room.players.length) {
      io.to(room.hostId).emit("errorMessage", "Danh sách vai trò không hợp lệ hoặc chưa được chọn.");
      return;
    }
    const shuffled = roles.slice().sort(() => Math.random() - 0.5);
    room.players.forEach((player, index) => {
      const role = shuffled[index];
      io.to(player.id).emit("yourRole", role);
    });
    io.to(roomId).emit("gameStarted");

    // Cập nhật lại lockedPlayerIds sau khi đã bổ sung role và bắt đầu game
    room.lockedPlayerIds = room.players.map(p => p.id);
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

    // Kiểm tra nếu đã lock role và có người mới vào
    if (room.rolesLocked && room.lockedPlayerIds) {
      const lockedCount = room.lockedPlayerIds.length;
      const currentCount = room.players.length;
      if (currentCount > lockedCount) {
        const newPlayers = room.players.filter(
          p => !room.lockedPlayerIds!.includes(p.id)
        );
        const missingRoles = currentCount - (room.roles ? room.roles.length : 0);
        // gửi cảnh báo CHỈ đến host
        io.to(room.hostId).emit("roleMismatch", {
          newPlayers,
          missingRoles,
        });
        return; // Không random role, chờ host xử lý
      }
    }

    const roles = room.roles;
    if (!roles || roles.length < room.players.length) {
      socket.emit("errorMessage", "Danh sách vai trò không hợp lệ hoặc chưa được chọn.");
      return;
    }

    // random role cho mỗi người
    const shuffled = roles.slice().sort(() => Math.random() - 0.5);

    room.players.forEach((player, index) => {
      const role = shuffled[index];
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


