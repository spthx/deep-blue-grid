type WakeLockSentinelLike = {
  released: boolean;
  release(): Promise<void>;
  addEventListener(type: "release", listener: () => void, options?: { once?: boolean }): void;
};

type NavigatorWithWakeLock = Navigator & {
  wakeLock?: { request(type: "screen"): Promise<WakeLockSentinelLike> };
};

type AudioWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

export const MUSIC_INTERVAL_MS = [260, 240, 220, 200, 185, 170] as const;

const cue = (frequencyHz: number, durationSeconds: number, wave: OscillatorType, volume: number, slideHz: number, delayMs = 0) => ({
  frequencyHz, durationSeconds, wave, volume, slideHz, delayMs,
});

export const AUDIO_CUE_CONTRACT = {
  output: { masterGain: 0.82, compressorThresholdDb: -10, compressorKnee: 8, compressorRatio: 8 },
  commandPulse: { intervalsMs: MUSIC_INTERVAL_MS, bassHz: [55, 55, 73, 55, 82, 73, 55, 49], durationSeconds: 0.12, volume: 0.012, slideHz: -4 },
  cues: {
    cursor: [cue(720, 0.025, "square", 0.018, -80)],
    confirm: [cue(520, 0.06, "square", 0.035, 180)],
    cancel: [cue(220, 0.08, "sawtooth", 0.025, -80)],
    fire: [cue(110, 0.24, "sawtooth", 0.06, 420)],
    splash: [cue(160, 0.18, "triangle", 0.045, -100), cue(670, 0.12, "sine", 0.025, -500)],
    hit: [cue(80, 0.34, "square", 0.07, -40), cue(520, 0.1, "sawtooth", 0.035, -300)],
    sunk: [cue(180, 0.36, "sawtooth", 0.07, -30), cue(140, 0.36, "sawtooth", 0.07, -30, 110), cue(100, 0.36, "sawtooth", 0.07, -30, 220), cue(65, 0.36, "sawtooth", 0.07, -30, 330)],
    sonar: [cue(360, 0.12, "sine", 0.035, 40), cue(540, 0.12, "sine", 0.035, 40, 120), cue(720, 0.12, "sine", 0.035, 40, 240)],
    turnFriendly: [cue(420, 0.12, "square", 0.03, 120)],
    turnHostile: [cue(185, 0.12, "square", 0.03, -45)],
    victory: [cue(262, 0.24, "square", 0.05, 20), cue(330, 0.24, "square", 0.05, 20, 130), cue(392, 0.24, "square", 0.05, 20, 260), cue(523, 0.24, "square", 0.05, 20, 390)],
    defeat: [cue(260, 0.32, "triangle", 0.05, -20), cue(200, 0.32, "triangle", 0.05, -20, 150), cue(150, 0.32, "triangle", 0.05, -20, 300), cue(90, 0.32, "triangle", 0.05, -20, 450)],
  },
} as const;

export function pulseIntervalForLosses(losses: number) {
  const tier = Math.max(0, Math.min(MUSIC_INTERVAL_MS.length - 1, Math.trunc(losses)));
  return MUSIC_INTERVAL_MS[tier];
}

export class AudioManager {
  private ctx?: AudioContext;
  private master?: GainNode;
  private compressor?: DynamicsCompressorNode;
  private muted = false;
  private musicTimer?: number;
  private wakeLock?: WakeLockSentinelLike;
  private wakeLockRequest?: Promise<void>;
  private wakeRetryTimer?: number;
  private wakeRetryCount = 0;
  private needsRecovery = false;
  private recoveryPromise?: Promise<void>;
  private step = 0;
  private lossTier = 0;
  private disposed = false;

  constructor() {
    document.addEventListener("visibilitychange", this.onVisibilityChange);
    window.addEventListener("pageshow", this.onForeground);
    window.addEventListener("focus", this.onForeground);
    document.addEventListener("pointerdown", this.onUserActivation, { capture: true, passive: true });
    document.addEventListener("touchend", this.onUserActivation, { capture: true, passive: true });
    document.addEventListener("keydown", this.onUserActivation, { capture: true });
  }

