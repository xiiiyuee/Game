  /* =====================================================================
   * 12. 玩家更新 / 冲刺 / 受伤
   * ===================================================================*/
  function tryDash() {
    if (state !== "playing") return;
    if (player.down || player.eliminated) return;
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
    return { x: intent.mx, y: intent.my };
  }

  function updatePlayer(dt, p) {
    p = p || player;
    const P = CFG.PLAYER;
    const s = p.stats;
    if (p.down || p.eliminated) return;
    const px0 = p.x, py0 = p.y;
    p.invuln = Math.max(0, p.invuln - dt);
    p.dashCd = Math.max(0, p.dashCd - dt);
    p.hitFlash = Math.max(0, p.hitFlash - dt * 2.6);

    // 主动技能：被动蓄能（冷却/施放锁期间照常积累）
    p.skillLock = Math.max(0, (p.skillLock || 0) - dt);
    if (p.skill && (p.skillEnergy || 0) < CFG.SKILL.MAX) {
      const gain = CFG.SKILL.PASSIVE * (s.skillGainMul || 1) * dt;
      p.skillEnergy = Math.min(CFG.SKILL.MAX, (p.skillEnergy || 0) + gain);
    }
    // 擦弹回流计时；结束时清空层数
    if (p.grazeActive > 0) {
      p.grazeActive = Math.max(0, p.grazeActive - dt);
      if (p.grazeActive === 0) p.grazeStacks = 0;
    }

    // 护盾恢复
    if (p.shieldDelay > 0) p.shieldDelay -= dt;
    else p.shield = Math.min(s.shieldMax, p.shield + s.shieldRegen * dt);

    const v = p.local ? readMoveInput() : { x: p.intent.mx || 0, y: p.intent.my || 0 };

    if (p.phaseTime > 0) {
      // 相位冲刺：高速位移、沿途留影，冲刺帧内几乎无敌
      const phaseBefore = p.phaseTime;
      p.phaseTime = Math.max(0, p.phaseTime - dt);
      const sp = CFG.SKILL.PHASE.SPEED * view.scale;
      p.x += p.phaseDir.x * sp * dt;
      p.y += p.phaseDir.y * sp * dt;
      p.invuln = Math.max(p.invuln, 0.05);
      p.phaseSpawn -= dt;
      if (p.phaseSpawn <= 0 && p.phaseLeft > 0) {
        p.phaseSpawn = CFG.SKILL.PHASE.TIME / CFG.SKILL.PHASE.SHADOWS;
        p.phaseLeft -= 1;
        spawnSkillShadow(p);
      }
      // 觉醒「残像终焉」：冲刺终点爆发
      if (phaseBefore > 0 && p.phaseTime === 0 &&
        p.skillAwaken === "awaken_phase" && !coopIsGuest()) {
        phaseAwakenBurst(p);
      }
    } else if (p.dashTime > 0) {
      p.dashTime -= dt;
      const sp = P.DASH_SPEED * view.scale;
      p.x += p.dashDir.x * sp * dt;
      p.y += p.dashDir.y * sp * dt;
    } else if (v.x !== 0 || v.y !== 0) {
      p.lastDir.x = v.x;
      p.lastDir.y = v.y;
      const sp = s.moveSpeed * view.scale;
      p.x += v.x * sp * dt;
      p.y += v.y * sp * dt;
    }

    // 边界限制（世界边界，而非视口）
    p.x = clamp(p.x, p.r + 2, world.w - p.r - 2);
    p.y = clamp(p.y, p.r + 2, world.h - p.r - 2);

    // 拖尾
    p.trailCd -= dt;
    if (p.trailCd <= 0) {
      p.trailCd = 0.035;
      emit(p.x, p.y, 1, p.invuln > 0 ? "#ffffff" : "#28c8ff", 26, 2.6, 0.4);
    }

    // 朝向最近敌人（用于绘制）
    const target = nearestEnemy(p);
    if (target) p.facing = Math.atan2(target.y - p.y, target.x - p.x);
    else if (v.x !== 0 || v.y !== 0) p.facing = Math.atan2(v.y, v.x);

    // 自动开火
    p.fireCd -= dt;
    if (p.fireCd <= 0 && target) {
      fireAt(target, p);
      // 防线联动：炮塔光环内射击间隔缩短
      p.fireCd = s.fireInterval * defenseFireMul(p);
    }

    // 记录实际速度，供敌机预判射击
    if (dt > 0) {
      p.velX = (p.x - px0) / dt;
      p.velY = (p.y - py0) / dt;
    }
  }

  // 无人机子弹（独立颜色，便于区分）
  function spawnDroneBullet(x, y, ang, s, p) {
    if (bullets.length >= CFG.LIMITS.BULLETS) return;
    const sp = s.bulletSpeed * view.scale * CFG.DRONES.SPEED_MUL;
    bullets.push({
      bid: nextBulletId++,
      owner: p ? p.id : (localPlayerId || "p1"),
      x, y,
      vx: Math.cos(ang) * sp,
      vy: Math.sin(ang) * sp,
      r: 3,
      dmg: s.damage * CFG.DRONES.DMG_MUL * (1 + (s.drones - 1) * 0.12),
      pierce: 0,
      life: 1.2,
      dead: false,
      hit: new Set(),
      ang,
      color: THEME.mint,
    });
  }

  // 守护无人机：环绕玩家，自动索敌射击
  function updateDrones(dt, t, p) {
    p = p || player;
    const s = p.stats;
    const n = Math.min(CFG.DRONES.MAX, s.drones || 0);
    if (n <= 0) return;
    const orbit = CFG.DRONES.ORBIT * view.scale;
    const range = s.range * view.scale * CFG.DRONES.RANGE_MUL;
    const range2 = range * range;
    for (let i = 0; i < n; i++) {
      if (p.droneCd.length <= i) p.droneCd.push(rand(0.3, 0.8));
      p.droneCd[i] -= dt;
      if (p.droneCd[i] > 0) continue;
      const ang = t * 1.15 + (i / n) * TAU;
      const dx = p.x + Math.cos(ang) * orbit;
      const dy = p.y + Math.sin(ang) * orbit;
      let best = null;
      let bestD = range2;
      for (let k = 0; k < enemies.length; k++) {
        const e = enemies[k];
        if (e.dead) continue;
        const d = dist2(e.x, e.y, dx, dy);
        if (d < bestD) { bestD = d; best = e; }
      }
      if (best) {
        spawnDroneBullet(dx, dy, Math.atan2(best.y - dy, best.x - dx), s, p);
        p.droneCd[i] = CFG.DRONES.FIRE_CD;
      } else {
        p.droneCd[i] = 0.2;
      }
    }
  }


  function nearestEnemy(p) {
    p = p || player;
    const s = p.stats;
    const range = s.range * view.scale;
    let best = null;
    let bestD = range * range;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (e.dead) continue;
      const d = dist2(e.x, e.y, p.x, p.y);
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  // 多弹道继承折扣：残影 / 反射弹继承散射等多弹武器时压低单发，避免总伤害失控
  function bulletInheritScale(n) {
    return n > 1 ? 1 / Math.sqrt(n) : 1;
  }

  // 通用武器弹道：普通射击 / 相位残影 / 擦弹反射共用，继承当前武器弹道
  function fireWeaponPattern(p, baseAng, damageMul, opts) {
    p = p || player;
    const s = p.stats;
    const o = opts || {};
    const n = s.bulletCount;
    const spread = Math.min(1.0, 0.11 * (n - 1) + (s.spread || 0));
    const dmg = s.damage * (damageMul === undefined ? 1 : damageMul);
    for (let i = 0; i < n; i++) {
      if (bullets.length >= CFG.LIMITS.BULLETS) break;
      const t = n === 1 ? 0.5 : i / (n - 1);
      const ang = baseAng + (t - 0.5) * spread;
      spawnPlayerBullet(ang, dmg, o.speedMul, p, o);
    }
  }

  function fireAt(target, p) {
    p = p || player;
    const s = p.stats;
    const baseAng = Math.atan2(target.y - p.y, target.x - p.x);
    p.facing = baseAng;
    // 擦弹回流：层数转化为强化射击（护盾过载改装使层数增伤减半）
    const stackMul = p.skillMod === "graze_overcharge" ? CFG.SKILL.GRAZE.OVER_STACK_MUL : 1;
    const grazeMul = 1 + (p.grazeStacks || 0) * CFG.SKILL.GRAZE.DMG_PER * stackMul;
    fireWeaponPattern(p, baseAng, grazeMul);

    // 进化「双子脉冲」：每次射击追加两道侧向脉冲
    if (s.twinPulse) {
      spawnPlayerBullet(baseAng - 0.12, s.damage * 0.7 * grazeMul, undefined, p);
      spawnPlayerBullet(baseAng + 0.12, s.damage * 0.7 * grazeMul, undefined, p);
    }

    // 枪口火花
    emit(p.x + Math.cos(baseAng) * 14, p.y + Math.sin(baseAng) * 14, 2, "#b9f7ff", 90, 2, 0.22);
    sfxShoot();
  }

  // 玩家子弹工厂（供普通射击 / 回响 / 残影 / 反射 / 终极使用）
  function spawnPlayerBullet(ang, dmgOverride, speedMul, p, opts) {
    p = p || player;
    const s = p.stats;
    const o = opts || {};
    if (bullets.length >= CFG.LIMITS.BULLETS) return;
    const sp = s.bulletSpeed * view.scale * (speedMul || 1);
    const ox = o.origin ? o.origin.x : p.x;
    const oy = o.origin ? o.origin.y : p.y;
    bullets.push({
      bid: nextBulletId++,
      owner: p.id,
      x: ox + Math.cos(ang) * (p.r + 4),
      y: oy + Math.sin(ang) * (p.r + 4),
      vx: Math.cos(ang) * sp,
      vy: Math.sin(ang) * sp,
      r: o.r || s.bulletR || 4,
      dmg: (dmgOverride === undefined ? s.damage : dmgOverride) *
        (chapterMod && chapterMod.playerDmgMul ? chapterMod.playerDmgMul : 1),
      pierce: o.pierce !== undefined ? o.pierce : s.pierce,
      life: o.life || 1.5,
      dead: false,
      hit: new Set(),
      ang,
      color: o.color || s.bulletColor || THEME.cyan,
      shadow: !!o.shadow,
      reflect: !!o.reflect,
      split: o.split || 0,
    });
  }

  function damagePlayer(baseDmg, p) {
    p = p || player;
    const s = p.stats;
    if (state !== "playing") return;
    if (p.down || p.eliminated) return;
    if (p.invuln > 0) return;

    const dmg = baseDmg * (1 - s.armor) * s.takenMul *
      (chapterMod && chapterMod.dmgTakenMul ? chapterMod.dmgTakenMul : 1);
    let remain = dmg;
    if (p.shield > 0) {
      const absorbed = Math.min(p.shield, remain);
      p.shield -= absorbed;
      remain -= absorbed;
    }
    if (remain > 0) p.hp -= remain;

    p.invuln = CFG.PLAYER.INVULN_ON_HURT;
    p.shieldDelay = CFG.PLAYER.SHIELD_DELAY;
    p.hitFlash = 1;
    emit(p.x, p.y, 14, "#ff4d6d", 220, 3, 0.5);
    // 受击反馈只作用于本地玩家，队友受伤不再让全场红屏/震屏/断连杀
    if (p === player) {
      hurtFlash = 1;
      shake = Math.max(shake, 12 * CFG.FX.SHAKE);
      sfxHurt();
      hitStop = Math.max(hitStop, 0.025);
      if (document.body.classList.contains("touch") && navigator.vibrate) navigator.vibrate(28);
      combo = 0;
      comboTimer = 0;
      // 受击会打断压迫节奏：威胁等级回落
      if (!coopIsGuest()) threat = Math.max(0, threat - CFG.THREAT.HIT_DROP);
    }
    if (roomCode) {                        // P4-02：受击立即关闭个人商店/游商
      if (p.shopOpen) coopCloseShop(p);
      if (p.tradeOffer) coopCloseTrade(p);
    }

    if (p.hp <= 0) {
      p.hp = 0;
      downPlayer(p);
    }
  }

  // 风险星域持续伤害：无视无敌帧，先扣护盾
  function drainPlayer(amount, p) {
    p = p || player;
    if (state !== "playing") return;
    if (p.down || p.eliminated) return;
    let remain = amount;
    if (p.shield > 0) {
      const a = Math.min(p.shield, remain);
      p.shield -= a;
      remain -= a;
    }
    if (remain > 0) p.hp -= remain;
    p.shieldDelay = CFG.PLAYER.SHIELD_DELAY;
    if (p === player) hurtFlash = Math.max(hurtFlash, 0.1);
    if (p.hp <= 0) {
      p.hp = 0;
      downPlayer(p);
    }
  }

  // 生命归零：单机保持原有结算；联机进入倒地倒计时，全队倒地才结算
  function downPlayer(p) {
    if (p.down || p.eliminated) return;
    if (tryRevive(p)) return;
    if (players.length <= 1) {
      endGame(false, "hp");
      return;
    }
    p.down = true;
    p.downTimer = CFG.PLAYER.DOWN_TIMEOUT;
    p.reviveProgress = 0;
    p.shield = 0;
    p.dashTime = 0;
    addText(p.x, p.y - 44, "倒地 · 等待队友救援", "#ff4d6d", 18);
    emit(p.x, p.y, 24, "#ff4d6d", 220, 3, 0.7);
    sfxHurt();
    if (players.every((q) => q.down || q.eliminated)) endGame(false, "hp");
  }

  // 队友靠近读条完成后的复活
  function revivePlayer(p) {
    p.down = false;
    p.downTimer = 0;
    p.reviveProgress = 0;
    p.eliminated = false;
    p.hp = Math.round(p.hpMax * CFG.PLAYER.REVIVE_HP);
    p.shield = 0;
    p.invuln = 2;
    p.shieldDelay = 2;
    addText(p.x, p.y - 44, "救援成功", "#8bffdc", 18);
    emit(p.x, p.y, 28, "#8bffdc", 260, 3.4, 0.8);
    sfxLevelUp();
  }

  // 联机倒地状态推进：倒计时、救援读条、全队淘汰结算
  function updateDownState(dt) {
    if (players.length <= 1) return;
    const R = CFG.PLAYER.REVIVE_RADIUS * view.scale;
    const R2 = R * R;
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      if (p.eliminated) continue;
      if (!p.down) { p.reviveProgress = 0; continue; }

      p.downTimer -= dt;
      if (p.downTimer <= 0) {
        p.downTimer = 0;
        p.eliminated = true;
        p.reviveProgress = 0;
        addText(p.x, p.y - 44, "信号消失", "#ff4d6d", 16);
        continue;
      }

      let near = false;
      for (let k = 0; k < players.length; k++) {
        const q = players[k];
        if (q === p || q.down || q.eliminated) continue;
        if (dist2(q.x, q.y, p.x, p.y) <= R2) { near = true; break; }
      }
      if (near) {
        p.reviveProgress += dt;
        if (p.reviveProgress >= CFG.PLAYER.REVIVE_TIME) revivePlayer(p);
      } else {
        p.reviveProgress = Math.max(0, p.reviveProgress - dt * 0.5);
      }
    }
    if (players.every((q) => q.eliminated)) endGame(false, "hp");
  }

  // 星港应急保险：以 50% 生命复活一次
  function tryRevive(p) {
    p = p || player;
    if (revives <= 0) return false;
    revives -= 1;
    p.hp = Math.round(p.hpMax * 0.5);
    p.shield = 0;
    p.invuln = 3;
    p.shieldDelay = 2;
    combo = 0;
    comboTimer = 0;
    for (let i = 0; i < ebullets.length; i++) ebullets[i].dead = true;
    emit(p.x, p.y, 36, "#8bffdc", 300, 4, 0.9);
    addText(p.x, p.y - 44, roomCode ? "全队应急保险启动 · 50% 生命" : "应急保险启动 · 50% 生命", "#8bffdc", 18);
    shake = Math.max(shake, 10 * CFG.FX.SHAKE);
    sfxLevelUp();
    refreshHud(true);
    return true;
  }

