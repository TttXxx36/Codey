import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("startup update discovery begins after the first Codex launch", async () => {
  const library = await readFile(
    new URL("backend/src/lib.rs", root),
    "utf8",
  );
  const launch = library.indexOf(
    "commands::launch_codey_runtime(&state).await",
  );
  const update = library.indexOf(
    "startup_update::run(&update_state, &update_ui).await",
    launch,
  );
  const updateShutdown = library.indexOf(
    "update_state.request_update_shutdown()",
    update,
  );

  assert.notEqual(launch, -1);
  assert.ok(launch < update);
  assert.ok(update < updateShutdown);
  assert.match(library, /startup_update_task = Some\(tokio::spawn/);
  assert.doesNotMatch(library, /startup_update::run\(&state, &ui\)/);
});

test("Windows startup update UI uses a dedicated message loop and custom task-dialog buttons", async () => {
  const [ui, manifest, cargo] = await Promise.all([
    readFile(new URL("backend/src/native_update_ui.rs", root), "utf8"),
    readFile(new URL("backend/build.rs", root), "utf8"),
    readFile(new URL("backend/Cargo.toml", root), "utf8"),
  ]);

  assert.match(ui, /name\("codey-native-update-ui"\.to_string\(\)\)/);
  assert.match(ui, /GetMessageW\(&mut message, None, 0, 0\)/);
  assert.match(ui, /PostThreadMessageW\(self\.thread\.thread_id, WM_APP/);
  assert.match(ui, /OkCancelCustom\("更新并重启"\.to_string\(\), "稍后"\.to_string\(\)\)/);
  assert.match(manifest, /Microsoft\.Windows\.Common-Controls/);
  assert.match(manifest, /version="6\.0\.0\.0"/);
  assert.match(cargo, /features = \["common-controls-v6"\]/);
});

test("macOS keeps AppKit on the main thread without a Dock icon", async () => {
  const [ui, build] = await Promise.all([
    readFile(new URL("backend/src/native_update_ui.rs", root), "utf8"),
    readFile(new URL("scripts/build.mjs", root), "utf8"),
  ]);

  assert.match(ui, /MainThreadMarker::new\(\)/);
  assert.match(ui, /NSApplicationActivationPolicy::Accessory/);
  assert.match(ui, /NSPanel::initWithContentRect_styleMask_backing_defer/);
  assert.match(ui, /name\("codey-runtime"\.to_string\(\)\)/);
  assert.match(ui, /app\.run\(\)/);
  assert.match(build, /<key>LSUIElement<\/key><true\/>/);
});
