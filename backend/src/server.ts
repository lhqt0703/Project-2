
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
  connected?: boolean; // true = đang online; false = mất kết nối
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
  playerRoles?: Record<string, string>; // mapping playerId -> role

   // --- Phần cho sói ---
  wolves?: string[]; // danh sách id của sói (còn sống) trong phòng
  wolfVotes?: Record<string, string | null>; // mapping: wolfId -> targetId hoặc null
  wolfLocked?: Record<string, boolean>;// wolfId nào đã nhấn nút "cắn" → true
  wolfTimer?: NodeJS.Timeout | null; // thời gian server tự động kết thúc
  wolfDeadline?: number | null;  // thời gian chờ sói kết thúc cắn
  killedTonight?: string | null; // playerId người bị cắn đêm nay (hiện null nếu ko ai)
  deadPlayers?: string[]; // danh sách playerId đã chết
}

const rooms: Record<string, Room> = {};
const activeRooms = new Set<string>(); // chứa toàn bộ mã phòng đã tạo

function isPlayerConnected(room: Room, playerId: string) {
  const player = room.players.find(p => p.id === playerId);
  return player ? player.connected !== false : false;
}

function getActiveWolves(room: Room) {
  const allWolves = room.players
    .filter(p => room.playerRoles?.[p.id] === "Sói")
    .map(p => p.id);
  const dead = new Set(room.deadPlayers || []);
  return allWolves.filter(id => !dead.has(id) && isPlayerConnected(room, id));
}

function toPublicRoom(room: Room) {
  // IMPORTANT: tuyệt đối không emit NodeJS.Timeout (wolfTimer) vì nó gây lỗi serialize.
  // Trả về object thuần JSON.
  const { wolfTimer: _wolfTimer, ...rest } = room;
  return {
    ...rest,
    players: room.players.map(p => ({ id: p.id, name: p.name, connected: p.connected !== false })),
  };
}


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


function startWolfPhase(roomId: string) {
  const room = rooms[roomId];
  if (!room) return;

  const wolves = room.players.filter(p => room.playerRoles?.[p.id] === "Sói");

  room.wolfVotes = {};
  room.wolfLocked = {};
  wolves.forEach(w => {
    room.wolfVotes![w.id] = null;
    room.wolfLocked![w.id] = false;
  });

  room.wolfDeadline = Date.now() + 10_000; // 10 giây
  // broadcast cho cả phòng (client cần biết deadline để đếm ngược)
  io.to(`wolves_${roomId}`).emit("wolfPhaseStarted", {
    wolves: wolves.map(w => w.id),
    activeWolves: getActiveWolves(room),
    deadline: room.wolfDeadline,
  });

  // huỷ timer cũ nếu có
  if (room.wolfTimer) {
    clearTimeout(room.wolfTimer);
    room.wolfTimer = null;
  }

  // khi hết thời gian → xử lý vote
  room.wolfTimer = setTimeout(() => {
    finishWolfVoting(roomId);
  }, 10_000);
}

function finishWolfVoting(roomId: string) {
  const room = rooms[roomId];
  if (!room) return;

  // nếu timer còn tồn tại thì clear đi
  if (room.wolfTimer) {
    clearTimeout(room.wolfTimer);
    room.wolfTimer = null;
  }

  const votes = room.wolfVotes || {};
  const activeWolves = getActiveWolves(room);

  const counts: Record<string, number> = {};
  activeWolves.forEach(wolfId => {
    const target = votes[wolfId];
    if (!target) return;
    counts[target] = (counts[target] || 0) + 1;
  });

  const entries = Object.entries(counts); // [ [playerId, count], ... ]

  // Hòa phiếu hoặc không ai vote
  if (entries.length === 0) {
    room.killedTonight = null;
  } else {
    // Sắp xếp phiếu từ nhiều xuống thấp
    entries.sort((a, b) => b[1] - a[1]);
    // Kiểm tra phiếu
    if (entries.length > 1 && entries[0]![1] === entries[1]![1]) { // dùng ! để TS ko nghĩ rằng entries[0] có thể undefined
      room.killedTonight = null; // hòa phiếu → ko chết ai
    } else {
      room.killedTonight = entries[0]![0]; // playerId bị cắn
    }
  }
  // thông báo kết quả sơ cho phòng (chưa công bố đến người chơi sáng, chỉ gửi event)
  io.to(roomId).emit("wolfVoteFinished", {
    target: room.killedTonight
  });
  // Lưu trạng thái: thực tế xử lý "chết" sẽ diễn ra khi host chuyển sang buổi sáng
}



