"use client";

import { useEffect, useState } from "react";
import styles from "./ThemeToggle.module.css";

type Theme = "dark" | "light";

/**
 * Reads the persisted theme preference from localStorage, falling back to the
 * OS preference.  Safe to call during SSR (returns "dark" on the server).
 */
function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const stored = localStorage.getItem("theme") as Theme | null;
  if (stored === "dark" || stored === "light") return stored;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

/**
 * ThemeToggle — sun/moon button that:
 *  1. Reads the persisted preference from localStorage on mount (avoids FOIT
 *     in tandem with the inline script in layout.tsx).
 *  2. Writes the new preference to localStorage and updates the
 *     `data-theme` attribute on `<html>` on every toggle.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark"); // SSR-safe default

  // On first client render, resolve the real initial theme and apply it.
  useEffect(() => {
    const initial = getInitialTheme();
    setTheme(initial);
    document.documentElement.setAttribute("data-theme", initial);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={styles.toggle}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      aria-pressed={theme === "dark"}
    >
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
  );
}
