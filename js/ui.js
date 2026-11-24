window.AetherBastion = window.AetherBastion || {};

/**
 * V9 Kingdom Rush Campaign World Map, LoL ARAM Sequential Augment Cards & Tutorial UI Controller
 */
class AetherUIController {
  constructor(game) {
    this.game = game;
    this.selectedStageId = 'STAGE_1';
    this.hoveredStageId = null;
    this.selectedMode = 'CAMPAIGN';
    this.saveModalReturnToMenu = false;
    this.worldMapCanvas = null;
    this.worldMapAnimId = null;
    this.dealTimers = [];
  }

  bindNavigation() {
    const g = this.game;
    this.worldMapCanvas = document.getElementById('worldMapCanvas');

    document.getElementById('btnMenuCampaign').addEventListener('click', () => {
      g.audio.unlock();
      g.audio.playUiClick();
      this.selectedMode = 'CAMPAIGN';
      this.openWorldMap();
    });

    document.getElementById('btnMenuEndless').addEventListener('click', () => {
      g.audio.unlock();
      g.audio.playUiClick();
      this.selectedMode = 'ENDLESS';
      this.openWorldMap();
    });

    document.getElementById('btnMenuLoad').addEventListener('click', () => {
      g.audio.unlock();
      g.audio.playUiClick();
      this.openSaveLoadModal(true);
    });

    document.getElementById('btnMenuCodex').addEventListener('click', () => {
      g.audio.unlock();
      g.audio.playUiClick();
      document.getElementById('helpModal').classList.remove('hidden');
    });

    if (this.worldMapCanvas) {
      const getMapCoords = (e) => {
        const rect = this.worldMapCanvas.getBoundingClientRect();
        return {
          x: ((e.clientX - rect.left) / rect.width) * 1280,
          y: ((e.clientY - rect.top) / rect.height) * 720
        };
      };

      this.worldMapCanvas.addEventListener('pointermove', (e) => {
        const { STAGES } = window.AetherBastion;
        const pt = getMapCoords(e);
        let found = null;
        for (const st of Object.values(STAGES)) {
          if (Math.hypot(pt.x - st.worldPos.x, pt.y - st.worldPos.y) <= 42) {
            found = st.id;
            break;
          }
        }
        this.hoveredStageId = found;
        this.worldMapCanvas.style.cursor = found ? 'pointer' : 'default';
      });

      this.worldMapCanvas.addEventListener('pointerdown', (e) => {
        const { STAGES } = window.AetherBastion;
        const prog = g.saveManager.loadProgression();
        const pt = getMapCoords(e);
        for (const st of Object.values(STAGES)) {
          if (Math.hypot(pt.x - st.worldPos.x, pt.y - st.worldPos.y) <= 42) {
            const unlocked = this.selectedMode === 'ENDLESS' || st.order <= prog.unlockedStageOrder;
            if (unlocked) {
              g.audio.unlock();
              g.audio.playUiClick();
              this.selectedStageId = st.id;
              this._refreshStageBriefingPanel();
            } else {
              g.audio.unlock();
              g.audio.playError();
            }
            break;
          }
        }
      });
    }

    document.getElementById('btnStageBackToMenu').addEventListener('click', () => {
      g.audio.unlock();
      g.audio.playUiClick();
      this.closeWorldMap();
      this.openMainMenu();
    });

    document.getElementById('btnStageRandomSeed').addEventListener('click', () => {
      g.audio.unlock();
      g.audio.playUiClick();
      const code = `AB-${Math.floor(1000 + Math.random() * 9000)}`;
      document.getElementById('stageSeedInput').value = code;
    });

    document.getElementById('btnDeployStage').addEventListener('click', () => {
      g.audio.unlock();
      g.audio.playPlace();
      const rawSeed = (document.getElementById('stageSeedInput').value || '').trim();
      g.seedText = rawSeed || 'AETHER-2026';
      g.gameMode = this.selectedMode;
      this.closeWorldMap();
      document.getElementById('mainMenuOverlay').classList.add('hidden');
      g.startNewSession(this.selectedStageId);
    });

    document.getElementById('btnOpenSaveLoad').addEventListener('click', () => {
      g.audio.unlock();
      g.audio.playUiClick();
      this.openSaveLoadModal(false);
    });

    document.getElementById('btnBackToMainMenu').addEventListener('click', () => {
      g.audio.unlock();
      g.audio.playUiClick();
      g._pauseForOverlay();
      if (g.started && !g.gameOver && !g.victory) {
        const snap = g.saveManager.createSnapshotFromGame(g, `[자동] ${g.getCurrentStage().name} · W${g.wave}`);
        g.saveManager.saveToSlot('autosave', snap);
      }
      g._closeInspector();
      document.getElementById('gameOverModal').classList.add('hidden');
      this.openMainMenu();
    });

    document.getElementById('btnCloseSaveModal').addEventListener('click', () => {
      g.audio.playUiClick();
      this.closeSaveLoadModal();
    });

    document.getElementById('btnExportSaveFile').addEventListener('click', () => {
      g.audio.unlock();
      if (!g.started) {
        g.audio.playError();
        this._setSaveFeedback('진행 중인 작전이 없어 내보낼 데이터가 없습니다.', true);
        return;
      }
      const snap = g.saveManager.createSnapshotFromGame(g);
      g.saveManager.exportSnapshotToFile(snap);
      g.audio.playSaveConfirm();
      this._setSaveFeedback('현재 작전 상태가 JSON 파일로 다운로드되었습니다.', false);
    });

    const fileInput = document.getElementById('importSaveFileInput');
    document.getElementById('btnImportSaveFile').addEventListener('click', () => {
      g.audio.unlock();
      g.audio.playUiClick();
      fileInput.click();
    });

    fileInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const parsed = JSON.parse(String(ev.target.result || '{}'));
          if (!parsed || !parsed.stageId || !parsed.wave) {
            throw new Error('Invalid save format');
          }
          g.loadFromSnapshot(parsed);
          g.audio.playSaveConfirm();
          this.closeSaveLoadModal(true);
        } catch (_) {
          g.audio.playError();
          this._setSaveFeedback('올바르지 않은 세이브 JSON 파일입니다.', true);
        } finally {
          fileInput.value = '';
        }
      };
      reader.readAsText(file);
    });
  }

  /**
   * Renders LoL ARAM-style Sequential "따다닥!" 3-Card Augment Draft with Staggered Deal Animations & SFX
   */
  renderAnimatedAugmentCards(cards, augmentStacks, onSelectCallback) {
    this.dealTimers.forEach(t => clearTimeout(t));
    this.dealTimers = [];

    const container = document.getElementById('augmentCardsContainer');
    container.innerHTML = '';

    cards.forEach((card, index) => {
      const curStack = augmentStacks[card.id] || 0;
      const stackLabel = card.maxStacks < 50 ? ` (${curStack}/${card.maxStacks})` : '';
      const el = document.createElement('button');
      el.className = `augment-card augment-card-deal rarity-${card.rarity} rounded-2xl p-5 border-2 text-left flex flex-col justify-between cursor-pointer`;
      el.style.animationDelay = `${index * 150}ms`;

      const rarityColor = card.rarity === 'LEGENDARY'
        ? 'text-amber-300'
        : (card.rarity === 'RARE' ? 'text-violet-300' : 'text-cyan-300');

      el.innerHTML = `
        <div>
          <div class="flex items-center justify-between mb-2-5">
            <span class="text-3xl">${card.icon}</span>
            <span class="text-10 font-orbitron font-extrabold px-2-5 py-0-5 rounded-full bg-slate-950/80 border border-white/10 ${rarityColor}">${card.rarityLabel}${stackLabel}</span>
          </div>
          <h3 class="font-extrabold text-base text-white mb-2">${card.name}</h3>
          <p class="text-xs text-slate-300 leading-relaxed">${card.desc}</p>
        </div>
        <div class="mt-5 pt-2-5 border-t border-white/10 text-11 font-orbitron font-bold ${rarityColor} flex items-center justify-between">
          <span>SLOT 0${index + 1}</span>
          <span>증강 선택 →</span>
        </div>
      `;

      el.addEventListener('click', () => onSelectCallback(card));
      container.appendChild(el);

      // Trigger sequential card deal audio cue ("따 - 다 - 닥!")
      const timerId = setTimeout(() => {
        this.game.audio.playCardDeal(index);
      }, index * 150);
      this.dealTimers.push(timerId);
    });
  }

  updateTutorialGuide() {
    const g = this.game;
    const box = document.getElementById('tutorialGuideBanner');
    const titleEl = document.getElementById('tutStepTitle');
    const descEl = document.getElementById('tutStepDesc');
    if (!box || !titleEl || !descEl) return;

    const stage = g.getCurrentStage();
    if (!g.started || !stage.isTutorial || g.gameOver || g.victory) {
      box.classList.add('hidden');
      return;
    }

    box.classList.remove('hidden');
    const hasTower = g.towers.length > 0;
    const hasUpgraded = g.towers.some(t => t.level >= 2);
    const hasCryo = g.towers.some(t => t.type === 'CRYO');

    if (!hasTower) {
      titleEl.textContent = '🎓 훈련 1단계: 요새 거점에 포탑 건설';
      descEl.textContent = '하단에서 [1] 중기관포 벙커를 선택한 뒤, 도로 옆 원형 석조 거점(망치 아이콘)을 클릭해 배치하세요!';
    } else if (!g.waveActive && g.wave === 1) {
      titleEl.textContent = '🎓 훈련 2단계: 전투 개시';
      descEl.textContent = '포탑 배치가 완료되었습니다! 우측 하단 [1웨이브 시작 ▶] 버튼이나 Space 키를 눌러 첫 공세를 막아내세요.';
    } else if (!hasUpgraded && g.aether >= 75) {
      titleEl.textContent = '🎓 훈련 3단계: 포탑 레벨업 강화';
      descEl.textContent = '배치한 포탑을 클릭하면 우측 정보창이 열립니다. [Lv.2 강화]를 눌러 화력과 외형을 업그레이드하세요!';
    } else if (!hasCryo && g.wave >= 2) {
      titleEl.textContent = '🎓 훈련 4단계: 원소 시너지 조합';
      descEl.textContent = '[2] 빙결 냉각탑과 [3] 테슬라 또는 [4] 중박격포를 함께 배치하면 [초전도]·[열충격 파쇄] 폭발이 발동합니다!';
    } else if (g.wave >= 4 && g.wave < 6) {
      titleEl.textContent = '🎓 훈련 5단계: 협곡 우회로 방어 & 증강 활용';
      descEl.textContent = '남서쪽 협곡 우회로에서도 괴수가 진입합니다! 3웨이브마다 획득한 전술 증강과 [Q] 궤도 폭격을 활용하세요.';
    } else if (g.wave === 6) {
      titleEl.textContent = '🎓 최종 훈련 (6W): 공성 타이탄 보스 격퇴';
      descEl.textContent = '마지막 6웨이브에 거신 보스가 출현합니다! 모든 화력을 집중해 보스를 격파하고 제2전선을 해금하세요!';
    } else {
      titleEl.textContent = `🎓 신병 훈련 작전 진행 중 (WAVE ${g.wave}/6)`;
      descEl.textContent = '괴수들을 저지하고 획득한 에테르로 거점 확장과 포탑 레벨업을 이어가십시오.';
    }
  }

  openMainMenu() {
    const g = this.game;
    g.started = false;
    this.updateTutorialGuide();
    const prog = g.saveManager.loadProgression();
    const slots = g.saveManager.loadAllSlots();
    const totalStars = Object.values(prog.stageClears).reduce((acc, c) => acc + (c && c.stars ? c.stars : 0), 0);
    const saveCount = Object.keys(slots).length;

    document.getElementById('menuBestScore').textContent = prog.globalBestScore.toLocaleString();
    document.getElementById('menuStageProgress').textContent = `★ ${totalStars} / 18 훈장`;
    document.getElementById('menuSaveCount').textContent = `${saveCount}개 슬롯 보관 중`;

    document.getElementById('mainMenuOverlay').classList.remove('hidden');
  }

  openWorldMap() {
    const isEndless = this.selectedMode === 'ENDLESS';
    document.getElementById('stageSelectModeBadge').textContent = isEndless
      ? 'ENDLESS SEED CAMPAIGN // 무한 시드 전장 지도'
      : 'KINGDOM CAMPAIGN MAP // 작전 지역 선택 (지도 위 깃발 클릭)';
    document.getElementById('stageSeedBar').classList.toggle('hidden', !isEndless);

    this._refreshStageBriefingPanel();
    document.getElementById('stageSelectOverlay').classList.remove('hidden');

    const renderLoop = () => {
      if (document.getElementById('stageSelectOverlay').classList.contains('hidden')) {
        this.worldMapAnimId = null;
        return;
      }
      const { STAGES, AetherEnvRenderer } = window.AetherBastion;
      const prog = this.game.saveManager.loadProgression();
      const effectiveProg = isEndless ? { ...prog, unlockedStageOrder: 6 } : prog;
      AetherEnvRenderer.renderCampaignWorldMap(
        this.worldMapCanvas,
        STAGES,
        effectiveProg,
        this.selectedStageId,
        this.hoveredStageId,
        this.game.time
      );
      this.worldMapAnimId = requestAnimationFrame(renderLoop);
    };
    if (!this.worldMapAnimId) {
      this.worldMapAnimId = requestAnimationFrame(renderLoop);
    }
  }

  closeWorldMap() {
    document.getElementById('stageSelectOverlay').classList.add('hidden');
    if (this.worldMapAnimId) {
      cancelAnimationFrame(this.worldMapAnimId);
      this.worldMapAnimId = null;
    }
  }

  _refreshStageBriefingPanel() {
    const { STAGES } = window.AetherBastion;
    const stage = STAGES[this.selectedStageId] || STAGES.STAGE_1;
    const prog = this.game.saveManager.loadProgression();
    const clearInfo = prog.stageClears[stage.id];
    const isEndless = this.selectedMode === 'ENDLESS';
    const laneCount = Object.keys(stage.routes).length;

    document.getElementById('briefingStageCode').textContent = `${stage.code} · ${stage.mapWidth}×${stage.mapHeight}`;
    document.getElementById('briefingStageName').textContent = stage.name;
    document.getElementById('briefingStageDiff').textContent = stage.difficulty;
    document.getElementById('briefingStageDiff').style.color = stage.difficultyColor;
    document.getElementById('briefingStageDesc').textContent = stage.desc;
    document.getElementById('briefingStageStats').innerHTML = `
      <span>목표 <strong class="font-orbitron text-amber-300">${isEndless ? '무한' : `${stage.finalWave}W`}</strong></span>
      <span>길목 <strong class="font-orbitron text-rose-300">${laneCount}갈래</strong></span>
      <span>거점 <strong class="font-orbitron text-cyan-300">${stage.buildPads.length}개</strong></span>
      <span>초기 <strong class="font-orbitron text-emerald-300">${stage.startAether}⚡</strong></span>
    `;

    const stars = clearInfo ? (clearInfo.stars || 0) : 0;
    document.getElementById('briefingStageRank').textContent = clearInfo
      ? `최고 기록: ${'★'.repeat(stars)}${'☆'.repeat(3 - stars)} (RANK ${clearInfo.rank} · ${clearInfo.bestScore.toLocaleString()}점)`
      : (stage.isTutorial ? '신병 튜토리얼 구역 · 클리어 시 제2전선 해금' : '미정복 전장 · 첫 승리 시 다음 전선 해금');
  }

  openSaveLoadModal(fromMainMenu = false) {
    this.saveModalReturnToMenu = fromMainMenu;
    if (!fromMainMenu) {
      this.game._pauseForOverlay();
    }
    this._setSaveFeedback('', false);
    this.renderSaveSlots();
    document.getElementById('saveLoadModal').classList.remove('hidden');
  }

  closeSaveLoadModal(skipResume = false) {
    document.getElementById('saveLoadModal').classList.add('hidden');
    if (!this.saveModalReturnToMenu && !skipResume) {
      this.game._resumeFromOverlay();
    }
  }

  _setSaveFeedback(msg, isError) {
    const el = document.getElementById('saveModalFeedback');
    if (!el) return;
    if (!msg) {
      el.classList.add('hidden');
      return;
    }
    el.textContent = msg;
    el.className = isError
      ? 'mb-3 rounded-xl px-3 py-2 text-xs font-bold bg-rose-950/90 border border-rose-400/50 text-rose-200'
      : 'mb-3 rounded-xl px-3 py-2 text-xs font-bold bg-emerald-500/20 border border-emerald-400/50 text-emerald-200';
    el.classList.remove('hidden');
  }

  renderSaveSlots() {
    const g = this.game;
    const slots = g.saveManager.loadAllSlots();
    const container = document.getElementById('saveSlotsContainer');
    container.innerHTML = '';

    const slotDefs = [
      { id: 'autosave', title: 'AUTO CHECKPOINT // 자동 백업 슬롯', allowManualSave: false },
      { id: 'slot_1', title: 'TACTICAL SLOT 01 // 전술 기록 1', allowManualSave: true },
      { id: 'slot_2', title: 'TACTICAL SLOT 02 // 전술 기록 2', allowManualSave: true },
      { id: 'slot_3', title: 'TACTICAL SLOT 03 // 전술 기록 3', allowManualSave: true }
    ];

    const canSaveCurrent = g.started && !g.gameOver && !g.victory;

    slotDefs.forEach(def => {
      const data = slots[def.id];
      const row = document.createElement('div');
      row.className = 'bg-slate-900/85 border border-slate-700/80 rounded-2xl p-3-5 flex flex-wrap items-center justify-between gap-3';

      if (data) {
        const towerCount = Array.isArray(data.towers) ? data.towers.length : 0;
        const augCount = Array.isArray(data.activeAugmentIds) ? data.activeAugmentIds.length : 0;
        row.innerHTML = `
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <span class="font-orbitron text-10 font-bold text-amber-300">${def.title}</span>
              <span class="text-10 text-slate-400">${data.timestamp || ''}</span>
            </div>
            <div class="font-bold text-sm text-white mt-0-5">${data.label || data.stageName}</div>
            <div class="text-11 text-slate-300 mt-0-5 flex flex-wrap gap-2">
              <span class="text-cyan-300 font-orbitron">WAVE ${data.wave}/${data.finalWave || 16}</span>
              <span class="text-amber-300 font-orbitron">에테르 ${Number(data.aether || 0).toLocaleString()}⚡</span>
              <span class="text-rose-300 font-orbitron">코어 ${data.coreHp}/${data.maxCoreHp}♥</span>
              <span class="text-slate-400">포탑 ${towerCount}기 · 증강 ${augCount}개</span>
            </div>
          </div>
          <div class="flex items-center gap-1-5 shrink-0">
            ${def.allowManualSave ? `<button data-action="save" class="px-3 py-1-5 rounded-xl bg-cyan-500/20 hover-bg-cyan-500/30 border border-cyan-400/50 text-xs font-bold text-cyan-200 cursor-pointer ${canSaveCurrent ? '' : 'disabled-opacity-40'}" ${canSaveCurrent ? '' : 'disabled'}>덮어쓰기</button>` : ''}
            <button data-action="load" class="px-3 py-1-5 rounded-xl bg-emerald-500/20 hover-bg-emerald-500/30 border border-emerald-400/50 text-xs font-bold text-emerald-200 cursor-pointer">불러오기</button>
            <button data-action="delete" class="px-2-5 py-1-5 rounded-xl bg-rose-500/15 hover-bg-rose-500/25 border border-rose-400/35 text-xs font-bold text-rose-300 cursor-pointer" title="슬롯 삭제">✕</button>
          </div>
        `;
      } else {
        row.innerHTML = `
          <div class="min-w-0 flex-1">
            <div class="font-orbitron text-10 font-bold text-slate-400">${def.title}</div>
            <div class="text-xs text-slate-400 mt-1">[ 비어 있는 전술 슬롯 ]</div>
          </div>
          <div class="flex items-center gap-1-5 shrink-0">
            ${def.allowManualSave
              ? `<button data-action="save" class="px-3-5 py-1-5 rounded-xl bg-cyan-500/20 hover-bg-cyan-500/30 border border-cyan-400/50 text-xs font-bold text-cyan-200 cursor-pointer ${canSaveCurrent ? '' : 'disabled-opacity-40'}" ${canSaveCurrent ? '' : 'disabled'}>현재 작전 저장</button>`
              : `<span class="text-10 text-slate-400">웨이브 클리어 시 자동 기록</span>`}
          </div>
        `;
      }

      const saveBtn = row.querySelector('[data-action="save"]');
      if (saveBtn) {
        saveBtn.addEventListener('click', () => {
          g.audio.unlock();
          if (!canSaveCurrent) return;
          const snap = g.saveManager.createSnapshotFromGame(g);
          g.saveManager.saveToSlot(def.id, snap);
          g.audio.playSaveConfirm();
          this._setSaveFeedback(`${def.title}에 작전 상태를 저장했습니다.`, false);
          this.renderSaveSlots();
        });
      }

      const loadBtn = row.querySelector('[data-action="load"]');
      if (loadBtn && data) {
        loadBtn.addEventListener('click', () => {
          g.audio.unlock();
          g.loadFromSnapshot(data);
          g.audio.playSaveConfirm();
          this.closeSaveLoadModal(true);
        });
      }

      const delBtn = row.querySelector('[data-action="delete"]');
      if (delBtn) {
        delBtn.addEventListener('click', () => {
          g.audio.unlock();
          g.audio.playSell();
          g.saveManager.deleteSlot(def.id);
          this._setSaveFeedback('선택한 저장 슬롯을 초기화했습니다.', false);
          this.renderSaveSlots();
        });
      }

      container.appendChild(row);
    });
  }

  renderBattleReport(targetElementId) {
    const g = this.game;
    const el = document.getElementById(targetElementId);
    if (!el) return;

    const { TOWER_DEFS, ROUTE_LABELS } = window.AetherBastion;
    const stage = g.getCurrentStage();
    const totalDirectDamage = g.towerRosterHistory.reduce((acc, t) => acc + (t.damageDealt || 0), 0);
    const totalSynergyDamage = Object.values(g.reactionDamageTotals).reduce((a, b) => a + b, 0);
    const grandTotalDamage = totalDirectDamage + totalSynergyDamage;
    const directPct = grandTotalDamage > 0 ? ((totalDirectDamage / grandTotalDamage) * 100).toFixed(1) : '0.0';
    const synergyPct = grandTotalDamage > 0 ? ((totalSynergyDamage / grandTotalDamage) * 100).toFixed(1) : '0.0';

    const grouped = {};
    for (const t of g.towerRosterHistory) {
      const key = t.type;
      if (!grouped[key]) {
        const def = TOWER_DEFS[key];
        grouped[key] = {
          type: key,
          name: def.name,
          color: def.color,
          count: 0,
          activeCount: 0,
          invested: 0,
          directDamage: 0,
          synergyDamage: 0,
          kills: 0,
          maxLv: 1
        };
      }
      const grp = grouped[key];
      grp.count += 1;
      if (!t.sold) grp.activeCount += 1;
      grp.invested += t.totalInvested;
      grp.directDamage += (t.damageDealt || 0);
      grp.synergyDamage += (t.synergyDamageDealt || 0);
      grp.kills += (t.kills || 0);
      grp.maxLv = Math.max(grp.maxLv, t.level);
    }

    const sortedGroups = Object.values(grouped).sort((a, b) => (b.directDamage + b.synergyDamage) - (a.directDamage + a.synergyDamage));

    const towerRows = sortedGroups.length === 0
      ? '<div class="text-slate-400 text-center py-4 text-xs">건설된 포탑 데이터가 없습니다.</div>'
      : sortedGroups.map((grp, idx) => {
          const dir = Math.round(grp.directDamage);
          const syn = Math.round(grp.synergyDamage);
          const combined = dir + syn;
          const share = grandTotalDamage > 0 ? ((combined / grandTotalDamage) * 100).toFixed(1) : '0.0';
          const dirWidth = combined > 0 ? ((dir / combined) * 100).toFixed(1) : '0';
          const synWidth = combined > 0 ? ((syn / combined) * 100).toFixed(1) : '0';
          const eff = grp.invested > 0 ? (combined / grp.invested).toFixed(1) : '0.0';
          return `
            <div class="bg-slate-900/85 border border-slate-800 rounded-xl px-3 py-2-5 text-xs">
              <div class="flex items-center justify-between gap-2">
                <div class="min-w-0">
                  <div class="font-bold text-white" style="color:${grp.color}">#${idx + 1} ${grp.name} <span class="text-slate-300 text-10">(가동 ${grp.activeCount}/${grp.count}기 · 최고 Lv.${grp.maxLv})</span></div>
                  <div class="text-10 text-slate-300 mt-0-5">
                    <span class="text-cyan-300 font-semibold">직접 ${dir.toLocaleString()}</span> ·
                    <span class="text-fuchsia-300 font-semibold">시너지 ${syn.toLocaleString()}</span> ·
                    격파 ${grp.kills}기
                  </div>
                </div>
                <div class="text-right font-orbitron shrink-0">
                  <div class="font-bold text-amber-300">${combined.toLocaleString()}</div>
                  <div class="text-10 text-emerald-300">비중 ${share}% · ${eff} dmg/⚡</div>
                </div>
              </div>
              <div class="w-full h-1-5 bg-slate-950 rounded-full overflow-hidden mt-1-5 flex">
                <div class="h-full" style="width:${dirWidth}%; background:#22d3ee" title="직접 피해"></div>
                <div class="h-full" style="width:${synWidth}%; background:#e879f9" title="시너지 피해"></div>
              </div>
            </div>
          `;
        }).join('');

    const activeStageRouteKeys = Object.keys(stage.routes);
    const routeAuditRows = activeStageRouteKeys.map(rKey => {
      const stat = g.routeMetrics[rKey] || { spawned: 0, coreLost: 0 };
      const label = ROUTE_LABELS[rKey] || rKey;
      const breached = stat.coreLost > 0;
      return `
        <div class="flex items-center justify-between text-11 bg-slate-950/75 rounded-lg px-2-5 py-1-5 border ${breached ? 'border-rose-500/40' : 'border-slate-800/80'}">
          <span class="font-semibold text-slate-200">${label}</span>
          <span class="font-orbitron text-slate-400">침투 ${stat.spawned}기</span>
          <span class="font-orbitron font-bold ${breached ? 'text-rose-400' : 'text-emerald-400'}">${breached ? `코어 피해 -${stat.coreLost}` : '완벽 차단'}</span>
        </div>
      `;
    }).join('');

    const bossRows = g.bossTelemetry.length === 0
      ? '<div class="text-slate-400 text-center py-2 text-11">아직 출현한 공성 타이탄 기록이 없습니다.</div>'
      : g.bossTelemetry.slice(-5).reverse().map(b => {
          const endT = b.endTime !== null ? b.endTime : g.time;
          const surv = (endT - b.spawnTime).toFixed(1);
          const shatterPct = b.maxHp > 0 ? ((b.shatterDamage / b.maxHp) * 100).toFixed(1) : '0.0';
          const routeLabel = ROUTE_LABELS[b.route] || b.route;
          return `
            <div class="flex items-center justify-between text-11 bg-slate-950/75 rounded-lg px-2-5 py-1-5 border border-rose-900/40">
              <span class="font-bold text-rose-300">W${b.wave} (${routeLabel})</span>
              <span class="text-slate-300">생존 ${surv}s · 파쇄 ${b.shatterProcs}회(${shatterPct}%)</span>
              <span class="${b.breached ? 'text-rose-400 font-bold' : 'text-emerald-400'}">${b.breached ? '돌파!' : (b.endTime ? '격퇴' : '교전 중')}</span>
            </div>
          `;
        }).join('');

    const recentWaves = g.waveLogs.slice(-5).reverse();
    const waveRows = recentWaves.length === 0
      ? '<div class="text-slate-400 text-center py-2 text-11">완료된 웨이브 기록이 아직 없습니다.</div>'
      : recentWaves.map(w => `
          <div class="flex items-center justify-between text-11 bg-slate-950/70 rounded-lg px-2-5 py-1-5 border border-slate-800/80">
            <span class="font-orbitron font-bold text-cyan-300">WAVE ${w.wave}</span>
            <span class="text-amber-300">획득 +${w.aetherEarned}⚡</span>
            <span class="${w.coreDamageTaken > 0 ? 'text-rose-400 font-bold' : 'text-emerald-400'}">피해 -${w.coreDamageTaken} (잔여 ${w.coreHpEnd})</span>
          </div>
        `).join('');

    el.innerHTML = `
      <div class="grid grid-cols-2 sm-grid-cols-4 gap-2 mb-3 text-center">
        <div class="bg-slate-900/85 border border-slate-700/80 rounded-xl p-2">
          <div class="text-10 text-slate-400">총 획득 / 소비 에테르</div>
          <div class="font-orbitron text-xs font-bold text-cyan-300 mt-0-5">${g.totalAetherEarned.toLocaleString()} / ${g.totalAetherSpent.toLocaleString()}</div>
        </div>
        <div class="bg-slate-900/85 border border-slate-700/80 rounded-xl p-2">
          <div class="text-10 text-slate-400">직접 vs 시너지 피해 비율</div>
          <div class="font-orbitron text-xs font-bold text-white mt-0-5"><span class="text-cyan-300">${directPct}%</span> : <span class="text-fuchsia-300">${synergyPct}%</span></div>
        </div>
        <div class="bg-slate-900/85 border border-slate-700/80 rounded-xl p-2">
          <div class="text-10 text-slate-400">반응별 누적 (초전/파쇄/과부)</div>
          <div class="font-orbitron text-10 font-bold text-amber-300 mt-0-5">${Math.round(g.reactionDamageTotals.SUPERCONDUCT).toLocaleString()} / ${Math.round(g.reactionDamageTotals.SHATTER).toLocaleString()} / ${Math.round(g.reactionDamageTotals.OVERLOAD).toLocaleString()}</div>
        </div>
        <div class="bg-slate-900/85 border border-slate-700/80 rounded-xl p-2">
          <div class="text-10 text-slate-400">전장 규모 / 누적 피해</div>
          <div class="font-orbitron text-xs font-bold text-emerald-300 mt-0-5 truncate">${stage.mapWidth}×${stage.mapHeight} · ${Math.round(grandTotalDamage).toLocaleString()}</div>
        </div>
      </div>

      <div class="grid grid-cols-1 lg-grid-cols-2 gap-3">
        <div class="bg-slate-950/60 border border-slate-800 rounded-2xl p-3 flex flex-col justify-between">
          <div>
            <div class="flex items-center justify-between mb-2">
              <span class="text-xs font-bold text-cyan-200">⚔️ 포탑 계열별 직접·시너지 피해 및 효율</span>
              <span class="text-10 text-slate-400"><span class="text-cyan-300">■ 직접</span> / <span class="text-fuchsia-300">■ 시너지</span></span>
            </div>
            <div class="space-y-2 max-h-64 overflow-y-auto pr-1">${towerRows}</div>
          </div>
          <div class="mt-2-5 pt-2 border-t border-slate-800 flex justify-between text-11 text-slate-300">
            <span>직접 피해 합계: <strong class="font-orbitron text-cyan-300">${Math.round(totalDirectDamage).toLocaleString()}</strong></span>
            <span>시너지 피해 합계: <strong class="font-orbitron text-fuchsia-300">${Math.round(totalSynergyDamage).toLocaleString()}</strong> (${g.reactionsTriggered}회)</span>
          </div>
        </div>

        <div class="bg-slate-950/60 border border-slate-800 rounded-2xl p-3 space-y-2-5">
          <div>
            <div class="text-xs font-bold text-amber-200 mb-1">🛣️ 전선 경로별 침투 및 코어 돌파 감사</div>
            <div class="space-y-1">${routeAuditRows}</div>
          </div>

          <div>
            <div class="text-xs font-bold text-rose-200 mb-1">🛡️ 공성 타이탄(보스) 경로 및 열파쇄 로그</div>
            <div class="space-y-1 max-h-32 overflow-y-auto pr-1">${bossRows}</div>
          </div>

          <div>
            <div class="text-xs font-bold text-violet-200 mb-1">⚡ 최근 웨이브 자원 수급 및 코어 방어 로그</div>
            <div class="space-y-1 max-h-32 overflow-y-auto pr-1">${waveRows}</div>
          </div>
        </div>
      </div>
    `;
  }
}

window.AetherBastion.AetherUIController = AetherUIController;
