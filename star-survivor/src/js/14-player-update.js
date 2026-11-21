  /* =====================================================================
   * 12. 玩家更新 / 冲刺 / 受伤
   * ===================================================================*/
  function tryDash() {
    if (state !== "playing") return;
    if (player.dashCd > 0) return;
    const v = readMoveInput();
    const hasInput = v.x !== 0 || v.y !== 0;
    player.dashDir = hasInput ? { x: v.x, y: v.y } : { x: player.lastDir.x, y: player.lastDir.y };
    if (player.dashDir.x === 0 && player.dashDir.y === 0) player.dashDir = { x: 0, y: -1 };
    player.dashTime = CFG.PLAYER.DASH_TIME;
    player.dashCd = CFG.PLAYER.DASH_CD;
    player.invuln = Math.max(player.invuln, CFG.PLAYER.DASH_INVULN);
    emit(player.x, player.y, 12, "#7ef0ff", 180, 3, 0.45);
    sfxDash();
  }

  function readMoveInput() {
    let x = 0, y = 0;
    if (keys.KeyA || keys.ArrowLeft) x -= 1;
    if (keys.KeyD || keys.ArrowRight) x += 1;
    if (keys.KeyW || keys.ArrowUp) y -= 1;
    if (keys.KeyS || keys.ArrowDown) y += 1;
    if (touchVec.active) { x += touchVec.x; y += touchVec.y; }
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    return { x, y };
  }

  function updatePlayer(dt) {
    const P = CFG.PLAYER;
    player.invuln = Math.max(0, player.invuln - dt);
    player.dashCd = Math.max(0, player.dashCd - dt);
    player.hitFlash = Math.max(0, player.hitFlash - dt * 2.6);

    // 护盾恢复
    if (player.shieldDelay > 0) player.shieldDelay -= dt;
    else player.shield = Math.min(stats.shieldMax, player.shield + stats.shieldRegen * dt);

    const v = readMoveInput();

    if (player.dashTime > 0) {
      player.dashTime -= dt;
      const sp = P.DASH_SPEED * view.scale;
      player.x += player.dashDir.x * sp * dt;
      player.y += player.dashDir.y * sp * dt;
    } else if (v.x !== 0 || v.y !== 0) {
      player.lastDir.x = v.x;
      player.lastDir.y = v.y;
      const sp = stats.moveSpeed * view.scale;
      player.x += v.x * sp * dt;
      player.y += v.y * sp * dt;
    }

    // 边界限制（世界边界，而非视口）
    player.x = clamp(player.x, player.r + 2, world.w - player.r - 2);
    player.y = clamp(player.y, player.r + 2, world.h - player.r - 2);

    // 拖尾
    player.trailCd -= dt;
    if (player.trailCd <= 0) {
      player.trailCd = 0.035;
      emit(player.x, player.y, 1, player.invuln > 0 ? "#ffffff" : "#28c8ff", 26, 2.6, 0.4);
    }

    // 朝向最近敌人（用于绘制）
    const target = nearestEnemy();
    if (target) player.facing = Math.atan2(target.y - player.y, target.x - player.x);
    else if (v.x !== 0 || v.y !== 0) player.facing = Math.atan2(v.y, v.x);

    // 自动开火
    player.fireCd -= dt;
    if (player.fireCd <= 0 && target) {
      fireAt(target);
      player.fireCd = stats.fireInterval;
    }
  }

  // 无人机子弹（独立颜色，便于区分）
  function spawnDroneBullet(x, y, ang) {
    if (bullets.length >= CFG.LIMITS.BULLETS) return;
    const sp = stats.bulletSpeed * view.scale * CFG.DRONES.SPEED_MUL;
    bullets.push({
      x, y,
      vx: Math.cos(ang) * sp,
      vy: Math.sin(ang) * sp,
      r: 3,
      dmg: stats.damage * CFG.DRONES.DMG_MUL * (1 + (stats.drones - 1) * 0.12),
      pierce: 0,
      life: 1.2,
      dead: false,
      hit: new Set(),
      ang,
      color: THEME.mint,
    });
  }

  // 守护无人机：环绕玩家，自动索敌射击
  function updateDrones(dt, t) {
    const n = Math.min(CFG.DRONES.MAX, stats.drones || 0);
    if (n <= 0) return;
    const orbit = CFG.DRONES.ORBIT * view.scale;
    const range = stats.range * view.scale * CFG.DRONES.RANGE_MUL;
    const range2 = range * range;
    for (let i = 0; i < n; i++) {
      if (player.droneCd.length <= i) player.droneCd.push(rand(0.3, 0.8));
      player.droneCd[i] -= dt;
      if (player.droneCd[i] > 0) continue;
      const ang = t * 1.15 + (i / n) * TAU;
      const dx = player.x + Math.cos(ang) * orbit;
      const dy = player.y + Math.sin(ang) * orbit;
      let best = null;
      let bestD = range2;
      for (let k = 0; k < enemies.length; k++) {
        const e = enemies[k];
        if (e.dead) continue;
        const d = dist2(e.x, e.y, dx, dy);
        if (d < bestD) { bestD = d; best = e; }
      }
      if (best) {
        spawnDroneBullet(dx, dy, Math.atan2(best.y - dy, best.x - dx));
        player.droneCd[i] = CFG.DRONES.FIRE_CD;
      } else {
        player.droneCd[i] = 0.2;
      }
    }
  }


  function nearestEnemy() {
    const range = stats.range * view.scale;
    let best = null;
    let bestD = range * range;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (e.dead) continue;
      const d = dist2(e.x, e.y, player.x, player.y);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  function fireAt(target) {
    const baseAng = Math.atan2(target.y - player.y, target.x - player.x);
    player.facing = baseAng;
    const n = stats.bulletCount;
    const spread = Math.min(1.0, 0.11 * (n - 1) + (stats.spread || 0));

    for (let i = 0; i < n; i++) {
      if (bullets.length >= CFG.LIMITS.BULLETS) break;
      const t = n === 1 ? 0.5 : i / (n - 1);
      const ang = baseAng + (t - 0.5) * spread;
      spawnPlayerBullet(ang);
    }

    // 进化「双子脉冲」：每次射击追加两道侧向脉冲
    if (stats.twinPulse) {
      spawnPlayerBullet(baseAng - 0.12, stats.damage * 0.7);
      spawnPlayerBullet(baseAng + 0.12, stats.damage * 0.7);
    }

    // 枪口火花
    emit(player.x + Math.cos(baseAng) * 14, player.y + Math.sin(baseAng) * 14, 2, "#b9f7ff", 90, 2, 0.22);
    sfxShoot();
  }

  // 玩家子弹工厂（供普通射击 / 回响 / 终极使用）
  function spawnPlayerBullet(ang, dmgOverride, speedMul) {
    if (bullets.length >= CFG.LIMITS.BULLETS) return;
    const sp = stats.bulletSpeed * view.scale * (speedMul || 1);
    bullets.push({
      x: player.x + Math.cos(ang) * (player.r + 4),
      y: player.y + Math.sin(ang) * (player.r + 4),
      vx: Math.cos(ang) * sp,
      vy: Math.sin(ang) * sp,
      r: stats.bulletR || 4,
      dmg: dmgOverride === undefined ? stats.damage : dmgOverride,
      pierce: stats.pierce,
      life: 1.5,
      dead: false,
      hit: new Set(),
      ang,
      color: stats.bulletColor || THEME.cyan,
    });
  }

  function damagePlayer(baseDmg) {
    if (state !== "playing") return;
    if (player.invuln > 0) return;

    const dmg = baseDmg * (1 - stats.armor) * stats.takenMul;
    let remain = dmg;
    if (player.shield > 0) {
      const absorbed = Math.min(player.shield, remain);
      player.shield -= absorbed;
      remain -= absorbed;
    }
    if (remain > 0) player.hp -= remain;

    player.invuln = CFG.PLAYER.INVULN_ON_HURT;
    player.shieldDelay = CFG.PLAYER.SHIELD_DELAY;
    player.hitFlash = 1;
    hurtFlash = 1;
    shake = Math.max(shake, 12 * CFG.FX.SHAKE);
    emit(player.x, player.y, 14, "#ff4d6d", 220, 3, 0.5);
    sfxHurt();
    hitStop = Math.max(hitStop, 0.025);
    if (document.body.classList.contains("touch") && navigator.vibrate) navigator.vibrate(28);
    // 受击断连杀
    combo = 0;
    comboTimer = 0;

    if (player.hp <= 0) {
      player.hp = 0;
      if (!tryRevive()) endGame(false, "hp");
    }
  }

  // 风险星域持续伤害：无视无敌帧，先扣护盾
  function drainPlayer(amount) {
    if (state !== "playing") return;
    let remain = amount;
    if (player.shield > 0) {
      const a = Math.min(player.shield, remain);
      player.shield -= a;
      remain -= a;
    }
    if (remain > 0) player.hp -= remain;
    player.shieldDelay = CFG.PLAYER.SHIELD_DELAY;
    hurtFlash = Math.max(hurtFlash, 0.1);
    if (player.hp <= 0) {
      player.hp = 0;
      if (!tryRevive()) endGame(false, "hp");
    }
  }

  // 星港应急保险：以 50% 生命复活一次
  function tryRevive() {
    if (revives <= 0) return false;
    revives -= 1;
    player.hp = Math.round(player.hpMax * 0.5);
    player.shield = 0;
    player.invuln = 3;
    player.shieldDelay = 2;
    combo = 0;
    comboTimer = 0;
    for (let i = 0; i < ebullets.length; i++) ebullets[i].dead = true;
    emit(player.x, player.y, 36, "#8bffdc", 300, 4, 0.9);
    addText(player.x, player.y - 44, "应急保险启动 · 50% 生命", "#8bffdc", 18);
    shake = Math.max(shake, 10 * CFG.FX.SHAKE);
    sfxLevelUp();
    refreshHud(true);
    return true;
  }

