  /* =====================================================================
   * 7. 输入
   * ===================================================================*/
  const keys = Object.create(null);

  function clearKeys() {
    for (const k in keys) delete keys[k];
  }

  window.addEventListener("keydown", (e) => {
    const code = e.code;
    if (code === "Space" || code === "ArrowUp" || code === "ArrowDown" || code === "ArrowLeft" || code === "ArrowRight") {
      e.preventDefault();
    }
    if (e.repeat) { keys[code] = true; return; }
    keys[code] = true;

    if (code === "Escape") {
      if (state === "shop") closeShop();
      else if (state === "build") closeBuildMenu();
      else if (state === "trader") closeTrader();
      else if (!document.getElementById("ov-meta").classList.contains("hidden")) closeMeta();
      else if (!document.getElementById("ov-theme").classList.contains("hidden")) document.getElementById("ov-theme").classList.add("hidden");
      else if (state === "playing" && buildMode) { buildMode = null; refreshHud(true); }
      else if (state === "playing" || state === "paused") togglePause();
      return;
    }
    if (state === "upgrade") {
      const pick = /^(?:Digit|Numpad)([1-3])$/.exec(code);
      if (pick) { chooseUpgrade(Number(pick[1]) - 1); return; }
    }
    if (code === "KeyT") { cycleTheme(); return; }
    if (code === "KeyB") {
      if (state === "playing") openBuildMenu();
      return;
    }
    if (code === "KeyE") {
      if (state === "playing") activateUltimate();
      return;
    }
    if (code === "Space" || code === "ShiftLeft" || code === "ShiftRight") {
      if (state === "menu") { openWeaponSelect(); return; }
      if (state === "playing") { tryDash(); return; }
    }
    if (code === "Enter" && state === "menu") openWeaponSelect();
  });

  window.addEventListener("keyup", (e) => {
    delete keys[e.code];
  });

  window.addEventListener("blur", () => {
    clearKeys();
    if (state === "playing") togglePause();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      clearKeys();
      if (state === "playing") togglePause();
    }
  });

