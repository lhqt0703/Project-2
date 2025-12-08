
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
  phase?: string; // "day" hoặc "night"
  positions?: { playerId: string; x: number; y: number }[];
  positionEditors?: string[]; // ai được phép sắp xếp
}

const rooms: Record<string, Room> = {};
const activeRooms = new Set<string>(); // chứa toàn bộ mã phòng đã tạo


// Tạo phòng mới

function generateRoomId(activeRooms: Set<string>)  {
  let id;
  do {
    id = String(Math.floor(Math.random() * 1000)).padStart(3, "0"); // mã phòng 3 chữ số
  } while (activeRooms.has(id));

  activeRooms.add(id);
  return id;
}

function generateCirclePositions(playerIds: string[]) {
  const n = playerIds.length;
  return playerIds.map((id, i) => {
    const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
    return {
      playerId: id,
      x: 0.5 + 0.35 * Math.cos(angle), // tâm (0.5, 0.5), bán kính 0.35
      y: 0.5 + 0.35 * Math.sin(angle),
    };
  });
}

// Khi client kết nối
io.on("connection", (socket) => {
  socket.on("createRoom", ({ name }) => {
    const roomId = generateRoomId(activeRooms);

    rooms[roomId] = {
      id: roomId,
      players: [{ id: socket.id, name }],
      hostId: socket.id,
      positions: generateCirclePositions([socket.id]),   // khởi tạo vị trí
      positionEditors: [], // ai được phép sắp xếp
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
    if (!room.positions || room.positions.length !== room.players.length) {
      const existing = new Map((room.positions || []).map(p => [p.playerId, p]));
      const newPos = generateCirclePositions(room.players.map(p => p.id));
      // giữ vị trí cũ nếu có
      newPos.forEach(pos => {
        if (existing.has(pos.playerId)) {
          const ex = existing.get(pos.playerId)!;
          pos.x = ex.x;
          pos.y = ex.y;
        }
      });
      room.positions = newPos;
    }
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
      io.to(roomId).emit("positionsUpdated", room.positions);
      io.to(roomId).emit("positionEditorsUpdated", room.positionEditors || []);

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
    // Đánh dấu game đã bắt đầu (mặc định là ban ngày)
    room.phase = "day";

    io.to(roomId).emit("gameStarted");

    // Cập nhật lại lockedPlayerIds sau khi đã bổ sung role và bắt đầu game
    room.lockedPlayerIds = room.players.map(p => p.id);
  });

  socket.on("updatePositions", ({ roomId, positions }) => {
    const room = rooms[roomId];
    if (!room) return;

    const isHost = socket.id === room.hostId;
    const isEditor = room.positionEditors?.includes(socket.id);

    if (!isHost && !isEditor) {
      socket.emit("errorMessage", "Bạn không có quyền chỉnh vị trí.");
      return;
    }

    room.positions = positions;
    io.to(roomId).emit("positionsUpdated", positions);
  });

  socket.on("grantPositionEdit", ({ roomId, targetId }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (socket.id !== room.hostId) return;

    room.positionEditors = room.positionEditors || [];
    if (!room.positionEditors.includes(targetId)) {
      room.positionEditors.push(targetId);
    }

    io.to(roomId).emit("positionEditorsUpdated", room.positionEditors);
  });

  socket.on("revokePositionEdit", ({ roomId, targetId }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (socket.id !== room.hostId) return;

    room.positionEditors = (room.positionEditors || []).filter(id => id !== targetId);
    io.to(roomId).emit("positionEditorsUpdated", room.positionEditors);
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
        const isHost = room.hostId === socket.id;
        // xoá user khỏi room
        room.players.splice(playerIndex, 1);
        // Xóa cả position luôn
        room.positions = (room.positions || []).filter(pos => pos.playerId !== socket.id);
        io.to(roomId).emit("positionsUpdated", room.positions);



        // nếu phòng trống → xoá phòng
        if (room.players.length === 0) {
          delete rooms[roomId];
          activeRooms.delete(roomId);
          console.log(`Phòng ${roomId} đã đóng vì trống.`);
        } else {
          // Nếu host rời phòng
          if (isHost) {
            // Nếu game chưa bắt đầu (chưa có phase hoặc phase === undefined)
            if (!room.phase) {
              // Chuyển quyền host cho người đầu tiên còn lại
              if (room.players[0]) {
                room.hostId = room.players[0].id;
                io.to(roomId).emit("hostChanged", room.hostId);
                io.to(roomId).emit("roomUpdated", room);
                console.log(`Chủ phòng rời, chuyển quyền cho ${room.hostId}`);
              }
            } else {
              // Nếu game đã bắt đầu, thông báo cho cả phòng
              io.to(roomId).emit("hostDisconnected");
              console.log(`Host rời khi game đang diễn ra ở phòng ${roomId}`);
            }
          } else {
            // nếu còn người → cập nhật room
            io.to(roomId).emit("roomUpdated", room);
          }
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
      console.log(`[yourRole emit] Gửi role '${role}' cho player ${player.id}`);
      io.to(player.id).emit("yourRole", role);
    });

    // Đánh dấu game đã bắt đầu (mặc định là ban ngày)
    room.phase = "day";

    // thông báo cho cả phòng rằng game đã bắt đầu
    io.to(roomId).emit("gameStarted");
  });

  // changePhase phải ở bên ngoài startGame
  socket.on("changePhase", ({ roomId, phase }) => {
    const room = rooms[roomId];
    if (!room) return;

    room.phase = phase; // "day" hoặc "night"
    console.log(`[changePhase] Phòng ${roomId} chuyển sang phase '${phase}'`);
    // Gửi phase cho cả phòng
    io.to(roomId).emit("phaseChanged", phase);
  });

  // Nhường quyền chủ phòng cho người khác
  socket.on("transferHost", ({ roomId, targetId }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (socket.id !== room.hostId) return; // chỉ host mới được nhường quyền
    if (!room.players.find(p => p.id === targetId)) return;
    room.hostId = targetId;
    io.to(roomId).emit("hostChanged", room.hostId);
    io.to(roomId).emit("roomUpdated", room);
  });

  // Kick người chơi khỏi phòng
  socket.on("kickPlayer", ({ roomId, targetId }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (socket.id !== room.hostId) return; // chỉ host mới được kick
    if (!room.players.find(p => p.id === targetId)) return;
    // Xoá player khỏi room
    room.players = room.players.filter(p => p.id !== targetId);
    // Nếu bị kick là host (trường hợp hiếm), chuyển quyền cho người đầu tiên còn lại
    if (room.hostId === targetId && room.players.length > 0) {
      const firstPlayer = room.players[0];
      if (firstPlayer) {
        room.hostId = firstPlayer.id;
        io.to(roomId).emit("hostChanged", room.hostId);
      }
    }
    io.to(roomId).emit("roomUpdated", room);
    io.to(targetId).emit("kicked"); // thông báo cho người bị kick
  });

});


// Start server
httpServer.listen(3001, () => {
  console.log("Backend đang chạy tại http://localhost:3001");
});


