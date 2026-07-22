## 7. Các Bài Học & Kinh Nghiệm Đã Rút Ra (Lessons Learned & Anti-patterns)
Dưới đây là các lưu ý quan trọng rút ra từ thực tế phát triển để tránh lặp lại lỗi cũ trong các phiên làm việc tiếp theo:

- **Đồng bộ dữ liệu Vote Realtime (`wolfVotes`, `dayVotes`, `trialVotes`)**:
  - Dữ liệu vote realtime từ Server phát về qua socket được `useGameSocketSync` ghi trực tiếp lên `room` (ví dụ `room.wolfVotes`, `room.wolfVotes2`).
  - Khi đọc dữ liệu vote trong các hook vai trò (`useWolfRole`, `useDayVoteRole`) và UI (`PlayerPositions`), BẮT BUỘC sử dụng fallback song song: `(room.wolfVotes || room.daNghichState?.wolfVotes)`. Tránh chỉ đọc ở `daNghichState` làm trôi vote.

- **Bảo toàn dữ liệu Vote khi người chơi Disconnect (Mất kết nối)**:
  - Trong handler `disconnect` trên backend, TUYỆT ĐỐI KHÔNG reset phiếu hoặc xóa chốt phiếu của người chơi (`room.dayVotes[id] = null`, `room.dayLocked[id] = false`, `room.trialVotes[id] = null`). Phiếu đã chốt của người chơi phải được giữ nguyên.

- **Tính toán tổng số Cử tọa / Voter (`y` trong badge `x/y`)**:
  - Tổng số phiếu cần tính (`y`) dựa trên TỔNG SỐ NGƯỜI CHƠI CÒN SỐNG.
  - KHÔNG được dùng `isPlayerConnected` để lọc bớt người chơi rớt mạng ra khỏi `getActiveDayVoters`. Người chơi mất kết nối tạm thời vẫn là người chơi còn sống trong ván đấu.

- **Đồng bộ kiểu dữ liệu TypeScript (`RoomLike`)**:
  - Khi bổ sung thuộc tính mới vào `room` (như `wolfVotes`, `wolfVotes2`, `wildWolfConvert...`), bắt buộc phải khai báo bổ sung vào `interface RoomLike` trong [PlayerPositions.tsx](file:///b:/Project-2/frontend/src/components/PlayerPositions.tsx) và [useWolfRole.tsx](file:///b:/Project-2/frontend/src/pages/gameRoles/useWolfRole.tsx) để tránh lỗi TypeScript lặp lại.

- **Kỹ thuật Animation Gradient Chuyển Màu Mượt (Glassmorphic / Badges)**:
  - Để chuyển gradient màu mượt (như Đỏ tied <-> Xanh winner trên vote badge), hãy dùng 2 layer gradient tuyệt đối lồng nhau và transition thuộc tính `opacity: 0 -> 1` cùng `box-shadow` thay vì đổi trực tiếp `background`.