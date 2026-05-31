/**
 * SOUND EFFECTS MANAGER FOR WEREWOLF GAME
 * 
 * Hướng dẫn sử dụng:
 * 1. Đặt các file âm thanh (.mp3 hoặc .wav) vào thư mục `frontend/public/sounds/` hoặc `frontend/src/assets/sounds/`.
 *    Khuyên dùng thư mục `public/sounds/` vì dễ truy xuất bằng đường dẫn trực tiếp.
 * 2. Cập nhật đường dẫn tương ứng trong đối tượng `SOUND_REGISTRY` dưới đây.
 * 3. Khi các file âm thanh đã tồn tại, nó sẽ tự động phát. Nếu file chưa tồn tại,
 *    hệ thống sẽ tự động bắt lỗi (graceful fallback) và chỉ ghi cảnh báo ra console, hoàn toàn không gây lỗi hay gián đoạn game!
 */

// Định nghĩa các loại âm thanh trong game
export const SOUND_REGISTRY = {
  cardFlip: "/sounds/card-flip.mp3",       // Âm thanh lật bài 3D
  nightFall: "/sounds/night-fall.mp3",     // Âm thanh chuyển đêm sương mù kêu gọi sói thức giấc
  sunrise: "/sounds/sunrise.mp3",         // Âm thanh trời sáng chim hót, bắt đầu ngày
  elementIce: "/sounds/element-ice.mp3",   // Âm thanh đóng băng người chơi
  elementFire: "/sounds/element-fire.mp3", // Âm thanh lửa thiêu đốt
  elementLightning: "/sounds/element-lightning.mp3", // Âm thanh sét đánh tê liệt
  elementDarkness: "/sounds/element-darkness.mp3",   // Âm thanh bóng tối bao phủ
  logAdded: "/sounds/log-added.mp3",       // Âm thanh trượt xuất hiện dòng log mới
};

export type SoundKey = keyof typeof SOUND_REGISTRY;

class SoundManager {
  private enabled: boolean = true;
  private volume: number = 0.5;

  /**
   * Bật/Tắt tất cả âm thanh
   */
  public setEnabled(val: boolean) {
    this.enabled = val;
  }

  /**
   * Điều chỉnh âm lượng từ 0.0 đến 1.0
   */
  public setVolume(volume: number) {
    this.volume = Math.max(0, Math.min(1, volume));
  }

  /**
   * Phát âm thanh theo Key
   * @param key Key của âm thanh đăng ký trong SOUND_REGISTRY
   */
  public play(key: SoundKey) {
    if (!this.enabled) return;

    const path = SOUND_REGISTRY[key];
    if (!path) {
      console.warn(`[SoundManager] Không tìm thấy key âm thanh: "${key}"`);
      return;
    }

    const audio = new Audio(path);
    audio.volume = this.volume;

    // Graceful Fallback: Bắt lỗi nếu file chưa tồn tại hoặc bị trình duyệt chặn tự động phát (autoblock)
    audio.play().catch((err) => {
      // Chỉ in cảnh báo dạng debug, không làm gián đoạn trò chơi
      console.debug(
        `[SoundManager] Chưa thể phát âm thanh "${key}". Lý do: File chưa tồn tại tại "${path}" hoặc trình duyệt yêu cầu tương tác trước để phát âm thanh.`,
        err.message
      );
    });
  }
}

export const soundManager = new SoundManager();
