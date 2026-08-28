import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);
const commandSource = await readFile(
  new URL("../backend/src/commands.rs", import.meta.url),
  "utf8",
);
const modelCommandSource = await readFile(
  new URL("../backend/src/commands/models.rs", import.meta.url),
  "utf8",
);

test("official route model selections use the route-scoped save command", () => {
  const start = appSource.indexOf("async function saveOfficialRouteSettings");
  const end = appSource.indexOf("async function setRouteDefaultModel", start);
  assert.ok(start >= 0 && end > start, "official route save handler should exist");

  const handler = appSource.slice(start, end);
  assert.match(
    handler,
    /invoke(?:<[^>]+>)?\(\s*"save_official_route_models"/,
    "official model edits must use the validated route-scoped command",
  );
  assert.doesNotMatch(
    handler,
    /const result = await persist/,
    "official model edits must not pass through the generic config save",
  );
});

test("official route saves carry revision and quota-setting intent to the backend", () => {
  const dispatchStart = commandSource.indexOf('"save_official_route_models"');
  const dispatchEnd = commandSource.indexOf('"runtime_status"', dispatchStart);
  assert.ok(
    dispatchStart >= 0 && dispatchEnd > dispatchStart,
    "official route command dispatch should exist",
  );
  const dispatch = commandSource.slice(dispatchStart, dispatchEnd);
  assert.match(dispatch, /expectedRevision/);
  assert.match(dispatch, /showAccountUsageInHeader/);
  assert.match(modelCommandSource, /save_official_route_models_with_options/);
  assert.match(
    modelCommandSource,
    /config\.settings_revision\s*=\s*config\.settings_revision\.saturating_add\(1\)/,
  );
});
