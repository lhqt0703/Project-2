# Agent Guidelines

<!-- - **Build Instructions**: Only run the command `npm run build` when the user requests it. -->
- Phản hồi bằng tiếng Việt (nhất là Implementation Plan)

# Ponytail

Before writing any code, stop at the first rung that holds:

1. Does this need to be built at all? (YAGNI)
2. Does the standard library already do this? Use it.
3. Does a native platform feature cover it? Use it.
4. Does an already-installed dependency solve it? Use it.
5. Can this be one line? Make it one line.
6. Only then: write the minimum code that works.

Rules:

- No abstractions that weren't explicitly requested.
- No new dependency if it can be avoided.
- No boilerplate nobody asked for.
- Deletion over addition. Boring over clever. Fewest files possible.
- Question complex requests: "Do you actually need X, or does Y cover it?"
- Pick the edge-case-correct option when two stdlib approaches are the same size, lazy means less code, not the flimsier algorithm.
- Mark intentional simplifications with a `ponytail:` comment

# Quy Tắc Phát Triển Codebase (Dành Cho AI & Dev)

Tài liệu này là bộ quy chuẩn bắt buộc khi tạo mới hoặc sửa đổi mã nguồn trong dự án nhằm giữ cho codebase nhất quán, sạch sẽ và tối giản.

