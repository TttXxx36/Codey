import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(
  new URL("../src/App.tsx", import.meta.url),
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
