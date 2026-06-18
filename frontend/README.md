# Real-time Board Game Platform
Một nền tảng web chơi game Ma Sói và Diệt Quỷ (phóng tác từ *Blood on the Clocktower*) trực tuyến thời gian thực, hỗ trợ nhiều chế độ chơi đa dạng, thiết lập luật chơi chi tiết và tương tác mượt mà qua kết nối WebSocket.
---
## 🚀 Tính năng nổi bật
### 🎮 Các Chế độ chơi đa dạng
1. **Dạ Nghịch (Chế độ chính):** Lấy cảm hứng từ Ma sói và kết hợp với hệ thống Nguyên tố (Elemental Buffs). Người chơi có thể bầu chọn các hiệu ứng nguyên tố để tăng sức mạnh cho phe của mình vào ban đêm.
2. **Diệt Quỷ (Clocktower style):** Lấy cảm hứng từ *Blood on the Clocktower* với các vai trò độc đáo như Ác Quỷ (Imp), Nhà Sư (Monk), Gián Điệp (Spy), Thợ Giặt (Washerwoman), Thủ Thư (Librarian), Điều Tra Viên (Investigator), Nuôi Quạ (Ravenkeeper), Diệt Quỷ (Slayer)... Vòng chơi ban đêm diễn ra theo lượt xoay vòng của từng người chơi.
3. **Sói Mù (Blind Werewolf):** Chế độ đặc biệt nơi thông tin của Ma Sói bị ẩn giấu và người chơi tương tác qua các quyết định giơ ngón tay (Thumbs up/down).
### 🛠️ Tùy biến Luật chơi linh hoạt (Game Rules Customization)
* Tùy chỉnh thứ tự hành động ban đêm (Sequential vs Simultaneous).
* Cài đặt thời gian cho các phe ban đêm.
* Cài đặt chi tiết luật cho những vai trò khác nhau.
### ⏱️ Luồng Game Thời gian thực (Real-time Flow)
* **Ban đêm (Night Flow):** Xử lý hành động của các vai trò đặc biệt, đếm ngược thời gian, hỗ trợ xin thêm thời gian (Extra time).
* **Ban ngày (Day Flow):** Thảo luận tự do, bỏ phiếu treo cổ, đưa nghi phạm lên giàn giáo.
* **Xét xử (Trial Stage):** Nghi phạm tự bào chữa (Defense), người dân bỏ phiếu kết án (Verdict) sống hoặc chết.
### 📊 Hệ thống Lịch sử Trận đấu & Replay
* Tự động lưu trữ thông tin trận đấu dưới dạng file `.json` tại thư mục [backend/data/history](file:///b:/Project%202/backend/data/history).
* Hỗ trợ tải lại trận đấu để xem lại diễn biến chi tiết (Replay) của từng đêm và ngày.
---
## 🛠️ Công nghệ sử dụng
### Backend
* **Runtime:** Node.js (TypeScript)
* **Framework:** Express
* **Real-time:** Socket.io
* **Lưu trữ:** File-based JSON Database
### Frontend
* **Framework:** React.js (TypeScript)
* **Build Tool:** Vite
* **Real-time Client:** Socket.io-client
* **CSS:** Vanilla CSS (Sử dụng hệ thống biến CSS đồng bộ)
---
## 📂 Cấu trúc thư mục dự án
```text
├── backend/
│   ├── data/                 # Thư mục lưu lịch sử trận đấu (.json)
│   ├── src/
│   │   ├── server.ts         # Khởi tạo Express server & Socket.io
│   │   ├── socketHandlers.ts # Xử lý toàn bộ sự kiện realtime
│   │   ├── dayFlow.ts        # Quản lý luồng chơi ban ngày
│   │   ├── nightFlow.ts      # Quản lý luồng chơi ban đêm
│   │   ├── gameHistory.ts    # Đọc/ghi lịch sử trận đấu
│   │   ├── serverTypes.ts    # Định nghĩa các TypeScript types & interfaces
│   │   └── tests/            # Bộ unit tests cho backend
│   └── tsconfig.json
│
├── frontend/
│   ├── src/
│   │   ├── pages/            # Các trang giao diện chính
│   │   │   ├── Home.tsx      # Trang chủ
│   │   │   ├── Lobby.tsx     # Sảnh chờ tìm phòng
│   │   │   ├── Room.tsx      # Phòng chờ chuẩn bị game
│   │   │   ├── GameDaNghich.tsx # Giao diện chơi chế độ Dạ Nghịch
│   │   │   ├── GameDietQuy.tsx   # Giao diện chơi chế độ Diệt Quỷ
│   │   │   └── GameSoiMu.tsx     # Giao diện chơi chế độ Sói Mù
│   │   ├── components/       # Các components dùng chung
│   │   ├── theme.css         # CSS Theme hệ thống
│   │   └── socket.ts         # Cấu hình kết nối WebSocket client
│   └── vite.config.ts
└── README.md                 # Tài liệu hướng dẫn này
```
---