import { useEffect, useMemo, useState } from "react";
import { DEFAULT_ROOM_GAME_RULES, type NightActionOrderRole, type RoomGameRules } from "../context/RoomContext";
import { ELEMENTAL_GROUP_ROLE, ELEMENTAL_ROLE_ORDER } from "../constants/elemental";

const NIGHT_ACTION_ROLE_LABELS: Record<NightActionOrderRole, string> = {
  [ELEMENTAL_GROUP_ROLE]: "Dân làng nguyên tố",
  "Sói": "Phe sói",
  "Bảo vệ": "Bảo vệ",
  "Hộ nhân": "Hộ nhân",
  "Phù thủy": "Phù thủy",
  "Linh sói": "Linh sói",
  "Thợ săn": "Thợ săn",
  "Tiên tri": "Tiên tri",
  "Thần tình yêu": "Thần tình yêu",
  "Kẻ bị nguyền": "Kẻ bị nguyền",
  "Tay Buôn": "Tay Buôn",
  "Trưởng làng": "Trưởng làng",
  "Song Trùng": "Song Trùng",
  "Người pha cà phê": "Người pha cà phê",
  "Linh Chi": "Linh Chi",
  "Đông Trùng": "Đông Trùng",
};

const NIGHT_ACTION_DURATION_STEP_SEC = 10;
const NIGHT_ACTION_DURATION_MAX_SEC = 60;
const COFFEE_HERB_ROLES = new Set<NightActionOrderRole>(["Linh Chi", "Đông Trùng"]);

function normalizeNightActionOrder(order: NightActionOrderRole[], availableRoles: NightActionOrderRole[]) {
  const availableSet = new Set(availableRoles);
  const seen = new Set<NightActionOrderRole>();
  const next: NightActionOrderRole[] = [];
  const merchantRole = "Tay Buôn" as NightActionOrderRole;
  let hadMerchantInInput = false;

  for (const role of order) {
    if (!availableSet.has(role)) continue;
    if (seen.has(role)) continue;
    seen.add(role);
    if (role === merchantRole) hadMerchantInInput = true;
    next.push(role);
  }

  for (const role of availableRoles) {
    if (seen.has(role)) continue;
    seen.add(role);
    next.push(role);
  }

  let normalized = next;
  if (!hadMerchantInInput && availableSet.has(merchantRole)) {
    normalized = [merchantRole, ...normalized.filter((role) => role !== merchantRole)];
  }

  if (!seen.has("Thần tình yêu" as NightActionOrderRole)) return normalized;
  return [
    "Thần tình yêu" as NightActionOrderRole,
    ...normalized.filter((role) => role !== "Thần tình yêu"),
  ];
}

function clampSelectionLimit(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(10, Math.floor(value)));
}

function clampMerchantWinRequiredSuccessfulTrades(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_ROOM_GAME_RULES.merchantWinRequiredSuccessfulTrades;
  return Math.max(1, Math.min(10, Math.floor(value)));
}

function normalizeDurationSec(value: number, fallback: number, minSec = 0) {
  if (!Number.isFinite(value)) return fallback;
  const rounded = Math.round(value);
  return Math.max(minSec, Math.min(NIGHT_ACTION_DURATION_MAX_SEC, rounded));
}

function clampNonWolfNightActionDurationSec(value: number, allNightActionsSimultaneous: boolean, isDietQuy = false, isSoiMu = false) {
  // Chế độ Diệt Quỷ hoặc Sói Mù cho phép 0s (không giới hạn thời gian)
  const minSec = (allNightActionsSimultaneous || isDietQuy || isSoiMu) ? 0 : NIGHT_ACTION_DURATION_STEP_SEC;
  const fallback = isSoiMu ? 30 : DEFAULT_ROOM_GAME_RULES.nonWolfNightActionDurationSec;
  return normalizeDurationSec(value, fallback, minSec);
}

function clampWolfNightActionDurationSec(value: number, isSoiMu = false) {
  const fallback = isSoiMu ? 30 : DEFAULT_ROOM_GAME_RULES.wolfNightActionDurationSec;
  return normalizeDurationSec(value, fallback);
}

function normalizeNightActionDurations(input: {
  allNightActionsSimultaneous: boolean;
  nonWolfNightActionDurationSec: number;
  wolfNightActionDurationSec: number;
}, isDietQuy = false, isSoiMu = false) {
  const nonWolf = clampNonWolfNightActionDurationSec(
    input.nonWolfNightActionDurationSec,
    input.allNightActionsSimultaneous,
    isDietQuy,
    isSoiMu
  );
  let wolf = clampWolfNightActionDurationSec(input.wolfNightActionDurationSec, isSoiMu);
  if (wolf > nonWolf) wolf = nonWolf;
  return {
    nonWolfNightActionDurationSec: nonWolf,
    wolfNightActionDurationSec: wolf,
  };
}

function rowStyle() {
  return {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    padding: "14px 16px",
    borderRadius: 14,
    border: "1px solid var(--border)",
    background: "rgba(255,255,255,0.04)",
  };
}

interface RuleNumericInputProps {
  value: number | undefined;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  onChange: (val: number) => void;
  onBlur?: () => void;
  style?: React.CSSProperties;
}

