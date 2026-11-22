  /* =====================================================================
   * 10. 经验与升级系统
   * ===================================================================*/
  const RARITIES = [
    { key: "common", name: "普通", weight: 52, mult: 1.0 },
    { key: "rare",   name: "稀有", weight: 30, mult: 1.6 },
    { key: "epic",   name: "史诗", weight: 14, mult: 2.35 },
    { key: "legend", name: "传说", weight: 4,  mult: 3.2 },
  ];

  // 强化定义：apply 修改 stats / player；desc 展示数值变化
  const UPGRADES = [
    {
      id: "rapid", name: "超频射击", icon: "⚡", max: 8,
      base: 0.09, minRarity: 0,
      apply(s, m) { s.fireInterval = Math.max(0.06, s.fireInterval / (1 + m)); },
      desc(s, m) {
        return `射速 <b>+${Math.round(m * 100)}%</b><br>射击间隔 ${s.fireInterval.toFixed(2)}s → ${(s.fireInterval / (1 + m)).toFixed(2)}s`;
      },
    },
    {
      id: "power", name: "过载弹头", icon: "✦", max: 9,
      base: 3.2, minRarity: 0,
      apply(s, m) { s.damage += m; },
      desc(s, m) {
        return `子弹伤害 <b>+${m.toFixed(1)}</b><br>${s.damage.toFixed(1)} → ${(s.damage + m).toFixed(1)}`;
      },
    },
    {
      id: "crit", name: "致命校准", icon: "◈", max: 8,
      base: 0.05, minRarity: 0,
      apply(s, m) { s.crit = Math.min(0.8, s.crit + m); },
      desc(s, m) {
        return `暴击率 <b>+${Math.round(m * 100)}%</b><br>${Math.round(s.crit * 100)}% → ${Math.round(Math.min(0.8, s.crit + m) * 100)}%`;
      },
    },
    {
      id: "shield", name: "棱镜护盾", icon: "⬡", max: 7,
      base: 11, minRarity: 0,
      apply(s, m, p) {
        s.shieldMax += m;
        p.shield = Math.min(s.shieldMax, p.shield + m);
      },
      desc(s, m) {
        return `护盾上限 <b>+${Math.round(m)}</b><br>${Math.round(s.shieldMax)} → ${Math.round(s.shieldMax + m)}`;
      },
    },
    {
      id: "regen", name: "自愈回路", icon: "✚", max: 6,
      base: 1.1, minRarity: 0,
      apply(s, m) { s.shieldRegen += m; },
      desc(s, m) {
        return `护盾恢复 <b>+${m.toFixed(1)}/s</b><br>${s.shieldRegen.toFixed(1)} → ${(s.shieldRegen + m).toFixed(1)}`;
      },
    },
    {
      id: "speed", name: "矢量推进", icon: "➤", max: 7,
      base: 0.06, minRarity: 0,
      apply(s, m) { s.moveSpeed *= 1 + m; },
      desc(s, m) {
        return `移动速度 <b>+${Math.round(m * 100)}%</b><br>${Math.round(s.moveSpeed)} → ${Math.round(s.moveSpeed * (1 + m))}`;
      },
    },
    {
      id: "heal", name: "纳米修复", icon: "❤", max: 99,
      base: 24, minRarity: 0,
      apply(s, m, p) { p.hp = Math.min(p.hpMax, p.hp + m); },
      desc(s, m, p) {
        return `立即回复生命 <b>${Math.round(m)}</b><br>${Math.ceil(p.hp)} → ${Math.ceil(Math.min(p.hpMax, p.hp + m))}`;
      },
    },
    {
      id: "drone", name: "守护无人机", icon: "⬢", max: 3, minRarityIndex: 1,
      base: 0.45, minRarity: 1,
      apply(s) { s.drones = Math.min(CFG.DRONES.MAX, (s.drones || 0) + 1); },
      desc(s) {
        const cur = s.drones || 0;
        const next = Math.min(CFG.DRONES.MAX, cur + 1);
        return `环绕无人机 <b>+1 架</b><br>${cur} → ${next} 架（自动索敌辅助射击）`;
      },
    },
    {
      id: "multi", name: "分裂弹道", icon: "⋔", max: 2, minRarity: 1,
      base: 1, minRarityIndex: 1,
      apply(s) { s.bulletCount += 1; },
      desc(s) {
        return `子弹数量 <b>+1</b><br>${s.bulletCount} 发 → ${s.bulletCount + 1} 发`;
      },
    },
    {
      id: "pierce", name: "穿透核心", icon: "↟", max: 3,
      base: 1, minRarity: 0,
      apply(s) { s.pierce += 1; },
      desc(s) {
        return `穿透次数 <b>+1</b><br>${s.pierce} → ${s.pierce + 1}`;
      },
    },
    {
      id: "armor", name: "复合装甲", icon: "▣", max: 7,
      base: 0.05, minRarity: 0,
      apply(s, m) { s.armor = Math.min(0.65, 1 - (1 - s.armor) * (1 - m)); },
      desc(s, m) {
        const after = Math.min(0.65, 1 - (1 - s.armor) * (1 - m));
        return `伤害减免 <b>+${Math.round((after - s.armor) * 100)}%</b><br>${Math.round(s.armor * 100)}% → ${Math.round(after * 100)}%`;
      },
    },
    {
      id: "range", name: "深空雷达", icon: "◎", max: 6,
      base: 0.15, minRarity: 0,
      apply(s, m) { s.range *= 1 + m; },
      desc(s, m) {
        return `攻击范围 <b>+${Math.round(m * 100)}%</b><br>${Math.round(s.range)} → ${Math.round(s.range * (1 + m))}`;
      },
    },
    /* ---------- 诅咒强化：强力但带代价 ---------- */
    {
      id: "curse_blood", name: "血债契约", icon: "☠", max: 2, base: 0.3, curse: true,
      apply(s, m) { s.damage *= 1 + m; s.takenMul *= 1.12; },
      desc(s, m) {
        return `子弹伤害 <b>+${Math.round(m * 100)}%</b><br>代价：受到伤害 <b>+12%</b>`;
      },
    },
    {
      id: "curse_frenzy", name: "狂乱低语", icon: "☠", max: 1, base: 0.28, curse: true,
      apply(s, m) { s.fireInterval = Math.max(0.06, s.fireInterval / (1 + m)); s.enemySpeedMul *= 1.12; },
      desc() {
        return `射速 <b>+28%</b><br>代价：敌人移速 <b>+12%</b>`;
      },
    },
    {
      id: "curse_greed", name: "贪欲之眼", icon: "☠", max: 2, base: 0.4, curse: true,
      apply(s, m) { s.xpMul *= 1 + m; s.takenMul *= 1.12; },
      desc(s, m) {
        return `经验获取 <b>+${Math.round(m * 100)}%</b><br>代价：受到伤害 <b>+12%</b>`;
      },
    },
    {
      id: "curse_glass", name: "易碎核心", icon: "☠", max: 2, base: 0.12, curse: true,
      apply(s, m) { s.crit = Math.min(0.8, s.crit + m); s.shieldRegen *= 0.45; },
      desc(s, m) {
        return `暴击率 <b>+${Math.round(m * 100)}%</b><br>代价：护盾恢复 <b>-55%</b>`;
      },
    },
  ];

  // 进化强化：满足组合条件后才会出现在升级选项中（一次性）
  const EVOLUTIONS = [
    {
      id: "evo_fission", name: "裂变弹", icon: "✹", max: 1, evolution: true,
      require: (s) => s.pierce >= 1 && s.crit >= 0.22,
      apply(s) { s.explodeOnHit = true; },
      desc() {
        return `子弹命中时引发半径 48 的爆炸<br>对周围敌人造成 <b>60%</b> 伤害`;
      },
    },
    {
      id: "evo_echo", name: "虚空回响", icon: "◉", max: 1, evolution: true,
      require: (s) => s.bulletCount >= 2 && s.fireInterval <= 0.21,
      apply(s) { s.echoBurst = true; },
      desc() {
        return `每 <b>4 秒</b>自动释放一圈回响弹<br>共 8 发，每发 <b>50%</b> 伤害`;
      },
    },
    // ===== 武器进化分支：脉冲 =====
    {
      id: "evo_twin", name: "双子脉冲", icon: "≋", max: 1, evolution: true, weapon: "pulse",
      require: (s) => s.bulletCount >= 2,
      apply(s) { s.twinPulse = true; },
      desc() {
        return `<b>每次射击</b>额外发射 2 道侧向脉冲<br>每道造成 <b>70%</b> 伤害`;
      },
    },
    {
      id: "evo_pulseblast", name: "湮灭脉冲", icon: "✺", max: 1, evolution: true, weapon: "pulse",
      require: (s) => s.pierce >= 1,
      apply(s) { s.pulseBlast = true; },
      desc() {
        return `脉冲命中引发半径 56 的湮灭爆炸<br>对周围敌人造成 <b>45%</b> 伤害`;
      },
    },
    // ===== 武器进化分支：散射 =====
    {
      id: "evo_scatterblast", name: "霰爆核心", icon: "✷", max: 1, evolution: true, weapon: "scatter",
      require: (s) => s.crit >= 0.2,
      apply(s) { s.scatterBlast = true; },
      desc() {
        return `每颗弹丸命中引发半径 38 的小爆炸<br>造成 <b>35%</b> 伤害，清群更快`;
      },
    },
    {
      id: "evo_scatterstorm", name: "星霰风暴", icon: "❋", max: 1, evolution: true, weapon: "scatter",
      require: (s) => s.bulletCount >= 6,
      apply(s) {
        s.bulletCount += 3;
        s.damage *= 0.88;
        s.spread = (s.spread || 0) + 0.06;
      },
      desc() {
        return `弹丸 <b>+3</b>，散射范围更宽<br>单发伤害 <b>-12%</b>，形成弹幕风暴`;
      },
    },
    // ===== 武器进化分支：轨道 =====
    {
      id: "evo_rail_lance", name: "贯穿轨道", icon: "⊹", max: 1, evolution: true, weapon: "rail",
      require: (s) => s.pierce >= 4,
      apply(s) {
        s.pierce += 3;
        s.damage *= 1.3;
        s.bulletR += 1.2;
        s.bulletSpeed *= 1.1;
      },
      desc() {
        return `穿透 <b>+3</b>，伤害 <b>+30%</b><br>弹体更宽、弹速更快，一穿到底`;
      },
    },
    {
      id: "evo_railshard", name: "裂变轨道", icon: "⁂", max: 1, evolution: true, weapon: "rail",
      require: (s) => s.damage >= 40,
      apply(s) { s.railShard = true; },
      desc() {
        return `轨道命中后分裂 1 枚碎片<br>自动射向附近敌人，造成 <b>50%</b> 伤害`;
      },
    },
  ];

  const ALL_DEFS = UPGRADES.concat(EVOLUTIONS);

  function gainXp(v) {
    gainXpFor(getLocalPlayer() || player, v);
  }

  // 个人经验结算（P4-01）：联机时每名玩家独立成长
  function gainXpFor(p, v) {
    if (!p || coopIsGuest()) return;      // 客户端经验由房主裁决
    p.xp += v;
    while (p.xp >= p.xpNeed) {
      p.xp -= p.xpNeed;
      p.level += 1;
      p.xpNeed = Math.round(p.xpNeed * CFG.XP.GROWTH);
      p.pendingLevels += 1;
    }
    const lp = getLocalPlayer() || player;
    if (p === lp) syncProgressGlobals(p);
    if (p.pendingLevels > 0 && state === "playing") {
      if (roomCode) coopOfferUpgrade(p);   // 联机：个人弹窗 + 房主报价
      else openUpgrade();
    }
  }

  // 兼容旧逻辑：全局 xp/level 始终镜像本地玩家
  function syncProgressGlobals(p) {
    if (!p) return;
    xp = p.xp;
    level = p.level;
    xpNeed = p.xpNeed;
    pendingLevels = p.pendingLevels;
  }

  function rollRarity() {
    let total = 0;
    for (const r of RARITIES) total += r.weight;
    let roll = Math.random() * total;
    for (const r of RARITIES) {
      roll -= r.weight;
      if (roll <= 0) return r;
    }
    return RARITIES[0];
  }

  function makeCard(def, rarity, lp) {
    // 进化与诅咒不随稀有度放大，数值固定
    const mult = def.curse || def.evolution ? def.base : def.base * rarity.mult;
    const owner = lp || getLocalPlayer() || player;
    return {
      def,
      rarity,
      mult,
      text: def.desc(owner.stats, mult, owner),
    };
  }

  function buildCards(owner) {
    const lp = owner || getLocalPlayer() || player;
    const stacks = lp.stacks;   // 升级选项只看该玩家的堆叠
    const chosen = new Set();
    const cards = [];

    // 1) 进化：满足组合条件时，大概率作为第一张卡出现
    const evoPool = EVOLUTIONS.filter((d) =>
      (stacks[d.id] || 0) < d.max &&
      (!d.weapon || d.weapon === lp.weapon) &&
      d.require(lp.stats));
    if (evoPool.length && Math.random() < 0.75) {
      const def = pick(evoPool);
      chosen.add(def.id);
      cards.push(makeCard(def, RARITIES[3], lp));
    }

    // 2) 诅咒：约 20% 概率占一个位置（每轮最多一张）
    if (cards.length < 3 && Math.random() < 0.2) {
      const pool = UPGRADES.filter((d) => d.curse && (stacks[d.id] || 0) < d.max && !chosen.has(d.id));
      if (pool.length) {
        const def = pick(pool);
        chosen.add(def.id);
        cards.push(makeCard(def, RARITIES[2], lp));
      }
    }

    let guard = 0;
    // 3) 普通强化：按稀有度抽取不重复项
    while (cards.length < 3 && guard++ < 80) {
      const rarity = rollRarity();
      const rIdx = RARITIES.indexOf(rarity);
      const pool = UPGRADES.filter((d) => {
        if (d.curse) return false;
        if ((stacks[d.id] || 0) >= d.max) return false;
        if (d.minRarityIndex !== undefined && rIdx < d.minRarityIndex) return false;
        return !chosen.has(d.id);
      });
      if (!pool.length) continue;
      const def = pick(pool);
      chosen.add(def.id);
      cards.push(makeCard(def, rarity, lp));
    }

    // 候选不足时允许重复补充（仍保证有效）
    guard = 0;
    while (cards.length < 3 && guard++ < 40) {
      const rIdx = 2;
      const pool = UPGRADES.filter((d) => {
        if (d.curse) return false;
        if ((stacks[d.id] || 0) >= d.max) return false;
        if (d.minRarityIndex !== undefined && rIdx < d.minRarityIndex) return false;
        return true;
      });
      if (!pool.length) break;
      const def = pick(pool);
      const rarity = RARITIES[Math.min(3, rIdx + randInt(2))];
      cards.push(makeCard(def, rarity, lp));
    }

    // 极端情况下至少提供治疗卡
    while (cards.length < 3) cards.push(makeCard(UPGRADES.find((d) => d.id === "heal"), RARITIES[0], lp));
    return cards;
  }

  function openUpgrade() {
    if (roomCode) { coopOfferUpgrade(getLocalPlayer() || player); return; }
    state = "upgrade";
    clearKeys();
    shake = 0;
    document.getElementById("ui-up-level").textContent = "LV " + level;
    upgradeCards = buildCards();
    renderCards();
    document.getElementById("ov-upgrade").classList.remove("hidden");
    sfxLevelUp();
    refreshHud();
  }

  function renderCards(cards) {
    const list = cards || upgradeCards;
    const wrap = document.getElementById("cards");
    let html = "";
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      const special = c.def.curse ? " curse" : c.def.evolution ? " evo" : "";
      const label = c.def.curse ? "诅咒" : c.def.evolution ? "进化" : c.rarity.name;
      html += `<button class="card rarity-${c.rarity.key}${special}" data-i="${i}">
        <span class="card-key">${i + 1}</span>
        <div class="card-top"><span class="card-ic">${c.def.icon}</span><span class="card-rt">${label}</span></div>
        <h3>${c.def.name}</h3>
        <p>${c.text}</p>
      </button>`;
    }
    wrap.innerHTML = html;
  }

  function chooseUpgrade(idx) {
    if (roomCode) { coopPickUpgrade(idx); return; }
    if (state !== "upgrade") return;
    const card = upgradeCards[idx];
    if (!card) return;
    const lp = getLocalPlayer() || player;
    card.def.apply(lp.stats, card.mult, lp);
    lp.stacks[card.def.id] = (lp.stacks[card.def.id] || 0) + 1;
    pendingLevels -= 1;

    document.getElementById("ov-upgrade").classList.add("hidden");
    updateBuffPanel();
    refreshHud(true);

    if (pendingLevels > 0) {
      upgradeCards = buildCards();
      document.getElementById("ui-up-level").textContent = "LV " + level;
      renderCards();
      document.getElementById("ov-upgrade").classList.remove("hidden");
      sfxLevelUp();
      state = "upgrade";
      return;
    }

    state = "playing";
    lastFrame = performance.now();
  }

