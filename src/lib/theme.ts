export type ThemePreference = "system" | "light" | "dark";

// index.html repeats this key and the two colours in its pre-paint script; keep them in step.
export const THEME_KEY = "atelier:theme";
const THEME_COLOR = { light: "#ffffff", dark: "#212121" } as const;
const DARK_QUERY = "(prefers-color-scheme: dark)";

export function parseTheme(value: unknown): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}

export function resolveTheme(preference: ThemePreference, systemDark: boolean): "light" | "dark" {
  if (preference === "system") return systemDark ? "dark" : "light";
  return preference;
}

// Storage can be missing or blocked; the theme then simply follows the system for this visit.
export function loadTheme(): ThemePreference {
  try {
    return parseTheme(localStorage.getItem(THEME_KEY));
  } catch {
    return "system";
  }
}

export function saveTheme(preference: ThemePreference): void {
  try {
    if (preference === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, preference);
  } catch {
    // Ignore: the choice just won't survive a reload.
  }
}

export function systemPrefersDark(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(DARK_QUERY).matches;
}

/** Puts the choice on <html> (tokens.css reads data-theme) and tints the browser bar to match. */
export function applyTheme(preference: ThemePreference): void {
  const root = document.documentElement;
  if (preference === "system") delete root.dataset.theme;
  else root.dataset.theme = preference;
  const color = THEME_COLOR[resolveTheme(preference, systemPrefersDark())];
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", color);
}

/** Calls back when the system switches between light and dark. */
export function watchSystemTheme(onChange: () => void): () => void {
  if (typeof window.matchMedia !== "function") return () => undefined;
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
