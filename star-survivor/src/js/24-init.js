  /* =====================================================================
   * 19. 初始化
   * ===================================================================*/
  window.addEventListener("resize", resize);

  setupTouch();
  let savedTheme = "neon";
  try { savedTheme = localStorage.getItem("sf_theme") || "neon"; } catch (err) {}
  applyTheme(savedTheme, true);
  buildThemeGrid();
  resize();
  resetGame();
  initCoop();
  // 菜单阶段隐藏游戏 HUD 与强化栏
  document.getElementById("hud").classList.add("hidden");

  requestAnimationFrame(loop);
