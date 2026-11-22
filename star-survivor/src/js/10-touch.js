  /* =====================================================================
   * 8. 移动端输入（虚拟摇杆 / 按钮）
   * ===================================================================*/
  const touchVec = { x: 0, y: 0, active: false };
  let joyPointer = null;

  function setupTouch() {
    const joystick = document.getElementById("joystick");
    const knob = document.getElementById("knob");
    const dashBtn = document.getElementById("dash-btn");
    const pauseBtn = document.getElementById("pause-btn");
    const ultBtn = document.getElementById("ult-btn");

    const RADIUS = 46;

    function updateStick(e) {
      const rect = joystick.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      let dx = e.clientX - cx;
      let dy = e.clientY - cy;
      const len = Math.hypot(dx, dy);
      if (len > RADIUS) { dx = (dx / len) * RADIUS; dy = (dy / len) * RADIUS; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const nl = Math.hypot(dx, dy);
      if (nl > 8) {
        touchVec.x = dx / nl;
        touchVec.y = dy / nl;
        touchVec.active = true;
      } else {
        touchVec.x = 0;
        touchVec.y = 0;
        touchVec.active = false;
      }
    }

    joystick.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      joyPointer = e.pointerId;
      joystick.setPointerCapture(e.pointerId);
      updateStick(e);
    });
    joystick.addEventListener("pointermove", (e) => {
      if (joyPointer !== e.pointerId) return;
      e.preventDefault();
      updateStick(e);
    });
    const endJoy = (e) => {
      if (joyPointer !== e.pointerId) return;
      joyPointer = null;
      touchVec.x = 0;
      touchVec.y = 0;
      touchVec.active = false;
      knob.style.transform = "translate(0, 0)";
    };
    joystick.addEventListener("pointerup", endJoy);
    joystick.addEventListener("pointercancel", endJoy);

    dashBtn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      if (state === "playing") intent.dash = true;
    });
    ultBtn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      if (state === "playing") intent.ult = true;
    });
    pauseBtn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      if (state === "playing" || state === "paused") togglePause();
    });

    // 触屏设备显示虚拟控件
    if (window.matchMedia("(pointer: coarse)").matches || "ontouchstart" in window) {
      document.body.classList.add("touch");
    }
  }

  // 鼠标 / 触摸点击升级卡片由事件委托处理
  document.getElementById("cards").addEventListener("click", (e) => {
    const btn = e.target.closest(".card");
    if (!btn) return;
    const idx = Number(btn.dataset.i);
    chooseUpgrade(idx);
  });

  // 菜单 / 暂停 / 结算 / 商店 / 建造按钮
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === "start") openWeaponSelect();
    else if (act === "resume") togglePause();
    else if (act === "restart") startGame();
    else if (act === "shop-close") closeShop();
    else if (act === "build-cancel") closeBuildMenu();
    else if (act === "trader-close") closeTrader();
    else if (act === "meta") openMeta();
    else if (act === "meta-close") closeMeta();
    else if (act === "theme") openTheme();
    else if (act === "theme-close") document.getElementById("ov-theme").classList.add("hidden");
    else if (act === "coop-copy") copyRoom();
    else if (act === "coop-connect") connectCoop();
    else if (act === "coop-new") newRoom();
    else if (act === "coop-retry") coopRetry();
    else if (act === "coop-back") coopBackToMenu();
  });

  // 成长档案购买
  document.getElementById("meta-items").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-meta]");
    if (btn && !btn.disabled) buyMeta(btn.dataset.meta);
  });

  // 星际游商交易
  document.getElementById("trader-items").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-trade]");
    if (btn && !btn.disabled) buyTrade(Number(btn.dataset.trade));
  });

  // 星港购买
  document.getElementById("shop-items").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-shop]");
    if (btn && !btn.disabled) buyShopItem(btn.dataset.shop);
  });

  // 建造类型选择
  document.getElementById("build-items").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-build]");
    if (btn && !btn.disabled) chooseBuild(btn.dataset.build);
  });
  document.getElementById("build-btn").addEventListener("click", (e) => {
    e.preventDefault();
    if (state === "playing") openBuildMenu();
  });

  // 建造模式：点击战场放置
  canvas.addEventListener("pointerdown", (e) => {
    if (state !== "playing" || !buildMode) return;
    const rect = canvas.getBoundingClientRect();
    const wx = clamp(camera.x + (e.clientX - rect.left), 30, world.w - 30);
    const wy = clamp(camera.y + (e.clientY - rect.top), 30, world.h - 30);
    placeDefense(buildMode, wx, wy);
  });

  // 涂装面板
  function buildThemeGrid() {
    const grid = document.getElementById("theme-grid");
    if (grid.dataset.built) return;
    grid.innerHTML = Object.keys(THEMES).map((key) => {
      const th = THEMES[key];
      return `<button class="theme-card" data-theme="${key}">
        <b>${th.name}</b><small>${th.desc}</small>
        <span class="theme-dots">
          <i style="background:${th.cyan};box-shadow:0 0 8px ${th.cyan}"></i>
          <i style="background:${th.magenta};box-shadow:0 0 8px ${th.magenta}"></i>
          <i style="background:${th.violet};box-shadow:0 0 8px ${th.violet}"></i>
        </span>
      </button>`;
    }).join("");
    grid.dataset.built = "1";
    grid.addEventListener("click", (e) => {
      const b = e.target.closest("[data-theme]");
      if (b) applyTheme(b.dataset.theme);
    });
    grid.querySelectorAll("[data-theme]").forEach((el) => {
      el.classList.toggle("active", el.dataset.theme === themeKey);
    });
  }

  function openTheme() {
    buildThemeGrid();
    document.getElementById("ov-theme").classList.remove("hidden");
  }

  function cycleTheme() {
    const keys = Object.keys(THEMES);
    applyTheme(keys[(keys.indexOf(themeKey) + 1) % keys.length]);
  }

  // 开局武器选择
  function openWeaponSelect() {
    document.getElementById("ov-menu").classList.add("hidden");
    document.getElementById("ov-weapon").classList.remove("hidden");
    document.getElementById("ov-weapon").scrollTop = 0;
  }

  document.getElementById("weapon-cards").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-weapon]");
    if (btn) startGame(btn.dataset.weapon);
  });

  // 特效档位：流畅模式减少辉光与粒子，降低手机发热
  function applyFxLabel() {
    const el = document.getElementById("fx-btn");
    el.textContent = lowFx ? "省电" : "特效";
    el.classList.toggle("off", lowFx);
  }
  document.getElementById("fx-btn").addEventListener("click", () => {
    lowFx = !lowFx;
    try { localStorage.setItem("sf_lowfx", lowFx ? "1" : "0"); } catch (e) {}
    applyFxLabel();
  });
  applyFxLabel();

  // 静音开关
  document.getElementById("mute").addEventListener("click", () => {
    audio.muted = !audio.muted;
    if (audio.master) {
      audio.master.gain.value = audio.muted ? 0 : CFG.AUDIO.MASTER;
    }
    const el = document.getElementById("mute");
    el.textContent = audio.muted ? "🔇" : "🔊";
    el.classList.toggle("off", audio.muted);
  });

