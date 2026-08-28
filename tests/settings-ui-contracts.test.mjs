import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const accountSource = await readFile(
  new URL("../src/AccountUsageLayoutCard.tsx", import.meta.url),
  "utf8",
);
const promptSource = await readFile(
  new URL("../src/PromptOptimizationCard.tsx", import.meta.url),
  "utf8",
);
const appearanceSource = await readFile(
  new URL("../src/CodexAppearanceCard.tsx", import.meta.url),
  "utf8",
);
const subagentSource = await readFile(
  new URL("../src/FeaturePolicyCard.tsx", import.meta.url),
  "utf8",
);
const updatesSource = await readFile(
  new URL("../src/useAppUpdates.ts", import.meta.url),
  "utf8",
);
const featureSource = subagentSource;
const modelSource = await readFile(
  new URL("../src/ModelSection.tsx", import.meta.url),
  "utf8",
);
const modelStyles = await readFile(
  new URL("../src/styles.models.css", import.meta.url),
  "utf8",
);
const appearanceStyles = await readFile(
  new URL("../src/styles.codex-appearance.css", import.meta.url),
  "utf8",
);
const appearanceRuntime = await readFile(
  new URL("../public/codex-appearance.js", import.meta.url),
  "utf8",
);

test("approved settings sections use a single right-aligned header switch", () => {
  for (const source of [accountSource, promptSource, appearanceSource, subagentSource]) {
    assert.match(source, /<SectionHeader[\s\S]*action=/);
  }
  assert.doesNotMatch(promptSource, /prompt-optimization-toggle/);
  assert.doesNotMatch(subagentSource, /subagent-toggle-card/);
});

test("automatic updates are check-only and opt-in by persisted preference", () => {
  assert.match(updatesSource, /autoCheckUpdates/);
  assert.match(updatesSource, /!autoCheckUpdates/);
  const automaticEffect = updatesSource.slice(
    updatesSource.indexOf("useEffect(() => {", updatesSource.indexOf("function publishUpdateAvailability")),
    updatesSource.indexOf("  async function checkForUpdates()"),
  );
  assert.doesNotMatch(automaticEffect, /downloadUpdate|installDownloadedUpdate/);
  assert.match(featureSource, /自动检查更新/);
  assert.match(featureSource, /不会自动下载或安装/);
});

test("the unified model catalog exposes a five-row scroll region", () => {
  assert.match(modelSource, /className="provider-model-list"[\s\S]*role="region"/);
  assert.match(modelStyles, /max-height:\s*236px/);
  assert.match(modelStyles, /overflow-y:\s*auto/);
  assert.match(modelStyles, /scrollbar-gutter:\s*stable/);
});

test("appearance keeps a 16:9 preview and a persisted enable switch", () => {
  assert.match(appearanceStyles, /aspect-ratio:\s*16 \/ 9/);
  assert.match(appearanceSource, /enabled/);
  assert.match(appearanceRuntime, /enabled: source\.enabled !== false/);
});
