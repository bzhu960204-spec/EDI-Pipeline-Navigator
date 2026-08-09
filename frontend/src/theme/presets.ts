import { theme as antdTheme, type ThemeConfig } from 'antd';

export type ThemeMode = 'light' | 'dark';

export interface ThemePreset {
  key: string;
  label: string;
  /** Primary brand color used as AntD colorPrimary token. */
  colorPrimary: string;
  /** Optional extra token overrides. */
  token?: ThemeConfig['token'];
}

/**
 * Enterprise-oriented presets. Density is handled globally via compact algorithm.
 */
export const THEME_PRESETS: ThemePreset[] = [
  {
    key: 'enterprise-blue',
    label: 'Enterprise Blue',
    colorPrimary: '#1677ff',
    token: { borderRadius: 6 },
  },
  {
    key: 'slate',
    label: 'Slate Neutral',
    colorPrimary: '#4b5563',
    token: { borderRadius: 4 },
  },
  {
    key: 'teal',
    label: 'Teal',
    colorPrimary: '#0d9488',
    token: { borderRadius: 8 },
  },
  {
    key: 'indigo',
    label: 'Indigo',
    colorPrimary: '#4f46e5',
    token: { borderRadius: 6 },
  },
];

export function buildThemeConfig(
  presetKey: string,
  mode: ThemeMode,
  compact: boolean,
): ThemeConfig {
  const preset = THEME_PRESETS.find((p) => p.key === presetKey) ?? THEME_PRESETS[0];
  const algorithms = [
    mode === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
  ];
  if (compact) {
    algorithms.push(antdTheme.compactAlgorithm);
  }
  return {
    algorithm: algorithms,
    cssVar: true,
    token: {
      colorPrimary: preset.colorPrimary,
      ...preset.token,
    },
  };
}
