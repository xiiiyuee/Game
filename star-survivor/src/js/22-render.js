  /* =====================================================================
   * 17. 渲染
   * ===================================================================*/
  function drawBackground(t) {
    ctx.fillStyle = bgGrad || "#05070f";
    ctx.fillRect(0, 0, view.w, view.h);

    // 霓虹星云（多色叠加，随涂装切换）
    if (nebula) {
      const drift = t * 0.06;
      ctx.globalAlpha = lowFx ? 0.45 : 0.8;
      ctx.drawImage(
        nebula,
        -150 + Math.sin(drift) * 18,
        -150 + Math.cos(drift * 0.8) * 14,
        view.w + 300,
        view.h + 300
      );
      ctx.globalAlpha = 1;
    }

    // 星点（视差：随相机轻微反向移动）
    const ox = (camera.x * 0.12) % view.w;
    const oy = (camera.y * 0.12) % view.h;
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      const tw = 0.55 + 0.45 * Math.sin(t * 0.9 + s.ph);
      let px = s.x - ox;
      let py = s.y - oy;
      if (px < 0) px += view.w;
      if (py < 0) py += view.h;
      ctx.globalAlpha = s.a * tw * 0.5;
      ctx.fillStyle = i % 7 === 0 ? THEME.starA : THEME.starB;
      ctx.fillRect(px, py, s.r, s.r);
    }
    ctx.globalAlpha = 1;

    // 低对比度网格（随相机滚动，体现大世界移动感）
    ctx.strokeStyle = THEME.grid;
    ctx.lineWidth = 1;
    const gap = 90;
    const gx = ((camera.x % gap) + gap) % gap;
    const gy = ((camera.y % gap) + gap) % gap;
    ctx.beginPath();
    for (let x = -gx; x < view.w + gap; x += gap) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, view.h);
    }
    for (let y = -gy; y < view.h + gap; y += gap) {
      ctx.moveTo(0, y);
      ctx.lineTo(view.w, y);
    }
    ctx.stroke();

    // 边缘暗角
    if (vgGrad) {
      ctx.fillStyle = vgGrad;
      ctx.fillRect(0, 0, view.w, view.h);
    }
  }

  // 世界边界：让玩家感知可活动范围
  function drawWorldBounds() {
    ctx.save();
    // 多层描边模拟柔光：避免对大矩形做 shadowBlur 30
    const ring = [
      [14, "rgba(63, 229, 255, 0.05)"],
      [7, "rgba(63, 229, 255, 0.1)"],
      [2.5, "rgba(63, 229, 255, 0.36)"],
    ];
    for (let i = 0; i < ring.length; i++) {
      ctx.lineWidth = ring[i][0];
      ctx.strokeStyle = ring[i][1];
      ctx.strokeRect(1, 1, world.w - 2, world.h - 2);
    }

    const L = 70;
    const corners = [
      [0, 0, 1, 1], [world.w, 0, -1, 1],
      [0, world.h, 1, -1], [world.w, world.h, -1, -1],
    ];
    ctx.strokeStyle = "rgba(63, 229, 255, 0.38)";
    ctx.lineWidth = 3;
    for (let i = 0; i < corners.length; i++) {
      const c = corners[i];
      ctx.beginPath();
      ctx.moveTo(c[0] + c[2] * L, c[1]);
      ctx.lineTo(c[0], c[1]);
      ctx.lineTo(c[0], c[1] + c[3] * L);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawGem(g, withGlow) {
    const a = 0.75 + Math.sin(g.pulse) * 0.25;
    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.rotate(g.pulse * 0.5);
    if (withGlow) drawGlow("#43ffd0", 0, 0, g.r * 3.6, 0.4 * a);
    ctx.globalAlpha = a;
    ctx.fillStyle = "#43ffd0";
    ctx.beginPath();
    ctx.moveTo(0, -g.r);
    ctx.lineTo(g.r, 0);
    ctx.lineTo(0, g.r);
    ctx.lineTo(-g.r, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /* --- 发光贴图缓存：替代逐对象 shadowBlur（后者在高 DPR 下开销极大） --- */
  const glowCache = new Map();
  function rgbaOf(hex, a) {
    if (typeof hex !== "string" || hex[0] !== "#") return `rgba(255,255,255,${a})`;
    let r, g, b;
    if (hex.length === 4) {
      r = parseInt(hex[1] + hex[1], 16);
      g = parseInt(hex[2] + hex[2], 16);
      b = parseInt(hex[3] + hex[3], 16);
    } else {
      r = parseInt(hex.slice(1, 3), 16);
      g = parseInt(hex.slice(3, 5), 16);
      b = parseInt(hex.slice(5, 7), 16);
    }
    return `rgba(${r},${g},${b},${a})`;
  }
  function glowSprite(color) {
    let s = glowCache.get(color);
    if (s) return s;
    s = document.createElement("canvas");
    s.width = s.height = 64;
    const g = s.getContext("2d");
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, rgbaOf(color, 0.9));
    grd.addColorStop(0.45, rgbaOf(color, 0.32));
    grd.addColorStop(1, rgbaOf(color, 0));
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    glowCache.set(color, s);
    return s;
  }
  function drawGlow(color, x, y, radius, alpha) {
    const s = glowSprite(color);
    ctx.globalAlpha = alpha;
    ctx.drawImage(s, x - radius, y - radius, radius * 2, radius * 2);
    ctx.globalAlpha = 1;
  }

  function drawBullets() {
    // 拖尾合并为一条路径，减少 stroke 次数
    ctx.strokeStyle = "rgba(126, 240, 255, 0.4)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < bullets.length; i++) {
      const b = bullets[i];
      if (b.x < cull.x0 || b.x > cull.x1 || b.y < cull.y0 || b.y > cull.y1) continue;
      const tx = b.x - Math.cos(b.ang) * 12;
      const ty = b.y - Math.sin(b.ang) * 12;
      ctx.moveTo(tx, ty);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();

    for (let i = 0; i < bullets.length; i++) {
      const b = bullets[i];
      if (b.x < cull.x0 || b.x > cull.x1 || b.y < cull.y0 || b.y > cull.y1) continue;
      if (!lowFx) drawGlow(b.color || "#3fe5ff", b.x, b.y, b.r * 4.2, 0.5);
      ctx.fillStyle = "#eaffff";
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, TAU);
      ctx.fill();
    }
  }

  function drawEnemyBullets() {
    ctx.globalAlpha = 0.95;
    for (let i = 0; i < ebullets.length; i++) {
      const b = ebullets[i];
      if (b.x < cull.x0 || b.x > cull.x1 || b.y < cull.y0 || b.y > cull.y1) continue;
      if (!lowFx) drawGlow(b.color, b.x, b.y, b.r * 3.6, 0.55);
      if (b.home && (b.vx || b.vy)) {
        // 追猎弹：拖尾 + 内核，和普通敌弹区分开
        const sp = Math.hypot(b.vx, b.vy) || 1;
        ctx.strokeStyle = rgbaOf(b.color, 0.42);
        ctx.lineWidth = b.r * 0.9;
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(b.x - (b.vx / sp) * b.r * 3.2, b.y - (b.vy / sp) * b.r * 3.2);
        ctx.stroke();
      }
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, TAU);
      ctx.fill();
      if (b.home) {
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r * 0.38, 0, TAU);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawShape(x, y, r, sides, rot, fill, stroke, lw) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.beginPath();
    for (let i = 0; i < sides; i++) {
      const a = -Math.PI / 2 + (i / sides) * TAU;
      const px = Math.cos(a) * r;
      const py = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw || 1.6;
    ctx.stroke();
    ctx.restore();
  }

  function drawEnemies(t) {
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (e.x < cull.x0 || e.x > cull.x1 || e.y < cull.y0 || e.y > cull.y1) continue;

      if (e.isBoss) {
        // 冲刺预警：虚线指示突进方向
        if (e.warn > 0) {
          ctx.save();
          ctx.setLineDash([12, 9]);
          ctx.lineWidth = 3;
          ctx.strokeStyle = rgbaOf(THEME.gold, 0.28 + 0.22 * Math.sin(t * 28));
          ctx.beginPath();
          ctx.moveTo(e.x, e.y);
          ctx.lineTo(e.x + Math.cos(e.dashAng) * 620, e.y + Math.sin(e.dashAng) * 620);
          ctx.stroke();
          ctx.restore();
        }

        const bodyFill = ["", rgbaOf(THEME.boss, 0.42), rgbaOf(THEME.magenta, 0.35), rgbaOf(THEME.gold, 0.35)][e.phase];
        const bodyStroke = ["", THEME.boss, THEME.magenta, THEME.gold][e.phase];
        const eyeColor = ["", THEME.cyanSoft, THEME.gold, "#ffffff"][e.phase];
        const pulse = 1 + Math.sin(t * 3) * 0.03;

        ctx.save();
        ctx.translate(e.x, e.y);

        // 柔和外发光改为缓存贴图，避免大半径 shadowBlur
        if (!lowFx) drawGlow(THEME.boss, 0, 0, e.r * 2.1, 0.4);

        // 外环：阶段越高层数越多
        ctx.rotate(e.spin);
        for (let ring = 0; ring < e.phase; ring++) {
          ctx.strokeStyle = rgbaOf(THEME.boss, 0.5 - ring * 0.14);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, 0, e.r * (1.32 + ring * 0.26), 0, TAU);
          ctx.stroke();
        }

        // 六边形本体
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * TAU;
          const px = Math.cos(a) * e.r * pulse;
          const py = Math.sin(a) * e.r * pulse;
          if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fillStyle = bodyFill;
        ctx.fill();
        ctx.strokeStyle = bodyStroke;
        ctx.lineWidth = 3;
        ctx.stroke();

        // 核心之眼
        ctx.rotate(-e.spin * 2);
        ctx.fillStyle = eyeColor;
        ctx.beginPath();
        ctx.arc(0, 0, e.r * 0.3, 0, TAU);
        ctx.fill();

        // 受击闪白
        const bf = e.hitFlash || 0;
        if (bf > 0) {
          ctx.globalAlpha = Math.min(0.85, bf) * 0.8;
          ctx.fillStyle = "#ffffff";
          ctx.beginPath();
          ctx.arc(0, 0, e.r * 0.86, 0, TAU);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        ctx.restore();

        // ===== 机制表现 =====
        // 旋转激光
        if (e.mechanics && e.mechanics.includes("laser") && e.laserTime > 0) {
          ctx.save();
          for (let k = 0; k < 2; k++) {
            const ang = e.laserAng + k * Math.PI;
            const len = 1200;
            const ex = e.x + Math.cos(ang) * len;
            const ey = e.y + Math.sin(ang) * len;
            ctx.lineCap = "round";
            ctx.strokeStyle = rgbaOf(THEME.orange, 0.16 + 0.08 * Math.sin(t * 24));
            ctx.lineWidth = 18;
            ctx.beginPath();
            ctx.moveTo(e.x, e.y);
            ctx.lineTo(ex, ey);
            ctx.stroke();
            ctx.strokeStyle = rgbaOf(THEME.orange, 0.85);
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(e.x, e.y);
            ctx.lineTo(ex, ey);
            ctx.stroke();
            ctx.strokeStyle = "rgba(255,255,255,0.9)";
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.moveTo(e.x, e.y);
            ctx.lineTo(ex, ey);
            ctx.stroke();
          }
          ctx.restore();
        }
        // 分裂护盾
        if (e.mechanics && e.mechanics.includes("shield") && e.shield > 0) {
          ctx.save();
          ctx.strokeStyle = rgbaOf(THEME.cyanSoft, 0.45 + 0.25 * Math.sin(t * 4));
          ctx.lineWidth = 2.4;
          ctx.beginPath();
          ctx.arc(e.x, e.y, e.r * 1.45, 0, TAU);
          ctx.stroke();
          const orbR = e.r * 1.45;
          for (let k = 0; k < 4; k++) {
            const a = t * 1.4 + (k / 4) * TAU;
            const ox = e.x + Math.cos(a) * orbR;
            const oy = e.y + Math.sin(a) * orbR;
            drawGlow(THEME.cyanSoft, ox, oy, 14, 0.5);
            ctx.fillStyle = THEME.cyanSoft;
            ctx.beginPath();
            ctx.arc(ox, oy, 4, 0, TAU);
            ctx.fill();
          }
          ctx.restore();
        }
        // 狂暴光环
        if (e.rage > 0) {
          ctx.save();
          const pr = e.r * (1.5 + Math.sin(t * 9) * 0.08);
          ctx.strokeStyle = rgbaOf(THEME.danger, 0.6);
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(e.x, e.y, pr, 0, TAU);
          ctx.stroke();
          ctx.restore();
        }
        continue;
      }

      ctx.save();
      ctx.translate(e.x, e.y);
      const detail = e.r * view.scale > 7;
      if (!lowFx) drawGlow(e.color, 0, 0, e.r * (e.type === "diamond" ? 3 : 2.4), e.type === "diamond" ? 0.55 : 0.42);

      let sides = 4, rot = e.angle + Math.PI / 4, fillA = 0.24, lw = 2.4;
      if (e.type === "tri") {
        sides = 3; rot = e.angle + Math.PI / 2; fillA = 0.22; lw = 2;
      } else if (e.type === "square") {
        rot = t * 0.9 + e.seed; fillA = 0.2; lw = 2;
      } else if (e.type === "penta") {
        sides = 5; rot = t * 1.4 + e.seed; fillA = 0.2; lw = 2;
      } else if (e.type === "hex") {
        sides = 6; rot = t * 0.5 + e.seed; fillA = 0.18; lw = 2.6;
      } else if (e.type === "dart") {
        sides = 4; rot = e.angle; fillA = 0.28; lw = 2;
      } else if (e.type === "mender") {
        sides = 6; rot = -t * 0.8 + e.seed; fillA = 0.2; lw = 2;
      } else if (e.type === "hunter") {
        sides = 8; rot = e.angle; fillA = 0.3; lw = 3;
      }
      drawShape(0, 0, e.r, sides, rot, rgbaOf(e.color, fillA), e.color, lw);

      // 追猎者：脉动锁环 + 速度刻线
      if (e.type === "hunter") {
        const hp = 0.45 + 0.3 * Math.sin(t * 9 + e.seed);
        ctx.strokeStyle = rgbaOf("#ff2d55", hp);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, e.r + 7 + Math.sin(t * 6) * 2.5, 0, TAU);
        ctx.stroke();
        const spd = Math.min(1.75, 1 + (e.huntT || 0) * 0.012);
        ctx.strokeStyle = rgbaOf("#ff8fa3", 0.35 + (spd - 1) * 0.5);
        ctx.lineWidth = 1.5;
        for (let k = 0; k < 4; k++) {
          const a = -e.angle + Math.PI + (k - 1.5) * 0.34;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * (e.r + 3), Math.sin(a) * (e.r + 3));
          ctx.lineTo(Math.cos(a) * (e.r + 10 + spd * 6), Math.sin(a) * (e.r + 10 + spd * 6));
          ctx.stroke();
        }
      }

      // 突刺者蓄力指示线
      if (e.type === "dart" && e.warn > 0) {
        ctx.strokeStyle = rgbaOf(e.color, 0.45 + 0.35 * Math.sin(t * 22));
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(e.dashAng) * e.r * 3.2, Math.sin(e.dashAng) * e.r * 3.2);
        ctx.stroke();
      }

      // 修补者治疗脉冲：自身扩散环 + 治疗范围提示
      if (e.type === "mender" && e.healPulse > 0) {
        const hk = Math.max(0, Math.min(1, e.healPulse / 0.6));
        ctx.strokeStyle = rgbaOf(THEME.mint, 0.55 * hk);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, e.r + 6 + (1 - hk) * 16, 0, TAU);
        ctx.stroke();
        ctx.strokeStyle = rgbaOf(THEME.mint, 0.22 * hk);
        ctx.setLineDash([5, 7]);
        ctx.beginPath();
        ctx.arc(0, 0, CFG.ENEMY_SUPPORT.MENDER_RADIUS * view.scale, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // 受击闪白：用同样的轮廓整块变白，命中确认更干净
      const fl = e.hitFlash || 0;
      if (fl > 0) {
        ctx.shadowBlur = 0;
        ctx.globalAlpha = Math.min(0.85, fl) * 0.85;
        drawShape(0, 0, e.r, sides, rot, "#ffffff", "#ffffff", 1);
        ctx.globalAlpha = 1;
      }
      ctx.shadowBlur = 0;

      // 觉醒冰区冻结：冰晶轮廓提示
      if (e.freezeT > 0) {
        ctx.globalAlpha = 0.75;
        drawShape(0, 0, e.r + 2.5, 6, t * 0.6, "rgba(200,244,255,0.28)", "#dffaff", 2);
        ctx.globalAlpha = 1;
      }

      // 精英血条
      if (detail && e.type === "diamond") {
        const w = e.r * 2.1;
        const pct = clamp(e.hp / e.maxHp, 0, 1);
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillRect(-w / 2, -e.r - 10, w, 3.5);
        ctx.fillStyle = e.color;
        ctx.fillRect(-w / 2, -e.r - 10, w * pct, 3.5);
      }

      // 词缀标识：护盾环 + 顶部彩色标记点
      if (detail && e.affixes && e.affixes.length) {
        if (!lowFx && e.affixes.includes("shield")) {
          ctx.strokeStyle = rgbaOf(THEME.cyanSoft, 0.7);
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.arc(0, 0, e.r + 6, 0, TAU);
          ctx.stroke();
        }
        const marks = { shield: THEME.cyanSoft, haste: THEME.gold, split: THEME.violet, boom: THEME.orange };
        for (let k = 0; k < e.affixes.length; k++) {
          ctx.fillStyle = marks[e.affixes[k]] || "#fff";
          ctx.beginPath();
          ctx.arc(0, -e.r - 15 - k * 6, 2.2, 0, TAU);
          ctx.fill();
        }
      }
      ctx.restore();
    }
  }

  // 守护无人机
  function drawDrones(t, p) {
    const n = Math.min(CFG.DRONES.MAX, (p && p.stats.drones) || 0);
    if (!n || !p) return;
    const orbit = CFG.DRONES.ORBIT * view.scale;
    ctx.strokeStyle = rgbaOf(THEME.mint, 0.12);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(p.x, p.y, orbit, 0, TAU);
    ctx.stroke();
    for (let i = 0; i < n; i++) {
      const ang = t * 1.15 + (i / n) * TAU;
      const x = p.x + Math.cos(ang) * orbit;
      const y = p.y + Math.sin(ang) * orbit;
      drawGlow(THEME.mint, x, y, 20, 0.55);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang);
      ctx.fillStyle = rgbaOf(THEME.mint, 0.22);
      ctx.strokeStyle = THEME.mint;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * TAU;
        const px = Math.cos(a) * 5;
        const py = Math.sin(a) * 5;
        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawPlayer(t, p) {
    if (!p) return;
    const blink = p.invuln > 0 && Math.floor(t * 18) % 2 === 0;
    const red = p.hitFlash > 0;

    // 擦弹回流力场
    drawGrazeAura(p, t);

    // 护盾环
    if (p.shield > 0.5) {
      ctx.strokeStyle = rgbaOf(THEME.cyan, 0.18 + (p.shield / p.stats.shieldMax) * 0.25);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r + 7, 0, TAU);
      ctx.stroke();
    }

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.facing + Math.PI / 2);

    // 外发光使用缓存贴图（原先每帧一次 shadowBlur 16）
    drawGlow(red ? THEME.danger : THEME.cyan, 0, 0, p.r * 3.2, 0.45);
    ctx.globalAlpha = blink ? 0.45 : (p.down || p.eliminated ? 0.4 : 1);

    // 外层三角
    ctx.strokeStyle = red ? rgbaOf(THEME.danger, 0.9) : THEME.cyanSoft;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -p.r - 4);
    ctx.lineTo(p.r * 0.85, p.r * 0.75);
    ctx.lineTo(-p.r * 0.85, p.r * 0.75);
    ctx.closePath();
    ctx.fillStyle = red ? rgbaOf(THEME.danger, 0.3) : rgbaOf(THEME.cyan, 0.25);
    ctx.fill();
    ctx.stroke();

    // 内核
    ctx.fillStyle = red ? rgbaOf(THEME.danger, 0.35) : THEME.cyanSoft;
    ctx.beginPath();
    ctx.arc(0, 0, p.r * 0.42, 0, TAU);
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawParticles() {
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      if (p.x < cull.x0 || p.x > cull.x1 || p.y < cull.y0 || p.y > cull.y1) continue;
      const a = clamp(p.life / p.max, 0, 1);
      ctx.globalAlpha = a * 0.9;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.5 + a * 0.6), 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawTexts() {
    if (!texts.length) return;
    ctx.textAlign = "center";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(2, 6, 14, 0.75)";
    for (let i = 0; i < texts.length; i++) {
      const t = texts[i];
      if (t.x < cull.x0 || t.x > cull.x1 || t.y < cull.y0 || t.y > cull.y1) continue;
      const a = clamp(t.life / 0.75, 0, 1);
      ctx.globalAlpha = a;
      ctx.font = `600 ${t.size}px system-ui, -apple-system, sans-serif`;
      ctx.fillStyle = t.color;
      // 深色描边替代 shadowBlur，保证可读性且更便宜
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = "left";
  }

  function drawGems() {
    // 宝石过多时关闭逐个发光，明显降低填充开销
    const withGlow = gems.length <= 60;
    for (let i = 0; i < gems.length; i++) {
      const g = gems[i];
      if (g.x < cull.x0 || g.x > cull.x1 || g.y < cull.y0 || g.y > cull.y1) continue;
      drawGem(g, withGlow);
    }
  }

  // 能量核心掉落
  function drawCores(t) {
    for (let i = 0; i < coreDrops.length; i++) {
      const c = coreDrops[i];
      if (c.x < cull.x0 || c.x > cull.x1 || c.y < cull.y0 || c.y > cull.y1) continue;
      const pulse = 1 + 0.16 * Math.sin(t * 5 + c.seed);
      const a = c.life < 3 ? 0.4 + 0.6 * Math.abs(Math.sin(t * 6)) : 1;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(c.x, c.y);
      ctx.rotate(t * 0.8 + c.seed);
      drawGlow("#ffd666", 0, 0, 20, 0.5);
      ctx.fillStyle = "#ffd666";
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const ang = (k / 6) * TAU;
        const px = Math.cos(ang) * 9 * pulse;
        const py = Math.sin(ang) * 9 * pulse;
        k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(255, 248, 214, 0.95)";
      ctx.beginPath();
      ctx.arc(0, 0, 3.2, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  // 防线等级点：Lv2 起显示在血条下方
  function drawDefLevel(d, x, y, color) {
    const lv = defenseLevel(d);
    if (lv <= 1) return;
    ctx.save();
    ctx.fillStyle = color;
    for (let i = 0; i < lv; i++) {
      ctx.beginPath();
      ctx.arc(x + (i - (lv - 1) / 2) * 7, y, 2.2, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  // 缓速场
  function drawFields(t) {
    for (let i = 0; i < fields.length; i++) {
      const f = fields[i];
      if (f.x + f.r < cull.x0 || f.x - f.r > cull.x1 || f.y + f.r < cull.y0 || f.y - f.r > cull.y1) continue;
      const g = ctx.createRadialGradient(f.x, f.y, f.r * 0.1, f.x, f.y, f.r);
      g.addColorStop(0, "rgba(80, 235, 255, 0.03)");
      g.addColorStop(0.75, "rgba(60, 200, 255, 0.07)");
      g.addColorStop(1, "rgba(120, 245, 255, 0.16)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, TAU);
      ctx.fill();

      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(-t * 0.35 + f.seed);
      ctx.setLineDash([10, 14]);
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(130, 250, 255, 0.55)";
      ctx.beginPath();
      ctx.arc(0, 0, f.r * 0.94, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.rotate(t * 0.8);
      ctx.strokeStyle = "rgba(160, 255, 255, 0.4)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(0, 0, f.r * 0.5, 0, TAU);
      ctx.stroke();
      ctx.restore();

      // 中央发生器：可被敌人锁定和摧毁
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(t * 0.6 + f.seed);
      drawGlow("#8ff6ff", 0, 0, 18, 0.3);
      ctx.fillStyle = "rgba(10, 40, 48, 0.9)";
      ctx.strokeStyle = "rgba(140, 250, 255, 0.85)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * TAU;
        const px = Math.cos(a) * 11;
        const py = Math.sin(a) * 11;
        k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      if (f.flash > 0) {
        ctx.globalAlpha = Math.min(0.8, f.flash) * 0.85;
        ctx.fillStyle = "#ffffff";
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.restore();

      const fhp = clamp((f.hp != null ? f.hp : 1) / (f.maxHp || 1), 0, 1);
      if (fhp < 0.999) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
        ctx.fillRect(f.x - 17, f.y + 18, 34, 4);
        ctx.fillStyle = fhp > 0.5 ? "#8bffdc" : fhp > 0.25 ? "#ffd666" : "#ff6b6b";
        ctx.fillRect(f.x - 17, f.y + 18, 34 * fhp, 4);
      }
      drawDefLevel(f, f.x, f.y + (fhp < 0.999 ? 27 : 22), "#8ff6ff");
    }
  }

  // 城墙
  function drawWalls(t) {
    for (let i = 0; i < walls.length; i++) {
      const w = walls[i];
      const reach = Math.max(w.len, w.thick) * 0.6;
      if (w.x + reach < cull.x0 || w.x - reach > cull.x1 ||
          w.y + reach < cull.y0 || w.y - reach > cull.y1) continue;
      const hx = w.len / 2, hy = w.thick / 2;
      const whp = clamp((w.hp != null ? w.hp : 1) / (w.maxHp || 1), 0, 1);
      const cracked = whp < 0.66;
      const critical = whp < 0.33;
      const flick = critical ? 0.55 + 0.45 * Math.sin(t * 9 + w.seed) : 1;
      ctx.save();
      ctx.translate(w.x, w.y);
      ctx.rotate(w.ang);
      // 阴影
      ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
      ctx.fillRect(-hx + 3, -hy + 4, w.len, w.thick);
      // 主体
      ctx.fillStyle = w.flash > 0 ? "rgba(255, 255, 255, 0.92)" : "rgba(54, 68, 94, 0.97)";
      ctx.strokeStyle = w.flash > 0 ? "#ffffff" : critical ? "rgba(255, 128, 128, 0.9)" : "rgba(150, 195, 245, 0.85)";
      ctx.lineWidth = 2;
      ctx.fillRect(-hx, -hy, w.len, w.thick);
      ctx.strokeRect(-hx, -hy, w.len, w.thick);
      // 装甲接缝
      ctx.strokeStyle = "rgba(120, 165, 220, 0.35)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let px = -hx + 20; px < hx - 2; px += 20) {
        ctx.moveTo(px, -hy + 2);
        ctx.lineTo(px, hy - 2);
      }
      ctx.stroke();
      // 破损裂纹
      if (cracked) {
        ctx.strokeStyle = "rgba(8, 12, 20, 0.85)";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(-hx + 30, -hy);
        ctx.lineTo(-hx + 24, 0);
        ctx.lineTo(-hx + 34, hy);
        ctx.moveTo(hx - 34, -hy);
        ctx.lineTo(hx - 40, 0);
        ctx.lineTo(hx - 30, hy);
        if (critical) {
          ctx.moveTo(-6, -hy);
          ctx.lineTo(2, -1);
          ctx.lineTo(-4, hy);
        }
        ctx.stroke();
      }
      // 中央能量带：残血时变红并闪烁
      ctx.fillStyle = w.flash > 0 ? "#ffffff"
        : critical ? `rgba(255, 90, 90, ${0.85 * flick})`
        : "rgba(120, 220, 255, 0.55)";
      ctx.fillRect(-hx + 6, -1.5, w.len - 12, 3);
      ctx.restore();

      // 耐久条
      if (whp < 0.999) {
        const bw = Math.min(w.len, 54);
        ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
        ctx.fillRect(w.x - bw / 2, w.y - hy - 14, bw, 4);
        ctx.fillStyle = whp > 0.5 ? "#8bffdc" : whp > 0.25 ? "#ffd666" : "#ff6b6b";
        ctx.fillRect(w.x - bw / 2, w.y - hy - 14, bw * whp, 4);
      }
      // 擦弹充能：城墙顶部显示青色充能格
      const charge = w.charge || 0;
      if (charge > 0) {
        const n = CFG.RUN.WALL_CHARGE_MAX;
        const cw = 5, gap = 2;
        const total = n * cw + (n - 1) * gap;
        for (let k = 0; k < n; k++) {
          ctx.fillStyle = k < charge ? "#8ff6ff" : "rgba(120, 200, 255, 0.18)";
          ctx.fillRect(w.x - total / 2 + k * (cw + gap), w.y - hy - 8, cw, 3);
        }
      }
      drawDefLevel(w, w.x, w.y + hy + 12, "#bcd8ff");
    }
  }

  // 联机建造预测残影
  function drawBuildGhosts(t) {
    for (let i = 0; i < buildGhosts.length; i++) {
      const g = buildGhosts[i];
      ctx.save();
      ctx.globalAlpha = 0.32 + 0.16 * Math.sin(t * 8 + i);
      if (g.type === "wall") {
        ctx.translate(g.x, g.y);
        ctx.rotate(g.ang);
        const hx = CFG.RUN.WALL_LEN * view.scale / 2;
        const hy = CFG.RUN.WALL_THICK * view.scale / 2;
        ctx.fillStyle = "#9fd8ff";
        ctx.fillRect(-hx, -hy, hx * 2, hy * 2);
        ctx.strokeStyle = "#e6f6ff";
        ctx.lineWidth = 2;
        ctx.strokeRect(-hx, -hy, hx * 2, hy * 2);
      } else if (g.type === "field") {
        ctx.strokeStyle = "#8ff6ff";
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.arc(g.x, g.y, CFG.RUN.FIELD_RADIUS * view.scale, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        ctx.strokeStyle = "#ffd666";
        ctx.fillStyle = "rgba(255, 214, 102, 0.35)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(g.x, g.y, 18, 0, TAU);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(g.x, g.y);
        ctx.lineTo(g.x, g.y - 22);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // 自动炮塔
  function drawTurrets(t) {
    for (let i = 0; i < turrets.length; i++) {
      const tu = turrets[i];
      if (tu.x < cull.x0 || tu.x > cull.x1 || tu.y < cull.y0 || tu.y > cull.y1) continue;
      ctx.save();
      ctx.translate(tu.x, tu.y);
      drawGlow("#ffd666", 0, 0, 26, 0.42);

      // 底座
      ctx.fillStyle = "rgba(40, 32, 10, 0.95)";
      ctx.strokeStyle = "rgba(255, 210, 110, 0.85)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const ang = (k / 6) * TAU + tu.seed;
        const px = Math.cos(ang) * 13;
        const py = Math.sin(ang) * 13;
        k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // 炮管
      ctx.rotate(tu.ang);
      ctx.fillStyle = "#ffd666";
      ctx.fillRect(4, -3, 17, 6);
      ctx.fillStyle = "rgba(255, 248, 214, 0.9)";
      ctx.beginPath();
      ctx.arc(0, 0, 4.4, 0, TAU);
      ctx.fill();
      ctx.restore();

      // 受击闪白 + 耐久条
      if (tu.flash > 0) {
        ctx.globalAlpha = Math.min(0.8, tu.flash) * 0.8;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(tu.x, tu.y, 15, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      const thp = clamp((tu.hp != null ? tu.hp : 1) / (tu.maxHp || 1), 0, 1);
      if (thp < 0.999) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
        ctx.fillRect(tu.x - 17, tu.y + 20, 34, 4);
        ctx.fillStyle = thp > 0.5 ? "#8bffdc" : thp > 0.25 ? "#ffd666" : "#ff6b6b";
        ctx.fillRect(tu.x - 17, tu.y + 20, 34 * thp, 4);
      }
      drawDefLevel(tu, tu.x, tu.y + (thp < 0.999 ? 29 : 24), "#ffd666");

      // 待机指示
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = "#ffd666";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(tu.x, tu.y, 19 + Math.sin(t * 3 + tu.seed) * 1.5, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;

      // 防线联动：玩家在光环内时显示增益范围，并显示过载层数
      const lp = getLocalPlayer() || player;
      if (state === "playing" && lp && !lp.down &&
        dist2(lp.x, lp.y, tu.x, tu.y) <= (CFG.RUN.TURRET_AURA * view.scale) ** 2) {
        ctx.globalAlpha = 0.28 + 0.1 * Math.sin(t * 5 + tu.seed);
        ctx.strokeStyle = "#ffe6a0";
        ctx.lineWidth = 1.4;
        ctx.setLineDash([5, 6]);
        ctx.beginPath();
        ctx.arc(tu.x, tu.y, CFG.RUN.TURRET_AURA * view.scale, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }
      if (tu.oc > 0) {
        for (let k = 0; k < CFG.RUN.TURRET_OC_MAX; k++) {
          ctx.fillStyle = k < tu.oc ? "#ffd666" : "rgba(255, 214, 102, 0.18)";
          ctx.fillRect(tu.x - 8 + k * 6, tu.y - 30, 4, 4);
        }
      }
    }
  }

  // 靠近防线时的操作提示
  function drawDefensePrompt(me) {
    if (!me || state !== "playing") return;
    const nd = nearestAnyDefense(me.x, me.y, 92 * view.scale);
    if (!nd) return;
    const d = nd.d;
    const lv = defenseLevel(d);
    const damaged = d.hp < d.maxHp - 0.5;
    if (!damaged && lv >= CFG.RUN.DEF_MAX_LEVEL) return;
    const cost = damaged ? CFG.RUN.DEF_REPAIR_COST : defenseUpgradeCost(d);
    const text = damaged ? `F 修复 · ${cost} 核心` : `F 升级 Lv${lv + 1} · ${cost} 核心`;
    const can = cores >= cost;
    const y = d.kind === "wall" ? d.y - Math.max(18, d.thick * 0.5 + 14) : d.y - 38;
    ctx.save();
    ctx.font = "600 13px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const w = ctx.measureText(text).width + 20;
    ctx.fillStyle = "rgba(4, 12, 20, 0.82)";
    ctx.fillRect(d.x - w / 2, y - 12, w, 24);
    ctx.strokeStyle = can ? "rgba(255, 214, 102, 0.6)" : "rgba(255, 120, 120, 0.55)";
    ctx.lineWidth = 1;
    ctx.strokeRect(d.x - w / 2, y - 12, w, 24);
    ctx.fillStyle = can ? "#ffe6a0" : "#ff9f9f";
    ctx.fillText(text, d.x, y + 1);
    ctx.restore();
  }

  // 风险星域：红色虚线警示圈
  function drawZones(t) {
    for (let i = 0; i < zones.length; i++) {
      const z = zones[i];
      const a = clamp(Math.min(z.life / 1.5, (z.maxLife - z.life) / 1.2), 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(z.x, z.y);

      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, z.r);
      g.addColorStop(0, "rgba(255, 40, 80, 0.02)");
      g.addColorStop(0.72, "rgba(255, 40, 80, 0.05)");
      g.addColorStop(1, "rgba(255, 70, 100, 0.14)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, z.r, 0, TAU);
      ctx.fill();

      ctx.rotate(t * 0.18 + z.seed);
      ctx.setLineDash([16, 12]);
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(255, 70, 100, 0.7)";
      ctx.beginPath();
      ctx.arc(0, 0, z.r, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "rgba(255, 140, 160, 0.3)";
      ctx.beginPath();
      ctx.arc(0, 0, z.r * 0.62, 0, TAU);
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = "#ff9db0";
      ctx.font = "600 13px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("风险星域 · 经验 ×2", z.x, z.y - z.r - 12);
      ctx.restore();
    }
  }

  // 场地灾害：陨石落点预警 / 扫射激光
  function drawHazards(t) {
    const W = CFG.EVENTS.HAZARD;
    for (let i = 0; i < hazards.length; i++) {
      const h = hazards[i];
      if (h.type === "meteor") {
        for (let k = 0; k < h.list.length; k++) {
          const m = h.list[k];
          ctx.save();
          ctx.translate(m.x, m.y);
          if (h.warn > 0) {
            const prog = 1 - h.warn / h.maxWarn;
            const pulse = 0.5 + 0.5 * Math.sin(t * 14);
            ctx.fillStyle = `rgba(255, 90, 60, ${0.06 + 0.1 * prog})`;
            ctx.beginPath();
            ctx.arc(0, 0, m.r, 0, TAU);
            ctx.fill();
            ctx.strokeStyle = `rgba(255, 120, 80, ${0.4 + 0.35 * pulse})`;
            ctx.lineWidth = 2.5;
            ctx.setLineDash([9, 8]);
            ctx.beginPath();
            ctx.arc(0, 0, m.r, 0, TAU);
            ctx.stroke();
            ctx.setLineDash([]);
            // 内圈随预警收缩，提示落地时机
            ctx.strokeStyle = `rgba(255, 200, 120, ${0.5 + 0.3 * pulse})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, m.r * (1 - prog * 0.72), 0, TAU);
            ctx.stroke();
          } else {
            const f = Math.max(0, h.life / 0.5);
            ctx.fillStyle = `rgba(255, 150, 60, ${0.42 * f})`;
            ctx.beginPath();
            ctx.arc(0, 0, m.r * (1.15 - f * 0.15), 0, TAU);
            ctx.fill();
            ctx.strokeStyle = `rgba(255, 220, 160, ${0.8 * f})`;
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(0, 0, m.r * (1.05 + (1 - f) * 0.5), 0, TAU);
            ctx.stroke();
          }
          ctx.restore();
        }
      } else if (h.type === "beam") {
        const half = W.BEAM_WIDTH / 2;
        const x = h.axis === "h" ? camera.x : h.pos;
        const y = h.axis === "h" ? h.pos : camera.y;
        const w = h.axis === "h" ? view.w : half * 2;
        const hh = h.axis === "h" ? half * 2 : view.h;
        ctx.save();
        if (h.warn > 0) {
          const pulse = 0.5 + 0.5 * Math.sin(t * 16);
          ctx.fillStyle = `rgba(255, 60, 90, ${0.05 + 0.06 * pulse})`;
          ctx.fillRect(x, y, w, hh);
          ctx.strokeStyle = `rgba(255, 110, 130, ${0.45 + 0.35 * pulse})`;
          ctx.lineWidth = 2;
          ctx.setLineDash([12, 10]);
          ctx.beginPath();
          if (h.axis === "h") {
            ctx.moveTo(x, h.pos); ctx.lineTo(x + w, h.pos);
          } else {
            ctx.moveTo(h.pos, y); ctx.lineTo(h.pos, y + hh);
          }
          ctx.stroke();
          ctx.setLineDash([]);
        } else {
          const f = Math.max(0, h.life / Math.max(0.01, h.active));
          ctx.fillStyle = `rgba(255, 70, 100, ${0.3 * f})`;
          ctx.fillRect(x, y, w, hh);
          ctx.fillStyle = `rgba(255, 240, 240, ${0.75 * f})`;
          if (h.axis === "h") ctx.fillRect(x, h.pos - 3, w, 6);
          else ctx.fillRect(h.pos - 3, y, 6, hh);
        }
        ctx.restore();
      }
    }
  }

  // 能量水晶 / 补给舱
  function drawProps(t) {
    for (let i = 0; i < crystals.length; i++) {
      const c = crystals[i];
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(t * 0.5 + c.seed);
      ctx.shadowColor = "#6fe9ff";
      ctx.shadowBlur = 16;
      ctx.beginPath();
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * TAU - Math.PI / 2;
        const px = Math.cos(a) * c.r;
        const py = Math.sin(a) * c.r * 1.25;
        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = c.flash > 0 ? "rgba(255,255,255,0.85)" : "rgba(63, 229, 255, 0.2)";
      ctx.fill();
      ctx.strokeStyle = c.flash > 0 ? "#ffffff" : "#7ef0ff";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(190, 255, 255, 0.8)";
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, TAU);
      ctx.fill();
      ctx.restore();

      if (c.hp < c.maxHp) {
        const w = c.r * 2;
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillRect(c.x - w / 2, c.y - c.r - 12, w, 3.5);
        ctx.fillStyle = "#7ef0ff";
        ctx.fillRect(c.x - w / 2, c.y - c.r - 12, w * clamp(c.hp / c.maxHp, 0, 1), 3.5);
      }
    }

    for (let i = 0; i < pods.length; i++) {
      const p = pods[i];
      const pulse = 1 + Math.sin(p.seed * 3) * 0.08;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(t * 0.8);
      ctx.shadowColor = "#8bffdc";
      ctx.shadowBlur = 18;
      ctx.strokeStyle = "#8bffdc";
      ctx.lineWidth = 2;
      ctx.strokeRect(-p.r * pulse, -p.r * pulse, p.r * 2 * pulse, p.r * 2 * pulse);
      ctx.shadowBlur = 0;
      ctx.rotate(-t * 0.8);
      ctx.fillStyle = "#8bffdc";
      ctx.fillRect(-p.r * 0.5, -2, p.r, 4);
      ctx.fillRect(-2, -p.r * 0.5, 4, p.r);
      ctx.restore();
    }
  }

  // 超载冲击波
  function drawPulses() {
    for (let i = 0; i < pulses.length; i++) {
      const p = pulses[i];
      const k = 1 - p.life / p.maxLife;
      ctx.save();
      ctx.globalAlpha = clamp(1 - k, 0, 1);
      ctx.strokeStyle = "#8ff6ff";
      ctx.lineWidth = 5 * (1 - k * 0.7);
      ctx.shadowColor = "#3fe5ff";
      ctx.shadowBlur = 22;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
  }

  // 联机倒地提示（P4-06）：倒计时环 + 救援进度
  function drawDownState(p) {
    if (!p.down || p.eliminated) return;
    const revT = CFG.PLAYER.REVIVE_TIME;
    const prog = clamp((p.reviveProgress || 0) / revT, 0, 1);
    const left = clamp((p.downTimer || 0) / CFG.PLAYER.DOWN_TIMEOUT, 0, 1);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.fillStyle = "rgba(255,77,109,0.16)";
    ctx.beginPath();
    ctx.arc(0, 0, p.r + 17, 0, TAU);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(255,77,109,0.75)";
    ctx.beginPath();
    ctx.arc(0, 0, p.r + 17, -Math.PI / 2, -Math.PI / 2 + TAU * left);
    ctx.stroke();
    if (prog > 0) {
      ctx.strokeStyle = "#8bffdc";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, p.r + 24, -Math.PI / 2, -Math.PI / 2 + TAU * prog);
      ctx.stroke();
    }
    ctx.restore();
    ctx.save();
    ctx.textAlign = "center";
    ctx.font = "600 12px system-ui, -apple-system, sans-serif";
    ctx.fillStyle = prog > 0 ? "#8bffdc" : "#ffd0d8";
    ctx.fillText(
      prog > 0 ? `救援 ${Math.min(99, Math.round(prog * 100))}%` : `倒地 ${Math.ceil(p.downTimer || 0)}s`,
      p.x, p.y - p.r - 26);
    ctx.restore();
  }

  // 队友屏幕外指示箭头（P4-05）
  function drawTeamArrows() {
    const me = getLocalPlayer();
    if (!me || state !== "playing" || players.length <= 1) return;
    const m = 46;
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      if (p === me || p.eliminated) continue;
      const sx = p.x - camera.x;
      const sy = p.y - camera.y;
      if (sx >= m && sx <= view.w - m && sy >= m && sy <= view.h - m) continue;
      const ang = Math.atan2(sy - view.h / 2, sx - view.w / 2);
      const ex = clamp(sx, m, view.w - m);
      const ey = clamp(sy, m, view.h - m);
      ctx.save();
      ctx.translate(ex, ey);
      ctx.rotate(ang);
      ctx.fillStyle = p.color || "#3fe5ff";
      ctx.globalAlpha = p.down ? 0.55 : 0.9;
      ctx.beginPath();
      ctx.moveTo(10, 0);
      ctx.lineTo(-6, -7);
      ctx.lineTo(-6, 7);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.textAlign = "center";
      ctx.font = "600 10px system-ui, -apple-system, sans-serif";
      ctx.fillStyle = p.color || "#3fe5ff";
      ctx.globalAlpha = p.down ? 0.6 : 0.92;
      const dist = Math.round(Math.hypot(p.x - me.x, p.y - me.y) / 10);
      ctx.fillText(`${p.down ? "倒地 " : ""}${dist}m`, ex, ey + 18);
      ctx.restore();
    }
  }

  function render(t) {
    const me = getLocalPlayer();
    cull.x0 = camera.x - 120;
    cull.y0 = camera.y - 120;
    cull.x1 = camera.x + view.w + 120;
    cull.y1 = camera.y + view.h + 120;
    ctx.save();
    if (state === "playing" && shake > 0) {
      const s = shake * (lowFx ? 0.35 : 1);
      // 重击带方向偏移，普通抖动仍保持随机
      ctx.translate(rand(-s, s) + shakeDirX * s * 0.55, rand(-s, s) + shakeDirY * s * 0.55);
    }

    drawBackground(t);

    if (me && state !== "menu") {
      ctx.save();
      ctx.translate(-camera.x, -camera.y);
      drawWorldBounds();
      drawFields(t);
      drawWalls(t);
      drawBuildGhosts(t);
      drawZones(t);
      drawHazards(t);
      drawAsteroids(t);
      drawProps(t);
      drawGems();
      drawChipDrops(t);
      drawCores(t);
      drawTrader(t);
      drawFrostZones(t);
      drawGravityWells(t);
      drawBullets();
      drawEnemies(t);
      drawSkillShadows(t);
      // 其他玩家先画，本地玩家最后画在最上层
      for (let i = 0; i < players.length; i++) {
        if (players[i] !== me) drawPlayer(t, players[i]);
      }
      drawPlayer(t, me);
      for (let i = 0; i < players.length; i++) {
        if (players[i] !== me) drawDrones(t, players[i]);
      }
      drawDrones(t, me);
      for (let i = 0; i < players.length; i++) {
        if (players[i] !== me) drawDownState(players[i]);
      }
      drawTurrets(t);
      drawDefensePrompt(me);
      drawPulses();
      drawEnemyBullets();
      drawParticles();
      drawTexts();
      ctx.restore();
      drawTeamArrows();
    }

    // 超载减速期间的青蓝滤镜
    if (state === "playing" && ultTimer > 0) {
      const a = 0.05 + 0.025 * Math.sin(t * 8);
      ctx.fillStyle = `rgba(80, 220, 255, ${a})`;
      ctx.fillRect(0, 0, view.w, view.h);
    }

    // 受伤红色闪屏
    if (hurtFlash > 0.01) {
      const a = clamp(hurtFlash, 0, 1) * 0.2 * CFG.FX.FLASH;
      ctx.fillStyle = `rgba(255, 40, 70, ${a})`;
      ctx.fillRect(-40, -40, view.w + 80, view.h + 80);
    }

    // Boss 击杀白闪
    if (victoryFlash > 0.01) {
      ctx.fillStyle = `rgba(255, 255, 255, ${0.45 * victoryFlash})`;
      ctx.fillRect(0, 0, view.w, view.h);
    }

    ctx.restore();
  }

