import { ConfigProvider, App as AntApp } from 'antd';
import type { ReactNode } from 'react';
import { buildThemeConfig } from './presets';
import { useThemeStore } from './themeStore';

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const { presetKey, mode, compact } = useThemeStore();
  const config = buildThemeConfig(presetKey, mode, compact);
  return (
    <ConfigProvider theme={config}>
      <AntApp>{children}</AntApp>
    </ConfigProvider>
  );
}
