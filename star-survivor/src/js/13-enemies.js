  /* =====================================================================
   * 11. 敌人 / 波次 / Boss
   * ===================================================================*/
  function waveScaleHp() {
    // 用“等效波次”连续成长：章节切换时不回落，后期指数抬升
    const totalWave = (chapter - 1) * CFG.RUN.CHAPTER_WAVES + (waveNum - 1);
    return Math.pow(CFG.RUN.ENEMY_HP_GROWTH, totalWave);
  }
  function waveScaleArmor() {
    return Math.min(CFG.RUN.ENEMY_ARMOR_MAX, (chapter - 1) * CFG.RUN.ENEMY_ARMOR_PER_CHAPTER);
  }
  // 深渊适应：敌人生命随玩家武器伤害提升（次线性），避免后期一发清屏
  function playerPowerMul() {
    return Math.pow(Math.max(1, stats.damage / 10), CFG.RUN.POWER_ADAPT);
  }
  function waveScaleSpeed() {
    return Math.min(CFG.RUN.ENEMY_SPEED_CAP, 1 + (waveNum - 1) * 0.028 + (chapter - 1) * 0.06);
  }
  function waveScaleDmg() {
    return (1 + (waveNum - 1) * 0.045) * Math.pow(CFG.RUN.ENEMY_DMG_GROWTH, chapter - 1);
  }
  function ebSpeedScale() {
    const base = 1 + (waveNum - 1) * 0.018 + (chapter - 1) * CFG.RUN.EBULLET_SPEED_PER_CHAPTER;
    return Math.min(CFG.RUN.EBULLET_SPEED_CAP, base * (chapterMod ? chapterMod.ebMul || 1 : 1));
  }

  function weightedEnemyType() {
    const list = [];
    const totalWave = (chapter - 1) * CFG.RUN.CHAPTER_WAVES + waveNum;
    for (const key in CFG.ENEMIES) {
      const def = CFG.ENEMIES[key];
      let w = def.weight;
      if (def.minWave && totalWave < def.minWave) continue;
      if (key === "diamond") {
        w = waveNum >= CFG.WAVE.ELITE_WAVE ? 11 + (chapter - 1) * 2 : 0;
      }
      if (w > 0) list.push({ key, w });
    }
    let total = 0;
    for (const it of list) total += it.w;
    let r = Math.random() * total;
    for (const it of list) {
      r -= it.w;
      if (r <= 0) return it.key;
    }
    return "tri";
  }

  function spawnEnemy(typeKey, px, py, noAffix) {
    if (enemies.length >= CFG.LIMITS.ENEMIES) return null;
    const def = CFG.ENEMIES[typeKey];
    if (!def) return null;

    let x = px, y = py;
    if (x === undefined) {
      const margin = 56;
      // 从当前镜头外缘生成，避免贴脸；再限制在世界边界内
      for (let attempt = 0; attempt < 8; attempt++) {
        const side = randInt(4);
        if (side === 0) { x = rand(camera.x, camera.x + view.w); y = camera.y - margin; }
        else if (side === 1) { x = camera.x + view.w + margin; y = rand(camera.y, camera.y + view.h); }
        else if (side === 2) { x = rand(camera.x, camera.x + view.w); y = camera.y + view.h + margin; }
        else { x = camera.x - margin; y = rand(camera.y, camera.y + view.h); }
        x = clamp(x, 16, world.w - 16);
        y = clamp(y, 16, world.h - 16);
        if (dist2(x, y, player.x, player.y) > 220 * 220) break;
      }
    }

    const hp = def.hp * waveScaleHp() * playerPowerMul() *
      partyScale(CFG.COOP.ENEMY_HP_PER_EXTRA) *
      (chapterMod ? chapterMod.hpMul || 1 : 1);
    const e = {
      id: nextEnemyId++,
      type: typeKey,
      x, y,
      r: def.r,
      hp,
      maxHp: hp,
      speed: def.speed * waveScaleSpeed() * threatSpeedMul() * (chapterMod ? chapterMod.speedMul || 1 : 1),
      dmg: def.dmg * waveScaleDmg(),
      armor: waveScaleArmor(),
      xp: def.xp,
      score: def.score,
      color: THEME.enemy[typeKey] || def.color,
      angle: 0,
      seed: Math.random() * TAU,
      dashCd: rand(1, 2.4),
      dashTime: 0,
      dashAng: 0,
      warn: 0,                  // 突刺者蓄力预警
      healCd: rand(1.6, 3.2),   // 修补者治疗间隔
      healPulse: 0,
      huntT: 0,                 // 追猎者追击时长（越久越快）
      salvo: 0,                 // 交叉齐射窗口
      shotCd: rand(1.6, 3.4),   // 小怪首次开火延迟
      isBoss: false,
      dead: false,
      affixes: [],
    };

    // 第 5 波后：敌人随机获得词缀（精英必带）
    if (!noAffix && waveNum >= CFG.AFFIX.START_WAVE) {
      const elite = typeKey === "diamond";
      const chance = Math.min(
        CFG.AFFIX.MAX_CHANCE,
        CFG.AFFIX.BASE_CHANCE + (waveNum - CFG.AFFIX.START_WAVE) * CFG.AFFIX.PER_WAVE +
        (chapter - 1) * CFG.AFFIX.PER_CHAPTER + threatEliteChance()
      );
      const pool = ["shield", "haste", "split", "boom"];
      if (elite || Math.random() < chance) {
        const first = pick(pool);
        e.affixes.push(first);
        if (elite) {
          const extraChance = Math.min(0.95, CFG.AFFIX.ELITE_EXTRA + (chapter - 1) * 0.12);
          if (Math.random() < extraChance) {
            const rest = pool.filter((a) => a !== first);
            const second = pick(rest);
            e.affixes.push(second);
            // 第 3 星域起精英有概率三词缀
            if (chapter >= 3 && Math.random() < 0.35) {
              e.affixes.push(pick(rest.filter((a) => a !== second)));
            }
          }
        }
      }
      if (e.affixes.includes("shield")) {
        e.hp *= CFG.AFFIX.SHIELD_HP;
        e.maxHp = e.hp;
        e.armor = Math.min(0.6, (e.armor || 0) + CFG.AFFIX.SHIELD_ARMOR);
      }
      if (e.affixes.includes("haste")) e.speed *= CFG.AFFIX.HASTE;
    }
    enemies.push(e);
    return e;
  }

  function spawnBoss() {
    if (bossSpawned) return;
    bossSpawned = true;
    const side = randInt(4);
    const margin = 90;
    let x, y;
    if (side === 0) { x = camera.x + view.w / 2; y = camera.y - margin; }
    else if (side === 1) { x = camera.x + view.w + margin; y = camera.y + view.h / 2; }
    else if (side === 2) { x = camera.x + view.w / 2; y = camera.y + view.h + margin; }
    else { x = camera.x - margin; y = camera.y + view.h / 2; }
    x = clamp(x, 70, world.w - 70);
    y = clamp(y, 70, world.h - 70);

    const B = CFG.BOSS;
    const hpMul = Math.pow(CFG.RUN.BOSS_HP_GROWTH, chapter - 1) * playerPowerMul() *
      partyScale(CFG.COOP.BOSS_HP_PER_EXTRA);
    const dmgMul = Math.pow(CFG.RUN.BOSS_DMG_GROWTH, chapter - 1);
    boss = {
      id: nextEnemyId++,
      type: "boss",
      x, y,
      r: B.r,
      hp: Math.round(B.hp * hpMul),
      maxHp: Math.round(B.hp * hpMul),
      speed: B.speed * Math.min(1.5, 1 + (chapter - 1) * 0.08),
      dmg: B.dmg * dmgMul,
      xp: Math.round(B.xp * (1 + (chapter - 1) * 0.35)),
      score: Math.round(B.score * (1 + (chapter - 1) * 0.5)),
      color: THEME.boss,
      angle: 0,
      seed: Math.random() * TAU,
      isBoss: true,
      dead: false,
      fireCd: 1.8,       // 瞄准扇形弹幕计时
      burstCd: 0.5,      // 旋转螺旋计时
      ringCd: 3.4,       // 环形弹幕计时
      minionCd: 8,       // 召唤计时
      warn: 0,           // 冲刺蓄力预警
      dashTime: 0,
      dashCd: 6,
      dashAng: 0,
      phase: 1,
      spin: 0,
      // ===== 机制组合：按星域固定，后期叠加额外机制 =====
      mechanics: (() => {
        const kits = CFG.BOSS.CHAPTER_KITS;
        const kit = kits[(chapter - 1) % kits.length].slice();
        if (chapter > kits.length) {
          const pool = ["laser", "shield", "summon", "rage", "homing"].filter((k) => !kit.includes(k));
          if (pool.length) kit.push(pool[(chapter - kits.length - 1) % pool.length]);
        }
        return kit;
      })(),
      shield: 0,
      shieldCd: 7,
      laserCd: 6,
      laserTime: 0,
      laserAng: 0,
      rage: 0,
      rageCd: 12,
      homingCd: 5,
    };
    enemies.push(boss);

    document.getElementById("ui-boss-name").textContent = bossLabel(boss);
    document.getElementById("boss-wrap").classList.remove("hidden");
    document.getElementById("ui-boss").style.width = "100%";
    shake = Math.max(shake, 18 * CFG.FX.SHAKE);
    hurtFlash = 0.7;
    emit(x, y, 46, "#ff3b6b", 260, 5, 1.1);
    sfxBoss();
    coopSendEvent("boss-spawn", { ch: chapter, hp: boss.hp });
  }

  function bossLabel(b) {
    const names = (b.mechanics || []).map((k) => CFG.BOSS.MECH_NAMES[k] || k).join(" / ");
    return CFG.BOSS.name + " · 星域 " + chapter + " · 阶段 " + ["", "I", "II", "III"][b.phase] +
      (names ? " · " + names : "");
  }

  function updateSpawner(dt) {
    if (coopIsGuest()) return;                          // 联机客户端的敌人由房主生成
    if (enemies.length >= CFG.LIMITS.ENEMIES) return;   // 达到上限则暂停生成
    if (boss && !boss.dead) return;                     // Boss 战期间暂停杂兵增援

    // 追猎者：每章一只，锁定玩家持续追击，越拖越快
    if (waveNum >= CFG.ENEMIES.hunter.minWave && !hunterSpawned) {
      hunterTimer -= dt;
      if (hunterTimer <= 0) {
        hunterSpawned = true;
        const h = spawnEnemy("hunter");
        if (h) {
          const cx = camera.x + view.w / 2;
          const cy = camera.y + view.h * 0.24;
          addText(cx, cy, "追猎者锁定", "#ff8fa3", 20);
          emit(h.x, h.y, 18, "#ff2d55", 220, 3, 0.6);
        }
      }
    }

    spawnTimer -= dt;
    if (spawnTimer > 0) return;

    spawnTimer = Math.max(CFG.WAVE.SPAWN_MIN,
      CFG.WAVE.SPAWN_BASE - (waveNum - 1) * 0.065 - (chapter - 1) * 0.06) *
      (chapterMod ? chapterMod.spawnMul || 1 : 1) / threatSpawnMul();
    const count = 1 + Math.floor(waveNum / 6) + Math.floor((chapter - 1) * 0.8) +
      (partyCount() - 1) * CFG.COOP.ENEMY_EXTRA_PER_EXTRA;
    for (let i = 0; i < count; i++) {
      spawnEnemy(weightedEnemyType());
    }
  }

  function updateBoss(b, dt, t) {
    const tgt = nearestPlayer(b.x, b.y);
    // ===== 阶段判定 =====
    const ratio = b.hp / b.maxHp;
    const nextPhase = ratio > CFG.BOSS.PHASE2 ? 1 : ratio > CFG.BOSS.PHASE3 ? 2 : 3;
    if (nextPhase !== b.phase) {
      b.phase = nextPhase;
      b.fireCd = 0.9;
      b.ringCd = 1.8;
      b.minionCd = 2.5;
      b.homingCd = Math.min(b.homingCd || 99, 2.5);
      b.warn = 0;
      b.dashTime = 0;
      document.getElementById("ui-boss-name").textContent = bossLabel(b);
      shake = Math.max(shake, 15 * CFG.FX.SHAKE);
      hurtFlash = 0.35;
      emit(b.x, b.y, 34, "#ffc857", 300, 4.5, 0.9);
      // 转阶段时消散部分弹幕，给玩家喘息空间
      for (let i = ebullets.length - 1; i >= 0; i--) {
        if (Math.random() < 0.45) ebullets.splice(i, 1);
      }
      sfxBoss();
      coopSendEvent("boss-phase", { p: nextPhase });
    }

    const dx = tgt.x - b.x;
    const dy = tgt.y - b.y;
    const d = Math.hypot(dx, dy) || 1;
    b.angle = Math.atan2(dy, dx);
    // 超载期间：Boss 移动、攻击频率与弹幕同步减速（Boss 对超载减速有抗性）
    const es = ultTimer > 0 ? Math.max(CFG.ULT.SLOW, 0.72) : 1;
    const slowDt = dt * es;

    // ===== 机制：限时狂暴 =====
    if (b.mechanics.includes("rage")) {
      if (b.rage > 0) {
        b.rage -= slowDt;
        if (b.rage <= 0) addText(b.x, b.y - b.r - 22, "狂暴结束", "#9ad8ff", 13);
      } else {
        b.rageCd -= slowDt;
        if (b.rageCd <= 0) {
          b.rage = CFG.BOSS.RAGE_TIME;
          b.rageCd = CFG.BOSS.RAGE_CD;
          addText(b.x, b.y - b.r - 22, "限时狂暴！", "#ff4d6d", 18);
          emit(b.x, b.y, 26, "#ff4d6d", 260, 3.6, 0.7);
          sfxBoss();
        }
      }
    }
    const rageMul = b.rage > 0 ? CFG.BOSS.RAGE_MUL : 1;
    const actDt = slowDt * rageMul;      // 攻击冷却推进
    const spdMul = stats.enemySpeedMul * rageMul;
    b.spin += actDt * (0.7 + b.phase * 0.35);

    // ===== 机制：分裂护盾 =====
    if (b.mechanics.includes("shield")) {
      b.shieldCd -= slowDt;
      if (b.shield <= 0 && b.shieldCd <= 0) {
        b.shield = Math.round(b.maxHp * CFG.BOSS.SHIELD_PCT);
        b.shieldCd = CFG.BOSS.SHIELD_CD;
        addText(b.x, b.y - b.r - 22, "分裂护盾生成", THEME.cyanSoft, 15);
        emit(b.x, b.y, 20, THEME.cyanSoft, 230, 3, 0.6);
      }
    }

    // ===== 机制：旋转激光 =====
    if (b.mechanics.includes("laser")) {
      if (b.laserTime > 0) {
        b.laserTime -= slowDt;
        b.laserAng += slowDt * 0.95;
        const px = tgt.x - b.x;
        const py = tgt.y - b.y;
        for (let k = 0; k < 2; k++) {
          const a = b.laserAng + k * Math.PI;
          const proj = px * Math.cos(a) + py * Math.sin(a);
          if (proj <= 0) continue;
          const perp = Math.abs(-px * Math.sin(a) + py * Math.cos(a));
          if (perp < tgt.r + 9) { damagePlayer(b.dmg * CFG.BOSS.LASER_DMG, tgt); break; }
        }
      } else {
        b.laserCd -= slowDt;
        if (b.laserCd <= 0) {
          b.laserTime = CFG.BOSS.LASER_TIME;
          b.laserCd = CFG.BOSS.LASER_CD;
          b.laserAng = Math.atan2(dy, dx);
          addText(b.x, b.y - b.r - 22, "激光充能", "#ff9f2e", 14);
        }
      }
    }

    // ===== 机制：追猎弹（缓慢转向，逼迫持续走位）=====
    if (b.mechanics.includes("homing")) {
      b.homingCd -= slowDt;
      if (b.homingCd <= 0) {
        b.homingCd = CFG.BOSS.HOMING_CD;
        const cnt = CFG.BOSS.HOMING_COUNT + (b.phase === 3 ? 1 : 0);
        const base = Math.atan2(dy, dx);
        for (let k = 0; k < cnt; k++) {
          const off = (k - (cnt - 1) / 2) * 0.55;
          const orb = fireEnemyBullet(b.x, b.y, base + off, CFG.BOSS.HOMING_SPEED,
            b.dmg * CFG.BOSS.HOMING_DMG, "#ff7ad9", 6, true);
          if (orb) {
            orb.home = CFG.BOSS.HOMING_TURN;
            orb.life = 4.2;
          }
        }
        addText(b.x, b.y - b.r - 22, "追猎弹", "#ff7ad9", 14);
      }
    }

    // ===== 突进机制（二阶段起）：预警蓄力 → 高速冲刺 =====
    b.dashCd -= slowDt;
    if (b.dashTime > 0) {
      b.dashTime -= slowDt;
      const sp = CFG.BOSS.DASH_SPEED * view.scale * spdMul;
      b.x += Math.cos(b.dashAng) * sp * slowDt;
      b.y += Math.sin(b.dashAng) * sp * slowDt;
      emit(b.x, b.y, 2, "#ff3b6b", 90, 4, 0.35);
    } else if (b.warn > 0) {
      b.warn -= slowDt;   // 蓄力期间原地不动
      if (b.warn <= 0) {
        b.dashTime = CFG.BOSS.DASH_TIME;
        b.dashAng = Math.atan2(tgt.y - b.y, tgt.x - b.x);
      }
    } else {
      // 常态：与玩家保持距离
      const desired = 250 + Math.sin(t * 0.8) * 40;
      const dirSign = d > desired ? 1 : -0.55;
      b.x += (dx / d) * b.speed * spdMul * dirSign * slowDt;
      b.y += (dy / d) * b.speed * spdMul * dirSign * slowDt;
      if (b.phase >= 2 && b.dashCd <= 0 && d < 560 * view.scale) {
        b.dashCd = CFG.BOSS.DASH_CD;
        b.warn = CFG.BOSS.DASH_WARN;
        b.dashAng = Math.atan2(dy, dx);
        emit(b.x, b.y, 16, "#ffc857", 180, 3, 0.5);
      }
    }

    // ===== 瞄准扇形弹幕 =====
    b.fireCd -= actDt;
    if (b.fireCd <= 0) {
      if (b.phase === 1) { b.fireCd = 2.2; bossVolley(b, 5, 0.55, 205, 9); }
      else if (b.phase === 2) { b.fireCd = 1.7; bossVolley(b, 7, 0.75, 225, 10); }
      else { b.fireCd = 1.25; bossVolley(b, 9, 0.95, 245, 11); }
    }

    // ===== 环形弹幕（带缓慢旋转的安全缺口）=====
    b.ringCd -= actDt;
    if (b.ringCd <= 0) {
      const count = b.phase === 1 ? 12 : b.phase === 2 ? 16 : 22;
      const speed = b.phase === 3 ? 170 : 150;
      const gap = b.spin * 1.3;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * TAU;
        let diff = Math.abs(((a - gap + Math.PI) % TAU + TAU) % TAU - Math.PI);
        if (diff < CFG.BOSS.RING_GAP) continue;
        fireEnemyBullet(b.x, b.y, a, speed, 8 + b.phase * 2, THEME.gold, 5, true);
      }
      b.ringCd = b.phase === 1 ? 5.5 : b.phase === 2 ? 4.2 : 3.4;
    }

    // ===== 旋转螺旋（二阶段起）=====
    if (b.phase >= 2) {
      b.burstCd -= actDt;
      if (b.burstCd <= 0) {
        b.burstCd = b.phase === 2 ? 0.15 : 0.11;
        const arms = b.phase === 2 ? 2 : 3;
        for (let k = 0; k < arms; k++) {
          const ang = b.spin * 2.4 + (k / arms) * TAU;
          fireEnemyBullet(b.x, b.y, ang, b.phase === 2 ? 170 : 195, 8, THEME.violet, 5, true);
        }
      }
    }

    // ===== 召唤小怪（三阶段召唤精英；「召唤潮汐」机制更频繁）=====
    const summonMech = b.mechanics.includes("summon");
    b.minionCd -= slowDt;
    if (b.minionCd <= 0) {
      const cnt = summonMech ? 3 : 2;
      if (b.phase === 3) {
        b.minionCd = summonMech ? 5.5 : 9;
        for (let i = 0; i < cnt; i++) {
          const a = Math.random() * TAU;
          spawnEnemy("diamond", b.x + Math.cos(a) * 60, b.y + Math.sin(a) * 60);
        }
      } else {
        b.minionCd = summonMech ? 5 : 8;
        for (let i = 0; i < cnt; i++) {
          const a = Math.random() * TAU;
          spawnEnemy("tri", b.x + Math.cos(a) * 50, b.y + Math.sin(a) * 50);
        }
      }
    }

    // ===== 接触伤害（冲刺撞击更痛）=====
    const rr = b.r + tgt.r;
    if (dist2(b.x, b.y, tgt.x, tgt.y) < rr * rr) {
      damagePlayer(b.dmg * (b.dashTime > 0 ? 1 : 0.6), tgt);
    }

    // ===== 碾压防线：Boss 靠近时直接拆塔 / 撞塌城墙 =====
    b.defCd = Math.max(0, (b.defCd || 0) - slowDt);
    if (b.defCd <= 0) {
      const nd = nearestDefense(b.x, b.y, b.r + 56);
      if (nd) {
        hurtDefense(nd.d, b.dmg * 0.9, b);
        b.defCd = 0.7;
      } else {
        const nw = nearestWall(b.x, b.y, b.r + 56);
        if (nw) {
          hurtDefense(nw, b.dmg * 0.9, b);
          b.defCd = 0.7;
        }
      }
    }
  }

  function bossVolley(b, count, spread, speed, dmg) {
    const tgt = nearestPlayer(b.x, b.y);
    const base = Math.atan2(tgt.y - b.y, tgt.x - b.x);
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0.5 : i / (count - 1);
      const ang = base + (t - 0.5) * spread;
      fireEnemyBullet(b.x, b.y, ang, speed, dmg, THEME.danger, 6, true);
    }
    sfxHit();
  }

  function fireEnemyBullet(x, y, ang, speed, dmg, color, r, heavy) {
    if (ebullets.length >= CFG.LIMITS.EBULLETS) return null;
    const sp = speed * view.scale * ebSpeedScale() * threatBulletMul();
    const b = {
      x, y,
      vx: Math.cos(ang) * sp,
      vy: Math.sin(ang) * sp,
      r,
      dmg,
      color,
      life: 5,
      dead: false,
      heavy: !!heavy,
    };
    ebullets.push(b);
    return b;
  }

  function updateEnemies(dt, t) {
    // 超载减速与诅咒（敌人移速）统一在此生效
    const es = ultTimer > 0 ? CFG.ULT.SLOW : 1;
    const sdt = dt * es;

    // 交叉齐射：定期让 2~3 只远程敌机同步开火，形成交叉封锁
    if (!coopIsGuest()) {
      salvoTimer -= dt;
      if (salvoTimer <= 0) {
        salvoTimer = rand(5.5, 8.5) / (1 + threat * 0.05);
        let picked = 0;
        const n = enemies.length;
        if (n > 1) {
          const start = randInt(n);
          for (let k = 0; k < n && picked < 3; k++) {
            const e = enemies[(start + k) % n];
            if (!e || e.dead || e.isBoss || e.synced || !CFG.ENEMY_GUN[e.type]) continue;
            if (e.x < camera.x - 16 || e.x > camera.x + view.w + 16) continue;
            if (e.y < camera.y - 16 || e.y > camera.y + view.h + 16) continue;
            e.salvo = 1.2;
            e.shotCd = Math.min(e.shotCd, 0.06);
            picked++;
          }
        }
      }
    }

    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (e.dead) continue;
      // 受击闪白 / 重击限频对所有敌人推进（客户端同步怪也要衰减）
      if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt * 12);
      if (e.fxCd > 0) e.fxCd = Math.max(0, e.fxCd - dt);
      if (e.synced) {
        // 联机客户端：按快照目标位置平滑插值，掩盖 15Hz 网络步进
        if (e.tx !== undefined) {
          const k = Math.min(1, dt * 16);
          e.x += (e.tx - e.x) * k;
          e.y += (e.ty - e.y) * k;
        }
        continue;
      }

      if (e.isBoss) {
        updateBoss(e, dt, t);
        continue;
      }

      // 塔防：附近有防线且比玩家更近时，优先拆防线
      const playerTgt = nearestPlayer(e.x, e.y);
      let tgt = playerTgt;
      let defTgt = null;
      const nd = nearestDefense(e.x, e.y, CFG.RUN.DEF_AGGRO * view.scale);
      if (nd && nd.dist2 < dist2(e.x, e.y, playerTgt.x, playerTgt.y) * 0.9) {
        defTgt = nd.d;
        tgt = { x: nd.x, y: nd.y, r: nd.hitR };
      }
      let ang = Math.atan2(tgt.y - e.y, tgt.x - e.x);

      // 追猎者：无视防线，锁定玩家；追击越久速度越快
      if (e.type === "hunter") {
        e.huntT = (e.huntT || 0) + sdt;
        tgt = playerTgt;
        defTgt = null;
        ang = Math.atan2(playerTgt.y - e.y, playerTgt.x - e.x);
        if (Math.random() < sdt * 7) emit(e.x, e.y, 1, "#ff2d55", 40, 1.6, 0.3);
      }

      // 五边形：带横向摆动
      if (e.type === "penta") {
        ang += Math.sin(t * 2.4 + e.seed) * 0.7;
      }

      // 菱形精英：周期性突进
      if (e.type === "diamond") {
        e.dashCd -= sdt;
        if (e.dashTime > 0) {
          e.dashTime -= sdt;
          ang = e.dashAng;
        } else if (e.dashCd <= 0) {
          e.dashCd = rand(2.0, 3.2);
          e.dashTime = 0.26;
          e.dashAng = ang;
        }
      }

      // 棱堡：远程炮台，过近时后撤，中距离横向游走
      if (e.type === "hex" && !defTgt) {
        const pd = Math.hypot(playerTgt.x - e.x, playerTgt.y - e.y) || 1;
        const desired = 300 * view.scale;
        if (pd < desired * 0.82) ang += Math.PI;
        else if (pd < desired * 1.25) ang += Math.PI / 2 * Math.sin(t * 1.1 + e.seed);
      }

      // 突刺者：原地蓄力预警，随后短暂高速冲刺
      if (e.type === "dart") {
        e.dashCd -= sdt;
        if (e.dashTime > 0) {
          e.dashTime -= sdt;
          ang = e.dashAng;
        } else if (e.warn > 0) {
          e.warn -= sdt;
          ang = e.dashAng;
          if (e.warn <= 0) {
            e.dashTime = 0.22;
            emit(e.x, e.y, 8, e.color, 180, 2.6, 0.4);
          }
        } else if (e.dashCd <= 0) {
          const pd = Math.hypot(playerTgt.x - e.x, playerTgt.y - e.y) || 1;
          if (pd < 520 * view.scale) {
            e.warn = 0.34;
            e.dashAng = ang;
            e.dashCd = rand(2.6, 3.8);
            emit(e.x, e.y, 6, e.color, 120, 2.2, 0.4);
          } else {
            e.dashCd = 0.5;
          }
        }
      }

      // 修补者：周期性治疗周围友军
      e.healPulse = Math.max(0, (e.healPulse || 0) - sdt);
      if (e.type === "mender") {
        e.healCd -= sdt;
        if (e.healCd <= 0) {
          e.healCd = CFG.ENEMY_SUPPORT.MENDER_CD * rand(0.9, 1.1);
          const R = CFG.ENEMY_SUPPORT.MENDER_RADIUS * view.scale;
          // 优先治疗血量比例最低的友军，避免把治疗浪费在满血目标上
          const targets = [];
          for (let k = 0; k < enemies.length; k++) {
            const o = enemies[k];
            if (o === e || o.dead || o.isBoss || o.hp >= o.maxHp) continue;
            if (dist2(e.x, e.y, o.x, o.y) > R * R) continue;
            targets.push(o);
          }
          targets.sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp);
          const healedCount = Math.min(CFG.ENEMY_SUPPORT.MENDER_MAX_TARGETS, targets.length);
          for (let k = 0; k < healedCount; k++) {
            const o = targets[k];
            o.hp = Math.min(o.maxHp, o.hp + o.maxHp * CFG.ENEMY_SUPPORT.MENDER_HEAL);
            emit(o.x, o.y, 2, THEME.mint, 90, 1.8, 0.35);
          }
          if (healedCount > 0) {
            e.healPulse = 0.6;
            emit(e.x, e.y, 10, THEME.mint, 150, 2.4, 0.5);
          }
        }
      }

      const sp = e.speed * view.scale * stats.enemySpeedMul * (e.dashTime > 0 ? 3.1 : 1) *
        (e.type === "hunter" ? Math.min(1.75, 1 + (e.huntT || 0) * 0.012) : 1) *
        (e.warn > 0 ? 0.12 : 1) *
        (e.freezeT > 0 ? 0 : 1) *
        (e.slowT > 0 ? CFG.RUN.FIELD_SLOW : 1) *
        (e.frostT > 0 ? CFG.SKILL.PHASE.ICE_SLOW : 1);
      e.slowT = Math.max(0, (e.slowT || 0) - sdt);
      e.frostT = Math.max(0, (e.frostT || 0) - sdt);
      e.freezeT = Math.max(0, (e.freezeT || 0) - sdt);
      // 控场抗性：离开引力场后逐步消退，重新可被吸附
      if (e.ccRes > 0) e.ccRes = Math.max(0, e.ccRes - CFG.SKILL.WELL.CC_RESIST_DECAY * dt);
      e.x += Math.cos(ang) * sp * sdt;
      e.y += Math.sin(ang) * sp * sdt;
      e.angle = ang;

      // 受击击退：短促冲量 + 快速衰减；冲刺中的精英免疫
      if (e.kbx || e.kby) {
        if (e.dashTime > 0) {
          e.kbx = 0;
          e.kby = 0;
        } else {
          e.x += e.kbx * sdt;
          e.y += e.kby * sdt;
          const kd = Math.pow(0.0008, sdt);
          e.kbx *= kd;
          e.kby *= kd;
          if (Math.abs(e.kbx) < 3 && Math.abs(e.kby) < 3) { e.kbx = 0; e.kby = 0; }
          e.x = clamp(e.x, e.r, world.w - e.r);
          e.y = clamp(e.y, e.r, world.h - e.r);
        }
      }

      // 城墙阻挡：先沿墙滑向空隙，长时间被卡住才近身拆墙
      let wallContact = null;
      for (let wi = 0; wi < walls.length; wi++) {
        const w = walls[wi];
        if (w.dead) continue;
        const hit = wallHit(w, e.x, e.y, e.r);
        if (!hit) continue;
        e.x += hit.nx * hit.depth;
        e.y += hit.ny * hit.depth;
        wallContact = w;
        // 沿墙朝玩家方向滑动，优先从离玩家更近的一端绕过去
        const ca = Math.cos(w.ang), sa = Math.sin(w.ang);
        const exL = (e.x - w.x) * ca + (e.y - w.y) * sa;
        const txL = (playerTgt.x - w.x) * ca + (playerTgt.y - w.y) * sa;
        const dir = txL >= exL ? 1 : -1;
        const slide = sp * 0.85 * sdt;
        e.x += ca * dir * slide;
        e.y += sa * dir * slide;
        e.x = clamp(e.x, e.r, world.w - e.r);
        e.y = clamp(e.y, e.r, world.h - e.r);
        break;
      }
      if (wallContact) {
        e.wallStuck = (e.wallStuck || 0) + sdt;
        if (e.wallStuck > 1.4) {
          e.defCd = Math.max(0, (e.defCd || 0) - sdt);
          if (e.defCd <= 0) {
            e.defCd = CFG.RUN.DEF_ATTACK_CD * rand(0.85, 1.2);
            hurtDefense(wallContact, e.dmg, e);
          }
        }
      } else {
        e.wallStuck = 0;
      }

      // ===== 小怪远程弹幕（稀疏；三角怪只近战不射击）=====
      const gun = CFG.ENEMY_GUN[e.type];
      if (gun && gun.count > 0) {
        if (e.salvo > 0) e.salvo = Math.max(0, e.salvo - sdt);
        e.shotCd -= sdt;
        if (e.shotCd <= 0) {
          const inView = e.x > camera.x - 16 && e.x < camera.x + view.w + 16 &&
                         e.y > camera.y - 16 && e.y < camera.y + view.h + 16;
          const inRange = dist2(e.x, e.y, tgt.x, tgt.y) < (640 * view.scale) ** 2;
          if (inView && inRange) {
            // 预判射击：按目标当前速度计算提前量
            let base = Math.atan2(tgt.y - e.y, tgt.x - e.x);
            if (tgt === playerTgt) {
              const spEff = gun.speed * view.scale * ebSpeedScale() * threatBulletMul();
              const d = Math.hypot(tgt.x - e.x, tgt.y - e.y) || 1;
              const lead = Math.min(0.8, d / spEff) * CFG.ENEMY_GUN.LEAD;
              base = Math.atan2(
                tgt.y + (tgt.velY || 0) * lead - e.y,
                tgt.x + (tgt.velX || 0) * lead - e.x
              );
            }
            const salvoShot = (e.salvo || 0) > 0;
            if (salvoShot) e.salvo = 0;
            const shots = gun.count + (gun.count > 1 ? Math.min(3, Math.floor((chapter - 1) / 2)) : 0) +
              (salvoShot ? 1 : 0);
            const spread = salvoShot ? Math.max(gun.spread, 0.18) : gun.spread;
            for (let k = 0; k < shots; k++) {
              const off = shots === 1 ? 0 : (k / (shots - 1) - 0.5) * spread;
              fireEnemyBullet(e.x, e.y, base + off, gun.speed, e.dmg * gun.dmgMul, e.color, 4.5);
            }
            e.shotCd = rand(gun.cd[0], gun.cd[1]) / Math.min(1.8, 1 + (chapter - 1) * 0.08);
          } else {
            e.shotCd = 0.4;   // 未进入视野/射程，稍后再判断
          }
        }
      }

      // 接触伤害：拆防线或打玩家
      const rr = e.r + tgt.r;
      if (dist2(e.x, e.y, tgt.x, tgt.y) < rr * rr) {
        if (defTgt) {
          e.defCd = Math.max(0, (e.defCd || 0) - sdt);
          if (e.defCd <= 0) {
            e.defCd = CFG.RUN.DEF_ATTACK_CD * rand(0.85, 1.2);
            hurtDefense(defTgt, e.dmg, e);
          }
          e.x -= Math.cos(ang) * 4;
          e.y -= Math.sin(ang) * 4;
        } else {
          damagePlayer(e.dmg, tgt);
          e.x -= Math.cos(ang) * 10;
          e.y -= Math.sin(ang) * 10;
        }
      }
    }

    // 清理死亡敌人
    for (let i = enemies.length - 1; i >= 0; i--) {
      if (enemies[i].dead) {
        if (enemies[i] === boss) boss = null;
        enemies.splice(i, 1);
      }
    }
  }

  function inZone(x, y) {
    for (let i = 0; i < zones.length; i++) {
      const z = zones[i];
      if (dist2(x, y, z.x, z.y) <= z.r * z.r) return true;
    }
    return false;
  }

  // 超载能量增长
  function addEnergy(v) {
    player.energy = Math.min(CFG.ULT.MAX, player.energy + v);
  }

  function comboMultiplier() {
    return Math.min(CFG.COMBO.MAX, 1 + combo * CFG.COMBO.STEP);
  }

  function killEnemy(e) {
    if (e.dead) return;
    e.dead = true;
    kills += 1;
    const killer = coopPlayerById(e.lastHit);
    if (killer) killer.kills += 1;

    // 连杀：3 秒内连续击杀提升分数与经验
    combo += 1;
    comboTimer = CFG.COMBO.TIME;
    if (combo > comboBest) comboBest = combo;
    // 击杀推高威胁等级（仅房主/单机记录）
    if (!coopIsGuest()) threat = Math.min(CFG.THREAT.MAX, threat + CFG.THREAT.KILL_RATE);
    const mul = comboMultiplier();
    score += Math.round(e.score * mul);
    credits += Math.round(
      (e.isBoss ? CFG.RUN.CREDIT_BOSS : e.type === "diamond" ? CFG.RUN.CREDIT_ELITE : CFG.RUN.CREDIT_KILL) *
      (chapterMod ? chapterMod.creditMul || 1 : 1)
    );
    if (e.type === "diamond") hitStop = Math.max(hitStop, 0.045);

    if (e.isBoss) {
      emit(e.x, e.y, 110, "#ffc857", 420, 6, 1.3);
      emit(e.x, e.y, 60, "#ff4d6d", 340, 5, 1.1);
      shake = Math.max(shake, 26 * CFG.FX.SHAKE);
      sfxExplode(true);
      boss = null;
      hideBossBar();
      coopSendEvent("boss-down", { ch: chapter });
      for (let i = 0; i < 3; i++) dropCore(e.x + rand(-24, 24), e.y + rand(-24, 24));
      // Boss 必定掉落 2 枚芯片
      for (let i = 0; i < 2; i++) dropChip(e.x + rand(-30, 30), e.y + rand(-30, 30));
      // 击杀特写：慢动作 + 白闪，1.5 秒后进入下一星域
      slowmo = 1.1;
      victoryFlash = 1;
      victoryTimer = 1.5;
      player.invuln = Math.max(player.invuln, 3);
      for (let i = 0; i < ebullets.length; i++) ebullets[i].dead = true;
      for (let i = 0; i < 12; i++) spawnGem(e.x, e.y, e.xp / 12);
      return;
    }

    addEnergy(e.type === "diamond" ? CFG.ULT.GAIN_ELITE : CFG.ULT.GAIN_KILL);
    emit(e.x, e.y, e.type === "diamond" ? 22 : 13, e.color, 210, e.type === "diamond" ? 3.4 : 2.6, 0.65);
    shake = Math.max(shake, (e.type === "diamond" ? 6 : 3) * CFG.FX.SHAKE);
    sfxExplode(false);
    if (e.type === "diamond") dropCore(e.x, e.y);
    // 精英有概率掉落芯片
    if (e.type === "diamond" && Math.random() < 0.38) dropChip(e.x, e.y);
    // 追猎者：击杀给予额外奖励与提示
    if (e.type === "hunter") {
      dropCore(e.x, e.y);
      for (let i = 0; i < 3; i++) spawnGem(e.x + rand(-22, 22), e.y + rand(-22, 22), 10);
      addText(e.x, e.y - 26, "追猎者被终结", "#ff8fa3", 15);
      emit(e.x, e.y, 26, "#ff2d55", 260, 4, 0.8);
    }

    // 词缀：死亡分裂 / 死亡爆裂
    const affixes = e.affixes;
    if (affixes && affixes.length) {
      for (let i = 0; i < affixes.length; i++) {
        if (affixes[i] === "split") spawnSplitChildren(e);
        else if (affixes[i] === "boom") {
          const n = CFG.AFFIX.BOOM_COUNT;
          for (let k = 0; k < n; k++) {
            fireEnemyBullet(e.x, e.y, (k / n) * TAU + Math.random() * 0.2, 170, Math.max(4, e.dmg * 0.45), "#ff9f2e", 4.5);
          }
        }
      }
    }

    // 风险星域内击杀 + 连杀：经验倍率（连杀对经验打折，分数不吃折扣）
    const xpCombo = 1 + (mul - 1) * (CFG.COMBO.XP_FACTOR != null ? CFG.COMBO.XP_FACTOR : 1);
    const xpVal = e.xp * (inZone(e.x, e.y) ? CFG.EVENTS.ZONE_XP_MUL : 1) * xpCombo;
    spawnGem(e.x, e.y, xpVal);
  }

  // 分裂词缀：死亡后生成两只弱化个体（不带词缀）
  function spawnSplitChildren(e) {
    const n = CFG.AFFIX.SPLIT_COUNT;
    for (let i = 0; i < n; i++) {
      if (enemies.length >= CFG.LIMITS.ENEMIES) break;
      const a = Math.random() * TAU;
      const c = spawnEnemy(e.type, e.x + Math.cos(a) * 26, e.y + Math.sin(a) * 26, true);
      if (!c) continue;
      c.maxHp = Math.max(4, e.maxHp * 0.28);
      c.hp = c.maxHp;
      c.r = Math.max(5, e.r * 0.72);
      c.speed *= 1.12;
      c.xp = e.xp * 0.35;
      c.score = Math.round(e.score * 0.4);
      c.affixes = [];
      c.armor = waveScaleArmor();
      c.shotCd = 1.6 + Math.random();
    }
  }

