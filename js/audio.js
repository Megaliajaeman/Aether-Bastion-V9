window.AetherBastion = window.AetherBastion || {};

/**
 * V9 Realistic Ballistic Firearm, Incoming Mortar Whistle, Artillery Detonation & Sequential Card Deal SFX
 */
class AetherAudioEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.masterFilter = null;
    this.compressor = null;
    this.muted = false;
    this.volume = 0.62;
    this.lastTriggerTimes = {};
    this.noiseBuffer = null;
  }

  unlock() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();

      const len = Math.floor(this.ctx.sampleRate * 1.5);
      this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.997 * b0 + white * 0.029;
        b1 = 0.985 * b1 + white * 0.032;
        b2 = 0.950 * b2 + white * 0.048;
        data[i] = (b0 + b1 + b2 + white * 0.55) * 0.85;
      }

      this.masterFilter = this.ctx.createBiquadFilter();
      this.masterFilter.type = 'lowpass';
      this.masterFilter.frequency.value = 5400;
      this.masterFilter.Q.value = 0.55;

      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -14;
      this.compressor.knee.value = 16;
      this.compressor.ratio.value = 5;
      this.compressor.attack.value = 0.002;
      this.compressor.release.value = 0.12;

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : this.volume;

      this.masterFilter.connect(this.compressor);
      this.compressor.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  _canTrigger(channel, minGapSec) {
    if (!this.ctx || this.muted) return false;
    const now = this.ctx.currentTime;
    const prev = this.lastTriggerTimes[channel] || -99;
    if (now - prev < minGapSec) return false;
    this.lastTriggerTimes[channel] = now;
    return true;
  }

  setVolume(val) {
    this.volume = Math.max(0, Math.min(1, val));
    if (this.masterGain && !this.muted) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.02);
    }
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.02);
    }
  }

  _playFilteredTone({
    type = 'triangle',
    startFreq = 260,
    endFreq = 90,
    duration = 0.12,
    gain = 0.24,
    delay = 0,
    filterType = 'lowpass',
    filterFreq = 1200,
    filterEndFreq = null,
    filterQ = 0.8
  }) {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const env = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(startFreq, now);
    if (endFreq !== startFreq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(22, endFreq), now + duration);
    }

    filter.type = filterType;
    filter.frequency.setValueAtTime(filterFreq, now);
    if (filterEndFreq !== null) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(40, filterEndFreq), now + duration);
    }
    filter.Q.value = filterQ;

    env.gain.setValueAtTime(0.0001, now);
    env.gain.linearRampToValueAtTime(gain, now + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(filter);
    filter.connect(env);
    env.connect(this.masterFilter);

    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  _playSubPunch(startFreq = 125, endFreq = 38, duration = 0.11, gain = 0.32, delay = 0) {
    this._playFilteredTone({
      type: 'sine',
      startFreq,
      endFreq,
      duration,
      gain,
      delay,
      filterType: 'lowpass',
      filterFreq: 300,
      filterQ: 0.7
    });
  }

  _playNoiseBurst({
    duration = 0.12,
    attack = 0.002,
    filterType = 'bandpass',
    filterFreq = 1400,
    filterEndFreq = 320,
    filterQ = 1.1,
    gain = 0.30,
    delay = 0
  }) {
    if (!this.ctx || this.muted || !this.noiseBuffer) return;
    const now = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(filterFreq, now);
    if (filterEndFreq) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(50, filterEndFreq), now + duration);
    }
    filter.Q.value = filterQ;

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0008, now);
    env.gain.linearRampToValueAtTime(gain, now + attack);
    env.gain.exponentialRampToValueAtTime(0.0006, now + duration);

    src.connect(filter);
    filter.connect(env);
    env.connect(this.masterFilter);

    const maxOffset = Math.max(0, this.noiseBuffer.duration - duration - 0.05);
    src.start(now, Math.random() * maxOffset, duration + 0.02);
  }

  // Sequential "따다닥!" Augment Card Deal Sound (LoL ARAM style)
  playCardDeal(index = 0) {
    if (!this.ctx || this.muted) return;
    const pitchScale = 1 + index * 0.14;
    this._playSubPunch(165 * pitchScale, 72, 0.07, 0.24);
    this._playNoiseBurst({
      duration: 0.045,
      attack: 0.001,
      filterType: 'bandpass',
      filterFreq: 2100 * pitchScale,
      filterEndFreq: 950,
      filterQ: 1.4,
      gain: 0.20
    });
    this._playFilteredTone({
      type: 'triangle',
      startFreq: 440 * pitchScale,
      endFreq: 660 * pitchScale,
      duration: 0.09,
      gain: 0.16,
      filterFreq: 2200
    });
  }

  // Realistic Heavy Autocannon / Machine Gun Fire + Bolt Action + Shell Casing Tink
  playPulseShot(isRailgun = false) {
    if (isRailgun) {
      if (!this._canTrigger('RAILGUN', 0.06)) return;
      const pitchJitter = 0.94 + Math.random() * 0.12;
      this._playNoiseBurst({
        duration: 0.14,
        attack: 0.001,
        filterType: 'bandpass',
        filterFreq: 2600 * pitchJitter,
        filterEndFreq: 380,
        filterQ: 0.9,
        gain: 0.38
      });
      this._playSubPunch(148 * pitchJitter, 34, 0.18, 0.44);
      this._playFilteredTone({
        type: 'sawtooth',
        startFreq: 320 * pitchJitter,
        endFreq: 78,
        duration: 0.14,
        gain: 0.16,
        filterFreq: 1400,
        filterEndFreq: 220
      });
    } else {
      if (!this._canTrigger('PULSE', 0.052)) return;
      const jitter = 0.92 + Math.random() * 0.16;
      // 1. High-pressure gunpowder muzzle blast
      this._playNoiseBurst({
        duration: 0.068,
        attack: 0.0015,
        filterType: 'bandpass',
        filterFreq: 1750 * jitter,
        filterEndFreq: 360,
        filterQ: 0.85,
        gain: 0.30
      });
      // 2. Chamber percussion punch
      this._playSubPunch(140 * jitter, 46, 0.065, 0.28);
      // 3. Mechanical bolt clack + brass shell casing tink on stone
      this._playNoiseBurst({
        duration: 0.028,
        attack: 0.001,
        filterType: 'highpass',
        filterFreq: 2200,
        filterEndFreq: 1500,
        filterQ: 1.5,
        gain: 0.10,
        delay: 0.022
      });
    }
  }

  playCryoShot() {
    if (!this._canTrigger('CRYO', 0.09)) return;
    this._playSubPunch(96, 42, 0.16, 0.22);
    this._playNoiseBurst({
      duration: 0.20,
      attack: 0.012,
      filterType: 'bandpass',
      filterFreq: 1850,
      filterEndFreq: 720,
      filterQ: 1.6,
      gain: 0.18
    });
    this._playFilteredTone({
      type: 'sine',
      startFreq: 560,
      endFreq: 290,
      duration: 0.16,
      gain: 0.11,
      filterFreq: 1300
    });
  }

  playTeslaShot() {
    if (!this._canTrigger('TESLA', 0.075)) return;
    const jitter = 0.9 + Math.random() * 0.2;
    this._playSubPunch(108 * jitter, 42, 0.11, 0.26);
    this._playNoiseBurst({
      duration: 0.085,
      attack: 0.001,
      filterType: 'bandpass',
      filterFreq: 2200 * jitter,
      filterEndFreq: 640,
      filterQ: 2.0,
      gain: 0.22
    });
    this._playFilteredTone({
      type: 'sawtooth',
      startFreq: 240 * jitter,
      endFreq: 95,
      duration: 0.10,
      gain: 0.14,
      filterFreq: 950
    });
  }

  playMortarLaunch() {
    if (!this._canTrigger('MORTAR_LAUNCH', 0.08)) return;
    this._playSubPunch(155, 52, 0.19, 0.36);
    this._playNoiseBurst({
      duration: 0.14,
      attack: 0.005,
      filterType: 'lowpass',
      filterFreq: 620,
      filterEndFreq: 140,
      filterQ: 1.8,
      gain: 0.24
    });
  }

  playMortarExplosion() {
    if (!this._canTrigger('MORTAR_EXP', 0.06)) return;
    this._playSubPunch(98, 22, 0.36, 0.48);
    this._playNoiseBurst({
      duration: 0.34,
      attack: 0.002,
      filterType: 'lowpass',
      filterFreq: 780,
      filterEndFreq: 85,
      filterQ: 1.0,
      gain: 0.38
    });
  }

  playUiClick() {
    this._playSubPunch(170, 80, 0.045, 0.15);
    this._playNoiseBurst({ duration: 0.025, filterType: 'bandpass', filterFreq: 1800, filterEndFreq: 1200, gain: 0.10 });
  }

  playSaveConfirm() {
    this._playSubPunch(140, 60, 0.12, 0.22);
    [392.0, 523.3, 659.3].forEach((f, i) => {
      this._playFilteredTone({ type: 'triangle', startFreq: f, endFreq: f, duration: 0.14, gain: 0.16, delay: i * 0.045, filterFreq: 1600 });
    });
  }

  playPlace() {
    this._playSubPunch(130, 44, 0.16, 0.34);
    this._playNoiseBurst({ duration: 0.09, filterType: 'lowpass', filterFreq: 900, filterEndFreq: 200, gain: 0.22 });
    this._playFilteredTone({ type: 'triangle', startFreq: 440, endFreq: 660, duration: 0.11, gain: 0.16, delay: 0.05, filterFreq: 1800 });
  }

  playUpgrade(isSpec = false) {
    const notes = isSpec ? [261.6, 329.6, 392.0, 523.3, 659.3] : [261.6, 329.6, 392.0, 523.3];
    this._playSubPunch(125, 48, 0.2, 0.30);
    notes.forEach((f, idx) => {
      this._playFilteredTone({
        type: 'triangle',
        startFreq: f,
        endFreq: f * 1.02,
        duration: 0.16,
        gain: 0.18,
        delay: idx * 0.05,
        filterFreq: 1700
      });
    });
  }

  playAugmentPick() {
    this._playSubPunch(130, 55, 0.22, 0.26);
    [329.6, 392.0, 493.9, 659.3].forEach((f, idx) => {
      this._playFilteredTone({
        type: 'sine',
        startFreq: f,
        endFreq: f,
        duration: 0.20,
        gain: 0.20,
        delay: idx * 0.045,
        filterFreq: 1800
      });
    });
  }

  playSell() {
    this._playFilteredTone({ type: 'triangle', startFreq: 380, endFreq: 170, duration: 0.16, gain: 0.20, filterFreq: 950 });
  }

  playError() {
    this._playFilteredTone({ type: 'sawtooth', startFreq: 135, endFreq: 88, duration: 0.15, gain: 0.18, filterFreq: 480 });
  }

  playSuperconduct() {
    if (!this._canTrigger('SUPERCONDUCT', 0.12)) return;
    this._playSubPunch(115, 38, 0.20, 0.30);
    this._playNoiseBurst({ duration: 0.16, filterType: 'bandpass', filterFreq: 1600, filterEndFreq: 420, filterQ: 1.5, gain: 0.20 });
  }

  playShatter() {
    if (!this._canTrigger('SHATTER', 0.12)) return;
    this._playSubPunch(110, 32, 0.24, 0.36);
    this._playNoiseBurst({ duration: 0.18, filterType: 'bandpass', filterFreq: 2100, filterEndFreq: 520, filterQ: 1.4, gain: 0.24 });
  }

  playOverdrive() {
    this._playSubPunch(135, 36, 0.45, 0.38);
    [220, 277.2, 329.6, 440].forEach((f, idx) => {
      this._playFilteredTone({
        type: 'sawtooth',
        startFreq: f,
        endFreq: f * 1.25,
        duration: 0.35,
        gain: 0.16,
        delay: idx * 0.04,
        filterFreq: 1400
      });
    });
  }

  playOrbitalStrike() {
    this._playSubPunch(98, 20, 0.70, 0.50, 0.05);
    this._playFilteredTone({
      type: 'sawtooth',
      startFreq: 520,
      endFreq: 44,
      duration: 0.55,
      gain: 0.26,
      filterFreq: 1300,
      filterEndFreq: 160
    });
    this._playNoiseBurst({
      duration: 0.65,
      attack: 0.004,
      filterType: 'lowpass',
      filterFreq: 1100,
      filterEndFreq: 75,
      gain: 0.42,
      delay: 0.05
    });
  }

  playChronoStasis() {
    this._playSubPunch(110, 32, 0.65, 0.34);
    this._playFilteredTone({ type: 'sine', startFreq: 480, endFreq: 140, duration: 0.65, gain: 0.24, filterFreq: 1200 });
    this._playFilteredTone({ type: 'triangle', startFreq: 240, endFreq: 70, duration: 0.65, gain: 0.20, filterFreq: 700 });
  }

  playEnemyDefeat(isBoss = false) {
    if (isBoss) {
      this._playSubPunch(88, 20, 0.60, 0.48);
      this._playNoiseBurst({ duration: 0.55, filterType: 'lowpass', filterFreq: 760, filterEndFreq: 70, gain: 0.40 });
      [196, 246.9, 293.7, 392].forEach((f, idx) => {
        this._playFilteredTone({ type: 'triangle', startFreq: f, endFreq: f * 1.04, duration: 0.28, gain: 0.22, delay: idx * 0.07, filterFreq: 1500 });
      });
    } else {
      if (!this._canTrigger('DEFEAT', 0.05)) return;
      this._playSubPunch(150, 65, 0.07, 0.14);
      this._playFilteredTone({ type: 'triangle', startFreq: 340, endFreq: 490, duration: 0.08, gain: 0.11, filterFreq: 1200 });
    }
  }

  playCoreBreach() {
    this._playSubPunch(92, 24, 0.42, 0.46);
    this._playNoiseBurst({ duration: 0.30, filterType: 'lowpass', filterFreq: 520, filterEndFreq: 70, gain: 0.30 });
  }

  playWaveStart(isBossWave = false) {
    this._playSubPunch(95, 34, 0.35, 0.40);
    this._playNoiseBurst({ duration: 0.14, filterType: 'lowpass', filterFreq: 420, filterEndFreq: 90, gain: 0.26 });
    const hornNotes = isBossWave ? [146.8, 138.6, 110.0] : [196.0, 246.9, 293.7];
    hornNotes.forEach((f, idx) => {
      this._playFilteredTone({
        type: 'sawtooth',
        startFreq: f * 0.98,
        endFreq: f,
        duration: 0.32,
        gain: 0.20,
        delay: 0.06 + idx * 0.12,
        filterFreq: isBossWave ? 780 : 1050,
        filterQ: 1.2
      });
    });
  }

  playWaveClear() {
    this._playSubPunch(120, 52, 0.24, 0.28);
    [293.7, 369.9, 440.0, 587.3].forEach((f, idx) => {
      this._playFilteredTone({ type: 'triangle', startFreq: f, endFreq: f, duration: 0.22, gain: 0.20, delay: idx * 0.08, filterFreq: 1650 });
    });
  }

  playGameOver() {
    this._playSubPunch(95, 28, 0.5, 0.36);
    [246.9, 220.0, 196.0, 146.8].forEach((f, idx) => {
      this._playFilteredTone({ type: 'sawtooth', startFreq: f, endFreq: f * 0.92, duration: 0.28, gain: 0.20, delay: idx * 0.16, filterFreq: 750 });
    });
  }
}

window.AetherBastion.AetherAudioEngine = AetherAudioEngine;
