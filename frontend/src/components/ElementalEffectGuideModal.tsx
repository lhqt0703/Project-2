import type { CSSProperties } from "react";
import { ELEMENTAL_COMBINED_LIGHT_DARK_EFFECT, ELEMENTAL_EFFECT_GUIDE } from "../constants/elemental";

type EffectKey = "wolfBite" | "villagerMistake";

type ElementTheme = {
  id: string;
  icon: string;
  primary: string;
  secondary: string;
  glow: string;
  ink: string;
};

type ElementCardStyle = CSSProperties & {
  "--element-primary": string;
  "--element-secondary": string;
  "--element-glow": string;
  "--element-ink": string;
};

const ELEMENT_THEMES: ElementTheme[] = [
  { id: "01", icon: "≋", primary: "#45c7ff", secondary: "#175bd8", glow: "rgba(69,199,255,0.36)", ink: "#bdeeff" },
  { id: "02", icon: "▲", primary: "#ff5b4d", secondary: "#a82420", glow: "rgba(255,91,77,0.36)", ink: "#ffd0c7" },
  { id: "03", icon: "◌", primary: "#8df0c5", secondary: "#168f78", glow: "rgba(141,240,197,0.3)", ink: "#c9fff0" },
  { id: "04", icon: "✥", primary: "#79d879", secondary: "#2c8349", glow: "rgba(121,216,121,0.3)", ink: "#d4ffd5" },
  { id: "05", icon: "ϟ", primary: "#ffe066", secondary: "#ba7b11", glow: "rgba(255,224,102,0.34)", ink: "#fff1b0" },
  { id: "06", icon: "✦", primary: "#9ee8ff", secondary: "#3e8ed0", glow: "rgba(158,232,255,0.32)", ink: "#e0f8ff" },
  { id: "07", icon: "◆", primary: "#ff8b3d", secondary: "#b33c1e", glow: "rgba(255,139,61,0.34)", ink: "#ffd8bc" },
  { id: "08", icon: "🌣", primary: "#fff0a3", secondary: "#d5a032", glow: "rgba(255,240,163,0.3)", ink: "#fff7ce" },
  { id: "09", icon: "☾", primary: "#a88cff", secondary: "#4a2f9e", glow: "rgba(168,140,255,0.34)", ink: "#ddd2ff" },
  { id: "10", icon: "◇", primary: "#ff7bd8", secondary: "#6d3fe8", glow: "rgba(255,123,216,0.32)", ink: "#ffd3f1" },
];

const COMBO_THEME: ElementTheme = {
  id: "DUO",
  icon: "⬖",
  primary: "#ffe9a6",
  secondary: "#6f56ff",
  glow: "rgba(222,196,255,0.34)",
  ink: "#fff0cc",
};

const EFFECT_SECTIONS: Array<{ key: EffectKey; title: string; icon: string }> = [
  { key: "wolfBite", title: "Sói cắn", icon: "◈" },
  { key: "villagerMistake", title: "Dân giết nhầm", icon: "✧" },
];

function getCardStyle(theme: ElementTheme): ElementCardStyle {
  return {
    "--element-primary": theme.primary,
    "--element-secondary": theme.secondary,
    "--element-glow": theme.glow,
    "--element-ink": theme.ink,
  };
}

export default function ElementalEffectGuideModal({
  open,
  title = "Hiệu ứng bất lợi của nguyên tố",
  onClose,
}: {
  open: boolean;
  title?: string;
  onClose: () => void;
}) {
  if (!open) return null;

  const cards = [
    ...ELEMENTAL_EFFECT_GUIDE.map((effect, index) => ({
      role: effect.role,
      wolfBite: effect.wolfBite,
      villagerMistake: effect.villagerMistake,
      theme: ELEMENT_THEMES[index] || ELEMENT_THEMES[0],
    })),
    {
      role: "Ánh Sáng + Bóng Tối",
      wolfBite: ELEMENTAL_COMBINED_LIGHT_DARK_EFFECT.wolfBite,
      villagerMistake: ELEMENTAL_COMBINED_LIGHT_DARK_EFFECT.villagerMistake,
      theme: COMBO_THEME,
    },
  ];

  return (
    <div className="elemental-guide-backdrop" onClick={onClose}>
      <div className="elemental-guide-modal" onClick={(event) => event.stopPropagation()}>
        <div className="elemental-guide-header">
          <div>
            <div className="elemental-guide-kicker">Codex nguyên tố</div>
            <h2>{title}</h2>
          </div>
          <button className="elemental-guide-close" onClick={onClose}>
            Đóng
          </button>
        </div>

        <div className="elemental-guide-grid">
          {cards.map((card) => (
            <article className="elemental-effect-card" key={card.role} style={getCardStyle(card.theme)}>
              <div className="elemental-card-glow" />
              <header className="elemental-card-header">
                <div className="elemental-card-title-wrap">
                  <div className="elemental-card-icon">{card.theme.icon}</div>
                  <div>
                    <div className="elemental-card-name">{card.role}</div>
                    <div className="elemental-card-subtitle">Bất lợi nguyên tố</div>
                  </div>
                </div>
                <div className="elemental-card-id">#{card.theme.id}</div>
              </header>

              <div className="elemental-effect-sections">
                {EFFECT_SECTIONS.map((section) => (
                  <section className="elemental-effect-section" key={section.key}>
                    <div className="elemental-effect-icon">{section.icon}</div>
                    <div>
                      <h3>{section.title}</h3>
                      <p>{card[section.key]}</p>
                    </div>
                  </section>
                ))}
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
