import { useEffect, useMemo, useState } from "react";

type Theme = "light" | "dark";

const STORAGE_KEY = "theme";

function getPreferredTheme(): Theme {
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function readStoredTheme(): Theme | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw === "dark" || raw === "light" ? raw : null;
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

export default function ThemeToggle() {
  const initialTheme = useMemo<Theme>(() => {
    if (typeof window === "undefined") return "light";
    return readStoredTheme() ?? getPreferredTheme();
  }, []);

  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  return (
    <div className="theme-toggle">
      <button
        type="button"
        onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
        aria-label="Toggle dark mode"
        title={theme === "dark" ? "Chuyển Light mode" : "Chuyển Dark mode"}
      >
        {theme === "dark" ? "Light" : "Dark"}
      </button>
    </div>
  );
}
