  /* =====================================================================
   * 3. Canvas / 视口 / 星空背景
   * ===================================================================*/
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const view = { w: 0, h: 0, dpr: 1, scale: 1 };
  // 世界坐标尺寸与相机（世界远大于视口）
  const world = { w: 2400, h: 1600 };
  const camera = { x: 0, y: 0 };
  // 视口剔除范围（世界坐标），降低后期对象增多时的绘制量
  const cull = { x0: 0, y0: 0, x1: 0, y1: 0 };
  let bgGrad = null;
  let vgGrad = null;
  let stars = [];
  let nebula = null;

  // ===== 自适应分辨率：后期对象多时自动降低内部渲染倍率，保证帧率 =====
  let renderScale = 1;          // 1 = 设备像素比全开
  let perfAcc = 0;              // 采样窗口累计时长
  let perfFrames = 0;           // 窗口内帧数
  let perfGoodTime = 0;         // 持续流畅时长
  let qualityCd = 0;            // 调档冷却
  let coopAutoLowFx = false;    // 联机低帧率时已自动开启省电特效
  let idleRenderAcc = 0;        // 非游戏状态下的低帧率绘制累计

  function targetDpr() {
    const raw = Math.min(window.devicePixelRatio || 1, 2);
    // Canvas 像素预算：大屏 + 高 DPR 时避免生成上千万像素的画布
    const cssPixels = Math.max(1, window.innerWidth * window.innerHeight);
    const budget = Math.sqrt(2800000 / cssPixels);
    return Math.max(0.55, Math.min(raw, budget) * renderScale);
  }

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = targetDpr();
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    view.w = w;
    view.h = h;
    view.dpr = dpr;
    // 移动端：按最短边缩放速度与范围，保证手感一致
    view.scale = clamp(Math.min(w, h) / 860, 0.62, 1.1);

    // 战场尺寸：明显大于视口，由相机跟随滚动
    world.w = Math.round(Math.max(w, 960) * CFG.WORLD.WIDTH_FACTOR);
    world.h = Math.round(Math.max(h, 720) * CFG.WORLD.HEIGHT_FACTOR);

    // 背景渐变与霓虹星云随涂装重建
    rebuildBackdrop(w, h);

    // 暗角渐变缓存，避免每帧创建
    vgGrad = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
    vgGrad.addColorStop(0, "rgba(0,0,0,0)");
    vgGrad.addColorStop(1, "rgba(0,0,0,0.55)");

    const count = Math.min(170, Math.round((w * h) / 9000));
    stars = new Array(count);
    for (let i = 0; i < count; i++) {
      stars[i] = {
        x: Math.random() * w,
        y: Math.random() * h,
        r: rand(0.4, 1.7),
        sp: rand(3, 14),
        ph: Math.random() * TAU,
        a: rand(0.25, 0.85),
      };
    }

    if (player) {
      player.x = clamp(player.x, player.r + 2, world.w - player.r - 2);
      player.y = clamp(player.y, player.r + 2, world.h - player.r - 2);
      snapCamera();
    }
  }

  // 霓虹星云背景（半分辨率离屏缓存，切涂装时重建）
  function rebuildBackdrop(w, h) {
    w = w || view.w || window.innerWidth;
    h = h || view.h || window.innerHeight;
    bgGrad = ctx.createLinearGradient(0, 0, 0, h);
    bgGrad.addColorStop(0, THEME.bgTop);
    bgGrad.addColorStop(0.55, THEME.bgMid);
    bgGrad.addColorStop(1, THEME.bgBottom);

    const pad = 150;
    const W = w + pad * 2;
    const H = h + pad * 2;
    const sc = 0.5;
    nebula = document.createElement("canvas");
    nebula.width = Math.max(1, Math.round(W * sc));
    nebula.height = Math.max(1, Math.round(H * sc));
    const nc = nebula.getContext("2d");
    nc.scale(sc, sc);
    nc.globalCompositeOperation = "lighter";
    const blobs = [
      { x: 0.16, y: 0.22, r: 0.62, c: 0 },
      { x: 0.84, y: 0.16, r: 0.55, c: 1 },
      { x: 0.62, y: 0.74, r: 0.66, c: 2 },
      { x: 0.12, y: 0.88, r: 0.48, c: 3 },
      { x: 0.92, y: 0.92, r: 0.42, c: 0 },
    ];
    for (const b of blobs) {
      const g = nc.createRadialGradient(b.x * W, b.y * H, 0, b.x * W, b.y * H, b.r * Math.max(W, H));
      g.addColorStop(0, THEME.nebula[b.c]);
      g.addColorStop(0.55, THEME.nebula[b.c].replace(/0\.\d+\)$/, "0.10)"));
      g.addColorStop(1, "rgba(0,0,0,0)");
      nc.fillStyle = g;
      nc.fillRect(0, 0, W, H);
    }
  }

  // 相机对齐到本地玩家并限制在世界范围内
  function snapCamera() {
    const me = getLocalPlayer() || player;
    camera.x = clamp(me.x - view.w / 2, 0, Math.max(0, world.w - view.w));
    camera.y = clamp(me.y - view.h / 2, 0, Math.max(0, world.h - view.h));
  }

  function updateCamera(dt) {
    let me = getLocalPlayer() || player;
    // 联机倒地观战（P4-06）：跟随最近的可行动队友
    if (roomCode && me && (me.down || me.eliminated)) {
      let best = null;
      let bd = Infinity;
      for (let i = 0; i < players.length; i++) {
        const q = players[i];
        if (q === me || q.down || q.eliminated) continue;
        const d = dist2(me.x, me.y, q.x, q.y);
        if (d < bd) { bd = d; best = q; }
      }
      if (best) me = best;
    }
    const tx = clamp(me.x - view.w / 2, 0, Math.max(0, world.w - view.w));
    const ty = clamp(me.y - view.h / 2, 0, Math.max(0, world.h - view.h));
    const k = Math.min(1, dt * CFG.WORLD.CAMERA_SMOOTH);
    camera.x += (tx - camera.x) * k;
    camera.y += (ty - camera.y) * k;
  }

  function updateStars(dt, t) {
    if (state === "playing") {
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];
        s.y += s.sp * dt * 0.35;
        if (s.y > view.h + 2) { s.y = -2; s.x = Math.random() * view.w; }
      }
    }
  }

