"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const THEME_STORAGE_KEY = "aruskas_theme_v1";

interface ThemeContextValue {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setPreference: (pref: ThemePreference) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  preference: "light",
  resolvedTheme: "light",
  setPreference: () => {},
  toggleTheme: () => {},
});

function resolveThemeValue(pref: ThemePreference): ResolvedTheme {
  if (pref === "dark" || pref === "light") return pref;
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return "light";
}

function applyDocumentTheme(resolved: ResolvedTheme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (resolved === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute("content", resolved === "dark" ? "#0F1713" : "#F5E9D3");
  }

  try {
    window.ArusKasNative?.setDarkThemeStatusBar?.(resolved === "dark");
  } catch {
    // ignore outside native Android shell
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>("light");
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("light");

  useEffect(() => {
    let saved: ThemePreference = "light";
    try {
      const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (raw === "light" || raw === "dark" || raw === "system") {
        saved = raw;
      }
    } catch {
      // ignore storage unavailability
    }
    setPreferenceState(saved);
    const resolved = resolveThemeValue(saved);
    setResolvedTheme(resolved);
    applyDocumentTheme(resolved);
  }, []);

  useEffect(() => {
    const resolved = resolveThemeValue(preference);
    setResolvedTheme(resolved);
    applyDocumentTheme(resolved);

    if (
      preference !== "system" ||
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return;
    }
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = () => {
      const next = mq.matches ? "dark" : "light";
      setResolvedTheme(next);
      applyDocumentTheme(next);
    };
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", listener);
      return () => mq.removeEventListener("change", listener);
    }
    if (typeof mq.addListener === "function") {
      mq.addListener(listener);
      return () => mq.removeListener(listener);
    }
    return;
  }, [preference]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setPreference(resolvedTheme === "dark" ? "light" : "dark");
  }, [resolvedTheme, setPreference]);

  const value = useMemo(
    () => ({ preference, resolvedTheme, setPreference, toggleTheme }),
    [preference, resolvedTheme, setPreference, toggleTheme]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
