  /* =====================================================================
   * 13. 主动技能：相位冲刺 / 重力井 / 擦弹回流
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
    beam: {
      key: "beam", name: "灼蚀光束", icon: "≋", tag: "输出",
      desc: "引导贯穿光束扫射，路径上所有敌人持续受击；引导期间移速下降并暂停自动射击",
      short: "持续激光 · 贯穿压制",
    },
  };

  function skillDef(p) {
    const key = (p && p.skill) || chosenSkill;
    return SKILL_DEFS[key] || SKILL_DEFS.phase;
  }

  // 技能改装定义：p.skillMod 形如 "phase_ice" → 卡牌 id "mod_phase_ice"
  function skillModDef(p) {
    if (!p || !p.skillMod) return null;
    const id = "mod_" + p.skillMod;
    for (let i = 0; i < SKILL_MODS.length; i++) {
      if (SKILL_MODS[i].id === id) return SKILL_MODS[i];
    }
    return null;
  }

  function skillDisplayName(p) {
    const sd = skillDef(p);
    const md = skillModDef(p);
    let name = md ? sd.name + "·" + md.name : sd.name;
    if (p && p.skillAwaken) name += "·觉醒";
    return name;
  }

  // 命中敌人返能量（受能量获取倍率与星域事件影响）
  function gainSkillEnergy(p, v) {
    if (!p || !p.skill || !(v > 0)) return;
    const mul = ((p.stats && p.stats.skillGainMul) || 1) *
      (chapterMod && chapterMod.energyMul ? chapterMod.energyMul : 1);
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
      if (p.skill === "well" || p.skill === "beam") {
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
        p.grazeAbsorbed = 0;
      } else if (p.skill === "beam") {
        // 本地立即起束，实际伤害与命中仍由房主结算
        p.beamAng = (tx !== p.x || ty !== p.y) ? Math.atan2(ty - p.y, tx - p.x) : p.facing;
        p.beamTime = CFG.SKILL.BEAM.TIME * (p.stats.skillDurationMul || 1);
        p.beamTick = 0;
      }
      emit(p.x, p.y, 14, THEME.cyanSoft, 200, 3, 0.5);
      if (p.skill === "beam") sfxBeamStart();
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
      p.grazeAbsorbed = 0;
      p.grazeReflect = 0;
      p.grazeAwakenCount = 0;
      emit(p.x, p.y, 20, THEME.mint, 220, 3, 0.65);
      addText(p.x, p.y - 40, "擦弹回流", THEME.mint, 15);
      sfxLevelUp();
    } else if (p.skill === "beam") {
      const tgt = nearestEnemy(p);
      p.beamAng = isFinite(aimX) && isFinite(aimY)
        ? Math.atan2(aimY - p.y, aimX - p.x)
        : tgt ? Math.atan2(tgt.y - p.y, tgt.x - p.x) : p.facing;
      p.beamTime = CFG.SKILL.BEAM.TIME * (p.stats.skillDurationMul || 1);
      p.beamTick = 0;
      emit(p.x, p.y, 18, "#ffb347", 230, 3.2, 0.6);
      addText(p.x, p.y - 42, skillDisplayName(p), "#ffb347", 15);
      sfxBeamStart();
    }
    // 防线联动：技能施放为附近炮塔叠加过载
    if (!coopIsGuest()) overclockNearbyTurrets(p);
    refreshHud(true);
    return true;
  }

  function pushGravityWell(p, x, y) {
    const mod = p.skillMod || "";
    let radius = CFG.SKILL.WELL.RADIUS;
    let dur = CFG.SKILL.WELL.TIME;
    if (mod === "well_singularity") radius *= CFG.SKILL.WELL.SINGULARITY_R;
    if (mod === "well_pulse") dur *= CFG.SKILL.WELL.PULSE_TIME;
    dur *= (p.stats.skillDurationMul || 1);
    gravityWells.push({
      owner: p.id,
      x, y,
      r: radius * view.scale,
      t: dur, maxT: dur,
      mod,
      awaken: p.skillAwaken || "",
      pulseCd: CFG.SKILL.WELL.PULSE_CD,
      seed: Math.random() * TAU,
      synced: false,
    });
    emit(x, y, 24, THEME.violet, 240, 3.2, 0.65);
    addText(x, y - 30, skillDisplayName(p), THEME.violet, 15);
    sfxUlt();
  }

  function spawnSkillShadow(p) {
    if (skillShadows.length > 24) skillShadows.shift();
    const mod = p.skillMod || "";
    skillShadows.push({
      owner: p.id,
      x: p.x, y: p.y,
      ang: p.facing,
      mod,
      // 爆痕：残影延迟爆炸；普通/冰痕：短暂延迟后补射
      t: mod === "phase_blast" ? CFG.SKILL.PHASE.BLAST_DELAY : CFG.SKILL.PHASE.SHADOW_DELAY,
      life: mod === "phase_blast"
        ? Math.max(CFG.SKILL.PHASE.SHADOW_LIFE, CFG.SKILL.PHASE.BLAST_DELAY + 0.2)
        : CFG.SKILL.PHASE.SHADOW_LIFE,
      fired: false,
    });
    // 冰痕：残影不射击，落点生成减速区（房主权威，客机走快照）
    if (mod === "phase_ice" && !coopIsGuest()) pushFrostZone(p, p.x, p.y);
  }

  function fireShadowBullet(s) {
    const p = coopPlayerById(s.owner) || player;
    if (!p) return;
    const mod = s.mod || "";
    // 爆痕：延迟后原地爆炸，范围伤害高于普通残影补射
    if (mod === "phase_blast") {
      const dmg = p.stats.damage * CFG.SKILL.PHASE.BLAST_DMG * (p.stats.skillPowerMul || 1);
      explodeAt(s.x, s.y, dmg, null, CFG.SKILL.PHASE.BLAST_RADIUS, "#ffb46a", p.id);
      emit(s.x, s.y, 16, "#ffb46a", 260, 3, 0.55);
      return;
    }
    let best = null;
    let bestD = (p.stats.range * view.scale) * (p.stats.range * view.scale);
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (e.dead) continue;
      const d = dist2(s.x, s.y, e.x, e.y);
      if (d < bestD) { bestD = d; best = e; }
    }
    const ang = best ? Math.atan2(best.y - s.y, best.x - s.x) : s.ang;
    // 继承当前武器弹道（散射多弹 / 轨道穿透 / 脉冲连发）
    const mul = CFG.SKILL.PHASE.SHADOW_DMG * (p.stats.skillPowerMul || 1) *
      bulletInheritScale(p.stats.bulletCount || 1);
    fireWeaponPattern(p, ang, mul, {
      speedMul: 0.9,
      life: 1.0,
      shadow: true,
      color: THEME.cyanSoft,
      origin: { x: s.x, y: s.y },
    });
  }

  // 擦弹吸收：转护盾 + 叠加层数 + 少量回能
  function grazeAbsorb(p, b) {
    const over = p.skillMod === "graze_overcharge";
    const shieldGain = over ? CFG.SKILL.GRAZE.OVER_SHIELD : CFG.SKILL.GRAZE.SHIELD;
    p.grazeAbsorbed = (p.grazeAbsorbed || 0) + 1;
    p.shield = Math.min(p.stats.shieldMax, p.shield + shieldGain);
    p.grazeStacks = Math.min(CFG.SKILL.GRAZE.MAX_STACKS, (p.grazeStacks || 0) + 1);
    gainSkillEnergy(p, CFG.SKILL.GRAZE.ENERGY);
    // 反射装甲：每吸收 N 发返还一发强化弹
    if (p.skillMod === "graze_reflect") {
      p.grazeReflect = (p.grazeReflect || 0) + 1;
      if (p.grazeReflect >= CFG.SKILL.GRAZE.REFLECT_EVERY) {
        p.grazeReflect = 0;
        fireReflectBullet(p, 0);
      }
    }
    // 觉醒「裂变反射」：每 2 发额外返还一枚可分裂反射弹
    if (p.skillAwaken === "awaken_graze") {
      p.grazeAwakenCount = (p.grazeAwakenCount || 0) + 1;
      if (p.grazeAwakenCount >= CFG.SKILL.AWAKEN.GRAZE_EVERY) {
        p.grazeAwakenCount = 0;
        fireReflectBullet(p, CFG.SKILL.AWAKEN.SPLIT_COUNT);
      }
    }
    // 防线联动：擦弹同时为附近城墙充能
    if (!coopIsGuest()) chargeNearbyWalls(p);
    emit(b.x, b.y, 4, THEME.mint, 150, 2, 0.3);
    // 吸收达到上限：光环饱和消散，需要重新施放才能继续吞弹
    if (p.grazeAbsorbed >= CFG.SKILL.GRAZE.MAX_ABSORB) {
      p.grazeActive = 0;
      p.grazeStacks = 0;
      addText(p.x, p.y - 34, "擦弹饱和", "#8fb8d8", 12);
    }
  }

  function fireReflectBullet(p, splitCount) {
    const tgt = nearestEnemy(p);
    const ang = tgt ? Math.atan2(tgt.y - p.y, tgt.x - p.x) : p.facing;
    const mul = CFG.SKILL.GRAZE.REFLECT_DMG * (p.stats.skillPowerMul || 1) *
      bulletInheritScale(p.stats.bulletCount || 1);
    fireWeaponPattern(p, ang, mul, {
      pierce: (p.stats.pierce || 0) + 1,
      reflect: true,
      split: splitCount || 0,
      color: THEME.mint,
      life: 1.2,
      speedMul: 1.05,
    });
    emit(p.x, p.y, 8, THEME.mint, 190, 2.6, 0.4);
  }

  // 觉醒「残像终焉」：冲刺终点爆炸，冰痕顺势留下冰区
  function phaseAwakenBurst(p) {
    const dmg = p.stats.damage * CFG.SKILL.AWAKEN.PHASE_DMG *
      (p.stats.skillPowerMul || 1);
    explodeAt(p.x, p.y, dmg, null, CFG.SKILL.AWAKEN.PHASE_RADIUS, THEME.cyan, p.id);
    emit(p.x, p.y, 22, THEME.cyan, 260, 3.4, 0.7);
    shake = Math.max(shake, 2.4 * CFG.FX.SHAKE);
    if (p.skillMod === "phase_ice") pushFrostZone(p, p.x, p.y);
  }

  function updateSkillEffects(dt) {
    updateSkillShadows(dt);
    updateGravityWells(dt);
    updateFrostZones(dt);
    updateBeams(dt);
  }

  /* ===== 灼蚀光束 ===== */
  function beamMoveMul(p) {
    const B = CFG.SKILL.BEAM;
    return p && p.skillMod === "beam_wide" ? B.WIDE_SLOW : B.SLOW;
  }

  function beamSpec(p) {
    const B = CFG.SKILL.BEAM;
    let width = B.WIDTH * view.scale;
    let dmg = B.DMG;
    if (p.skillMod === "beam_focus") { width *= B.FOCUS_WIDTH; dmg *= B.FOCUS_DMG; }
    else if (p.skillMod === "beam_wide") { width *= B.WIDE_WIDTH; dmg *= B.WIDE_DMG; }
    return { width, dmg, len: B.LEN * view.scale };
  }

  function updateBeams(dt) {
    const B = CFG.SKILL.BEAM;
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      if (!(p.beamTime > 0)) continue;
      p.beamTime = Math.max(0, p.beamTime - dt);
      p.beamTick = (p.beamTick || 0) - dt;
      // 客机只播放表现，伤害由房主结算
      if (coopIsGuest()) continue;
      if (p.beamTick <= 0) {
        p.beamTick += B.TICK;
        beamDamageTick(p);
        sfxBeamTick();
        if (state !== "playing") return;
      }
    }
  }

  function beamDamageTick(p) {
    const spec = beamSpec(p);
    const baseDmg = (p.stats.damage || 1) * spec.dmg * (p.stats.skillPowerMul || 1);
    const lines = [{ ang: p.beamAng, mul: 1, w: spec.width }];
    if (p.skillAwaken === "awaken_beam") {
      const A = CFG.SKILL.AWAKEN;
      lines.push({ ang: p.beamAng + A.BEAM_SIDE_ANG, mul: A.BEAM_SIDE_MUL, w: spec.width * 0.6 });
      lines.push({ ang: p.beamAng - A.BEAM_SIDE_ANG, mul: A.BEAM_SIDE_MUL, w: spec.width * 0.6 });
    }
    for (let k = 0; k < enemies.length; k++) {
      const e = enemies[k];
      if (e.dead) continue;
      for (let li = 0; li < lines.length; li++) {
        const L = lines[li];
        const dx = Math.cos(L.ang), dy = Math.sin(L.ang);
        const rx = e.x - p.x, ry = e.y - p.y;
        const proj = rx * dx + ry * dy;
        if (proj < -e.r || proj > spec.len + e.r) continue;
        const perp = Math.abs(rx * dy - ry * dx);
        if (perp > L.w * 0.5 + e.r) continue;
        // 静默跳伤：避免每 0.12 秒刷屏数字；不回技能能量，防止引导期自充能
        hurtEnemy(e, baseDmg * L.mul, false, true, p.id, L.ang, true);
        break;
      }
    }
  }

  function updateSkillShadows(dt) {
    for (let i = skillShadows.length - 1; i >= 0; i--) {
      const s = skillShadows[i];
      s.t -= dt;
      s.life -= dt;
      if (!s.fired && s.t <= 0) {
        s.fired = true;
        if (!coopIsGuest() && s.mod !== "phase_ice") fireShadowBullet(s);
      }
      if (s.life <= 0) skillShadows.splice(i, 1);
    }
  }

  /* ===== 冰痕减速区 ===== */
  function pushFrostZone(p, x, y) {
    if (frostZones.length > 30) frostZones.shift();
    frostZones.push({
      owner: p ? p.id : "",
      awaken: p && p.skillAwaken === "awaken_phase" ? 1 : 0,
      x, y,
      r: CFG.SKILL.PHASE.ICE_RADIUS * view.scale,
      t: CFG.SKILL.PHASE.ICE_TIME, maxT: CFG.SKILL.PHASE.ICE_TIME,
      freezeCd: 0,
      seed: Math.random() * TAU,
      synced: false,
    });
  }

  function updateFrostZones(dt) {
    for (let i = frostZones.length - 1; i >= 0; i--) {
      const z = frostZones[i];
      z.t -= dt;
      if (!coopIsGuest()) {
        z.freezeCd = Math.max(0, (z.freezeCd || 0) - dt);
        const frozen = z.awaken && z.freezeCd <= 0;
        if (frozen) z.freezeCd = CFG.SKILL.AWAKEN.FREEZE_CD;
        for (let k = 0; k < enemies.length; k++) {
          const e = enemies[k];
          if (e.dead) continue;
          if (dist2(z.x, z.y, e.x, e.y) <= z.r * z.r) {
            e.frostT = 0.25;
            if (frozen) {
              e.freezeT = Math.max(e.freezeT || 0,
                e.isBoss ? CFG.SKILL.AWAKEN.FREEZE_BOSS : CFG.SKILL.AWAKEN.FREEZE_TIME);
            }
          }
        }
        if (frozen) emit(z.x, z.y, 10, "#c8f4ff", 170, 2.8, 0.45);
      }
      if (z.t <= 0) frostZones.splice(i, 1);
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

      // 奇点改装 / 觉醒事件视界：吸附更强
      const isBlack = w.mod === "well_black";
      const pullMul = isBlack ? CFG.SKILL.AWAKEN.HOLE_PULL
        : w.mod === "well_singularity" ? CFG.SKILL.WELL.SINGULARITY_PULL : 1;
      const pe = pullE * pullMul;
      const pb = pullB * pullMul;

      // 吸附敌人（Boss 抗性更强）
      for (let k = 0; k < enemies.length; k++) {
        const e = enemies[k];
        if (e.dead) continue;
        const d = Math.hypot(w.x - e.x, w.y - e.y);
        if (d > w.r || d < 0.001) continue;
        const mul = e.isBoss ? 0.3 : 1;
        // 持续控场递减：吸附越久拉力越弱，避免无限聚怪
        const resist = 1 - Math.min(CFG.SKILL.WELL.CC_RESIST_MAX, e.ccRes || 0);
        e.x += ((w.x - e.x) / d) * pe * mul * resist * dt;
        e.y += ((w.y - e.y) / d) * pe * mul * resist * dt;
        e.ccRes = Math.min(CFG.SKILL.WELL.CC_RESIST_MAX,
          (e.ccRes || 0) + CFG.SKILL.WELL.CC_RESIST_GAIN * dt);
      }
      // 吸附敌弹
      for (let k = 0; k < ebullets.length; k++) {
        const b = ebullets[k];
        if (b.dead || b.synced) continue;
        const d = Math.hypot(w.x - b.x, w.y - b.y);
        if (d > w.r || d < 0.001) continue;
        b.x += ((w.x - b.x) / d) * pb * dt;
        b.y += ((w.y - b.y) / d) * pb * dt;
      }

      const ownerP = coopPlayerById(w.owner) || player;
      const power = (ownerP && ownerP.stats.skillPowerMul) || 1;

      // 脉冲井 / 事件视界：周期性范围伤害
      if (w.mod === "well_pulse" || isBlack) {
        w.pulseCd -= dt;
        if (w.pulseCd <= 0) {
          w.pulseCd += isBlack ? CFG.SKILL.AWAKEN.HOLE_CD : CFG.SKILL.WELL.PULSE_CD;
          const tick = isBlack ? CFG.SKILL.AWAKEN.HOLE_DMG : CFG.SKILL.WELL.PULSE_DMG;
          explodeAt(w.x, w.y, tick * power, null,
            w.r / view.scale, THEME.violet, w.owner);
          emit(w.x, w.y, isBlack ? 8 : 10, THEME.violet, 210, 2.8, 0.45);
          if (state !== "playing") return;
        }
      }

      if (w.t <= 0) {
        if (w.mod !== "well_pulse" && !isBlack) {
          const dmgMul = w.mod === "well_singularity" ? CFG.SKILL.WELL.SINGULARITY_DMG : 1;
          explodeAt(w.x, w.y, CFG.SKILL.WELL.DMG * power * dmgMul, null,
            w.r / view.scale, THEME.violet, w.owner);
          emit(w.x, w.y, 26, THEME.violet, 280, 3.6, 0.75);
        }
        // 觉醒「事件视界」：结束后留下持续吸附与脉冲的黑洞
        if (!isBlack && ownerP && ownerP.skillAwaken === "awaken_well") {
          pushBlackHole(w, ownerP);
        }
        gravityWells.splice(i, 1);
        if (state !== "playing") return;
      }
    }
  }

  function pushBlackHole(w, ownerP) {
    const dur = CFG.SKILL.AWAKEN.HOLE_TIME;
    gravityWells.push({
      owner: w.owner,
      x: w.x, y: w.y,
      r: w.r * CFG.SKILL.AWAKEN.HOLE_R,
      t: dur, maxT: dur,
      mod: "well_black",
      awaken: ownerP.skillAwaken,
      pulseCd: 0.2,
      seed: Math.random() * TAU,
      synced: false,
    });
    emit(w.x, w.y, 20, "#7c5cff", 260, 3.2, 0.65);
    addText(w.x, w.y - 34, "事件视界", "#b9a6ff", 15);
  }

  /* ===== 联机快照：重力井 / 冰区 ===== */
  function coopWellList() {
    const arr = [];
    for (let i = 0; i < gravityWells.length; i++) {
      const w = gravityWells[i];
      arr.push([
        Math.round(w.x), Math.round(w.y), Math.round(w.r),
        Math.max(0, Math.round(w.t * 100) / 100),
        w.mod === "well_pulse" ? 1 : w.mod === "well_black" ? 2
          : w.mod === "well_singularity" ? 3 : 0,
      ]);
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
      const code = row[4] || 0;
      gravityWells.push({
        x: row[0], y: row[1], r: row[2],
        t: row[3], maxT: row[3] || 1,
        mod: code === 1 ? "well_pulse" : code === 2 ? "well_black"
          : code === 3 ? "well_singularity" : "",
        pulseCd: code === 2 ? CFG.SKILL.AWAKEN.HOLE_CD : CFG.SKILL.WELL.PULSE_CD,
        seed: Math.random() * TAU, synced: true,
      });
    }
  }

  function coopFrostList() {
    const arr = [];
    for (let i = 0; i < frostZones.length; i++) {
      const z = frostZones[i];
      arr.push([Math.round(z.x), Math.round(z.y), Math.round(z.r),
        Math.max(0, Math.round(z.t * 100) / 100), z.awaken ? 1 : 0]);
    }
    return arr;
  }

  function coopApplyFrost(list) {
    if (!coopIsGuest()) return;
    frostZones = frostZones.filter((z) => !z.synced);
    if (!list) return;
    for (let i = 0; i < list.length; i++) {
      const row = list[i];
      if (!row || row.length < 4) continue;
      frostZones.push({
        x: row[0], y: row[1], r: row[2],
        t: row[3], maxT: row[3] || 1,
        awaken: row[4] ? 1 : 0,
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
      const black = w.mod === "well_black";
      const col = black ? "#8f7bff" : THEME.violet;
      const a = 0.35 + 0.2 * Math.sin(t * 6 + w.seed);
      drawGlow(col, w.x, w.y, w.r * 0.95, black ? 0.3 : 0.22);
      for (let k = 0; k < 3; k++) {
        const p = (t * 0.55 + k / 3 + w.seed * 0.12) % 1;
        const rr = w.r * (0.25 + 0.75 * p);
        ctx.globalAlpha = a * (1 - p);
        ctx.strokeStyle = col;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(w.x, w.y, rr, 0, TAU);
        ctx.stroke();
      }
      ctx.globalAlpha = black ? 0.55 : a;
      ctx.fillStyle = black ? "rgba(6,2,18,0.72)" : rgbaOf(THEME.violet, 0.1);
      ctx.beginPath();
      ctx.arc(w.x, w.y, w.r * (black ? 0.3 : 0.22), 0, TAU);
      ctx.fill();
      if (black) {
        ctx.globalAlpha = 0.65;
        ctx.strokeStyle = "#d9ccff";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(w.x, w.y, w.r * 0.32, 0, TAU);
        ctx.stroke();
      }
      // 脉冲井 / 事件视界：按脉冲节奏叠加内圈
      if (w.mod === "well_pulse" || black) {
        const cdMax = black ? CFG.SKILL.AWAKEN.HOLE_CD : CFG.SKILL.WELL.PULSE_CD;
        const ph = 1 - clamp((w.pulseCd || 0) / cdMax, 0, 1);
        if (black) {
          ctx.globalAlpha = 0.5 * (1 - ph) + 0.12;
          ctx.strokeStyle = "#c8b8ff";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(w.x, w.y, w.r * (0.36 + 0.5 * ph), 0, TAU);
          ctx.stroke();
        } else {
        ctx.globalAlpha = 0.28 * (1 - ph);
        ctx.strokeStyle = THEME.violet;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(w.x, w.y, w.r * (0.35 + 0.55 * ph), 0, TAU);
        ctx.stroke();
        }
      }
      ctx.restore();
    }
  }

  function drawSkillBeams(t) {
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      if (!(p.beamTime > 0)) continue;
      const spec = beamSpec(p);
      const drawOne = (ang, width, alpha) => {
        const ex = p.x + Math.cos(ang) * spec.len;
        const ey = p.y + Math.sin(ang) * spec.len;
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.lineCap = "round";
        // 外层光晕
        ctx.globalAlpha = 0.16 * alpha;
        ctx.strokeStyle = "#ff7a2f";
        ctx.lineWidth = width * 1.5;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(ex, ey); ctx.stroke();
        // 主体
        ctx.globalAlpha = 0.7 * alpha;
        ctx.strokeStyle = "#ffb347";
        ctx.lineWidth = width * 0.55;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(ex, ey); ctx.stroke();
        // 亮芯
        ctx.globalAlpha = 0.95 * alpha;
        ctx.strokeStyle = "#fff4d6";
        ctx.lineWidth = Math.max(1.4, width * 0.16);
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(ex, ey); ctx.stroke();
        drawGlow("#ffb347", p.x, p.y, width * 1.1, 0.5 * alpha);
        // 沿光束流动的光点，强化持续引导感
        const flow = (t * 2.2) % 1;
        ctx.fillStyle = "#ffe2a8";
        for (let k = 0; k < 3; k++) {
          const f = (flow + k / 3) % 1;
          ctx.globalAlpha = (1 - f) * 0.6 * alpha;
          ctx.beginPath();
          ctx.arc(p.x + Math.cos(ang) * spec.len * f, p.y + Math.sin(ang) * spec.len * f,
            Math.max(1, width * 0.2), 0, TAU);
          ctx.fill();
        }
        ctx.restore();
      };
      drawOne(p.beamAng, spec.width, 1);
      if (p.skillAwaken === "awaken_beam") {
        const A = CFG.SKILL.AWAKEN;
        drawOne(p.beamAng + A.BEAM_SIDE_ANG, spec.width * 0.6, 0.55);
        drawOne(p.beamAng - A.BEAM_SIDE_ANG, spec.width * 0.6, 0.55);
      }
    }
  }

  function drawFrostZones(t) {
    for (let i = 0; i < frostZones.length; i++) {
      const z = frostZones[i];
      if (z.x < cull.x0 || z.x > cull.x1 || z.y < cull.y0 || z.y > cull.y1) continue;
      const lifePct = clamp(z.t / (z.maxT || CFG.SKILL.PHASE.ICE_TIME), 0, 1);
      ctx.save();
      ctx.globalAlpha = (z.awaken ? 0.18 : 0.12) + 0.10 * lifePct;
      ctx.fillStyle = z.awaken ? "#c8f4ff" : "#9fe8ff";
      ctx.beginPath();
      ctx.arc(z.x, z.y, z.r, 0, TAU);
      ctx.fill();
      if (z.awaken) {
        ctx.globalAlpha = 0.28 + 0.16 * Math.sin(t * 7 + z.seed);
        ctx.strokeStyle = "#e8fbff";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(z.x, z.y, z.r * (0.55 + 0.12 * Math.sin(t * 4 + z.seed)), 0, TAU);
        ctx.stroke();
      }
      ctx.globalAlpha = 0.35 + 0.15 * Math.sin(t * 5 + z.seed);
      ctx.strokeStyle = "#bff2ff";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([7, 6]);
      ctx.beginPath();
      ctx.arc(z.x, z.y, z.r * 0.92, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
  }

  function drawSkillShadows(t) {
    for (let i = 0; i < skillShadows.length; i++) {
      const s = skillShadows[i];
      if (s.x < cull.x0 || s.x > cull.x1 || s.y < cull.y0 || s.y > cull.y1) continue;
      const a = clamp(s.life / CFG.SKILL.PHASE.SHADOW_LIFE, 0, 1);
      const col = s.mod === "phase_blast" ? "#ffb46a"
        : s.mod === "phase_ice" ? "#bff2ff" : THEME.cyan;
      ctx.save();
      ctx.globalAlpha = a * 0.55;
      drawGlow(col, s.x, s.y, 22, 0.4);
      ctx.translate(s.x, s.y);
      ctx.rotate(s.ang + Math.PI / 2);
      ctx.strokeStyle = col;
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
