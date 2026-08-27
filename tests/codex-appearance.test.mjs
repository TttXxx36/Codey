import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appearanceSource = readFileSync(
  new URL("../public/codex-appearance.js", import.meta.url),
  "utf8",
);

test("Codex appearance keeps the image inside the conversation surface", () => {
  assert.match(appearanceSource, /const VERSION = 2/);
  assert.match(appearanceSource, /removeStaleAppearanceButton/);
  assert.doesNotMatch(appearanceSource, /ensureAppearanceButton/);
  assert.doesNotMatch(appearanceSource, /__codeySettingsOverlay\?\.toggle/);
  assert.doesNotMatch(appearanceSource, /appearanceMountDirty|scheduleAppearanceButtonSync|mutationTouchesAppearanceMount/);
  assert.match(appearanceSource, /__CODEY_CODEX_APPEARANCE_SETTINGS__/);
  assert.match(appearanceSource, /#root \.thread-scroll-container/);
  assert.match(appearanceSource, /#root \.\_MainContentSurface_1k2yc_2/);
  assert.match(appearanceSource, /function isConversationSurface\(candidate\)/);
  assert.match(appearanceSource, /data-codey-appearance-active/);
  assert.match(appearanceSource, /codey-codex-appearance-button/);
  assert.match(
    appearanceSource,
    /#root \.top-toolbar-sm, #root \[class~='top-toolbar-sm'\]/,
  );
  assert.match(appearanceSource, /const top = Math\.max\(regionRect\.top, toolbarBottom\)/);
  assert.match(appearanceSource, /background\.style\.height = `\$\{height\}px`/);
  assert.doesNotMatch(appearanceSource, /#root > div,/);
  assert.match(appearanceSource, /new MutationObserver\(\(\) => \{/);
  assert.match(appearanceSource, /const delayedSyncTimers = new Set\(\)/);
  assert.match(appearanceSource, /function scheduleDelayedSync\(delay\)/);
  assert.match(appearanceSource, /delayedSyncTimers\.clear\(\)/);
});

test("Codex appearance supports persistent hot-apply and safe capability fallback", () => {
  assert.match(appearanceSource, /codey:config-changed/);
  assert.match(appearanceSource, /typeof ResizeObserver !== "function"/);
  assert.match(appearanceSource, /window\.__codeyCodexAppearance/);
  assert.match(appearanceSource, /window\.removeEventListener/);
});

test("built-in controller removes the legacy customizer safely", () => {
  assert.match(appearanceSource, /removeLegacyCustomizer/);
  assert.match(appearanceSource, /LEGACY_IDS/);
  assert.match(appearanceSource, /window\.__codexCustomizer = null/);
});
