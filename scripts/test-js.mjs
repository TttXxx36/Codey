import { readdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const testsDir = resolve(root, "tests");
const timeoutMs = Number.parseInt(process.env.CODEY_JS_TEST_TIMEOUT_MS || "60000", 10);
const requestedConcurrency = Number.parseInt(
  process.env.CODEY_JS_TEST_CONCURRENCY || "4",
  10,
);
const files = readdirSync(testsDir)
  .filter((name) => name.endsWith(".test.mjs"))
  .sort()
  .map((name) => resolve(testsDir, name));
const concurrency = Math.max(1, Math.min(requestedConcurrency, files.length));

if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
  throw new Error("CODEY_JS_TEST_TIMEOUT_MS must be a positive integer");
}
if (!files.length) {
  throw new Error("No JavaScript test files were found");
}

function runFile(file) {
  return new Promise((resolveResult) => {
    const startedAt = Date.now();
    const child = spawn(process.execPath, ["--test", file], {
      cwd: root,
      env: {
        ...process.env,
        FORCE_COLOR: "0",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let timedOut = false;
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveResult({
        file,
        durationMs: Date.now() - startedAt,
        ...result,
      });
    };

    child.stdout.on("data", (chunk) => process.stdout.write(chunk));
    child.stderr.on("data", (chunk) => process.stderr.write(chunk));

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);

    child.once("error", (error) => {
      finish({
        code: 1,
        signal: null,
        timedOut,
        error: error.message,
      });
    });
    child.once("close", (code, signal) => {
      finish({
        code: code ?? 1,
        signal,
        timedOut,
      });
    });
  });
}

let nextIndex = 0;
const failures = [];

async function worker() {
  while (true) {
    const index = nextIndex;
    nextIndex += 1;
    if (index >= files.length) return;

    const file = files[index];
    console.log(`[test-js] START ${file}`);
    const result = await runFile(file);
    if (result.code === 0 && !result.timedOut) {
      console.log(`[test-js] PASS ${file} (${result.durationMs}ms)`);
      continue;
    }

    failures.push(result);
    console.error(
      `[test-js] FAIL ${file} (${result.durationMs}ms)${result.timedOut ? " [timeout]" : ""}`,
    );
  }
}

console.log(
  `[test-js] ${files.length} files, concurrency=${concurrency}, timeout=${timeoutMs}ms`,
);
await Promise.all(Array.from({ length: concurrency }, () => worker()));

if (failures.length) {
  console.error("[test-js] Failed files:");
  for (const failure of failures) {
    console.error(
      `- ${failure.file}: code=${failure.code}, signal=${failure.signal ?? "none"}${failure.error ? `, error=${failure.error}` : ""}`,
    );
  }
  process.exitCode = 1;
}
