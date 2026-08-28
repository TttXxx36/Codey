import { IconAdjustmentsHorizontal } from "@tabler/icons-react";

import type { AccountUsageLayoutConfig, Config } from "./App.types";
import {
  ActionGroup,
  Button,
  SectionHeader,
  StatusChip,
  Surface,
  Switch,
} from "./components/mantine";

const DEFAULT_ACCOUNT_USAGE_LAYOUT: AccountUsageLayoutConfig = {
  mode: "fixed",
  anchorX: 0,
  anchorY: 10_000,
};

const MODE_OPTIONS: Array<{
  value: AccountUsageLayoutConfig["mode"];
  title: string;
  description: string;
}> = [
  {
    value: "fixed",
    title: "固定在左下角",
    description: "保持现在的侧边栏底部位置，不随会话内容滚动。",
  },
  {
    value: "free",
    title: "自由拖动",
    description: "拖动面板标题即可移动，位置会限制在中央内容区域内并自动记忆。",
  },
];

function normalizedLayout(
  value: AccountUsageLayoutConfig | undefined,
): AccountUsageLayoutConfig {
  const source = value ?? DEFAULT_ACCOUNT_USAGE_LAYOUT;
  return {
    mode: source.mode === "free" ? "free" : "fixed",
    anchorX: Math.max(0, Math.min(10_000, Number(source.anchorX) || 0)),
    anchorY: Math.max(0, Math.min(10_000, Number(source.anchorY) || 10_000)),
  };
}

export type AccountUsageLayoutCardProps = {
  config: Config;
  isBusy: boolean;
  onConfigChange: (config: Config) => void;
};

export function AccountUsageLayoutCard({
  config,
  isBusy,
  onConfigChange,
}: AccountUsageLayoutCardProps) {
  const layout = normalizedLayout(config.accountUsageLayout);
  const updateLayout = (patch: Partial<AccountUsageLayoutConfig>) => {
    onConfigChange({
      ...config,
      accountUsageLayout: {
        ...layout,
        ...patch,
      },
    });
  };

  return (
    <section
      className="secondary-section account-usage-layout-section"
      aria-labelledby="account-usage-layout-title"
    >
      <SectionHeader
        id="account-usage-layout-title"
        icon={<IconAdjustmentsHorizontal size={15} />}
        title="额度显示"
        description="管理 Plus 5 小时额度和周额度在 Codex 中的显示方式。"
        action={
          <Switch
            checked={config.showAccountUsageInHeader !== false}
            disabled={isBusy}
            onCheckedChange={(checked) =>
              onConfigChange({ ...config, showAccountUsageInHeader: checked })
            }
            aria-label="显示 Codex 额度信息"
          />
        }
        status={
          <StatusChip tone={layout.mode === "free" ? "info" : "secondary"}>
            {layout.mode === "free" ? "自由拖动" : "固定左下角"}
          </StatusChip>
        }
      />

      <Surface className="account-usage-layout-card">
        <div className="codey-field-row account-usage-position-field">
          <div className="codey-field-row-heading">
            <span>显示位置</span>
          </div>
          <div className="account-usage-mode-grid" role="radiogroup" aria-label="额度面板显示位置">
            {MODE_OPTIONS.map((option) => (
              <label
                className={`account-usage-mode-option ${layout.mode === option.value ? "selected" : ""}`}
                key={option.value}
              >
                <input
                  type="radio"
                  name="codey-account-usage-layout"
                  value={option.value}
                  checked={layout.mode === option.value}
                  disabled={isBusy}
                  onChange={() => updateLayout({ mode: option.value })}
                />
                <span className="account-usage-mode-copy">
                  <strong>{option.title}</strong>
                  <small>{option.description}</small>
                </span>
              </label>
            ))}
          </div>
        </div>

        <ActionGroup className="account-usage-layout-actions">
          <Button
            disabled={isBusy || layout.mode !== "free"}
            onClick={() =>
              updateLayout({
                mode: "free",
                anchorX: DEFAULT_ACCOUNT_USAGE_LAYOUT.anchorX,
                anchorY: DEFAULT_ACCOUNT_USAGE_LAYOUT.anchorY,
              })
            }
            size="sm"
            variant="outline"
          >
            恢复左下角位置
          </Button>
          <small>
            {layout.mode === "free"
              ? "在 Codex 中拖动“额度”标题即可调整位置。"
              : "固定模式会保留原有左下角布局。"}
          </small>
        </ActionGroup>
      </Surface>
    </section>
  );
}
