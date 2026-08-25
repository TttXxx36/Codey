import { readFileSync, readdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const testsDir = resolve(root, "tests");
const timeoutMs = Number.parseInt(process.env.CODEY_JS_TEST_TIMEOUT_MS || "60000", 10);
const diagnosisTimeoutMs = Number.parseInt(
  process.env.CODEY_JS_TEST_DIAGNOSIS_TIMEOUT_MS || "10000",
  10,
);
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
if (!Number.isFinite(diagnosisTimeoutMs) || diagnosisTimeoutMs <= 0) {
  throw new Error("CODEY_JS_TEST_DIAGNOSIS_TIMEOUT_MS must be a positive integer");
}
if (!files.length) {
  throw new Error("No JavaScript test files were found");
}

function runNodeTest(file, extraArgs = [], limitMs = timeoutMs) {
  return new Promise((resolveResult) => {
    const startedAt = Date.now();
    const child = spawn(process.execPath, ["--test", ...extraArgs, file], {
      cwd: root,
      env: {
        ...process.env,
        FORCE_COLOR: "0",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let timedOut = false;
    let settled = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, limitMs);

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

function escapeRegExp(value) {
  return value.replace(/[.*+?^\${}()|[\]\\]/g, "\\$&");
}

function testNamePatterns(file) {
  const source = readFileSync(file, "utf8");
  const names = [
    ...source.matchAll(/\btest\(\s*["'`]([^"'`]+)["'`]/g),
    ...source.matchAll(/\bname:\s*["'`]([^"'`]+)["'`]/g),
  ].map((match) => match[1]);
  return [...new Set(names)];
}

async function diagnoseTimedOutFile(file) {
  const names = testNamePatterns(file);
  if (!names.length) {
    console.error(`[test-js] No literal test names available for ${file}`);
    return [];
  }

  console.error(
    `[test-js] Diagnosing ${file}: ${names.length} test-name patterns, timeout=${diagnosisTimeoutMs}ms`,
  );
  const results = await Promise.all(names.map(async (name) => {
    const pattern = `^${escapeRegExp(name)}$`;
    const result = await runNodeTest(
      file,
      ["--test-name-pattern", pattern],
      diagnosisTimeoutMs,
    );
    return { name, ...result };
  }));
  const suspects = results.filter((result) => (
    result.timedOut || result.code !== 0
  ));
  for (const suspect of suspects) {
    console.error(
      `[test-js] SUSPECT ${file}: "${suspect.name}"` +
      ` code=${suspect.code}, signal=${suspect.signal ?? "none"}` +
      `${suspect.timedOut ? " [timeout]" : ""}`,
    );
  }
  if (!suspects.length) {
    console.error(
      `[test-js] No isolated test timed out in ${file}; inspect module-level setup or shared timers.`,
    );
  }
  return suspects;
}

let nextIndex = 0;
const failures = [];
const suspects = [];

async function worker() {
  while (true) {
    const index = nextIndex;
    nextIndex += 1;
    if (index >= files.length) return;

    const file = files[index];
    console.log(`[test-js] START ${file}`);
    const result = await runNodeTest(file);
    if (result.code === 0 && !result.timedOut) {
      console.log(`[test-js] PASS ${file} (${result.durationMs}ms)`);
      continue;
    }

    failures.push(result);
    console.error(
      `[test-js] FAIL ${file} (${result.durationMs}ms)${result.timedOut ? " [timeout]" : ""}`,
    );
    if (result.timedOut) {
      suspects.push(...await diagnoseTimedOutFile(file));
    }
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
      `- ${failure.file}: code=${failure.code}, signal=${failure.signal ?? "none"}` +
      `${failure.error ? `, error=${failure.error}` : ""}`,
    );
  }
  if (suspects.length) {
    console.error("[test-js] Isolated suspect tests:");
    for (const suspect of suspects) {
      console.error(`- ${suspect.file}: ${suspect.name}`);
    }
  }
  process.exitCode = 1;
}