// Khi client kết nối
io.on("connection", (socket) => {
  socket.on("createRoom", ({ name }) => {
    const roomId = generateRoomId(activeRooms);

    rooms[roomId] = {
      id: roomId,
      players: [{ id: socket.id, name, connected: true }],
      hostId: socket.id,
      positions: generateCirclePositions([socket.id]),   // khởi tạo vị trí
      positionEditors: [], // ai được phép sắp xếp
    };

    socket.join(roomId);

    // Gửi lại thông tin phòng cho người tạo
    socket.emit("roomCreated", toPublicRoom(rooms[roomId]));
  });

  socket.on("joinRoom", ({ roomId, name }) => {
    const room = rooms[roomId];
    if (!room) {
      socket.emit("errorMessage", "Phòng không tồn tại :(");
      return;
    }

    room.players.push({ id: socket.id, name, connected: true });
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
    socket.emit("roomJoined", toPublicRoom(room));

    // 2) gửi cho cả phòng để cập nhật
    io.to(roomId).emit("roomUpdated", toPublicRoom(room));
  });

  socket.on("getRoom", (roomId) => {
    const room = rooms[roomId];
    if (room) {
      socket.emit("roomUpdated", toPublicRoom(room));
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

    room.roles = room.roles || []; 

    const currentVillagers = room.roles.filter(r => r === "Dân").length;
    const maxVillagers = 10;

    const availableToAdd = maxVillagers - currentVillagers;

    if (availableToAdd <= 0) {
      // Đã đạt tối đa dân, không thêm nữa
      const stillMissing = room.players.length - room.roles.length;
      io.to(room.hostId).emit("roleMismatch", {
        newPlayers: [],
        missingRoles: stillMissing
      });
      return;
    }

    const addCount = Math.min(count, availableToAdd);

    for (let i = 0; i < addCount; i++) {
      room.roles.push("Dân");
    }

    // Sau khi thêm, kiểm tra còn thiếu không
    const stillMissing = room.players.length - room.roles.length;

    if (stillMissing > 0) {
      io.to(room.hostId).emit("roleMismatch", {
        newPlayers: [],
        missingRoles: stillMissing
      });
      return;
    }

    // Đủ role → bắt đầu game luôn
    const shuffled = room.roles.slice().sort(() => Math.random() - 0.5);
    room.playerRoles = {};

    room.players.forEach((player, index) => {
      const role = shuffled[index]!; // dùng dấu chấm than vì chắc chắn số role phải bằng hoặc nhiều hơn số người
      room.playerRoles![player.id] = role;
      io.to(player.id).emit("yourRole", role);
    });

    // Thiết lập lại danh sách sói để các chức năng sói hoạt động đúng
    room.wolves = room.players
      .filter(p => room.playerRoles?.[p.id] === "Sói")
      .map(p => p.id);

    room.wolves.forEach(wolfId => {
      const wolfSocket = io.sockets.sockets.get(wolfId);
      if (wolfSocket) wolfSocket.join(`wolves_${roomId}`);
    });

    // Khởi tạo mảng người chết (để tránh lỗi undefined)
    room.deadPlayers = room.deadPlayers || [];
    
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

        // Nếu game đã bắt đầu -> không xoá khỏi phòng, chỉ đánh dấu mất kết nối
        if (room.phase) {
          room.players[playerIndex] = { ...room.players[playerIndex]!, connected: false };

          // Nếu là sói và đang ở night phase -> bỏ qua hành động của họ
          if (room.playerRoles?.[socket.id] === "Sói") {
            if (room.wolfVotes) room.wolfVotes[socket.id] = null;
            if (room.wolfLocked) room.wolfLocked[socket.id] = false;
            io.to(`wolves_${roomId}`).emit("wolfVotesUpdated", room.wolfVotes || {});
            io.to(`wolves_${roomId}`).emit("wolfLockedUpdated", room.wolfLocked || {});

            // nếu các sói còn online đã lock hết -> chốt luôn
            const activeWolves = getActiveWolves(room);
            const allLocked = activeWolves.length > 0 && activeWolves.every(id => room.wolfLocked?.[id] === true);
            if (allLocked) {
              finishWolfVoting(roomId);
            }
          }

          // broadcast cho cả phòng để hiện badge mất kết nối
          io.to(roomId).emit("roomUpdated", toPublicRoom(room));

          // Nếu host mất kết nối khi game đang diễn ra
          if (isHost) {
            io.to(roomId).emit("hostDisconnected");
            console.log(`Host mất kết nối khi game đang diễn ra ở phòng ${roomId}`);
          }

          break;
        }

        // Game chưa bắt đầu -> xoá user khỏi room như cũ
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
            // Chuyển quyền host cho người đầu tiên còn lại
            if (room.players[0]) {
              room.hostId = room.players[0].id;
              io.to(roomId).emit("hostChanged", room.hostId);
              io.to(roomId).emit("roomUpdated", toPublicRoom(room));
              console.log(`Chủ phòng rời, chuyển quyền cho ${room.hostId}`);
            }
          } else {
            // nếu còn người → cập nhật room
            io.to(roomId).emit("roomUpdated", toPublicRoom(room));
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
        const missingRoles = Math.max(0, currentCount - (room.roles?.length || 0));
        // gửi cảnh báo CHỈ đến host
        if (missingRoles > 0) {
          io.to(room.hostId).emit("roleMismatch", {
            newPlayers,
            missingRoles
          });
          return;
        }
      }
    }

    const roles = room.roles;
    if (!roles || roles.length < room.players.length) {
      socket.emit("errorMessage", "Danh sách vai trò không hợp lệ hoặc chưa được chọn.");
      return;
    }

    // random role cho mỗi người và lưu mapping
    const shuffled = roles.slice().sort(() => Math.random() - 0.5);
    room.playerRoles = {};
    room.players.forEach((player, index) => {
      const role: string = shuffled[index] || "";
      room.playerRoles![player.id] = role;
      // gửi role bí mật cho từng client
      console.log(`[yourRole emit] Gửi role '${role}' cho player ${player.id}`);
      io.to(player.id).emit("yourRole", role);
    });


    // Thiết lập danh sách sói
    room.wolves = room.players
      .filter(p => room.playerRoles?.[p.id] === "Sói")
      .map(p => p.id);

    room.wolves.forEach(wolfId => {
      const wolfSocket = io.sockets.sockets.get(wolfId);
      if (wolfSocket) wolfSocket.join(`wolves_${roomId}`);
    });

    // đảm bảo danh sách deadPlayers tồn tại
    room.deadPlayers = room.deadPlayers || [];


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

    if (phase === "night") {
      startWolfPhase(roomId);
    } 
    else if (phase === "day") {
      // khi chuyển sang sáng -> nếu có người bị cắn thì công bố và đánh dấu dead
      if (room.killedTonight) {
        room.deadPlayers = room.deadPlayers || [];
        if (!room.deadPlayers.includes(room.killedTonight)) {
          room.deadPlayers.push(room.killedTonight);
        }
        // gửi thông báo người bị chết cho cả phòng
        io.to(roomId).emit("playerKilled", room.killedTonight);
        // xóa killedTonight sau khi công bố
        room.killedTonight = null;
      }
          // cleanup any wolf phase leftover
        if (room.wolfTimer) {
          clearTimeout(room.wolfTimer);
          room.wolfTimer = null;
        }
        room.wolfVotes = {};
        room.wolfLocked = {};
        room.wolfDeadline = null;
    }
  });

  // Nhường quyền chủ phòng cho người khác
  socket.on("transferHost", ({ roomId, targetId }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (socket.id !== room.hostId) return; // chỉ host mới được nhường quyền
    if (!room.players.find(p => p.id === targetId)) return;
    room.hostId = targetId;
    io.to(roomId).emit("hostChanged", room.hostId);
    io.to(roomId).emit("roomUpdated", toPublicRoom(room));
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
    io.to(roomId).emit("roomUpdated", toPublicRoom(room));
    io.to(targetId).emit("kicked"); // thông báo cho người bị kick
  });

  // Xử lý chức năng tiên tri soi người
  socket.on("seerCheck", ({ roomId, targetId }) => {
    const room = rooms[roomId];
    if (!room || !room.playerRoles) return;
    const roleOfTarget = room.playerRoles[targetId];
    const isWolf = roleOfTarget === "Sói";
    io.to(socket.id).emit("seerResult", { playerId: targetId, isWolf });
  });

  // Xử lý chức năng sói chọn cắn ai
  socket.on("wolfChooseTarget", ({ roomId, targetId }) => {
    const room = rooms[roomId];
    if (!room) return;
    if (room.playerRoles?.[socket.id] !== "Sói") return; // chỉ sói mới được chọn
    if ((room.deadPlayers || []).includes(socket.id)) return; // sói chết -> bỏ qua

    // nếu sói đã cắn thì ko cho thay đổi
    if (room.wolfLocked?.[socket.id]) {
      socket.emit("errorMessage", "Bạn đã bấm CẮN, không thể thay đổi lựa chọn.");
      return;
    }

    room.wolfVotes = room.wolfVotes || {}; // khởi tạo nếu chưa có
    room.wolfVotes[socket.id] = targetId || null; // cho phép null để hủy chọn

    // Gửi cập nhật vote cho tất cả sói để họ nhìn thấy
    io.to(`wolves_${roomId}`).emit("wolfVotesUpdated", room.wolfVotes); 
  });

  // Xử lý khi sói nhấn nút "Cắn" (lock vote)
  socket.on("wolfLockVote", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;

    if (room.playerRoles?.[socket.id] !== "Sói") return;

    room.wolfLocked = room.wolfLocked || {}; // khởi tạo nếu chưa có
    room.wolfLocked![socket.id] = true;

    // Gửi cập nhật trạng thái lock cho tất cả sói
    io.to(`wolves_${roomId}`).emit("wolfLockedUpdated", room.wolfLocked);

    // nếu tất cả sói đã lock → xử lý ngay, không chờ hết 10 giây
    const activeWolves = getActiveWolves(room);
    const allLocked = activeWolves.length > 0 && activeWolves.every(id => room.wolfLocked?.[id] === true);
    if (allLocked) {
    if (room.wolfTimer) { // nếu timer còn tồn tại
      clearTimeout(room.wolfTimer);
      room.wolfTimer = null;
    }
    finishWolfVoting(roomId);
    }
  });


});


// Start server
httpServer.listen(3001, () => {
  console.log("Backend đang chạy tại http://localhost:3001");
});


