import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { loadTypeScriptModule } from "./helpers/load-typescript-module.mjs";

const root = new URL("../", import.meta.url);
const [mergeModule, appSource, overlaySource, rendererSource] = await Promise.all([
  loadTypeScriptModule(new URL("../src/configSaveMerge.ts", import.meta.url)),
  readFile(new URL("../src/App.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/overlay.tsx", import.meta.url), "utf8"),
  readFile(new URL("../public/renderer-inject.js", import.meta.url), "utf8"),
]);

test("rebases local settings edits without losing unrelated concurrent changes", () => {
  const base = {
    settingsRevision: 7,
    codexAppearance: {
      backgroundDataUrl: "",
      backgroundFileName: "",
      backgroundOpacity: 70,
      surfaceOpacity: 38,
      chatWidth: 1200,
    },
    accountUsageLayout: {
      mode: "fixed",
      anchorX: 0,
      anchorY: 10000,
    },
    showAccountUsageInHeader: true,
  };
  const draft = {
    ...base,
    codexAppearance: {
      ...base.codexAppearance,
      backgroundOpacity: 82,
    },
    showAccountUsageInHeader: false,
  };
  const latest = {
    ...base,
    settingsRevision: 8,
    accountUsageLayout: {
      mode: "free",
      anchorX: 5400,
      anchorY: 7600,
    },
  };

  const merged = mergeModule.mergeConfigDraft(base, draft, latest);

  assert.equal(merged.settingsRevision, 8);
  assert.equal(merged.codexAppearance.backgroundOpacity, 82);
  assert.equal(merged.showAccountUsageInHeader, false);
  assert.deepEqual(merged.accountUsageLayout, latest.accountUsageLayout);
});

test("recognizes the user-visible stale settings revision error", () => {
  assert.equal(
    mergeModule.isSettingsRevisionConflict(
      new Error("Codey 设置已被其他操作更新，请关闭后重新打开设置页面再保存"),
    ),
    true,
  );
  assert.equal(mergeModule.isSettingsRevisionConflict(new Error("network timeout")), false);
});

test("the settings save path retries against the newest config snapshot", () => {
  assert.match(appSource, /from "\.\/configSaveMerge"/);
  assert.match(appSource, /isSettingsRevisionConflict\(error\)/);
  assert.match(appSource, /mergeConfigDraft\(/);
  assert.match(appSource, /load_codey_config/);
});

test("the embedded settings overlay includes feature-specific styles", () => {
  assert.match(
    overlaySource,
    /import accountUsageStyles from "\.\/styles\.account-usage\.css\?inline";/,
  );
  assert.match(
    overlaySource,
    /import appearanceStyles from "\.\/styles\.codex-appearance\.css\?inline";/,
  );
  assert.match(overlaySource, /accountUsageStyles,/);
  assert.match(overlaySource, /appearanceStyles,/);
});

test("quota layout persistence retries a concurrent settings revision update", () => {
  assert.match(rendererSource, /const accountUsageConfigConflict/);
  assert.match(rendererSource, /for \(let attempt = 0; attempt < 3; attempt \+= 1\)/);
  assert.match(rendererSource, /accountUsageConfigConflict\(saveResult\)/);
});
