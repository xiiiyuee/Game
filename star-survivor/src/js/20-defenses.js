  /* =====================================================================
   * 15.7 无尽远航：星港 / 能量核心与防线
   * ===================================================================*/
  const SHOP_ITEMS = [
    {
      id: "repair", icon: "✚", name: "舰体修复", base: 35,
      desc: () => "立即恢复 45% 最大生命",
      can: (p) => p.hp < p.hpMax - 1,
      apply: (p) => { p.hp = Math.min(p.hpMax, p.hp + p.hpMax * 0.45); },
    },
    {
      id: "shield", icon: "◈", name: "护盾电池", base: 40,
      desc: () => "护盾上限 +12 并立即充满",
      can: () => true,
      apply: (p) => { p.stats.shieldMax += 12; p.shield = p.stats.shieldMax; },
    },
    {
      id: "damage", icon: "↑", name: "武器校准", base: 55,
      desc: () => "全武器伤害 +12%",
      can: () => true,
      apply: (p) => { p.stats.damage *= 1.12; },
    },
    {
      id: "drone", icon: "⬢", name: "无人机模块", base: 60,
      desc: () => "增加 1 架环绕守护无人机",
      can: (p) => (p.stats.drones || 0) < CFG.DRONES.MAX,
      apply: (p) => { p.stats.drones = Math.min(CFG.DRONES.MAX, (p.stats.drones || 0) + 1); },
    },
    {
      id: "revive", icon: "❖", name: "应急保险", base: 80,
      desc: () => roomCode
        ? "全队共享 · 死亡时以 50% 生命复活（最多 2 次）"
        : "死亡时以 50% 生命复活（可叠 2 次）",
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
      can: (p) => Object.keys(p.stacks).some((id) => {
        const d = ALL_DEFS.find((x) => x.id === id);
        return d && d.curse;
      }),
      apply: (p) => {
        const id = Object.keys(p.stacks).find((k) => {
          const d = ALL_DEFS.find((x) => x.id === k);
          return d && d.curse;
        });
        if (!id) return;
        p.stacks[id] -= 1;
        if (p.stacks[id] <= 0) delete p.stacks[id];
        updateBuffPanel();
      },
    },
    {
      id: "multishot", icon: "⋔", name: "弹道扩展", base: 85,
      desc: () => "本武器弹道 +1（上限 8）",
      can: (p) => p.stats.bulletCount < 8,
      apply: (p) => { p.stats.bulletCount += 1; },
    },
    {
      id: "pierce", icon: "→", name: "穿透镀层", base: 80,
      desc: () => "弹道穿透 +1（上限 7）",
      can: (p) => p.stats.pierce < 7,
      apply: (p) => { p.stats.pierce += 1; },
    },
  ];

  // 星域事件：章节切换时二选一，收益与风险并存
  const SECTOR_EVENTS = [
    {
      id: "rich", name: "富矿带", icon: "◈",
      desc: "击杀星币 +40% · 敌人生命 +8%",
      creditMul: 1.4, hpMul: 1.08,
    },
    {
      id: "storm", name: "离子风暴", icon: "⚡",
      desc: "敌弹速度 +18% · 敌人移速 +5% · 技能充能 +30%",
      ebMul: 1.18, speedMul: 1.05, energyMul: 1.3,
    },
    {
      id: "fracture", name: "裂解空间", icon: "✧",
      desc: "敌人生命 -10% · 刷怪 -15% · 经验 -15%",
      hpMul: 0.9, spawnMul: 0.85, xpMul: 0.85,
    },
    {
      id: "armory", name: "废弃兵工厂", icon: "⚔",
      desc: "玩家伤害 +12% · 敌人生命 +10%",
      playerDmgMul: 1.12, hpMul: 1.1,
    },
    {
      id: "medical", name: "医疗星港", icon: "✚",
      desc: "立即回复 45% 生命 · 受到伤害 +10%",
      dmgTakenMul: 1.1,
      onPick(p) { if (p) p.hp = Math.min(p.hpMax, p.hp + p.hpMax * 0.45); },
    },
  ];
  const CHAPTER_MODS = SECTOR_EVENTS;
  let sectorChoices = [];
  let sectorTimer = 0;

  function renderSectorChoices() {
    const wrap = document.getElementById("event-items");
    if (!wrap) return;
    wrap.innerHTML = sectorChoices.map((m) => `<button class="shop-item" data-event="${m.id}">
      <h3>${m.icon} ${m.name}</h3>
      <p>${m.desc}</p>
      <span class="cost">选择</span>
    </button>`).join("");
    const sub = document.getElementById("event-sub");
    if (sub) {
      sub.textContent = roomCode && !coopIsGuest()
        ? "选择下一星域的环境 · 9 秒后自动选择"
        : "选择下一星域的环境 · 收益与风险并存";
    }
    document.getElementById("ov-event").classList.remove("hidden");
  }

  // 章节切换：单机暂停抉择；联机由房主抉择并倒计时自动选择
  function prepareSectorChoice() {
    const pool = SECTOR_EVENTS.filter((m) => !chapterMod || m.id !== chapterMod.id);
    sectorChoices = pool.slice().sort(() => Math.random() - 0.5).slice(0, 2);
    if (!sectorChoices.length) sectorChoices = SECTOR_EVENTS.slice(0, 2);
    renderSectorChoices();
    if (roomCode) {
      sectorTimer = 9;
      spawnTimer = Math.max(spawnTimer || 0, 10);   // 抉择期间不刷怪
    } else { state = "event"; sectorTimer = 0; }
  }

  function chooseSectorEvent(id) {
    const ev = SECTOR_EVENTS.find((m) => m.id === id) || sectorChoices[0];
    if (!ev) return;
    chapterMod = ev;
    sectorChoices = [];
    sectorTimer = 0;
    document.getElementById("ov-event").classList.add("hidden");
    if (state === "event") state = "playing";
    spawnTimer = Math.min(spawnTimer || 2.5, 2.5);
    if (ev.onPick) players.forEach((p) => ev.onPick(p));
    coopSendEvent("chapter", { c: chapter, mod: ev.id });
    const cx = camera.x + view.w / 2;
    const cy = camera.y + view.h * 0.26;
    addText(cx, cy + 74, `星域事件：${ev.name} · ${ev.desc}`, "#7ef0ff", 13);
    openShop("第 " + chapter + " 星域 · 星港补给");
    refreshHud(true);
  }

  function updateSectorTimer(dt) {
    if (sectorTimer <= 0) return;
    sectorTimer -= dt;
    if (sectorTimer <= 0 && sectorChoices.length) {
      chooseSectorEvent(sectorChoices[0].id);
    }
  }

  function shopCost(def) {
    return Math.round(def.base * (1 + (chapter - 1) * 0.18) * (1 + (shopCounts[def.id] || 0) * 0.45));
  }

  function shopOfferFor(p) {
    const owner = p || getLocalPlayer() || player;
    return SHOP_ITEMS.map((def) => ({
      id: def.id, icon: def.icon, name: def.name,
      desc: def.desc(), cost: shopCost(def), can: !!def.can(owner),
    }));
  }

  // 商店列表：房主本地与客户端共用同一渲染，价格 / 可购状态由房主下发
  function renderShopOffer(items, creditVal, subText) {
    document.getElementById("shop-credits").textContent = String(creditVal);
    if (subText !== undefined) document.getElementById("shop-sub").textContent = subText;
    const wrap = document.getElementById("shop-items");
    wrap.innerHTML = (items || []).map((it) => {
      const able = creditVal >= it.cost && it.can;
      return `<button class="shop-item" data-shop="${it.id}" ${able ? "" : "disabled"}>
        <h3>${it.icon} ${it.name}</h3>
        <p>${it.desc}</p>
        <span class="cost">${it.cost} 星币</span>
      </button>`;
    }).join("");
  }

  function renderShop() {
    renderShopOffer(shopOfferFor(getLocalPlayer() || player), credits);
  }

  function openShop(title) {
    if (roomCode) { coopOpenShop(getLocalPlayer() || player, title); return; }
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
    if (roomCode) {
      const lp = getLocalPlayer() || player;
      if (coopNet.host) {
        if (lp && lp.shopOpen) coopCloseShop(lp);
        else document.getElementById("ov-shop").classList.add("hidden");
      } else {
        if (coopGuestShop) {
          coopEventSeq += 1;
          coopSendCtrl({ t: "ev", id: coopEventSeq, k: "shop-bye", d: { sid: coopGuestShop.sid } });
        }
        coopCloseShopUI();
      }
      return;
    }
    if (state !== "shop") return;
    document.getElementById("ov-shop").classList.add("hidden");
    state = "playing";
    lastFrame = performance.now();
    refreshHud(true);
  }

  function buyShopItem(id) {
    if (roomCode) { coopBuyShopLocal(id); return; }
    if (state !== "shop") return;
    const def = SHOP_ITEMS.find((d) => d.id === id);
    if (!def) return;
    const p = getLocalPlayer() || player;
    const cost = shopCost(def);
    if (credits < cost || !def.can(p)) return;
    credits -= cost;
    shopCounts[id] = (shopCounts[id] || 0) + 1;
    def.apply(p);
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
    if (coopIsGuest()) return;           // 联机客户端：核心掉落由房主同步
    const magnet = CFG.RUN.CORE_MAGNET * view.scale;
    const pickup = CFG.RUN.CORE_PICKUP;
    for (let i = coreDrops.length - 1; i >= 0; i--) {
      const c = coreDrops[i];
      c.life -= dt;
      if (c.life <= 0) { coreDrops.splice(i, 1); continue; }
      // 团队共享核心（D-03）：任意队友靠近都能拾取
      let target = null;
      let best = Infinity;
      for (let k = 0; k < players.length; k++) {
        const q = players[k];
        if (q.eliminated) continue;
        const dd = dist2(q.x, q.y, c.x, c.y);
        if (dd < best) { best = dd; target = q; }
      }
      if (!target) continue;
      const dx = target.x - c.x;
      const dy = target.y - c.y;
      const d = Math.sqrt(best) || 1;
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

  function equipChip(chip, p) {
    const owner = p || getLocalPlayer() || player;
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
    coopSyncOwn(owner);       // 房主把个人构筑同步给该队友
  }

  function updateChipDrops(dt) {
    if (coopIsGuest()) return;           // 联机客户端：芯片掉落由房主同步
    const magnet = 150 * view.scale;
    const pickup = 34;
    for (let i = chipDrops.length - 1; i >= 0; i--) {
      const d = chipDrops[i];
      d.life -= dt;
      d.seed += dt;
      if (d.life <= 0) { chipDrops.splice(i, 1); continue; }
      // 个人拾取（P4-04）：芯片归最近的可行动玩家
      let target = null;
      let best = Infinity;
      for (let k = 0; k < players.length; k++) {
        const q = players[k];
        if (q.eliminated) continue;
        const dd = dist2(q.x, q.y, d.x, d.y);
        if (dd < best) { best = dd; target = q; }
      }
      if (!target) continue;
      const dx = target.x - d.x;
      const dy = target.y - d.y;
      const dist = Math.sqrt(best) || 1;
      if (dist < pickup) {
        chipDrops.splice(i, 1);
        equipChip(d.chip, target);
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
    if (coopIsGuest()) {                 // 联机客户端：陨石由房主同步
      for (let i = 0; i < asteroids.length; i++) {
        asteroids[i].flash = Math.max(0, asteroids[i].flash - dt);
      }
      return;
    }
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
    { id: "heal", icon: "✚", name: "应急修复", base: 34, desc: () => "立即恢复 45% 最大生命", can: (p) => p.hp < p.hpMax - 1,
      apply: (p) => { p.hp = Math.min(p.hpMax, p.hp + p.hpMax * 0.45); } },
    { id: "shield", icon: "◈", name: "护盾充能", base: 38, desc: () => "护盾上限 +10 并立即充满", can: () => true,
      apply: (p) => { p.stats.shieldMax += 10; p.shield = p.stats.shieldMax; } },
    { id: "damage", icon: "✦", name: "黑市校准", base: 52, desc: () => "全武器伤害 +14%", can: () => true,
      apply: (p) => { p.stats.damage *= 1.14; } },
    { id: "core", icon: "⬡", name: "核心箱", base: 40, desc: () => "获得 2 个建造用核心", can: () => true,
      apply: () => { cores += 2; } },
    { id: "gamble", icon: "?", name: "风险赌注", base: 30, risky: true,
      desc: () => "50% 获得 90 星币，50% 血本无归", can: () => true,
      apply: (p) => {
        if (Math.random() < 0.5) {
          credits += 90;
          addText(p.x, p.y - 46, "赌注成功 +90 星币", "#ffd666", 17);
          sfxLevelUp();
        } else {
          addText(p.x, p.y - 46, "赌注失败……", "#ff5f7a", 17);
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
    if (coopIsGuest()) {                 // 联机客户端：游商由房主同步，不触发本地商店
      if (trader) trader.seed += dt;
      return;
    }
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
    if (trader.life <= 0) {
      trader = null;
      coopCloseTradeUI();
      return;
    }
    if (!roomCode) {
      const rr = trader.r + player.r + 6;
      if (dist2(trader.x, trader.y, player.x, player.y) <= rr * rr) openTrader();
      return;
    }
    // 联机：每名玩家各自触发个人游商（P4-02），不冻结世界
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      if (p.eliminated || p.tradeOffer || p.tradeCooldown > 0) continue;
      const rr = trader.r + p.r + 6;
      if (dist2(trader.x, trader.y, p.x, p.y) <= rr * rr) coopOpenTrade(p);
    }
  }

  function traderOffersFor(p) {
    const pool = TRADER_OFFERS.slice();
    const out = [];
    for (let i = 0; i < 3 && pool.length; i++) {
      const idx = randInt(pool.length);
      out.push(pool.splice(idx, 1)[0]);
    }
    return out.map((def, i) => ({
      i, icon: def.icon, name: def.name, desc: def.desc(),
      cost: traderCost(def), can: !!def.can(p), def,
    }));
  }

  function renderTradeOffer(items, creditVal) {
    document.getElementById("trader-credits").textContent = String(creditVal);
    document.getElementById("trader-items").innerHTML = (items || []).map((it) => {
      const able = creditVal >= it.cost && it.can;
      return `<button class="shop-item" data-trade="${it.i}" ${able ? "" : "disabled"}>
        <h3>${it.icon} ${it.name}</h3>
        <p>${it.desc}</p>
        <span class="cost">${it.cost} 星币</span>
      </button>`;
    }).join("");
  }

  function renderTrader() {
    renderTradeOffer(traderOffers.map((def, i) => ({
      i, icon: def.icon, name: def.name, desc: def.desc(),
      cost: traderCost(def), can: !!def.can(player),
    })), credits);
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
    if (roomCode) {
      if (coopNet.host) {
        if (coopHostTradeP) coopCloseTrade(coopHostTradeP);
        else coopCloseTradeUI();
      } else {
        if (coopGuestTrade) {
          coopEventSeq += 1;
          coopSendCtrl({ t: "ev", id: coopEventSeq, k: "trade-bye", d: { sid: coopGuestTrade.sid } });
        }
        coopCloseTradeUI();
      }
      return;
    }
    if (state !== "trader") return;
    document.getElementById("ov-trader").classList.add("hidden");
    trader = null;
    state = "playing";
    lastFrame = performance.now();
    refreshHud(true);
  }

  function buyTrade(idx) {
    if (roomCode) {
      if (coopNet.host) {
        if (coopHostTradeP && coopHostTradeP.tradeOffer) {
          coopBuyTrade(coopHostTradeP, { sid: coopHostTradeP.tradeOffer.sid, i: idx });
        }
      } else if (coopGuestTrade) {
        coopEventSeq += 1;
        coopSendCtrl({ t: "ev", id: coopEventSeq, k: "trade-buy", d: { sid: coopGuestTrade.sid, i: idx } });
      }
      return;
    }
    if (state !== "trader") return;
    const def = traderOffers[idx];
    if (!def) return;
    const cost = traderCost(def);
    if (credits < cost || !def.can(player)) return;
    credits -= cost;
    def.apply(player);
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
    const wallAble = cores >= CFG.RUN.WALL_COST && walls.length < CFG.RUN.MAX_WALLS;
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
      </button>
      <button class="shop-item" data-build="wall" ${wallAble ? "" : "disabled"}>
        <h3>▬ 合金城墙 · ${walls.length}/${CFG.RUN.MAX_WALLS}</h3>
        <p>阻断敌机行进路线，带血条；敌方弹幕与近身攻击都会拆墙</p>
        <span class="cost">${CFG.RUN.WALL_COST} 核心</span>
      </button>`;
  }

  function defenseCost(type) {
    if (type === "turret") return CFG.RUN.TURRET_COST;
    if (type === "field") return CFG.RUN.FIELD_COST;
    if (type === "wall") return CFG.RUN.WALL_COST;
    return Infinity;
  }

  function defenseAtCap(type) {
    if (type === "turret") return turrets.length >= CFG.RUN.MAX_TURRETS;
    if (type === "field") return fields.length >= CFG.RUN.MAX_FIELDS;
    if (type === "wall") return walls.length >= CFG.RUN.MAX_WALLS;
    return true;
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
    const cost = defenseCost(type);
    if (cores < cost || defenseAtCap(type)) return;
    buildMode = type;
    document.getElementById("ov-build").classList.add("hidden");
    state = "playing";
    lastFrame = performance.now();
    addText(player.x, player.y - 46,
      type === "turret" ? "点击战场放置炮塔"
        : type === "field" ? "点击战场放置缓速场"
        : "点击战场放置城墙", "#ffd666", 15);
    refreshHud(true);
  }

  function defenseMaxHp(type) {
    const base = type === "turret" ? CFG.RUN.DEF_TURRET_HP
      : type === "field" ? CFG.RUN.DEF_FIELD_HP
      : CFG.RUN.DEF_WALL_HP;
    return Math.round(base * (1 + (chapter - 1) * CFG.RUN.DEF_HP_GROWTH));
  }

  // ===== 防线升级 / 手动修复（F 或右下角按钮）=====
  function defenseLevel(d) { return Math.max(1, (d && d.level) || 1); }

  function defenseOfId(id) {
    for (let i = 0; i < turrets.length; i++) if (turrets[i].id === id) return turrets[i];
    for (let i = 0; i < fields.length; i++) if (fields[i].id === id) return fields[i];
    for (let i = 0; i < walls.length; i++) if (walls[i].id === id) return walls[i];
    return null;
  }

  function nearestAnyDefense(x, y, maxDist) {
    let best = null;
    let bestD = maxDist * maxDist;
    const groups = [turrets, fields, walls];
    for (let g = 0; g < groups.length; g++) {
      const arr = groups[g];
      for (let i = 0; i < arr.length; i++) {
        const d = arr[i];
        if (d.dead) continue;
        const dd = dist2(x, y, d.x, d.y);
        if (dd < bestD) { bestD = dd; best = d; }
      }
    }
    return best ? { d: best, x: best.x, y: best.y, hitR: best.hitR || 18, dist2: bestD } : null;
  }

  function defenseUpgradeCost(d) {
    return d && d.kind === "turret" ? CFG.RUN.DEF_UPGRADE_COST : CFG.RUN.DEF_UPGRADE_COST_SMALL;
  }

  // 等级带来的几何变化（客户端也按等级还原，保持渲染一致）
  function applyDefenseLevel(d) {
    if (!d) return;
    const lv = defenseLevel(d);
    if (d.kind === "field") {
      d.r = CFG.RUN.FIELD_RADIUS * view.scale * Math.pow(1.12, lv - 1);
    } else if (d.kind === "wall") {
      d.len = CFG.RUN.WALL_LEN * view.scale * Math.pow(1.06, lv - 1);
      d.thick = CFG.RUN.WALL_THICK * view.scale * Math.pow(1.1, lv - 1);
      d.hitR = d.thick * 0.5 + 6;
    }
  }

  function repairDefense(d) {
    if (!d || d.dead) return false;
    if (d.hp >= d.maxHp - 0.5) {
      addText(d.x, d.y - 34, "耐久已满", "#9ad8ff", 12);
      return false;
    }
    if (cores < CFG.RUN.DEF_REPAIR_COST) {
      addText(d.x, d.y - 34, "核心不足（需 " + CFG.RUN.DEF_REPAIR_COST + "）", "#ff9f9f", 12);
      return false;
    }
    cores -= CFG.RUN.DEF_REPAIR_COST;
    const heal = Math.round(d.maxHp * CFG.RUN.DEF_REPAIR_PCT);
    d.hp = Math.min(d.maxHp, d.hp + heal);
    d.repairT = CFG.RUN.DEF_REPAIR_DELAY;
    d.flash = 0.6;
    emit(d.x, d.y, 10, "#8bffdc", 170, 2.6, 0.45);
    addText(d.x, d.y - 34, "防线修复 +" + heal, "#8bffdc", 13);
    sfxLevelUp();
    refreshHud(true);
    return true;
  }

  function upgradeDefense(d) {
    if (!d || d.dead) return false;
    const lv = defenseLevel(d);
    if (lv >= CFG.RUN.DEF_MAX_LEVEL) {
      addText(d.x, d.y - 34, "防线已满级", "#9ad8ff", 12);
      return false;
    }
    const cost = defenseUpgradeCost(d);
    if (cores < cost) {
      addText(d.x, d.y - 34, "核心不足（需 " + cost + "）", "#ff9f9f", 12);
      return false;
    }
    cores -= cost;
    d.level = lv + 1;
    d.maxHp = Math.round(d.maxHp * 1.35);
    d.hp = d.maxHp;
    d.repairT = 0;
    d.flash = 0.8;
    if (d.kind === "turret") {
      d.dmg *= 1.3;
      d.range = (d.range || CFG.RUN.TURRET_RANGE) * 1.08;
      d.cdBase = Math.max(0.38, (d.cdBase || CFG.RUN.TURRET_CD) * 0.95);
    }
    applyDefenseLevel(d);
    emit(d.x, d.y, 18, "#ffd666", 220, 3, 0.6);
    addText(d.x, d.y - 34, "防线升级 Lv" + d.level, "#ffd666", 14);
    shake = Math.max(shake, 2.5 * CFG.FX.SHAKE);
    sfxLevelUp();
    refreshHud(true);
    return true;
  }

  function interactDefense() {
    if (state !== "playing") return;
    const who = getLocalPlayer() || player;
    if (!who || who.down || who.eliminated) return;
    const nd = nearestAnyDefense(who.x, who.y, 92 * view.scale);
    if (!nd) {
      addText(who.x, who.y - 46, "靠近防线后可升级 / 修复", "#9ad8ff", 12);
      return;
    }
    const d = nd.d;
    const act = d.hp < d.maxHp - 0.5 ? "repair" : "upgrade";
    if (roomCode && coopIsGuest()) {
      coopEventSeq += 1;
      coopSendCtrl({ t: "ev", id: coopEventSeq, k: "def-act", d: { id: d.id, act } });
      addText(d.x, d.y - 34, act === "repair" ? "修复请求已发送" : "升级请求已发送", "#9ad8ff", 12);
      return;
    }
    if (act === "repair") repairDefense(d);
    else upgradeDefense(d);
  }

  // 圆与城墙（有向矩形）的碰撞：返回推出法线与深度
  function wallHit(w, x, y, r) {
    const ca = Math.cos(w.ang), sa = Math.sin(w.ang);
    const dx = x - w.x, dy = y - w.y;
    const lx = dx * ca + dy * sa;
    const ly = -dx * sa + dy * ca;
    const hx = w.len / 2, hy = w.thick / 2;
    const cx = clamp(lx, -hx, hx);
    const cy = clamp(ly, -hy, hy);
    let ox = lx - cx, oy = ly - cy;
    const d2 = ox * ox + oy * oy;
    if (d2 > r * r) return null;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      ox /= d; oy /= d;
      return {
        nx: ox * ca - oy * sa,
        ny: ox * sa + oy * ca,
        depth: r - d,
      };
    }
    // 圆心落在矩形内部：沿最近的边推出
    const px = hx - Math.abs(lx) + r;
    const py = hy - Math.abs(ly) + r;
    if (px < py) {
      const sx = lx >= 0 ? 1 : -1;
      return { nx: sx * ca, ny: sx * sa, depth: px };
    }
    const sy = ly >= 0 ? 1 : -1;
    return { nx: -sy * sa, ny: sy * ca, depth: py };
  }

  // 敌人转火：返回距离内最近的防线（城墙不主动吸引仇恨，只做物理阻挡）
  function nearestDefense(x, y, maxDist) {
    let best = null;
    let bestD = maxDist * maxDist;
    for (let i = 0; i < turrets.length; i++) {
      const d = turrets[i];
      if (d.dead) continue;
      const dd = dist2(x, y, d.x, d.y);
      if (dd < bestD) { bestD = dd; best = d; }
    }
    for (let i = 0; i < fields.length; i++) {
      const d = fields[i];
      if (d.dead) continue;
      const dd = dist2(x, y, d.x, d.y);
      if (dd < bestD) { bestD = dd; best = d; }
    }
    return best ? { d: best, x: best.x, y: best.y, hitR: best.hitR || 18, dist2: bestD } : null;
  }

  // 最近的城墙（Boss 碾压用）
  function nearestWall(x, y, maxDist) {
    let best = null;
    let bestD = maxDist * maxDist;
    for (let i = 0; i < walls.length; i++) {
      const d = walls[i];
      if (d.dead) continue;
      const dd = dist2(x, y, d.x, d.y);
      if (dd < bestD) { bestD = dd; best = d; }
    }
    return best;
  }

  function defenseAt(x, y, pad) {
    for (let i = 0; i < turrets.length; i++) {
      const d = turrets[i];
      if (d.dead) continue;
      const rr = (d.hitR || 18) + pad;
      if (dist2(x, y, d.x, d.y) <= rr * rr) return d;
    }
    for (let i = 0; i < fields.length; i++) {
      const d = fields[i];
      if (d.dead) continue;
      const rr = (d.hitR || 20) + pad;
      if (dist2(x, y, d.x, d.y) <= rr * rr) return d;
    }
    for (let i = 0; i < walls.length; i++) {
      const d = walls[i];
      if (d.dead) continue;
      if (wallHit(d, x, y, pad + 1)) return d;
    }
    return null;
  }

  function hurtDefense(d, dmg, source) {
    if (!d || d.dead || d.synced) return;
    const dealt = Math.min(d.hp, Math.max(0, dmg));
    defDamageTaken += dealt;
    d.hp -= Math.max(0, dmg);
    d.flash = 1;
    d.repairT = CFG.RUN.DEF_REPAIR_DELAY;
    emit(d.x, d.y, 4, "#ffb3a0", 130, 2, 0.3);
    if (d.hp <= 0) destroyDefense(d);
  }

  // 脱战自修复：一段时间没挨打后缓慢恢复耐久
  function tickDefRepair(d, dt) {
    if (d.dead || d.hp >= d.maxHp) return;
    if (d.repairT > 0) { d.repairT -= dt; return; }
    d.hp = Math.min(d.maxHp, d.hp + d.maxHp * CFG.RUN.DEF_REPAIR_RATE * dt);
  }

  function destroyDefense(d) {
    if (!d || d.dead) return;
    d.dead = true;
    defLost += 1;
    emit(d.x, d.y, 22, "#ffd666", 240, 3.2, 0.65);
    addText(d.x, d.y - 30, "防线被摧毁", "#ff6b6b", 14);
    shake = Math.max(shake, 5 * CFG.FX.SHAKE);
    sfxExplode(false);
    const arr = d.kind === "turret" ? turrets : d.kind === "wall" ? walls : fields;
    const idx = arr.indexOf(d);
    if (idx >= 0) arr.splice(idx, 1);
  }

  function placeDefense(type, x, y, owner, remote) {
    if (type !== "turret" && type !== "field" && type !== "wall") return false;
    const who = owner || getLocalPlayer() || player;
    if (!who) return false;

    // 联机客户端：只上报部署请求，由房主校验核心/上限/距离并生成
    if (roomCode && coopIsGuest() && !remote) {
      coopEventSeq += 1;
      coopSendCtrl({ t: "ev", id: coopEventSeq, k: "build", d: { type, x: Math.round(x), y: Math.round(y) } });
      // 本地先显示半透明预测，房主确认后由快照实体化
      const gdx = x - who.x, gdy = y - who.y;
      buildGhosts.push({
        type, x, y, t: 0,
        ang: type === "wall" && (gdx * gdx + gdy * gdy > 1) ? Math.atan2(gdy, gdx) + Math.PI / 2 : 0,
      });
      if (buildGhosts.length > 8) buildGhosts.shift();
      buildMode = null;
      refreshHud(true);
      addText(who.x, who.y - 46, "部署请求已发送", "#9ad8ff", 13);
      return true;
    }

    const dx = x - who.x, dy = y - who.y;
    const maxD = CFG.RUN.DEF_BUILD_RANGE * view.scale;
    if (dx * dx + dy * dy > maxD * maxD) {
      addText(who.x, who.y - 46, "超出部署范围", "#ff9f9f", 13);
      return false;
    }

    const cost = defenseCost(type);
    if (cores < cost || defenseAtCap(type)) {
      buildMode = null;
      refreshHud(true);
      return false;
    }

    const hp = defenseMaxHp(type);
    cores -= cost;
    if (type === "turret") {
      turrets.push({
        id: nextPropId++, kind: "turret", x, y, cd: 0, ang: -Math.PI / 2,
        seed: Math.random() * TAU, hp, maxHp: hp, hitR: 18, flash: 0,
        level: 1, cdBase: CFG.RUN.TURRET_CD,
        dmg: Math.max(CFG.RUN.TURRET_DMG, who.stats.damage * 0.5),
        speed: who.stats.bulletSpeed,
        range: CFG.RUN.TURRET_RANGE,
        oc: 0, ocT: 0,
        owner: who.id,
      });
      addText(x, y - 26, "炮塔已部署", "#ffd666", 14);
    } else if (type === "field") {
      fields.push({
        id: nextPropId++, kind: "field", x, y,
        r: CFG.RUN.FIELD_RADIUS * view.scale, seed: Math.random() * TAU,
        hp, maxHp: hp, hitR: 20, flash: 0, level: 1,
      });
      addText(x, y - 26, "缓速场已展开", "#8ff6ff", 14);
    } else {
      // 城墙沿玩家到落点的切线方向展开，默认横在敌人来向上
      const ang = (dx * dx + dy * dy > 1) ? Math.atan2(dy, dx) + Math.PI / 2 : 0;
      walls.push({
        id: nextPropId++, kind: "wall", x, y, ang,
        len: CFG.RUN.WALL_LEN * view.scale,
        thick: CFG.RUN.WALL_THICK * view.scale,
        seed: Math.random() * TAU, hp, maxHp: hp, flash: 0,
        hitR: CFG.RUN.WALL_THICK * view.scale * 0.5 + 6, level: 1,
        charge: 0,
      });
      addText(x, y - 26, "城墙已架设", "#d8e6ff", 14);
    }
    emit(x, y, 16, "#ffd666", 200, 3, 0.6);
    sfxLevelUp();
    buildMode = null;
    refreshHud(true);
    return true;
  }

  function updateDefenses(dt) {
    // 受击闪白衰减（客户端也要跑）
    for (let i = 0; i < turrets.length; i++) {
      if (turrets[i].flash > 0) turrets[i].flash = Math.max(0, turrets[i].flash - dt * 9);
    }
    for (let i = 0; i < fields.length; i++) {
      if (fields[i].flash > 0) fields[i].flash = Math.max(0, fields[i].flash - dt * 9);
    }
    for (let i = 0; i < walls.length; i++) {
      if (walls[i].flash > 0) walls[i].flash = Math.max(0, walls[i].flash - dt * 9);
    }
    // 联机客户端的建造预测残影：超时或已被房主实体化后移除
    for (let i = buildGhosts.length - 1; i >= 0; i--) {
      const g = buildGhosts[i];
      g.t += dt;
      const arr = g.type === "turret" ? turrets : g.type === "field" ? fields : walls;
      let done = g.t > 3;
      if (!done) {
        for (let j = 0; j < arr.length; j++) {
          const d = arr[j];
          if (d.synced && dist2(g.x, g.y, d.x, d.y) < 44 * 44) { done = true; break; }
        }
      }
      if (done) buildGhosts.splice(i, 1);
    }
    if (coopIsGuest()) return;   // 客户端防线由房主快照驱动

    // 脱战自修复
    for (let i = 0; i < turrets.length; i++) tickDefRepair(turrets[i], dt);
    for (let i = 0; i < fields.length; i++) tickDefRepair(fields[i], dt);
    for (let i = 0; i < walls.length; i++) tickDefRepair(walls[i], dt);

    for (let i = 0; i < turrets.length; i++) {
      const t = turrets[i];
      if (t.dead) continue;
      // 过载层数到期清空
      if (t.ocT > 0) {
        t.ocT -= dt;
        if (t.ocT <= 0) { t.ocT = 0; t.oc = 0; }
      }
      const range = (t.range || CFG.RUN.TURRET_RANGE) * view.scale;
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
          t.cd = t.cdBase || CFG.RUN.TURRET_CD;
          if (bullets.length < CFG.LIMITS.BULLETS) {
            const sp = (t.speed || stats.bulletSpeed) * view.scale * 0.9;
            bullets.push({
              bid: nextBulletId++,
              owner: t.owner,
              x: t.x, y: t.y,
              vx: Math.cos(t.ang) * sp,
              vy: Math.sin(t.ang) * sp,
              r: 3.4,
              dmg: (t.dmg || Math.max(6, stats.damage * 0.5)) *
                (1 + (t.oc || 0) * CFG.RUN.TURRET_OC_DMG),
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
      if (f.dead) continue;
      const r2 = f.r * f.r;
      for (let k = 0; k < enemies.length; k++) {
        const e = enemies[k];
        if (e.dead || e.isBoss) continue;
        if (dist2(f.x, f.y, e.x, e.y) <= r2) e.slowT = 0.14;
      }
    }
  }

  // 防线联动：靠近炮塔时缩短射击间隔
  function defenseFireMul(p) {
    if (!p) return 1;
    const r2 = (CFG.RUN.TURRET_AURA * view.scale) ** 2;
    for (let i = 0; i < turrets.length; i++) {
      const t = turrets[i];
      if (t.dead) continue;
      if (dist2(p.x, p.y, t.x, t.y) <= r2) return CFG.RUN.TURRET_AURA_FIRE;
    }
    return 1;
  }

  // 防线联动：施放技能为附近炮塔叠加过载
  function overclockNearbyTurrets(p) {
    if (!p) return;
    const r2 = (CFG.RUN.TURRET_OC_RADIUS * view.scale) ** 2;
    let hit = false;
    for (let i = 0; i < turrets.length; i++) {
      const t = turrets[i];
      if (t.dead) continue;
      if (dist2(p.x, p.y, t.x, t.y) > r2) continue;
      t.oc = Math.min(CFG.RUN.TURRET_OC_MAX, (t.oc || 0) + 1);
      t.ocT = CFG.RUN.TURRET_OC_TIME;
      hit = true;
    }
    if (hit) addText(p.x, p.y - 34, "炮塔过载 +1", "#ffd666", 12);
  }

  // 防线联动：擦弹为附近城墙充能，充满释放冲击波
  function chargeNearbyWalls(p) {
    if (!p) return;
    const r2 = (CFG.RUN.WALL_CHARGE_RADIUS * view.scale) ** 2;
    for (let i = 0; i < walls.length; i++) {
      const w = walls[i];
      if (w.dead) continue;
      if (dist2(p.x, p.y, w.x, w.y) > r2) continue;
      w.charge = (w.charge || 0) + 1;
      emit(w.x, w.y, 4, "#8ff6ff", 120, 1.8, 0.3);
      if (w.charge >= CFG.RUN.WALL_CHARGE_MAX) {
        w.charge = 0;
        explodeAt(w.x, w.y, p.stats.damage * CFG.RUN.WALL_CHARGE_DMG,
          null, CFG.RUN.WALL_CHARGE_R * view.scale, "#8ff6ff", p.id);
        emit(w.x, w.y, 18, "#8ff6ff", 260, 3, 0.6);
        addText(w.x, w.y - 30, "城墙脉冲", "#8ff6ff", 13);
      }
    }
  }

  // ===== 章节切换（无尽远航）=====
  function chapterClear() {
    if (coopIsGuest()) return;
    victoryFlash = 0;
    slowmo = 0;
    chapter += 1;
    chapterStartElapsed = elapsed;
    waveNum = 1;
    bossSpawned = false;
    boss = null;
    enemies.length = 0;
    ebullets.length = 0;
    hazards.length = 0;
    hazardTimer = CFG.EVENTS.HAZARD.INTERVAL;
    hunterTimer = 14;
    hunterSpawned = false;
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
    emit(player.x, player.y, 34, "#8bffdc", 280, 3.6, 0.9);
    sfxWin();
    refreshHud(true);
    prepareSectorChoice();
  }

