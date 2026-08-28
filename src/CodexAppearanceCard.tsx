import { useRef, useState, type ChangeEvent, type CSSProperties } from "react";
import {
  IconAdjustmentsHorizontal,
  IconPhoto,
  IconTrash,
} from "@tabler/icons-react";

import type { CodexAppearanceConfig, Config } from "./App.types";
import {
  ActionGroup,
  Button,
  FieldRow,
  SectionHeader,
  Switch,
  StatusChip,
  Surface,
} from "./components/mantine";

const DEFAULT_APPEARANCE: CodexAppearanceConfig = {
  enabled: true,
  backgroundDataUrl: "",
  backgroundFileName: "",
  backgroundOpacity: 70,
  surfaceOpacity: 38,
  chatWidth: 1200,
};

const MAX_IMAGE_BYTES = 16 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 2400;

function rangeProgress(value: number, min: number, max: number) {
  const ratio = (value - min) / (max - min);
  return String(Math.round(Math.min(1, Math.max(0, ratio)) * 100)) + "%";
}

function imageFileToDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    return Promise.reject(new Error("请选择图片文件"));
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return Promise.reject(new Error("图片不能超过 16 MB"));
  }

  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    const cleanup = () => URL.revokeObjectURL(objectUrl);
    image.onload = () => {
      try {
        const scale = Math.min(
          1,
          MAX_IMAGE_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight),
        );
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext("2d");
        if (!context) throw new Error("无法处理这张图片");
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.86);
        cleanup();
        resolve(dataUrl);
      } catch (error) {
        cleanup();
        reject(error instanceof Error ? error : new Error("图片处理失败"));
      }
    };
    image.onerror = () => {
      cleanup();
      reject(new Error("无法读取这张图片"));
    };
    image.src = objectUrl;
  });
}

export type CodexAppearanceCardProps = {
  config: Config;
  isBusy: boolean;
  onConfigChange: (config: Config) => void;
};