function RuleNumericInput({
  value,
  min,
  max,
  step = 1,
  disabled,
  onChange,
  onBlur,
  style,
}: RuleNumericInputProps) {
  const [localValue, setLocalValue] = useState<string>(
    value !== undefined && value !== null ? String(value) : ""
  );

  useEffect(() => {
    setLocalValue(value !== undefined && value !== null ? String(value) : "");
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const valStr = e.target.value;
    setLocalValue(valStr);

    const num = Number(valStr);
    if (valStr !== "" && Number.isFinite(num)) {
      const clampedVal = Math.min(max, num);
      onChange(clampedVal);
    }
  };

  const handleBlur = () => {
    let num = Number(localValue);
    if (localValue === "" || !Number.isFinite(num)) {
      num = min;
    }
    const clamped = Math.max(min, Math.min(max, Math.round(num)));
    setLocalValue(String(clamped));
    onChange(clamped);
    if (onBlur) onBlur();
  };

  return (
    <input
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      step={step}
      value={localValue}
      disabled={disabled}
      onChange={handleChange}
      onBlur={handleBlur}
      style={{
        width: 96,
        padding: "10px 12px",
        borderRadius: 8,
        border: "1px solid var(--border)",
        background: "rgba(255,255,255,0.08)",
        color: "var(--text)",
        ...style,
      }}
    />
  );
}

export default function GameRulesModal({
  open,
  title = "Thiết lập luật chơi",
  initialRules,
  availableNightActionRoles,
  includedElementalRoles = [],
  onSave,
  onClose,
  saveText = "Lưu luật chơi",
  readOnly = false,
  gameMode = "da_nghich",
}: {
  open: boolean;
  title?: string;
  initialRules: RoomGameRules;
  availableNightActionRoles?: NightActionOrderRole[];
  includedElementalRoles?: string[];
  onSave?: (rules: RoomGameRules) => void;
  onClose: () => void;
  saveText?: string;
  readOnly?: boolean;
  gameMode?: "da_nghich" | "diet_quy" | "soi_mu";
}) {
  const isDietQuy = gameMode === "diet_quy";
  const isSoiMu = gameMode === "soi_mu";
  const [draftRules, setDraftRules] = useState<RoomGameRules>(initialRules);
  const [baseRules, setBaseRules] = useState<RoomGameRules>(initialRules);
  const [draggedRole, setDraggedRole] = useState<NightActionOrderRole | null>(null);
  const [dragOverRole, setDragOverRole] = useState<NightActionOrderRole | null>(null);
  const baseSelectableNightActionRoles = availableNightActionRoles ?? DEFAULT_ROOM_GAME_RULES.nightActionOrder;
  const selectableNightActionRoles = useMemo(
    () => baseSelectableNightActionRoles.filter((role) => (
      draftRules.coffeeHerbCardMode !== "secondary" || !COFFEE_HERB_ROLES.has(role)
    )),
    [baseSelectableNightActionRoles, draftRules.coffeeHerbCardMode]
  );

  useEffect(() => {
    if (!open) return;
    const normalizedDurations = normalizeNightActionDurations({
      allNightActionsSimultaneous: initialRules.allNightActionsSimultaneous,
      nonWolfNightActionDurationSec: initialRules.nonWolfNightActionDurationSec,
      wolfNightActionDurationSec: initialRules.wolfNightActionDurationSec,
    }, isDietQuy, isSoiMu);
    const merged = {
      ...DEFAULT_ROOM_GAME_RULES,
      ...initialRules,
      nightActionOrder: normalizeNightActionOrder(
        initialRules.nightActionOrder || DEFAULT_ROOM_GAME_RULES.nightActionOrder,
        baseSelectableNightActionRoles
      ),
      trialInteractionSelectionLimit: clampSelectionLimit(initialRules.trialInteractionSelectionLimit),
      merchantWinRequiredSuccessfulTrades: clampMerchantWinRequiredSuccessfulTrades(
        initialRules.merchantWinRequiredSuccessfulTrades
      ),
      nonWolfNightActionDurationSec: normalizedDurations.nonWolfNightActionDurationSec,
      wolfNightActionDurationSec: normalizedDurations.wolfNightActionDurationSec,
      dayDiscussionDurationSec: typeof initialRules.dayDiscussionDurationSec === "number" ? initialRules.dayDiscussionDurationSec : DEFAULT_ROOM_GAME_RULES.dayDiscussionDurationSec,
      trialDefenseDurationSec: typeof initialRules.trialDefenseDurationSec === "number" ? initialRules.trialDefenseDurationSec : DEFAULT_ROOM_GAME_RULES.trialDefenseDurationSec,
      trialVerdictDurationSec: typeof initialRules.trialVerdictDurationSec === "number" ? initialRules.trialVerdictDurationSec : DEFAULT_ROOM_GAME_RULES.trialVerdictDurationSec,
      dayVotingDurationSec: typeof initialRules.dayVotingDurationSec === "number" ? initialRules.dayVotingDurationSec : DEFAULT_ROOM_GAME_RULES.dayVotingDurationSec,
    };
    setDraftRules(merged);
    setBaseRules(merged);
  }, [initialRules, open, baseSelectableNightActionRoles, isDietQuy, isSoiMu]);

  const includedElementalSummary = useMemo(() => {
    const included = ELEMENTAL_ROLE_ORDER.filter((role) => includedElementalRoles.includes(role));
    if (!included.length) return "Chưa chọn vai trò nguyên tố nào";
    return `Bao gồm: ${included.join(", ")}`;
  }, [includedElementalRoles]);

  const hasChanges = useMemo(() => {
    if (!baseRules) return false;
    const keys = Object.keys(draftRules) as (keyof RoomGameRules)[];
    for (const key of keys) {
      if (key === "nightActionOrder") {
        const order1 = draftRules.nightActionOrder || [];
        const order2 = baseRules.nightActionOrder || [];
        if (order1.length !== order2.length) return true;
        for (let i = 0; i < order1.length; i++) {
          if (order1[i] !== order2[i]) return true;
        }
        continue;
      }
      if (draftRules[key] !== baseRules[key]) {
        return true;
      }
    }
    return false;
  }, [draftRules, baseRules]);

  if (!open) return null;

  const updateRule = <K extends keyof RoomGameRules>(key: K, value: RoomGameRules[K]) => {
    if (readOnly) return;
    setDraftRules((prev) => ({ ...prev, [key]: value } as RoomGameRules));
  };

  const updateNightActionDuration = (
    key: "nonWolfNightActionDurationSec" | "wolfNightActionDurationSec",
    value: number
  ) => {
    if (readOnly) return;
    setDraftRules((prev) => ({
      ...prev,
      [key]: value,
    } as RoomGameRules));
  };

  const handleNightActionDurationBlur = () => {
    if (readOnly) return;
    setDraftRules((prev) => {
      const normalizedDurations = normalizeNightActionDurations({
        allNightActionsSimultaneous: prev.allNightActionsSimultaneous,
        nonWolfNightActionDurationSec: prev.nonWolfNightActionDurationSec,
        wolfNightActionDurationSec: prev.wolfNightActionDurationSec,
      }, isDietQuy, isSoiMu);
      return { ...prev, ...normalizedDurations } as RoomGameRules;
    });
  };

  const reorderRoles = (fromRole: NightActionOrderRole, toRole: NightActionOrderRole) => {
    if (readOnly) return;
    if (fromRole === toRole) return;
    if (fromRole === "Thần tình yêu" || toRole === "Thần tình yêu") return;
    setDraftRules((prev) => {
      const nextOrder = [...prev.nightActionOrder];
      const fromIndex = nextOrder.indexOf(fromRole);
      const toIndex = nextOrder.indexOf(toRole);
      if (fromIndex < 0 || toIndex < 0) return prev;

      nextOrder.splice(fromIndex, 1);
      nextOrder.splice(toIndex, 0, fromRole);
      return { ...prev, nightActionOrder: nextOrder };
    });
  };

  const handleSave = () => {
    if (!onSave) return;
    if (isDietQuy) {
      onSave({
        ...draftRules,
        allNightActionsSimultaneous: false,
        witchSeeBiteOnlyIfHasHealPotion: false,
        witchBonusTimeRequiresUsablePotion: false,
        witchHideProtectedBiteInSimultaneous: false,
        witchHideProtectedBiteWhenSequential: false,
        trialInteractionSelectionLimit: 0,
        banSoiBecomeWolfEvenIfHealed: false,
        loveCanChoosePartnerFirstTwoNights: false,
        villageChiefKnowsWolfBite: false,
        witchSeeProtectorImmortalBite: false,
        hunterShotPublicInDay: false,
        merchantSingleUseItems: false,
        merchantHideReceivedItemName: false,
        wolfNightActionDurationSec: draftRules.nonWolfNightActionDurationSec,
        forceWolfBiteFirstNight: draftRules.twoHeartsFirstTwoNights && draftRules.forceWolfBiteFirstNight,
        wolfCanBiteWolf: false,
      });
      return;
    }
    if (isSoiMu) {
      onSave({
        ...draftRules,
        allNightActionsSimultaneous: true,
        witchSeeBiteOnlyIfHasHealPotion: false,
        witchBonusTimeRequiresUsablePotion: false,
        witchHideProtectedBiteInSimultaneous: false,
        witchHideProtectedBiteWhenSequential: false,
        trialInteractionSelectionLimit: 0,
        banSoiBecomeWolfEvenIfHealed: false,
        loveCanChoosePartnerFirstTwoNights: false,
        witchSeeProtectorImmortalBite: false,
        hunterShotPublicInDay: false,
        merchantSingleUseItems: false,
        merchantHideReceivedItemName: false,
        wolfNightActionDurationSec: draftRules.nonWolfNightActionDurationSec,
        forceWolfBiteFirstNight: draftRules.twoHeartsFirstTwoNights && draftRules.forceWolfBiteFirstNight,
        wolfCanBiteWolf: false,
      });
      return;
    }
    const normalizedDurations = normalizeNightActionDurations({
      allNightActionsSimultaneous: draftRules.allNightActionsSimultaneous,
      nonWolfNightActionDurationSec: draftRules.nonWolfNightActionDurationSec,
      wolfNightActionDurationSec: draftRules.wolfNightActionDurationSec,
    });
    onSave({
      ...draftRules,
      nightActionOrder: normalizeNightActionOrder(draftRules.nightActionOrder, selectableNightActionRoles),
      trialInteractionSelectionLimit: clampSelectionLimit(draftRules.trialInteractionSelectionLimit),
      merchantWinRequiredSuccessfulTrades: clampMerchantWinRequiredSuccessfulTrades(
        draftRules.merchantWinRequiredSuccessfulTrades
      ),
      nonWolfNightActionDurationSec: normalizedDurations.nonWolfNightActionDurationSec,
      wolfNightActionDurationSec: normalizedDurations.wolfNightActionDurationSec,
      forceWolfBiteFirstNight: draftRules.twoHeartsFirstTwoNights && draftRules.forceWolfBiteFirstNight,
    });
  };

  const thirdRuleLabel = draftRules.allNightActionsSimultaneous
    ? "Phù thủy sẽ thấy vết cắn biến mất nếu người đó được Bảo vệ bảo vệ trúng"
    : "Phù thủy sẽ không thấy vết cắn nếu Bảo vệ đã bảo vệ trúng";

  const thirdRuleDescription = draftRules.allNightActionsSimultaneous
    ? "Dùng cho chế độ xử lý đồng thời: khi Bảo vệ bảo vệ trúng, dấu hiệu vết cắn đang hiển thị cho Phù thủy sẽ biến mất."
    : "Dùng cho chế độ xử lý tuần tự: nếu Bảo vệ đã bảo vệ trúng thì Phù thủy sẽ không thấy vết cắn. Mặc định bật và chỉ chỉnh được khi Luật 1 đang tắt.";

  const thirdRuleChecked = draftRules.allNightActionsSimultaneous
    ? draftRules.witchHideProtectedBiteInSimultaneous
    : draftRules.witchHideProtectedBiteWhenSequential;

  const renderTwoHeartsFirstTwoNights = () => {
    const desc = isDietQuy
      ? "Đêm 1 bị quỷ đâm sẽ mất 1 máu. Đêm 2 bị quỷ đâm sẽ mất 2 máu và chết ngay cả khi đã mất 1 máu ở đêm 1."
      : "Đêm 1 bị sói cắn sẽ mất 1 máu. Đêm 2 bị sói cắn sẽ mất 2 máu và chết ngay cả khi đã mất 1 máu ở đêm 1.";

    return (
      <label style={rowStyle()}>
        <div>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Tất cả nhân vật sẽ có 2 máu trong 2 đêm đầu</div>
          <div style={{ fontSize: 13, color: "rgba(246,247,251,0.68)", lineHeight: 1.5 }}>
            {desc}
          </div>
        </div>
        <input
          type="checkbox"
          checked={draftRules.twoHeartsFirstTwoNights}
          disabled={readOnly}
          onChange={(e) => {
            const checked = e.target.checked;
            if (readOnly) return;
            setDraftRules((prev) => ({
              ...prev,
              twoHeartsFirstTwoNights: checked,
              forceWolfBiteFirstNight: checked ? prev.forceWolfBiteFirstNight : false,
            }));
          }}
          style={{ width: 20, height: 20, marginTop: 2 }}
        />
      </label>
    );
  };

  const renderForceWolfBiteFirstNight = () => {
    if (!draftRules.twoHeartsFirstTwoNights) return null;

    const label = isDietQuy ? "Bắt buộc quỷ phải đâm trong đêm đầu" : "Bắt buộc phe sói cắn trong đêm đầu";
    const desc = isDietQuy
      ? "Nếu Quỷ không chọn ai, hệ thống sẽ chọn ngẫu nhiên một mục tiêu hợp lệ."
      : "Nếu Sói không chọn ai, hệ thống sẽ chọn ngẫu nhiên một mục tiêu hợp lệ. Nếu hòa phiếu, hệ thống chọn ngẫu nhiên trong các mục tiêu đang hòa.";

    return (
      <label style={rowStyle()}>
        <div>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>{label}</div>
          <div style={{ fontSize: 13, color: "rgba(246,247,251,0.68)", lineHeight: 1.5 }}>
            {desc}
          </div>
        </div>
        <input
          type="checkbox"
          checked={draftRules.forceWolfBiteFirstNight}
          disabled={readOnly}
          onChange={(e) => updateRule("forceWolfBiteFirstNight", e.target.checked)}
          style={{ width: 20, height: 20, marginTop: 2 }}
        />
      </label>
    );
  };

  const renderDayPhaseDurations = () => {
    return (
      <>
        <label style={rowStyle()}>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Thời gian thảo luận ban ngày</div>
            <div style={{ fontSize: 13, color: "rgba(246,247,251,0.68)", lineHeight: 1.5 }}>
              Thời gian thảo luận tự do vào ban ngày trước khi bắt đầu biểu quyết (giây).
            </div>
          </div>
          <RuleNumericInput
            min={0}
            max={600}
            step={10}
            value={draftRules.dayDiscussionDurationSec ?? DEFAULT_ROOM_GAME_RULES.dayDiscussionDurationSec}
            disabled={readOnly}
            onChange={(val) => updateRule("dayDiscussionDurationSec", val)}
          />
        </label>

        <label style={rowStyle()}>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Thời gian tương tác khi lên giàn</div>
            <div style={{ fontSize: 13, color: "rgba(246,247,251,0.68)", lineHeight: 1.5 }}>
              Thời gian biện hộ và tương tác của người bị biểu quyết lên giàn (giây).
            </div>
          </div>
          <RuleNumericInput
            min={10}
            max={300}
            step={10}
            value={draftRules.trialDefenseDurationSec ?? DEFAULT_ROOM_GAME_RULES.trialDefenseDurationSec}
            disabled={readOnly}
            onChange={(val) => updateRule("trialDefenseDurationSec", val)}
          />
        </label>

        <label style={rowStyle()}>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Thời gian vote sống chết</div>
            <div style={{ fontSize: 13, color: "rgba(246,247,251,0.68)", lineHeight: 1.5 }}>
              Thời gian để cả làng bỏ phiếu biểu quyết sống hoặc chết (giây).
            </div>
          </div>
          <RuleNumericInput
            min={10}
            max={120}
            step={5}
            value={draftRules.trialVerdictDurationSec ?? DEFAULT_ROOM_GAME_RULES.trialVerdictDurationSec}
            disabled={readOnly}
            onChange={(val) => updateRule("trialVerdictDurationSec", val)}
          />
        </label>

        <label style={rowStyle()}>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Thời gian bỏ phiếu biểu quyết ban ngày</div>
            <div style={{ fontSize: 13, color: "rgba(246,247,251,0.68)", lineHeight: 1.5 }}>
              Thời gian để cả làng bỏ phiếu biểu quyết treo cổ ai đó lên giàn (giây).
            </div>
          </div>
          <RuleNumericInput
            min={10}
            max={300}
            step={10}
            value={draftRules.dayVotingDurationSec ?? DEFAULT_ROOM_GAME_RULES.dayVotingDurationSec}
            disabled={readOnly}
            onChange={(val) => updateRule("dayVotingDurationSec", val)}
          />
        </label>
      </>
    );
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "rgba(4,8,18,0.72)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "min(900px, 100%)",
          maxHeight: "min(92vh, 920px)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          borderRadius: 24,
          border: "1px solid rgba(255,255,255,0.14)",
          background: "linear-gradient(180deg, rgba(15,20,36,0.4), rgba(8,12,24,0.6))",
          boxShadow: "0 24px 80px rgba(0,0,0,0.45)",
          color: "#f6f7fb",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div id="PhầnNeo" style={{ padding: 24, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 13, letterSpacing: 0.12, textTransform: "uppercase", opacity: 0.7 }}>
                Luật chơi của phòng
              </div>
              <h2 style={{ margin: "8px 0 0", fontSize: 28 }}>{title}</h2>
            </div>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <button 
                onClick={onClose} 
                style={{ 
                  padding: "10px 16px", 
                  cursor: "pointer",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.15)",
                  background: "rgba(255,255,255,0.08)",
                  color: "#fff",
                  fontWeight: 600,
                  fontSize: 14,
                  width: 72,
                  textAlign: "center"
                }}
              >
                {hasChanges ? "Huỷ" : "Đóng"}
              </button>
              {!readOnly && (
                <button
                  onClick={handleSave}
                  style={{
                    padding: "10px 16px",
                    cursor: "pointer",
                    background: "linear-gradient(135deg, #f6c85f, #ff8f42)",
                    color: "#111",
                    border: "none",
                    borderRadius: 10,
                    fontWeight: 800,
                    fontSize: 14
                  }}
                >
                  {saveText}
                </button>
              )}
            </div>
          </div>
        </div>

        <div id="PhầnCuộn" style={{ padding: 24, display: "grid", gap: 14, flex: 1, overflowY: "auto" }}>
          {isDietQuy ? (
            <>
              {renderTwoHeartsFirstTwoNights()}
              {renderForceWolfBiteFirstNight()}
              {renderDayPhaseDurations()}

              <label style={rowStyle()}>
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>Thời gian hành động trong đêm</div>
                  <div style={{ fontSize: 13, color: "rgba(246,247,251,0.68)", lineHeight: 1.5 }}>
                    Thời gian giới hạn cho mỗi lượt hành động ban đêm (giây).
                  </div>
                </div>
                <RuleNumericInput
                  min={0}
                  max={60}
                  step={10}
                  value={draftRules.nonWolfNightActionDurationSec}
                  disabled={readOnly}
                  onChange={(val) => {
                    setDraftRules(prev => ({
                      ...prev,
                      nonWolfNightActionDurationSec: val,
                      wolfNightActionDurationSec: val
                    }));
                  }}
                  style={{ width: 96 }}
                />
              </label>
            </>
          ) : isSoiMu ? (
            <>
              {renderTwoHeartsFirstTwoNights()}
              {renderForceWolfBiteFirstNight()}
              {renderDayPhaseDurations()}

              <label style={rowStyle()}>
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>Trưởng làng biết mình đã bị sói cắn</div>
                  <div style={{ fontSize: 13, color: "rgba(246,247,251,0.68)", lineHeight: 1.5 }}>
                    Khi bật, Trưởng làng và quản trò sẽ thấy máu còn 1 tim trong đêm bị cắn, rồi tim rung vào đêm kế tiếp trước khi hiệu ứng cắn trễ kết toán.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={draftRules.villageChiefKnowsWolfBite}
                  disabled={readOnly}
                  onChange={(e) => updateRule("villageChiefKnowsWolfBite", e.target.checked)}
                  style={{ width: 20, height: 20, marginTop: 2 }}
                />
              </label>

              <label style={rowStyle()}>
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>Thời gian hành động trong đêm</div>
                  <div style={{ fontSize: 13, color: "rgba(246,247,251,0.68)", lineHeight: 1.5 }}>
                    Thời gian giới hạn cho lượt hành động ban đêm (giây) của tất cả mọi người chơi.
                  </div>
                </div>
                <RuleNumericInput
                  min={0}
                  max={60}
                  step={10}
                  value={draftRules.nonWolfNightActionDurationSec}
                  disabled={readOnly}
                  onChange={(val) => {
                    setDraftRules(prev => ({
                      ...prev,
                      nonWolfNightActionDurationSec: val,
                      wolfNightActionDurationSec: val
                    }));
                  }}
                  style={{ width: 96 }}
                />
              </label>
            </>
          ) : (
            <>
              {renderTwoHeartsFirstTwoNights()}
              {renderForceWolfBiteFirstNight()}
              {renderDayPhaseDurations()}

              <label style={rowStyle()}>
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>Tất cả người chơi có thể thực hiện chức năng cùng lúc trong đêm</div>
                </div>
                <input
                  type="checkbox"
                  checked={draftRules.allNightActionsSimultaneous}
                  disabled={readOnly}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    if (readOnly) return;
                    setDraftRules((prev) => {
                      const normalizedDurations = normalizeNightActionDurations({
                        allNightActionsSimultaneous: checked,
                        nonWolfNightActionDurationSec: prev.nonWolfNightActionDurationSec,
                        wolfNightActionDurationSec: prev.wolfNightActionDurationSec,
                      });
                      return {
                        ...prev,
                        allNightActionsSimultaneous: checked,
                        ...normalizedDurations,
                      } as RoomGameRules;
                    });
                  }}
                  style={{ width: 20, height: 20, marginTop: 2 }}
                />
              </label>

              <label style={rowStyle()}>
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>Thần tình yêu được ghép đôi trong 2 đêm đầu nếu chưa chọn</div>
                  <div style={{ fontSize: 13, color: "rgba(246,247,251,0.68)", lineHeight: 1.5 }}>
                    Khi bật, nếu đêm 1 Thần tình yêu chưa ghép đôi thì sang đêm 2 vẫn có lượt chọn. Nếu đã chọn rồi thì các đêm sau không mở lại lượt này.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={draftRules.loveCanChoosePartnerFirstTwoNights === true}
                  disabled={readOnly}
                  onChange={(e) => updateRule("loveCanChoosePartnerFirstTwoNights", e.target.checked)}
                  style={{ width: 20, height: 20, marginTop: 2 }}
                />
              </label>

              <label style={rowStyle()}>
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>Cặp đôi bỏ trốn được miễn nhiễm mọi hành động gây hại trong chế độ xử lý đồng thời</div>
                  <div style={{ fontSize: 13, color: "rgba(246,247,251,0.68)", lineHeight: 1.5 }}>
                    Mặc định bật. Khi bật, trong đêm nếu cặp đôi quyết định ra khỏi làng thì dù hành động ra khỏi làng xảy ra trước hay sau hành động của những vai trò nhắm vào thì vẫn miễn nhiễm hết (không quan trọng thứ tự thời gian bấm). Chỉ khi Tiên tri hoặc Kẻ bị nguyền soi trước khi cặp đôi rời làng thì kết quả soi mới hiển thị bình thường.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={draftRules.loveEscapeImmuneSimultaneous === true}
                  disabled={readOnly}
                  onChange={(e) => updateRule("loveEscapeImmuneSimultaneous", e.target.checked)}
                  style={{ width: 20, height: 20, marginTop: 2 }}
                />
              </label>

              <label style={rowStyle()}>
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>Bán sói / Sói Dại vẫn chuyển phe mục tiêu dù vết cắn được cứu</div>
                  <div style={{ fontSize: 13, color: "rgba(246,247,251,0.68)", lineHeight: 1.5 }}>
                    Mặc định tắt. Khi bật, nếu Bán sói bị cắn được cứu / được Bảo vệ trúng thì Bán sói vẫn chuyển phe; nếu mục tiêu Sói Dại biến đổi được cứu / được Bảo vệ trúng thì mục tiêu vẫn trở thành Sói thường.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={draftRules.banSoiBecomeWolfEvenIfHealed}
                  disabled={readOnly}
                  onChange={(e) => updateRule("banSoiBecomeWolfEvenIfHealed", e.target.checked)}
                  style={{ width: 20, height: 20, marginTop: 2 }}
                />
              </label>

              <label style={rowStyle()}>
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>Cho phép Sói cắn Sói khác</div>
                  <div style={{ fontSize: 13, color: "rgba(246,247,251,0.68)", lineHeight: 1.5 }}>
                    Khi bật, phe Sói có thể chọn cắn chính đồng bọn (Sói khác) của mình trong đêm.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={draftRules.wolfCanBiteWolf === true}
                  disabled={readOnly}
                  onChange={(e) => updateRule("wolfCanBiteWolf", e.target.checked)}
                  style={{ width: 20, height: 20, marginTop: 2 }}
                />
              </label>

              <label style={rowStyle()}>
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>Cơ chế cắn 2 mục tiêu thoáng hơn khi hòa</div>
                  <div style={{ fontSize: 13, color: "rgba(246,247,251,0.68)", lineHeight: 1.5 }}>
                    Mặc định bật. Khi bật, nếu phe Sói được cắn 2 mục tiêu (khi Sói con chết) và các Sói cắn không thống nhất được mục tiêu thứ 2 thì suất cắn thứ 2 bị hủy (hòa phiếu), thay vì hủy cả 2 suất cắn. Ví dụ: Sói 1 cắn A và B, Sói 2 cắn B thì cắn cả A và B. Sói 1 cắn A và B, Sói 2 cắn A và C thì cắn A (B và C hòa).
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={draftRules.wolfBonusBiteSmoothTied === true}
                  disabled={readOnly}
                  onChange={(e) => updateRule("wolfBonusBiteSmoothTied", e.target.checked)}
                  style={{ width: 20, height: 20, marginTop: 2 }}
                />
              </label>

              <label style={rowStyle()}>
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>Trưởng làng biết mình đã bị sói cắn</div>
                  <div style={{ fontSize: 13, color: "rgba(246,247,251,0.68)", lineHeight: 1.5 }}>
                    Khi bật, Trưởng làng và quản trò sẽ thấy máu còn 1 tim trong đêm bị cắn, rồi tim rung vào đêm kế tiếp trước khi hiệu ứng cắn trễ kết toán.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={draftRules.villageChiefKnowsWolfBite}
                  disabled={readOnly}
                  onChange={(e) => updateRule("villageChiefKnowsWolfBite", e.target.checked)}
                  style={{ width: 20, height: 20, marginTop: 2 }}
                />
              </label>

              <label style={rowStyle()}>
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>Mọi người biết Thợ săn bắn ai ban ngày</div>
                  <div style={{ fontSize: 13, color: "rgba(246,247,251,0.68)", lineHeight: 1.5 }}>
                    Khi bật, hiệu ứng đạn bắn sẽ hiển thị cho tất cả người chơi khi Thợ săn bắn trong ban ngày. Khi tắt sẽ không có animation đạn bắn.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={draftRules.hunterShotPublicInDay}
                  disabled={readOnly}
                  onChange={(e) => updateRule("hunterShotPublicInDay", e.target.checked)}
                  style={{ width: 20, height: 20, marginTop: 2 }}
                />
              </label>

              <label style={rowStyle()}>
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>Phù thủy vẫn thấy vết cắn vào người đang được Hộ nhân cho bất tử</div>
                  <div style={{ fontSize: 13, color: "rgba(246,247,251,0.68)", lineHeight: 1.5 }}>
                    Khi tắt, nếu mục tiêu đang có bất tử của Hộ nhân thì vết cắn sẽ bị ẩn khỏi Phù thủy.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={draftRules.witchSeeProtectorImmortalBite}
                  disabled={readOnly}
                  onChange={(e) => updateRule("witchSeeProtectorImmortalBite", e.target.checked)}
                  style={{ width: 20, height: 20, marginTop: 2 }}
                />
              </label>

              <label style={rowStyle()}>
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>Bảo vệ thấy log cứu thành công</div>
                  <div style={{ fontSize: 13, color: "rgba(246,247,251,0.68)", lineHeight: 1.5 }}>
                    Khi bật, người chơi có vai trò Bảo vệ sẽ thấy được dòng log thông báo khi đã cứu thành công mục tiêu khỏi vết cắn của Sói.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={draftRules.guardianCanSeeSavedLog === true}
                  disabled={readOnly}
                  onChange={(e) => updateRule("guardianCanSeeSavedLog", e.target.checked)}
                  style={{ width: 20, height: 20, marginTop: 2 }}
                />
              </label>

              <label style={rowStyle()}>
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>Trưởng làng tìm kiếm Hộ nhân</div>
                  <div style={{ fontSize: 13, color: "rgba(246,247,251,0.68)", lineHeight: 1.5 }}>
                    Khi bật, nếu có Hộ nhân trong danh sách role, Trưởng làng mỗi đêm có thể chọn một người để dò tìm Hộ nhân. Khi tìm thấy, Trưởng làng sẽ thấy badge vai trò của Hộ nhân và tự động đỡ vết cắn của Sói thay cho Hộ nhân.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={draftRules.villageChiefCanFindProtector === true}
                  disabled={readOnly}
                  onChange={(e) => updateRule("villageChiefCanFindProtector", e.target.checked)}
                  style={{ width: 20, height: 20, marginTop: 2 }}
                />
              </label>

              {!draftRules.allNightActionsSimultaneous && (
                <div style={{ ...rowStyle(), flexDirection: "column" }}>
                  <div style={{ width: "100%" }}>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>Thứ tự hành động ban đêm</div>
                    <div style={{ fontSize: 13, color: "rgba(246,247,251,0.68)", lineHeight: 1.5, marginBottom: 12 }}>
                      Riêng Dân làng nguyên tố sẽ được kéo thả bằng 1 mục đại diện. Thần tình yêu luôn đứng đầu nếu có, còn Thần tình yêu/Tay Buôn không làm thay đổi cách tính buff nhanh/chậm.
                    </div>
                  </div>

                  <div style={{ display: "grid", gap: 10, width: "100%" }}>
                    {normalizeNightActionOrder(draftRules.nightActionOrder, selectableNightActionRoles).map((role, index) => {
                      const pinned = role === "Thần tình yêu";
                      return (
                        <div
                          key={role}
                          draggable={!readOnly && !pinned}
                          onDragStart={() => {
                            if (readOnly || pinned) return;
                            setDraggedRole(role);
                            setDragOverRole(role);
                          }}
                          onDragOver={(e) => {
                            if (readOnly || pinned) return;
                            e.preventDefault();
                            if (dragOverRole !== role) setDragOverRole(role);
                          }}
                          onDrop={(e) => {
                            if (readOnly || pinned) return;
                            e.preventDefault();
                            if (!draggedRole) return;
                            reorderRoles(draggedRole, role);
                            setDraggedRole(null);
                            setDragOverRole(null);
                          }}
                          onDragEnd={() => {
                            setDraggedRole(null);
                            setDragOverRole(null);
                          }}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 12,
                            padding: "12px 14px",
                            borderRadius: 12,
                            background: draggedRole === role ? "rgba(246,200,95,0.16)" : "rgba(255,255,255,0.05)",
                            border: dragOverRole === role ? "1px solid rgba(246,200,95,0.9)" : "1px solid rgba(255,255,255,0.08)",
                            cursor: readOnly || pinned ? "default" : "grab",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <div
                              style={{
                                width: 32,
                                height: 32,
                                borderRadius: 999,
                                display: "grid",
                                placeItems: "center",
                                background: "rgba(255,255,255,0.1)",
                                fontWeight: 800,
                              }}
                            >
                              {index + 1}
                            </div>
                            <div>
                              <div style={{ fontWeight: 700 }}>{NIGHT_ACTION_ROLE_LABELS[role]}</div>
                              <div style={{ fontSize: 12, color: "rgba(246,247,251,0.62)" }}>
                                {role === ELEMENTAL_GROUP_ROLE ? includedElementalSummary : role}
                              </div>
                            </div>
                          </div>

                          {!readOnly && !pinned && <div style={{ fontSize: 18, opacity: 0.6, userSelect: "none" }}>⋮⋮</div>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <label style={rowStyle()}>
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>Mỗi món đồ của Tay Buôn chỉ giao dịch thành công một lần</div>
                  <div style={{ fontSize: 13, color: "rgba(246,247,251,0.68)", lineHeight: 1.5 }}>
                    Khi bật, món đồ đã giao dịch thành công sẽ biến khỏi kho hàng cho những đêm sau.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={draftRules.merchantSingleUseItems}
                  disabled={readOnly}
                  onChange={(e) => updateRule("merchantSingleUseItems", e.target.checked)}
                  style={{ width: 20, height: 20, marginTop: 2 }}
                />
              </label>

              <label style={rowStyle()}>
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>Không tiết lộ tên vật phẩm người nhận được từ Tay Buôn</div>
                  <div style={{ fontSize: 13, color: "rgba(246,247,251,0.68)", lineHeight: 1.5 }}>
                    Khi bật, người chơi được Tay Buôn chọn sẽ không biết mình nhận được vật phẩm gì (ẩn mục "Đồ đang giữ" ở giao diện của họ và ẩn log nhận đồ).
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={draftRules.merchantHideReceivedItemName === true}
                  disabled={readOnly}
                  onChange={(e) => updateRule("merchantHideReceivedItemName", e.target.checked)}
                  style={{ width: 20, height: 20, marginTop: 2 }}
                />
              </label>

              <label style={rowStyle()}>
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>Số giao dịch thành công để Tay Buôn thắng</div>
                  <div style={{ fontSize: 13, color: "rgba(246,247,251,0.68)", lineHeight: 1.5 }}>
                    Khi Tay Buôn đạt đủ số giao dịch này, nhật ký sẽ ghi nhận Tay Buôn thắng nhưng ván chơi vẫn tiếp tục.
                  </div>
                </div>
                <RuleNumericInput
                  min={1}
                  max={10}
                  step={1}
                  value={draftRules.merchantWinRequiredSuccessfulTrades}
                  disabled={readOnly}
                  onChange={(val) => updateRule("merchantWinRequiredSuccessfulTrades", val)}
                  style={{ width: 76 }}
                />
              </label>

              <label style={rowStyle()}>
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>Phù thủy chỉ có thể thấy được vết cắn nếu còn bình cứu</div>
                </div>
                <input
                  type="checkbox"
                  checked={draftRules.witchSeeBiteOnlyIfHasHealPotion}
                  disabled={readOnly}
                  onChange={(e) => updateRule("witchSeeBiteOnlyIfHasHealPotion", e.target.checked)}
                  style={{ width: 20, height: 20, marginTop: 2 }}
                />
              </label>

              <label style={rowStyle()}>
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>Phù thủy chỉ được cộng thêm 10 giây khi còn ít nhất 1 bình có thể dùng</div>
                  <div style={{ fontSize: 13, color: "rgba(246,247,251,0.68)", lineHeight: 1.5 }}>
                    Khi bật, nếu Phù thủy đã dùng cả bình cứu và bình giết thì sẽ không tự động được cộng thêm thời gian.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={draftRules.witchBonusTimeRequiresUsablePotion}
                  disabled={readOnly}
                  onChange={(e) => updateRule("witchBonusTimeRequiresUsablePotion", e.target.checked)}
                  style={{ width: 20, height: 20, marginTop: 2 }}
                />
              </label>

              <label style={rowStyle()}>
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>{thirdRuleLabel}</div>
                  <div style={{ fontSize: 13, color: "rgba(246,247,251,0.68)", lineHeight: 1.5 }}>
                    {thirdRuleDescription}
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={thirdRuleChecked}
                  disabled={readOnly}
                  onChange={(e) => {
                    if (draftRules.allNightActionsSimultaneous) {
                      updateRule("witchHideProtectedBiteInSimultaneous", e.target.checked);
                      return;
                    }
                    updateRule("witchHideProtectedBiteWhenSequential", e.target.checked);
                  }}
                  style={{ width: 20, height: 20, marginTop: 2 }}
                />
              </label>

              <label style={rowStyle()}>
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>Thời gian hành động trong đêm của phe dân</div>
                </div>
                <RuleNumericInput
                  min={draftRules.allNightActionsSimultaneous ? 0 : 10}
                  max={60}
                  step={10}
                  value={draftRules.nonWolfNightActionDurationSec}
                  disabled={readOnly}
                  onChange={(val) => updateNightActionDuration("nonWolfNightActionDurationSec", val)}
                  onBlur={handleNightActionDurationBlur}
                  style={{ width: 96 }}
                />
              </label>

              <label style={rowStyle()}>
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>Thời gian hành động trong đêm của phe sói</div>
                </div>
                <RuleNumericInput
                  min={0}
                  max={60}
                  step={10}
                  value={draftRules.wolfNightActionDurationSec}
                  disabled={readOnly}
                  onChange={(val) => updateNightActionDuration("wolfNightActionDurationSec", val)}
                  onBlur={handleNightActionDurationBlur}
                  style={{ width: 96 }}
                />
              </label>

              <label style={rowStyle()}>
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>Số lượt tương tác của người bị lên giàn</div>
                </div>
                <RuleNumericInput
                  min={0}
                  max={10}
                  value={draftRules.trialInteractionSelectionLimit}
                  disabled={readOnly}
                  onChange={(val) => updateRule("trialInteractionSelectionLimit", val)}
                  style={{ width: 96 }}
                />
              </label>

              <label style={rowStyle()}>
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>Phát Linh Chi và Đông Trùng như thẻ phụ</div>
                  <div style={{ fontSize: 13, color: "rgba(246,247,251,0.68)", lineHeight: 1.5 }}>
                    Khi bật, hai thẻ được phát kèm cho hai người có vai trò chính thuộc phe dân và không chiếm suất vai trò chính.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={draftRules.coffeeHerbCardMode === "secondary"}
                  disabled={readOnly}
                  onChange={(e) => updateRule("coffeeHerbCardMode", e.target.checked ? "secondary" : "primary")}
                  style={{ width: 20, height: 20, marginTop: 2 }}
                />
              </label>

              <label style={rowStyle()}>
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>Số lượt tìm kiếm của Người pha cà phê</div>
                  <div style={{ fontSize: 13, color: "rgba(246,247,251,0.68)", lineHeight: 1.5 }}>
                    Giới hạn lượt cơ bản cho cả ván (0 để không giới hạn). Linh Chi hoặc Đông Trùng tìm đúng sẽ cộng thêm một lượt.
                  </div>
                </div>
                <RuleNumericInput
                  min={0}
                  max={20}
                  value={draftRules.coffeeMakerMaxUses ?? 3}
                  disabled={readOnly}
                  onChange={(val) => updateRule("coffeeMakerMaxUses", val)}
                  style={{ width: 96 }}
                />
              </label>

              <label style={rowStyle()}>
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>Số lần Song Trùng có thể chọn mục tiêu</div>
                  <div style={{ fontSize: 13, color: "rgba(246,247,251,0.68)", lineHeight: 1.5 }}>
                    Số lần tối đa Song Trùng có thể thực hiện chức năng chọn partner Cupid (0 để không giới hạn).
                  </div>
                </div>
                <RuleNumericInput
                  min={0}
                  max={20}
                  value={draftRules.songTrungMaxUses ?? 0}
                  disabled={readOnly}
                  onChange={(val) => updateRule("songTrungMaxUses", val)}
                  style={{ width: 96 }}
                />
              </label>

              <label style={rowStyle()}>
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>Người bị cướp vai trò vẫn sống (chỉ bị vô hiệu chức năng)</div>
                  <div style={{ fontSize: 13, color: "rgba(246,247,251,0.68)", lineHeight: 1.5 }}>
                    Khi bật, mục tiêu bị Song Trùng cướp vai trò sẽ không chết vào sáng hôm sau mà vẫn sống nhưng không thể dùng chức năng vai trò của mình. Ban đêm họ có thể đoán ai là Song Trùng.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={draftRules.songTrungVictimStaysAlive === true}
                  disabled={readOnly}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setDraftRules((prev) => {
                      const next = { ...prev, songTrungVictimStaysAlive: checked };
                      if (!checked) {
                        next.songTrungReturnRoleOnlyIfVotedOut = false;
                        next.songTrungReturnRoleRequiresCupidVote = false;
                      }
                      return next as RoomGameRules;
                    });
                  }}
                  style={{ width: 20, height: 20, marginTop: 2 }}
                />
              </label>

              <label style={{ ...rowStyle(), opacity: draftRules.songTrungVictimStaysAlive !== true ? 0.4 : 1 }}>
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>Chỉ lấy lại chức năng khi Song Trùng bị treo cổ ban ngày</div>
                  <div style={{ fontSize: 13, color: "rgba(246,247,251,0.68)", lineHeight: 1.5 }}>
                    Yêu cầu bật luật "Người bị cướp vai trò vẫn sống". Chỉ khi Song Trùng bị biểu quyết treo cổ ban ngày mới tính là giải cứu hợp lệ.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={draftRules.songTrungReturnRoleOnlyIfVotedOut === true}
                  disabled={readOnly || draftRules.songTrungVictimStaysAlive !== true}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setDraftRules((prev) => {
                      const next = { ...prev, songTrungReturnRoleOnlyIfVotedOut: checked };
                      if (!checked) {
                        next.songTrungReturnRoleRequiresCupidVote = false;
                      }
                      return next as RoomGameRules;
                    });
                  }}
                  style={{ width: 20, height: 20, marginTop: 2 }}
                />
              </label>

              <label style={{ ...rowStyle(), opacity: (draftRules.songTrungVictimStaysAlive !== true || draftRules.songTrungReturnRoleOnlyIfVotedOut !== true) ? 0.4 : 1 }}>
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>Yêu cầu Thần tình yêu vote chết Song Trùng</div>
                  <div style={{ fontSize: 13, color: "rgba(246,247,251,0.68)", lineHeight: 1.5 }}>
                    Yêu cầu bật luật "Chỉ lấy lại chức năng khi bị treo cổ". Thần tình yêu bắt buộc phải tham gia biểu quyết treo cổ Song Trùng mới được tính giải cứu.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={draftRules.songTrungReturnRoleRequiresCupidVote === true}
                  disabled={readOnly || draftRules.songTrungVictimStaysAlive !== true || draftRules.songTrungReturnRoleOnlyIfVotedOut !== true}
                  onChange={(e) => updateRule("songTrungReturnRoleRequiresCupidVote", e.target.checked)}
                  style={{ width: 20, height: 20, marginTop: 2 }}
                />
              </label>
            </>
          )}
        </div>


      </div>
    </div>
  );
}
