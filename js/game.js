window.AetherBastion = window.AetherBastion || {};

function createSeededRng(seedStr) {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function() {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

class AetherBastionGame {
  constructor() {
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.audio = new window.AetherBastion.AetherAudioEngine();
    this.saveManager = new window.AetherBastion.AetherSaveManager();
    this.ui = new window.AetherBastion.AetherUIController(this);
    this.renderer = new window.AetherBastion.AetherRenderer(this);

    this.reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const prog = this.saveManager.loadProgression();
    this.bestScore = prog.globalBestScore;

    this.tabPauseNotice = false;
    this.showSelectedRange = true;
    this.lastActiveGameSpeed = 1;
    this.overlayResumeSpeed = 0;
    this.inspectorMinimized = false;
    this.waveIntelExpanded = false;

    this.currentStageId = 'STAGE_1';
    this.gameMode = 'CAMPAIGN';
    this.seedText = 'AETHER-2026';
    this.rng = Math.random;

    this.dpr = window.devicePixelRatio || 1;
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;

    this.paths = {};
    this.openedBreachRoutes = new Set();
    this.destroyedPadIds = new Set();
    this.blastCraters = [];
    this.shellCasings = [];

    this.resetState('STAGE_1');
    this._bindUI();
    this.ui.bindNavigation();
    this._handleResize();

    this.ui.openMainMenu();

    window.addEventListener('resize', () => this._handleResize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.started && !this.gameOver && !this.victory && this.gameSpeed > 0) {
        this.tabPauseNotice = true;
        this._setGameSpeed(0);
      }
    });

    this.lastTime = performance.now();
    requestAnimationFrame((now) => this._loop(now));
  }

  getCurrentStage() {
    const { STAGES } = window.AetherBastion;
    return STAGES[this.currentStageId] || STAGES.STAGE_1;
  }

  _initStageMap(stageId) {
    const { STAGES } = window.AetherBastion;
    this.currentStageId = STAGES[stageId] ? stageId : 'STAGE_1';
    const stage = this.getCurrentStage();

    this.paths = {};
    for (const [rKey, pts] of Object.entries(stage.routes)) {
      this.paths[rKey] = pts.map(p => ({ x: p.x, y: p.y }));
    }
    this._handleResize();
  }

  resetState(stageId = null) {
    const targetStageId = stageId || this.currentStageId || 'STAGE_1';
    this._initStageMap(targetStageId);
    const stage = this.getCurrentStage();

    this.openedBreachRoutes = new Set();
    this.destroyedPadIds = new Set();
    this.blastCraters = [];
    if (this.renderer) this.renderer.invalidateBackdrop();

    this.rng = createSeededRng(`${this.currentStageId}:${this.gameMode}:${this.seedText}`);

    this.started = false;
    this.gameOver = false;
    this.victory = false;
    this.gameSpeed = 1;
    this.lastActiveGameSpeed = 1;
    this.tabPauseNotice = false;
    this.showSelectedRange = true;
    this.autoWave = false;

    this.aether = stage.startAether;
    this.totalAetherEarned = stage.startAether;
    this.totalAetherSpent = 0;
    this.coreHp = stage.startCoreHp;
    this.maxCoreHp = stage.startCoreHp;
    this.score = 0;
    this.kills = 0;
    this.reactionsTriggered = 0;
    this.reactionBreakdown = { SUPERCONDUCT: 0, SHATTER: 0, OVERLOAD: 0 };
    this.reactionDamageTotals = { SUPERCONDUCT: 0, SHATTER: 0, OVERLOAD: 0 };
    this.routeMetrics = {
      MAIN: { spawned: 0, coreLost: 0 },
      BYPASS: { spawned: 0, coreLost: 0 },
      SUB_PORTAL: { spawned: 0, coreLost: 0 },
      EAST_BREACH: { spawned: 0, coreLost: 0 },
      CORE_TUNNEL: { spawned: 0, coreLost: 0 }
    };
    this.skillsUsedCount = 0;
    this.towersBuilt = 0;
    this.overloadAetherThisWave = 0;

    this.coreRepairPurchases = 0;
    this.tacticalResetPurchases = 0;
    this.overdriveUses = 0;

    this.comboCount = 0;
    this.comboTimer = 0;
    this.comboMaxDuration = 4.0;

    this.lastReactionCalloutTime = { SUPERCONDUCT: -99, SHATTER: -99, OVERLOAD: -99 };

    this.wave = 1;
    this.waveActive = false;
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.autoWaveDelay = 0;

    this.pathRevealAnims = [];
    this.breachAlertTimer = 0;

    this.waveLogs = [];
    this.currentWaveStartHp = stage.startCoreHp;
    this.currentWaveAetherEarned = 0;
    this.towerRosterHistory = [];
    this.bossTelemetry = [];

    this.mods = {
      fireRateMult: 1.0,
      rangeMult: 1.0,
      rewardMult: 1.0,
      costMult: 1.0,
      superconductMult: 1.0,
      shatterMult: 1.0,
      bonusChains: 0,
      pulseCritChance: 0.0,
      mortarSplashMult: 1.0,
      mortarDamageMult: 1.0,
      skillCooldownMult: 1.0,
      interestRate: 0.0,
      cryoDurationBonus: 0.0,
      cryoSlowBonus: 0.0,
      frostbiteDps: 0,
      reactionCooldownRefund: 0.0
    };
    this.activeAugments = [];
    this.augmentStacks = {};
    this.currentDraftCards = [];
    this.canRerollDraft = true;

    this.targetingSkill = null;
    this.orbitalCd = 0;
    this.orbitalMaxCd = 30;
    this.chronoCd = 0;
    this.chronoMaxCd = 36;
    this.chronoTimer = 0;
    this.overdriveCd = 0;
    this.overdriveMaxCd = 22;
    this.overdriveTimer = 0;

    this.selectedBlueprint = 'PULSE';
    this.selectedTower = null;
    this.hoverPad = null;
    this.hoverPos = null;

    this.towers = [];
    this.enemies = [];
    this.projectiles = [];
    this.shellCasings = [];
    this.lightningArcs = [];
    this.orbitalBeams = [];
    this.shockwaves = [];
    this.particles = [];
    this.floatingTexts = [];

    this.time = 0;
    this.shakeTime = 0;
    this.shakeMagnitude = 0;
    this.corePulse = 0;

    this._selectBlueprint('PULSE');
    this._closeInspector();
    this._renderActiveAugmentDrawer();
    this._refreshDockCosts();
    this._updateHUD();
    this._updateWavePreview();
    this._syncSpeedControls();
    this._syncAutoWaveControl();
  }

  startNewSession(stageId) {
    this.resetState(stageId);
    this.started = true;
    this.ui.updateTutorialGuide();
    this._updateHUD();
    this._updateWavePreview();
  }

  loadFromSnapshot(snap) {
    const { AUGMENT_POOL } = window.AetherBastion;
    this.gameMode = snap.gameMode || 'CAMPAIGN';
    this.seedText = snap.seedText || 'AETHER-2026';
    this.resetState(snap.stageId || 'STAGE_1');

    const stage = this.getCurrentStage();
    this.wave = Math.max(1, Number(snap.wave) || 1);
    this.aether = Number(snap.aether) || stage.startAether;
    this.totalAetherEarned = Number(snap.totalAetherEarned) || this.aether;
    this.totalAetherSpent = Number(snap.totalAetherSpent) || 0;
    this.coreHp = Math.max(1, Number(snap.coreHp) || stage.startCoreHp);
    this.maxCoreHp = Math.max(this.coreHp, Number(snap.maxCoreHp) || stage.startCoreHp);
    this.score = Number(snap.score) || 0;
    this.kills = Number(snap.kills) || 0;
    this.reactionsTriggered = Number(snap.reactionsTriggered) || 0;
    this.reactionBreakdown = Object.assign({ SUPERCONDUCT: 0, SHATTER: 0, OVERLOAD: 0 }, snap.reactionBreakdown || {});
    this.reactionDamageTotals = Object.assign({ SUPERCONDUCT: 0, SHATTER: 0, OVERLOAD: 0 }, snap.reactionDamageTotals || {});
    if (snap.routeMetrics) {
      this.routeMetrics = JSON.parse(JSON.stringify(snap.routeMetrics));
    }

    this.openedBreachRoutes = new Set(snap.openedBreachRoutes || []);
    this.destroyedPadIds = new Set(snap.destroyedPadIds || []);
    this.blastCraters = Array.isArray(snap.blastCraters) ? snap.blastCraters.map(c => ({ x: c.x, y: c.y })) : [];

    if (snap.mods) {
      Object.assign(this.mods, snap.mods);
    }
    this.augmentStacks = Object.assign({}, snap.augmentStacks || {});
    this.activeAugments = [];
    for (const augId of (snap.activeAugmentIds || [])) {
      const found = AUGMENT_POOL.find(a => a.id === augId);
      if (found) this.activeAugments.push(found);
    }

    this.coreRepairPurchases = Number(snap.coreRepairPurchases) || 0;
    this.tacticalResetPurchases = Number(snap.tacticalResetPurchases) || 0;
    this.overdriveUses = Number(snap.overdriveUses) || 0;
    this.waveLogs = Array.isArray(snap.waveLogs) ? [...snap.waveLogs] : [];
    this.bossTelemetry = Array.isArray(snap.bossTelemetry) ? [...snap.bossTelemetry] : [];

    this.towers = [];
    this.towerRosterHistory = [];
    let maxTowerId = 0;
    for (const td of (snap.towers || [])) {
      if (this.destroyedPadIds.has(td.padId)) continue;
      const pad = (stage.buildPads || []).find(p => p.id === td.padId) || { id: td.padId, x: td.x, y: td.y };
      if (!pad || pad.x === undefined) continue;
      maxTowerId = Math.max(maxTowerId, td.id || 0);
      const tower = {
        id: td.id || (this.towers.length + 1),
        padId: pad.id,
        type: td.type,
        x: pad.x,
        y: pad.y,
        level: td.level || 1,
        spec: td.spec || null,
        sold: false,
        demolishedByOrbital: false,
        targetMode: td.targetMode || 'FIRST',
        totalInvested: td.totalInvested || 60,
        damageDealt: td.damageDealt || 0,
        synergyDamageDealt: td.synergyDamageDealt || 0,
        kills: td.kills || 0,
        spinUp: 0,
        angle: -Math.PI * 0.5,
        cooldown: 0,
        recoil: 0,
        upgradeFlash: 0,
        pulsePhase: Math.random() * Math.PI * 2
      };
      this.towers.push(tower);
      this.towerRosterHistory.push(tower);
    }
    this.towersBuilt = maxTowerId;

    if (this.renderer) this.renderer.invalidateBackdrop();

    document.getElementById('mainMenuOverlay').classList.add('hidden');
    document.getElementById('stageSelectOverlay').classList.add('hidden');
    document.getElementById('gameOverModal').classList.add('hidden');
    document.getElementById('augmentModal').classList.add('hidden');

    this.started = true;
    this.waveActive = false;
    this.gameSpeed = 1;
    this._syncSpeedControls();
    this._renderActiveAugmentDrawer();
    this._refreshDockCosts();
    this.ui.updateTutorialGuide();
    this._updateHUD();
    this._updateWavePreview();

    this._spawnFloatingText(stage.mapWidth * 0.5, 160, `💾 전술 데이터 복원 완료! (WAVE ${this.wave} 정비 대기)`, '#34d399', true);
  }

  getComboDamageBonus() {
    if (this.comboCount <= 0) return 0;
    return Math.min(0.45, Math.log2(this.comboCount + 1) * 0.11);
  }

  getWaveEconomyMultiplier() {
    if (this.wave <= 4) return 1.0;
    return Math.max(0.45, 1.0 - (this.wave - 4) * 0.04);
  }

  getCoreRepairCost() {
    return 120 + this.coreRepairPurchases * 45;
  }

  getTacticalResetCost() {
    return 150 + this.tacticalResetPurchases * 60;
  }

  getOverdriveCost() {
    return 140 + this.overdriveUses * 40;
  }

  getTowerBuildCost(type) {
    const def = window.AetherBastion.TOWER_DEFS[type];
    return Math.round(def.cost * this.mods.costMult);
  }

  getTowerUpgradeCost(tower) {
    const def = window.AetherBastion.TOWER_DEFS[tower.type];
    if (tower.level === 3) {
      return Math.round(def.overclockCost * this.mods.costMult);
    }
    const base = def.upgradeCost[tower.level - 1];
    return Math.round(base * this.mods.costMult);
  }

  getTowerStats(tower) {
    const def = window.AetherBastion.TOWER_DEFS[tower.type];
    const chronoBoost = this.chronoTimer > 0 ? 0.35 : 0;
    const overdriveBoost = this.overdriveTimer > 0 ? 0.55 : 0;
    const vulcanBoost = (tower.type === 'PULSE' && tower.spec === 'A') ? Math.min(0.32, (tower.spinUp || 0) * 0.064) : 0;
    const overclockDmgMult = tower.level >= 4 ? 1.28 : 1.0;
    const overclockRateMult = tower.level >= 4 ? 1.15 : 1.0;

    if (tower.level >= 3 && tower.spec) {
      const sp = def.specs[tower.spec];
      let dmg = Math.round(sp.damage * overclockDmgMult);
      if (tower.type === 'MORTAR') dmg = Math.round(dmg * this.mods.mortarDamageMult);

      const rng = Math.round(sp.range * this.mods.rangeMult);
      const rate = sp.fireRate * overclockRateMult * (this.mods.fireRateMult + chronoBoost + overdriveBoost + vulcanBoost);
      const splash = sp.splashRadius ? Math.round(sp.splashRadius * this.mods.mortarSplashMult) : 0;
      const chains = sp.chainCount ? sp.chainCount + this.mods.bonusChains : 0;
      const chainDecay = sp.chainDecay || def.chainDecay || 0.82;
      const slow = sp.slowFactor ? Math.min(0.76, sp.slowFactor + this.mods.cryoSlowBonus) : 0;

      return {
        name: tower.level >= 4 ? `${sp.name} [Lv.4 초월]` : `${sp.name} [Lv.3]`,
        baseTypeName: def.name,
        color: sp.color,
        damage: dmg,
        range: rng,
        fireRate: rate,
        splashRadius: splash,
        chainCount: chains,
        chainDecay,
        slowFactor: slow,
        specialDesc: sp.shortDesc
      };
    }

    const idx = tower.level - 1;
    let dmg = def.damage[idx];
    if (tower.type === 'MORTAR') dmg = Math.round(dmg * this.mods.mortarDamageMult);

    const rng = Math.round(def.range[idx] * this.mods.rangeMult);
    const rate = def.fireRate[idx] * (this.mods.fireRateMult + chronoBoost + overdriveBoost);
    const splash = def.splashRadius ? Math.round(def.splashRadius[idx] * this.mods.mortarSplashMult) : 0;
    const chains = def.chainCount ? def.chainCount[idx] + this.mods.bonusChains : 0;
    const chainDecay = def.chainDecay || 0.82;
    const slow = def.slowFactor ? Math.min(0.74, def.slowFactor[idx] + this.mods.cryoSlowBonus) : 0;

    return {
      name: `${def.name} [Lv.${tower.level}]`,
      baseTypeName: def.name,
      color: def.color,
      damage: dmg,
      range: rng,
      fireRate: rate,
      splashRadius: splash,
      chainCount: chains,
      chainDecay,
      slowFactor: slow,
      specialDesc: def.special
    };
  }

  _handleResize() {
    const stage = this.getCurrentStage();
    const mapW = stage.mapWidth || 1600;
    const mapH = stage.mapHeight || 900;

    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(1, Math.floor(rect.width * this.dpr));
    this.canvas.height = Math.max(1, Math.floor(rect.height * this.dpr));

    const scaleX = rect.width / mapW;
    const scaleY = rect.height / mapH;
    this.scale = Math.min(scaleX, scaleY);
    this.offsetX = (rect.width - mapW * this.scale) * 0.5;
    this.offsetY = (rect.height - mapH * this.scale) * 0.5;
  }

  _screenToVirtual(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left - this.offsetX) / this.scale,
      y: (clientY - rect.top - this.offsetY) / this.scale
    };
  }

  _findBuildPadAt(x, y) {
    const { PAD_RADIUS } = window.AetherBastion.CONFIG;
    const stage = this.getCurrentStage();
    for (const pad of (stage.buildPads || [])) {
      if (Math.hypot(x - pad.x, y - pad.y) <= PAD_RADIUS + 8) {
        return pad;
      }
    }
    return null;
  }

  _distToSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const l2 = dx * dx + dy * dy;
    if (l2 === 0) return Math.hypot(px - x1, py - y1);
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / l2));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }

  _minDistToRoute(px, py, pts) {
    let best = 99999;
    for (let i = 0; i < pts.length - 1; i++) {
      const d = this._distToSegment(px, py, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
      if (d < best) best = d;
    }
    return best;
  }

  _addScore(pts) {
    this.score += pts;
    if (this.score > this.bestScore) {
      this.bestScore = this.score;
      this.saveManager.updateGlobalBestScore(this.bestScore);
    }
  }

  _gainAether(amount, trackWave = true) {
    this.aether += amount;
    this.totalAetherEarned += amount;
    if (trackWave) this.currentWaveAetherEarned += amount;
  }

  _spendAether(amount) {
    this.aether -= amount;
    this.totalAetherSpent += amount;
  }

  _syncSpeedControls() {
    document.querySelectorAll('.speed-btn').forEach((btn) => {
      const speed = Number(btn.dataset.speed);
      const active = speed === this.gameSpeed;
      btn.className = speed === 0
        ? `speed-btn px-2 py-1 rounded-lg text-xs font-bold cursor-pointer ${active ? 'bg-amber-500/25 text-amber-300 border border-amber-400/50' : 'text-slate-400 hover-text-amber-300'}`
        : `speed-btn px-2 py-1 rounded-lg text-xs font-orbitron font-bold cursor-pointer ${active ? 'bg-cyan-500/25 text-cyan-300 border border-cyan-400/40' : 'text-slate-400 hover-text-white'}`;
      btn.setAttribute('aria-pressed', String(active));
      if (speed === 0) {
        btn.textContent = this.gameSpeed === 0 ? '▶' : '❚❚';
      }
    });
  }

  _setGameSpeed(speed) {
    const next = [0, 1, 2].includes(Number(speed)) ? Number(speed) : 1;
    this.gameSpeed = next;
    if (next > 0) {
      this.lastActiveGameSpeed = next;
      this.tabPauseNotice = false;
    }
    this._syncSpeedControls();
    this._updateHUD();
  }

  _syncAutoWaveControl() {
    const button = document.getElementById('btnAutoWave');
    const label = document.getElementById('autoWaveState');
    if (!button || !label) return;
    label.textContent = this.autoWave ? 'ON' : 'OFF';
    label.className = this.autoWave ? 'text-emerald-400' : 'text-slate-400';
    button.setAttribute('aria-pressed', String(this.autoWave));
  }

  _setAutoWave(enabled) {
    this.autoWave = !!enabled;
    this._syncAutoWaveControl();
    if (this.autoWave && this.started && !this.waveActive && !this.gameOver && !this.victory && this.gameSpeed > 0) {
      this._startWave();
    }
  }

  _pauseForOverlay() {
    if (this.gameSpeed > 0) {
      this.overlayResumeSpeed = this.gameSpeed;
      this._setGameSpeed(0);
    }
  }

  _resumeFromOverlay() {
    const anyOpen =
      !document.getElementById('helpModal').classList.contains('hidden') ||
      !document.getElementById('augmentDrawer').classList.contains('hidden') ||
      !document.getElementById('reportModal').classList.contains('hidden') ||
      !document.getElementById('saveLoadModal').classList.contains('hidden');
    if (!anyOpen && this.overlayResumeSpeed > 0 && !this.gameOver && !this.victory) {
      const spd = this.overlayResumeSpeed;
      this.overlayResumeSpeed = 0;
      this._setGameSpeed(spd);
    }
  }

  _closeHelp() {
    document.getElementById('helpModal').classList.add('hidden');
    this._resumeFromOverlay();
  }

  _bindUI() {
    document.getElementById('btnRestartGame').addEventListener('click', () => {
      this.audio.unlock();
      this.audio.playPlace();
      document.getElementById('gameOverModal').classList.add('hidden');
      this.startNewSession(this.currentStageId);
    });

    document.getElementById('btnReturnTitle').addEventListener('click', () => {
      this.audio.unlock();
      this.audio.playUiClick();
      document.getElementById('gameOverModal').classList.add('hidden');
      this.resetState(this.currentStageId);
      this.ui.openMainMenu();
    });

    document.getElementById('btnNextWave').addEventListener('click', () => {
      this.audio.unlock();
      if (!this.started || this.gameOver || this.victory || this.waveActive) return;
      if (this.wave > 1) {
        const bonus = 18;
        this._gainAether(bonus, true);
        this._addScore(bonus * 2);
        this._spawnFloatingText(this.paths.MAIN[0].x + 35, this.paths.MAIN[0].y - 24, `+${bonus} 조기호출`, '#fbbf24');
      }
      this._startWave();
    });

    document.getElementById('btnAutoWave').addEventListener('click', () => {
      this.audio.unlock();
      this._setAutoWave(!this.autoWave);
    });

    document.getElementById('btnBuyCoreRepair').addEventListener('click', () => {
      this.audio.unlock();
      if (!this.started || this.gameOver || this.victory) return;
      const cost = this.getCoreRepairCost();
      if (this.aether < cost) {
        this._triggerInsufficientAether();
        return;
      }
      this._spendAether(cost);
      this.coreRepairPurchases += 1;
      if (this.coreHp + 3 > this.maxCoreHp) {
        this.maxCoreHp += 1;
      }
      this.coreHp = Math.min(this.maxCoreHp, this.coreHp + 3);
      this.audio.playUpgrade(false);
      const corePos = this.paths.MAIN[this.paths.MAIN.length - 1];
      this._spawnShockwave(corePos.x, corePos.y, 75, '#34d399');
      this._spawnFloatingText(corePos.x - 20, corePos.y - 30, '코어 보강 +3 ♥', '#34d399', true);
      this._updateHUD();
    });

    document.getElementById('btnBuyCooldownReset').addEventListener('click', () => {
      this.audio.unlock();
      if (!this.started || this.gameOver || this.victory) return;
      if (this.orbitalCd <= 0 && this.chronoCd <= 0 && this.overdriveCd <= 0) {
        this.audio.playError();
        const stage = this.getCurrentStage();
        this._spawnFloatingText(stage.mapWidth * 0.5, stage.mapHeight - 130, '스킬이 이미 준비 완료 상태입니다', '#94a3b8');
        return;
      }
      const cost = this.getTacticalResetCost();
      if (this.aether < cost) {
        this._triggerInsufficientAether();
        return;
      }
      this._spendAether(cost);
      this.tacticalResetPurchases += 1;
      this.orbitalCd = 0;
      this.chronoCd = 0;
      this.overdriveCd = 0;
      this.audio.playUpgrade(true);
      const stage = this.getCurrentStage();
      this._spawnFloatingText(stage.mapWidth * 0.5, stage.mapHeight - 150, '전술 위성 쿨타임 즉시 초기화!', '#38bdf8', true);
      this._updateHUD();
    });

    document.getElementById('waveBanner').addEventListener('click', () => {
      this.waveIntelExpanded = !this.waveIntelExpanded;
      document.getElementById('waveIntelDrawer').classList.toggle('hidden', !this.waveIntelExpanded);
      document.getElementById('waveIntelChevron').textContent = this.waveIntelExpanded ? '▲' : '▼';
    });

    document.getElementById('btnViewAugments').addEventListener('click', () => {
      const drawer = document.getElementById('augmentDrawer');
      const willOpen = drawer.classList.contains('hidden');
      drawer.classList.toggle('hidden');
      if (willOpen) this._pauseForOverlay();
      else this._resumeFromOverlay();
    });
    document.getElementById('btnCloseAugmentDrawer').addEventListener('click', () => {
      document.getElementById('augmentDrawer').classList.add('hidden');
      this._resumeFromOverlay();
    });

    document.getElementById('btnOpenReport').addEventListener('click', () => {
      this._pauseForOverlay();
      this.ui.renderBattleReport('reportBody');
      document.getElementById('reportModal').classList.remove('hidden');
    });
    document.getElementById('btnCloseReport').addEventListener('click', () => {
      document.getElementById('reportModal').classList.add('hidden');
      this._resumeFromOverlay();
    });

    document.querySelectorAll('.speed-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.audio.unlock();
        this._setGameSpeed(Number(btn.dataset.speed));
      });
    });

    document.getElementById('btnMute').addEventListener('click', () => {
      this.audio.unlock();
      const nextMute = !this.audio.muted;
      this.audio.setMuted(nextMute);
      document.getElementById('iconSoundOn').classList.toggle('hidden', nextMute);
      document.getElementById('iconSoundOff').classList.toggle('hidden', !nextMute);
    });

    document.getElementById('volumeSlider').addEventListener('input', (e) => {
      this.audio.unlock();
      const val = Number(e.target.value) / 100;
      this.audio.setVolume(val);
      if (val > 0 && this.audio.muted) {
        this.audio.setMuted(false);
        document.getElementById('iconSoundOn').classList.remove('hidden');
        document.getElementById('iconSoundOff').classList.add('hidden');
      }
    });

    document.querySelectorAll('.tower-card').forEach(card => {
      card.addEventListener('click', () => {
        this.audio.unlock();
        this._cancelSkillTargeting();
        this._selectBlueprint(card.dataset.tower);
        this._closeInspector();
      });
    });

    document.getElementById('btnSkillOrbital').addEventListener('click', () => {
      this.audio.unlock();
      if (!this.started || this.gameOver || this.victory) return;
      if (this.orbitalCd > 0) {
        this.audio.playError();
        return;
      }
      if (this.targetingSkill === 'ORBITAL') {
        this._cancelSkillTargeting();
      } else {
        this._closeInspector();
        this.targetingSkill = 'ORBITAL';
        document.getElementById('btnSkillOrbital').classList.add('skill-targeting-active');
        this.canvas.style.cursor = 'crosshair';
      }
    });

    document.getElementById('btnSkillChrono').addEventListener('click', () => {
      this.audio.unlock();
      if (!this.started || this.gameOver || this.victory) return;
      if (this.chronoCd > 0) {
        this.audio.playError();
        return;
      }
      this._activateChronoStasis();
    });

    document.getElementById('btnSkillOverdrive').addEventListener('click', () => {
      this.audio.unlock();
      if (!this.started || this.gameOver || this.victory) return;
      if (this.overdriveCd > 0) {
        this.audio.playError();
        return;
      }
      const cost = this.getOverdriveCost();
      if (this.aether < cost) {
        this._triggerInsufficientAether();
        return;
      }
      this._spendAether(cost);
      this.overdriveUses += 1;
      this.skillsUsedCount += 1;
      this.overdriveCd = this.overdriveMaxCd * this.mods.skillCooldownMult;
      this.overdriveTimer = 6.0;
      this.audio.playOverdrive();
      this._triggerScreenShake(6, 0.22);
      for (const t of this.towers) {
        this._spawnShockwave(t.x, t.y, 48, '#e879f9');
      }
      const stage = this.getCurrentStage();
      this._spawnFloatingText(stage.mapWidth * 0.5, 195, `🔥 전술 과부하 발동! (-${cost}⚡ · 6초간 공속 +55% / 치명타 +25%)`, '#f0abfc', true);
      this._updateHUD();
    });

    document.getElementById('btnCloseInspector').addEventListener('click', () => this._closeInspector());
    document.getElementById('btnMinimizeInspector').addEventListener('click', () => {
      this.inspectorMinimized = !this.inspectorMinimized;
      document.getElementById('inspectorBody').classList.toggle('hidden', this.inspectorMinimized);
      document.getElementById('btnMinimizeInspector').textContent = this.inspectorMinimized ? '▢' : '—';
    });

    document.getElementById('btnToggleRange').addEventListener('click', (e) => {
      this.showSelectedRange = !this.showSelectedRange;
      e.currentTarget.setAttribute('aria-pressed', String(this.showSelectedRange));
      e.currentTarget.textContent = this.showSelectedRange ? '사거리 표시 중' : '사거리 표시';
    });

    document.querySelectorAll('.target-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!this.selectedTower) return;
        this.selectedTower.targetMode = btn.dataset.target;
        this._openInspector(this.selectedTower);
      });
    });

    document.getElementById('btnUpgradeTower').addEventListener('click', () => {
      this.audio.unlock();
      if (!this.selectedTower) return;
      const t = this.selectedTower;
      if (t.level !== 1 && t.level !== 3) return;

      const cost = this.getTowerUpgradeCost(t);
      if (this.aether < cost) {
        this._triggerInsufficientAether();
        return;
      }
      this._spendAether(cost);
      t.totalInvested += cost;
      t.level += 1;
      t.upgradeFlash = 1.0;
      this.audio.playUpgrade(t.level === 4);

      const def = window.AetherBastion.TOWER_DEFS[t.type];
      this._spawnShockwave(t.x, t.y, t.level === 4 ? 95 : 65, t.level === 4 ? '#fbbf24' : def.color);
      this._spawnFloatingText(
        t.x, t.y - 28,
        t.level === 4 ? '👑 Lv.4 초월 오버클럭!' : '★ Lv.2 강화 완료!',
        t.level === 4 ? '#fbbf24' : '#34d399',
        true
      );
      this.ui.updateTutorialGuide();
      this._updateHUD();
      this._openInspector(t);
    });

    document.getElementById('btnSpecA').addEventListener('click', () => this._applySpecialization('A'));
    document.getElementById('btnSpecB').addEventListener('click', () => this._applySpecialization('B'));

    document.getElementById('btnSellTower').addEventListener('click', () => {
      this.audio.unlock();
      if (!this.selectedTower) return;
      const t = this.selectedTower;
      const refund = Math.floor(t.totalInvested * 0.75);
      this._gainAether(refund, false);
      t.sold = true;
      this.towers = this.towers.filter(item => item !== t);
      this.audio.playSell();

      this._spawnBurst(t.x, t.y, '#fbbf24', 14);
      this._spawnFloatingText(t.x, t.y - 20, `+${refund} ⚡`, '#fbbf24');
      this._closeInspector();
      this._updateHUD();
    });

    document.getElementById('btnRerollAugments').addEventListener('click', () => {
      if (!this.canRerollDraft) return;
      this.canRerollDraft = false;
      this.audio.playPlace();
      this._rollAugmentDraft();
    });

    document.getElementById('btnSkipAugment').addEventListener('click', () => {
      this._gainAether(45, false);
      this._addScore(60);
      this.audio.playSell();
      this._closeAugmentDraft();
    });

    document.getElementById('btnHelp').addEventListener('click', () => {
      this._pauseForOverlay();
      document.getElementById('helpModal').classList.remove('hidden');
    });
    document.getElementById('btnCloseHelp').addEventListener('click', () => this._closeHelp());
    document.getElementById('btnCloseHelpPrimary').addEventListener('click', () => this._closeHelp());

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this._cancelSkillTargeting();
        if (!document.getElementById('helpModal').classList.contains('hidden')) this._closeHelp();
        if (!document.getElementById('saveLoadModal').classList.contains('hidden')) this.ui.closeSaveLoadModal();
        if (!document.getElementById('reportModal').classList.contains('hidden')) {
          document.getElementById('reportModal').classList.add('hidden');
          this._resumeFromOverlay();
        }
        if (!document.getElementById('augmentDrawer').classList.contains('hidden')) {
          document.getElementById('augmentDrawer').classList.add('hidden');
          this._resumeFromOverlay();
        }
        this._closeInspector();
        return;
      }
      if (!this.started || this.gameOver || this.victory) return;
      if (!document.getElementById('augmentModal').classList.contains('hidden')) return;
      if (e.target.closest('button, input, textarea, select')) return;

      const key = e.key.toLowerCase();
      if (key === '1') { this._cancelSkillTargeting(); this._selectBlueprint('PULSE'); this._closeInspector(); }
      else if (key === '2') { this._cancelSkillTargeting(); this._selectBlueprint('CRYO'); this._closeInspector(); }
      else if (key === '3') { this._cancelSkillTargeting(); this._selectBlueprint('TESLA'); this._closeInspector(); }
      else if (key === '4') { this._cancelSkillTargeting(); this._selectBlueprint('MORTAR'); this._closeInspector(); }
      else if (key === 'q') { document.getElementById('btnSkillOrbital').click(); }
      else if (key === 'w') { document.getElementById('btnSkillChrono').click(); }
      else if (key === 'e') { document.getElementById('btnSkillOverdrive').click(); }
      else if (e.code === 'Space') {
        e.preventDefault();
        if (this.gameSpeed === 0) this._setGameSpeed(this.lastActiveGameSpeed || 1);
        else if (this.waveActive) this._setGameSpeed(0);
        else document.getElementById('btnNextWave').click();
      }
    });

    this.canvas.addEventListener('pointermove', (e) => {
      const pt = this._screenToVirtual(e.clientX, e.clientY);
      this.hoverPos = pt;
      this.hoverPad = this._findBuildPadAt(pt.x, pt.y);
      if (this.targetingSkill) {
        this.canvas.style.cursor = 'crosshair';
      } else if (this.hoverPad) {
        this.canvas.style.cursor = this.destroyedPadIds.has(this.hoverPad.id) ? 'not-allowed' : 'pointer';
      } else {
        this.canvas.style.cursor = 'default';
      }
    });

    this.canvas.addEventListener('pointerleave', () => {
      this.hoverPad = null;
      this.hoverPos = null;
    });

    this.canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      this.audio.unlock();
      if (!this.started || this.gameOver || this.victory) return;

      const pt = this._screenToVirtual(e.clientX, e.clientY);

      if (this.targetingSkill === 'ORBITAL') {
        this._fireOrbitalStrike(pt.x, pt.y);
        return;
      }

      const pad = this._findBuildPadAt(pt.x, pt.y);
      if (pad) {
        if (this.destroyedPadIds.has(pad.id)) {
          this._closeInspector();
          this.audio.playError();
          this._spawnFloatingText(pad.x, pad.y - 24, '폭격으로 파괴된 거점 (건설 불가)', '#fb7185');
          return;
        }
        const existingTower = this.towers.find(t => t.padId === pad.id);
        if (existingTower) {
          this._openInspector(existingTower);
        } else {
          this._closeInspector();
          this._tryBuildTowerOnPad(pad);
        }
      } else {
        this._closeInspector();
      }
    });
  }

  _cancelSkillTargeting() {
    this.targetingSkill = null;
    const btn = document.getElementById('btnSkillOrbital');
    if (btn) btn.classList.remove('skill-targeting-active');
  }

  _fireOrbitalStrike(x, y) {
    this._cancelSkillTargeting();
    this.skillsUsedCount += 1;
    this.orbitalCd = this.orbitalMaxCd * this.mods.skillCooldownMult;
    this.audio.playOrbitalStrike();
    this._triggerScreenShake(9, 0.30);

    const radius = 140;
    const dmg = 450 + this.wave * 52;

    this.orbitalBeams.push({ x, y, radius, life: 0.55, maxLife: 0.55, isHostile: false });
    this._spawnShockwave(x, y, radius, '#fbbf24');
    this._spawnShockwave(x, y, radius * 0.65, '#38bdf8');
    this._spawnBurst(x, y, '#fbbf24', 28);

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (Math.hypot(e.x - x, e.y - y) <= radius + e.radius) {
        e.shockTimer = Math.max(e.shockTimer, 4.0);
        this._damageEnemy(e, dmg, '#fde047', null, true);
      }
    }
    this._updateHUD();
  }

  _activateChronoStasis() {
    this.skillsUsedCount += 1;
    this.chronoCd = this.chronoMaxCd * this.mods.skillCooldownMult;
    this.chronoTimer = 4.5;
    this.audio.playChronoStasis();
    const stage = this.getCurrentStage();
    this._spawnFloatingText(stage.mapWidth * 0.5, 195, '⏳ 크로노 스테이시스 발동! (4.5초)', '#a5b4fc', true);

    for (const e of this.enemies) {
      this._spawnBurst(e.x, e.y, '#818cf8', 5);
    }
    this._updateHUD();
  }

  _applySpecialization(branch) {
    this.audio.unlock();
    const t = this.selectedTower;
    if (!t || t.level !== 2) return;
    const cost = this.getTowerUpgradeCost(t);
    if (this.aether < cost) {
      this._triggerInsufficientAether();
      return;
    }

    this._spendAether(cost);
    t.totalInvested += cost;
    t.level = 3;
    t.spec = branch;
    t.upgradeFlash = 1.0;
    this.audio.playUpgrade(true);

    const stats = this.getTowerStats(t);
    this._spawnShockwave(t.x, t.y, 85, stats.color);
    this._spawnBurst(t.x, t.y, stats.color, 20);
    this._spawnFloatingText(t.x, t.y - 28, `★ Lv.3 ${stats.name.replace(/\s*\[Lv\.3\]/, '')} 진화!`, '#e879f9', true);

    this.ui.updateTutorialGuide();
    this._updateHUD();
    this._openInspector(t);
  }

  _selectBlueprint(type) {
    this.selectedBlueprint = type;
    document.querySelectorAll('.tower-card').forEach(card => {
      const selected = card.dataset.tower === type;
      card.classList.toggle('glass-card-active', selected);
      card.setAttribute('aria-pressed', String(selected));
    });
  }

  _refreshDockCosts() {
    ['PULSE', 'CRYO', 'TESLA', 'MORTAR'].forEach(id => {
      const el = document.getElementById(`costLabel${id}`);
      if (el) el.textContent = `${this.getTowerBuildCost(id)} ⚡`;
    });
  }

  _tryBuildTowerOnPad(pad) {
    if (this.destroyedPadIds.has(pad.id)) {
      this.audio.playError();
      this._spawnFloatingText(pad.x, pad.y - 24, '폭격으로 파괴된 거점 (건설 불가)', '#fb7185');
      return;
    }

    const def = window.AetherBastion.TOWER_DEFS[this.selectedBlueprint];
    if (!def) return;
    const cost = this.getTowerBuildCost(def.id);
    if (this.aether < cost) {
      this._triggerInsufficientAether(pad.x, pad.y);
      return;
    }

    this._spendAether(cost);
    this.towersBuilt += 1;

    const tower = {
      id: this.towersBuilt,
      padId: pad.id,
      type: def.id,
      x: pad.x,
      y: pad.y,
      level: 1,
      spec: null,
      sold: false,
      demolishedByOrbital: false,
      targetMode: 'FIRST',
      totalInvested: cost,
      damageDealt: 0,
      synergyDamageDealt: 0,
      kills: 0,
      spinUp: 0,
      angle: -Math.PI * 0.5,
      cooldown: 0,
      recoil: 0,
      upgradeFlash: 0,
      pulsePhase: Math.random() * Math.PI * 2
    };

    this.towers.push(tower);
    this.towerRosterHistory.push(tower);
    this.audio.playPlace();
    this._spawnShockwave(tower.x, tower.y, 56, def.color);
    this._spawnBurst(tower.x, tower.y, def.color, 14);
    this._spawnFloatingText(tower.x, tower.y - 26, `-${cost} ⚡`, '#38bdf8');
    this.ui.updateTutorialGuide();
    this._updateHUD();
  }

  _triggerInsufficientAether(px = null, py = null) {
    const stage = this.getCurrentStage();
    this.audio.playError();
    const badge = document.getElementById('aetherBadge');
    badge.classList.remove('hud-shake');
    void badge.offsetWidth;
    badge.classList.add('hud-shake');
    const tx = px !== null ? px : (this.hoverPad ? this.hoverPad.x : stage.mapWidth * 0.5);
    const ty = py !== null ? py : (this.hoverPad ? this.hoverPad.y : stage.mapHeight * 0.5);
    this._spawnFloatingText(tx, ty - 24, '에테르 부족!', '#fb7185');
  }

  _openInspector(tower) {
    this.selectedTower = tower;
    this.inspectorMinimized = false;
    document.getElementById('inspectorBody').classList.remove('hidden');
    document.getElementById('btnMinimizeInspector').textContent = '—';

    const { TOWER_DEFS, TARGET_LABELS } = window.AetherBastion;
    const def = TOWER_DEFS[tower.type];
    const stats = this.getTowerStats(tower);

    document.getElementById('inspName').textContent = stats.name;
    document.getElementById('inspLevel').textContent = tower.level >= 4 ? `Lv.4 👑` : (tower.spec ? `Lv.3 ★` : `Lv.${tower.level}`);
    document.getElementById('inspRole').textContent = def.role;
    document.getElementById('inspSpecial').textContent = stats.specialDesc;

    document.getElementById('inspTargetLabel').textContent = TARGET_LABELS[tower.targetMode] || '선두 우선';
    document.querySelectorAll('.target-btn').forEach(btn => {
      const active = btn.dataset.target === tower.targetMode;
      btn.className = active
        ? 'target-btn py-1 rounded-lg text-11 font-bold bg-cyan-500/25 text-cyan-200 border border-cyan-400/50 cursor-pointer'
        : 'target-btn py-1 rounded-lg text-11 font-bold text-slate-400 hover-text-white cursor-pointer';
    });

    document.getElementById('inspDamage').textContent = stats.damage;
    document.getElementById('inspRange').textContent = stats.range;
    document.getElementById('inspRate').textContent = `${stats.fireRate.toFixed(2)}/s`;
    this._refreshTowerTelemetry(tower);

    const stdBox = document.getElementById('standardUpgradeBox');
    const specBox = document.getElementById('specBranchBox');
    const btnUp = document.getElementById('btnUpgradeTower');
    const costEl = document.getElementById('inspUpgradeCost');

    if (tower.level === 1) {
      stdBox.classList.remove('hidden');
      btnUp.classList.remove('hidden');
      specBox.classList.add('hidden');
      document.getElementById('inspDamageNext').textContent = `+${def.damage[1] - def.damage[0]}`;
      document.getElementById('inspRangeNext').textContent = `+${def.range[1] - def.range[0]}`;
      document.getElementById('inspRateNext').textContent = `+${(def.fireRate[1] - def.fireRate[0]).toFixed(2)}`;

      const upCost = this.getTowerUpgradeCost(tower);
      btnUp.disabled = this.aether < upCost;
      document.getElementById('inspUpgradeLabel').textContent = '★ Lv.2 강화';
      costEl.textContent = `${upCost} ⚡`;
    } else if (tower.level === 2) {
      stdBox.classList.remove('hidden');
      btnUp.classList.add('hidden');
      specBox.classList.remove('hidden');

      document.getElementById('inspDamageNext').textContent = '진화 분기';
      document.getElementById('inspRangeNext').textContent = '진화 분기';
      document.getElementById('inspRateNext').textContent = '진화 분기';

      const upCost = this.getTowerUpgradeCost(tower);
      document.getElementById('specAName').textContent = `3A. ${def.specs.A.name}`;
      document.getElementById('specADesc').textContent = def.specs.A.shortDesc;
      document.getElementById('specACost').textContent = `${upCost} ⚡`;
      document.getElementById('btnSpecA').disabled = this.aether < upCost;

      document.getElementById('specBName').textContent = `3B. ${def.specs.B.name}`;
      document.getElementById('specBDesc').textContent = def.specs.B.shortDesc;
      document.getElementById('specBCost').textContent = `${upCost} ⚡`;
      document.getElementById('btnSpecB').disabled = this.aether < upCost;
    } else if (tower.level === 3) {
      stdBox.classList.remove('hidden');
      btnUp.classList.remove('hidden');
      specBox.classList.add('hidden');
      document.getElementById('inspDamageNext').textContent = '+28%';
      document.getElementById('inspRangeNext').textContent = '유지';
      document.getElementById('inspRateNext').textContent = '+15%';

      const ocCost = this.getTowerUpgradeCost(tower);
      btnUp.disabled = this.aether < ocCost;
      document.getElementById('inspUpgradeLabel').textContent = '👑 Lv.4 초월 오버클럭';
      costEl.textContent = `${ocCost} ⚡`;
    } else {
      stdBox.classList.remove('hidden');
      btnUp.classList.remove('hidden');
      specBox.classList.add('hidden');
      document.getElementById('inspDamageNext').textContent = 'MAX';
      document.getElementById('inspRangeNext').textContent = 'MAX';
      document.getElementById('inspRateNext').textContent = 'MAX';
      btnUp.disabled = true;
      document.getElementById('inspUpgradeLabel').textContent = '초월 오버클럭 완료';
      costEl.textContent = 'MAX';
    }

    const refund = Math.floor(tower.totalInvested * 0.75);
    document.getElementById('inspSellRefund').textContent = `+${refund} ⚡`;
    document.getElementById('towerInspector').classList.remove('hidden');
  }

  _refreshTowerTelemetry(tower) {
    if (!tower || this.selectedTower !== tower) return;
    document.getElementById('inspTowerDamage').textContent = Math.round(tower.damageDealt || 0).toLocaleString();
    const syn = Math.round(tower.synergyDamageDealt || 0);
    document.getElementById('inspTowerKills').textContent = `${syn.toLocaleString()} / ${tower.kills || 0}`;
  }

  _closeInspector() {
    this.selectedTower = null;
    document.getElementById('towerInspector').classList.add('hidden');
  }

  _openAugmentDraft() {
    this.canRerollDraft = true;
    document.getElementById('augmentModal').classList.remove('hidden');
    this._rollAugmentDraft();
  }

  _rollAugmentDraft() {
    const available = window.AetherBastion.AUGMENT_POOL.filter(card => {
      const cur = this.augmentStacks[card.id] || 0;
      return cur < card.maxStacks;
    });

    const weighted = available.map(card => {
      const weight = card.rarity === 'COMMON' ? 1.0 : card.rarity === 'RARE' ? 0.65 : 0.35;
      return { card, sortKey: this.rng() / weight };
    }).sort((a, b) => a.sortKey - b.sortKey);

    this.currentDraftCards = weighted.slice(0, 3).map(w => w.card);
    this.ui.renderAnimatedAugmentCards(this.currentDraftCards, this.augmentStacks, (card) => this._selectAugment(card));

    const rerollBtn = document.getElementById('btnRerollAugments');
    rerollBtn.disabled = !this.canRerollDraft;
    rerollBtn.textContent = this.canRerollDraft ? '🎲 전술 재탐색 (1회 무료)' : '🎲 재탐색 완료';
  }

  _selectAugment(card) {
    this.audio.playAugmentPick();
    if (card.apply) card.apply(this.mods);
    if (card.instant) card.instant(this);

    this.augmentStacks[card.id] = (this.augmentStacks[card.id] || 0) + 1;
    this.activeAugments.push(card);
    this._renderActiveAugmentDrawer();
    this._refreshDockCosts();
    this._closeAugmentDraft();
  }

  _closeAugmentDraft() {
    document.getElementById('augmentModal').classList.add('hidden');
    this.ui.updateTutorialGuide();
    this._updateHUD();
    this._updateWavePreview();
    if (this.autoWave) {
      this.autoWaveDelay = 1.6;
    }
  }

  _renderActiveAugmentDrawer() {
    const listEl = document.getElementById('activeAugmentList');
    document.getElementById('hudAugmentCount').textContent = this.activeAugments.length;
    if (this.activeAugments.length === 0) {
      listEl.innerHTML = '<div class="text-slate-400 text-center py-4">아직 획득한 전술 증강이 없습니다.</div>';
      return;
    }
    listEl.innerHTML = this.activeAugments.map(a => `
      <div class="bg-slate-900/80 border border-violet-500/30 rounded-xl p-2-5">
        <div class="font-bold text-cyan-200">${a.icon} ${a.name}</div>
        <div class="text-11 text-slate-400 mt-0-5">${a.desc}</div>
      </div>
    `).join('');
  }

  _getWaveCounts(waveNum) {
    const stage = this.getCurrentStage();
    if (stage.isTutorial) {
      return {
        DRONE: 6 + waveNum * 2,
        RUNNER: waveNum >= 2 ? waveNum * 2 : 0,
        BEHEMOTH: waveNum >= 3 ? Math.max(1, waveNum - 2) : 0,
        SPLITTER: waveNum >= 5 ? 2 : 0,
        AEGIS: waveNum >= 5 ? 1 : 0,
        TITAN: waveNum === stage.finalWave ? 1 : 0
      };
    }
    const diffMult = 0.92 + stage.order * 0.05;
    return {
      DRONE: Math.round((7 + waveNum * 2) * diffMult),
      RUNNER: waveNum >= 2 ? Math.floor(waveNum * 1.6 * diffMult) : 0,
      BEHEMOTH: waveNum >= 3 ? Math.floor((waveNum - 1) * 1.1 * diffMult) : 0,
      SPLITTER: waveNum >= 4 ? Math.floor((waveNum - 2) * 1.0 * diffMult) : 0,
      AEGIS: waveNum >= 5 ? Math.floor((waveNum - 3) * 0.85 * diffMult) : 0,
      TITAN: (waveNum % 5 === 0 || (this.gameMode === 'CAMPAIGN' && waveNum === stage.finalWave))
        ? Math.max(1, Math.floor(waveNum / 5))
        : 0
    };
  }

  _getBossRoutesForWave(waveNum) {
    const stage = this.getCurrentStage();
    const counts = this._getWaveCounts(waveNum);
    const titanCount = counts.TITAN || 0;
    const routes = [];
    for (let b = 0; b < titanCount; b++) {
      if (b === 1 && waveNum >= 8 && stage.routes.BYPASS) routes.push('BYPASS');
      else if (b === 2 && (this.openedBreachRoutes.has('EAST_BREACH') || stage.initialRoutes.includes('EAST_BREACH'))) routes.push('EAST_BREACH');
      else if (b === 3 && (this.openedBreachRoutes.has('CORE_TUNNEL') || stage.initialRoutes.includes('CORE_TUNNEL'))) routes.push('CORE_TUNNEL');
      else if (b >= 4 && stage.routes.SUB_PORTAL) routes.push('SUB_PORTAL');
      else routes.push('MAIN');
    }
    return routes;
  }

  _buildWaveComposition(waveNum) {
    const list = [];
    const stage = this.getCurrentStage();
    const stageHpMult = stage.isTutorial ? 0.82 : (0.88 + stage.order * 0.06);
    const lateAccel = waveNum >= 6 ? Math.pow(waveNum - 5, 1.2) * 0.12 : 0;
    const hpScale = (1 + (waveNum - 1) * 0.28 + lateAccel) * stageHpMult;
    const counts = this._getWaveCounts(waveNum);

    const hasEast = this.openedBreachRoutes.has('EAST_BREACH') || stage.initialRoutes.includes('EAST_BREACH');
    const hasTunnel = this.openedBreachRoutes.has('CORE_TUNNEL') || stage.initialRoutes.includes('CORE_TUNNEL');
    const hasSub = !!stage.routes.SUB_PORTAL;

    for (let i = 0; i < counts.DRONE; i++) {
      let route = 'MAIN';
      if (hasEast && i % 5 === 0) route = 'EAST_BREACH';
      else if (hasSub && waveNum >= 5 && i % 3 === 0) route = 'SUB_PORTAL';
      else if (waveNum >= 4 && i % 4 === 1) route = 'BYPASS';
      list.push({ type: 'DRONE', hpScale, route, interval: Math.max(0.32, 0.74 - waveNum * 0.025) });
    }
    for (let i = 0; i < counts.RUNNER; i++) {
      let route = 'MAIN';
      if (hasTunnel && i % 3 === 0) route = 'CORE_TUNNEL';
      else if (hasEast && i % 4 === 0) route = 'EAST_BREACH';
      else if (waveNum >= 4 && i % 5 !== 0) route = 'BYPASS';
      else if (hasSub && waveNum >= 5 && i % 3 === 0) route = 'SUB_PORTAL';
      list.push({ type: 'RUNNER', hpScale, route, interval: 0.52 });
    }
    for (let i = 0; i < counts.BEHEMOTH; i++) {
      let route = 'MAIN';
      if (hasTunnel && i % 3 === 1) route = 'CORE_TUNNEL';
      else if (hasEast && i % 3 === 2) route = 'EAST_BREACH';
      else if (waveNum >= 6 && i % 3 === 0) route = 'BYPASS';
      list.push({ type: 'BEHEMOTH', hpScale, route, interval: 0.96 });
    }
    for (let i = 0; i < counts.SPLITTER; i++) {
      let route = 'MAIN';
      if (hasEast && i % 3 === 0) route = 'EAST_BREACH';
      else if (hasSub && waveNum >= 5 && i % 2 === 0) route = 'SUB_PORTAL';
      list.push({ type: 'SPLITTER', hpScale, route, interval: 0.85 });
    }
    for (let i = 0; i < counts.AEGIS; i++) {
      let route = 'MAIN';
      if (hasTunnel && i % 3 === 0) route = 'CORE_TUNNEL';
      else if (waveNum >= 4 && i % 2 === 0) route = 'BYPASS';
      list.push({ type: 'AEGIS', hpScale, route, interval: 1.05 });
    }

    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }

    const bossRoutes = this._getBossRoutesForWave(waveNum);
    for (const bossRoute of bossRoutes) {
      list.push({
        type: 'TITAN',
        hpScale: (1 + Math.max(0, waveNum - 5) * 0.42) * stageHpMult,
        route: bossRoute,
        interval: 1.6
      });
    }

    return list;
  }

  _updateWavePreview() {
    const { ENEMY_DEFS, ROUTE_LABELS } = window.AetherBastion;
    const stage = this.getCurrentStage();
    const counts = this._getWaveCounts(this.wave);
    const isBoss = (counts.TITAN || 0) > 0;
    const banner = document.getElementById('waveBanner');
    const title = document.getElementById('wavePreviewTitle');
    const desc = document.getElementById('wavePreviewDesc');
    const bonusHint = document.getElementById('waveBonusHint');
    const intelBody = document.getElementById('waveIntelList');

    const bossRoutes = this._getBossRoutesForWave(this.wave);
    const stageHpMult = stage.isTutorial ? 0.82 : (0.88 + stage.order * 0.06);
    const lateAccel = this.wave >= 6 ? Math.pow(this.wave - 5, 1.2) * 0.12 : 0;
    const hpScale = (1 + (this.wave - 1) * 0.28 + lateAccel) * stageHpMult;

    const badges = [];
    const intelCards = [];
    let totalPotentialCoreDmg = 0;

    Object.entries(counts).forEach(([key, cnt]) => {
      if (cnt <= 0) return;
      const def = ENEMY_DEFS[key];
      totalPotentialCoreDmg += cnt * def.coreDamage;
      const scaledHp = Math.round(def.hp * (key === 'TITAN' ? ((1 + Math.max(0, this.wave - 5) * 0.42) * stageHpMult) : hpScale));
      const bossPathNote = (key === 'TITAN' && bossRoutes.length > 0)
        ? ` [${bossRoutes.map(r => ROUTE_LABELS[r]).join(' + ')}]`
        : '';
      const shortRouteMap = { MAIN: '메인', BYPASS: '우회', SUB_PORTAL: '북부', EAST_BREACH: '폭격로', CORE_TUNNEL: '갱도' };
      badges.push(`${def.name.split(' ')[1] || def.name}×${cnt}${key === 'TITAN' ? `(${bossRoutes.map(r => shortRouteMap[r]).join('/')})` : ''}`);
      intelCards.push(`
        <div class="bg-slate-900/85 border border-slate-700/80 rounded-xl p-2 flex items-center justify-between gap-2">
          <div>
            <div class="font-bold text-xs" style="color:${def.color}">${def.name} <span class="text-white">×${cnt}</span><span class="text-amber-300 text-10">${bossPathNote}</span></div>
            <div class="text-10 text-slate-400">${def.trait}</div>
          </div>
          <div class="text-right font-orbitron text-11 shrink-0">
            <div class="text-rose-300">HP ${scaledHp.toLocaleString()}</div>
            <div class="text-cyan-300">SPD ${def.speed} · 코어 -${def.coreDamage}</div>
          </div>
        </div>
      `);
    });

    for (const ev of (stage.breachEvents || [])) {
      if (this.wave === ev.wave - 1) {
        intelCards.push(`<div class="col-span-full text-11 text-rose-200 bg-rose-950/90 border border-rose-400/50 rounded-lg px-2-5 py-1">☄️ 깜짝 폭격 예고: 다음 웨이브(${ev.wave}W) 개시 시 <strong>${ROUTE_LABELS[ev.routeKey]}</strong>가 폭격으로 열리며 해당 구역 거점은 파괴됩니다!</div>`);
      } else if (this.wave === ev.wave && !this.openedBreachRoutes.has(ev.routeKey)) {
        intelCards.push(`<div class="col-span-full text-11 text-rose-200 bg-rose-950/90 border border-rose-400/50 rounded-lg px-2-5 py-1">☄️ 지형 파괴 경고: 이번 웨이브 시작 즉시 <strong>${ROUTE_LABELS[ev.routeKey]}</strong>가 개방됩니다! (폭격 반경 포탑 100% 환급 · 재설치 불가)</div>`);
      }
    }

    if (counts.TITAN >= 2) {
      intelCards.push(`<div class="col-span-full text-11 text-rose-200 bg-rose-950/90 border border-rose-400/50 rounded-lg px-2-5 py-1">⚠️ 다중 타이탄 강습 경고: 공성 타이탄 ${counts.TITAN}기가 다중 경로로 동시 진격합니다! (총 잠재 돌파 피해 ${totalPotentialCoreDmg})</div>`);
    }

    const waveTag = this.gameMode === 'CAMPAIGN'
      ? `[${stage.code}] W${this.wave}/${stage.finalWave}`
      : `[${stage.code}] W${this.wave}`;

    const isBreachWave = (stage.breachEvents || []).some(ev => ev.wave === this.wave);
    if (isBoss || isBreachWave) {
      banner.style.borderColor = 'rgba(244, 63, 94, 0.75)';
      title.textContent = isBoss ? `⚠️ 보스 ${waveTag}:` : `☄️ 지형폭격 ${waveTag}:`;
      title.className = 'font-bold text-rose-400 shrink-0';
    } else {
      banner.style.borderColor = 'rgba(251, 191, 36, 0.35)';
      title.textContent = `${waveTag}:`;
      title.className = 'font-bold text-amber-200 shrink-0';
    }

    desc.textContent = badges.join(' · ');
    intelBody.innerHTML = intelCards.join('');
    bonusHint.classList.toggle('hidden', this.waveActive || this.wave === 1);
    this._updateRouteThreatBar();
  }

  _updateRouteThreatBar() {
    const { ENEMY_DEFS } = window.AetherBastion;
    const stage = this.getCurrentStage();
    const mainEl = document.getElementById('routeThreatMain');
    const bypassEl = document.getElementById('routeThreatBypass');
    const subEl = document.getElementById('routeThreatSub');
    const eastEl = document.getElementById('routeThreatEast');
    const tunnelEl = document.getElementById('routeThreatTunnel');
    if (!mainEl || !bypassEl || !subEl || !eastEl || !tunnelEl) return;

    const hasSub = !!stage.routes.SUB_PORTAL;
    const hasEast = !!stage.routes.EAST_BREACH;
    const hasTunnel = !!stage.routes.CORE_TUNNEL;

    subEl.classList.toggle('hidden', !hasSub);
    eastEl.classList.toggle('hidden', !hasEast);
    tunnelEl.classList.toggle('hidden', !hasTunnel);

    if (!this.waveActive) {
      const bossRoutes = this._getBossRoutesForWave(this.wave);
      mainEl.textContent = bossRoutes.includes('MAIN') ? '🛣️ 메인: ⚠️ 보스 예정' : '🛣️ 메인: 활성';
      mainEl.className = bossRoutes.includes('MAIN') ? 'font-bold text-rose-300' : 'font-semibold text-cyan-300';

      if (this.wave >= 4) {
        bypassEl.textContent = bossRoutes.includes('BYPASS') ? '☣️ 우회로: ⚠️ 보스 예정' : '☣️ 우회로: 개방됨';
        bypassEl.className = bossRoutes.includes('BYPASS') ? 'font-bold text-rose-300' : 'font-semibold text-amber-300';
      } else {
        bypassEl.textContent = '☣️ 우회로(4W)';
        bypassEl.className = 'font-semibold text-slate-400';
      }

      if (hasSub) {
        if (this.wave >= 5) {
          subEl.textContent = bossRoutes.includes('SUB_PORTAL') ? '🌀 북부균열: ⚠️ 보스 예정' : '🌀 북부균열: 개방됨';
          subEl.className = bossRoutes.includes('SUB_PORTAL') ? 'font-bold text-rose-300' : 'font-semibold text-purple-300';
        } else {
          subEl.textContent = '🌀 북부균열(5W)';
          subEl.className = 'font-semibold text-slate-400';
        }
      }

      if (hasEast) {
        const eastEv = (stage.breachEvents || []).find(e => e.routeKey === 'EAST_BREACH');
        const active = this.openedBreachRoutes.has('EAST_BREACH') || stage.initialRoutes.includes('EAST_BREACH');
        eastEl.textContent = active ? '☄️ 동부돌파로: 개방됨' : (eastEv ? `☄️ 폭격로(${eastEv.wave}W)` : '☄️ 동부돌파로');
        eastEl.className = active ? 'font-bold text-rose-300' : 'font-semibold text-slate-400';
      }

      if (hasTunnel) {
        const tunnelEv = (stage.breachEvents || []).find(e => e.routeKey === 'CORE_TUNNEL');
        const active = this.openedBreachRoutes.has('CORE_TUNNEL') || stage.initialRoutes.includes('CORE_TUNNEL');
        tunnelEl.textContent = active ? '🧨 지하갱도: 개방됨' : (tunnelEv ? `🧨 지하갱도(${tunnelEv.wave}W)` : '🧨 지하갱도');
        tunnelEl.className = active ? 'font-bold text-orange-300' : 'font-semibold text-slate-400';
      }
      return;
    }

    const counts = { MAIN: 0, BYPASS: 0, SUB_PORTAL: 0, EAST_BREACH: 0, CORE_TUNNEL: 0 };
    const routeCoreDmg = { MAIN: 0, BYPASS: 0, SUB_PORTAL: 0, EAST_BREACH: 0, CORE_TUNNEL: 0 };
    const bossOnRoute = { MAIN: false, BYPASS: false, SUB_PORTAL: false, EAST_BREACH: false, CORE_TUNNEL: false };

    for (const e of this.enemies) {
      const r = e.route || 'MAIN';
      counts[r] = (counts[r] || 0) + 1;
      routeCoreDmg[r] = (routeCoreDmg[r] || 0) + (e.coreDamage || 1);
      if (e.isBoss) bossOnRoute[r] = true;
    }
    for (const q of this.spawnQueue) {
      const r = q.route || 'MAIN';
      const def = ENEMY_DEFS[q.type];
      counts[r] = (counts[r] || 0) + 1;
      routeCoreDmg[r] = (routeCoreDmg[r] || 0) + (def ? def.coreDamage : 1);
      if (q.type === 'TITAN') bossOnRoute[r] = true;
    }

    const formatTag = (label, key, normalClass) => {
      const lethal = routeCoreDmg[key] >= this.coreHp && counts[key] > 0;
      const bossTag = bossOnRoute[key] ? ' [보스!]' : (lethal ? ' [치명위협]' : '');
      return {
        text: `${label}: ${counts[key]}기${bossTag}`,
        cls: (bossOnRoute[key] || lethal) ? 'font-bold text-rose-300' : normalClass
      };
    };

    const m = formatTag('🛣️ 메인', 'MAIN', 'font-semibold text-cyan-300');
    mainEl.textContent = m.text;
    mainEl.className = m.cls;

    if (this.wave >= 4) {
      const b = formatTag('☣️ 우회로', 'BYPASS', 'font-semibold text-amber-300');
      bypassEl.textContent = b.text;
      bypassEl.className = b.cls;
    }

    if (hasSub && this.wave >= 5) {
      const s = formatTag('🌀 북부균열', 'SUB_PORTAL', 'font-semibold text-purple-300');
      subEl.textContent = s.text;
      subEl.className = s.cls;
    }

    if (hasEast) {
      const ea = formatTag('☄️ 폭격로', 'EAST_BREACH', 'font-semibold text-rose-300');
      eastEl.textContent = ea.text;
      eastEl.className = ea.cls;
    }

    if (hasTunnel) {
      const tu = formatTag('🧨 지하갱도', 'CORE_TUNNEL', 'font-semibold text-orange-300');
      tunnelEl.textContent = tu.text;
      tunnelEl.className = tu.cls;
    }
  }

  _triggerPathRevealAnimation(routeKey, color, bannerText) {
    this.pathRevealAnims.push({
      routeKey,
      color,
      elapsed: 0,
      duration: 6.5
    });
    const alertEl = document.getElementById('pathBreachBanner');
    const alertTextEl = document.getElementById('pathBreachText');
    if (alertEl && alertTextEl) {
      alertTextEl.textContent = bannerText;
      alertEl.classList.remove('hidden');
      this.breachAlertTimer = 7.0;
    }
  }

  /**
   * Surprise Mid-Battle Orbital / Bunker-Buster Breach Event (Every 3rd Stage: Stage 3 & Stage 6)
   * 1) Opens the new breach path
   * 2) Permanently craters any Build Pads along that path or inside the blast radius (towers CANNOT be placed there afterward!)
   * 3) Demolishes any existing towers on those pads and refunds 100% of their Aether cost
   */
  _triggerOrbitalBreachEvent(ev) {
    const stage = this.getCurrentStage();
    const breachPts = stage.routes[ev.routeKey] || [];
    const impact = ev.impactPoint || { x: 1330, y: 255 };
    const radius = ev.blastRadius || 120;
    let refundedTotal = 0;
    let demolishedCount = 0;
    let crateredPadCount = 0;

    this.openedBreachRoutes.add(ev.routeKey);
    this.audio.playOrbitalStrike();
    this._triggerScreenShake(13, 0.52);

    this.blastCraters.push({ x: impact.x, y: impact.y });
    this.orbitalBeams.push({ x: impact.x, y: impact.y, radius, life: 0.75, maxLife: 0.75, isHostile: true });
    this._spawnShockwave(impact.x, impact.y, radius * 1.35, ev.color);
    this._spawnBurst(impact.x, impact.y, ev.color, 36);

    // Permanently destroy any build pads overlapping the newly opened breach route or inside the blast radius
    for (const pad of (stage.buildPads || [])) {
      const nearBreachRoute = this._minDistToRoute(pad.x, pad.y, breachPts) <= 52;
      const inBlastRadius = Math.hypot(pad.x - impact.x, pad.y - impact.y) <= radius;
      if (nearBreachRoute || inBlastRadius) {
        if (!this.destroyedPadIds.has(pad.id)) {
          this.destroyedPadIds.add(pad.id);
          crateredPadCount += 1;
          this.blastCraters.push({ x: pad.x, y: pad.y });
          this._spawnBurst(pad.x, pad.y, ev.color, 16);
        }
      }
    }

    // Demolish any existing towers on cratered pads and refund 100%
    for (let i = this.towers.length - 1; i >= 0; i--) {
      const t = this.towers[i];
      if (this.destroyedPadIds.has(t.padId) || Math.hypot(t.x - impact.x, t.y - impact.y) <= radius) {
        t.sold = true;
        t.demolishedByOrbital = true;
        refundedTotal += t.totalInvested;
        demolishedCount += 1;
        if (this.selectedTower === t) this._closeInspector();
        this._spawnBurst(t.x, t.y, '#fbbf24', 18);
        this.towers.splice(i, 1);
      }
    }

    if (refundedTotal > 0) {
      this._gainAether(refundedTotal, false);
      this._spawnFloatingText(
        stage.mapWidth * 0.5,
        245,
        `⚠️ 폭격 구역 포탑 ${demolishedCount}기 철거 · 건설비 100% (+${refundedTotal}⚡) 즉시 환급!`,
        '#fbbf24',
        true
      );
    } else if (crateredPadCount > 0) {
      this._spawnFloatingText(
        stage.mapWidth * 0.5,
        245,
        `☄️ 폭격 충격으로 거점 ${crateredPadCount}곳이 영구 파괴되었습니다 (건설 불가)!`,
        '#fb7185',
        true
      );
    }

    if (this.renderer) this.renderer.invalidateBackdrop();
    this._triggerPathRevealAnimation(ev.routeKey, ev.color, ev.banner);
  }

  _startWave() {
    if (this.waveActive || this.gameOver || this.victory) return;
    const stage = this.getCurrentStage();

    this.waveActive = true;
    this.currentWaveStartHp = this.coreHp;
    this.currentWaveAetherEarned = 0;
    this.overloadAetherThisWave = 0;

    for (const ev of (stage.breachEvents || [])) {
      if (this.wave === ev.wave && !this.openedBreachRoutes.has(ev.routeKey) && stage.routes[ev.routeKey]) {
        this._triggerOrbitalBreachEvent(ev);
      }
    }

    this.spawnQueue = this._buildWaveComposition(this.wave);
    this.spawnTimer = 0.2;

    const isBoss = this.spawnQueue.some(q => q.type === 'TITAN');
    this.audio.playWaveStart(isBoss);
    this._spawnShockwave(this.paths.MAIN[0].x, this.paths.MAIN[0].y, 95, isBoss ? '#f43f5e' : '#38bdf8');

    if (this.wave === 4 && this.paths.BYPASS) {
      this._spawnShockwave(this.paths.BYPASS[0].x, this.paths.BYPASS[0].y, 120, '#fbbf24');
      this._triggerPathRevealAnimation('BYPASS', '#fbbf24', '☣️ 전선 확장 경보: 협곡 우회로 개방! 남서쪽 경로로 괴수 무리가 진입합니다!');
    } else if (this.wave === 5 && this.paths.SUB_PORTAL) {
      this._spawnShockwave(this.paths.SUB_PORTAL[0].x, this.paths.SUB_PORTAL[0].y, 120, '#c084fc');
      this._triggerPathRevealAnimation('SUB_PORTAL', '#c084fc', '🌀 차원 균열 경보: 북부 균열 개방! 후반부로 괴수가 직접 강하합니다!');
    }

    this._spawnFloatingText(
      stage.mapWidth * 0.5, 145,
      isBoss ? `⚠️ WAVE ${this.wave} — 심연의 공성 타이탄 강습!` : `WAVE ${this.wave} 시작!`,
      isBoss ? '#fb7185' : '#fde68a',
      true
    );

    this.ui.updateTutorialGuide();
    this._updateHUD();
    this._updateWavePreview();
  }

  _spawnEnemy(entry, customPos = null, customWpIndex = 1, customProgress = 0) {
    const def = window.AetherBastion.ENEMY_DEFS[entry.type];
    const routeName = entry.route || 'MAIN';
    const routeWaypoints = this.paths[routeName] || this.paths.MAIN;
    const maxHp = Math.round(def.hp * (entry.hpScale || 1));
    const start = customPos || routeWaypoints[0];

    if (this.routeMetrics[routeName]) {
      this.routeMetrics[routeName].spawned += 1;
    }

    const econMult = this.getWaveEconomyMultiplier();
    const reward = Math.max(3, Math.round(def.reward * this.mods.rewardMult * econMult));

    let initialShield = 0;
    if (def.id === 'AEGIS') initialShield = Math.round(maxHp * 0.55);
    else if (def.id === 'TITAN' && this.wave >= 5) initialShield = Math.round(maxHp * 0.30);

    const enemyObj = {
      id: Math.random(),
      type: def.id,
      name: def.name,
      route: routeName,
      waypoints: routeWaypoints,
      x: start.x,
      y: start.y,
      wpIndex: customWpIndex,
      progress: customProgress,
      hp: maxHp,
      maxHp,
      shield: initialShield,
      maxShield: initialShield,
      speed: def.speed,
      reward,
      score: def.score,
      radius: def.radius,
      color: def.color,
      coreColor: def.coreColor,
      coreDamage: def.coreDamage,
      isBoss: !!def.isBoss,
      spawnTime: this.time,
      shatterImmunityTimer: 0,
      shatterDamageTaken: 0,
      shatterProcs: 0,
      angle: 0,
      slowTimer: 0,
      slowAmount: 0,
      freezeTimer: 0,
      shockTimer: 0,
      armorShredTimer: 0,
      brittleDebuff: false,
      aegisPulseTimer: 2.0,
      hitFlash: 0
    };

    if (enemyObj.isBoss) {
      this.bossTelemetry.push({
        wave: this.wave,
        route: routeName,
        maxHp,
        spawnTime: this.time,
        endTime: null,
        shatterDamage: 0,
        shatterProcs: 0,
        breached: false
      });
      enemyObj._bossLogRef = this.bossTelemetry[this.bossTelemetry.length - 1];
    }

    this.enemies.push(enemyObj);
  }

  _loop(now) {
    const rawDt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;

    const dt = this.started && !this.gameOver && !this.victory ? rawDt * this.gameSpeed : rawDt * 0.35;
    this.time += rawDt;

    this._updateAmbient(rawDt);

    if (this.started && !this.gameOver && !this.victory && this.gameSpeed > 0) {
      this._updateSimulation(dt);
    }

    this.renderer.render();
    requestAnimationFrame((t) => this._loop(t));
  }

  _updateAmbient(dt) {
    if (this.shakeTime > 0) this.shakeTime = Math.max(0, this.shakeTime - dt);
    if (this.corePulse > 0) this.corePulse = Math.max(0, this.corePulse - dt * 2.5);

    if (this.breachAlertTimer > 0) {
      this.breachAlertTimer -= dt;
      if (this.breachAlertTimer <= 0) {
        const alertEl = document.getElementById('pathBreachBanner');
        if (alertEl) alertEl.classList.add('hidden');
      }
    }

    for (let i = this.pathRevealAnims.length - 1; i >= 0; i--) {
      this.pathRevealAnims[i].elapsed += dt;
      if (this.pathRevealAnims[i].elapsed >= this.pathRevealAnims[i].duration) {
        this.pathRevealAnims.splice(i, 1);
      }
    }
  }

  _updateSimulation(dt) {
    const { AUGMENT_INTERVAL } = window.AetherBastion.CONFIG;
    const stage = this.getCurrentStage();

    if (this.orbitalCd > 0) this.orbitalCd = Math.max(0, this.orbitalCd - dt);
    if (this.chronoCd > 0) this.chronoCd = Math.max(0, this.chronoCd - dt);
    if (this.chronoTimer > 0) this.chronoTimer = Math.max(0, this.chronoTimer - dt);
    if (this.overdriveCd > 0) this.overdriveCd = Math.max(0, this.overdriveCd - dt);
    if (this.overdriveTimer > 0) this.overdriveTimer = Math.max(0, this.overdriveTimer - dt);

    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.comboCount = 0;
        document.getElementById('hudComboBadge').classList.add('hidden');
        document.getElementById('hudComboBadge').classList.remove('flex');
      }
    }

    const augmentModalClosed = document.getElementById('augmentModal').classList.contains('hidden');
    if (this.waveActive) {
      if (this.spawnQueue.length > 0) {
        this.spawnTimer -= dt;
        if (this.spawnTimer <= 0) {
          const next = this.spawnQueue.shift();
          this._spawnEnemy(next);
          this.spawnTimer = next.interval;
        }
      } else if (this.enemies.length === 0) {
        this.waveActive = false;
        const baseBonus = Math.round((26 + this.wave * 6) * this.getWaveEconomyMultiplier());
        const interestBonus = this.mods.interestRate > 0
          ? Math.min(60, Math.floor(this.aether * this.mods.interestRate))
          : 0;
        const totalBonus = baseBonus + interestBonus;

        this._gainAether(totalBonus, true);
        this._addScore(totalBonus * 3);
        this.audio.playWaveClear();

        this.waveLogs.push({
          wave: this.wave,
          coreDamageTaken: Math.max(0, this.currentWaveStartHp - this.coreHp),
          aetherEarned: this.currentWaveAetherEarned,
          coreHpEnd: this.coreHp
        });

        const clearedWave = this.wave;
        const grantsAugment = (clearedWave % AUGMENT_INTERVAL === 0);

        if (this.gameMode === 'CAMPAIGN' && clearedWave >= stage.finalWave) {
          this._triggerCampaignVictory();
          return;
        }

        this.wave += 1;

        const autoSnap = this.saveManager.createSnapshotFromGame(this, `[자동 체크포인트] ${stage.name} · WAVE ${this.wave}`);
        this.saveManager.saveToSlot('autosave', autoSnap);

        this.ui.updateTutorialGuide();
        this._updateHUD();
        this._updateWavePreview();

        if (grantsAugment) {
          const msg = interestBonus > 0
            ? `WAVE ${clearedWave} 클리어! +${baseBonus} (+이자 ${interestBonus}) ⚡ · 전술 증강 3종 도착!`
            : `WAVE ${clearedWave} 클리어! +${baseBonus} ⚡ · 전술 증강 3종 도착!`;
          this._spawnFloatingText(stage.mapWidth * 0.5, 165, msg, '#e879f9', true);
          this._openAugmentDraft();
        } else {
          const wavesLeft = AUGMENT_INTERVAL - (clearedWave % AUGMENT_INTERVAL);
          const msg = interestBonus > 0
            ? `WAVE ${clearedWave} 클리어! +${baseBonus} (+이자 ${interestBonus}) ⚡ (증강까지 ${wavesLeft}W)`
            : `WAVE ${clearedWave} 클리어! +${baseBonus} ⚡ (증강까지 ${wavesLeft}W)`;
          this._spawnFloatingText(stage.mapWidth * 0.5, 165, msg, '#34d399', true);
          if (this.autoWave) {
            this.autoWaveDelay = 1.6;
          }
        }
        return;
      }
    } else if (this.autoWave && this.wave > 1 && augmentModalClosed) {
      this.autoWaveDelay -= dt;
      if (this.autoWaveDelay <= 0) {
        this._startWave();
      }
    }

    // 2. Update Enemies
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt * 5);
      if (e.freezeTimer > 0) e.freezeTimer = Math.max(0, e.freezeTimer - dt);
      if (e.shockTimer > 0) e.shockTimer = Math.max(0, e.shockTimer - dt);
      if (e.armorShredTimer > 0) e.armorShredTimer = Math.max(0, e.armorShredTimer - dt);
      if (e.shatterImmunityTimer > 0) e.shatterImmunityTimer = Math.max(0, e.shatterImmunityTimer - dt);

      if (e.slowTimer > 0) {
        e.slowTimer -= dt;
        if (this.mods.frostbiteDps > 0) {
          this._damageEnemy(e, Math.round(this.mods.frostbiteDps * dt), '#7dd3fc', null, false, true);
          if (e.hp <= 0) continue;
        }
        if (e.slowTimer <= 0) {
          e.slowAmount = 0;
          e.brittleDebuff = false;
        }
      }

      if (e.type === 'AEGIS') {
        e.aegisPulseTimer -= dt;
        if (e.aegisPulseTimer <= 0) {
          e.aegisPulseTimer = 3.8;
          this._spawnShockwave(e.x, e.y, 110, '#60a5fa');
          for (const ally of this.enemies) {
            if (Math.hypot(ally.x - e.x, ally.y - e.y) <= 110) {
              const shieldAmt = Math.round(ally.maxHp * 0.28);
              ally.maxShield = Math.max(ally.maxShield, shieldAmt);
              ally.shield = Math.min(ally.maxShield, ally.shield + shieldAmt);
            }
          }
        }
      }

      const targetWp = e.waypoints[e.wpIndex];
      if (!targetWp) continue;

      const dx = targetWp.x - e.x;
      const dy = targetWp.y - e.y;
      const dist = Math.hypot(dx, dy);

      let effectiveSlow = e.isBoss ? e.slowAmount * 0.55 : e.slowAmount;
      let speedMult = 1 - effectiveSlow;
      if (e.freezeTimer > 0) speedMult = e.isBoss ? 0.35 : 0;
      if (this.chronoTimer > 0) speedMult *= (e.isBoss ? 0.35 : 0.12);

      const step = e.speed * Math.max(0, speedMult) * dt;

      if (dist <= step && step > 0) {
        e.x = targetWp.x;
        e.y = targetWp.y;
        e.progress += dist;
        e.wpIndex += 1;

        if (e.wpIndex >= e.waypoints.length) {
          if (e._bossLogRef) {
            e._bossLogRef.endTime = this.time;
            e._bossLogRef.breached = true;
          }
          if (this.routeMetrics[e.route]) {
            this.routeMetrics[e.route].coreLost += e.coreDamage;
          }
          this.coreHp = Math.max(0, this.coreHp - e.coreDamage);
          this.corePulse = 1.0;
          this._triggerScreenShake(8, 0.25);
          this.audio.playCoreBreach();
          this._spawnBurst(e.x, e.y, '#f43f5e', 20);
          this._spawnFloatingText(e.x - 20, e.y - 30, `코어 피격 -${e.coreDamage}`, '#fb7185');
          this.enemies.splice(i, 1);
          this._updateHUD();

          if (this.coreHp <= 0) {
            this._triggerGameOver();
            return;
          }
          continue;
        }
      } else if (step > 0) {
        const nx = dx / dist;
        const ny = dy / dist;
        e.x += nx * step;
        e.y += ny * step;
        e.progress += step;
        e.angle = Math.atan2(ny, nx);
      }
    }

    // 3. Update Towers
    for (const t of this.towers) {
      const stats = this.getTowerStats(t);
      const fireInterval = 1 / stats.fireRate;

      if (t.recoil > 0) t.recoil = Math.max(0, t.recoil - dt * 5);
      if (t.upgradeFlash > 0) t.upgradeFlash = Math.max(0, t.upgradeFlash - dt * 2.2);
      t.pulsePhase += dt * 3;
      if (t.cooldown > 0) t.cooldown -= dt;

      const target = this._acquireTarget(t, stats.range);

      if (target) {
        const desiredAngle = Math.atan2(target.y - t.y, target.x - t.x);
        t.angle = this._lerpAngle(t.angle, desiredAngle, Math.min(1, dt * 15));

        if (t.cooldown <= 0) {
          t.cooldown = fireInterval;
          t.recoil = 1.0;
          if (t.type === 'PULSE' && t.spec === 'A') {
            t.spinUp = Math.min(5, (t.spinUp || 0) + 1);
          }
          this._fireTower(t, stats, target);
        }
      } else if (t.spinUp > 0) {
        t.spinUp = Math.max(0, t.spinUp - dt * 2);
      }
    }

    // 4. Update Shell Casings & Projectiles
    for (let i = this.shellCasings.length - 1; i >= 0; i--) {
      const sc = this.shellCasings[i];
      sc.x += sc.vx * dt;
      sc.y += sc.vy * dt;
      sc.vy += 180 * dt;
      sc.rot += sc.vrot * dt;
      sc.life -= dt;
      if (sc.life <= 0) this.shellCasings.splice(i, 1);
    }

    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];

      if (p.kind === 'PULSE') {
        if (p.target && p.target.hp > 0) {
          p.tx = p.target.x;
          p.ty = p.target.y;
        }
        const dx = p.tx - p.x;
        const dy = p.ty - p.y;
        const dist = Math.hypot(dx, dy);
        const step = p.speed * dt;

        p.trail.push({ x: p.x, y: p.y });
        if (p.trail.length > 6) p.trail.shift();

        if (dist <= step) {
          if (p.target && p.target.hp > 0) {
            if (p.target.shockTimer > 0 && Math.random() < 0.34) {
              this._triggerOverloadReaction(p.target, p.damage, p.sourceTower);
            }
            this._damageEnemy(p.target, p.damage, p.isCrit ? '#fde047' : '#38bdf8', p.sourceTower, p.isCrit);
            if (this.overdriveTimer > 0 && p.target.hp > 0) {
              this._triggerOverdriveSpark(p.target, p.damage, p.sourceTower);
            }
          }
          this._spawnBurst(p.tx, p.ty, p.isCrit ? '#fde047' : '#fbbf24', 5);
          this.projectiles.splice(i, 1);
        } else {
          p.x += (dx / dist) * step;
          p.y += (dy / dist) * step;
          p.angle = Math.atan2(dy, dx);
        }
      } else if (p.kind === 'MORTAR') {
        p.elapsed += dt;
        const tNorm = Math.min(1, p.elapsed / p.duration);
        p.x = p.sx + (p.tx - p.sx) * tNorm;
        p.y = p.sy + (p.ty - p.sy) * tNorm;
        p.arcHeight = Math.sin(tNorm * Math.PI) * (p.isSubmunition ? 45 : 95);

        if (tNorm >= 1) {
          this._detonateMortar(p);
          this.projectiles.splice(i, 1);
        }
      }
    }

    // 5. Update Visual Effects
    for (let i = this.lightningArcs.length - 1; i >= 0; i--) {
      this.lightningArcs[i].life -= dt;
      if (this.lightningArcs[i].life <= 0) this.lightningArcs.splice(i, 1);
    }
    for (let i = this.orbitalBeams.length - 1; i >= 0; i--) {
      this.orbitalBeams[i].life -= dt;
      if (this.orbitalBeams[i].life <= 0) this.orbitalBeams.splice(i, 1);
    }
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const s = this.shockwaves[i];
      s.elapsed += dt;
      if (s.elapsed >= s.duration) this.shockwaves.splice(i, 1);
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= 0.94;
      pt.vy *= 0.94;
      pt.life -= dt;
      if (pt.life <= 0) this.particles.splice(i, 1);
    }
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.y += ft.vy * dt;
      ft.life -= dt;
      if (ft.life <= 0) this.floatingTexts.splice(i, 1);
    }

    this._updateRouteThreatBar();
    this._updateHUD();
  }

  _acquireTarget(tower, range) {
    let best = null;
    let bestScore = tower.targetMode === 'LAST' || tower.targetMode === 'WEAK' ? Infinity : -Infinity;

    for (const e of this.enemies) {
      const d = Math.hypot(e.x - tower.x, e.y - tower.y);
      if (d > range) continue;

      if (tower.targetMode === 'FIRST') {
        if (e.progress > bestScore) { bestScore = e.progress; best = e; }
      } else if (tower.targetMode === 'LAST') {
        if (e.progress < bestScore) { bestScore = e.progress; best = e; }
      } else if (tower.targetMode === 'STRONG') {
        const effHp = e.hp + e.shield;
        if (effHp > bestScore) { bestScore = effHp; best = e; }
      } else if (tower.targetMode === 'WEAK') {
        const effHp = e.hp + e.shield;
        if (effHp < bestScore) { bestScore = effHp; best = e; }
      }
    }
    return best;
  }

  _triggerOverdriveSpark(target, baseDmg, sourceTower) {
    let nearest = null;
    let bestD = 125;
    for (const cand of this.enemies) {
      if (cand === target || cand.hp <= 0) continue;
      const d = Math.hypot(cand.x - target.x, cand.y - target.y);
      if (d < bestD) {
        bestD = d;
        nearest = cand;
      }
    }
    if (nearest) {
      this.lightningArcs.push({
        points: [{ x: target.x, y: target.y }, { x: nearest.x, y: nearest.y }],
        life: 0.14,
        maxLife: 0.14,
        color: '#f0abfc',
        width: 2.2
      });
      this._damageEnemy(nearest, Math.max(8, Math.round(baseDmg * 0.38)), '#f0abfc', sourceTower, false, true);
    }
  }

  _fireTower(tower, stats, target) {
    const overdriveCrit = this.overdriveTimer > 0 ? 0.25 : 0;

    if (tower.type === 'PULSE') {
      const isRailgun = tower.spec === 'B';
      this.audio.playPulseShot(isRailgun);

      if (!isRailgun && this.shellCasings.length < 60) {
        const ejectAng = tower.angle - Math.PI * 0.5 + (Math.random() - 0.5) * 0.5;
        this.shellCasings.push({
          x: tower.x,
          y: tower.y,
          vx: Math.cos(ejectAng) * (28 + Math.random() * 18),
          vy: Math.sin(ejectAng) * (28 + Math.random() * 18) - 24,
          rot: Math.random() * Math.PI,
          vrot: (Math.random() - 0.5) * 18,
          life: 0.42
        });
      }

      const hasStatus = target.slowTimer > 0 || target.freezeTimer > 0 || target.shockTimer > 0 || target.armorShredTimer > 0;
      const critChance = (isRailgun ? 0.35 : 0) + (hasStatus ? this.mods.pulseCritChance : 0) + overdriveCrit;
      const isCrit = Math.random() < critChance;
      const finalDmg = isCrit ? Math.round(stats.damage * (isRailgun ? 2.3 : 2.0)) : stats.damage;

      const barrelLen = isRailgun ? 33 : 29;
      const muzzleX = tower.x + Math.cos(tower.angle) * barrelLen;
      const muzzleY = tower.y + Math.sin(tower.angle) * barrelLen;
      this.projectiles.push({
        kind: 'PULSE',
        x: muzzleX,
        y: muzzleY,
        tx: target.x,
        ty: target.y,
        target,
        sourceTower: tower,
        speed: isRailgun ? 1050 : 780,
        damage: finalDmg,
        isCrit,
        isRailgun,
        angle: tower.angle,
        trail: []
      });
    } else if (tower.type === 'CRYO') {
      this.audio.playCryoShot();
      this._spawnShockwave(tower.x, tower.y, stats.range, stats.color);
      const slowDur = 2.0 + this.mods.cryoDurationBonus;

      for (let i = this.enemies.length - 1; i >= 0; i--) {
        const e = this.enemies[i];
        if (Math.hypot(e.x - tower.x, e.y - tower.y) <= stats.range + e.radius) {
          e.slowTimer = slowDur;
          e.slowAmount = Math.max(e.slowAmount, stats.slowFactor);
          if (tower.spec === 'B') e.brittleDebuff = true;
          if (tower.spec === 'A' && Math.random() < 0.22) {
            const freezeDur = e.isBoss ? 0.22 : 0.75;
            e.freezeTimer = Math.max(e.freezeTimer, freezeDur);
          }
          const isCrit = overdriveCrit > 0 && Math.random() < overdriveCrit;
          this._damageEnemy(e, isCrit ? Math.round(stats.damage * 1.6) : stats.damage, '#7dd3fc', tower, isCrit);
          this._spawnBurst(e.x, e.y, '#bae6fd', 4);
        }
      }
    } else if (tower.type === 'TESLA') {
      this.audio.playTeslaShot();
      const maxChains = stats.chainCount;
      const decayFactor = stats.chainDecay || 0.82;
      const hitSet = new Set();
      const chainPoints = [{ x: tower.x, y: tower.y }];

      let current = target;
      for (let c = 0; c < maxChains && current; c++) {
        hitSet.add(current);
        chainPoints.push({ x: current.x, y: current.y });

        if (current.slowTimer > 0 || current.freezeTimer > 0) {
          this._triggerSuperconductReaction(current, stats.damage, tower);
        }

        current.shockTimer = Math.max(current.shockTimer, 3.0);
        let chainDmg = Math.max(6, Math.round(stats.damage * Math.pow(decayFactor, c)));
        if (tower.spec === 'B' && (current.isBoss || current.type === 'BEHEMOTH')) {
          chainDmg = Math.round(chainDmg * 1.40);
        }
        const isCrit = overdriveCrit > 0 && Math.random() < overdriveCrit;
        if (isCrit) chainDmg = Math.round(chainDmg * 1.75);

        this._damageEnemy(current, chainDmg, isCrit ? '#fde047' : '#d8b4fe', tower, isCrit);
        this._spawnBurst(current.x, current.y, '#c084fc', 5);

        let nextEnemy = null;
        let bestDist = 145;
        for (const cand of this.enemies) {
          if (hitSet.has(cand) || cand.hp <= 0) continue;
          const d = Math.hypot(cand.x - current.x, cand.y - current.y);
          if (d <= bestDist) {
            bestDist = d;
            nextEnemy = cand;
          }
        }
        current = nextEnemy;
      }

      this.lightningArcs.push({ points: chainPoints, life: 0.17, maxLife: 0.17 });
    } else if (tower.type === 'MORTAR') {
      this.audio.playMortarLaunch();
      const muzzleX = tower.x + Math.cos(tower.angle) * 20;
      const muzzleY = tower.y + Math.sin(tower.angle) * 20;
      this._spawnBurst(muzzleX, muzzleY, '#fbbf24', 6);
      const flightTime = Math.max(0.52, Math.min(0.92, Math.hypot(target.x - tower.x, target.y - tower.y) / 360));
      this.projectiles.push({
        kind: 'MORTAR',
        sx: muzzleX,
        sy: muzzleY,
        x: muzzleX,
        y: muzzleY,
        tx: target.x,
        ty: target.y,
        elapsed: 0,
        duration: flightTime,
        arcHeight: 0,
        damage: stats.damage,
        sourceTower: tower,
        splashRadius: stats.splashRadius,
        spec: tower.spec,
        isSubmunition: false
      });
    }
  }

  _detonateMortar(p) {
    this.audio.playMortarExplosion();
    this._spawnShockwave(p.tx, p.ty, p.splashRadius, '#f59e0b');
    this._spawnBurst(p.tx, p.ty, '#fbbf24', p.isSubmunition ? 10 : 18);

    if (!p.isSubmunition && p.spec === 'A') {
      for (let s = 0; s < 3; s++) {
        const ang = (s * Math.PI * 2) / 3 + Math.random() * 0.5;
        const dist = 38 + Math.random() * 25;
        this.projectiles.push({
          kind: 'MORTAR',
          sx: p.tx,
          sy: p.ty,
          x: p.tx,
          y: p.ty,
          tx: p.tx + Math.cos(ang) * dist,
          ty: p.ty + Math.sin(ang) * dist,
          elapsed: 0,
          duration: 0.34,
          arcHeight: 0,
          damage: Math.round(p.damage * 0.42),
          sourceTower: p.sourceTower,
          splashRadius: Math.round(p.splashRadius * 0.62),
          spec: null,
          isSubmunition: true
        });
      }
    }

    for (let j = this.enemies.length - 1; j >= 0; j--) {
      const e = this.enemies[j];
      const d = Math.hypot(e.x - p.tx, e.y - p.ty);
      if (d <= p.splashRadius + e.radius) {
        if (!p.isSubmunition && p.spec === 'B' && d > 8 && !e.isBoss) {
          e.x += ((p.tx - e.x) / d) * Math.min(24, d * 0.42);
          e.y += ((p.ty - e.y) / d) * Math.min(24, d * 0.42);
        }

        if ((e.slowTimer > 0 || e.freezeTimer > 0) && e.shatterImmunityTimer <= 0) {
          this._triggerShatterReaction(e, p.damage, p.sourceTower);
        }

        const falloff = 1 - (d / (p.splashRadius + e.radius)) * 0.32;
        this._damageEnemy(e, Math.round(p.damage * falloff), '#fbbf24', p.sourceTower);
      }
    }
  }

  _recordElementalReaction(typeKey, x, y, label, color) {
    this.reactionsTriggered += 1;
    this.reactionBreakdown[typeKey] = (this.reactionBreakdown[typeKey] || 0) + 1;
    this.comboCount += 1;
    this.comboTimer = this.comboMaxDuration;
    this._addScore(15 * Math.min(10, this.comboCount));

    if (this.mods.reactionCooldownRefund > 0) {
      this.orbitalCd = Math.max(0, this.orbitalCd - this.mods.reactionCooldownRefund);
      this.chronoCd = Math.max(0, this.chronoCd - this.mods.reactionCooldownRefund);
      this.overdriveCd = Math.max(0, this.overdriveCd - this.mods.reactionCooldownRefund);
    }

    if (this.time - (this.lastReactionCalloutTime[typeKey] || -99) >= 0.65) {
      this.lastReactionCalloutTime[typeKey] = this.time;
      this._spawnFloatingText(x, y - 24, label, color, true);
    }
  }

  _triggerSuperconductReaction(target, baseDmg, sourceTower) {
    this.audio.playSuperconduct();
    const specBoost = (sourceTower && sourceTower.spec === 'A') ? 1.30 : 1.0;
    const comboMult = 1 + this.getComboDamageBonus();
    const scDmg = Math.round((24 + baseDmg * 0.55) * this.mods.superconductMult * specBoost * comboMult);

    this._spawnShockwave(target.x, target.y, 105, '#c084fc');
    this._recordElementalReaction('SUPERCONDUCT', target.x, target.y, '⚡ 초전도! 방어파쇄', '#e879f9');

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (Math.hypot(e.x - target.x, e.y - target.y) <= 105 + e.radius) {
        e.armorShredTimer = Math.max(e.armorShredTimer, e.isBoss ? 2.5 : 4.0);
        this._damageEnemy(e, scDmg, '#e879f9', sourceTower, false, false, 'SUPERCONDUCT');
      }
    }
  }

  _triggerShatterReaction(target, baseDmg, sourceTower) {
    this.audio.playShatter();
    const comboMult = 1 + this.getComboDamageBonus();

    if (target.isBoss) {
      target.shatterImmunityTimer = 2.5;
      const bossPctDmg = Math.min(220, Math.round(target.maxHp * 0.03));
      const shatterDmg = Math.round((bossPctDmg + baseDmg * 0.35) * this.mods.shatterMult * comboMult);
      target.freezeTimer = Math.max(target.freezeTimer, 0.16);
      target.shatterDamageTaken += shatterDmg;
      target.shatterProcs += 1;
      if (target._bossLogRef) {
        target._bossLogRef.shatterDamage += shatterDmg;
        target._bossLogRef.shatterProcs += 1;
      }
      this._spawnShockwave(target.x, target.y, 75, '#7dd3fc');
      this._spawnBurst(target.x, target.y, '#e0f2fe', 14);
      this._recordElementalReaction('SHATTER', target.x, target.y, `❄️ 보스 열충격 파쇄! -${shatterDmg}`, '#7dd3fc');
      this._damageEnemy(target, shatterDmg, '#bae6fd', sourceTower, true, false, 'SHATTER');
    } else {
      target.shatterImmunityTimer = 0.8;
      const hpPctDmg = Math.min(260, Math.round(target.maxHp * 0.07));
      const shatterDmg = Math.round((hpPctDmg + baseDmg * 0.40) * this.mods.shatterMult * comboMult);
      target.freezeTimer = Math.max(target.freezeTimer, 0.45);
      this._spawnShockwave(target.x, target.y, 70, '#7dd3fc');
      this._spawnBurst(target.x, target.y, '#e0f2fe', 12);
      this._recordElementalReaction('SHATTER', target.x, target.y, `❄️ 열충격 파쇄! -${shatterDmg}`, '#7dd3fc');
      this._damageEnemy(target, shatterDmg, '#bae6fd', sourceTower, true, false, 'SHATTER');
    }
  }

  _triggerOverloadReaction(target, baseDmg, sourceTower) {
    const comboMult = 1 + this.getComboDamageBonus();
    const ovDmg = Math.round((baseDmg * 0.72 + 18) * comboMult);
    if (this.overloadAetherThisWave < 15) {
      this.overloadAetherThisWave += 1;
      this._gainAether(1, true);
    }
    this._spawnShockwave(target.x, target.y, 52, '#38bdf8');
    this._recordElementalReaction('OVERLOAD', target.x, target.y, '💥 과부하!', '#38bdf8');
    this._damageEnemy(target, ovDmg, '#38bdf8', sourceTower, false, false, 'OVERLOAD');
  }

  _damageEnemy(enemy, amount, color, sourceTower = null, isCrit = false, silentText = false, reactionType = null) {
    if (!enemy || enemy.hp <= 0) return;

    let mult = 1.0;
    if (enemy.armorShredTimer > 0) mult += 0.22;
    if (enemy.brittleDebuff) mult += 0.22;
    let finalAmount = Math.round(amount * mult);

    if (enemy.shield > 0) {
      const absorbed = Math.min(enemy.shield, finalAmount);
      enemy.shield -= absorbed;
      finalAmount -= absorbed;
      if (!silentText && absorbed > 0) {
        this._spawnClusteredDamageText(enemy, absorbed, '#60a5fa', false, '방벽 -');
      }
      if (finalAmount <= 0) return;
    }

    const actualDamage = Math.min(Math.max(0, finalAmount), enemy.hp);
    if (reactionType) {
      this.reactionDamageTotals[reactionType] = (this.reactionDamageTotals[reactionType] || 0) + actualDamage;
      if (sourceTower) {
        sourceTower.synergyDamageDealt = (sourceTower.synergyDamageDealt || 0) + actualDamage;
        this._refreshTowerTelemetry(sourceTower);
      }
    } else if (sourceTower) {
      sourceTower.damageDealt = (sourceTower.damageDealt || 0) + actualDamage;
      this._refreshTowerTelemetry(sourceTower);
    }

    enemy.hp -= finalAmount;
    enemy.hitFlash = 1.0;
    if (!silentText) {
      this._spawnClusteredDamageText(enemy, finalAmount, color, isCrit, '-');
    }

    if (enemy.hp <= 0) {
      const idx = this.enemies.indexOf(enemy);
      if (idx !== -1) this.enemies.splice(idx, 1);

      if (enemy._bossLogRef) {
        enemy._bossLogRef.endTime = this.time;
      }

      if (enemy.type === 'SPLITTER') {
        for (let s = 0; s < 2; s++) {
          const offset = (s === 0 ? -10 : 10);
          const child = {
            type: 'DRONE',
            hpScale: 1 + (this.wave - 1) * 0.22,
            route: enemy.route
          };
          this._spawnEnemy(
            child,
            { x: enemy.x + offset, y: enemy.y + offset },
            enemy.wpIndex,
            enemy.progress
          );
        }
        this._spawnFloatingText(enemy.x, enemy.y - 26, '분열!', '#34d399');
      }

      this._gainAether(enemy.reward, true);
      this._addScore(enemy.score);
      this.kills += 1;
      if (sourceTower) {
        sourceTower.kills = (sourceTower.kills || 0) + 1;
        this._refreshTowerTelemetry(sourceTower);
      }

      this.audio.playEnemyDefeat(enemy.isBoss);
      this._spawnShockwave(enemy.x, enemy.y, enemy.isBoss ? 85 : 36, enemy.color);
      this._spawnBurst(enemy.x, enemy.y, enemy.color, enemy.isBoss ? 28 : 12);
      this._spawnFloatingText(enemy.x, enemy.y - 18, `+${enemy.reward} ⚡`, '#fbbf24');
      this._updateHUD();
    }
  }

  _spawnClusteredDamageText(enemy, amount, color, isCrit, prefix = '-') {
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      if (!ft.isReaction && ft.enemyId === enemy.id && ft.prefix === prefix && ft.life > ft.maxLife - 0.22) {
        ft.accumAmount += amount;
        ft.hitCount += 1;
        ft.text = `${prefix}${ft.accumAmount}${ft.hitCount > 1 ? ` (x${ft.hitCount})` : ''}${isCrit ? '!' : ''}`;
        if (isCrit) ft.color = '#fde047';
        return;
      }
    }
    if (this.floatingTexts.length > 36) {
      this.floatingTexts.shift();
    }
    this.floatingTexts.push({
      enemyId: enemy.id,
      prefix,
      accumAmount: amount,
      hitCount: 1,
      x: enemy.x + (Math.random() - 0.5) * 10,
      y: enemy.y - enemy.radius - 6,
      text: `${prefix}${amount}${isCrit ? '!' : ''}`,
      color,
      isReaction: false,
      vy: -32,
      life: 0.68,
      maxLife: 0.68
    });
  }

  _triggerScreenShake(magnitude, duration) {
    if (this.reducedMotion) return;
    this.shakeMagnitude = Math.max(this.shakeMagnitude, magnitude);
    this.shakeTime = Math.max(this.shakeTime, duration);
  }

  _spawnShockwave(x, y, maxRadius, color) {
    this.shockwaves.push({ x, y, maxRadius, color, elapsed: 0, duration: 0.32 });
  }

  _spawnBurst(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 45 + Math.random() * 145;
      this.particles.push({
        x, y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        size: 2 + Math.random() * 3,
        color,
        life: 0.28 + Math.random() * 0.25,
        maxLife: 0.53
      });
    }
  }

  _spawnFloatingText(x, y, text, color, isReaction = false) {
    if (this.floatingTexts.length > 42) {
      this.floatingTexts.shift();
    }
    this.floatingTexts.push({
      x, y, text, color, isReaction,
      vy: isReaction ? -40 : -32,
      life: isReaction ? 0.95 : 0.72,
      maxLife: isReaction ? 0.95 : 0.72
    });
  }

  _lerpAngle(a, b, t) {
    let diff = b - a;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;
    return a + diff * t;
  }

  _updateHUD() {
    const { AUGMENT_INTERVAL } = window.AetherBastion.CONFIG;
    const stage = this.getCurrentStage();

    document.getElementById('hudWave').textContent = this.gameMode === 'CAMPAIGN'
      ? `${this.wave}/${stage.finalWave}`
      : `${this.wave}`;

    const modeBadge = document.getElementById('hudModeBadge');
    if (modeBadge) {
      modeBadge.textContent = this.gameMode === 'CAMPAIGN' ? `${stage.code}` : `무한 [${this.seedText}]`;
    }

    const status = this.gameSpeed === 0
      ? (this.tabPauseNotice ? '탭 전환 일시정지' : '일시정지')
      : (this.waveActive ? '전투 진행 중' : '정비 대기');
    document.getElementById('hudWaveStatus').textContent = status;
    document.getElementById('hudEnemyCount').textContent = this.waveActive
      ? `남은 적 ${this.enemies.length + this.spawnQueue.length}`
      : '';
    document.getElementById('hudAether').textContent = this.aether.toLocaleString();
    document.getElementById('hudScore').textContent = this.score.toLocaleString();
    document.getElementById('hudBestScore').textContent = `최고 ${this.bestScore.toLocaleString()}`;

    const rem = AUGMENT_INTERVAL - ((this.wave - 1) % AUGMENT_INTERVAL);
    const nextAugLabel = document.getElementById('hudNextAugmentLabel');
    if (nextAugLabel) {
      nextAugLabel.textContent = rem === 1 ? '이번 클리어 시 증강!' : `증강까지 ${rem}W`;
    }

    const repairCost = this.getCoreRepairCost();
    const resetCost = this.getTacticalResetCost();
    const overdriveCost = this.getOverdriveCost();
    const btnRepair = document.getElementById('btnBuyCoreRepair');
    const btnReset = document.getElementById('btnBuyCooldownReset');
    const btnOverdrive = document.getElementById('btnSkillOverdrive');
    if (btnRepair) {
      document.getElementById('costCoreRepair').textContent = `${repairCost} ⚡`;
      btnRepair.disabled = this.aether < repairCost;
    }
    if (btnReset) {
      document.getElementById('costCooldownReset').textContent = `${resetCost} ⚡`;
      btnReset.disabled = this.aether < resetCost || (this.orbitalCd <= 0 && this.chronoCd <= 0 && this.overdriveCd <= 0);
    }
    if (btnOverdrive) {
      document.getElementById('costSkillOverdrive').textContent = this.overdriveTimer > 0
        ? `과부하 중 (${this.overdriveTimer.toFixed(1)}s)`
        : `${overdriveCost} ⚡`;
      btnOverdrive.disabled = this.overdriveCd <= 0 && this.aether < overdriveCost;
    }

    if (this.comboCount > 0) {
      const badge = document.getElementById('hudComboBadge');
      badge.classList.remove('hidden');
      badge.classList.add('flex');
      const bonusPct = Math.round(this.getComboDamageBonus() * 100);
      document.getElementById('hudComboCount').textContent = `연속 반응 ${this.comboCount}회 (+${bonusPct}%)`;
      const pct = Math.max(0, (this.comboTimer / this.comboMaxDuration) * 100);
      document.getElementById('hudComboTimerBar').style.width = `${pct}%`;
    }

    document.getElementById('hudHpText').textContent = `${this.coreHp}/${this.maxCoreHp}`;
    const hpPct = Math.max(0, (this.coreHp / this.maxCoreHp) * 100);
    document.getElementById('hudHpBar').style.width = `${hpPct}%`;

    const activeBosses = this.enemies.filter(e => e.isBoss).length + this.spawnQueue.filter(q => q.type === 'TITAN').length;
    const bossThreatDmg = Math.max(6, activeBosses * 6);
    const corePanel = document.getElementById('coreStatusPanel');
    const bossWarn = document.getElementById('hudCoreBossWarning');
    if (corePanel && bossWarn) {
      const lethalRisk = this.coreHp <= bossThreatDmg;
      bossWarn.classList.toggle('hidden', !lethalRisk);
      if (lethalRisk) {
        bossWarn.textContent = activeBosses >= 2
          ? `⚠️ 다중 타이탄(${activeBosses}기) 돌파 위험!`
          : `⚠️ 타이탄(6 DMG) 돌파 시 즉시 붕괴!`;
      }
      corePanel.style.borderColor = lethalRisk ? 'rgba(244, 63, 94, 0.85)' : 'rgba(168, 138, 82, 0.34)';
    }

    const orbCdEl = document.getElementById('cdOverlayOrbital');
    if (this.orbitalCd > 0) {
      orbCdEl.classList.remove('hidden');
      orbCdEl.classList.add('flex');
      orbCdEl.textContent = `${Math.ceil(this.orbitalCd)}s`;
    } else {
      orbCdEl.classList.add('hidden');
      orbCdEl.classList.remove('flex');
    }

    const chrCdEl = document.getElementById('cdOverlayChrono');
    if (this.chronoCd > 0) {
      chrCdEl.classList.remove('hidden');
      chrCdEl.classList.add('flex');
      chrCdEl.textContent = `${Math.ceil(this.chronoCd)}s`;
    } else {
      chrCdEl.classList.add('hidden');
      chrCdEl.classList.remove('flex');
    }

    const ovCdEl = document.getElementById('cdOverlayOverdrive');
    if (this.overdriveCd > 0) {
      ovCdEl.classList.remove('hidden');
      ovCdEl.classList.add('flex');
      ovCdEl.textContent = `${Math.ceil(this.overdriveCd)}s`;
    } else {
      ovCdEl.classList.add('hidden');
      ovCdEl.classList.remove('flex');
    }

    const btnNext = document.getElementById('btnNextWave');
    const btnLabel = document.getElementById('btnNextWaveLabel');
    if (this.waveActive) {
      btnNext.disabled = true;
      btnNext.classList.add('opacity-50', 'cursor-not-allowed');
      btnLabel.textContent = '전투 진행 중';
    } else {
      btnNext.disabled = false;
      btnNext.classList.remove('opacity-50', 'cursor-not-allowed');
      btnLabel.textContent = this.wave === 1 ? '1웨이브 시작' : '다음 웨이브';
    }

    if (this.selectedTower && this.selectedTower.level < 4) {
      const cost = this.getTowerUpgradeCost(this.selectedTower);
      if (this.selectedTower.level === 1 || this.selectedTower.level === 3) {
        document.getElementById('btnUpgradeTower').disabled = this.aether < cost;
      } else if (this.selectedTower.level === 2) {
        document.getElementById('btnSpecA').disabled = this.aether < cost;
        document.getElementById('btnSpecB').disabled = this.aether < cost;
      }
    }
  }

  _triggerCampaignVictory() {
    this.victory = true;
    this._cancelSkillTargeting();
    this.audio.playWaveClear();
    this._closeInspector();
    document.getElementById('augmentModal').classList.add('hidden');
    this.ui.updateTutorialGuide();

    const stage = this.getCurrentStage();
    const res = this.saveManager.recordStageClear(stage.id, stage.order, this.score, this.coreHp, this.maxCoreHp);
    const starsStr = '★'.repeat(res.stars) + '☆'.repeat(3 - res.stars);

    const badge = document.getElementById('endModalBadge');
    badge.textContent = `${stage.code} VICTORY // ${starsStr} (RANK ${res.rank})`;
    badge.className = 'inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-400/50 text-amber-300 text-xs font-bold tracking-wider mb-2';

    const title = document.getElementById('gameOverTitle');
    title.textContent = 'VICTORY!';
    title.className = 'font-crest text-3xl sm-text-4xl font-black text-gradient-crest tracking-wide';
    document.getElementById('endModalSubtitle').textContent = stage.order < 6
      ? `${stage.name} (${stage.finalWave}웨이브) 방어선을 완벽히 사수하고 제${stage.order + 1}전선이 해금되었습니다!`
      : `모든 캠페인 전선(STAGE I ~ VI)을 정복하고 에테르 왕국을 수호했습니다!`;

    document.getElementById('finalWave').textContent = `WAVE ${this.wave} (${starsStr})`;
    document.getElementById('finalScore').textContent = this.score.toLocaleString();
    document.getElementById('finalKills').textContent = `${this.kills}기 / ${this.reactionsTriggered}회`;
    document.getElementById('finalBestScore').textContent = this.bestScore.toLocaleString();

    this.ui.renderBattleReport('endBattleReport');
    document.getElementById('gameOverModal').classList.remove('hidden');
  }

  _triggerGameOver() {
    this.gameOver = true;
    this._cancelSkillTargeting();
    this.audio.playGameOver();
    this._closeInspector();
    document.getElementById('augmentModal').classList.add('hidden');
    this.ui.updateTutorialGuide();

    const badge = document.getElementById('endModalBadge');
    badge.textContent = 'DEFEAT // 성채 방어선 붕괴';
    badge.className = 'inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/20 border border-rose-400/40 text-rose-300 text-xs font-bold tracking-wider mb-2';

    const title = document.getElementById('gameOverTitle');
    title.textContent = 'DEFEAT';
    title.className = 'font-crest text-3xl sm-text-4xl font-black text-rose-300 tracking-wide';
    document.getElementById('endModalSubtitle').textContent = '에테르 바스티온 코어의 에너지가 완전히 소진되었습니다.';

    document.getElementById('finalWave').textContent = `WAVE ${this.wave}`;
    document.getElementById('finalScore').textContent = this.score.toLocaleString();
    document.getElementById('finalKills').textContent = `${this.kills}기 / ${this.reactionsTriggered}회`;
    document.getElementById('finalBestScore').textContent = this.bestScore.toLocaleString();

    this.ui.renderBattleReport('endBattleReport');
    document.getElementById('gameOverModal').classList.remove('hidden');
  }
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', () => {
    window.game = new AetherBastionGame();
  });
} else {
  window.game = new AetherBastionGame();
}
