import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";

const root = process.cwd();
const baselineRef = process.env.CODEY_PERF_BASELINE_REF
  || process.argv.find((argument) => argument.startsWith("--baseline-ref="))?.split("=")[1]
  || "HEAD^";
const reportPath = resolve(
  root,
  process.env.CODEY_PERF_REPORT || "artifacts/performance/deep-performance-report.json",
);
const sourceFiles = [
  {
    id: "renderer-core",
    path: "public/renderer-inject.js",
    patterns: {
      mutationObservers: /new MutationObserver/g,
      wholeDocumentObservers: /observe\(document\.documentElement/g,
      documentQueries: /document\.querySelectorAll/g,
      timers: /setTimeout|setInterval/g,
    },
  },
  {
    id: "session-tools",
    path: "public/codey-inject.js",
    patterns: {
      mutationObservers: /new MutationObserver/g,
      wholeDocumentObservers: /observe\(document\.documentElement/g,
      documentQueries: /document\.querySelectorAll/g,
      timers: /setTimeout|setInterval/g,
      boundedThreadRows: /maxTrackedThreadRows/g,
      detachedRowCleanup: /untrackThreadRowsInSubtree/g,\n      stableTrackedRowIteration: /\\[\\.\\.\\.threadUpdatedAtRows\\]\\.forEach/g,
    },
  },
  {
    id: "appearance",
    path: "public/codex-appearance.js",
    patterns: {
      mutationObservers: /new MutationObserver/g,
      wholeDocumentObservers: /observe\(document\.documentElement/g,
      documentQueries: /document\.querySelectorAll/g,
      timers: /setTimeout|setInterval/g,
      disposedDelayedTimers: /delayedSyncTimers\.clear/g,
    },
  },
  {
    id: "startup-launcher",
    path: "backend/src/launcher.rs",
    patterns: {
      parallelJoin: /tokio::try_join!/g,
      startupTraceMarks: /perf_trace::mark/g,
      startupMaintenance: /run_startup_session_maintenance/g,
    },
  },
];

function readRefFile(ref, path) {
  try {
    return execFileSync("git", ["show", `${ref}:${path}`], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
}

function readCurrentFile(path) {
  const absolute = resolve(root, path);
  return existsSync(absolute) ? readFileSync(absolute, "utf8") : null;
}

function countMatches(source, pattern) {
  if (!source) return 0;
  return source.match(pattern)?.length || 0;
}

function measureFile(definition, source) {
  if (source === null) return null;
  const metrics = {
    bytes: Buffer.byteLength(source, "utf8"),
    lines: source.split(/\r?\n/).length,
  };
  for (const [name, pattern] of Object.entries(definition.patterns)) {
    metrics[name] = countMatches(source, pattern);
  }
  return metrics;
}

function measureSet(reader) {
  return Object.fromEntries(sourceFiles.map((definition) => [
    definition.id,
    measureFile(definition, reader(definition.path)),
  ]));
}

function numericDelta(after, before, key) {
  const next = after?.[key];
  const previous = before?.[key];
  if (!Number.isFinite(next) || !Number.isFinite(previous)) return null;
  return {
    before: previous,
    after: next,
    delta: next - previous,
    percent: previous === 0 ? null : ((next - previous) / previous) * 100,
  };
}

function compareSets(after, before) {
  return Object.fromEntries(sourceFiles.map((definition) => {
    const current = after?.[definition.id];
    const previous = before?.[definition.id];
    const keys = new Set([
      ...Object.keys(current || {}),
      ...Object.keys(previous || {}),
    ]);
    return [definition.id, Object.fromEntries(
      [...keys].map((key) => [key, numericDelta(current, previous, key)]),
    )];
  }));
}

function gitCommit() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).trim();
  } catch {
    return process.env.GITHUB_SHA || "unknown";
  }
}

const after = measureSet(readCurrentFile);
const before = measureSet((path) => readRefFile(baselineRef, path));
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  commit: gitCommit(),
  baselineRef,
  measurementBoundary: {
    sourceAnd_build: true,
    desktop_process: false,
    reason: "GitHub Actions runners do not contain the user's Codex desktop installation or account data.",
  },
  sourceMetrics: { before, after, comparison: compareSets(after, before) },
  instrumentation: {
    startupTrace: {
      enabledBy: "CODEY_PERF_TRACE=1",
      fileBy: "CODEY_PERF_TRACE_FILE=<absolute path>",
      eventFormat: "JSONL with stage, elapsedMs, sincePreviousMs",
    },
    rendererProbe: {
      enabledWithStartupTrace: true,
      api: "window.__codeyPerformanceProbe.snapshot()",
      metrics: ["longTasks", "frame", "memory"],
    },
  },
  runtimeMeasurements: {
    cpuPeak: "not_collected_in_headless_ci",
    frameRate: "not_collected_in_headless_ci",
    longTasksOver50ms: "collected only when the opt-in renderer probe is attached to a real Codex window",
    heapTimeline: "collected only when Chrome DevTools/CDP is attached to a real Codex window",
  },
  findings: [
    {
      id: "startup-serial-preflight",
      priority: "high",
      reproduction: "Start Codey with CODEY_PERF_TRACE=1 and compare launch_codey_inner.* to runtime_start.* events.",
      impact: "Independent app-path, route, provider, script preparation, storage and router work previously waited in sequence.",
      remediation: "Run independent read-only preparation and local router startup concurrently; preserve storage repair ordering before Codex spawn.",
    },
    {
      id: "tracked-row-iteration-freeze",
      priority: "high",
      reproduction: "Open a sidebar row with timestamp metadata and trigger a timestamp refresh or session switch.",
      impact: "Re-adding the current row during Set iteration can make the renderer loop forever, freezing left-sidebar session clicks.",
      remediation: "Iterate a snapshot of the bounded row set before callbacks are allowed to update LRU order.",
    },
    {
      id: "session-row-retention",
      priority: "high",
      reproduction: "Open a large/virtualized sidebar, switch sessions repeatedly, then remove or virtualize rows; inspect the tracked-row set in a heap snapshot.",
      impact: "Detached sidebar row DOM nodes were retained until a later scan and could grow with virtualization churn.",
      remediation: "Bound the set to 2,048 rows and release rows/subtrees immediately from removedNodes.",
    },
    {
      id: "appearance-delayed-timers",
      priority: "medium",
      reproduction: "Apply and destroy the appearance controller repeatedly while navigating or reloading the renderer.",
      impact: "Four delayed callbacks could outlive the controller for up to 3 seconds.",
      remediation: "Track and cancel every delayed synchronization timer during destroy.",
    },
  ],
  acceptance: {
    startupTarget: "At least 20% faster must be proven with paired real-Windows traces; this artifact alone does not claim that target.",
    memoryTarget: "No unbounded Codey-owned row retention; zero leak risk requires two real-window heap snapshots and a detached-node check.",
  },
};

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");

const markdownPath = reportPath.replace(/\.json$/i, ".md");
const formatMetric = (value) => value === null || value === undefined ? "n/a" : String(value);
const rows = sourceFiles.map((definition) => {
  const current = after[definition.id];
  const previous = before[definition.id];
  return `| ${definition.id} | ${formatMetric(previous?.bytes)} | ${formatMetric(current?.bytes)} | ${formatMetric(numericDelta(current, previous, "bytes")?.percent)} |`;
}).join("\n");
writeFileSync(markdownPath, [
  "# Codey performance audit",
  "",
  `Commit: ${report.commit}`,
  `Baseline: ${report.baselineRef}`,
  "",
  "## Static source/build comparison",
  "",
  "| Area | Before bytes | After bytes | Byte delta % |",
  "|---|---:|---:|---:|",
  rows,
  "",
  "## Measurement boundary",
  "",
  "This report contains reproducible source/build metrics and defines the opt-in real-window probes. GitHub-hosted CI cannot measure the installed Codex process, account data, GPU compositor, or the user's heap, so CPU peak, FPS, long-task count and heap growth remain explicitly unclaimed until a Windows trace is collected.",
  "",
  "## Reproduce on Windows",
  "",
  "Set CODEY_PERF_TRACE=1 and CODEY_PERF_TRACE_FILE to an absolute JSONL path, launch Codey, reproduce startup and sidebar navigation, then evaluate window.__codeyPerformanceProbe.snapshot() through the existing CDP 9229 session.",
  "",
].join("\n"), "utf8");

console.log(JSON.stringify({
  report: reportPath,
  markdown: markdownPath,
  commit: report.commit,
  baselineRef,
  sourceMetrics: report.sourceMetrics,
}, null, 2));
