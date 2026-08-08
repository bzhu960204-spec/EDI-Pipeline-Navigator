import { Segmented, Select, Space, Switch, Tooltip } from 'antd';
import { BulbOutlined, BgColorsOutlined, ColumnWidthOutlined } from '@ant-design/icons';
import { THEME_PRESETS } from './presets';
import { useThemeStore } from './themeStore';

export function ThemeSwitcher() {
  const { presetKey, mode, compact, setPreset, setMode, setCompact } = useThemeStore();
  return (
    <Space size="middle">
      <Space size={4}>
        <BgColorsOutlined />
        <Select
          size="small"
          value={presetKey}
          style={{ width: 150 }}
          onChange={setPreset}
          options={THEME_PRESETS.map((p) => ({ value: p.key, label: p.label }))}
        />
      </Space>
      <Segmented
        size="small"
        value={mode}
        onChange={(v) => setMode(v as 'light' | 'dark')}
        options={[
          { value: 'light', label: 'Light', icon: <BulbOutlined /> },
          { value: 'dark', label: 'Dark', icon: <BulbOutlined /> },
        ]}
      />
      <Tooltip title="Compact density">
        <Space size={4}>
          <ColumnWidthOutlined />
          <Switch size="small" checked={compact} onChange={setCompact} />
        </Space>
      </Tooltip>
    </Space>
  );
}
