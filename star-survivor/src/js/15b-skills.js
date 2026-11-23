  /* =====================================================================
   * 13.5 主动技能：相位冲刺 / 重力井 / 擦弹回流
   * 能量由被动恢复 + 命中敌人积累；Q（或触屏技能键）释放
   * ===================================================================*/
  const SKILL_DEFS = {
    phase: {
      key: "phase", name: "相位冲刺", icon: "⇢", tag: "机动",
      desc: "高速穿过弹幕与敌人，沿途留下 3 个残影向敌人补射",
      short: "冲刺无敌 · 残影补射",
    },
    well: {
      key: "well", name: "重力井", icon: "◎", tag: "控场",
      desc: "在前方生成引力场，吸附敌人与弹幕，结束时内爆",
      short: "聚怪 · 聚弹 · 内爆",
    },
    graze: {
      key: "graze", name: "擦弹回流", icon: "◌", tag: "生存",
      desc: "持续吸收擦过的子弹，转化为护盾与强化射击",
      short: "擦弹充能 · 护盾反击",
    },
  };

  function skillDef(p) {
    const key = (p && p.skill) || chosenSkill;
    return SKILL_DEFS[key] || SKILL_DEFS.phase;
  }

  // 命中敌人返能量（受能量获取倍率影响）
  function gainSkillEnergy(p, v) {
    if (!p || !p.skill || !(v > 0)) return;
    const mul = (p.stats && p.stats.skillGainMul) || 1;
    p.skillEnergy = Math.min(CFG.SKILL.MAX, (p.skillEnergy || 0) + v * mul);
  }

  function canCastSkill(p) {
    return !!p && !!p.skill && state === "playing" &&
      !p.down && !p.eliminated &&
      (p.skillLock || 0) <= 0 &&
      (p.skillEnergy || 0) >= CFG.SKILL.MAX;
  }

  // 本地玩家按 Q：客机只上报，由房主校验并执行
  function tryCastSkill() {
    const p = getLocalPlayer() || player;
    if (!canCastSkill(p)) {
      if (p && (p.skillEnergy || 0) < CFG.SKILL.MAX) {
        addText(p.x, p.y - 40, "技能能量不足", "#8fb8d8", 12);
      }
      return;
    }
    if (roomCode && coopIsGuest()) {
      let tx = p.x, ty = p.y;
      if (p.skill === "well") {
        const dist = CFG.SKILL.WELL.DIST * view.scale;
        const tgt = nearestEnemy(p);
        tx = tgt ? tgt.x : p.x + Math.cos(p.facing) * dist;
        ty = tgt ? tgt.y : p.y + Math.sin(p.facing) * dist;
      }
      // 本地即时反馈，真实效果由房主裁决
      p.skillEnergy = 0;
      p.skillLock = CFG.SKILL.CAST_LOCK;
      if (p.skill === "phase") {
        const v = readMoveInput();
        let dx = v.x, dy = v.y;
        if (dx === 0 && dy === 0) { dx = Math.cos(p.facing); dy = Math.sin(p.facing); }
        const len = Math.hypot(dx, dy) || 1;
        p.phaseDir = { x: dx / len, y: dy / len };
        p.phaseTime = CFG.SKILL.PHASE.TIME;
        p.phaseLeft = CFG.SKILL.PHASE.SHADOWS;
        p.phaseSpawn = 0;
        p.invuln = Math.max(p.invuln, CFG.SKILL.PHASE.TIME + 0.08);
      } else if (p.skill === "graze") {
        p.grazeActive = CFG.SKILL.GRAZE.TIME * (p.stats.skillDurationMul || 1);
        p.grazeStacks = 0;
      }
      emit(p.x, p.y, 14, THEME.cyanSoft, 200, 3, 0.5);
      coopEventSeq += 1;
      coopSendCtrl({ t: "ev", id: coopEventSeq, k: "skill", d: { x: tx, y: ty } });
      return;
    }
    castSkill(p);
  }

  // 实际施放：房主 / 单机执行，客机由房主代为执行
  function castSkill(p, aimX, aimY) {
    if (!p || !p.skill) return false;
    if (state !== "playing" || p.down || p.eliminated) return false;
    if ((p.skillLock || 0) > 0) return false;
    if ((p.skillEnergy || 0) < CFG.SKILL.MAX) return false;

    p.skillEnergy = 0;
    p.skillLock = CFG.SKILL.CAST_LOCK;

    if (p.skill === "phase") {
      const v = p.local ? readMoveInput() : { x: p.intent.mx || 0, y: p.intent.my || 0 };
      let dx = v.x, dy = v.y;
      if (dx === 0 && dy === 0) { dx = Math.cos(p.facing); dy = Math.sin(p.facing); }
      const len = Math.hypot(dx, dy) || 1;
      p.phaseDir = { x: dx / len, y: dy / len };
      p.phaseTime = CFG.SKILL.PHASE.TIME;
      p.phaseLeft = CFG.SKILL.PHASE.SHADOWS;
      p.phaseSpawn = 0;
      p.invuln = Math.max(p.invuln, CFG.SKILL.PHASE.TIME + 0.08);
      emit(p.x, p.y, 16, THEME.cyan, 220, 3, 0.5);
      sfxDash();
    } else if (p.skill === "well") {
      const dist = CFG.SKILL.WELL.DIST * view.scale;
      let tx = p.x + Math.cos(p.facing) * dist;
      let ty = p.y + Math.sin(p.facing) * dist;
      if (isFinite(aimX) && isFinite(aimY)) {
        // 客机指定落点：限制在可部署范围内
        const dx = aimX - p.x, dy = aimY - p.y;
        const d = Math.hypot(dx, dy);
        const maxD = dist * 1.6;
        if (d > maxD && d > 0.001) {
          tx = p.x + (dx / d) * maxD;
          ty = p.y + (dy / d) * maxD;
        } else { tx = aimX; ty = aimY; }
      } else {
        const tgt = nearestEnemy(p);
        if (tgt) { tx = tgt.x; ty = tgt.y; }
      }
      pushGravityWell(p, tx, ty);
    } else if (p.skill === "graze") {
      p.grazeActive = CFG.SKILL.GRAZE.TIME * (p.stats.skillDurationMul || 1);
      p.grazeStacks = 0;
      emit(p.x, p.y, 20, THEME.mint, 220, 3, 0.65);
      addText(p.x, p.y - 40, "擦弹回流", THEME.mint, 15);
      sfxLevelUp();
    }
    refreshHud(true);
    return true;
  }

  function pushGravityWell(p, x, y) {
    const dur = CFG.SKILL.WELL.TIME * (p.stats.skillDurationMul || 1);
    gravityWells.push({
      owner: p.id,
      x, y,
      r: CFG.SKILL.WELL.RADIUS * view.scale,
      t: dur, maxT: dur,
      seed: Math.random() * TAU,
      synced: false,
    });
    emit(x, y, 24, THEME.violet, 240, 3.2, 0.65);
    addText(x, y - 30, "重力井", THEME.violet, 15);
    sfxUlt();
  }

  function spawnSkillShadow(p) {
    if (skillShadows.length > 24) skillShadows.shift();
    skillShadows.push({
      owner: p.id,
      x: p.x, y: p.y,
      ang: p.facing,
      t: CFG.SKILL.PHASE.SHADOW_DELAY,
      life: CFG.SKILL.PHASE.SHADOW_LIFE,
      fired: false,
    });
  }

  function fireShadowBullet(s) {
    const p = coopPlayerById(s.owner) || player;
    if (!p) return;
    if (bullets.length >= CFG.LIMITS.BULLETS) return;
    let best = null;
    let bestD = (p.stats.range * view.scale) * (p.stats.range * view.scale);
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (e.dead) continue;
      const d = dist2(s.x, s.y, e.x, e.y);
      if (d < bestD) { bestD = d; best = e; }
    }
    const ang = best ? Math.atan2(best.y - s.y, best.x - s.x) : s.ang;
    const sp = p.stats.bulletSpeed * view.scale * 0.9;
    bullets.push({
      bid: nextBulletId++,
      owner: p.id,
      x: s.x, y: s.y,
      vx: Math.cos(ang) * sp,
      vy: Math.sin(ang) * sp,
      r: Math.max(2.5, (p.stats.bulletR || 4) * 0.8),
      dmg: p.stats.damage * CFG.SKILL.PHASE.SHADOW_DMG * (p.stats.skillPowerMul || 1),
      pierce: 0,
      life: 1.0,
      dead: false,
      hit: new Set(),
      ang,
      color: THEME.cyanSoft,
      shadow: true,
    });
  }

  // 擦弹吸收：转护盾 + 叠加层数 + 少量回能
  function grazeAbsorb(p, b) {
    p.shield = Math.min(p.stats.shieldMax, p.shield + CFG.SKILL.GRAZE.SHIELD);
    p.grazeStacks = Math.min(CFG.SKILL.GRAZE.MAX_STACKS, (p.grazeStacks || 0) + 1);
    gainSkillEnergy(p, CFG.SKILL.GRAZE.ENERGY);
    emit(b.x, b.y, 4, THEME.mint, 150, 2, 0.3);
  }

  function updateSkillEffects(dt) {
    updateSkillShadows(dt);
    updateGravityWells(dt);
  }

  function updateSkillShadows(dt) {
    for (let i = skillShadows.length - 1; i >= 0; i--) {
      const s = skillShadows[i];
      s.t -= dt;
      s.life -= dt;
      if (!s.fired && s.t <= 0) {
        s.fired = true;
        if (!coopIsGuest()) fireShadowBullet(s);
      }
      if (s.life <= 0) skillShadows.splice(i, 1);
    }
  }

  function updateGravityWells(dt) {
    const pullE = CFG.SKILL.WELL.PULL_ENEMY * view.scale;
    const pullB = CFG.SKILL.WELL.PULL_BULLET * view.scale;
    for (let i = gravityWells.length - 1; i >= 0; i--) {
      const w = gravityWells[i];
      w.t -= dt;
      w.seed += dt * 2.2;
      if (coopIsGuest()) {
        if (w.t <= 0) gravityWells.splice(i, 1);
        continue;
      }

      // 吸附敌人（Boss 抗性更强）
      for (let k = 0; k < enemies.length; k++) {
        const e = enemies[k];
        if (e.dead) continue;
        const d = Math.hypot(w.x - e.x, w.y - e.y);
        if (d > w.r || d < 0.001) continue;
        const mul = e.isBoss ? 0.3 : 1;
        e.x += ((w.x - e.x) / d) * pullE * mul * dt;
        e.y += ((w.y - e.y) / d) * pullE * mul * dt;
      }
      // 吸附敌弹
      for (let k = 0; k < ebullets.length; k++) {
        const b = ebullets[k];
        if (b.dead || b.synced) continue;
        const d = Math.hypot(w.x - b.x, w.y - b.y);
        if (d > w.r || d < 0.001) continue;
        b.x += ((w.x - b.x) / d) * pullB * dt;
        b.y += ((w.y - b.y) / d) * pullB * dt;
      }

      if (w.t <= 0) {
        const p = coopPlayerById(w.owner) || player;
        const power = (p && p.stats.skillPowerMul) || 1;
        explodeAt(w.x, w.y, CFG.SKILL.WELL.DMG * power, null,
          CFG.SKILL.WELL.RADIUS, THEME.violet, w.owner);
        emit(w.x, w.y, 26, THEME.violet, 280, 3.6, 0.75);
        gravityWells.splice(i, 1);
        if (state !== "playing") return;
      }
    }
  }

  /* ===== 联机快照：重力井 ===== */
  function coopWellList() {
    const arr = [];
    for (let i = 0; i < gravityWells.length; i++) {
      const w = gravityWells[i];
      arr.push([Math.round(w.x), Math.round(w.y), Math.round(w.r), Math.max(0, Math.round(w.t * 100) / 100)]);
    }
    return arr;
  }

  function coopApplyWells(list) {
    if (!coopIsGuest()) return;
    gravityWells = gravityWells.filter((w) => !w.synced);
    if (!list) return;
    for (let i = 0; i < list.length; i++) {
      const row = list[i];
      if (!row || row.length < 4) continue;
      gravityWells.push({
        x: row[0], y: row[1], r: row[2],
        t: row[3], maxT: row[3] || 1,
        seed: Math.random() * TAU, synced: true,
      });
    }
  }

  /* ===== 渲染 ===== */
  function drawGravityWells(t) {
    for (let i = 0; i < gravityWells.length; i++) {
      const w = gravityWells[i];
      if (w.x < cull.x0 || w.x > cull.x1 || w.y < cull.y0 || w.y > cull.y1) continue;
      ctx.save();
      const a = 0.35 + 0.2 * Math.sin(t * 6 + w.seed);
      drawGlow(THEME.violet, w.x, w.y, w.r * 0.95, 0.22);
      for (let k = 0; k < 3; k++) {
        const p = (t * 0.55 + k / 3 + w.seed * 0.12) % 1;
        const rr = w.r * (0.25 + 0.75 * p);
        ctx.globalAlpha = a * (1 - p);
        ctx.strokeStyle = THEME.violet;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(w.x, w.y, rr, 0, TAU);
        ctx.stroke();
      }
      ctx.globalAlpha = a;
      ctx.fillStyle = rgbaOf(THEME.violet, 0.1);
      ctx.beginPath();
      ctx.arc(w.x, w.y, w.r * 0.22, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawSkillShadows(t) {
    for (let i = 0; i < skillShadows.length; i++) {
      const s = skillShadows[i];
      if (s.x < cull.x0 || s.x > cull.x1 || s.y < cull.y0 || s.y > cull.y1) continue;
      const a = clamp(s.life / CFG.SKILL.PHASE.SHADOW_LIFE, 0, 1);
      ctx.save();
      ctx.globalAlpha = a * 0.55;
      drawGlow(THEME.cyan, s.x, s.y, 22, 0.4);
      ctx.translate(s.x, s.y);
      ctx.rotate(s.ang + Math.PI / 2);
      ctx.strokeStyle = THEME.cyanSoft;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(0, -12);
      ctx.lineTo(8, 9);
      ctx.lineTo(-8, 9);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawGrazeAura(p, t) {
    if (!(p.grazeActive > 0)) return;
    const rr = p.r + CFG.SKILL.GRAZE.RADIUS;
    ctx.save();
    ctx.globalAlpha = 0.35 + 0.12 * Math.sin(t * 8);
    ctx.strokeStyle = THEME.mint;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, rr, 0, TAU);
    ctx.stroke();
    if (p.grazeStacks > 0) {
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = rgbaOf(THEME.mint, 0.65);
      ctx.beginPath();
      ctx.arc(p.x, p.y, rr + 3 + p.grazeStacks * 0.7, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }
