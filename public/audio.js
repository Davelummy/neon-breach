// Adaptive Web Audio system. Decoupled from game state: pass an isMuted
// callback so the game controls muting without a hard dependency.

export class AudioSystem {
  constructor(isMuted = () => false) {
    this.muted = isMuted;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted()?0:.24;
    this.master.connect(this.ctx.destination);
    this.noise = this.makeNoise();
    this.reverb = this.ctx.createConvolver();
    this.reverb.buffer = this.makeImpulse(.62,3.1);
    this.reverbReturn = this.ctx.createGain();
    this.reverbReturn.gain.value = .28;
    this.reverb.connect(this.reverbReturn);this.reverbReturn.connect(this.master);
    this.hum = null;
    this.menu = null;
    this.menuTimer = null;
    this.menuStep = 0;
  }
  setMuted(on) {
    if (!this.master) return;
    // Respect menu volume slider when unmuting (never leave gain stuck at 0 unless muted).
    let base = (typeof window !== 'undefined' && window.__NEON_VOLUME__ != null) ? Number(window.__NEON_VOLUME__) : .28;
    if (!Number.isFinite(base) || base <= 0) base = .28;
    this.master.gain.value = on ? 0 : Math.min(1, base);
    this.resume();
  }
  resume() {
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') {
      const p = this.ctx.resume();
      if (p?.catch) p.catch(() => {});
    }
  }
  makeNoise() {
    const b = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
    const d = b.getChannelData(0); for (let i=0;i<d.length;i++) d[i]=Math.random()*2-1; return b;
  }
  makeImpulse(seconds,decay) {
    const length=Math.floor(this.ctx.sampleRate*seconds),b=this.ctx.createBuffer(2,length,this.ctx.sampleRate);
    for(let channel=0;channel<2;channel++){const d=b.getChannelData(channel);for(let i=0;i<length;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/length,decay);}
    return b;
  }
  tone(freq, duration=.08, type='sine', volume=.16, endFreq=null, delay=0) {
    if(!this.ctx || this.muted()) return;
    const t=this.ctx.currentTime+delay, o=this.ctx.createOscillator(), g=this.ctx.createGain();
    o.type=type; o.frequency.setValueAtTime(freq,t); if(endFreq) o.frequency.exponentialRampToValueAtTime(Math.max(20,endFreq),t+duration);
    g.gain.setValueAtTime(volume,t); g.gain.exponentialRampToValueAtTime(.0001,t+duration);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t+duration+.02);
  }
  burst(duration=.07, volume=.13, filter=900, highpass=0, delay=0, reverbSend=0) {
    if(!this.ctx || this.muted()) return;
    const t=this.ctx.currentTime+delay,s=this.ctx.createBufferSource(),low=this.ctx.createBiquadFilter(),high=this.ctx.createBiquadFilter(),g=this.ctx.createGain();
    s.buffer=this.noise;low.type='lowpass';low.frequency.value=filter;high.type='highpass';high.frequency.value=highpass;g.gain.setValueAtTime(volume,t);g.gain.exponentialRampToValueAtTime(.0001,t+duration);
    s.connect(low);low.connect(high);high.connect(g);g.connect(this.master);
    if(reverbSend&&this.reverb){const send=this.ctx.createGain();send.gain.value=reverbSend;g.connect(send);send.connect(this.reverb);}
    s.start(t);s.stop(t+duration+.02);
  }
  shoot(kind='rifle') {
    const pitch=.92+Math.random()*.16;
    // Layered report: transient crack → body → room tail (more room in the mix).
    if(kind==='shotgun'){
      this.burst(.012,.26,15000,3200,0,.12);
      this.burst(.028,.52,9200,380,0,.4);this.burst(.26,.4,980,30,0,.78);this.tone(64*pitch,.28,'sawtooth',.4,24);
      this.burst(.38,.14,2400,120,.06,1);this.tone(310,.06,'square',.07,180,.2);
      this.burst(.1,.1,520,18,.1,.55);this.tone(48,.18,'sine',.12,28,.02);
    }else if(kind==='pistol'){
      this.burst(.008,.2,16000,4000,0,.1);
      this.burst(.014,.32,12500,1400,0,.25);this.burst(.085,.22,2200,160,0,.4);this.tone(190*pitch,.1,'sawtooth',.24,62);
      this.tone(900,.022,'square',.06,380,.048);this.burst(.06,.06,850,70,.05,.38);this.tone(55,.07,'sine',.05,32,.01);
    }else if(kind==='dmr'){
      this.burst(.01,.24,14500,2400,0,.2);
      this.burst(.02,.4,10800,650,0,.32);this.burst(.16,.3,1350,45,0,.5);this.tone(96*pitch,.18,'sawtooth',.34,32);
      this.tone(2400*pitch,.028,'square',.08,720);this.burst(.16,.1,700,35,.07,.62);this.tone(42,.14,'sine',.08,24,.015);
    }else{
      this.burst(.01,.22,14000,2600,0,.14);
      this.burst(.02,.4,10000,850,0,.26);this.burst(.12,.3,1550,50,0,.36);this.tone(118*pitch,.14,'sawtooth',.32,36);
      this.tone(2650*pitch,.022,'square',.07,800);this.burst(.2,.1,3200,380,.04,.85);this.tone(480*pitch,.03,'square',.05,300,.06);
      this.tone(52,.1,'sine',.07,28,.012);
    }
  }
  // Ejected brass clink — delayed slightly after the report.
  brass(kind='rifle') {
    const delay = kind==='shotgun' ? .08 : kind==='pistol' ? .04 : .055;
    const vol = kind==='shotgun' ? .045 : .035;
    this.burst(.03, vol, 6500, 1800, delay, .15);
    this.tone(1800 + Math.random() * 400, .04, 'triangle', vol * .8, 900, delay + .01);
    this.burst(.05, vol * .5, 2200, 900, delay + .05, .1);
  }
  ricochet(near=0.5) {
    const v = .04 + near * .06;
    this.burst(.04, v, 9000, 2500, 0, .2);
    this.tone(2200 + Math.random() * 800, .05, 'triangle', v * .7, 900);
    this.burst(.08, v * .4, 4000, 1200, .03, .25);
  }
  impact(surface='concrete') {
    if (surface === 'glass') {
      this.burst(.1, .14, 12000, 2800, 0, .4);
      this.tone(1600, .07, 'triangle', .05, 600);
      return;
    }
    if (surface === 'metal') {
      this.burst(.05, .12, 4800, 400, 0, .35);
      this.tone(420, .08, 'square', .06, 180);
      this.tone(880, .05, 'triangle', .04, 400, .03);
      return;
    }
    this.burst(.06, .1, 1600, 80, 0, .3);
    this.burst(.12, .05, 600, 40, .02, .4);
    this.tone(90, .07, 'sine', .05, 40);
  }
  flyby(dist=0.4) {
    const near = Math.max(0, Math.min(1, 1 - dist / .6));
    this.burst(.035, .03 + near * .07, 11000, 3000, 0, .15);
    this.tone(1400 + near * 600, .05, 'sawtooth', .02 + near * .04, 400);
  }
  hit(critical=false) {
    if (critical) {
      this.tone(1100, .07, 'square', .14, 520);
      this.burst(.05, .12, 4500, 200, 0, .3);
      this.tone(220, .08, 'sawtooth', .08, 90, .02);
    } else {
      this.tone(580, .05, 'square', .1, 380);
      this.burst(.04, .07, 2800, 160, 0, .22);
    }
  }
  kill() { this.tone(660,.08,'square',.11,880); this.tone(880,.09,'square',.09,1120,.06); this.burst(.09,.08,1600,60,.02,.35); this.burst(.12,.06,900,40,.05,.4); }
  hurt() { this.tone(70,.22,'sawtooth',.22,34); this.burst(.14,.1,280); this.tone(140,.1,'sine',.06,60,.04); }
  shieldHit(broken=false) { this.tone(broken?118:760,.16,broken?'sawtooth':'sine',broken ? .16 : .09,broken?42:430);this.burst(.09,.07,broken?900:5200,broken?30:700,0,.45);if(broken)this.tone(310,.24,'square',.055,95,.05); }
  armorHit() { this.burst(.055,.11,1450,55);this.tone(92,.08,'triangle',.085,55); }
  shieldReady() { this.tone(520,.08,'sine',.045,780);this.tone(780,.11,'sine',.035,1040,.055); }
  empty() { this.tone(170,.035,'square',.08,130); this.burst(.04,.04,800,200); }
  pickup() { this.tone(440,.09,'sine',.1,760); this.tone(760,.12,'sine',.08,1100,.06); }

  // Menu / HUD button SFX — short tactile blips (no asset files).
  uiClick(kind='default') {
    this.resume?.();
    if (kind === 'confirm' || kind === 'primary') {
      this.burst(.018, .05, 5200, 900, 0, .12);
      this.tone(520, .045, 'sine', .08, 780);
      this.tone(880, .05, 'triangle', .045, 1100, .028);
      return;
    }
    if (kind === 'back') {
      this.burst(.02, .04, 2800, 400, 0, .1);
      this.tone(360, .05, 'sine', .065, 200);
      this.tone(240, .04, 'triangle', .03, 160, .03);
      return;
    }
    if (kind === 'toggle') {
      this.burst(.015, .045, 4000, 700, 0, .08);
      this.tone(640, .03, 'square', .05, 480);
      this.tone(820, .025, 'triangle', .03, 640, .02);
      return;
    }
    if (kind === 'slider') {
      this.burst(.012, .028, 3600, 900);
      this.tone(700 + Math.random() * 120, .018, 'sine', .03, 500);
      return;
    }
    // Default secondary / card press
    this.burst(.016, .048, 4800, 800, 0, .1);
    this.tone(760, .03, 'triangle', .055, 420);
    this.tone(520, .02, 'sine', .03, 380, .018);
  }
  uiHover() {
    this.resume?.();
    this.tone(900, .018, 'sine', .022, 1100);
    this.burst(.012, .018, 6000, 2000);
  }
  uiFocus() {
    this.resume?.();
    this.tone(640, .022, 'triangle', .028, 820);
  }
  // Staged reload: mag out → insert → bolt/chamber
  reload(kind='rifle') {
    const t = kind === 'shotgun' ? 1.1 : kind === 'pistol' ? .75 : .95;
    this.burst(.04, .05, 1200, 80); // mag release
    this.tone(210, .04, 'square', .05, 150, .02);
    setTimeout(() => {
      this.burst(.05, .06, 900, 60); // mag in
      this.tone(320, .05, 'square', .055, 220);
    }, t * 420);
    setTimeout(() => {
      this.burst(.035, .07, 2400, 400); // bolt
      this.tone(480, .04, 'triangle', .05, 280);
      this.burst(.06, .04, 1600, 200, .03, .15);
    }, t * 780);
  }
  reloadComplete() {
    this.tone(520, .035, 'triangle', .04, 380);
    this.burst(.03, .03, 1800, 300, 0, .1);
  }
  wave() { this.tone(82,.45,'sawtooth',.16,170); this.tone(350,.25,'sine',.06,580,.18); }
  enemyShot(dist=8) {
    const near = Math.max(.25, Math.min(1, 1 - (dist - 2) / 14));
    const p = .88 + Math.random() * .22;
    this.burst(.045, .05 * near, 2600, 160, 0, .4 * near);
    this.tone(200 * p, .12, 'sawtooth', .055 * near, 78);
    this.tone(900 * p, .022, 'square', .02 * near, 400, .03);
    if (near > .7) this.burst(.06, .03, 8000, 2000, .01, .2);
  }
  // Proximity / approach cues — louder when closer.
  enemyAlert(dist=8) {
    const near=Math.max(0,Math.min(1,1-dist/12));
    this.burst(.08,.06+near*.08,1800,120,0,.4);
    this.tone(180+near*40,.12,'square',.05+near*.06,90);
    this.tone(520,.05,'triangle',.03+near*.03,320,.04);
  }
  enemyNear(dist=5) {
    const near=Math.max(0,Math.min(1,1-dist/6));
    this.burst(.04,.04+near*.07,420+near*200,40,0,.2);
    this.tone(70+near*20,.05,'sine',.03+near*.04,40);
  }
  footstep(fast=false, night=false) {
    const vol = (fast ? .055 : .036) * (night ? .75 : 1);
    const f = fast ? 480 + Math.random() * 80 : 340 + Math.random() * 90;
    this.burst(.03 + Math.random() * .015, vol, f, 40);
    this.tone(fast ? 78 : 62 + Math.random() * 12, .04, 'sine', vol * .55, 38);
    if (Math.random() < .35) this.burst(.05, vol * .35, 220, 20, .02, .1);
  }
  heartbeat(intensity=0.5) {
    const v = .03 + intensity * .05;
    this.tone(48, .08, 'sine', v, 36);
    this.burst(.05, v * .6, 180, 20);
    setTimeout(() => {
      this.tone(42, .07, 'sine', v * .75, 30);
      this.burst(.04, v * .4, 160, 20);
    }, 90 + intensity * 30);
  }
  jet() { this.burst(.07,.045,760); this.tone(92,.08,'sawtooth',.035,78); }
  land() { this.burst(.1,.11,240); this.tone(52,.14,'sine',.09,28); this.burst(.08,.05,600,40,.03,.2); }
  glass() { this.burst(.12,.16,11800,2600,0,.38);this.burst(.28,.07,6200,1800,.035,.55);this.tone(1850,.08,'triangle',.045,720); }
  melee() { this.burst(.045,.18,720,80);this.tone(96,.1,'sawtooth',.13,42);this.burst(.11,.08,260,20,.045,.25); }
  weaponSwitch() { this.tone(520,.025,'square',.04,310);this.tone(740,.025,'square',.03,470,.035); }
  vehicle() { this.tone(74,.2,'sawtooth',.08,118);this.tone(148,.16,'sine',.04,196,.08); }
  elite() { this.tone(110,.46,'sawtooth',.12,55);this.tone(220,.32,'square',.045,330,.12);this.burst(.2,.07,900,40,.05,.7); }
  roadkill() { this.burst(.12,.2,380,25);this.tone(62,.18,'sawtooth',.16,31);this.tone(520,.08,'square',.06,790,.08); }
  engine(speed=0,boost=false) { const pitch=70+Math.abs(speed)*13+(boost?48:0);this.tone(pitch,.12,'sawtooth',boost?.055:.028,pitch*.82);if(boost)this.burst(.08,.035,1250,80); }
  musicBeat(step,intensity=0,wave=1) {
    const s=step%16,tension=Math.min(1,intensity+wave*.055),roots=[55,55,65.41,55,73.42,65.41,49,49],root=roots[(step>>1)%roots.length];
    // Cinematic kick, field snare and metallic hats at roughly 125 BPM.
    if(s===0||s===6||s===8||s===11){this.tone(62,.14,'sine',.09+tension*.035,31);this.burst(.055,.045+tension*.018,260,24,0,.2);}
    if(s===4||s===12){this.burst(.13,.055+tension*.025,3800,260,0,.55);this.tone(176,.065,'triangle',.028,108);}
    if(s%2===1)this.burst(.025,.012+tension*.009,9800,4200,0,.28);
    if(tension>.55&&s%4===2)this.burst(.04,.014,12800,6900,0,.16);
    // Dark bass ostinato and pulsing low strings.
    if(s%2===0){this.tone(root,.34,'triangle',.032+tension*.015,root*.78);this.tone(root*2,.18,'sine',.012+tension*.008,root*1.5,.025);}
    if(s===0||s===8){this.tone(root/2,1.65,'sine',.021+tension*.01,root/2*.94);this.tone(root*1.5,1.35,'triangle',.008+tension*.006,root*1.35,.06);}
    // Original tactical motif grows as the battle becomes more dangerous.
    if(tension>.3&&[3,7,10,14].includes(s)){const motif=[329.63,392,440,293.66,369.99,440,493.88,392][(step+wave)%8];this.tone(motif,.19,'triangle',.012+tension*.012,motif*.91,.025);}
    if(tension>.68&&(s===0||s===8)){for(const ratio of [1,1.2,1.5])this.tone(root*ratio*2,.42,'sawtooth',.006+tension*.004,root*ratio*1.65,.04);}
    if(tension>.82&&s===15){this.burst(.32,.045,2100,90,0,.82);this.tone(110,.5,'sawtooth',.038,55);}
  }
  startHum() {
    if(!this.ctx || this.hum) return;
    const filter=this.ctx.createBiquadFilter(),g=this.ctx.createGain(),lfo=this.ctx.createOscillator(),lfoGain=this.ctx.createGain(),voices=[];filter.type='lowpass';filter.frequency.value=420;filter.Q.value=2.4;g.gain.value=.022;
    for(const [freq,type] of [[43,'sine'],[86,'triangle'],[129,'sine']]){const o=this.ctx.createOscillator();o.type=type;o.frequency.value=freq;o.connect(filter);o.start();voices.push(o);}
    lfo.frequency.value=.09;lfoGain.gain.value=170;lfo.connect(lfoGain);lfoGain.connect(filter.frequency);lfo.start();filter.connect(g);g.connect(this.master);this.hum={voices,g,lfo};
  }
  stopHum() {
    if (!this.hum) return;
    try {
      this.hum.voices?.forEach(o => { try { o.stop(); } catch {} });
      this.hum.lfo?.stop();
    } catch {}
    this.hum = null;
  }

  // Title theme: driving cyber-tactical score (procedural, no assets).
  // ~108 BPM, 16th-note grid, four-bar chord loop with real drums + hook.
  startMenuMusic() {
    if (!this.ctx || this.menu) return;
    this.resume();
    this.stopHum();
    const t0 = this.ctx.currentTime;

    const bus = this.ctx.createGain();
    bus.gain.value = 0;
    bus.connect(this.master);
    // Louder presence — master is already ~0.24 so bus can sit higher.
    bus.gain.linearRampToValueAtTime(.78, t0 + .9);

    // Wide pad bus with moving filter (sidechain-ish breathe on kick)
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1400;
    filter.Q.value = 1.6;
    filter.connect(bus);

    const voices = [];
    // Dark detuned pad cluster (A minor / cyber)
    for (const [freq, type, gain, detune] of [
      [55, 'sawtooth', .055, -6],
      [55, 'sawtooth', .045, 7],
      [82.5, 'triangle', .05, -4],
      [110, 'sawtooth', .028, 5],
      [164.81, 'triangle', .032, -3],
      [220, 'sine', .022, 0],
      [329.63, 'triangle', .014, 4]
    ]) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type;
      o.frequency.value = freq;
      o.detune.value = detune;
      g.gain.value = gain;
      o.connect(g);
      g.connect(filter);
      o.start();
      voices.push({ o, g, base: freq });
    }

    // Moving filter LFO — more alive than a static pad
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.type = 'sine';
    lfo.frequency.value = .11;
    lfoGain.gain.value = 480;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();

    // Sub bass (continuous, frequency stepped by the sequencer)
    const sub = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    sub.type = 'sine';
    sub.frequency.value = 55;
    subGain.gain.value = .14;
    sub.connect(subGain);
    subGain.connect(bus);
    sub.start();

    // Second sub harmonic for body
    const sub2 = this.ctx.createOscillator();
    const sub2Gain = this.ctx.createGain();
    sub2.type = 'triangle';
    sub2.frequency.value = 110;
    sub2Gain.gain.value = .045;
    sub2.connect(sub2Gain);
    sub2Gain.connect(bus);
    sub2.start();

    // City / rain noise bed
    const noiseSrc = this.ctx.createBufferSource();
    const noiseFilter = this.ctx.createBiquadFilter();
    const noiseGain = this.ctx.createGain();
    noiseSrc.buffer = this.noise;
    noiseSrc.loop = true;
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 520;
    noiseFilter.Q.value = .55;
    noiseGain.gain.value = .045;
    noiseSrc.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(bus);
    noiseSrc.start();

    // High air / shimmer
    const airSrc = this.ctx.createBufferSource();
    const airFilter = this.ctx.createBiquadFilter();
    const airGain = this.ctx.createGain();
    airSrc.buffer = this.noise;
    airSrc.loop = true;
    airFilter.type = 'highpass';
    airFilter.frequency.value = 4200;
    airGain.gain.value = .018;
    airSrc.connect(airFilter);
    airFilter.connect(airGain);
    airGain.connect(bus);
    airSrc.start();

    this.menu = {
      bus, filter, voices, lfo, noiseSrc, noiseGain, airSrc, airGain,
      sub, subGain, sub2, sub2Gain
    };
    this.menuStep = 0;
    // 108 BPM → 16th note ≈ 139ms
    const stepMs = 138;
    const tick = () => {
      if (!this.menu) return;
      if (!this.muted()) this.menuBeat(this.menuStep++);
      else this.menuStep++; // keep phase so unmute lands on the grid
      this.menuTimer = setTimeout(tick, stepMs);
    };
    this.menuTimer = setTimeout(tick, 280);
  }

  menuBeat(step) {
    if (!this.ctx || this.muted() || !this.menu) return;
    const s = step % 16;
    const bar = Math.floor(step / 16) % 4;
    // 0 = build, 1 = groove, 2 = lift, 3 = drop
    const section = Math.floor(step / 32) % 4;
    const energy = section === 0 ? .55 : section === 1 ? .85 : section === 2 ? .72 : 1;

    // Chord roots (Hz) — Am → F → C → G (dark neon loop)
    const roots = [55, 43.65, 65.41, 49];
    const root = roots[bar];
    const third = root * (bar % 2 === 0 ? 1.2 : 1.25); // minor/major flavor
    const fifth = root * 1.5;

    // Slide continuous sub + pad roots with the chord
    try {
      const t = this.ctx.currentTime;
      if (s === 0) {
        this.menu.sub?.frequency?.cancelScheduledValues?.(t);
        this.menu.sub?.frequency?.setValueAtTime?.(this.menu.sub.frequency.value, t);
        this.menu.sub?.frequency?.exponentialRampToValueAtTime?.(Math.max(30, root), t + .08);
        this.menu.sub2?.frequency?.setValueAtTime?.(this.menu.sub2.frequency.value, t);
        this.menu.sub2?.frequency?.exponentialRampToValueAtTime?.(Math.max(40, root * 2), t + .08);
        // Retune pad fundamentals
        for (const v of this.menu.voices || []) {
          if (!v.base || !v.o) continue;
          const ratio = v.base / 55;
          const target = root * ratio;
          try {
            v.o.frequency.cancelScheduledValues(t);
            v.o.frequency.setValueAtTime(v.o.frequency.value, t);
            v.o.frequency.exponentialRampToValueAtTime(Math.max(20, target), t + .12);
          } catch {}
        }
        // Kick duck the pad filter
        if (this.menu.filter) {
          this.menu.filter.frequency.cancelScheduledValues(t);
          this.menu.filter.frequency.setValueAtTime(420, t);
          this.menu.filter.frequency.exponentialRampToValueAtTime(1200 + energy * 900, t + .28);
        }
      }
    } catch {}

    // —— Drums ——
    // Four-on-the-floor + syncopation on drop
    const kickHits = section >= 3
      ? [0, 4, 8, 11, 12]
      : section === 0
        ? [0, 8]
        : [0, 4, 8, 12];
    if (kickHits.includes(s)) {
      this.tone(72, .16, 'sine', .14 * energy, 28);
      this.tone(48, .22, 'sine', .1 * energy, 22);
      this.burst(.07, .06 * energy, 220, 18, 0, .2);
    }
    // Snare / clap
    if (s === 4 || s === 12) {
      this.burst(.1, .07 * energy, 3200, 420, 0, .45);
      this.burst(.06, .04 * energy, 1800, 200, .01, .25);
      this.tone(180, .05, 'triangle', .03 * energy, 90);
    }
    // Open/closed hats
    if (s % 2 === 1) {
      this.burst(.018, (.018 + energy * .018), 11000, 5200, 0, .2);
    }
    if (s % 4 === 2 && energy > .7) {
      this.burst(.05, .03 * energy, 9000, 3500, 0, .3);
    }
    // Ghost kick / percussion fill
    if (section >= 2 && (s === 6 || s === 14)) {
      this.burst(.04, .035 * energy, 900, 60, 0, .15);
      this.tone(90, .06, 'sine', .04 * energy, 40);
    }

    // —— Bass stabs (on top of continuous sub) ——
    if (s === 0 || s === 3 || s === 6 || s === 10) {
      this.tone(root, .2, 'sawtooth', .07 * energy, root * .85);
      this.tone(root * 2, .12, 'square', .03 * energy, root * 1.6, .02);
    }
    if (s === 8 || s === 11) {
      this.tone(fifth / 2, .16, 'sawtooth', .055 * energy, root * .9);
    }

    // —— Hook melody (the bit you remember) ——
    // Phrase over 2 bars, louder in groove/drop
    const hook = [
      440, 523.25, 659.25, 783.99, // A C E G
      698.46, 659.25, 523.25, 440, // F E C A
      392, 440, 523.25, 587.33,   // G A C D
      659.25, 523.25, 493.88, 440 // E C B A
    ];
    if (section !== 0 || step > 8) {
      if ([0, 2, 4, 6, 8, 10, 12, 14].includes(s)) {
        const n = hook[(Math.floor(step / 2) + bar * 2) % hook.length];
        const vol = (.028 + energy * .04) * (section === 2 ? .75 : 1);
        this.tone(n, .22, 'triangle', vol, n * .94);
        this.tone(n * 2, .14, 'sine', vol * .35, n * 1.7, .03);
      }
    }

    // —— Fast arp in lift/drop ——
    if (section >= 2) {
      const arp = [root * 2, third * 2, fifth * 2, root * 4, fifth * 2, third * 2];
      const a = arp[s % arp.length];
      this.tone(a, .09, 'square', .012 + energy * .012, a * .92);
    }

    // —— Chord stabs on downbeats of drop ——
    if (section === 3 && (s === 0 || s === 8)) {
      for (const f of [root * 2, third * 2, fifth * 2]) {
        this.tone(f, .35, 'sawtooth', .018, f * .9);
      }
      this.burst(.12, .04, 2400, 80, 0, .5);
    }

    // —— Riser into next section ——
    if (step % 32 === 28) {
      this.burst(.45, .05, 1800, 200, 0, .7);
      this.tone(110, .5, 'sawtooth', .04, 220);
      this.tone(220, .45, 'triangle', .025, 440, .05);
    }
    if (step % 32 === 0 && step > 0) {
      this.burst(.15, .06, 600, 40, 0, .4);
      this.tone(root, .3, 'sine', .08, root * .7);
    }

    // —— Sparse high neon ping ——
    if (s === 7 || s === 15) {
      this.tone(1320 + bar * 40, .08, 'sine', .02 * energy, 900);
      this.burst(.06, .015, 8000, 3000, 0, .25);
    }
  }

  stopMenuMusic() {
    if (this.menuTimer) {
      clearTimeout(this.menuTimer);
      this.menuTimer = null;
    }
    if (!this.menu) return;
    const m = this.menu;
    const t = this.ctx?.currentTime || 0;
    try {
      if (m.bus?.gain) {
        m.bus.gain.cancelScheduledValues(t);
        m.bus.gain.setValueAtTime(m.bus.gain.value, t);
        m.bus.gain.linearRampToValueAtTime(0, t + .4);
      }
    } catch {}
    setTimeout(() => {
      try {
        m.voices?.forEach(({ o }) => { try { o.stop(); } catch {} });
        m.lfo?.stop();
        m.sub?.stop();
        m.sub2?.stop();
        m.noiseSrc?.stop();
        m.airSrc?.stop();
      } catch {}
    }, 450);
    this.menu = null;
  }
}