  private onVisibilityChange = () => {
    if (document.visibilityState === "hidden") {
      this.needsRecovery = Boolean(this.ctx);
      this.stopMusic();
      if (this.ctx?.state === "running") void this.ctx.suspend().catch(() => undefined);
      return;
    }
    this.onForeground();
  };

  private onForeground = () => {
    if (this.disposed) return;
    this.wakeRetryCount = 0;
    void this.requestWakeLock();
    if (!this.ctx || this.muted) return;
    this.needsRecovery = true;
    void this.recoverAudio().then(() => this.startMusic());
  };

  private onUserActivation = () => {
    if (this.disposed) return;
    this.wakeRetryCount = 0;
    if (this.wakeRetryTimer) window.clearTimeout(this.wakeRetryTimer);
    void this.requestWakeLock();
    if (!this.ctx || this.muted || (!this.needsRecovery && this.ctx.state === "running")) return;
    const interrupted = (this.ctx.state as string) === "interrupted";
    if (interrupted) {
      this.replaceAudioContext();
      return;
    }
    void this.ctx.resume().then(() => {
      if (this.ctx?.state === "running") this.needsRecovery = false;
    }).catch(() => undefined);
    window.setTimeout(() => {
      if (this.needsRecovery && this.ctx?.state !== "running") this.replaceAudioContext();
    }, 350);
  };

  private recoverAudio() {
    if (this.recoveryPromise) return this.recoveryPromise;
    this.recoveryPromise = (async () => {
      const ctx = this.ctx;
      if (!ctx || this.muted || this.disposed) return;
      try {
        if (ctx.state === "running" || (ctx.state as string) === "interrupted") await this.settleSoon(ctx.suspend());
      } catch {
        // WebKit can reject suspend() while its non-standard interrupted state is clearing.
      }
      try {
        await this.settleSoon(ctx.resume());
      } catch {
        // The next user activation can recreate a context if iOS keeps this one interrupted.
      }
      if (this.ctx !== ctx) return;
      if (ctx.state === "running") this.needsRecovery = false;
    })().finally(() => {
      this.recoveryPromise = undefined;
    });
    return this.recoveryPromise;
  }

  private async settleSoon(action: Promise<void>) {
    await Promise.race([
      action.catch(() => undefined),
      new Promise<void>((resolve) => window.setTimeout(resolve, 350)),
    ]);
  }

  private replaceAudioContext() {
    const stale = this.ctx;
    const fresh = this.createAudioContext();
    if (!fresh) return;
    this.ctx = fresh;
    this.connectOutput(fresh);
    void stale?.close().catch(() => undefined);
    void fresh.resume().then(() => {
      if (this.ctx === fresh && fresh.state === "running") this.needsRecovery = false;
    }).catch(() => undefined);
  }

  private async requestWakeLock() {
    if (this.disposed || document.visibilityState !== "visible" || (this.wakeLock && !this.wakeLock.released)) return;
    if (this.wakeLockRequest) return this.wakeLockRequest;
    const wakeLock = (navigator as NavigatorWithWakeLock).wakeLock;
    if (!wakeLock) return;
    this.wakeLockRequest = (async () => {
      try {
        const sentinel = await wakeLock.request("screen");
        this.wakeLock = sentinel;
        sentinel.addEventListener("release", () => {
          if (this.wakeLock !== sentinel) return;
          this.wakeLock = undefined;
          if (document.visibilityState === "visible" && this.wakeRetryCount < 2) {
            this.wakeRetryCount++;
            this.wakeRetryTimer = window.setTimeout(() => void this.requestWakeLock(), 500);
          }
        }, { once: true });
      } catch {
        // Older iOS versions and battery-saving modes can deny wake lock requests.
      }
    })().finally(() => {
      this.wakeLockRequest = undefined;
    });
    return this.wakeLockRequest;
  }

