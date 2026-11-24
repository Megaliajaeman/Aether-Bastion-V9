window.AetherBastion = window.AetherBastion || {};

/**
 * V9 Realistic Military-Industrial Terrain, Winding Roads, Cratered Build Pads & 6-Stage World Map
 */
class AetherEnvRenderer {
  constructor(game) {
    this.game = game;
    this.bgLayer = null;
    this.cachedStageId = null;
    this.cachedBreachKey = '';
    this.props = [];
  }

  invalidateBackdrop() {
    this.bgLayer = null;
    this.cachedStageId = null;
  }

  _distToSeg(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const l2 = dx * dx + dy * dy;
    if (l2 === 0) return Math.hypot(px - x1, py - y1);
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / l2));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }

  _generateStageProps(stage) {
    const props = [];
    const W = stage.mapWidth || 1600;
    const H = stage.mapHeight || 900;
    let seed = stage.order * 9187 + 1337;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    const pads = stage.buildPads || [];

    const isClear = (x, y, minRoadDist, minPadDist) => {
      if (x < 45 || x > W - 45 || y < 85 || y > H - 65) return false;
      for (const pad of pads) {
        if (Math.hypot(x - pad.x, y - pad.y) < minPadDist) return false;
      }
      for (const rKey of Object.keys(stage.routes)) {
        const pts = stage.routes[rKey];
        for (let i = 0; i < pts.length - 1; i++) {
          const d = this._distToSeg(x, y, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
          if (d < minRoadDist) return false;
        }
      }
      return true;
    };

    const propCount = 65 + stage.order * 12;
    for (let i = 0; i < propCount; i++) {
      const x = 45 + rand() * (W - 90);
      const y = 90 + rand() * (H - 160);
      if (!isClear(x, y, 54, 56)) continue;
      const roll = rand();
      const kind = roll < 0.36 ? 'ROCK' : (roll < 0.70 ? 'FLORA' : (roll < 0.88 ? 'BUNKER_RUIN' : 'TRENCH'));
      props.push({
        x,
        y,
        kind,
        scale: 0.8 + rand() * 0.65,
        rot: rand() * Math.PI * 2
      });
    }
    return props;
  }

  traceSmoothRoad(ctx, pts, stopBeforeLast = false) {
    if (!pts || pts.length === 0) return;
    const limit = stopBeforeLast ? pts.length - 1 : pts.length;
    if (limit < 2) return;

    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    if (limit === 2) {
      ctx.lineTo(pts[1].x, pts[1].y);
      return;
    }

    for (let i = 1; i < limit - 1; i++) {
      const xc = (pts[i].x + pts[i + 1].x) * 0.5;
      const yc = (pts[i].y + pts[i + 1].y) * 0.5;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, xc, yc);
    }
    ctx.lineTo(pts[limit - 1].x, pts[limit - 1].y);
  }

  _ensureStaticBackdrop() {
    const stage = this.game.getCurrentStage();
    const breachSig = Array.from(this.game.openedBreachRoutes).sort().join(',');
    if (this.bgLayer && this.cachedStageId === stage.id && this.cachedBreachKey === breachSig) {
      return;
    }

    const W = stage.mapWidth || 1600;
    const H = stage.mapHeight || 900;
    const off = document.createElement('canvas');
    off.width = W;
    off.height = H;
    const octx = off.getContext('2d');
    const th = stage.theme;

    // 1. Gritty Realistic Topographic Terrain Base
    const grad = octx.createRadialGradient(W * 0.48, H * 0.48, 90, W * 0.5, H * 0.5, Math.max(W, H) * 0.68);
    grad.addColorStop(0, th.groundBase);
    grad.addColorStop(0.58, th.groundMid);
    grad.addColorStop(1, th.groundEdge);
    octx.fillStyle = grad;
    octx.fillRect(0, 0, W, H);

    // 2. Natural Elevation Contours & Soil Grain Patches
    let seed = stage.order * 4321;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < 34; i++) {
      const px = rand() * W;
      const py = rand() * H;
      const rx = 110 + rand() * 190;
      const ry = 65 + rand() * 115;
      octx.save();
      octx.translate(px, py);
      octx.rotate(rand() * Math.PI);
      octx.fillStyle = i % 2 === 0 ? 'rgba(255, 255, 255, 0.022)' : 'rgba(0, 0, 0, 0.16)';
      octx.beginPath();
      octx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      octx.fill();
      octx.restore();
    }

    // Subtle tactical survey grid lines (very faint for realistic scale reference)
    octx.strokeStyle = 'rgba(255, 255, 255, 0.025)';
    octx.lineWidth = 1;
    for (let gx = 120; gx < W; gx += 120) {
      octx.beginPath(); octx.moveTo(gx, 0); octx.lineTo(gx, H); octx.stroke();
    }
    for (let gy = 120; gy < H; gy += 120) {
      octx.beginPath(); octx.moveTo(0, gy); octx.lineTo(W, gy); octx.stroke();
    }

    // 3. Draw Realistic Weathered Military Gravel/Dirt Roads with Dual Tire Ruts
    const drawWindingRoad = (pts, isSecondary = false, isBreached = false) => {
      if (!pts || pts.length < 2) return;
      octx.save();
      octx.lineCap = 'round';
      octx.lineJoin = 'round';

      // Deep embankment drop shadow
      this.traceSmoothRoad(octx, pts);
      octx.lineWidth = isSecondary ? 56 : 64;
      octx.strokeStyle = 'rgba(0, 0, 0, 0.48)';
      octx.stroke();

      // Crushed rock shoulder curb
      this.traceSmoothRoad(octx, pts);
      octx.lineWidth = isSecondary ? 46 : 54;
      octx.strokeStyle = isBreached ? '#4c1d24' : th.roadBorder;
      octx.stroke();

      // Compacted dirt/asphalt roadbed
      this.traceSmoothRoad(octx, pts);
      octx.lineWidth = isSecondary ? 36 : 44;
      octx.strokeStyle = isBreached ? '#291519' : th.roadBed;
      octx.stroke();

      // Worn center gravel strip
      this.traceSmoothRoad(octx, pts);
      octx.lineWidth = isSecondary ? 18 : 24;
      octx.strokeStyle = isBreached ? '#3f1d24' : th.roadCenter;
      octx.stroke();

      // Gravel aggregate speckles & vehicle ruts
      this.traceSmoothRoad(octx, pts);
      octx.lineWidth = isSecondary ? 28 : 34;
      octx.strokeStyle = 'rgba(10, 12, 16, 0.22)';
      octx.setLineDash([3, 12]);
      octx.stroke();
      octx.restore();
    };

    if (stage.routes.BYPASS) drawWindingRoad(stage.routes.BYPASS, true, false);
    if (stage.routes.SUB_PORTAL) drawWindingRoad(stage.routes.SUB_PORTAL, true, false);
    if (stage.routes.CORE_TUNNEL && stage.initialRoutes.includes('CORE_TUNNEL')) {
      drawWindingRoad(stage.routes.CORE_TUNNEL, true, false);
    }
    if (stage.routes.EAST_BREACH && stage.initialRoutes.includes('EAST_BREACH')) {
      drawWindingRoad(stage.routes.EAST_BREACH, true, false);
    }
    for (const rKey of this.game.openedBreachRoutes) {
      if (stage.routes[rKey]) drawWindingRoad(stage.routes[rKey], true, true);
    }
    drawWindingRoad(stage.routes.MAIN, false, false);

    // 4. Environmental Props (Boulders, Pine Trees, Concrete Tank Traps, Trenches)
    this.props = this._generateStageProps(stage);
    for (const pr of this.props) {
      this._drawEnvProp(octx, pr, th);
    }

    // 5. Sealed Barricades on Future Breach Zones (Before Orbital Bombardment)
    for (const ev of (stage.breachEvents || [])) {
      if (!this.game.openedBreachRoutes.has(ev.routeKey) && ev.impactPoint) {
        this._drawSealedBarricade(octx, ev.impactPoint.x, ev.impactPoint.y);
      }
    }

    // Perimeter Frontier Border
    octx.strokeStyle = 'rgba(180, 138, 62, 0.25)';
    octx.lineWidth = 3;
    octx.strokeRect(1.5, 1.5, W - 3, H - 3);

    this.bgLayer = off;
    this.cachedStageId = stage.id;
    this.cachedBreachKey = breachSig;
  }

  _drawEnvProp(ctx, pr, th) {
    ctx.save();
    ctx.translate(pr.x, pr.y);
    ctx.scale(pr.scale, pr.scale);

    // Directional Ground Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.40)';
    ctx.beginPath();
    ctx.ellipse(4, 7, 17, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    if (pr.kind === 'ROCK') {
      ctx.fillStyle = th.rock;
      ctx.strokeStyle = '#181c24';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-15, 6);
      ctx.lineTo(-11, -11);
      ctx.lineTo(4, -15);
      ctx.lineTo(16, -4);
      ctx.lineTo(13, 9);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.11)';
      ctx.beginPath();
      ctx.moveTo(-11, -11);
      ctx.lineTo(4, -15);
      ctx.lineTo(0, -2);
      ctx.lineTo(-13, 2);
      ctx.closePath();
      ctx.fill();
    } else if (pr.kind === 'FLORA') {
      ctx.fillStyle = '#181512';
      ctx.fillRect(-2.5, 2, 5, 9);
      for (let tier = 0; tier < 3; tier++) {
        const yOff = -tier * 8;
        const w = 15 - tier * 3.5;
        ctx.fillStyle = tier === 2 ? '#435739' : th.foliage;
        ctx.strokeStyle = '#0d120c';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(0, yOff - 14);
        ctx.lineTo(-w, yOff + 4);
        ctx.lineTo(w, yOff + 4);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    } else if (pr.kind === 'TRENCH') {
      ctx.rotate(pr.rot);
      ctx.fillStyle = '#14171d';
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 1.4;
      ctx.fillRect(-16, -5, 32, 10);
      ctx.strokeRect(-16, -5, 32, 10);
    } else {
      // Concrete Czech Hedgehog / Ruined Bunker Block
      ctx.fillStyle = '#374151';
      ctx.strokeStyle = '#111827';
      ctx.lineWidth = 1.5;
      ctx.fillRect(-9, -11, 18, 17);
      ctx.strokeRect(-9, -11, 18, 17);
      ctx.fillStyle = 'rgba(217, 119, 6, 0.35)';
      ctx.fillRect(-5, -7, 10, 3);
    }

    ctx.restore();
  }

  _drawSealedBarricade(ctx, x, y) {
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = 'rgba(244, 63, 94, 0.45)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.arc(0, 0, 38, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#451a03';
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.8;
    for (let i = -1; i <= 1; i++) {
      ctx.save();
      ctx.translate(i * 15, (i % 2) * 5);
      ctx.rotate(i * 0.25);
      ctx.fillRect(-5, -14, 10, 28);
      ctx.strokeRect(-5, -14, 10, 28);
      ctx.restore();
    }
    ctx.restore();
  }

  renderBackdropAndRoads(ctx) {
    this._ensureStaticBackdrop();
    ctx.drawImage(this.bgLayer, 0, 0);

    const g = this.game;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.0;
    ctx.strokeStyle = 'rgba(254, 243, 199, 0.20)';
    ctx.setLineDash([10, 24]);
    ctx.lineDashOffset = -g.time * 36;
    this.traceSmoothRoad(ctx, g.paths.MAIN);
    ctx.stroke();

    if (g.wave >= 4 && g.paths.BYPASS) {
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.28)';
      this.traceSmoothRoad(ctx, g.paths.BYPASS, true);
      ctx.stroke();
    }
    if (g.wave >= 5 && g.paths.SUB_PORTAL) {
      ctx.strokeStyle = 'rgba(192, 132, 252, 0.30)';
      this.traceSmoothRoad(ctx, g.paths.SUB_PORTAL, true);
      ctx.stroke();
    }
    for (const rKey of g.openedBreachRoutes) {
      if (g.paths[rKey]) {
        ctx.strokeStyle = 'rgba(251, 113, 133, 0.48)';
        this.traceSmoothRoad(ctx, g.paths[rKey], true);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /**
   * Renders Fixed Tactical Build Pads AND Permanently Cratered/Destroyed Pads (Cannot build after breach!)
   */
  renderBuildPads(ctx) {
    const g = this.game;
    const stage = g.getCurrentStage();
    const { PAD_RADIUS } = window.AetherBastion.CONFIG;
    const occupiedPadIds = new Set(g.towers.map(t => t.padId));

    for (const pad of (stage.buildPads || [])) {
      const isDestroyed = g.destroyedPadIds.has(pad.id);
      const isOccupied = occupiedPadIds.has(pad.id);
      const isHovered = g.hoverPad && g.hoverPad.id === pad.id;

      ctx.save();
      ctx.translate(pad.x, pad.y);

      if (isDestroyed) {
        // Permanently Cratered / Shattered Pad (Strictly Unbuildable after Orbital Breach!)
        const craterGrad = ctx.createRadialGradient(0, 0, 4, 0, 0, PAD_RADIUS + 8);
        craterGrad.addColorStop(0, '#090a0d');
        craterGrad.addColorStop(0.65, '#29171a');
        craterGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = craterGrad;
        ctx.beginPath();
        ctx.arc(0, 0, PAD_RADIUS + 8, 0, Math.PI * 2);
        ctx.fill();

        // Jagged cracked concrete rim
        ctx.strokeStyle = isHovered ? '#fb7185' : 'rgba(244, 63, 94, 0.55)';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.arc(0, 0, PAD_RADIUS - 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        // Twisted rebar & red X mark
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.moveTo(-10, -10); ctx.lineTo(10, 10);
        ctx.moveTo(10, -10); ctx.lineTo(-10, 10);
        ctx.stroke();

        if (isHovered) {
          ctx.font = '800 10px "Malgun Gothic", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillStyle = '#020617';
          ctx.fillText('폭격 파괴 (설치 불가)', 1, -PAD_RADIUS - 7);
          ctx.fillStyle = '#fda4af';
          ctx.fillText('폭격 파괴 (설치 불가)', 0, -PAD_RADIUS - 8);
        }

        ctx.restore();
        continue;
      }

      // Intact Reinforced Concrete & Iron Turret Socket
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.beginPath();
      ctx.arc(2, 4, PAD_RADIUS + 2, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = isOccupied ? '#141820' : '#202630';
      ctx.strokeStyle = isHovered && !isOccupied ? '#fbbf24' : '#7a643b';
      ctx.lineWidth = isHovered && !isOccupied ? 3 : 2.2;
      ctx.beginPath();
      ctx.arc(0, 0, PAD_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = isOccupied ? 'rgba(148, 163, 184, 0.2)' : 'rgba(251, 191, 36, 0.30)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(0, 0, PAD_RADIUS - 6, 0, Math.PI * 2);
      ctx.stroke();

      if (!isOccupied) {
        ctx.fillStyle = isHovered ? 'rgba(251, 191, 36, 0.22)' : 'rgba(251, 191, 36, 0.08)';
        ctx.beginPath();
        ctx.arc(0, 0, PAD_RADIUS - 7, 0, Math.PI * 2);
        ctx.fill();

        // Construction Hammer Emblem
        ctx.save();
        ctx.rotate(-Math.PI / 4);
        ctx.fillStyle = isHovered ? '#fde68a' : '#b48a3e';
        ctx.fillRect(-2, -10, 4, 20);
        ctx.fillRect(-7, -11, 14, 5);
        ctx.restore();

        if (isHovered && g.started && !g.gameOver && !g.victory && !g.targetingSkill) {
          const def = window.AetherBastion.TOWER_DEFS[g.selectedBlueprint];
          const cost = g.getTowerBuildCost(def.id);
          const canAfford = g.aether >= cost;
          const previewRange = Math.round(def.range[0] * g.mods.rangeMult);

          ctx.beginPath();
          ctx.arc(0, 0, previewRange, 0, Math.PI * 2);
          ctx.fillStyle = canAfford ? 'rgba(56, 189, 248, 0.08)' : 'rgba(244, 63, 94, 0.08)';
          ctx.fill();
          ctx.setLineDash([7, 6]);
          ctx.lineWidth = 2;
          ctx.strokeStyle = canAfford ? 'rgba(56, 189, 248, 0.65)' : 'rgba(251, 113, 133, 0.65)';
          ctx.stroke();
        }
      }

      ctx.restore();
    }
  }

  renderPortalsAndCitadelCore(ctx) {
    const g = this.game;
    const entry = g.paths.MAIN[0];
    const bypassEntry = g.paths.BYPASS ? g.paths.BYPASS[0] : null;
    const subEntry = g.paths.SUB_PORTAL ? g.paths.SUB_PORTAL[0] : null;
    const eastEntry = g.paths.EAST_BREACH ? g.paths.EAST_BREACH[0] : null;
    const tunnelEntry = g.paths.CORE_TUNNEL ? g.paths.CORE_TUNNEL[0] : null;
    const core = g.paths.MAIN[g.paths.MAIN.length - 1];

    const drawBannerGate = (pos, active, color, label, offsetY) => {
      if (!pos) return;
      ctx.save();
      ctx.translate(pos.x, pos.y);
      ctx.fillStyle = '#111622';
      ctx.strokeStyle = active ? color : '#475569';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, active ? 22 : 17, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      if (active) {
        const pulse = 1 + Math.sin(g.time * 4) * 0.14;
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.35;
        ctx.beginPath();
        ctx.arc(0, 0, 26 * pulse, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      ctx.fillStyle = active ? color : '#64748b';
      ctx.beginPath();
      ctx.moveTo(8, 0);
      ctx.lineTo(-6, -7);
      ctx.lineTo(-3, 0);
      ctx.lineTo(-6, 7);
      ctx.closePath();
      ctx.fill();

      ctx.font = '700 10px "Malgun Gothic", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#020617';
      ctx.fillText(label, 1, offsetY + 1);
      ctx.fillStyle = active ? color : '#94a3b8';
      ctx.fillText(label, 0, offsetY);
      ctx.restore();
    };

    drawBannerGate(entry, true, '#38bdf8', '주 침공로', 32);
    if (bypassEntry) drawBannerGate(bypassEntry, g.wave >= 4, '#fbbf24', g.wave >= 4 ? '협곡 우회로' : '우회로(4W)', -26);
    if (subEntry) drawBannerGate(subEntry, g.wave >= 5, '#c084fc', g.wave >= 5 ? '북부 균열' : '북부균열(5W)', 30);
    if (eastEntry && (g.openedBreachRoutes.has('EAST_BREACH') || g.getCurrentStage().initialRoutes.includes('EAST_BREACH'))) {
      drawBannerGate(eastEntry, true, '#fb7185', '동부 돌파로', 30);
    }
    if (tunnelEntry && (g.openedBreachRoutes.has('CORE_TUNNEL') || g.getCurrentStage().initialRoutes.includes('CORE_TUNNEL'))) {
      drawBannerGate(tunnelEntry, true, '#fb923c', '지하 갱도', -26);
    }

    // Fortress Citadel Bastion Gate + Aether Reactor Core
    ctx.save();
    ctx.translate(core.x, core.y);
    const pulseScale = 1 + g.corePulse * 0.22 + Math.sin(g.time * 3) * 0.03;
    ctx.scale(pulseScale, pulseScale);

    ctx.fillStyle = '#1e2631';
    ctx.strokeStyle = '#b48a3e';
    ctx.lineWidth = 2.8;
    ctx.fillRect(-28, -42, 56, 84);
    ctx.strokeRect(-28, -42, 56, 84);

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(-24, -38, 15, 15);
    ctx.fillRect(9, -38, 15, 15);
    ctx.fillRect(-24, 23, 15, 15);
    ctx.fillRect(9, 23, 15, 15);

    const coreGlow = ctx.createRadialGradient(0, 0, 4, 0, 0, 36);
    coreGlow.addColorStop(0, '#ffffff');
    coreGlow.addColorStop(0.4, g.corePulse > 0.1 ? '#fb7185' : '#38bdf8');
    coreGlow.addColorStop(1, 'rgba(56, 189, 248, 0)');
    ctx.fillStyle = coreGlow;
    ctx.beginPath();
    ctx.arc(0, 0, 36, 0, Math.PI * 2);
    ctx.fill();

    ctx.rotate(-g.time * 1.4);
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(-12, -12, 24, 24);
    ctx.restore();
  }

  /**
   * 6-Stage Interactive Kingdom Rush-Style Campaign World Map
   */
  static renderCampaignWorldMap(canvas, stagesObj, prog, selectedStageId, hoveredStageId, time) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    // 1. Topographic Parchment War Map Backdrop
    const bg = ctx.createRadialGradient(w * 0.5, h * 0.45, 60, w * 0.5, h * 0.5, 780);
    bg.addColorStop(0, '#2c251d');
    bg.addColorStop(0.6, '#1c1813');
    bg.addColorStop(1, '#100d0a');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.strokeStyle = 'rgba(217, 167, 74, 0.08)';
    ctx.lineWidth = 1.5;
    for (let r = 120; r <= 680; r += 95) {
      ctx.beginPath();
      ctx.ellipse(w * 0.52, h * 0.48, r * 1.25, r * 0.65, -0.12, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    const drawMountainCluster = (cx, cy, count) => {
      ctx.save();
      for (let i = 0; i < count; i++) {
        const mx = cx + (i - count * 0.5) * 32;
        const my = cy + (i % 2) * 14;
        const mh = 32 + (i % 3) * 12;
        ctx.fillStyle = '#29221b';
        ctx.strokeStyle = '#574736';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(mx, my - mh);
        ctx.lineTo(mx - 24, my + 12);
        ctx.lineTo(mx + 24, my + 12);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = 'rgba(254, 243, 199, 0.16)';
        ctx.beginPath();
        ctx.moveTo(mx, my - mh);
        ctx.lineTo(mx - 8, my - mh + 12);
        ctx.lineTo(mx + 8, my - mh + 12);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    };

    drawMountainCluster(185, 340, 4);
    drawMountainCluster(510, 210, 5);
    drawMountainCluster(760, 585, 4);
    drawMountainCluster(980, 175, 4);

    // Compass Rose
    ctx.save();
    ctx.translate(105, 620);
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.28)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, 38, 0, Math.PI * 2);
    ctx.stroke();
    ctx.rotate(time * 0.08);
    for (let i = 0; i < 4; i++) {
      ctx.rotate(Math.PI / 2);
      ctx.fillStyle = i === 0 ? 'rgba(244, 63, 94, 0.55)' : 'rgba(251, 191, 36, 0.32)';
      ctx.beginPath();
      ctx.moveTo(0, -32);
      ctx.lineTo(-5, 0);
      ctx.lineTo(5, 0);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    const stageList = Object.values(stagesObj).sort((a, b) => a.order - b.order);

    // 2. Dotted Marching Trail Connecting Stage I -> II -> III -> IV -> V -> VI
    for (let i = 0; i < stageList.length - 1; i++) {
      const a = stageList[i].worldPos;
      const b = stageList[i + 1].worldPos;
      const unlockedNext = stageList[i + 1].order <= prog.unlockedStageOrder;

      ctx.save();
      ctx.strokeStyle = unlockedNext ? '#fbbf24' : 'rgba(148, 163, 184, 0.30)';
      ctx.lineWidth = 4;
      ctx.setLineDash([9, 9]);
      ctx.lineDashOffset = unlockedNext ? -time * 24 : 0;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      const midX = (a.x + b.x) * 0.5;
      const midY = (a.y + b.y) * 0.5 - 28;
      ctx.quadraticCurveTo(midX, midY, b.x, b.y);
      ctx.stroke();
      ctx.restore();
    }

    // 3. Stage Banner Flags & Shield Nodes
    const numerals = ['I', 'II', 'III', 'IV', 'V', 'VI'];
    for (const st of stageList) {
      const { x, y } = st.worldPos;
      const unlocked = st.order <= prog.unlockedStageOrder;
      const clearInfo = prog.stageClears[st.id];
      const isSelected = selectedStageId === st.id;
      const isHovered = hoveredStageId === st.id;
      const hasBreachEvent = (st.breachEvents || []).length > 0;

      ctx.save();
      ctx.translate(x, y);

      if (isSelected || (unlocked && !clearInfo)) {
        const pulse = 1 + Math.sin(time * 4) * 0.12;
        ctx.strokeStyle = isSelected ? '#38bdf8' : '#fbbf24';
        ctx.lineWidth = isSelected ? 3.5 : 2.5;
        ctx.beginPath();
        ctx.arc(0, 0, 34 * pulse, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.beginPath();
      ctx.ellipse(0, 12, 30, 14, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = clearInfo ? '#7f1d1d' : (unlocked ? (hasBreachEvent ? '#7c2d12' : '#1e3a8a') : '#1e293b');
      ctx.strokeStyle = isSelected ? '#ffffff' : (clearInfo ? '#fbbf24' : (unlocked ? (hasBreachEvent ? '#fb7185' : '#38bdf8') : '#475569'));
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, isHovered ? 27 : 24, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Fluttering Pennant Flag
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(-2, -52, 4, 38);
      const waveOffset = Math.sin(time * 5 + st.order) * 3;
      ctx.fillStyle = clearInfo ? '#dc2626' : (unlocked ? (hasBreachEvent ? '#e11d48' : '#d97706') : '#475569');
      ctx.beginPath();
      ctx.moveTo(2, -51);
      ctx.quadraticCurveTo(20, -48 + waveOffset, 36, -42 + waveOffset);
      ctx.quadraticCurveTo(20, -35 + waveOffset, 2, -32);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = '900 13px "Georgia", serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(unlocked ? numerals[st.order - 1] : '🔒', 0, 0);

      // 3 Stars Row
      const earnedStars = clearInfo ? (clearInfo.stars || 1) : 0;
      for (let s = 0; s < 3; s++) {
        const sx = (s - 1) * 16;
        const sy = 31;
        ctx.fillStyle = s < earnedStars ? '#fbbf24' : 'rgba(30, 41, 59, 0.85)';
        ctx.strokeStyle = '#92400e';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(sx, sy, 5.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // Compact Nameplate
      ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
      ctx.strokeStyle = isSelected ? '#38bdf8' : (hasBreachEvent ? '#fb7185' : '#947234');
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(-72, 42, 144, 22, 7);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = unlocked ? '#fef3c7' : '#94a3b8';
      ctx.font = '700 10px "Malgun Gothic", sans-serif';
      const shortName = st.name.replace(/^제\d전선:\s*/, '');
      ctx.fillText(shortName, 0, 53);

      ctx.restore();
    }
  }
}

window.AetherBastion.AetherEnvRenderer = AetherEnvRenderer;
