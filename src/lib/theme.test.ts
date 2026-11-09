import { afterEach, describe, expect, it } from "vitest";
import { applyTheme, loadTheme, parseTheme, resolveTheme, saveTheme, THEME_KEY } from "./theme";

afterEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe("theme preference", () => {
  it("treats anything but light or dark as following the system", () => {
    expect(parseTheme("dark")).toBe("dark");
    expect(parseTheme("light")).toBe("light");
    expect(parseTheme(null)).toBe("system");
    expect(parseTheme("sepia")).toBe("system");
  });

  it("resolves the system choice from the OS setting", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
  });

  it("stores an explicit choice and forgets it when going back to system", () => {
    saveTheme("dark");
    expect(localStorage.getItem(THEME_KEY)).toBe("dark");
    expect(loadTheme()).toBe("dark");
    saveTheme("system");
    expect(localStorage.getItem(THEME_KEY)).toBeNull();
    expect(loadTheme()).toBe("system");
  });

  it("marks <html> only for an explicit choice", () => {
    applyTheme("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    applyTheme("system");
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });
});
