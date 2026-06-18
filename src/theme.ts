import type { AppSettings } from "./types";

export type ThemeId = AppSettings["theme"];

export type ThemePalette = {
  label: string;
  colors: {
    core: string;
    edge: string;
    base: string;
    light: string;
  };
};

export const THEME_STORAGE = "yihuoge-theme";

export const themePalettes: Record<ThemeId, ThemePalette> = {
  "dark-fire": {
    label: "九玄金雷",
    colors: {
      core: "#FFD700",
      edge: "#FFF5A0",
      base: "#1A1000",
      light: "#FFFDE0",
    },
  },
  "qing-lian": {
    label: "青莲地心火",
    colors: {
      core: "#00B8A0",
      edge: "#B0F0E8",
      base: "#001A18",
      light: "#E8FFFB",
    },
  },
  "fallen-heart": {
    label: "陨落心炎",
    colors: {
      core: "#D44000",
      edge: "#FFAA44",
      base: "#100400",
      light: "#FFF2E6",
    },
  },
  "bone-cold": {
    label: "骨灵冷火",
    colors: {
      core: "#7ABEDD",
      edge: "#E8F6FF",
      base: "#0A2E44",
      light: "#F4FBFF",
    },
  },
  "sanqian-flame": {
    label: "三千焱炎火",
    colors: {
      core: "#9B30FF",
      edge: "#D4A0FF",
      base: "#0C0020",
      light: "#F7EFFF",
    },
  },
  "sea-heart": {
    label: "海心焰",
    colors: {
      core: "#1A6ECC",
      edge: "#88BBEE",
      base: "#000D1A",
      light: "#EEF7FF",
    },
  },
  "pure-lotus": {
    label: "净莲妖火",
    colors: {
      core: "#FF4488",
      edge: "#FFD0E8",
      base: "#1A0010",
      light: "#FFF0F7",
    },
  },
};

const legacyThemeMap: Record<string, ThemeId> = {
  "abyss-purple": "sanqian-flame",
  "ink-gold": "dark-fire",
};

export function normalizeTheme(theme?: string): ThemeId {
  if (theme && theme in themePalettes) return theme as ThemeId;
  return legacyThemeMap[theme ?? ""] ?? "dark-fire";
}

export function applyThemeVariables(palette: ThemePalette) {
  const root = document.documentElement;
  const { core, edge, base, light } = palette.colors;
  const variables: Record<string, string> = {
    "--theme-core": core,
    "--theme-edge": edge,
    "--theme-base": base,
    "--theme-light": light,
    "--ink": base,
    "--abyss": base,
    "--rock": base,
    "--gold": core,
    "--gold-2": edge,
    "--orange": light,
    "--red": base,
    "--teal": edge,
    "--purple": core,
    "--text": light,
    "--muted": `color-mix(in srgb, ${light} 62%, transparent)`,
  };
  Object.entries(variables).forEach(([name, value]) => root.style.setProperty(name, value));
}

export function applyTheme(theme: ThemeId) {
  const normalizedTheme = normalizeTheme(theme);
  const palette = themePalettes[normalizedTheme];
  applyThemeVariables(palette);
  document.body.dataset.theme = normalizedTheme;
  document.documentElement.dataset.theme = normalizedTheme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", palette.colors.base);
}

export function applyStoredTheme() {
  if (typeof window === "undefined") return;
  const theme = normalizeTheme(window.localStorage.getItem(THEME_STORAGE) ?? undefined);
  applyTheme(theme);
}

export function readStoredTheme(): ThemeId | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const value = window.localStorage.getItem(THEME_STORAGE);
    return value ? normalizeTheme(value) : undefined;
  } catch {
    return undefined;
  }
}
