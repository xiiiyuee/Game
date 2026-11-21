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

    updatePulses(dt);
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
        hurtEnemy(e, CFG.ULT.DAMAGE * (e.isBoss ? 0.5 : 1), false, true);
        if (state !== "playing") break;
      }
    }

    emit(player.x, player.y, 40, "#7ef0ff", 380, 4, 0.9);
    shake = Math.max(shake, 14 * CFG.FX.SHAKE);
    addText(player.x, player.y - 42, "超载爆发", "#ffd666", 20);
    sfxUlt();
    refreshHud(true);
  }

