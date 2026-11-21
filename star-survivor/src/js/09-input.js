  /* =====================================================================
   * 7. 输入
   * ===================================================================*/
  const keys = Object.create(null);

  // 统一输入意图：键鼠 / 触屏都写入同一结构；联机时可直接序列化发送
  // mx,my 归一化移动向量；fire 开火；dash/ult 本帧一次性请求；aim 瞄准角（null = 自动索敌）
  const intent = { mx: 0, my: 0, fire: false, dash: false, ult: false, aim: null };

  // 汇总当前帧移动 / 开火意图，由 simulate 每帧调用
  function pollInputIntent() {
    let x = 0, y = 0;
    if (keys.KeyA || keys.ArrowLeft) x -= 1;
    if (keys.KeyD || keys.ArrowRight) x += 1;
    if (keys.KeyW || keys.ArrowUp) y -= 1;
    if (keys.KeyS || keys.ArrowDown) y += 1;
    if (touchVec.active) { x += touchVec.x; y += touchVec.y; }
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    intent.mx = x;
    intent.my = y;
    intent.fire = state === "playing";   // 当前玩法为自动开火
    return intent;
  }

  function clearKeys() {
    for (const k in keys) delete keys[k];
    intent.mx = 0;
    intent.my = 0;
    intent.fire = false;
    intent.dash = false;
    intent.ult = false;
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
      if (state === "playing") intent.ult = true;
      return;
    }
    if (code === "Space" || code === "ShiftLeft" || code === "ShiftRight") {
      if (state === "menu") { openWeaponSelect(); return; }
      if (state === "playing") { intent.dash = true; return; }
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

