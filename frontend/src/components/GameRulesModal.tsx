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
};

const NIGHT_ACTION_DURATION_STEP_SEC = 10;
const NIGHT_ACTION_DURATION_MIN_SEC = 0;
const NIGHT_ACTION_DURATION_MAX_SEC = 60;

function normalizeNightActionOrder(order: NightActionOrderRole[], availableRoles: NightActionOrderRole[]) {
  const availableSet = new Set(availableRoles);
  const seen = new Set<NightActionOrderRole>();
  const next: NightActionOrderRole[] = [];

  for (const role of order) {
    if (!availableSet.has(role)) continue;
    if (seen.has(role)) continue;
    seen.add(role);
    next.push(role);
  }

  for (const role of availableRoles) {
    if (seen.has(role)) continue;
    seen.add(role);
    next.push(role);
  }

  return next;
}

function clampSelectionLimit(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(10, Math.floor(value)));
}

function normalizeDurationSec(value: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  const rounded = Math.round(value / NIGHT_ACTION_DURATION_STEP_SEC) * NIGHT_ACTION_DURATION_STEP_SEC;
  return Math.max(NIGHT_ACTION_DURATION_MIN_SEC, Math.min(NIGHT_ACTION_DURATION_MAX_SEC, rounded));
}

function clampNonWolfNightActionDurationSec(value: number) {
  return normalizeDurationSec(value, DEFAULT_ROOM_GAME_RULES.nonWolfNightActionDurationSec);
}

function clampWolfNightActionDurationSec(value: number) {
  return normalizeDurationSec(value, DEFAULT_ROOM_GAME_RULES.wolfNightActionDurationSec);
}

