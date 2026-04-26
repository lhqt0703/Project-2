export const ELEMENTAL_ROLE_ORDER = [
  "Nước",
  "Lửa",
  "Gió",
  "Tự Nhiên",
  "Sấm Sét",
  "Băng Giá",
  "Dung Nham",
  "Ánh Sáng",
  "Bóng Tối",
  "Bí Ẩn",
] as const;

export type ElementalRole = (typeof ELEMENTAL_ROLE_ORDER)[number];

export const ELEMENTAL_GROUP_ROLE = "Dân làng nguyên tố" as const;

export const ELEMENTAL_BUFFS = [
  { id: "reduce-next-night-effect", label: "Giảm 50% thời gian hành động của phe sói", tier: 2 },
  { id: "seer-immune", label: "Tiên tri không bị ảnh hưởng nguyên tố", tier: 2 },
  { id: "witch-restore-potion", label: "Phù thủy hồi 1 bình", tier: 3 },
  { id: "guardian-double-protect", label: "Bảo vệ bảo vệ 2 người (1 lần)", tier: 3 },
  { id: "immune-one-negative-element", label: "Miễn nhiễm 1 nguyên tố bất lợi", tier: 3 },
  { id: "cancel-pending-element-effect", label: "Hủy 1 hiệu ứng nguyên tố sắp kích hoạt", tier: 4 },
  { id: "seer-check-two", label: "Tiên tri soi 2 người", tier: 4 },
  { id: "hunter-double-shot", label: "Thợ săn bắn 2 phát (không cần chết)", tier: 4 },
] as const;

export type ElementalBuffId = (typeof ELEMENTAL_BUFFS)[number]["id"];

export const ELEMENTAL_BUFF_LABELS: Record<ElementalBuffId, string> = Object.fromEntries(
  ELEMENTAL_BUFFS.map((buff) => [buff.id, buff.label])
) as Record<ElementalBuffId, string>;

export const ELEMENTAL_ROLE_SET = new Set<string>(ELEMENTAL_ROLE_ORDER);

export const MIN_CORRECT_ELEMENTAL_GUESSES_FOR_BUFF = 2;

/**
 * Determine which buff tier is available based on the number of correct elemental guesses.
 * - 2 correct → tier 2
 * - 3 correct → tier 3
 * - 4+ correct → tier 4
 */
export function getBuffTier(correctGuessCount: number): number {
  if (correctGuessCount >= 4) return 4;
  if (correctGuessCount === 3) return 3;
  if (correctGuessCount === 2) return 2;
  return 0;
}

/**
 * Get the label for a buff ID.
 */
export function getBuffLabel(buffId: ElementalBuffId | null | undefined): string {
  if (!buffId) return "(không có)";
  return ELEMENTAL_BUFF_LABELS[buffId] || buffId;
}
