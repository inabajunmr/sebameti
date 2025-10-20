(function () {
  if (window.__windowWidthSliderInitialized) {
    return;
  }
  window.__windowWidthSliderInitialized = true;

  const STYLE_ID = "cwws-style";
  const OVERLAY_ID = "cwws-overlay";
  const LAYOUT_CLASS = "cwws-adjusted";
  const MIN_CONTENT_WIDTH = 320;
  const STORAGE_KEY = "cwws-layout";
  const SAVE_DEBOUNCE_MS = 150;

  let overlayElement = null;
  let dragState = null;
  let saveTimeoutId = null;

  const layoutState = {
    paddingLeft: 0,
    paddingRight: 0,
    originalPaddingLeft: null,
    originalPaddingRight: null,
    active: false,
  };

  function scheduleLayoutSave(force = false) {
    if (
      typeof chrome === "undefined" ||
      !chrome.storage ||
      !chrome.storage.local ||
      typeof chrome.storage.local.set !== "function"
    ) {
      return;
    }

    const persist = () => {
      chrome.storage.local.set(
        {
          [STORAGE_KEY]: {
            paddingLeft: layoutState.paddingLeft,
            paddingRight: layoutState.paddingRight,
            active: layoutState.active,
          },
        },
        () => {
          if (chrome.runtime && chrome.runtime.lastError) {
            // Ignore storage write failures.
          }
        }
      );
    };

    if (force) {
      if (saveTimeoutId !== null) {
        clearTimeout(saveTimeoutId);
        saveTimeoutId = null;
      }
      persist();
      return;
    }

    if (saveTimeoutId !== null) {
      return;
    }

    saveTimeoutId = window.setTimeout(() => {
      saveTimeoutId = null;
      persist();
    }, SAVE_DEBOUNCE_MS);
  }

  function deactivateLayout() {
    if (!layoutState.active) {
      return;
    }

    const body = document.body;
    if (body) {
      body.style.paddingLeft =
        layoutState.originalPaddingLeft !== null
          ? layoutState.originalPaddingLeft
          : body.style.paddingLeft;
      body.style.paddingRight =
        layoutState.originalPaddingRight !== null
          ? layoutState.originalPaddingRight
          : body.style.paddingRight;
    }

    const root = document.documentElement;
    root.classList.remove(LAYOUT_CLASS);
    root.style.removeProperty("--cwws-padding-left");
    root.style.removeProperty("--cwws-padding-right");

    layoutState.originalPaddingLeft = null;
    layoutState.originalPaddingRight = null;
    layoutState.active = false;
    scheduleLayoutSave(true);
  }

  function activateOverlay() {
    const apply = () => {
      if (!ensureLayoutActive()) {
        return false;
      }

      if (!overlayElement) {
        createOverlay();
      }

      overlayElement.classList.remove("hidden");
      scheduleLayoutSave(true);
      return true;
    };

    if (!apply()) {
      const onReady = () => {
        document.removeEventListener("DOMContentLoaded", onReady);
        apply();
      };
      document.addEventListener("DOMContentLoaded", onReady, { once: true });
    }
  }

  function initializeFromStorage() {
    if (
      typeof chrome === "undefined" ||
      !chrome.storage ||
      !chrome.storage.local ||
      typeof chrome.storage.local.get !== "function"
    ) {
      return;
    }

    chrome.storage.local.get(STORAGE_KEY, (result) => {
      if (chrome.runtime && chrome.runtime.lastError) {
        return;
      }

      const saved = result && result[STORAGE_KEY];
      if (!saved || typeof saved !== "object") {
        return;
      }

      const left = Number(saved.paddingLeft);
      const right = Number(saved.paddingRight);

      if (Number.isFinite(left)) {
        layoutState.paddingLeft = Math.max(0, left);
      }
      if (Number.isFinite(right)) {
        layoutState.paddingRight = Math.max(0, right);
      }

      if (saved.active) {
        activateOverlay();
      }
    });
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${OVERLAY_ID} {
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 2147483647;
      }

      #${OVERLAY_ID}.hidden {
        display: none;
      }

      .cwws-handle {
        position: absolute;
        top: 0;
        bottom: 0;
        width: 16px;
        background: rgba(0, 0, 0, 0.05);
        backdrop-filter: blur(2px);
        border: 1px solid rgba(0, 0, 0, 0.15);
        pointer-events: auto;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: ew-resize;
        transition: background 0.2s ease;
      }

      .cwws-handle[data-side="left"] {
        transform: translateX(-50%);
      }

      .cwws-handle[data-side="right"] {
        transform: translateX(50%);
      }

      .cwws-handle:hover {
        background: rgba(66, 133, 244, 0.2);
      }

      .cwws-handle:active {
        background: rgba(66, 133, 244, 0.35);
      }

      .cwws-grip {
        width: 4px;
        height: 64px;
        border-radius: 2px;
        background: rgba(66, 133, 244, 0.6);
      }

      html.${LAYOUT_CLASS} body {
        box-sizing: border-box !important;
        padding-left: var(--cwws-padding-left, 0px) !important;
        padding-right: var(--cwws-padding-right, 0px) !important;
        transition: padding 0.12s ease;
      }
    `;

    document.head.appendChild(style);
  }

  function ensureLayoutActive() {
    const body = document.body;
    if (!body) {
      return false;
    }

    if (!layoutState.active) {
      if (layoutState.originalPaddingLeft === null) {
        layoutState.originalPaddingLeft = body.style.paddingLeft || "";
      }
      if (layoutState.originalPaddingRight === null) {
        layoutState.originalPaddingRight = body.style.paddingRight || "";
      }
      document.documentElement.classList.add(LAYOUT_CLASS);
      layoutState.active = true;
      applyLayout(layoutState.paddingLeft, layoutState.paddingRight);
    }

    return true;
  }

  function applyLayout(paddingLeft, paddingRight) {
    let nextPaddingLeft = Math.max(0, paddingLeft);
    let nextPaddingRight = Math.max(0, paddingRight);

    const viewportWidth =
      document.documentElement.clientWidth || window.innerWidth || 0;
    if (viewportWidth > 0) {
      const maxPaddingTotal = Math.max(viewportWidth - MIN_CONTENT_WIDTH, 0);
      const totalPadding = nextPaddingLeft + nextPaddingRight;
      if (totalPadding > maxPaddingTotal) {
        if (totalPadding > 0) {
          const scale = maxPaddingTotal / totalPadding;
          nextPaddingLeft *= scale;
          nextPaddingRight *= scale;
        } else {
          nextPaddingLeft = 0;
          nextPaddingRight = 0;
        }
      }
    }

    layoutState.paddingLeft = nextPaddingLeft;
    layoutState.paddingRight = nextPaddingRight;

    const root = document.documentElement;
    root.style.setProperty(
      "--cwws-padding-left",
      `${Math.round(layoutState.paddingLeft)}px`
    );
    root.style.setProperty(
      "--cwws-padding-right",
      `${Math.round(layoutState.paddingRight)}px`
    );

    updateHandlePositions();

    if (layoutState.active) {
      scheduleLayoutSave();
    }
  }

  function createOverlay() {
    ensureStyles();

    overlayElement = document.createElement("div");
    overlayElement.id = OVERLAY_ID;
    overlayElement.classList.add("hidden");

    const leftHandle = buildHandle("left");
    const rightHandle = buildHandle("right");

    overlayElement.append(leftHandle, rightHandle);
    document.documentElement.appendChild(overlayElement);

    updateHandlePositions();
  }

  function buildHandle(side) {
    const handle = document.createElement("div");
    handle.className = "cwws-handle";
    handle.dataset.side = side;

    const grip = document.createElement("div");
    grip.className = "cwws-grip";
    handle.appendChild(grip);

    handle.addEventListener("pointerdown", (event) => startDrag(event, side));
    handle.addEventListener("dblclick", (event) => {
      event.preventDefault();
      if (!ensureLayoutActive()) {
        return;
      }
      if (side === "left") {
        applyLayout(0, layoutState.paddingRight);
      } else {
        applyLayout(layoutState.paddingLeft, 0);
      }
    });

    return handle;
  }

  function updateHandlePositions() {
    if (!overlayElement) {
      return;
    }

    const leftHandle = overlayElement.querySelector(
      '.cwws-handle[data-side="left"]'
    );
    const rightHandle = overlayElement.querySelector(
      '.cwws-handle[data-side="right"]'
    );

    if (leftHandle) {
      leftHandle.style.left = `${Math.round(layoutState.paddingLeft)}px`;
    }
    if (rightHandle) {
      rightHandle.style.right = `${Math.round(layoutState.paddingRight)}px`;
    }
  }

  function toggleOverlay() {
    if (layoutState.active) {
      if (overlayElement) {
        overlayElement.classList.add("hidden");
      }
      stopDrag();
      deactivateLayout();
    } else {
      activateOverlay();
    }
  }

  function startDrag(event, side) {
    event.preventDefault();

    if (!overlayElement || !ensureLayoutActive()) {
      return;
    }

    const pointerId = event.pointerId;
    const handle = event.currentTarget;
    handle.setPointerCapture(pointerId);

    dragState = {
      pointerId,
      handle,
      side,
      startClientX: event.clientX,
      initialPaddingLeft: layoutState.paddingLeft,
      initialPaddingRight: layoutState.paddingRight,
      pendingUpdate: null,
      frameRequested: false,
    };

    document.addEventListener("pointermove", handlePointerMove);
    document.addEventListener("pointerup", handlePointerUp);
  }

  function handlePointerMove(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) {
      return;
    }

    const viewportWidth =
      document.documentElement.clientWidth || window.innerWidth || 0;
    if (viewportWidth <= 0) {
      return;
    }

    const deltaX = event.clientX - dragState.startClientX;

    let newPaddingLeft = dragState.initialPaddingLeft;
    let newPaddingRight = dragState.initialPaddingRight;

    if (dragState.side === "right") {
      newPaddingRight = dragState.initialPaddingRight - deltaX;
    } else {
      newPaddingLeft = dragState.initialPaddingLeft + deltaX;
    }

    newPaddingLeft = Math.max(0, newPaddingLeft);
    newPaddingRight = Math.max(0, newPaddingRight);

    const maxPaddingTotal = Math.max(viewportWidth - MIN_CONTENT_WIDTH, 0);
    const totalPadding = newPaddingLeft + newPaddingRight;
    if (totalPadding > maxPaddingTotal) {
      const excess = totalPadding - maxPaddingTotal;
      if (dragState.side === "left") {
        newPaddingLeft = Math.max(0, newPaddingLeft - excess);
      } else {
        newPaddingRight = Math.max(0, newPaddingRight - excess);
      }
    }

    dragState.pendingUpdate = {
      left: newPaddingLeft,
      right: newPaddingRight,
    };

    if (!dragState.frameRequested) {
      dragState.frameRequested = true;
      requestAnimationFrame(flushLayoutUpdate);
    }
  }

  function flushLayoutUpdate() {
    if (!dragState || !dragState.pendingUpdate) {
      if (dragState) {
        dragState.frameRequested = false;
      }
      return;
    }

    const { left, right } = dragState.pendingUpdate;
    dragState.pendingUpdate = null;
    dragState.frameRequested = false;

    applyLayout(left, right);
  }

  function handlePointerUp(event) {
    if (dragState && event.pointerId === dragState.pointerId) {
      stopDrag();
      if (layoutState.active) {
        scheduleLayoutSave(true);
      }
    }
  }

  function stopDrag() {
    if (!dragState) {
      return;
    }

    try {
      dragState.handle?.releasePointerCapture?.(dragState.pointerId);
    } catch (error) {
      // Ignore errors triggered when the pointer capture has already been released.
    }

    document.removeEventListener("pointermove", handlePointerMove);
    document.removeEventListener("pointerup", handlePointerUp);

    dragState = null;
  }

  initializeFromStorage();

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "toggle-ui") {
      toggleOverlay();
    }
  });
})();
