(() => {
  const VERSION = 2;
  const initialSettings = __CODEY_CODEX_APPEARANCE_SETTINGS__;
  const BACKGROUND_ID = "codey-codex-appearance-background";
  const STYLE_ID = "codey-codex-appearance-style";
  const STALE_APPEARANCE_BUTTON_ID = "codey-codex-appearance-button";
  const STALE_APPEARANCE_BUTTON_STYLE_ID = "codey-codex-appearance-button-style";
  const LEGACY_STORAGE_KEY = "codex.customizer.appearance.v1";
  const LEGACY_IDS = [
    "codex-customizer-background",
    "codex-customizer-appearance-style",
    "codex-customizer-ui-style",
    "codex-customizer-panel",
    "codex-user-chat-width",
  ];
  const DEFAULTS = {
    backgroundDataUrl: "",
    backgroundFileName: "",
    backgroundOpacity: 70,
    surfaceOpacity: 38,
    chatWidth: 1200,
  };

  if (window.__codeyCodexAppearance?.version === VERSION) {
    return window.__codeyCodexAppearance.tick?.() || { ok: true, reused: true };
  }
  window.__codeyCodexAppearance?.destroy?.();

  let settings = normalizeSettings(initialSettings);
  let ownsBackground = Boolean(settings.backgroundDataUrl);
  let syncTimer = 0;
  let resizeObserver = null;
  let observedRegion = null;
  let observedToolbar = null;
  let mutationObserver = null;
  const delayedSyncTimers = new Set();
  let configChangeHandler = null;
  let resizeHandler = null;

  function normalizeSettings(value) {
    const source = value && typeof value === "object" ? value : {};
    const numberOr = (candidate, fallback) => {
      const number = Number(candidate);
      return Number.isFinite(number) ? number : fallback;
    };
    const backgroundDataUrl = typeof source.backgroundDataUrl === "string"
      && source.backgroundDataUrl.startsWith("data:image/")
      ? source.backgroundDataUrl
      : "";
    return {
      ...DEFAULTS,
      ...source,
      backgroundDataUrl,
      backgroundFileName: String(source.backgroundFileName || "").slice(0, 128),
      backgroundOpacity: Math.max(0, Math.min(100, numberOr(source.backgroundOpacity, DEFAULTS.backgroundOpacity))),
      surfaceOpacity: Math.max(0, Math.min(80, numberOr(source.surfaceOpacity, DEFAULTS.surfaceOpacity))),
      chatWidth: Math.max(800, Math.min(1800, numberOr(source.chatWidth, DEFAULTS.chatWidth))),
    };
  }

  function removeLegacyCustomizer() {
    for (const id of LEGACY_IDS) document.getElementById(id)?.remove?.();
    document.getElementById("codex-customizer-button")?.parentElement?.remove?.();
    window.__codexCustomizer = null;
  }

  function hasLegacyCustomizer() {
    return window.__codexCustomizer?.version === 9
      || Boolean(document.getElementById("codex-customizer-button"))
      || Boolean(document.getElementById("codex-customizer-background"));
  }

  function hasExplicitAppearanceSettings(value) {
    return Boolean(value.backgroundDataUrl)
      || value.backgroundFileName.length > 0
      || value.backgroundOpacity !== DEFAULTS.backgroundOpacity
      || value.surfaceOpacity !== DEFAULTS.surfaceOpacity
      || value.chatWidth !== DEFAULTS.chatWidth;
  }

  function ensureStyle() {
    let style = document.getElementById(STYLE_ID);
    if (!(style instanceof HTMLStyleElement)) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      document.head?.appendChild(style);
    }
    return style;
  }

  function removeStaleAppearanceButton() {
    document.getElementById(STALE_APPEARANCE_BUTTON_ID)?.parentElement?.remove?.();
    document.getElementById(STALE_APPEARANCE_BUTTON_STYLE_ID)?.remove?.();
  }

  removeStaleAppearanceButton();
  function ensureBackground() {
    let layer = document.getElementById(BACKGROUND_ID);
    if (!(layer instanceof HTMLDivElement)) {
      layer = document.createElement("div");
      layer.id = BACKGROUND_ID;
      layer.setAttribute("aria-hidden", "true");
    }
    const mount = document.body || document.documentElement;
    if (layer.parentElement !== mount) mount.prepend(layer);
    return layer;
  }

  function isConversationSurface(candidate) {
    if (!candidate?.matches) return false;
    if (candidate.matches(".thread-scroll-container")) return true;
    return Boolean(candidate.querySelector?.(
      "textarea, [contenteditable='true'], [data-turn-key], [data-message-author-role], [data-testid*='composer'], [data-testid*='message']",
    ));
  }

  function findConversationRegion() {
    const thread = document.querySelector("#root .thread-scroll-container");
    if (thread) return thread;
    const surface = document.querySelector("#root ._MainContentSurface_1k2yc_2");
    return isConversationSurface(surface) ? surface : null;
  }

  function findTopToolbar() {
    return document.querySelector(
      "#root .top-toolbar-sm, #root [class~='top-toolbar-sm']",
    );
  }

  function syncBackgroundBounds(background) {
    const region = findConversationRegion();
    if (!region?.getBoundingClientRect) {
      document.documentElement?.setAttribute("data-codey-appearance-active", "false");
      background.style.display = "none";
      return false;
    }
    const regionRect = region.getBoundingClientRect();
    const toolbarRect = findTopToolbar()?.getBoundingClientRect?.();
    const toolbarBottom = Number.isFinite(toolbarRect?.bottom)
      ? toolbarRect.bottom
      : regionRect.top;
    const top = Math.max(regionRect.top, toolbarBottom);
    const height = Math.max(0, Math.round(regionRect.bottom - top));
    if (height <= 0 || regionRect.width <= 0) {
      document.documentElement?.setAttribute("data-codey-appearance-active", "false");
      background.style.display = "none";
      return false;
    }
    document.documentElement?.setAttribute("data-codey-appearance-active", "true");
    background.style.display = "block";
    background.style.left = `${Math.max(0, Math.round(regionRect.left))}px`;
    background.style.top = `${Math.max(0, Math.round(top))}px`;
    background.style.width = `${Math.max(0, Math.round(regionRect.width))}px`;
    background.style.height = `${height}px`;
    return true;
  }

  function observeLayout() {
    const region = findConversationRegion();
    const toolbar = findTopToolbar();
    if (typeof ResizeObserver !== "function") return;
    if (!resizeObserver) {
      resizeObserver = new ResizeObserver(() => scheduleSync());
    }
    if (region !== observedRegion) {
      if (observedRegion) resizeObserver.unobserve(observedRegion);
      observedRegion = region;
      if (region) resizeObserver.observe(region);
    }
    if (toolbar !== observedToolbar) {
      if (observedToolbar) resizeObserver.unobserve(observedToolbar);
      observedToolbar = toolbar;
      if (toolbar) resizeObserver.observe(toolbar);
    }
  }

  function scheduleSync() {
    if (syncTimer) return;
    syncTimer = window.setTimeout(() => {
      syncTimer = 0;
      const background = document.getElementById(BACKGROUND_ID);
      if (background && ownsBackground) syncBackgroundBounds(background);
      observeLayout();
    }, 50);
  }

  function scheduleDelayedSync(delay) {
    const timer = window.setTimeout(() => {
      delayedSyncTimers.delete(timer);
      scheduleSync();
    }, delay);
    delayedSyncTimers.add(timer);
  }

  function apply(nextSettings) {
    const next = normalizeSettings(nextSettings);
    const wasOwner = ownsBackground;
    settings = next;
    ownsBackground = Boolean(next.backgroundDataUrl);
    const hasExplicitSettings = hasExplicitAppearanceSettings(next);
    if (ownsBackground || hasExplicitSettings) {
      removeLegacyCustomizer();
    } else if (wasOwner) {
      // Do not let the old external watcher restore a stale image after the
      // user explicitly clears the new Codey setting.
      window.localStorage?.removeItem?.(LEGACY_STORAGE_KEY);
    }

    if (!wasOwner && !ownsBackground && !hasExplicitSettings && hasLegacyCustomizer()) {
      return snapshot();
    }

    const style = ensureStyle();
    style.textContent = `
      :root, .thread-scroll-container {
        --thread-content-max-width: ${next.chatWidth}px !important;
      }
      ${ownsBackground ? `
        html, body { background: Canvas !important; }
        #root {
          position: relative !important;
          z-index: 1 !important;
          background-color: Canvas !important;
        }
        #root .top-toolbar-sm,
        #root [class~='top-toolbar-sm'],
        #root .app-shell-left-panel,
        #root [role='complementary'],
        #root header,
        #root nav {
          background-color: Canvas !important;
        }
        html[data-codey-appearance-active="true"],
        html[data-codey-appearance-active="true"] body,
        html[data-codey-appearance-active="true"] #root {
          background-color: transparent !important;
        }
        html[data-codey-appearance-active="true"] #root ._MainContentSurface_1k2yc_2,
        html[data-codey-appearance-active="true"] #root main {
          background-color: color-mix(in srgb, Canvas ${next.surfaceOpacity}%, transparent) !important;
        }
        /* Background is visual-only; keep Codex native composer positioning untouched. */
        html[data-codey-appearance-active="true"] #root .thread-scroll-container {
          background-color: transparent !important;
        }
      ` : ""}
    `;

    const currentBackground = document.getElementById(BACKGROUND_ID);
    if (!ownsBackground) {
      document.documentElement?.setAttribute("data-codey-appearance-active", "false");
      currentBackground?.remove?.();
      observeLayout();
      return snapshot();
    }

    const background = ensureBackground();
    background.style.cssText = [
      "position:fixed",
      "inset:auto",
      "z-index:0",
      "pointer-events:none",
      "background-repeat:no-repeat",
      "background-position:center",
      "background-size:cover",
      `background-image:url(${JSON.stringify(next.backgroundDataUrl)})`,
      `opacity:${next.backgroundOpacity / 100}`,
    ].join(";");
    syncBackgroundBounds(background);
    observeLayout();
    scheduleSync();
    return snapshot();
  }

  function snapshot() {
    return {
      ready: true,
      ownsBackground,
      imageSet: Boolean(settings.backgroundDataUrl),
      backgroundOpacity: settings.backgroundOpacity,
      surfaceOpacity: settings.surfaceOpacity,
      chatWidth: settings.chatWidth,
    };
  }

  function destroy() {
    if (syncTimer) window.clearTimeout(syncTimer);
    for (const timer of delayedSyncTimers) window.clearTimeout(timer);
    delayedSyncTimers.clear();
    syncTimer = 0;
    resizeObserver?.disconnect?.();
    resizeObserver = null;
    mutationObserver?.disconnect?.();
    mutationObserver = null;
    if (configChangeHandler) window.removeEventListener?.("codey:config-changed", configChangeHandler);
    if (resizeHandler) window.removeEventListener?.("resize", resizeHandler);
    configChangeHandler = null;
    resizeHandler = null;
    document.getElementById(BACKGROUND_ID)?.remove?.();
    document.getElementById(STYLE_ID)?.remove?.();
    removeStaleAppearanceButton();
    document.documentElement?.removeAttribute?.("data-codey-appearance-active");
  }

  window.__codeyCodexAppearance = {
    version: VERSION,
    builtIn: true,
    get ownsBackground() {
      return ownsBackground;
    },
    apply,
    destroy,
    snapshot,
    tick() {
      apply(settings);
      return { ok: true, snapshot: snapshot() };
    },
  };

  configChangeHandler = (event) => {
    const config = event?.detail?.config || event?.detail;
    if (config?.codexAppearance) apply(config.codexAppearance);
  };
  window.addEventListener?.("codey:config-changed", configChangeHandler);
  resizeHandler = scheduleSync;
  window.addEventListener?.("resize", resizeHandler, { passive: true });
  if (document.documentElement && typeof MutationObserver === "function") {
    mutationObserver = new MutationObserver(() => {
      if (!observedRegion?.isConnected || !observedToolbar?.isConnected) scheduleSync();
    });
    mutationObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  apply(settings);
  for (const delay of [100, 500, 1500, 3000]) scheduleDelayedSync(delay);
})();
