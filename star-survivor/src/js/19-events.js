  /* =====================================================================
   * 15.5 大世界事件（风险星域 / 能量水晶 / 补给舱）与终极技能
   * ===================================================================*/
  function randomSpotInView(minFromPlayer, margin) {
    const m = margin === undefined ? 70 : margin;
    for (let k = 0; k < 24; k++) {
      const x = rand(camera.x + m, camera.x + view.w - m);
      const y = rand(camera.y + m, camera.y + view.h - m);
      if (x < 80 || y < 80 || x > world.w - 80 || y > world.h - 80) continue;
      if (Math.hypot(x - player.x, y - player.y) < minFromPlayer) continue;
      return { x, y };
    }
    return {
      x: clamp(player.x + rand(-420, 420), 80, world.w - 80),
      y: clamp(player.y + rand(-420, 420), 80, world.h - 80),
    };
  }

  function spawnZone() {
    if (zones.length >= CFG.EVENTS.MAX_ZONES) return;
    const pos = randomSpotInView(230 * view.scale, 100);
    zones.push({
      x: pos.x, y: pos.y,
      r: CFG.EVENTS.ZONE_RADIUS * view.scale,
      life: CFG.EVENTS.ZONE_LIFE,
      maxLife: CFG.EVENTS.ZONE_LIFE,
      seed: Math.random() * TAU,
    });
  }

  function spawnCrystal() {
    if (crystals.length >= CFG.EVENTS.MAX_CRYSTALS) return;
    const pos = randomSpotInView(140 * view.scale, 80);
    const hp = CFG.EVENTS.CRYSTAL_HP;
    crystals.push({
      id: nextPropId++,
      x: pos.x, y: pos.y,
      r: CFG.EVENTS.CRYSTAL_R * view.scale,
      hp, maxHp: hp,
      seed: Math.random() * TAU,
      flash: 0,
    });
  }

  function destroyCrystal(c) {
    const idx = crystals.indexOf(c);
    if (idx < 0) return;
    crystals.splice(idx, 1);
    emit(c.x, c.y, 26, "#8ff6ff", 260, 3.2, 0.7);
    shake = Math.max(shake, 5 * CFG.FX.SHAKE);
    sfxExplode(false);
    score += 15;
    for (let i = 0; i < CFG.EVENTS.CRYSTAL_GEMS; i++) spawnGem(c.x, c.y, 5);
    addText(c.x, c.y - 24, "水晶碎裂", "#8ff6ff", 13);
  }

  function spawnPod() {
    if (pods.length >= CFG.EVENTS.MAX_PODS) pods.shift();   // 覆盖过期补给，避免长期占用唯一名额
    const pos = randomSpotInView(260 * view.scale, 90);
    pods.push({ x: pos.x, y: pos.y, r: CFG.EVENTS.POD_R * view.scale, seed: Math.random() * TAU });
    addText(pos.x, pos.y - 34, "补给舱已投放", "#8bffdc", 14);
  }

  function collectPod(p) {
    player.hp = Math.min(player.hpMax, player.hp + CFG.EVENTS.POD_HEAL);
    addEnergy(CFG.EVENTS.POD_ENERGY);
    score += 30;
    emit(p.x, p.y, 22, "#8bffdc", 240, 3, 0.6);
    addText(p.x, p.y - 22, `+${CFG.EVENTS.POD_HEAL} HP　能量 +${CFG.EVENTS.POD_ENERGY}`, "#8bffdc", 14);
    sfxLevelUp();
  }

  function updateEvents(dt) {
    zoneTimer -= dt;
    if (zoneTimer <= 0) {
      zoneTimer = CFG.EVENTS.ZONE_INTERVAL * rand(0.8, 1.2);
      spawnZone();
    }
    crystalTimer -= dt;
    if (crystalTimer <= 0) {
      crystalTimer = CFG.EVENTS.CRYSTAL_INTERVAL * rand(0.8, 1.2);
      spawnCrystal();
    }
    podTimer -= dt;
    if (podTimer <= 0) {
      podTimer = CFG.EVENTS.POD_INTERVAL * rand(0.8, 1.2);
      spawnPod();
    }

    // 陨石 / 芯片 / 游商
    updateAsteroids(dt);
    updateChipDrops(dt);
    updateTrader(dt);
    if (state !== "playing") return;

    // 星域生命周期
    for (let i = zones.length - 1; i >= 0; i--) {
      zones[i].life -= dt;
      if (zones[i].life <= 0) zones.splice(i, 1);
    }

    // 圈内持续掉血
    let inDanger = false;
    for (let i = 0; i < zones.length; i++) {
      const z = zones[i];
      if (dist2(player.x, player.y, z.x, z.y) <= z.r * z.r) { inDanger = true; break; }
    }
    if (inDanger) {
      drainPlayer(CFG.EVENTS.ZONE_DPS * dt * stats.takenMul);
      if (state !== "playing") return;
    }

    for (let i = 0; i < crystals.length; i++) {
      crystals[i].flash = Math.max(0, crystals[i].flash - dt);
    }

    // 拾取补给舱
    for (let i = pods.length - 1; i >= 0; i--) {
      const p = pods[i];
      p.seed += dt;
      const rr = p.r + player.r + 4;
      if (dist2(p.x, p.y, player.x, player.y) <= rr * rr) {
        collectPod(p);
        pods.splice(i, 1);
      }
    }

    updateThreat(dt);
    updateHazards(dt);
    updatePulses(dt);
  }

  /* ===================== 威胁等级 ===================== */
  function threatSpawnMul() { return 1 + threat * CFG.THREAT.SPAWN; }
  function threatBulletMul() { return 1 + threat * CFG.THREAT.BULLET; }
  function threatSpeedMul() { return 1 + threat * CFG.THREAT.SPEED; }
  function threatEliteChance() { return threat * CFG.THREAT.ELITE; }

  function updateThreat(dt) {
    if (coopIsGuest()) return;   // 房主权威，客机从快照读取
    threat = Math.min(CFG.THREAT.MAX, threat + dt * CFG.THREAT.TIME_RATE);
  }

  /* ===================== 场地灾害 ===================== */
  function hazardInterval() {
    const H = CFG.EVENTS.HAZARD;
    return H.INTERVAL * (1 - Math.min(0.42, (chapter - 1) * 0.05)) / (1 + threat * 0.03);
  }

  function spawnMeteorHazard() {
    const H = CFG.EVENTS.HAZARD;
    const n = H.METEOR_COUNT + (chapter > 2 ? 1 : 0);
    const list = [];
    for (let i = 0; i < n; i++) {
      // 第一颗贴近玩家，其余散落周围，形成封路
      const off = i === 0 ? rand(26, 92) : rand(90, 310);
      const a = Math.random() * TAU;
      list.push({
        x: clamp(player.x + Math.cos(a) * off, 40, world.w - 40),
        y: clamp(player.y + Math.sin(a) * off, 40, world.h - 40),
        r: H.METEOR_R,
      });
    }
    return { type: "meteor", list, warn: H.METEOR_WARN, maxWarn: H.METEOR_WARN, life: 0 };
  }

  function spawnBeamHazard() {
    const H = CFG.EVENTS.HAZARD;
    const axis = Math.random() < 0.5 ? "h" : "v";
    const pos = axis === "h"
      ? clamp(player.y + rand(-230, 230), camera.y + 50, camera.y + view.h - 50)
      : clamp(player.x + rand(-230, 230), camera.x + 50, camera.x + view.w - 50);
    return { type: "beam", axis, pos, warn: H.BEAM_WARN, maxWarn: H.BEAM_WARN, active: H.BEAM_ACTIVE, life: 0 };
  }

  function spawnHazard() {
    if (hazards.length >= CFG.EVENTS.HAZARD.MAX_ACTIVE) return;
    const h = Math.random() < 0.6 ? spawnMeteorHazard() : spawnBeamHazard();
    hazards.push(h);
    if (roomCode) coopSendEvent("hazard", h);   // 客机同步视觉，伤害仍由房主结算
  }

  function hazardHit(h) {
    const H = CFG.EVENTS.HAZARD;
    const solid = !coopIsGuest() && !h.ghost;
    if (h.type === "meteor") {
      for (let k = 0; k < h.list.length; k++) {
        const m = h.list[k];
        emit(m.x, m.y, 22, "#ff9f2e", 260, 3.4, 0.65);
        emit(m.x, m.y, 10, "#ff4d6d", 180, 2.6, 0.5);
        if (!solid) continue;
        for (let i = 0; i < players.length; i++) {
          const q = players[i];
          if (q.down || q.eliminated) continue;
          const rr = m.r + q.r;
          if (dist2(m.x, m.y, q.x, q.y) <= rr * rr) damagePlayer(H.METEOR_DMG, q);
        }
      }
      shake = Math.max(shake, 8 * CFG.FX.SHAKE);
      sfxExplode(false);
    } else if (h.type === "beam") {
      const half = H.BEAM_WIDTH / 2;
      const len = h.axis === "h" ? view.w : view.h;
      const cx = h.axis === "h" ? camera.x + view.w / 2 : h.pos;
      const cy = h.axis === "h" ? h.pos : camera.y + view.h / 2;
      emit(cx, cy, Math.round(len / 26), "#ff4d6d", len * 0.6, 4, 0.5);
      if (solid) {
        for (let i = 0; i < players.length; i++) {
          const q = players[i];
          if (q.down || q.eliminated) continue;
          const d = h.axis === "h" ? Math.abs(q.y - h.pos) : Math.abs(q.x - h.pos);
          if (d <= half + q.r) damagePlayer(H.BEAM_DMG, q);
        }
      }
      shake = Math.max(shake, 6 * CFG.FX.SHAKE);
    }
  }

  function updateHazards(dt) {
    const H = CFG.EVENTS.HAZARD;
    if (state === "playing" && !coopIsGuest() && !boss && waveNum >= H.FIRST_WAVE) {
      hazardTimer -= dt;
      if (hazardTimer <= 0) {
        hazardTimer = hazardInterval();
        spawnHazard();
      }
    }
    for (let i = hazards.length - 1; i >= 0; i--) {
      const h = hazards[i];
      if (h.warn > 0) {
        h.warn -= dt;
        if (h.warn <= 0) {
          h.warn = 0;
          h.life = h.type === "meteor" ? 0.5 : h.active;
          hazardHit(h);
        }
      } else if (h.type === "beam") {
        h.active -= dt;
        h.life = Math.max(0, h.life - dt);
        if (h.active <= 0) hazards.splice(i, 1);
      } else {
        h.life -= dt;
        if (h.life <= 0) hazards.splice(i, 1);
      }
    }
  }

  function updatePulses(dt) {
    for (let i = pulses.length - 1; i >= 0; i--) {
      const p = pulses[i];
      p.life -= dt;
      p.r += (p.max - p.r) * Math.min(1, dt * 9);
      if (p.life <= 0) pulses.splice(i, 1);
    }
  }

  // 进化「虚空回响」：每 4 秒一圈弹幕
  function echoBurstFire() {
    for (let i = 0; i < 8; i++) {
      spawnPlayerBullet((i / 8) * TAU + Math.random() * 0.12, stats.damage * 0.5, 0.85);
    }
    emit(player.x, player.y, 12, "#c58bff", 240, 3, 0.5);
  }

  // 终极技能「超载」：清弹 + 范围爆发 + 短时减速
  function activateUltimate() {
    if (state !== "playing" || player.energy < CFG.ULT.MAX) return;
    if (player.down || player.eliminated) return;
    player.energy = 0;
    ultTimer = CFG.ULT.SLOW_TIME;
    player.invuln = Math.max(player.invuln, CFG.ULT.INVULN);

    const R = CFG.ULT.RADIUS * view.scale;
    pulses.push({ x: player.x, y: player.y, r: 24, max: R, life: 0.7, maxLife: 0.7 });

    // 清除镜头范围内的敌方弹幕
    const m = CFG.ULT.CLEAR_MARGIN;
    for (let i = ebullets.length - 1; i >= 0; i--) {
      const b = ebullets[i];
      if (b.x > camera.x - m && b.x < camera.x + view.w + m &&
          b.y > camera.y - m && b.y < camera.y + view.h + m) {
        emit(b.x, b.y, 2, "#b9f7ff", 150, 2, 0.3);
        ebullets.splice(i, 1);
      }
    }

    // 范围伤害
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (e.dead) continue;
      const rr = R + e.r;
      if (dist2(player.x, player.y, e.x, e.y) <= rr * rr) {
        hurtEnemy(e, CFG.ULT.DAMAGE * (e.isBoss ? 0.5 : 1), false, true, player.id);
        if (state !== "playing") break;
      }
    }

    emit(player.x, player.y, 40, "#7ef0ff", 380, 4, 0.9);
    shake = Math.max(shake, 14 * CFG.FX.SHAKE);
    addText(player.x, player.y - 42, "超载爆发", "#ffd666", 20);
    sfxUlt();
    refreshHud(true);
  }

