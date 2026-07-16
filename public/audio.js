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
  resume() { if(this.ctx?.state==='suspended') this.ctx.resume(); }
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
    const pitch=.94+Math.random()*.12;
    if(kind==='shotgun'){
      this.burst(.028,.42,9800,420,0,.3);this.burst(.18,.3,1050,38,0,.65);this.tone(78*pitch,.2,'sawtooth',.3,31);this.burst(.3,.08,2700,160,.07,.9);this.tone(340,.055,'square',.05,210,.22);
    }else if(kind==='pistol'){
      this.burst(.014,.24,12000,1200,0,.16);this.burst(.07,.15,2400,180,0,.3);this.tone(205*pitch,.075,'sawtooth',.16,72);this.tone(840,.022,'square',.045,410,.052);
    }else{
      this.burst(.018,.3,10500,900,0,.18);this.burst(.095,.21,1650,55,0,.24);this.tone(132*pitch,.11,'sawtooth',.22,42);this.tone(2550*pitch,.021,'square',.055,860);this.burst(.16,.06,3600,420,.045,.72);this.tone(510*pitch,.025,'square',.035,350,.066);
    }
  }
  hit(critical=false) { this.tone(critical?980:620,.055,'square',.1,critical?620:450); }
  kill() { this.tone(660,.07,'square',.09,880); this.tone(880,.08,'square',.07,1120,.06); }
  hurt() { this.tone(74,.2,'sawtooth',.2,38); this.burst(.12,.09,300); }
  shieldHit(broken=false) { this.tone(broken?118:760,.16,broken?'sawtooth':'sine',broken ? .16 : .09,broken?42:430);this.burst(.09,.07,broken?900:5200,broken?30:700,0,.45);if(broken)this.tone(310,.24,'square',.055,95,.05); }
  armorHit() { this.burst(.055,.11,1450,55);this.tone(92,.08,'triangle',.085,55); }
  shieldReady() { this.tone(520,.08,'sine',.045,780);this.tone(780,.11,'sine',.035,1040,.055); }
  empty() { this.tone(170,.035,'square',.08,130); }
  pickup() { this.tone(440,.09,'sine',.1,760); this.tone(760,.12,'sine',.08,1100,.06); }
  reload() { this.tone(250,.035,'square',.06,180); setTimeout(()=>this.tone(380,.045,'square',.06,260),950); }
  wave() { this.tone(82,.45,'sawtooth',.16,170); this.tone(350,.25,'sine',.06,580,.18); }
  enemyShot() { const p=.9+Math.random()*.2;this.burst(.05,.09,2400,180,0,.45);this.tone(205*p,.13,'sawtooth',.075,82);this.tone(920*p,.025,'square',.025,430,.035); }
  footstep(fast=false) { this.burst(.032,fast?.055:.038,fast?520:390); this.tone(fast?82:68,.035,'sine',.035,45); }
  jet() { this.burst(.07,.045,760); this.tone(92,.08,'sawtooth',.035,78); }
  land() { this.burst(.09,.09,260); this.tone(58,.12,'sine',.08,34); }
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
}