function normalizeNightActionDurations(input: {
  nonWolfNightActionDurationSec: number;
  wolfNightActionDurationSec: number;
}) {
  const nonWolf = clampNonWolfNightActionDurationSec(input.nonWolfNightActionDurationSec);
  let wolf = clampWolfNightActionDurationSec(input.wolfNightActionDurationSec);
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
  } as const;
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
}) {
  const [draftRules, setDraftRules] = useState<RoomGameRules>(initialRules);
  const [draggedRole, setDraggedRole] = useState<NightActionOrderRole | null>(null);
  const [dragOverRole, setDragOverRole] = useState<NightActionOrderRole | null>(null);
  const selectableNightActionRoles = availableNightActionRoles?.length
    ? availableNightActionRoles
    : DEFAULT_ROOM_GAME_RULES.nightActionOrder;

  useEffect(() => {
    if (!open) return;
    const normalizedDurations = normalizeNightActionDurations({
      nonWolfNightActionDurationSec: initialRules.nonWolfNightActionDurationSec,
      wolfNightActionDurationSec: initialRules.wolfNightActionDurationSec,
    });
    setDraftRules({
      ...DEFAULT_ROOM_GAME_RULES,
      ...initialRules,
      nightActionOrder: normalizeNightActionOrder(
        initialRules.nightActionOrder || DEFAULT_ROOM_GAME_RULES.nightActionOrder,
        selectableNightActionRoles
      ),
      trialInteractionSelectionLimit: clampSelectionLimit(initialRules.trialInteractionSelectionLimit),
      nonWolfNightActionDurationSec: normalizedDurations.nonWolfNightActionDurationSec,
      wolfNightActionDurationSec: normalizedDurations.wolfNightActionDurationSec,
    });
  }, [initialRules, open, selectableNightActionRoles]);

  const includedElementalSummary = useMemo(() => {
    const included = ELEMENTAL_ROLE_ORDER.filter((role) => includedElementalRoles.includes(role));
    if (!included.length) return "Chưa chọn vai trò nguyên tố nào";
    return `Bao gồm: ${included.join(", ")}`;
  }, [includedElementalRoles]);

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
    setDraftRules((prev) => {
      const normalizedDurations = normalizeNightActionDurations({
        nonWolfNightActionDurationSec:
          key === "nonWolfNightActionDurationSec" ? value : prev.nonWolfNightActionDurationSec,
        wolfNightActionDurationSec:
          key === "wolfNightActionDurationSec" ? value : prev.wolfNightActionDurationSec,
      });
      return { ...prev, ...normalizedDurations } as RoomGameRules;
    });
  };

  const reorderRoles = (fromRole: NightActionOrderRole, toRole: NightActionOrderRole) => {
    if (readOnly) return;
    if (fromRole === toRole) return;
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
    const normalizedDurations = normalizeNightActionDurations({
      nonWolfNightActionDurationSec: draftRules.nonWolfNightActionDurationSec,
      wolfNightActionDurationSec: draftRules.wolfNightActionDurationSec,
    });
    onSave({
      ...draftRules,
      nightActionOrder: normalizeNightActionOrder(draftRules.nightActionOrder, selectableNightActionRoles),
      trialInteractionSelectionLimit: clampSelectionLimit(draftRules.trialInteractionSelectionLimit),
      nonWolfNightActionDurationSec: normalizedDurations.nonWolfNightActionDurationSec,
      wolfNightActionDurationSec: normalizedDurations.wolfNightActionDurationSec,
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

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
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
          overflowY: "auto",
          borderRadius: 24,
          border: "1px solid rgba(255,255,255,0.14)",
          background: "linear-gradient(180deg, rgba(15,20,36,0.98), rgba(8,12,24,0.98))",
          boxShadow: "0 24px 80px rgba(0,0,0,0.45)",
          color: "#f6f7fb",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: 24, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 13, letterSpacing: 0.12, textTransform: "uppercase", opacity: 0.7 }}>
                Luật chơi của phòng
              </div>
              <h2 style={{ margin: "8px 0 0", fontSize: 28 }}>{title}</h2>
            </div>
            <button onClick={onClose} style={{ padding: "10px 14px", cursor: "pointer" }}>
              Đóng
            </button>
          </div>
        </div>

        <div style={{ padding: 24, display: "grid", gap: 14 }}>
          <label style={rowStyle()}>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Tất cả nhân vật sẽ có 2 máu trong 2 đêm đầu</div>
              <div style={{ fontSize: 13, color: "rgba(246,247,251,0.68)", lineHeight: 1.5 }}>
                Đêm 1 bị sói cắn sẽ mất 1 máu. Đêm 2 bị sói cắn sẽ mất 2 máu và chết ngay cả khi đã mất 1 máu ở đêm 1.
              </div>
            </div>
            <input
              type="checkbox"
              checked={draftRules.twoHeartsFirstTwoNights}
              disabled={readOnly}
              onChange={(e) => updateRule("twoHeartsFirstTwoNights", e.target.checked)}
              style={{ width: 20, height: 20, marginTop: 2 }}
            />
          </label>

          <label style={rowStyle()}>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Tất cả người chơi có thể thực hiện chức năng cùng lúc trong đêm</div>
            </div>
            <input
              type="checkbox"
              checked={draftRules.allNightActionsSimultaneous}
              disabled={readOnly}
              onChange={(e) => updateRule("allNightActionsSimultaneous", e.target.checked)}
              style={{ width: 20, height: 20, marginTop: 2 }}
            />
          </label>

          <label style={rowStyle()}>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Bán sói sẽ vẫn bị biến thành phe sói cho dù cứu được vết cắn</div>
              <div style={{ fontSize: 13, color: "rgba(246,247,251,0.68)", lineHeight: 1.5 }}>
                Mặc định tắt. Khi bật, nếu Bán sói bị cắn trong đêm và được cứu hoặc được Bảo vệ trúng, nó vẫn sẽ chuyển phe ở đêm kế tiếp.
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

          {!draftRules.allNightActionsSimultaneous && (
            <div style={{ ...rowStyle(), flexDirection: "column" }}>
              <div style={{ width: "100%" }}>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>Thứ tự hành động ban đêm</div>
                <div style={{ fontSize: 13, color: "rgba(246,247,251,0.68)", lineHeight: 1.5, marginBottom: 12 }}>
                  Riêng Dân làng nguyên tố sẽ được kéo thả bằng 1 mục đại diện, nhưng khi vào đêm hệ thống vẫn tách thành từng lượt theo thứ tự cố định.
                </div>
              </div>

              <div style={{ display: "grid", gap: 10, width: "100%" }}>
                {draftRules.nightActionOrder.map((role, index) => (
                  <div
                    key={role}
                    draggable={!readOnly}
                    onDragStart={() => {
                      if (readOnly) return;
                      setDraggedRole(role);
                      setDragOverRole(role);
                    }}
                    onDragOver={(e) => {
                      if (readOnly) return;
                      e.preventDefault();
                      if (dragOverRole !== role) setDragOverRole(role);
                    }}
                    onDrop={(e) => {
                      if (readOnly) return;
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
                      cursor: readOnly ? "default" : "grab",
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

                    {!readOnly && <div style={{ fontSize: 18, opacity: 0.6, userSelect: "none" }}>⋮⋮</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

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
            <input
              type="number"
              min={0}
              max={60}
              step={10}
              value={draftRules.nonWolfNightActionDurationSec}
              disabled={readOnly}
              onChange={(e) =>
                updateNightActionDuration("nonWolfNightActionDurationSec", Number(e.target.value))
              }
              style={{ width: 96, padding: "10px 12px" }}
            />
          </label>

          <label style={rowStyle()}>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Thời gian hành động trong đêm của phe sói</div>
            </div>
            <input
              type="number"
              min={0}
              max={60}
              step={10}
              value={draftRules.wolfNightActionDurationSec}
              disabled={readOnly}
              onChange={(e) =>
                updateNightActionDuration("wolfNightActionDurationSec", Number(e.target.value))
              }
              style={{ width: 96, padding: "10px 12px" }}
            />
          </label>

          <label style={rowStyle()}>
            <div>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Số lượt tương tác của người bị lên giàn</div>
            </div>
            <input
              type="number"
              min={0}
              max={10}
              value={draftRules.trialInteractionSelectionLimit}
              disabled={readOnly}
              onChange={(e) => updateRule("trialInteractionSelectionLimit", clampSelectionLimit(Number(e.target.value)))}
              style={{ width: 96, padding: "10px 12px" }}
            />
          </label>
        </div>

        <div style={{ padding: 24, borderTop: "1px solid rgba(255,255,255,0.08)", display: "flex", justifyContent: "flex-end", gap: 12 }}>
          <button onClick={onClose} style={{ padding: "11px 16px", cursor: "pointer" }}>
            {readOnly ? "Đóng" : "Huỷ"}
          </button>
          {!readOnly && (
          <button
            onClick={handleSave}
            style={{
              padding: "11px 16px",
              cursor: "pointer",
              background: "linear-gradient(135deg, #f6c85f, #ff8f42)",
              color: "#111",
              border: "none",
              fontWeight: 800,
            }}
          >
            {saveText}
          </button>
          )}
        </div>
      </div>
    </div>
  );
}
