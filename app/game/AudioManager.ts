type WakeLockSentinelLike = {
  released: boolean;
  release(): Promise<void>;
  addEventListener(type: "release", listener: () => void, options?: { once?: boolean }): void;
};

type NavigatorWithWakeLock = Navigator & {
  wakeLock?: { request(type: "screen"): Promise<WakeLockSentinelLike> };
};

export class AudioManager {
  private ctx?: AudioContext;
  private muted = false;
  private musicTimer?: number;
  private wakeLock?: WakeLockSentinelLike;
  private wakeLockRequest?: Promise<void>;
  private needsRecovery = false;
  private step = 0;

  constructor() {
    document.addEventListener("visibilitychange", this.onVisibilityChange);
    window.addEventListener("pageshow", this.onForeground);
    window.addEventListener("focus", this.onForeground);
    document.addEventListener("pointerdown", this.onUserActivation, { capture: true, passive: true });
    document.addEventListener("touchend", this.onUserActivation, { capture: true, passive: true });
  }

  private onVisibilityChange = () => {
    if (document.visibilityState === "hidden") {
      this.needsRecovery = Boolean(this.ctx);
      if (this.ctx?.state === "running") void this.ctx.suspend().catch(() => undefined);
      return;
    }
    this.onForeground();
  };

  private onForeground = () => {
    void this.requestWakeLock();
    if (!this.ctx || this.muted) return;
    this.needsRecovery = true;
    void this.recoverAudio();
  };

  private onUserActivation = () => {
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

  private async recoverAudio() {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
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
  }

  private async settleSoon(action: Promise<void>) {
    await Promise.race([
      action.catch(() => undefined),
      new Promise<void>((resolve) => window.setTimeout(resolve, 350)),
    ]);
  }

  private replaceAudioContext() {
    const stale = this.ctx;
    const fresh = new AudioContext();
    this.ctx = fresh;
    void stale?.close().catch(() => undefined);
    void fresh.resume().then(() => {
      if (this.ctx === fresh && fresh.state === "running") this.needsRecovery = false;
    }).catch(() => undefined);
  }

  private async requestWakeLock() {
    if (document.visibilityState !== "visible" || (this.wakeLock && !this.wakeLock.released)) return;
    if (this.wakeLockRequest) return this.wakeLockRequest;
    const wakeLock = (navigator as NavigatorWithWakeLock).wakeLock;
    if (!wakeLock) return;
    this.wakeLockRequest = (async () => {
      try {
        const sentinel = await wakeLock.request("screen");
        this.wakeLock = sentinel;
        sentinel.addEventListener("release", () => {
          if (this.wakeLock === sentinel) this.wakeLock = undefined;
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
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === "suspended" || (this.ctx.state as string) === "interrupted") void this.ctx.resume().catch(() => undefined);
    if (!this.musicTimer) this.startMusic();
    return this.ctx;
  }
  toggle() { this.muted = !this.muted; if (!this.muted) this.ensure(); return this.muted; }
  get isMuted() { return this.muted; }
  tone(freq: number, duration = .09, type: OscillatorType = "square", volume = .035, slide = 0) {
    if (this.muted) return;
    const ctx = this.ensure(); const osc = ctx.createOscillator(); const gain = ctx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, ctx.currentTime); if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), ctx.currentTime + duration);
    gain.gain.setValueAtTime(volume, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + duration);
    osc.connect(gain).connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + duration);
  }
  cursor(){ this.tone(720,.025,"square",.018,-80); }
  confirm(){ this.tone(520,.06,"square",.035,180); }
  cancel(){ this.tone(220,.08,"sawtooth",.025,-80); }
  fire(){ this.tone(110,.24,"sawtooth",.06,420); }
  splash(){ this.tone(160,.18,"triangle",.045,-100); this.tone(670,.12,"sine",.025,-500); }
  hit(){ this.tone(80,.34,"square",.07,-40); this.tone(520,.1,"sawtooth",.035,-300); }
  sunk(){ [180,140,100,65].forEach((f,i)=>setTimeout(()=>this.tone(f,.36,"sawtooth",.07,-30),i*110)); }
  sonar(){ [360,540,720].forEach((f,i)=>setTimeout(()=>this.tone(f,.12,"sine",.035,40),i*120)); }
  turn(enemy=false){ this.tone(enemy?185:420,.12,"square",.03,enemy?-45:120); }
  victory(){ [262,330,392,523].forEach((f,i)=>setTimeout(()=>this.tone(f,.24,"square",.05,20),i*130)); }
  defeat(){ [260,200,150,90].forEach((f,i)=>setTimeout(()=>this.tone(f,.32,"triangle",.05,-20),i*150)); }
  private startMusic() {
    const bass=[55,55,73,55,82,73,55,49];
    this.musicTimer=window.setInterval(()=>{ if(!this.muted && document.visibilityState==="visible") this.tone(bass[this.step++%bass.length],.12,"square",.012,-4); },260);
  }
}