## 1. Phân Vùng Trách Nhiệm Codebase (Code Ownership Map)
- [frontend/src/pages/](file:///b:/Project-2/frontend/src/pages/): Nơi ghép nối layout các màn hình chính (Route, Lobby, Room, Game). Không chứa các chi tiết UI nhỏ đã được dùng ổn định ở nơi khác.
- [frontend/src/components/](file:///b:/Project-2/frontend/src/components/): Chứa các component giao diện dùng chung hoặc các khối UI độc lập (bảng vị trí, modal, hiệu ứng vfx, hoạt cảnh...).
- [frontend/src/pages/gameRoles/](file:///b:/Project-2/frontend/src/pages/gameRoles/): Nơi quản lý logic nghiệp vụ đặc thù của từng vai trò (chọn mục tiêu, điều kiện kích hoạt kỹ năng...).
- [frontend/src/context/](file:///b:/Project-2/frontend/src/context/): Quản lý state chung phía client. Không được tự ý xử lý luật game hay timer có tính quyết định tại đây.
- [frontend/src/constants/](file:///b:/Project-2/frontend/src/constants/): Lưu trữ dữ liệu tĩnh, hằng số hiển thị, danh sách vai trò và ánh xạ tài nguyên (asset mapping).
- [backend/src/](file:///b:/Project-2/backend/src/): **Nguồn dữ liệu chuẩn (Authoritative Source / Source of Truth)** của phòng chơi, luật game, phân quyền, quản lý timer và kết quả thắng/thua.
  > [!IMPORTANT]
  > Không đưa luật quyết định thắng/thua, kiểm tra quyền hay timer quyết định vào frontend. Frontend chỉ gửi lệnh và hiển thị state đã được backend lọc và phê duyệt.

## 2. Tiêu Chí Tách Component và Hook Hợp Lý (Tránh Double Code)
- **Tuyệt đối không copy-paste** code từ trang game này sang trang game khác nếu tính năng tương tự nhau.
- **Khi nào nên tách file:**
  - Khi logic UI hoặc state (ví dụ: Modal xác nhận, Handler Sticker, Resize Window, Chat channel) xuất hiện ở `>= 2` trang.
  - Khi component con (ví dụ: các loại Modal, Panel, hoạt cảnh chiến thắng...) có cấu trúc logic độc lập lớn và làm file chính bị phình to. Việc tách file giúp mã nguồn dễ đọc hơn và AI xử lý tốt hơn.
- **Quy tắc thiết kế API component:**
  - Component con chỉ nhận đúng dữ liệu (props) và callback cần thiết. Không truyền cả object `room` lớn hoặc các state cồng kềnh nếu chỉ sử dụng một vài trường dữ liệu.
  - Đặt tên component theo mục đích người dùng thấy (ví dụ: `GameHeader`, `HostControls`, `AvatarPicker`). Tránh đặt tên chung chung khó hiểu như `Common`, `BaseWrapper`.

## 3. Quy Chuẩn Giao Diện (UI) & CSS
- **Thiết kế trong suốt & mờ ảo (Glassmorphism):** Tránh sử dụng các biến màu đặc cũ như `var(--surface)` (màu `#171a21` không đẹp mắt) và `var(--surface-muted)`. Thay vào đó, dự án khuyến khích sử dụng các màu nền trong suốt cao cấp kết hợp với hiệu ứng blur (ví dụ: `rgba(255, 255, 255, 0.02)` kết hợp `backdrop-filter: blur(8px)`).
- **Quy chuẩn hóa biến CSS:** Chúng ta sẽ định nghĩa một bộ CSS variables mới cho kiểu dáng trong suốt (ví dụ: `--glass-bg`, `--glass-border`, `--glass-blur`) trong [theme.css](file:///b:/Project-2/frontend/src/theme.css) để tất cả các AI/lập trình viên sử dụng chung, thay vì viết ad-hoc các giá trị rgba khác nhau ở từng file.
- **CSS đi kèm Component:** Trừ các reset toàn cục và biến CSS dùng chung trong `theme.css`, style của component nào phải nằm trong file CSS riêng đi kèm component đó (ví dụ: `MyComponent.tsx` và `MyComponent.css`).
- **Hạn chế Inline Style:** Không viết css inline dài dòng cho các cấu trúc UI tĩnh. Chỉ dùng style inline cho các giá trị thực sự động tại runtime (vị trí kéo thả, kích thước tính theo runtime, transform hoặc hoạt ảnh động).

## 4. Quản Lý Socket & Đồng Bộ Trạng Thái Realtime
- Tránh tự ý đăng ký listener socket thô (`socket.on(...)`) trực tiếp trong các Page Component. Sử dụng hoặc mở rộng hook `useGameSocketSync` để quản lý việc đồng bộ trạng thái từ server.
- **Giải phóng bộ nhớ (Cleanup):** Mỗi khi đăng ký `socket.on` trong `useEffect`, bắt buộc phải có `socket.off` với đúng tên sự kiện và callback tương ứng trong hàm cleanup để tránh rò rỉ bộ nhớ (memory leak).
- **An toàn dữ liệu bí mật:** Các trường thông tin bí mật (như vai trò ẩn, hành động ban đêm của người khác) tuyệt đối không được trả về qua các sự kiện public. Phải dùng emitter riêng biệt chỉ gửi cho client có thẩm quyền.

## 5. TypeScript & Dữ Liệu Chặt Chẽ
- Tuyệt đối **không dùng `any`** cho state game, payload socket hoặc dữ liệu log. Hãy định nghĩa kiểu dữ liệu (Types/Interfaces) rõ ràng, sử dụng union type hoặc type guard khi cần thu hẹp phạm vi dữ liệu.
- Chỉ chấp nhận `as any` khi bắt buộc phải tương thích với thư viện bên thứ ba không có type tốt. Phải ghi rõ lý do.
- Khi chỉnh sửa luật game ảnh hưởng đến cả Client và Server, hãy cập nhật type tương ứng ở cả hai bên. Không đồng bộ thủ công bằng cách chép tay type/array sang phía còn lại.

## 6. Baseline Rà Soát Thực Tế (Hotspots Cần Lưu Ý)
Đây là các khu vực chứa nhiều code cũ hoặc file quá lớn. Khi chỉnh sửa, cần hết sức lưu ý để tránh làm phình to thêm:
1. **Các trang game chính:** [GameDaNghich.tsx](file:///b:/Project-2/frontend/src/pages/GameDaNghich.tsx) (3.700+ dòng) và [GameDietQuy.tsx](file:///b:/Project-2/frontend/src/pages/GameDietQuy.tsx) (3.500+ dòng) bị lặp code UI rất nhiều (Stickers, Messages, Modals...). Khi sửa UI chung, hãy ưu tiên trích xuất dần thành component/hook nhỏ dùng chung.
2. **Backend Handlers:** File [socketHandlers.ts](file:///b:/Project-2/backend/src/socketHandlers.ts) (6.400+ dòng) đang quá tải. Không viết thêm logic nghiệp vụ lớn vào file này. Hãy tách các logic xử lý độc lập sang các module nghiệp vụ tương ứng (dayFlow, nightFlow, roleAction...).
3. **Components lớn:** [GameLogPanel.tsx](file:///b:/Project-2/frontend/src/components/GameLogPanel.tsx) và [PlayerPositions.tsx](file:///b:/Project-2/frontend/src/components/PlayerPositions.tsx) là các component giao diện phức tạp. Giữ thay đổi ở mức tối thiểu và có kiểm soát.