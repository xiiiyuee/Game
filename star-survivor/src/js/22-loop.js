  /* =====================================================================
   * 18. 主循环
   * ===================================================================*/
  /* ===== 房主固定步长（P3-03）：30Hz 累加器，渲染与模拟解耦 ===== */
  const COOP_SIM_STEP = 1 / 30;
  let coopSimAcc = 0;

  function coopResetSimClock() {
    coopSimAcc = 0;
  }

  // 只在线房主且游戏进行时使用固定步长；单机保持原来的可变步长
  function coopTickSim(dt) {
    if (!roomCode || !coopNet.host || state !== "playing") return 0;
    coopSimAcc += dt;
    let steps = 0;
    while (coopSimAcc >= COOP_SIM_STEP && steps < 3 && state === "playing") {
      update(COOP_SIM_STEP);
      coopSimAcc -= COOP_SIM_STEP;
      steps++;
    }
    if (coopSimAcc > COOP_SIM_STEP * 3) coopSimAcc = 0;
    return steps;
  }

  function loop(ts) {
    let dt = (ts - lastFrame) / 1000;
    lastFrame = ts;
    if (!isFinite(dt) || dt < 0) dt = 0;
    dt = Math.min(dt, 0.05);

    const t = ts / 1000;
    if (state === "playing") {
      if (roomCode && coopNet.host) coopTickSim(dt);
      else update(dt);

      // 帧率采样（每 2 秒一次），低于目标时下调渲染倍率
      perfAcc += dt;
      perfFrames++;
      if (qualityCd > 0) qualityCd -= dt;
      if (perfAcc >= 2 && qualityCd <= 0) {
        const fps = perfFrames / perfAcc;
        if (fps < 48 && renderScale > 0.6) {
          // 按实际帧率一次性降到接近合适的倍率，避免多轮才追上
          const factor = clamp(fps / 58, 0.62, 0.92);
          renderScale = Math.max(0.6, renderScale * factor);
          qualityCd = 3;
          resize();
          snapCamera();
        } else if (fps > 57 && renderScale < 1) {
          perfGoodTime += perfAcc;
          if (perfGoodTime >= 6) {
            renderScale = Math.min(1, renderScale / 0.9);
            qualityCd = 3;
            perfGoodTime = 0;
            resize();
            snapCamera();
          }
        } else {
          perfGoodTime = 0;
        }
        perfAcc = 0;
        perfFrames = 0;
      }
    }
    updateStars(dt, t);
    if (state === "playing") coopInterpTick();

    // 暂停/升级/结算时画面静止，降低绘制频率，避免选卡界面卡顿
    if (state === "playing" || state === "menu") {
      render(t);
    } else {
      idleRenderAcc += dt;
      if (idleRenderAcc >= 0.1) {
        idleRenderAcc = 0;
        render(t);
      }
    }

    requestAnimationFrame(loop);
  }

