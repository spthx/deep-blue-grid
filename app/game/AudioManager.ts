export class AudioManager {
  private ctx?: AudioContext;
  private muted = false;
  private musicTimer?: number;
  private step = 0;
  private ensure() {
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === "suspended") void this.ctx.resume();
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
