import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";

const rendererSource = readFileSync(
  new URL("../public/renderer-inject.js", import.meta.url),
  "utf8",
);

function extractAccountUsageBounds() {
  const match = rendererSource.match(
    /  const accountUsageConversationBounds = (\(\{[\s\S]*?\n  \};)\n\n  const accountUsageViewportRect/,
  );
  assert.ok(match, "the account usage bounds helper must remain a testable pure function");
  return runInNewContext(match[1].replace(/;\\s*$/, ""));
}

test("free quota bounds match the background conversation rectangle", () => {
  const bounds = extractAccountUsageBounds()({
    regionRect: {
      left: 280,
      top: 42,
      width: 1400,
      height: 1138,
      right: 1680,
      bottom: 1180,
    },
    toolbarRect: { bottom: 96 },
    viewportWidth: 1920,
    viewportHeight: 1200,
  });

  assert.deepEqual({ ...bounds }, {
    left: 280,
    right: 1680,
    top: 96,
    bottom: 1180,
    width: 1400,
    height: 1084,
  });
});

test("free quota bounds keep the top toolbar outside the drag region", () => {
  const bounds = extractAccountUsageBounds()({
    regionRect: {
      left: -20,
      top: 30,
      width: 340,
      height: 260,
      right: 320,
      bottom: 290,
    },
    toolbarRect: { bottom: 80 },
    viewportWidth: 320,
    viewportHeight: 240,
  });

  assert.equal(bounds.left, 0);
  assert.equal(bounds.right, 320);
  assert.equal(bounds.top, 80);
  assert.equal(bounds.bottom, 240);
});

test("the free quota handle has an accessible name and six visible dots without label text", () => {
  assert.match(rendererSource, /aria-label="拖动额度卡片"/);
  assert.match(rendererSource, /class="codey-usage-drag-glyph"/);
  assert.equal(
    (rendererSource.match(/class="codey-usage-drag-glyph"/g) || []).length,
    1,
  );
  assert.doesNotMatch(
    rendererSource,
    /class="codey-usage-drag-handle"[^>]*>\s*<span>拖动<\/span>/,
  );
  assert.match(
    rendererSource,
    /codey-usage-drag-glyph" aria-hidden="true">(?:<span><\/span>){6}<\/span>/,
  );
  assert.match(rendererSource, /accountUsageConversationBounds\(\{\s*regionRect: contentRect/);
  assert.doesNotMatch(rendererSource, /const composerRect =/);
  assert.doesNotMatch(rendererSource, /composerRect\.top/);
});
