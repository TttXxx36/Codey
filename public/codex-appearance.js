(() => {
  const VERSION = 1;
  const initialSettings = __CODEY_CODEX_APPEARANCE_SETTINGS__;
  const BACKGROUND_ID = "codey-codex-appearance-background";
  const STYLE_ID = "codey-codex-appearance-style";
  const BUTTON_ID = "codey-codex-appearance-button";
  const BUTTON_STYLE_ID = "codey-codex-appearance-button-style";
  const BUTTON_WRAPPER_CLASS = "codey-codex-appearance-action";
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
  let appearanceObserverTimer = 0;
  const delayedSyncTimers = new Set();
  let appearanceMountDirty = true;
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

  function ensureButtonStyle() {
    let style = document.getElementById(BUTTON_STYLE_ID);
    if (!(style instanceof HTMLStyleElement)) {
      style = document.createElement("style");
      style.id = BUTTON_STYLE_ID;
      style.textContent = `
        .${BUTTON_WRAPPER_CLASS} { -webkit-app-region: no-drag !important; pointer-events: auto !important; display: flex; flex: 0 0 auto; align-items: center; }
        #${BUTTON_ID} { -webkit-app-region: no-drag !important; pointer-events: auto !important; position: relative; z-index: 2147483642; display: inline-grid; place-items: center; width: 28px; height: 28px; flex: 0 0 auto; border: 0; border-radius: 7px; padding: 0; background: transparent; color: inherit; cursor: pointer; opacity: .86; user-select: none; transition: background .15s ease, opacity .15s ease, transform .15s ease; }
        #${BUTTON_ID}:hover { background: rgba(127, 127, 127, .16); opacity: 1; }
        #${BUTTON_ID}:active { transform: translateY(1px); }
        #${BUTTON_ID}:focus-visible { outline: 2px solid rgba(139, 151, 255, .72); outline-offset: 2px; }
        #${BUTTON_ID} svg { display: block; width: 17px; height: 17px; }
      `;
      document.documentElement?.appendChild(style);
    }
    return style;
  }

  const appearanceIcon = `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 7h10M18 7h2M4 12h2M10 12h10M4 17h10M18 17h2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path>
      <circle cx="16" cy="7" r="2" fill="Canvas" stroke="currentColor" stroke-width="1.8"></circle>
      <circle cx="8" cy="12" r="2" fill="Canvas" stroke="currentColor" stroke-width="1.8"></circle>
      <circle cx="16" cy="17" r="2" fill="Canvas" stroke="currentColor" stroke-width="1.8"></circle>
    </svg>
  `;

  function findHeaderShareMount() {
    const share = [...document.querySelectorAll("button")].find((candidate) => {
      const label = candidate.getAttribute("aria-label") || "";
      return /^(分享|Share)$/i.test(label);
    });
    if (!share) return null;
    let child = share;
    while (child.parentElement) {
      const parent = child.parentElement;
      const className = typeof parent.className === "string" ? parent.className : "";
      if (/\bms-auto\b/.test(className)) {
        return { target: parent, before: child.nextElementSibling };
      }
      child = parent;
    }
    return null;
  }

  function findFallbackButtonMount() {
    const existingCodeyButton = document.getElementById("codey-settings-button");
    if (!(existingCodeyButton instanceof HTMLElement)) return null;
    const header = existingCodeyButton.closest("header, nav");
    if (!(header instanceof HTMLElement)) return null;
    let child = existingCodeyButton;
    while (child.parentElement && child.parentElement !== header) child = child.parentElement;
    return { target: header, before: child };
  }

  function scheduleAppearanceButtonSync() {
    appearanceMountDirty = true;
    if (appearanceObserverTimer) return;
    appearanceObserverTimer = window.setTimeout(() => {
      appearanceObserverTimer = 0;
      if (!appearanceMountDirty) return;
      appearanceMountDirty = false;
      ensureAppearanceButton();
    }, 80);
  }

  function ensureAppearanceButton() {
    if (!ownsBackground && hasLegacyCustomizer()) return false;
    if (!appearanceMountDirty) {
      const current = document.getElementById(BUTTON_ID);
      const wrapper = current?.parentElement;
      if (current instanceof HTMLButtonElement
        && current.isConnected
        && wrapper instanceof HTMLElement
        && wrapper.classList.contains(BUTTON_WRAPPER_CLASS)
        && wrapper.nextElementSibling === current.__codeyAppearanceAnchor) {
        return true;
      }
      appearanceMountDirty = true;
    }
    ensureButtonStyle();
    const mount = findHeaderShareMount() || findFallbackButtonMount();
    let button = document.getElementById(BUTTON_ID);
    if (!mount) {
      button?.parentElement?.remove?.();
      appearanceMountDirty = true;
      return false;
    }
    let wrapper = button?.parentElement;
    if (!(wrapper instanceof HTMLElement) || !wrapper.classList.contains(BUTTON_WRAPPER_CLASS)) {
      wrapper = document.createElement("div");
      wrapper.className = BUTTON_WRAPPER_CLASS;
    }
    if (!(button instanceof HTMLButtonElement)) {
      button = document.createElement("button");
      button.id = BUTTON_ID;
      button.type = "button";
      button.setAttribute("aria-label", "调整 Codex 外观");
      button.title = "调整 Codex 背景、对话宽度和遮罩";
      button.innerHTML = appearanceIcon;
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (typeof window.__codeySettingsOverlay?.toggle === "function") {
          window.__codeySettingsOverlay.toggle();
        } else {
          document.getElementById("codey-settings-button")?.click?.();
        }
      }, true);
    }
    if (button.parentElement !== wrapper) wrapper.appendChild(button);
    if (wrapper.parentElement !== mount.target || wrapper.nextElementSibling !== mount.before) {
      mount.target.insertBefore(wrapper, mount.before || null);
    }
    button.__codeyAppearanceAnchor = mount.before || null;
    appearanceMountDirty = false;
    return true;
  }

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
      scheduleAppearanceButtonSync();
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
      ensureAppearanceButton();
      return snapshot();
    }

    const style = ensureStyle();
    const threadSurfaceOpacity = Math.max(0, next.surfaceOpacity - 12);
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
        html[data-codey-appearance-active="true"] #root .thread-scroll-container {
          position: relative !important;
          background-color: color-mix(in srgb, Canvas ${threadSurfaceOpacity}%, transparent) !important;
        }
      ` : ""}
    `;

    const currentBackground = document.getElementById(BACKGROUND_ID);
    if (!ownsBackground) {
      document.documentElement?.setAttribute("data-codey-appearance-active", "false");
      currentBackground?.remove?.();
      observeLayout();
      ensureAppearanceButton();
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
    ensureAppearanceButton();
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
    if (appearanceObserverTimer) window.clearTimeout(appearanceObserverTimer);
    for (const timer of delayedSyncTimers) window.clearTimeout(timer);
    delayedSyncTimers.clear();
    appearanceObserverTimer = 0;
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
    document.getElementById(BUTTON_ID)?.parentElement?.remove?.();
    document.getElementById(BUTTON_STYLE_ID)?.remove?.();
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
  const mutationTouchesAppearanceMount = (mutation) => {
    const target = mutation?.target;
    if (target instanceof Element
      && (target.matches("header, nav") || target.closest("header, nav"))) return true;
    for (const node of [
      ...(mutation?.addedNodes || []),
      ...(mutation?.removedNodes || []),
    ]) {
      if (!(node instanceof Element)) continue;
      if (node.matches("header, nav, button[aria-label='Share'], button[aria-label='分享']")
        || node.querySelector?.("header, nav, button[aria-label='Share'], button[aria-label='分享']")) {
        return true;
      }
    }
    return false;
  };

  if (document.documentElement && typeof MutationObserver === "function") {
    mutationObserver = new MutationObserver((mutations) => {
      if (mutations.some(mutationTouchesAppearanceMount)) {
        scheduleAppearanceButtonSync();
      }
      if (!observedRegion?.isConnected || !observedToolbar?.isConnected) scheduleSync();
    });
    mutationObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  apply(settings);
  ensureAppearanceButton();
  for (const delay of [100, 500, 1500, 3000]) scheduleDelayedSync(delay);
})();
