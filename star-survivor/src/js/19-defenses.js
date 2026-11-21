  /* =====================================================================
   * 15.7 无尽远航：星港 / 能量核心与防线
   * ===================================================================*/
  const SHOP_ITEMS = [
    {
      id: "repair", icon: "✚", name: "舰体修复", base: 35,
      desc: () => "立即恢复 45% 最大生命",
      can: () => player.hp < player.hpMax - 1,
      apply: () => { player.hp = Math.min(player.hpMax, player.hp + player.hpMax * 0.45); },
    },
    {
      id: "shield", icon: "◈", name: "护盾电池", base: 40,
      desc: () => "护盾上限 +12 并立即充满",
      can: () => true,
      apply: () => { stats.shieldMax += 12; player.shield = stats.shieldMax; },
    },
    {
      id: "damage", icon: "↑", name: "武器校准", base: 55,
      desc: () => "全武器伤害 +12%",
      can: () => true,
      apply: () => { stats.damage *= 1.12; },
    },
    {
      id: "drone", icon: "⬢", name: "无人机模块", base: 60,
      desc: () => "增加 1 架环绕守护无人机",
      can: () => (stats.drones || 0) < CFG.DRONES.MAX,
      apply: () => { stats.drones = Math.min(CFG.DRONES.MAX, (stats.drones || 0) + 1); },
    },
    {
      id: "revive", icon: "❖", name: "应急保险", base: 80,
      desc: () => "死亡时以 50% 生命复活（可叠 2 次）",
      can: () => revives < 2,
      apply: () => { revives += 1; },
    },
    {
      id: "core", icon: "⬡", name: "能量核心", base: 45,
      desc: () => "获得 1 个建造用核心",
      can: () => true,
      apply: () => { cores += 1; },
    },
    {
      id: "purge", icon: "✦", name: "净化协议", base: 50,
      desc: () => "移除 1 层诅咒强化",
      can: () => {
        const lp = getLocalPlayer() || player;
        return Object.keys(lp.stacks).some((id) => {
          const d = ALL_DEFS.find((x) => x.id === id);
          return d && d.curse;
        });
      },
      apply: () => {
        const lp = getLocalPlayer() || player;
        const id = Object.keys(lp.stacks).find((k) => {
          const d = ALL_DEFS.find((x) => x.id === k);
          return d && d.curse;
        });
        if (!id) return;
        lp.stacks[id] -= 1;
        if (lp.stacks[id] <= 0) delete lp.stacks[id];
        updateBuffPanel();
      },
    },
    {
      id: "multishot", icon: "⋔", name: "弹道扩展", base: 85,
      desc: () => "本武器弹道 +1（上限 8）",
      can: () => stats.bulletCount < 8,
      apply: () => { stats.bulletCount += 1; },
    },
    {
      id: "pierce", icon: "→", name: "穿透镀层", base: 80,
      desc: () => "弹道穿透 +1（上限 7）",
      can: () => stats.pierce < 7,
      apply: () => { stats.pierce += 1; },
    },
  ];

  // 星域环境词条：每章随机，改变对局节奏
  const CHAPTER_MODS = [
    { id: "rich", name: "富矿", desc: "击杀星币 +40% · 敌人生命 +8%", creditMul: 1.4, hpMul: 1.08 },
    { id: "storm", name: "离子风暴", desc: "敌弹速度 +18% · 敌人移速 +5%", ebMul: 1.18, speedMul: 1.05 },
    { id: "fracture", name: "裂解空间", desc: "敌人生命 -10% · 刷怪间隔 -15%", hpMul: 0.9, spawnMul: 0.85 },
  ];

  function shopCost(def) {
    return Math.round(def.base * (1 + (chapter - 1) * 0.18) * (1 + (shopCounts[def.id] || 0) * 0.45));
  }

  function renderShop() {
    document.getElementById("shop-credits").textContent = String(credits);
    const wrap = document.getElementById("shop-items");
    wrap.innerHTML = SHOP_ITEMS.map((def) => {
      const cost = shopCost(def);
      const able = credits >= cost && def.can();
      return `<button class="shop-item" data-shop="${def.id}" ${able ? "" : "disabled"}>
        <h3>${def.icon} ${def.name}</h3>
        <p>${def.desc()}</p>
        <span class="cost">${cost} 星币</span>
      </button>`;
    }).join("");
  }

  function openShop(title) {
    state = "shop";
    clearKeys();
    shake = 0;
    buildMode = null;
    document.getElementById("shop-title").textContent = title || "星港补给站";
    document.getElementById("shop-sub").textContent =
      "用星币强化本局构筑 · 击败敌人可获得星币";
    renderShop();
    document.getElementById("ov-shop").classList.remove("hidden");
    document.getElementById("ov-shop").scrollTop = 0;
    sfxLevelUp();
    refreshHud(true);
  }

  function closeShop() {
    if (state !== "shop") return;
    document.getElementById("ov-shop").classList.add("hidden");
    state = "playing";
    lastFrame = performance.now();
    refreshHud(true);
  }

  function buyShopItem(id) {
    if (state !== "shop") return;
    const def = SHOP_ITEMS.find((d) => d.id === id);
    if (!def) return;
    const cost = shopCost(def);
    if (credits < cost || !def.can()) return;
    credits -= cost;
    shopCounts[id] = (shopCounts[id] || 0) + 1;
    def.apply();
    sfxLevelUp();
    renderShop();
    updateBuffPanel();
    refreshHud(true);
  }

  // ===== 能量核心 =====
  function dropCore(x, y) {
    coreDrops.push({ x, y, seed: Math.random() * TAU, life: 30 });
  }

  function updateCores(dt) {
    const magnet = CFG.RUN.CORE_MAGNET * view.scale;
    const pickup = CFG.RUN.CORE_PICKUP;
    for (let i = coreDrops.length - 1; i >= 0; i--) {
      const c = coreDrops[i];
      c.life -= dt;
      if (c.life <= 0) { coreDrops.splice(i, 1); continue; }
      const dx = player.x - c.x;
      const dy = player.y - c.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d < pickup) {
        coreDrops.splice(i, 1);
        cores += 1;
        emit(c.x, c.y, 8, "#ffd666", 160, 2.4, 0.4);
        addText(c.x, c.y - 18, "+1 核心", "#ffd666", 13);
        sfxHit();
        refreshHud(true);
      } else if (d < magnet) {
        const sp = 300 * view.scale * (1 - d / magnet + 0.35);
        c.x += (dx / d) * sp * dt;
        c.y += (dy / d) * sp * dt;
      }
    }
  }

  // ===== 芯片构筑（3 槽，精英 / Boss 掉落）=====
  const CHIP_TIER = ["普通", "稀有", "史诗"];
  const CHIP_TIER_COLOR = ["#9fb3c8", "#3fb4ff", "#b06bff"];
  const CHIP_POOL = [
    { kind: "dmg",   name: "过载芯片", icon: "✦", vals: [2.5, 4.5, 7] },
    { kind: "atk",   name: "超频芯片", icon: "⚡", vals: [0.06, 0.1, 0.15] },
    { kind: "crit",  name: "致命芯片", icon: "◈", vals: [0.04, 0.07, 0.1] },
    { kind: "pierce",name: "穿透芯片", icon: "↟", vals: [1, 1, 2] },
    { kind: "speed", name: "矢量芯片", icon: "➤", vals: [0.05, 0.08, 0.12] },
    { kind: "shield",name: "棱镜芯片", icon: "⬡", vals: [8, 14, 22] },
    { kind: "armor", name: "装甲芯片", icon: "▣", vals: [0.04, 0.07, 0.1] },
    { kind: "range", name: "雷达芯片", icon: "◎", vals: [0.06, 0.1, 0.15] },
  ];
  const CHIP_SCORE = { dmg: 3, atk: 300, crit: 400, pierce: 12, speed: 200, shield: 1.2, armor: 320, range: 150 };

  function chipColor(c) { return CHIP_TIER_COLOR[c.tier] || "#9fb3c8"; }

  function chipText(c) {
    switch (c.kind) {
      case "dmg": return `伤害 +${c.value}`;
      case "atk": return `射速 +${Math.round(c.value * 100)}%`;
      case "crit": return `暴击率 +${Math.round(c.value * 100)}%`;
      case "pierce": return `穿透 +${c.value}`;
      case "speed": return `移速 +${Math.round(c.value * 100)}%`;
      case "shield": return `护盾 +${c.value}`;
      case "armor": return `减伤 +${Math.round(c.value * 100)}%`;
      case "range": return `射程 +${Math.round(c.value * 100)}%`;
      default: return "";
    }
  }

  function makeChip() {
    const def = pick(CHIP_POOL);
    const roll = Math.random();
    let tier;
    if (chapter >= 3) tier = roll < 0.22 ? 2 : roll < 0.68 ? 1 : 0;
    else tier = roll < 0.5 ? 1 : 0;
    if (chapter >= 6 && roll < 0.1) tier = 2;
    const value = def.vals[tier];
    return {
      id: nextPropId++,
      kind: def.kind,
      name: def.name,
      icon: def.icon,
      tier,
      value,
      score: Math.round(value * (CHIP_SCORE[def.kind] || 1) * 10) / 10,
    };
  }

  function dropChip(x, y) {
    chipDrops.push({ x, y, chip: makeChip(), seed: Math.random() * TAU, life: 32 });
    emit(x, y, 8, "#c9a6ff", 150, 2.4, 0.5);
  }

  function chipApply(c, sign, p) {
    const owner = p || getLocalPlayer() || player;
    const s = owner.stats;
    const v = c.value;
    switch (c.kind) {
      case "dmg": s.damage = Math.max(1, s.damage + v * sign); break;
      case "atk":
        s.fireInterval = sign > 0
          ? Math.max(0.06, s.fireInterval / (1 + v))
          : Math.min(1.2, s.fireInterval * (1 + v));
        break;
      case "crit": s.crit = clamp(s.crit + v * sign, 0, 0.85); break;
      case "pierce": s.pierce = Math.max(0, s.pierce + Math.round(v) * sign); break;
      case "speed":
        s.moveSpeed = sign > 0 ? s.moveSpeed * (1 + v) : s.moveSpeed / (1 + v);
        break;
      case "shield":
        s.shieldMax = Math.max(10, s.shieldMax + v * sign);
        owner.shield = Math.min(owner.shield, s.shieldMax);
        break;
      case "armor":
        s.armor = sign > 0
          ? Math.min(0.65, 1 - (1 - s.armor) * (1 - v))
          : clamp(1 - (1 - s.armor) / (1 - v), 0, 0.65);
        break;
      case "range":
        s.range = sign > 0 ? s.range * (1 + v) : s.range / (1 + v);
        break;
    }
  }

  function equipChip(chip) {
    const owner = getLocalPlayer() || player;
    const chips = owner.chips;
    let replaced = null;
    if (chips.length >= 3) {
      let wi = 0;
      for (let i = 1; i < chips.length; i++) {
        if (chips[i].score < chips[wi].score) wi = i;
      }
      replaced = chips[wi];
      chipApply(replaced, -1, owner);
      chips.splice(wi, 1);
    }
    chips.push(chip);
    chipApply(chip, 1, owner);
    emit(owner.x, owner.y, 18, chipColor(chip), 240, 3, 0.6);
    addText(owner.x, owner.y - 52,
      replaced ? `替换 ${replaced.name} → ${chip.name}` : `芯片 ${chip.name} · ${chipText(chip)}`,
      chipColor(chip), 14);
    sfxLevelUp();
    updateBuffPanel();
    refreshHud(true);
  }

  function updateChipDrops(dt) {
    const magnet = 150 * view.scale;
    const pickup = 34;
    for (let i = chipDrops.length - 1; i >= 0; i--) {
      const d = chipDrops[i];
      d.life -= dt;
      d.seed += dt;
      if (d.life <= 0) { chipDrops.splice(i, 1); continue; }
      const dx = player.x - d.x;
      const dy = player.y - d.y;
      const dist = Math.hypot(dx, dy) || 1;
      if (dist < pickup) {
        chipDrops.splice(i, 1);
        equipChip(d.chip);
      } else if (dist < magnet) {
        const sp = 320 * view.scale * (1 - dist / magnet + 0.35);
        d.x += (dx / dist) * sp * dt;
        d.y += (dy / dist) * sp * dt;
      }
    }
  }

  function drawChipDrops(t) {
    for (let i = 0; i < chipDrops.length; i++) {
      const d = chipDrops[i];
      if (d.x < cull.x0 || d.x > cull.x1 || d.y < cull.y0 || d.y > cull.y1) continue;
      const col = chipColor(d.chip);
      const pulse = 1 + Math.sin(t * 4 + d.seed) * 0.12;
      if (!lowFx) drawGlow(col, d.x, d.y, 26 * pulse, 0.55);
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(t * 1.6 + d.seed);
      ctx.fillStyle = rgbaOf(col, 0.3);
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -8 * pulse);
      ctx.lineTo(8 * pulse, 0);
      ctx.lineTo(0, 8 * pulse);
      ctx.lineTo(-8 * pulse, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  // ===== 可破坏陨石 =====
  function spawnAsteroid() {
    if (asteroids.length >= CFG.ASTEROID.MAX) return;
    const pos = randomSpotInView(190 * view.scale, 90);
    const r = CFG.ASTEROID.R * view.scale * rand(0.75, 1.3);
    const hp = CFG.ASTEROID.HP * (1 + (chapter - 1) * 0.35);
    const verts = [];
    const n = 7 + randInt(3);
    for (let i = 0; i < n; i++) {
      verts.push({ a: (i / n) * TAU, r: r * rand(0.78, 1.12) });
    }
    asteroids.push({
      id: nextPropId++,
      x: pos.x, y: pos.y,
      r, hp, maxHp: hp,
      verts,
      seed: Math.random() * TAU,
      flash: 0,
    });
  }

  function destroyAsteroid(a) {
    const idx = asteroids.indexOf(a);
    if (idx < 0) return;
    asteroids.splice(idx, 1);
    const R = CFG.ASTEROID.EXPLODE_R * view.scale;
    emit(a.x, a.y, 30, "#d8b48a", 300, 4, 0.8);
    shake = Math.max(shake, 8 * CFG.FX.SHAKE);
    sfxExplode(false);
    score += 20;
    credits += CFG.ASTEROID.CREDITS;
    for (let i = 0; i < CFG.ASTEROID.GEMS; i++) spawnGem(a.x, a.y, 4);
    if (Math.random() < 0.3) dropCore(a.x, a.y);
    addText(a.x, a.y - 28, "陨石碎裂", "#ffd6a0", 14);
    // 碎裂冲击波伤害周围敌人
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (e.dead) continue;
      const rr = R + e.r;
      if (dist2(a.x, a.y, e.x, e.y) <= rr * rr) {
        hurtEnemy(e, CFG.ASTEROID.EXPLODE_DMG * (e.isBoss ? 0.5 : 1), false, true);
        if (state !== "playing") return;
      }
    }
  }

  function updateAsteroids(dt) {
    asteroidTimer -= dt;
    if (asteroidTimer <= 0) {
      asteroidTimer = CFG.ASTEROID.INTERVAL * rand(0.8, 1.25);
      spawnAsteroid();
    }
    for (let i = 0; i < asteroids.length; i++) {
      asteroids[i].flash = Math.max(0, asteroids[i].flash - dt);
    }
  }

  function drawAsteroids(t) {
    for (let i = 0; i < asteroids.length; i++) {
      const a = asteroids[i];
      if (a.x < cull.x0 - 60 || a.x > cull.x1 + 60 || a.y < cull.y0 - 60 || a.y > cull.y1 + 60) continue;
      ctx.save();
      ctx.translate(a.x, a.y);
      ctx.rotate(t * 0.22 + a.seed);
      ctx.beginPath();
      for (let k = 0; k < a.verts.length; k++) {
        const v = a.verts[k];
        const px = Math.cos(v.a) * v.r;
        const py = Math.sin(v.a) * v.r;
        k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = a.flash > 0 ? "rgba(255, 236, 200, 0.7)" : "rgba(88, 74, 66, 0.92)";
      ctx.fill();
      ctx.strokeStyle = a.flash > 0 ? "#ffffff" : "rgba(214, 178, 138, 0.75)";
      ctx.lineWidth = 2;
      ctx.stroke();
      // 内部裂纹
      ctx.strokeStyle = "rgba(255, 205, 150, 0.22)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-a.r * 0.3, -a.r * 0.2);
      ctx.lineTo(a.r * 0.15, a.r * 0.1);
      ctx.lineTo(a.r * 0.32, a.r * 0.45);
      ctx.stroke();
      ctx.restore();

      if (a.hp < a.maxHp) {
        const w = a.r * 1.8;
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillRect(a.x - w / 2, a.y - a.r - 12, w, 3.5);
        ctx.fillStyle = "#d6b28a";
        ctx.fillRect(a.x - w / 2, a.y - a.r - 12, w * clamp(a.hp / a.maxHp, 0, 1), 3.5);
      }
    }
  }

  // ===== 星际游商 =====
  const TRADER_OFFERS = [
    { id: "heal", icon: "✚", name: "应急修复", base: 34, desc: () => "立即恢复 45% 最大生命", can: () => player.hp < player.hpMax - 1,
      apply: () => { player.hp = Math.min(player.hpMax, player.hp + player.hpMax * 0.45); } },
    { id: "shield", icon: "◈", name: "护盾充能", base: 38, desc: () => "护盾上限 +10 并立即充满", can: () => true,
      apply: () => { stats.shieldMax += 10; player.shield = stats.shieldMax; } },
    { id: "damage", icon: "✦", name: "黑市校准", base: 52, desc: () => "全武器伤害 +14%", can: () => true,
      apply: () => { stats.damage *= 1.14; } },
    { id: "core", icon: "⬡", name: "核心箱", base: 40, desc: () => "获得 2 个建造用核心", can: () => true,
      apply: () => { cores += 2; } },
    { id: "gamble", icon: "?", name: "风险赌注", base: 30, risky: true,
      desc: () => "50% 获得 90 星币，50% 血本无归", can: () => true,
      apply: () => {
        if (Math.random() < 0.5) {
          credits += 90;
          addText(player.x, player.y - 46, "赌注成功 +90 星币", "#ffd666", 17);
          sfxLevelUp();
        } else {
          addText(player.x, player.y - 46, "赌注失败……", "#ff5f7a", 17);
          sfxHurt();
        }
      } },
  ];

  function traderCost(def) {
    return Math.round(def.base * (1 + (chapter - 1) * 0.22));
  }

  function spawnTrader() {
    if (trader) return;
    const pos = randomSpotInView(300 * view.scale, 110);
    trader = { x: pos.x, y: pos.y, r: CFG.TRADER.R * view.scale, seed: Math.random() * TAU, life: CFG.TRADER.LIFE };
    addText(pos.x, pos.y - 38, "星际游商出现", "#c9a6ff", 15);
  }

  function updateTrader(dt) {
    if (!trader) {
      traderTimer -= dt;
      if (traderTimer <= 0) {
        traderTimer = CFG.TRADER.INTERVAL * rand(0.85, 1.2);
        spawnTrader();
      }
      return;
    }
    trader.life -= dt;
    trader.seed += dt;
    if (trader.life <= 0) { trader = null; return; }
    const rr = trader.r + player.r + 6;
    if (dist2(trader.x, trader.y, player.x, player.y) <= rr * rr) openTrader();
  }

  function renderTrader() {
    document.getElementById("trader-credits").textContent = String(credits);
    const wrap = document.getElementById("trader-items");
    wrap.innerHTML = traderOffers.map((def, i) => {
      const cost = traderCost(def);
      const able = credits >= cost && def.can();
      return `<button class="shop-item" data-trade="${i}" ${able ? "" : "disabled"}>
        <h3>${def.icon} ${def.name}</h3>
        <p>${def.desc()}</p>
        <span class="cost">${cost} 星币</span>
      </button>`;
    }).join("");
  }

  function openTrader() {
    if (state !== "playing" || !trader) return;
    state = "trader";
    clearKeys();
    shake = 0;
    buildMode = null;
    // 随机三选一
    const pool = TRADER_OFFERS.slice();
    traderOffers = [];
    for (let i = 0; i < 3 && pool.length; i++) {
      const idx = randInt(pool.length);
      traderOffers.push(pool.splice(idx, 1)[0]);
    }
    document.getElementById("trader-title").textContent = "星际游商 · 第 " + chapter + " 星域";
    renderTrader();
    document.getElementById("ov-trader").classList.remove("hidden");
    document.getElementById("ov-trader").scrollTop = 0;
    sfxLevelUp();
    refreshHud(true);
  }

  function closeTrader() {
    if (state !== "trader") return;
    document.getElementById("ov-trader").classList.add("hidden");
    trader = null;
    state = "playing";
    lastFrame = performance.now();
    refreshHud(true);
  }

  function buyTrade(idx) {
    if (state !== "trader") return;
    const def = traderOffers[idx];
    if (!def) return;
    const cost = traderCost(def);
    if (credits < cost || !def.can()) return;
    credits -= cost;
    def.apply();
    sfxLevelUp();
    trader = null;
    closeTrader();
    updateBuffPanel();
    refreshHud(true);
  }

  function drawTrader(t) {
    if (!trader) return;
    const p = trader;
    const blink = p.life < 5 && Math.floor(t * 6) % 2 === 0;
    ctx.save();
    ctx.globalAlpha = blink ? 0.4 : 1;
    ctx.translate(p.x, p.y);
    if (!lowFx) drawGlow(THEME.violet, 0, 0, 40, 0.55);
    ctx.rotate(Math.sin(p.seed * 1.2) * 0.16);
    // 船体
    ctx.fillStyle = "rgba(60, 40, 96, 0.95)";
    ctx.strokeStyle = THEME.violet;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(0, -p.r);
    ctx.lineTo(p.r * 0.9, p.r * 0.55);
    ctx.lineTo(0, p.r * 0.25);
    ctx.lineTo(-p.r * 0.9, p.r * 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = THEME.gold;
    ctx.beginPath();
    ctx.arc(0, -p.r * 0.12, p.r * 0.28, 0, TAU);
    ctx.fill();
    ctx.restore();

    // 交易标识
    ctx.save();
    ctx.globalAlpha = blink ? 0.5 : 0.9;
    ctx.fillStyle = "#d9c2ff";
    ctx.font = "600 12px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("游商 · 触碰交易", p.x, p.y - p.r - 14);
    // 剩余时间环
    ctx.strokeStyle = "rgba(201, 166, 255, 0.6)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r + 9, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(p.life / CFG.TRADER.LIFE, 0, 1));
    ctx.stroke();
    ctx.restore();
  }

  // ===== 防线建造 =====
  function renderBuildMenu() {
    document.getElementById("build-cores").textContent = String(cores);
    const wrap = document.getElementById("build-items");
    const turretAble = cores >= CFG.RUN.TURRET_COST && turrets.length < CFG.RUN.MAX_TURRETS;
    const fieldAble = cores >= CFG.RUN.FIELD_COST && fields.length < CFG.RUN.MAX_FIELDS;
    wrap.innerHTML = `
      <button class="shop-item" data-build="turret" ${turretAble ? "" : "disabled"}>
        <h3>⬢ 自动炮塔 · ${turrets.length}/${CFG.RUN.MAX_TURRETS}</h3>
        <p>自动锁定射程内敌人射击，伤害随武器强化</p>
        <span class="cost">${CFG.RUN.TURRET_COST} 核心</span>
      </button>
      <button class="shop-item" data-build="field" ${fieldAble ? "" : "disabled"}>
        <h3>◎ 缓速场 · ${fields.length}/${CFG.RUN.MAX_FIELDS}</h3>
        <p>范围内敌人移速降低 50%，适合拉扯与守点</p>
        <span class="cost">${CFG.RUN.FIELD_COST} 核心</span>
      </button>`;
  }

  function openBuildMenu() {
    if (state !== "playing") return;
    state = "build";
    clearKeys();
    renderBuildMenu();
    document.getElementById("ov-build").classList.remove("hidden");
  }

  function closeBuildMenu() {
    if (state !== "build") return;
    document.getElementById("ov-build").classList.add("hidden");
    state = "playing";
    lastFrame = performance.now();
    refreshHud(true);
  }

  function chooseBuild(type) {
    if (state !== "build") return;
    const cost = type === "turret" ? CFG.RUN.TURRET_COST : CFG.RUN.FIELD_COST;
    const atCap = type === "turret"
      ? turrets.length >= CFG.RUN.MAX_TURRETS
      : fields.length >= CFG.RUN.MAX_FIELDS;
    if (cores < cost || atCap) return;
    buildMode = type;
    document.getElementById("ov-build").classList.add("hidden");
    state = "playing";
    lastFrame = performance.now();
    addText(player.x, player.y - 46,
      type === "turret" ? "点击战场放置炮塔" : "点击战场放置缓速场", "#ffd666", 15);
    refreshHud(true);
  }

  function placeDefense(type, x, y) {
    const cost = type === "turret" ? CFG.RUN.TURRET_COST : CFG.RUN.FIELD_COST;
    if (cores < cost) { buildMode = null; refreshHud(true); return; }
    if (type === "turret") {
      if (turrets.length >= CFG.RUN.MAX_TURRETS) { buildMode = null; return; }
      cores -= cost;
      turrets.push({ x, y, cd: 0, ang: -Math.PI / 2, seed: Math.random() * TAU });
      addText(x, y - 26, "炮塔已部署", "#ffd666", 14);
    } else {
      if (fields.length >= CFG.RUN.MAX_FIELDS) { buildMode = null; return; }
      cores -= cost;
      fields.push({ x, y, r: CFG.RUN.FIELD_RADIUS * view.scale, seed: Math.random() * TAU });
      addText(x, y - 26, "缓速场已展开", "#8ff6ff", 14);
    }
    emit(x, y, 16, "#ffd666", 200, 3, 0.6);
    sfxLevelUp();
    buildMode = null;
    refreshHud(true);
  }

  function updateDefenses(dt) {
    const range = CFG.RUN.TURRET_RANGE * view.scale;
    for (let i = 0; i < turrets.length; i++) {
      const t = turrets[i];
      let best = null;
      let bestD = range * range;
      for (let k = 0; k < enemies.length; k++) {
        const e = enemies[k];
        if (e.dead) continue;
        const d = dist2(t.x, t.y, e.x, e.y);
        if (d < bestD) { bestD = d; best = e; }
      }
      if (best) {
        t.ang = Math.atan2(best.y - t.y, best.x - t.x);
        t.cd -= dt;
        if (t.cd <= 0) {
          t.cd = CFG.RUN.TURRET_CD;
          if (bullets.length < CFG.LIMITS.BULLETS) {
            const sp = stats.bulletSpeed * view.scale * 0.9;
            bullets.push({
              x: t.x, y: t.y,
              vx: Math.cos(t.ang) * sp,
              vy: Math.sin(t.ang) * sp,
              r: 3.4,
              dmg: Math.max(6, stats.damage * 0.5),
              pierce: 0,
              life: 1.2,
              dead: false,
              hit: new Set(),
              ang: t.ang,
              color: "#ffd666",
            });
          }
        }
      }
    }
    for (let i = 0; i < fields.length; i++) {
      const f = fields[i];
      const r2 = f.r * f.r;
      for (let k = 0; k < enemies.length; k++) {
        const e = enemies[k];
        if (e.dead || e.isBoss) continue;
        if (dist2(f.x, f.y, e.x, e.y) <= r2) e.slowT = 0.14;
      }
    }
  }

  // ===== 章节切换（无尽远航）=====
  function chapterClear() {
    victoryFlash = 0;
    slowmo = 0;
    chapter += 1;
    chapterMod = pick(CHAPTER_MODS.filter((m) => !chapterMod || m.id !== chapterMod.id));
    chapterStartElapsed = elapsed;
    waveNum = 1;
    bossSpawned = false;
    boss = null;
    enemies.length = 0;
    ebullets.length = 0;
    buildMode = null;
    spawnTimer = 2.5;

    player.hp = Math.min(player.hpMax, player.hp + player.hpMax * CFG.RUN.CLEAR_HEAL);
    player.shield = stats.shieldMax;
    player.invuln = Math.max(player.invuln, 2.5);
    const bonus = CFG.RUN.CLEAR_CREDITS + chapter * 15;
    credits += bonus;
    lastShopWave = 0;

    const cx = camera.x + view.w / 2;
    const cy = camera.y + view.h * 0.26;
    addText(cx, cy, "第 " + chapter + " 星域", "#ffd666", 30);
    addText(cx, cy + 32, `+${bonus} 星币 · 生命修复 25%`, "#8bffdc", 16);
    const hpPct = Math.round((Math.pow(CFG.RUN.ENEMY_HP_GROWTH,
      (chapter - 1) * CFG.RUN.CHAPTER_WAVES) - 1) * 100);
    const armorPct = Math.round(waveScaleArmor() * 100);
    addText(cx, cy + 54, `深渊压制：敌人生命 +${hpPct}% · 护甲 ${armorPct}%`, "#ff9f2e", 14);
    if (chapterMod) addText(cx, cy + 74, `星域环境：${chapterMod.name} · ${chapterMod.desc}`, "#7ef0ff", 13);
    emit(player.x, player.y, 34, "#8bffdc", 280, 3.6, 0.9);
    sfxWin();
    openShop("第 " + chapter + " 星域 · 星港补给");
    refreshHud(true);
  }

