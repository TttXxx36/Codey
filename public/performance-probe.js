(() => {
  const VERSION = 1;
  if (window.__codeyPerformanceProbe?.version === VERSION) {
    window.__codeyPerformanceProbe.start?.();
    return;
  }

  const MAX_LONG_TASKS = 256;
  const MAX_FRAME_SAMPLES = 600;
  const FRAME_BUDGET_MS = 1000 / 60;
  const now = () => (
    typeof performance?.now === "function" ? performance.now() : Date.now()
  );
  const state = {
    startedAt: now(),
    lastFrameAt: 0,
    frameSamples: [],
    longTasks: [],
    frameRequest: 0,
    longTaskObserver: null,
    visibilityHandler: null,
    running: false,
  };

  const pushBounded = (list, value, limit) => {
    list.push(value);
    if (list.length > limit) list.splice(0, list.length - limit);
  };

  const frameTick = (timestamp) => {
    if (!state.running) return;
    if (state.lastFrameAt > 0) {
      pushBounded(state.frameSamples, Math.max(0, timestamp - state.lastFrameAt), MAX_FRAME_SAMPLES);
    }
    state.lastFrameAt = timestamp;
    state.frameRequest = window.requestAnimationFrame?.(frameTick) || 0;
  };

  const stop = () => {
    state.running = false;
    if (state.frameRequest) window.cancelAnimationFrame?.(state.frameRequest);
    state.frameRequest = 0;
    state.lastFrameAt = 0;
    state.longTaskObserver?.disconnect?.();
    state.longTaskObserver = null;
    if (state.visibilityHandler) {
      document.removeEventListener?.("visibilitychange", state.visibilityHandler);
      state.visibilityHandler = null;
    }
  };

  const start = () => {
    if (state.running) return;
    state.running = true;
    state.startedAt = now();
    state.lastFrameAt = 0;
    if (typeof PerformanceObserver === "function") {
      try {
        state.longTaskObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            pushBounded(state.longTasks, {
              durationMs: Number(entry.duration) || 0,
              startTimeMs: Number(entry.startTime) || 0,
              name: String(entry.name || "longtask"),
            }, MAX_LONG_TASKS);
          }
        });
        state.longTaskObserver.observe({ type: "longtask", buffered: true });
      } catch {
        state.longTaskObserver = null;
      }
    }
    state.visibilityHandler = () => {
      if (document.visibilityState === "hidden") {
        if (state.frameRequest) window.cancelAnimationFrame?.(state.frameRequest);
        state.frameRequest = 0;
        state.lastFrameAt = 0;
      } else if (state.running) {
        state.frameRequest = window.requestAnimationFrame?.(frameTick) || 0;
      }
    };
    document.addEventListener?.("visibilitychange", state.visibilityHandler, { passive: true });
    state.frameRequest = window.requestAnimationFrame?.(frameTick) || 0;
  };

  const memorySnapshot = () => {
    const memory = performance?.memory;
    if (!memory) return null;
    return {
      usedJSHeapSize: Number(memory.usedJSHeapSize) || 0,
      totalJSHeapSize: Number(memory.totalJSHeapSize) || 0,
      jsHeapSizeLimit: Number(memory.jsHeapSizeLimit) || 0,
    };
  };

  const snapshot = () => {
    const samples = state.frameSamples.slice();
    const longTasks = state.longTasks.slice();
    const totalFrameMs = samples.reduce((sum, value) => sum + value, 0);
    const maxFrameMs = samples.length ? Math.max(...samples) : 0;
    const droppedFrames = samples.reduce(
      (sum, value) => sum + Math.max(0, Math.round(value / FRAME_BUDGET_MS) - 1),
      0,
    );
    return {
      version: VERSION,
      running: state.running,
      uptimeMs: Math.max(0, now() - state.startedAt),
      frame: {
        sampleCount: samples.length,
        averageFrameMs: samples.length ? totalFrameMs / samples.length : 0,
        maxFrameMs,
        estimatedFps: totalFrameMs > 0 ? (samples.length / totalFrameMs) * 1000 : 0,
        droppedFrames,
      },
      longTasks: {
        count: longTasks.length,
        totalMs: longTasks.reduce((sum, entry) => sum + entry.durationMs, 0),
        maxMs: longTasks.length ? Math.max(...longTasks.map((entry) => entry.durationMs)) : 0,
        entries: longTasks,
      },
      memory: memorySnapshot(),
    };
  };

  const reset = () => {
    stop();
    state.frameSamples.length = 0;
    state.longTasks.length = 0;
    start();
    return snapshot();
  };

  window.__codeyPerformanceProbe = { version: VERSION, start, stop, reset, snapshot };
  start();
})();
