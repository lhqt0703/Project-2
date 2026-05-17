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
  { id: "cancel-pending-element-effect", label: "Hủy hoàn toàn hiệu ứng nguyên tố bất lợi", tier: 4 },
  { id: "seer-check-two", label: "Tiên tri soi 2 người", tier: 4 },
  { id: "hunter-double-shot", label: "Thợ săn bắn 2 phát (không cần chết)", tier: 4 },
  { id: "protector-immortality-permanent", label: "Bất tử của Hộ nhân tồn tại đến cuối game", tier: 4 },
] as const;

export type ElementalBuffId = (typeof ELEMENTAL_BUFFS)[number]["id"];

export const ELEMENTAL_BUFF_LABELS: Record<ElementalBuffId, string> = Object.fromEntries(
  ELEMENTAL_BUFFS.map((buff) => [buff.id, buff.label])
) as Record<ElementalBuffId, string>;

export const ELEMENTAL_ROLE_SET = new Set<string>(ELEMENTAL_ROLE_ORDER);

export const ELEMENTAL_EFFECT_GUIDE = [
  {
    role: "Nước",
    wolfBite: "Phù thủy mất toàn bộ nước trong bình khiến không dùng được bình thuốc nào nữa",
    villagerMistake: "Phù thủy mất ngẫu nhiên 1 trong 2 bình; nếu chỉ còn 1 bình thì mất luôn bình đó",
  },
  {
    role: "Lửa",
    wolfBite: "Đạn của các Thợ săn không còn bắn được nữa",
    villagerMistake: "Đạn của các Thợ săn chỉ còn 50% tỷ lệ bắn thành công",
  },
  {
    role: "Gió",
    wolfBite: "Thời gian thực hiện hành động trong đêm của phe dân bị giảm 50%",
    villagerMistake: "Thời gian thực hiện hành động trong đêm của phe dân bị giảm 30%",
  },
  {
    role: "Tự Nhiên",
    wolfBite: "Bảo vệ không thể bảo vệ được ai nữa",
    villagerMistake: "Mỗi khi dùng kỹ năng, Bảo vệ phải chờ thêm 1 đêm mới có thể dùng kỹ năng tiếp",
  },
  {
    role: "Sấm Sét",
    wolfBite: "2 người cạnh người bị sói cắn sẽ bị tê liệt và không thể biểu quyết vào sáng hôm sau",
    villagerMistake: "Vết cắn có 50% tỷ lệ làm 1 người cạnh người bị cắn tê liệt, không thể biểu quyết sáng hôm sau",
  },
  {
    role: "Băng Giá",
    wolfBite: "2 người cạnh người bị sói cắn bị đóng băng và không thể dùng chức năng trong đêm đó",
    villagerMistake: "Vết cắn có 50% tỷ lệ làm 1 người cạnh người bị cắn đóng băng, không thể dùng chức năng trong đêm đó",
  },
  {
    role: "Dung Nham",
    wolfBite: "Vết cắn chắc chắn giết mục tiêu khiến Phù thủy không cứu được và Bảo vệ cũng không bảo vệ nổi",
    villagerMistake: "Phù thủy không cứu được vết cắn, nhưng Bảo vệ vẫn có thể bảo vệ",
  },
  {
    role: "Ánh Sáng",
    wolfBite: "Kỹ năng nhắm mục tiêu của phe dân luôn lệch sang người cạnh mục tiêu",
    villagerMistake: "Mỗi đêm có tối đa 1 kỹ năng phe dân bị lệch sang người cạnh mục tiêu với tỷ lệ 50%",
  },
  {
    role: "Bóng Tối",
    wolfBite: "Kỹ năng nhắm mục tiêu của phe dân luôn bị trượt (Đồng nghĩa Tiên tri luôn soi không ra Sói)",
    villagerMistake: "Mỗi đêm có tối đa 1 kỹ năng phe dân bị trượt với tỷ lệ 50%",
  },
  {
    role: "Bí Ẩn",
    wolfBite: "Kỹ năng nhắm mục tiêu của phe dân luôn phản lại chính họ",
    villagerMistake: "Mỗi đêm có tối đa 1 kỹ năng phe dân bị phản lại với tỷ lệ 50%",
  },
] as const;

export const ELEMENTAL_COMBINED_LIGHT_DARK_EFFECT = {
  wolfBite:
    "Nếu cả Ánh Sáng và Bóng Tối đều đã mất vì sói cắn, đạn Thợ săn luôn lệch sang người cạnh mục tiêu nhưng sẽ trượt nếu lệch vào Sói; Phù thủy không thấy vết cắn, bình giết bị lệch và trượt nếu lệch vào Sói; hoa của Bảo vệ luôn trượt; Tiên tri luôn soi không ra.",
  villagerMistake:
    "Nếu cả Ánh Sáng và Bóng Tối đều đã mất do phe dân giết nhầm, mỗi đêm có tối đa 1 role bị ảnh hưởng với tỷ lệ 50%: đạn Thợ săn lệch/trượt, bình cứu có 50% trượt, bình giết có 50% lệch, hoa Bảo vệ có 50% trượt, Tiên tri có 50% soi không ra.",
} as const;