export function CodexAppearanceCard({
  config,
  isBusy,
  onConfigChange,
}: CodexAppearanceCardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState("");
  const appearance = config.codexAppearance ?? DEFAULT_APPEARANCE;
  const appearanceEnabled = appearance.enabled !== false;

  const updateAppearance = (patch: Partial<CodexAppearanceConfig>) => {
    onConfigChange({
      ...config,
      codexAppearance: {
        ...appearance,
        ...patch,
      },
    });
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setFileError("");
    try {
      const dataUrl = await imageFileToDataUrl(file);
      updateAppearance({
        backgroundDataUrl: dataUrl,
        backgroundFileName: file.name.slice(0, 128),
      });
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "图片处理失败");
    }
  };

  return (
    <section
      className="secondary-section codex-appearance-section"
      aria-labelledby="codex-appearance-title"
    >
      <SectionHeader
        id="codex-appearance-title"
        icon={<IconAdjustmentsHorizontal size={15} />}
        title="Codex 外观调整"
        description="统一管理背景图片、对话宽度和界面遮罩。"
        action={
          <Switch
            checked={appearanceEnabled}
            disabled={isBusy}
            onCheckedChange={(checked) => updateAppearance({ enabled: checked })}
            aria-label="启用 Codex 外观调整"
          />
        }
      />

      <Surface className="codex-appearance-card">
        <div className="codex-appearance-background-row">
          <div className="codex-appearance-copy">
            <div className="codex-appearance-field-heading">
              <strong>背景图片</strong>
              <StatusChip
                size="xs"
                tone={appearance.backgroundDataUrl ? "success" : "secondary"}
              >
                {appearance.backgroundDataUrl ? "已设置" : "未设置"}
              </StatusChip>
            </div>
            <small>
              只显示在 Codex 中央聊天/内容区域，自动避开左侧会话栏和顶部工具栏。
            </small>
            {appearance.backgroundFileName && (
              <span className="codex-appearance-file-name">
                {appearance.backgroundFileName}
              </span>
            )}
            {fileError && (
              <span className="codex-appearance-error" role="alert">
                {fileError}
              </span>
            )}
          </div>
          <div className="codex-appearance-preview-panel">
            <span className="codex-appearance-preview-label">当前背景预览</span>
            <div
              className="codex-appearance-preview-shell"
              aria-label="当前 Codex 背景预览"
            >
              {appearance.backgroundDataUrl ? (
                <img
                  className="codex-appearance-preview"
                  src={appearance.backgroundDataUrl}
                  alt="当前 Codex 背景预览"
                />
              ) : (
                <div className="codex-appearance-preview-empty">
                  <IconPhoto aria-hidden="true" size={18} />
                  <span>未设置背景</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <ActionGroup className="codex-appearance-background-actions">
          <input
            ref={fileInputRef}
            className="sr-only"
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            disabled={isBusy || !appearanceEnabled}
          />
          <Button
            disabled={isBusy || !appearanceEnabled}
            onClick={() => fileInputRef.current?.click()}
            size="sm"
            variant="outline"
          >
            <IconPhoto aria-hidden="true" size={15} />
            选择图片
          </Button>
          {appearance.backgroundDataUrl && (
            <Button
              aria-label="移除 Codex 背景图片"
              disabled={isBusy || !appearanceEnabled}
              onClick={() =>
                updateAppearance({
                  backgroundDataUrl: "",
                  backgroundFileName: "",
                })
              }
              size="icon-sm"
              variant="ghost"
            >
              <IconTrash aria-hidden="true" size={15} />
            </Button>
          )}
        </ActionGroup>

        <div className="codex-appearance-controls">
          <FieldRow
            className="codex-appearance-control"
            label="对话内容宽度"
            value={appearance.chatWidth + "px"}
            description="限制中央对话正文的最大宽度，不影响左侧会话栏。"
          >
            <input
              type="range"
              min="800"
              max="1800"
              step="10"
              value={appearance.chatWidth}
              style={{
                "--codey-range-progress": rangeProgress(
                  appearance.chatWidth,
                  800,
                  1800,
                ),
              } as CSSProperties}
              disabled={isBusy || !appearanceEnabled}
              onChange={(event) =>
                updateAppearance({ chatWidth: Number(event.target.value) })
              }
            />
          </FieldRow>          <FieldRow
            className="codex-appearance-control"
            label="背景显示强度"
            value={appearance.backgroundOpacity + "%"}
            description="调节背景图片的可见程度，数值越高越突出。"
          >
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={appearance.backgroundOpacity}
              style={{
                "--codey-range-progress": rangeProgress(
                  appearance.backgroundOpacity,
                  0,
                  100,
                ),
              } as CSSProperties}
              disabled={isBusy || !appearanceEnabled}
              onChange={(event) =>
                updateAppearance({ backgroundOpacity: Number(event.target.value) })
              }
            />
          </FieldRow>
          <FieldRow
            className="codex-appearance-control"
            label="界面遮罩强度"
            value={appearance.surfaceOpacity + "%"}
            description="增加遮罩可提升文字可读性，数值越高越稳重。"
          >
            <input
              type="range"
              min="0"
              max="80"
              step="1"
              value={appearance.surfaceOpacity}
              style={{
                "--codey-range-progress": rangeProgress(
                  appearance.surfaceOpacity,
                  0,
                  80,
                ),
              } as CSSProperties}
              disabled={isBusy || !appearanceEnabled}
              onChange={(event) =>
                updateAppearance({ surfaceOpacity: Number(event.target.value) })
              }
            />
          </FieldRow>

        </div>

        <small className="codex-appearance-help">
          保存后立即尝试应用；如果 Codex 页面正在重载，新的设置会在下一次 Codey 启动时自动恢复。
        </small>
      </Surface>
    </section>
  );
}
