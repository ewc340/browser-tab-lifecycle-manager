/**
 * Applies a data-theme attribute to the document root based on the user's
 * theme setting, honouring prefers-color-scheme for "system".
 */
import { useEffect } from "react";
import type { ThemePreference } from "../../shared/types.ts";

interface ThemeProviderProps {
  theme: ThemePreference;
  children: React.ReactNode;
}

export function ThemeProvider({ theme, children }: ThemeProviderProps) {
  useEffect(() => {
    const root = document.documentElement;

    if (theme === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const apply = (dark: boolean) => {
        root.setAttribute("data-theme", dark ? "dark" : "light");
      };
      apply(mq.matches);
      const handler = (e: MediaQueryListEvent) => apply(e.matches);
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }

    root.setAttribute("data-theme", theme);
    return undefined;
  }, [theme]);

  return <>{children}</>;
}