  private ensure() {
    if (this.disposed) return undefined;
    void this.requestWakeLock();
    if (!this.ctx) {
      this.ctx = this.createAudioContext();
      if (this.ctx) this.connectOutput(this.ctx);
    }
    if (!this.ctx) return undefined;
    if (this.ctx.state === "suspended" || (this.ctx.state as string) === "interrupted") void this.ctx.resume().catch(() => undefined);
    if (!this.musicTimer) this.startMusic();
    return this.ctx;
  }
  toggle() {
    this.muted = !this.muted;
    if (this.muted) this.stopMusic();
    else this.ensure();
    return this.muted;
  }
  get isMuted() { return this.muted; }
  setLossTier(losses: number) {
    this.lossTier = Math.max(0, Math.min(MUSIC_INTERVAL_MS.length - 1, Math.trunc(losses)));
  }
  tone(freq: number, duration = .09, type: OscillatorType = "square", volume = .035, slide = 0) {
    if (this.muted) return;
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const osc = ctx.createOscillator(); const gain = ctx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, ctx.currentTime); if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), ctx.currentTime + duration);
    gain.gain.setValueAtTime(.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(Math.max(.0002, volume), ctx.currentTime + Math.min(.005, duration * .2));
    gain.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + duration);
    osc.connect(gain).connect(this.master); osc.start(); osc.stop(ctx.currentTime + duration);
  }
  private playCue(name: keyof typeof AUDIO_CUE_CONTRACT.cues) {
    for (const tone of AUDIO_CUE_CONTRACT.cues[name]) {
      const play = () => this.tone(tone.frequencyHz, tone.durationSeconds, tone.wave, tone.volume, tone.slideHz);
      if (tone.delayMs) window.setTimeout(play, tone.delayMs);
      else play();
    }
  }
  cursor(){ this.playCue("cursor"); }
  confirm(){ this.playCue("confirm"); }
  cancel(){ this.playCue("cancel"); }
  fire(){ this.playCue("fire"); }
  splash(){ this.playCue("splash"); }
  hit(){ this.playCue("hit"); }
  sunk(){ this.playCue("sunk"); }
  sonar(){ this.playCue("sonar"); }
  turn(enemy=false){ this.playCue(enemy ? "turnHostile" : "turnFriendly"); }
  victory(){ this.playCue("victory"); }
  defeat(){ this.playCue("defeat"); }
  private startMusic() {
    if (this.musicTimer || this.muted || this.disposed) return;
    this.scheduleNextMusic();
  }
  private scheduleNextMusic() {
    if (this.musicTimer || this.muted || this.disposed) return;
    this.musicTimer = window.setTimeout(() => {
      if (!this.muted && !this.disposed && document.visibilityState === "visible") {
        const pulse = AUDIO_CUE_CONTRACT.commandPulse;
        this.tone(pulse.bassHz[this.step++ % pulse.bassHz.length], pulse.durationSeconds, "square", pulse.volume, pulse.slideHz);
      }
      this.musicTimer = undefined;
      this.scheduleNextMusic();
    }, MUSIC_INTERVAL_MS[this.lossTier]);
  }
  private stopMusic() {
    if (this.musicTimer) window.clearTimeout(this.musicTimer);
    this.musicTimer = undefined;
  }
  private createAudioContext() {
    const AudioContextClass = window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
    if (!AudioContextClass) return undefined;
    try {
      return new AudioContextClass();
    } catch {
      return undefined;
    }
  }
  private connectOutput(ctx: AudioContext) {
    this.master = ctx.createGain();
    this.master.gain.value = AUDIO_CUE_CONTRACT.output.masterGain;
    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = AUDIO_CUE_CONTRACT.output.compressorThresholdDb;
    this.compressor.knee.value = AUDIO_CUE_CONTRACT.output.compressorKnee;
    this.compressor.ratio.value = AUDIO_CUE_CONTRACT.output.compressorRatio;
    this.master.connect(this.compressor).connect(ctx.destination);
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.stopMusic();
    if (this.wakeRetryTimer) window.clearTimeout(this.wakeRetryTimer);
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    window.removeEventListener("pageshow", this.onForeground);
    window.removeEventListener("focus", this.onForeground);
    document.removeEventListener("pointerdown", this.onUserActivation, true);
    document.removeEventListener("touchend", this.onUserActivation, true);
    document.removeEventListener("keydown", this.onUserActivation, true);
    void this.wakeLock?.release().catch(() => undefined);
    void this.ctx?.close().catch(() => undefined);
    this.ctx = undefined;
    this.master = undefined;
    this.compressor = undefined;
  }
}
