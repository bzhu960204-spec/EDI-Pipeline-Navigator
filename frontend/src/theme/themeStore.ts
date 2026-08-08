import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ThemeMode } from './presets';

interface ThemeState {
  presetKey: string;
  mode: ThemeMode;
  compact: boolean;
  setPreset: (key: string) => void;
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
  setCompact: (compact: boolean) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      presetKey: 'enterprise-blue',
      mode: 'light',
      compact: true,
      setPreset: (presetKey) => set({ presetKey }),
      setMode: (mode) => set({ mode }),
      toggleMode: () => set((s) => ({ mode: s.mode === 'light' ? 'dark' : 'light' })),
      setCompact: (compact) => set({ compact }),
    }),
    { name: 'edinav-theme' },
  ),
);
