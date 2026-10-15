(function(){
'use strict';

const DATA = window.GAME_DATA;
const LAYERS = DATA.LAYERS, ZONES = DATA.ZONES, NPCS = DATA.NPCS;
const PATTERNS = DATA.PATTERNS, LEGENDARY = DATA.LEGENDARY, COLORS = DATA.COLORS;
const WORLD_LEFT = ZONES[0].x1, WORLD_RIGHT = ZONES[ZONES.length-1].x2;
const NPC_POS = {};
[1,2,3,4].forEach(i => NPC_POS[i] = (ZONES[i].x1 + ZONES[i].x2)/2 - 200);

const State = {
  activeScreen: 'start',
  x: 0, y: 0, vy: 0, facing: 1,
  walkPhase: 0, walking: false, onGround: true,
  zoneId: 0, warm: 100, dry: 100, wet: 0,
  completed: DATA.SESSION.completed || {},
  artifacts: DATA.SESSION.artifacts || [],
  comfort: DATA.SESSION.comfort || {},
  score: DATA.SESSION.score || 0,
  mgWon: DATA.SESSION.mgWon || false,
  nearNPC: null, currentNPC: null,
  outfit: { base:'merino', mid:'down', outer:'membrane', color:'#C059FF', pattern:'solid' },
  blinkTimer: 0, blinkState: 0,
  particles: [], missionParticles: [],
  keys: {}, paused: false,
  timer: null,
  showStartSign: false,
  startSignTimer: 0
};

if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function(x,y,w,h,r){
    if (typeof r === 'number') r=[r,r,r,r];
    this.beginPath(); this.moveTo(x+r[0],y);
    this.lineTo(x+w-r[1],y); this.quadraticCurveTo(x+w,y,x+w,y+r[1]);
    this.lineTo(x+w,y+h-r[2]); this.quadraticCurveTo(x+w,y+h,x+w-r[2],y+h);
    this.lineTo(x+r[3],y+h); this.quadraticCurveTo(x,y+h,x,y+h-r[3]);
    this.lineTo(x,y+r[0]); this.quadraticCurveTo(x,y,x+r[0],y);
    this.closePath(); return this;
  };
}
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
function shade(hex, amt){
  const c = hex.replace('#','');
  const r = clamp(parseInt(c.substr(0,2),16)+amt, 0, 255);
  const g = clamp(parseInt(c.substr(2,2),16)+amt, 0, 255);
  const b = clamp(parseInt(c.substr(4,2),16)+amt, 0, 255);
  return '#'+[r,g,b].map(x=>x.toString(16).padStart(2,'0')).join('');
}
function getZoneAt(x){
  for (let i=0;i<ZONES.length;i++) if (x>=ZONES[i].x1 && x<=ZONES[i].x2) return i;
  return x<ZONES[0].x1 ? 0 : ZONES.length-1;
}
function blendColor(c1,c2,t){
  const p = h=>[parseInt(h.substr(1,2),16),parseInt(h.substr(3,2),16),parseInt(h.substr(5,2),16)];
  const a=p(c1), b=p(c2);
  return `rgb(${Math.round(a[0]+(b[0]-a[0])*t)},${Math.round(a[1]+(b[1]-a[1])*t)},${Math.round(a[2]+(b[2]-a[2])*t)})`;
}
function getOutfitStats(o){
  const b = LAYERS.base.items[o.base] || LAYERS.base.items.polyester;
  const m = LAYERS.mid.items[o.mid]   || LAYERS.mid.items.none;
  let ou = LAYERS.outer.items[o.outer] || LAYERS.outer.items.none;
  if (State.artifacts.length >= LEGENDARY.graphene.need && o.outer === 'membrane'){
    ou = Object.assign({}, ou, {breath:10, waterproof:10, windproof:10, uv:10, clo: ou.clo+0.5});
  }
  return {
    clo: b.clo + m.clo + ou.clo,
    windproof: ou.windproof, waterproof: ou.waterproof,
    breath: b.breath*0.35 + m.breath*0.15 + ou.breath*0.50,
    wetSens: b.wetSens*0.30 + m.wetSens*0.50 + ou.wetSens*0.20,
    uv: b.uv*0.40 + m.uv*0.35 + ou.uv*0.25,
    cover: Math.min(1, 0.7 + (m.clo>0?0.15:0) + (ou.clo>0?0.15:0))
  };
}

const Screens = {
  show(name){
    document.querySelectorAll('.screen.active').forEach(s => s.classList.remove('active'));
    const t = document.getElementById('screen-'+name);
    if (t){ t.classList.add('active'); State.activeScreen = name; }
    if (State.timer) { clearInterval(State.timer); State.timer = null; }
  }
};

const Audio2 = (()=>{
  let ctx = null, noiseBuf = null;
  const amb = { wind:null, rain:null, sand:null };
  function init(){
    if (ctx) return;
    try{
      ctx = new (window.AudioContext||window.webkitAudioContext)();
      const sr = ctx.sampleRate;
      noiseBuf = ctx.createBuffer(1, sr*3, sr);
      const d = noiseBuf.getChannelData(0);
      for (let i=0;i<d.length;i++) d[i] = Math.random()*2-1;
      amb.wind = makeAmb(380,'lowpass',0);
      amb.rain = makeAmb(2600,'highpass',0);
      amb.sand = makeAmb(900,'bandpass',0);
    }catch(e){}
  }
  function makeAmb(freq,type,vol){
    const src = ctx.createBufferSource(); src.buffer=noiseBuf; src.loop=true;
    const f = ctx.createBiquadFilter(); f.type=type; f.frequency.value=freq;
    const g = ctx.createGain(); g.gain.value=vol;
    src.connect(f); f.connect(g); g.connect(ctx.destination); src.start();
    return {gain:g, filter:f};
  }
  function setAmb(a, vol, freq){
    if (!a||!ctx) return;
    a.gain.gain.setTargetAtTime(vol, ctx.currentTime, 0.3);
    if (freq!==undefined) a.filter.frequency.setTargetAtTime(freq, ctx.currentTime, 0.3);
  }
  function tone(freq, dur, type='sine', vol=0.1){
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type=type; o.frequency.value=freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t+dur);
    o.connect(g); g.connect(ctx.destination);
    o.start(t); o.stop(t+dur);
  }
  function footstep(){
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer=noiseBuf; src.playbackRate.value=1.6;
    const f = ctx.createBiquadFilter(); f.type='lowpass'; f.frequency.value=900;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t+0.1);
    src.connect(f); f.connect(g); g.connect(ctx.destination);
    src.start(t); src.stop(t+0.13);
  }
  return {
    init, setAmb, footstep, amb,
    click(){ tone(720,0.08,'sine',0.09); },
    pop(){ tone(880,0.1,'sine',0.11); },
    success(){ [523,659,784,1047].forEach((f,i)=>setTimeout(()=>tone(f,0.25,'triangle',0.08), i*90)); },
    fail(){ [400,300,200].forEach((f,i)=>setTimeout(()=>tone(f,0.28,'sawtooth',0.06), i*120)); },
    win(){ [660,880,1320].forEach((f,i)=>setTimeout(()=>tone(f,0.22,'triangle',0.09), i*80)); },
    fanfare(){ [523,659,784,1047,1319].forEach((f,i)=>setTimeout(()=>tone(f,0.4,'triangle',0.1), i*140)); },
    resume(){ if (ctx && ctx.state === 'suspended') ctx.resume(); }
  };
})();

const MusicManager = (()=>{
  let audio = null;
  let enabled = true;
  let volume = 0.35;

  try {
    const saved = localStorage.getItem('meteo_music');
    if (saved !== null) {
      const s = JSON.parse(saved);
      enabled = s.enabled !== false;
      volume = typeof s.volume === 'number' ? s.volume : 0.35;
    }
  } catch(e){}

  function save(){
    try {
      localStorage.setItem('meteo_music', JSON.stringify({enabled, volume}));
    } catch(e){}
  }

  function init(){
    audio = document.getElementById('bgMusic');
    if (!audio) return;
    audio.volume = volume;
    audio.loop = true;
    tryPlay();
    updateButton();
  }

  function tryPlay(){
    if (!audio || !enabled) return;
    const p = audio.play();
    if (p && p.catch){
      p.catch(()=>{});
    }
  }

  function onUserInteraction(){
    if (!audio || !enabled || !audio.paused) return;
    tryPlay();
  }

  function toggle(){
    enabled = !enabled;
    if (enabled){
      tryPlay();
    } else {
      if (audio) audio.pause();
    }
    updateButton();
    save();
    return enabled;
  }

  function setVolume(v){
    volume = clamp(v, 0, 1);
    if (audio) audio.volume = volume;
    save();
  }

  function getVolume(){ return volume; }
  function isEnabled(){ return enabled; }

  function updateButton(){
    const btn = document.getElementById('musicBtn');
    if (!btn) return;
    btn.textContent = enabled ? (audio && !audio.paused ? '🔊' : '🔈') : '🔇';
    btn.title = enabled ? 'Музыка включена' : 'Музыка выключена';
  }

  setInterval(updateButton, 1000);

  return { init, toggle, setVolume, getVolume, isEnabled, onUserInteraction, updateButton };
})();

function drawCharacter(c, o){
  const {
    x=0, y=0, scale=1, facing=1, walkPhase=0, walking=false, jumping=0, blink=0,
    skin='#f5d8b8', hair='#8a5a3a', hairStyle='short', clothes='#C059FF',
    pattern='solid', isIntern=true, coatExtra=false
  } = o;

  c.save();
  c.translate(x, y);
  c.scale(scale*facing, scale);
  c.fillStyle = 'rgba(90,64,122,.22)';
  c.beginPath(); c.ellipse(0,0,22,5,0,0,7); c.fill();
  c.translate(0, -jumping*10);

  const bob = walking ? Math.abs(Math.sin(walkPhase*2))*1.6 : Math.sin(performance.now()/800)*0.8;
  c.translate(0, -bob);
  const swing = walking ? Math.sin(walkPhase) : 0;

  const bodyTopY = -58, bodyBotY = -24, headCY = -76, headR = 18;
  const extraW = coatExtra ? 3 : 0;

  c.strokeStyle = shade(clothes, -20);
  c.lineWidth = 7 + extraW*0.5; c.lineCap = 'round';
  c.beginPath(); c.moveTo(-9-extraW*0.3, bodyTopY+8); c.lineTo(-11 - swing*5, -32); c.stroke();
  c.fillStyle = skin;
  c.beginPath(); c.arc(-11 - swing*5, -31, 3.2, 0, 7); c.fill();

  c.strokeStyle = '#8a6a50'; c.lineWidth = 7;
  c.beginPath(); c.moveTo(-4,-24); c.lineTo(-4 - swing*6, -5); c.stroke();
  c.fillStyle = '#5a4030';
  c.beginPath(); c.roundRect(-8 - swing*6, -7, 11, 7, 3); c.fill();

  if (isIntern){
    c.fillStyle = '#c8a878';
    c.beginPath(); c.roundRect(-23-extraW, bodyTopY+4, 12, 22, 4); c.fill();
    c.fillStyle = '#a08060';
    c.beginPath(); c.roundRect(-23-extraW, bodyTopY+11, 12, 3, 1); c.fill();
    c.beginPath(); c.roundRect(-23-extraW, bodyTopY+17, 12, 3, 1); c.fill();
    c.strokeStyle = '#a08060'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(-8, bodyTopY+4); c.lineTo(2, bodyTopY+16); c.stroke();
  }

  const torsoW = 13 + extraW;
  const torsoH = bodyBotY - bodyTopY;
  c.fillStyle = clothes;
  c.beginPath(); c.roundRect(-torsoW, bodyTopY, torsoW*2, torsoH, 10); c.fill();

  drawPattern(c, -torsoW, bodyTopY, torsoW*2, torsoH, pattern);

  c.fillStyle = shade(clothes, -40);
  c.beginPath(); c.roundRect(-torsoW+1, bodyTopY-1, torsoW*2-2, 4, 2); c.fill();

  c.strokeStyle = 'rgba(90,64,122,.35)'; c.lineWidth = 1.5;
  c.beginPath(); c.moveTo(0, bodyTopY+4); c.lineTo(0, bodyBotY-2); c.stroke();

  c.fillStyle = '#8a6a50';
  c.fillRect(-torsoW, bodyBotY-6, torsoW*2, 4);
  c.fillStyle = '#f0e0a0';
  c.beginPath(); c.roundRect(-4, bodyBotY-8, 8, 7, 2); c.fill();

  if (isIntern){
    c.fillStyle = '#f0e0a0';
    c.beginPath(); c.arc(-6-extraW*0.4, bodyTopY+12, 3.5, 0, 7); c.fill();
    c.fillStyle = '#C059FF';
    c.beginPath(); c.arc(-6-extraW*0.4, bodyTopY+12, 1.8, 0, 7); c.fill();
    c.fillStyle = '#f0e0a0';
    c.beginPath(); c.ellipse(-torsoW+2, bodyTopY+4, 4, 3, 0, 0, 7); c.fill();
  }

  c.strokeStyle = '#8a6a50'; c.lineWidth = 7;
  c.beginPath(); c.moveTo(4,-24); c.lineTo(4 + swing*6, -5); c.stroke();
  c.fillStyle = '#5a4030';
  c.beginPath(); c.roundRect(-3 + swing*6, -7, 11, 7, 3); c.fill();

  c.strokeStyle = clothes;
  c.lineWidth = 7 + extraW*0.5;
  c.beginPath(); c.moveTo(9+extraW*0.3, bodyTopY+8); c.lineTo(11 + swing*5, -32); c.stroke();
  c.fillStyle = skin;
  c.beginPath(); c.arc(11 + swing*5, -31, 3.2, 0, 7); c.fill();

  c.fillStyle = shade(skin, -20);
  c.fillRect(-4, bodyTopY-3, 8, 5);

  c.fillStyle = skin;
  c.beginPath(); c.arc(0, headCY, headR, 0, 7); c.fill();
  c.beginPath(); c.arc(-headR+2, headCY, 3, 0, 7); c.fill();
  c.beginPath(); c.arc(headR-2, headCY, 3, 0, 7); c.fill();

  if (hairStyle !== 'bald'){
    c.fillStyle = hair;
    c.beginPath();
    c.arc(0, headCY, headR+1, Math.PI*1.02, Math.PI*1.98);
    c.closePath(); c.fill();
    if (hairStyle === 'short'){
      c.beginPath();
      c.moveTo(-headR-1, headCY-4);
      c.quadraticCurveTo(-8, headCY-headR-3, 4, headCY-12);
      c.quadraticCurveTo(11, headCY-headR+1, headR+1, headCY-5);
      c.lineTo(headR+1, headCY-12);
      c.quadraticCurveTo(0, headCY-headR-6, -headR-1, headCY-12);
      c.closePath(); c.fill();
      c.beginPath(); c.ellipse(-headR+1, headCY+2, 5, 8, -0.15, 0, 7); c.fill();
      c.beginPath(); c.ellipse(headR-1, headCY+2, 5, 8, 0.15, 0, 7); c.fill();
    } else if (hairStyle === 'long'){
      c.beginPath(); c.ellipse(-headR+2, headCY+10, 7, 16, -0.1, 0, 7); c.fill();
      c.beginPath(); c.ellipse(headR-2, headCY+10, 7, 16, 0.1, 0, 7); c.fill();
      c.beginPath();
      c.moveTo(-headR-1, headCY-4);
      c.quadraticCurveTo(0, headCY-headR-4, headR+1, headCY-4);
      c.lineTo(headR+1, headCY-12);
      c.quadraticCurveTo(0, headCY-headR-7, -headR-1, headCY-12);
      c.closePath(); c.fill();
    }
  }

  const eyeY = headCY + 1;
  if (blink > 0.5){
    c.strokeStyle = '#4a3525'; c.lineWidth = 2; c.lineCap='round';
    c.beginPath();
    c.moveTo(-9, eyeY); c.lineTo(-4, eyeY);
    c.moveTo(4, eyeY); c.lineTo(9, eyeY);
    c.stroke();
  } else {
    c.fillStyle = '#fff';
    c.beginPath(); c.ellipse(-6.5, eyeY, 4.2, 5, 0, 0, 7); c.fill();
    c.beginPath(); c.ellipse(6.5, eyeY, 4.2, 5, 0, 0, 7); c.fill();
    c.fillStyle = '#b07848';
    c.beginPath(); c.arc(-6.5, eyeY+0.5, 3.4, 0, 7); c.fill();
    c.beginPath(); c.arc(6.5, eyeY+0.5, 3.4, 0, 7); c.fill();
    c.fillStyle = '#3a2515';
    c.beginPath(); c.arc(-6.5, eyeY+1, 1.8, 0, 7); c.fill();
    c.beginPath(); c.arc(6.5, eyeY+1, 1.8, 0, 7); c.fill();
    c.fillStyle = '#fff';
    c.beginPath(); c.arc(-7.8, eyeY-1.4, 1.4, 0, 7); c.fill();
    c.beginPath(); c.arc(5.2, eyeY-1.4, 1.4, 0, 7); c.fill();
    c.beginPath(); c.arc(-5.4, eyeY+1.8, 0.8, 0, 7); c.fill();
    c.beginPath(); c.arc(7.6, eyeY+1.8, 0.8, 0, 7); c.fill();
  }
  c.fillStyle = 'rgba(240,160,160,.45)';
  c.beginPath(); c.arc(-12, headCY+6, 3.4, 0, 7); c.fill();
  c.beginPath(); c.arc(12, headCY+6, 3.4, 0, 7); c.fill();
  c.strokeStyle = '#a06848'; c.lineWidth = 1.8; c.lineCap='round';
  c.beginPath(); c.arc(0, headCY+7, 4.8, 0.2*Math.PI, 0.8*Math.PI); c.stroke();

  c.restore();
}
function drawPattern(c, x, y, w, h, pattern){
  if (pattern === 'solid') return;
  c.save();
  c.beginPath(); c.roundRect(x, y, w, h, 10); c.clip();
  const light = 'rgba(255,255,255,.45)';
  if (pattern === 'stripes'){
    c.fillStyle = light;
    for (let i=-h; i<w+h; i+=10){
      c.beginPath();
      c.moveTo(x+i, y); c.lineTo(x+i+5, y);
      c.lineTo(x+i+5+h, y+h); c.lineTo(x+i+h, y+h);
      c.closePath(); c.fill();
    }
  } else if (pattern === 'dots'){
    c.fillStyle = light;
    for (let yy=y+6; yy<y+h; yy+=12){
      for (let xx=x+6; xx<x+w; xx+=12){
        const off = ((yy-y)/12)%2 === 0 ? 0 : 6;
        c.beginPath(); c.arc(xx+off, yy, 2.5, 0, 7); c.fill();
      }
    }
  } else if (pattern === 'stars'){
    c.fillStyle = 'rgba(255,255,255,.9)';
    for (let yy=y+7; yy<y+h; yy+=14){
      for (let xx=x+7; xx<x+w; xx+=14){
        const off = ((yy-y)/14)%2 === 0 ? 0 : 7;
        drawStar(c, xx+off, yy, 3.5, 1.6, 5);
      }
    }
  } else if (pattern === 'camo'){
    const spots = [[0.2,0.2,7],[0.6,0.3,9],[0.4,0.6,8],[0.8,0.7,6],[0.1,0.75,7],[0.5,0.15,6],[0.75,0.5,5]];
    c.fillStyle = 'rgba(255,255,255,.3)';
    spots.forEach(([ux,uy,r])=>{ c.beginPath(); c.ellipse(x+w*ux, y+h*uy, r, r*0.7, 0, 0, 7); c.fill(); });
  } else if (pattern === 'grid'){
    c.strokeStyle = light; c.lineWidth = 1.5;
    for (let xx=x+8; xx<x+w; xx+=10){ c.beginPath(); c.moveTo(xx,y); c.lineTo(xx,y+h); c.stroke(); }
    for (let yy=y+8; yy<y+h; yy+=10){ c.beginPath(); c.moveTo(x,yy); c.lineTo(x+w,yy); c.stroke(); }
  }
  c.restore();
}
function drawStar(c, cx, cy, r, ri, spikes){
  let rot = -Math.PI/2;
  const step = Math.PI/spikes;
  c.beginPath();
  c.moveTo(cx+Math.cos(rot)*r, cy+Math.sin(rot)*r);
  for (let i=0;i<spikes;i++){
    rot += step; c.lineTo(cx+Math.cos(rot)*ri, cy+Math.sin(rot)*ri);
    rot += step; c.lineTo(cx+Math.cos(rot)*r, cy+Math.sin(rot)*r);
  }
  c.closePath(); c.fill();
}

function spawnParticles(){
  State.particles = [];
  const z = ZONES[State.zoneId];
  const W = innerWidth, H = innerHeight;
  const counts = { none:0, snow:75, rain:95, fog:25, sand:60 };
  const n = counts[z.weather] || 0;
  for (let i=0;i<n;i++){
    const p = { x: Math.random()*W, y: Math.random()*H, vx:0, vy:0, size:2, a: Math.random()*7, phase: Math.random()*7 };
    if (z.weather==='snow'){ p.vy=25+Math.random()*35; p.vx=Math.sin(p.a)*15; p.size=2+Math.random()*3; }
    if (z.weather==='rain'){ p.vy=400+Math.random()*300; p.vx=-40; p.size=10+Math.random()*6; }
    if (z.weather==='fog') { p.vy=6+Math.random()*8; p.vx=18+Math.random()*22; p.size=70+Math.random()*90; }
    if (z.weather==='sand'){ p.vy=0; p.vx=180+Math.random()*250; p.size=2+Math.random()*4; }
    State.particles.push(p);
  }
}
function drawWeather(c, dt, W, H){
  const z = ZONES[State.zoneId];
  if (z.weather==='snow'){
    c.fillStyle = 'rgba(255,255,255,.95)';
    for (const p of State.particles){
      p.y += p.vy*dt; p.x += Math.sin(p.phase + performance.now()/800)*22*dt;
      if (p.y>H){ p.y=-10; p.x=Math.random()*W; }
      if (p.x<-10) p.x=W+10; if (p.x>W+10) p.x=-10;
      c.beginPath(); c.arc(p.x, p.y, p.size, 0, 7); c.fill();
    }
  } else if (z.weather==='rain'){
    c.strokeStyle = 'rgba(168,200,232,.75)'; c.lineWidth=1.8; c.lineCap='round';
    for (const p of State.particles){
      p.y += p.vy*dt; p.x += p.vx*dt;
      if (p.y>H){ p.y=-20; p.x=Math.random()*W; }
      if (p.x<-20) p.x=W+20;
      c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x+p.vx*0.04, p.y+p.size); c.stroke();
    }
  } else if (z.weather==='fog'){
    for (const p of State.particles){
      p.x += p.vx*dt;
      if (p.x>W+100) p.x=-100;
      const g = c.createRadialGradient(p.x,p.y,0,p.x,p.y,p.size);
      g.addColorStop(0,'rgba(240,236,224,.25)');
      g.addColorStop(1,'rgba(240,236,224,0)');
      c.fillStyle = g; c.beginPath(); c.arc(p.x,p.y,p.size,0,7); c.fill();
    }
  } else if (z.weather==='sand'){
    c.strokeStyle = 'rgba(240,200,144,.55)'; c.lineWidth=2; c.lineCap='round';
    for (const p of State.particles){
      p.x += p.vx*dt;
      if (p.x>W+40){ p.x=-40; p.y=Math.random()*H; }
      c.beginPath(); c.moveTo(p.x,p.y); c.lineTo(p.x-32,p.y+2); c.stroke();
    }
  }
}

function drawBase(c,x,y){
  c.save(); c.translate(x,y);
  c.fillStyle = '#d0b898';
  c.beginPath(); c.arc(0,0,70,Math.PI,0); c.fill();
  c.fillStyle = '#c0a880';
  c.beginPath(); c.arc(0,0,65,Math.PI,0); c.fill();
  c.fillStyle = '#f5e0c0'; c.fillRect(-70,-3,140,3);
  c.fillStyle = '#8a6a50';
  c.beginPath(); c.roundRect(-14,-50,28,50,5); c.fill();
  c.fillStyle = '#f0e0a0';
  c.beginPath(); c.roundRect(-48,-44,16,14,3); c.fill();
  c.beginPath(); c.roundRect(32,-44,16,14,3); c.fill();
  const t = performance.now()/500;
  const alpha = 0.7 + Math.sin(t)*0.3;
  c.fillStyle = `rgba(194,89,255,${alpha})`;
  c.beginPath(); c.arc(0,-76,7,0,7); c.fill();
  c.fillStyle = `rgba(240,224,160,${alpha})`;
  c.beginPath(); c.arc(0,-76,3.5,0,7); c.fill();
  c.restore();
}
function drawMountain(c,x,y,s){
  c.save(); c.translate(x,y); c.scale(s,s);
  c.fillStyle = '#b8c0d0';
  c.beginPath(); c.moveTo(-130,0); c.lineTo(0,-170); c.lineTo(130,0); c.closePath(); c.fill();
  c.fillStyle = '#fafaff';
  c.beginPath();
  c.moveTo(-34,-118); c.lineTo(0,-170); c.lineTo(34,-118);
  c.lineTo(14,-126); c.lineTo(0,-112); c.lineTo(-14,-126);
  c.closePath(); c.fill();
  c.restore();
}
function drawMammoth(c,x,y,s){
  c.save(); c.translate(x,y); c.scale(s,s);
  c.fillStyle = '#b89878';
  c.beginPath(); c.ellipse(0,-50,55,38,0,0,7); c.fill();
  c.beginPath(); c.ellipse(55,-55,28,30,0,0,7); c.fill();
  const sway = Math.sin(performance.now()/700)*3;
  c.strokeStyle = '#b89878'; c.lineWidth=12; c.lineCap='round';
  c.beginPath(); c.moveTo(70,-50); c.quadraticCurveTo(85+sway,-30,78+sway,-8); c.stroke();
  c.strokeStyle = '#fafaff'; c.lineWidth=4;
  c.beginPath(); c.moveTo(70,-40); c.quadraticCurveTo(90,-25,92,-15); c.stroke();
  c.fillStyle = '#a08060';
  c.fillRect(-35,-20,16,20); c.fillRect(-5,-20,16,20); c.fillRect(20,-20,16,20);
  const blink = (performance.now()/2500) % 3 < 0.15;
  if (blink){
    c.strokeStyle='#fafaff'; c.lineWidth=1.5;
    c.beginPath(); c.moveTo(63,-58); c.lineTo(67,-58); c.stroke();
  } else {
    c.fillStyle='#fff'; c.beginPath(); c.arc(65,-58,2.5,0,7); c.fill();
    c.fillStyle='#3a2515'; c.beginPath(); c.arc(65,-58,1.2,0,7); c.fill();
  }
  c.restore();
}
function drawIgloo(c,x,y,s){
  c.save(); c.translate(x,y); c.scale(s,s);
  c.fillStyle = '#eaf0ff';
  c.beginPath(); c.arc(0,0,42,Math.PI,0); c.fill();
  c.fillRect(-42,-2,84,2);
  c.strokeStyle = '#c8d4e8'; c.lineWidth=1.5;
  for (let i=0;i<4;i++){ c.beginPath(); c.moveTo(-30+i*20,-28+i*4); c.lineTo(-10+i*20,-28+i*4); c.stroke(); }
  c.fillStyle = '#8a98b0';
  c.beginPath(); c.arc(0,-2,13,Math.PI,0); c.fill();
  c.restore();
}
function drawTemple(c,x,y,s){
  c.save(); c.translate(x,y); c.scale(s,s);
  c.fillStyle = '#d89878'; c.fillRect(-60,-100,120,100);
  c.fillStyle = '#e8a878';
  c.beginPath(); c.moveTo(-80,-100); c.lineTo(0,-155); c.lineTo(80,-100); c.closePath(); c.fill();
  c.beginPath(); c.moveTo(-60,-140); c.lineTo(0,-190); c.lineTo(60,-140); c.closePath(); c.fill();
  const glow = 0.65 + Math.sin(performance.now()/500)*0.25;
  c.fillStyle = `rgba(240,224,160,${glow})`;
  c.fillRect(-50,-92,100,4); c.fillRect(-50,-70,100,4);
  c.fillStyle = '#8a6850'; c.fillRect(-15,-60,30,60);
  c.restore();
}
function drawPalm(c,x,y,s){
  c.save(); c.translate(x,y); c.scale(s,s);
  c.strokeStyle = '#a08060'; c.lineWidth=8; c.lineCap='round';
  c.beginPath(); c.moveTo(0,0); c.quadraticCurveTo(10,-40,5,-90); c.stroke();
  const sway = Math.sin(performance.now()/900 + x)*0.15;
  c.fillStyle = '#a8c898';
  for (let i=0;i<5;i++){
    c.save(); c.translate(5,-90); c.rotate(i*1.2 + sway);
    c.beginPath(); c.ellipse(30,0,30,7,0,0,7); c.fill();
    c.restore();
  }
  c.restore();
}
function drawBigBen(c,x,y,s){
  c.save(); c.translate(x,y); c.scale(s,s);
  c.fillStyle = '#b8a890'; c.fillRect(-25,-220,50,220);
  c.fillStyle = '#a89878'; c.fillRect(-30,-240,60,24);
  c.beginPath(); c.moveTo(-30,-240); c.lineTo(0,-292); c.lineTo(30,-240); c.closePath(); c.fill();
  c.fillStyle = '#f0e0a0';
  c.beginPath(); c.arc(0,-200,15,0,7); c.fill();
  const t = performance.now()/1000;
  c.strokeStyle = '#5a4030'; c.lineWidth=2;
  const minA = (t/3) % (Math.PI*2);
  const hourA = (t/36) % (Math.PI*2);
  c.beginPath(); c.moveTo(0,-200); c.lineTo(Math.sin(hourA)*10, -200-Math.cos(hourA)*10); c.stroke();
  c.beginPath(); c.moveTo(0,-200); c.lineTo(Math.sin(minA)*13, -200-Math.cos(minA)*13); c.stroke();
  c.fillStyle = 'rgba(240,224,160,.5)';
  c.fillRect(-10,-160,8,10); c.fillRect(2,-160,8,10);
  c.fillRect(-10,-130,8,10); c.fillRect(2,-130,8,10);
  c.restore();
}
function drawLamp(c,x,y,s){
  c.save(); c.translate(x,y); c.scale(s,s);
  c.fillStyle = '#7a6850'; c.fillRect(-3,-120,6,120);
  const pulse = 0.85 + Math.sin(performance.now()/600 + x)*0.15;
  c.fillStyle = `rgba(240,224,160,${pulse})`;
  c.beginPath(); c.ellipse(0,-125,12,16,0,0,7); c.fill();
  const g = c.createRadialGradient(0,-125,0,0,-125,90);
  g.addColorStop(0,`rgba(240,224,160,${0.5*pulse})`);
  g.addColorStop(1,'rgba(240,224,160,0)');
  c.fillStyle = g; c.beginPath(); c.arc(0,-125,90,0,7); c.fill();
  c.restore();
}
function drawHouse(c,x,y,s){
  c.save(); c.translate(x,y); c.scale(s,s);
  c.fillStyle = '#d8b898'; c.fillRect(-50,-90,100,90);
  c.fillStyle = '#b89878';
  c.beginPath(); c.moveTo(-60,-90); c.lineTo(0,-142); c.lineTo(60,-90); c.closePath(); c.fill();
  c.fillStyle = '#f0e0a0';
  c.fillRect(-32,-60,20,20); c.fillRect(10,-60,20,20);
  c.fillStyle = '#8a6850'; c.fillRect(-14,-40,28,40);
  c.restore();
}
function drawPyramid(c,x,y,s){
  c.save(); c.translate(x,y); c.scale(s,s);
  c.fillStyle = '#f0d8a8';
  c.beginPath(); c.moveTo(-120,0); c.lineTo(0,-170); c.lineTo(120,0); c.closePath(); c.fill();
  c.fillStyle = 'rgba(160,120,80,.15)';
  c.beginPath(); c.moveTo(0,-170); c.lineTo(120,0); c.lineTo(0,0); c.closePath(); c.fill();
  c.restore();
}
function drawCactus(c,x,y,s){
  c.save(); c.translate(x,y); c.scale(s,s);
  c.fillStyle = '#a8c890';
  c.fillRect(-8,-90,16,90);
  c.beginPath(); c.roundRect(-32,-70,20,40,8); c.fill();
  c.beginPath(); c.roundRect(12,-80,20,50,8); c.fill();
  c.fillRect(-30,-30,20,8); c.fillRect(10,-30,20,8);
  c.restore();
}
function drawCamel(c,x,y,s){
  c.save(); c.translate(x,y); c.scale(s,s);
  const ph = performance.now()/800 + x*0.01;
  c.translate(Math.sin(ph)*10,0);
  c.fillStyle = '#e8c898';
  c.beginPath(); c.ellipse(0,-50,45,25,0,0,7); c.fill();
  c.beginPath(); c.arc(-10,-72,20,Math.PI,0); c.fill();
  const headBob = Math.sin(performance.now()/500)*2;
  c.beginPath(); c.ellipse(-50,-70+headBob,15,12,0,0,7); c.fill();
  c.lineWidth=10; c.strokeStyle='#e8c898'; c.lineCap='round';
  c.beginPath(); c.moveTo(-35,-55); c.quadraticCurveTo(-45,-65,-50,-70+headBob); c.stroke();
  const legPh = performance.now()/300;
  c.strokeStyle='#d8b878'; c.lineWidth=5;
  [[-30,-1],[-15,1],[20,-1],[30,1]].forEach(([lx, dir])=>{
    const lxOff = Math.sin(legPh + lx*0.1) * 3 * dir;
    c.beginPath(); c.moveTo(lx,-30); c.lineTo(lx+lxOff,0); c.stroke();
  });
  c.restore();
}

function drawStartSign(c, W, H, alpha){
  c.save();
  c.globalAlpha = alpha;

  const bw = Math.min(420, W*0.7);
  const bh = 130;
  const bx = W/2 - bw/2;
  const by = H/2 - bh/2 - 40;

  c.fillStyle = '#8a6a50';
  c.fillRect(W/2 - bw*0.35, by+bh, 12, 90);
  c.fillRect(W/2 + bw*0.35 - 12, by+bh, 12, 90);

  c.fillStyle = '#C059FF';
  c.beginPath(); c.roundRect(bx, by, bw, bh, 18); c.fill();
  c.strokeStyle = '#f0e0a0'; c.lineWidth = 5;
  c.beginPath(); c.roundRect(bx+8, by+8, bw-16, bh-16, 12); c.stroke();

  c.fillStyle = '#f0e0a0';
  c.beginPath();
  c.moveTo(bx, by); c.lineTo(bx-40, by+30); c.lineTo(bx, by+60); c.closePath(); c.fill();
  c.beginPath();
  c.moveTo(bx+bw, by); c.lineTo(bx+bw+40, by+30); c.lineTo(bx+bw, by+60); c.closePath(); c.fill();

  c.fillStyle = '#fff';
  c.font = `900 ${Math.min(64, W*0.1)}px system-ui, sans-serif`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.shadowColor = 'rgba(90,64,122,.5)';
  c.shadowBlur = 12;
  c.fillText('СТАРТ', W/2, by + bh/2);
  c.shadowBlur = 0;

  c.restore();
}

const GameEngine = (()=>{
  const cv = document.getElementById('game');
  const ctx = cv.getContext('2d');
  let camX = 0, groundY = 0, lastTime = performance.now();

  function resize(){
    const dpr = window.devicePixelRatio || 1;
    cv.width = innerWidth*dpr; cv.height = innerHeight*dpr;
    cv.style.width = innerWidth+'px'; cv.style.height = innerHeight+'px';
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  addEventListener('resize', resize); resize();

  function loop(t){
    const dt = Math.min(0.05, (t-lastTime)/1000);
    lastTime = t;
    groundY = innerHeight - 140;

    if (State.activeScreen === 'world') updatePlayer(dt);

    State.blinkTimer += dt;
    if (State.blinkTimer > 3.5){
      State.blinkTimer = 0; State.blinkState = 1;
      setTimeout(()=>State.blinkState=0, 130);
    }

    if (State.showStartSign){
      State.startSignTimer += dt;
      if (State.startSignTimer > 3.2) State.showStartSign = false;
    }

    camX = State.x - innerWidth/2;

    drawSky();
    drawDecor();
    drawGround();

    const z = ZONES[State.zoneId];
    if (z.weather==='snow' || z.weather==='rain') drawWeather(ctx, dt, innerWidth, innerHeight);

    drawNPCs();
    drawPlayer();

    if (z.weather==='fog' || z.weather==='sand') drawWeather(ctx, dt, innerWidth, innerHeight);

    drawSignposts();
    drawVignette();

    if (State.showStartSign){
      const t = State.startSignTimer;
      let alpha = 1;
      if (t < 0.4) alpha = t/0.4;
      else if (t > 2.6) alpha = 1-(t-2.6)/0.6;
      alpha = clamp(alpha, 0, 1);
      drawStartSign(ctx, innerWidth, innerHeight, alpha);
    }

    if (State.activeScreen === 'world') updateHUD();
    requestAnimationFrame(loop);
  }

  function drawSky(){
    const z = ZONES[State.zoneId];
    const W = innerWidth, H = innerHeight;
    let s1=z.sky1, s2=z.sky2;
    const nextZ = ZONES[State.zoneId+1], prevZ = ZONES[State.zoneId-1];
    const edge = 260;
    if (nextZ && State.x > z.x2-edge){
      const t = Math.min(1,(State.x-(z.x2-edge))/edge);
      s1 = blendColor(z.sky1,nextZ.sky1,t);
      s2 = blendColor(z.sky2,nextZ.sky2,t);
    } else if (prevZ && State.x < z.x1+edge){
      const t = 1 - (State.x-z.x1)/edge;
      s1 = blendColor(z.sky1,prevZ.sky1,Math.min(1,t));
      s2 = blendColor(z.sky2,prevZ.sky2,Math.min(1,t));
    }
    const g = ctx.createLinearGradient(0,0,0,H);
    g.addColorStop(0,s1); g.addColorStop(1,s2);
    ctx.fillStyle = g; ctx.fillRect(0,0,W,H);
  }
  function drawGround(){
    const W = innerWidth, H = innerHeight;
    const z = ZONES[State.zoneId];
    const nextZ = ZONES[State.zoneId+1], prevZ = ZONES[State.zoneId-1];
    let top=z.groundTop, bot=z.ground;
    const edge = 260;
    if (nextZ && State.x > z.x2-edge){
      const t = Math.min(1,(State.x-(z.x2-edge))/edge);
      top = blendColor(z.groundTop,nextZ.groundTop,t);
      bot = blendColor(z.ground,nextZ.ground,t);
    } else if (prevZ && State.x < z.x1+edge){
      const t = 1 - (State.x-z.x1)/edge;
      top = blendColor(z.groundTop,prevZ.groundTop,Math.min(1,t));
      bot = blendColor(z.ground,prevZ.ground,Math.min(1,t));
    }
    const g = ctx.createLinearGradient(0, groundY, 0, H);
    g.addColorStop(0,top); g.addColorStop(1,bot);
    ctx.fillStyle = g; ctx.fillRect(0, groundY, W, H-groundY);
    ctx.fillStyle = 'rgba(255,255,255,.25)';
    ctx.fillRect(0, groundY, W, 3);
  }
  function drawDecor(){
    const W = innerWidth;
    ZONES.forEach((z)=>{
      const cx = (z.x1+z.x2)/2 - camX + W/2 - 200;
      if (cx < -W || cx > W*2) return;
      ctx.save();
      if (z.decor==='base'){ drawBase(ctx,cx-300,groundY); drawBase(ctx,cx+300,groundY); }
      if (z.decor==='snow'){
        drawMountain(ctx,cx-500,groundY,1.3);
        drawMountain(ctx,cx-200,groundY,1.7);
        drawMountain(ctx,cx+400,groundY,1.4);
        drawMammoth(ctx,cx+100,groundY,1);
        drawIgloo(ctx,cx+500,groundY,1);
      }
      if (z.decor==='vietnam'){
        drawTemple(ctx,cx+250,groundY,1);
        drawPalm(ctx,cx-450,groundY,1); drawPalm(ctx,cx-250,groundY,1.15);
        drawPalm(ctx,cx+450,groundY,1); drawPalm(ctx,cx+600,groundY,0.9);
      }
      if (z.decor==='london'){
        drawBigBen(ctx,cx+400,groundY,1);
        drawLamp(ctx,cx-400,groundY,1); drawLamp(ctx,cx+100,groundY,1);
        drawHouse(ctx,cx-600,groundY,0.8);
      }
      if (z.decor==='sahara'){
        const sunX = W-130, sunY = 120;
        const pulse = 150 + Math.sin(performance.now()/1500)*8;
        const sg = ctx.createRadialGradient(sunX,sunY,10,sunX,sunY,pulse);
        sg.addColorStop(0,'rgba(245,216,168,.9)');
        sg.addColorStop(1,'rgba(240,200,144,0)');
        ctx.fillStyle = sg;
        ctx.beginPath(); ctx.arc(sunX,sunY,pulse,0,7); ctx.fill();
        ctx.fillStyle = '#faf0d0';
        ctx.beginPath(); ctx.arc(sunX,sunY,44,0,7); ctx.fill();
        drawPyramid(ctx,cx-400,groundY,1.2); drawPyramid(ctx,cx+200,groundY,1.5);
        drawCactus(ctx,cx-100,groundY,1); drawCactus(ctx,cx+550,groundY,0.85);
        drawCamel(ctx,cx+400,groundY,1);
      }
      ctx.restore();
    });
  }
  function drawPlayer(){
    drawCharacter(ctx, {
      x: State.x - camX, y: groundY, scale: 1.5, facing: State.facing,
      walkPhase: State.walkPhase, walking: State.walking,
      jumping: State.y/30, blink: State.blinkState,
      skin: '#f5d8b8', hair: '#8a5a3a', hairStyle: 'short',
      clothes: State.outfit.color, pattern: State.outfit.pattern, isIntern: true
    });
  }
  function drawNPCs(){
    const W = innerWidth;
    Object.keys(NPC_POS).forEach(id=>{
      const nx = NPC_POS[id] - camX;
      if (nx < -200 || nx > W+200) return;
      const npc = NPCS[id];
      const npcBlink = (performance.now()/1500 + +id) % 3 < 0.12 ? 1 : 0;
      drawCharacter(ctx, {
        x: nx, y: groundY, scale: 1.5, facing: -1,
        walkPhase: 0, walking: false, jumping: 0, blink: npcBlink,
        skin: npc.skin, hair: npc.hair, hairStyle: npc.hairStyle,
        clothes: npc.clothes, pattern: 'solid', isIntern: false
      });
      ctx.save();
      ctx.textAlign = 'center';
      const bY = groundY - 160;
      ctx.font = 'bold 13px system-ui';
      const tw = ctx.measureText(npc.name).width + 30;
      ctx.fillStyle = State.completed[id] ? 'rgba(200,220,168,.95)' : 'rgba(255,255,255,.9)';
      ctx.beginPath(); ctx.roundRect(nx-tw/2, bY-18, tw, 24, 10); ctx.fill();
      ctx.strokeStyle = State.completed[id] ? '#b8c8a8' : '#C059FF';
      ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = State.completed[id] ? '#5a7038' : '#40305a';
      ctx.fillText(npc.name, nx, bY);
      if (!State.completed[id]){
        const bob = Math.sin(performance.now()/400)*4;
        ctx.font = '24px system-ui';
        ctx.fillText('❗', nx, bY-28 + bob);
      } else {
        ctx.font = '20px system-ui';
        ctx.fillText('✅', nx, bY-26);
      }
      ctx.restore();
    });
  }
  function drawSignposts(){
    const W = innerWidth;
    ZONES.forEach((z, i)=>{
      if (i===0) return;
      const sx = z.x1 - camX;
      if (sx < -80 || sx > W+80) return;
      ctx.save();
      ctx.translate(sx, groundY);
      ctx.fillStyle = '#a08060'; ctx.fillRect(-3,-90,6,90);
      ctx.fillStyle = '#f5e0c0';
      ctx.beginPath(); ctx.roundRect(-85,-152,170,54,10); ctx.fill();
      ctx.strokeStyle = '#e0c8a0'; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = '#40305a';
      ctx.font = 'bold 13px system-ui'; ctx.textAlign = 'center';
      ctx.fillText(z.name, 0, -134);
      ctx.font = '11px system-ui'; ctx.fillStyle = '#60507a';
      ctx.fillText(`${z.temp>0?'+':''}${z.temp}°C · 💨${z.wind} · 💧${z.rain}`, 0, -118);
      ctx.restore();
    });
  }
  function drawVignette(){
    const W = innerWidth, H = innerHeight;
    const vg = ctx.createRadialGradient(W/2,H/2,Math.min(W,H)*0.45,W/2,H/2,Math.max(W,H)*0.8);
    vg.addColorStop(0,'rgba(0,0,0,0)');
    vg.addColorStop(1,'rgba(90,64,122,.22)');
    ctx.fillStyle = vg; ctx.fillRect(0,0,W,H);
  }

  function updatePlayer(dt){
    const speed = 240;
    let move = 0;
    if (State.keys.ArrowLeft || State.keys.KeyA){ move -= 1; State.facing = -1; }
    if (State.keys.ArrowRight || State.keys.KeyD){ move += 1; State.facing = 1; }

    if (move!==0){
      State.x += move*speed*dt;
      State.x = clamp(State.x, WORLD_LEFT+40, WORLD_RIGHT-40);
      State.walking = true;
      const op = State.walkPhase;
      State.walkPhase += dt*9;
      if (Math.floor(State.walkPhase/Math.PI) !== Math.floor(op/Math.PI)) Audio2.footstep();
    } else State.walking = false;

    if (State.keys.Space && State.onGround){ State.vy = 360; State.onGround = false; }
    if (!State.onGround){
      State.y += State.vy*dt; State.vy -= 980*dt;
      if (State.y <= 0){ State.y=0; State.vy=0; State.onGround=true; }
    }

    const nz = getZoneAt(State.x);
    if (nz !== State.zoneId){ State.zoneId = nz; spawnParticles(); }

    updateComfort(dt);

    const z = ZONES[State.zoneId];
    Audio2.setAmb(Audio2.amb.wind, z.wind>0 ? Math.min(0.15, z.wind*0.03) : 0, 300 + z.wind*80);
    Audio2.setAmb(Audio2.amb.rain, z.rain>0 ? Math.min(0.13, z.rain*0.008) : 0, 2400);
    Audio2.setAmb(Audio2.amb.sand, z.weather==='sand' ? 0.09 : 0, 900);

    let near = null;
    Object.keys(NPC_POS).forEach(id=>{
      if (Math.abs(State.x - NPC_POS[id]) < 90) near = +id;
    });
    State.nearNPC = near;
    const prompt = document.getElementById('prompt');
    if (near && !State.completed[near] && State.activeScreen === 'world') prompt.classList.add('show');
    else prompt.classList.remove('show');
  }

  function updateComfort(dt){
    const z = ZONES[State.zoneId];
    const s = getOutfitStats(State.outfit);
    const windChill = z.wind*(1 - s.windproof/10)*1.2;
    const sunGain = z.temp>20 ? z.sun*0.5*(1-s.cover) : 0;
    const tEnv = z.temp - windChill + sunGain;
    const cloEff = s.clo*(1-(State.wet/100)*s.wetSens*0.7);
    const R = cloEff*0.155 + 0.12;
    const Hl = Math.max(-80, Math.min(600, (33-tEnv)/Math.max(R,0.05)));
    const balance = 100 - Hl;
    if (balance>0){
      const sweat = Math.min(5, balance/20);
      const evap = s.breath/10;
      const trapped = sweat*(1-evap);
      const rainIn = z.rain*0.06*(1-s.waterproof/10);
      State.wet = Math.min(100, State.wet + (trapped*1.6 + rainIn)*dt*2);
      State.dry = Math.max(0, State.dry - (trapped*1.9 + rainIn*1.2)*dt*2);
      State.warm = Math.min(100, State.warm + 0.3*dt);
    } else {
      const cold = Math.min(6, -balance/25);
      State.warm = Math.max(0, State.warm - cold*dt*2);
      State.dry  = Math.max(0, State.dry  - 0.1*dt);
    }
    if (z.sun >= 8 && s.uv < 7){
      State.warm = Math.max(0, State.warm-1.2*dt);
      State.dry = Math.max(0, State.dry-0.8*dt);
    }
    State.wet = Math.max(0, State.wet - (0.15 + s.breath*0.02)*dt*2);
    if (z.rain < 0.5 && State.wet < 5) State.dry = Math.min(100, State.dry + 0.3*dt);
  }

  function updateHUD(){
    const z = ZONES[State.zoneId];
    const zN = document.getElementById('zoneName');
    const zM = document.getElementById('zoneMeta');
    if (zN) zN.textContent = z.name;
    if (zM) zM.textContent = `🌡 ${z.temp>0?'+':''}${z.temp}°C · 💨 ${z.wind} м/с · 💧 ${z.rain} мм · ☀️ ${z.sun}`;
    const wV = document.getElementById('warmVal'), dV = document.getElementById('dryVal');
    const wB = document.getElementById('warmBar'), dB = document.getElementById('dryBar');
    if (wV) wV.textContent = Math.round(State.warm) + '%';
    if (dV) dV.textContent = Math.round(State.dry) + '%';
    if (wB) wB.style.width = State.warm + '%';
    if (dB) dB.style.width = State.dry + '%';
    const unlocked = Object.values(LEGENDARY).filter(l=>State.artifacts.length >= l.need).length;
    const sB = document.getElementById('scoreBadge');
    if (sB) sB.textContent = `⭐ ${State.score} · 🏆 ${State.artifacts.length}/4 · 📖 ${unlocked}/4`;
  }

  return { start:()=>requestAnimationFrame(loop) };
})();

function saveProgress(){
  fetch('api.php', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({
      action:'save', score: State.score,
      completed: State.completed, artifacts: State.artifacts,
      mgWon: State.mgWon, comfort: State.comfort
    })
  }).catch(()=>{});
}

function resetGame(){
  fetch('api.php', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({action:'reset'})
  }).then(()=>{
    State.score = 0;
    State.completed = {};
    State.artifacts = [];
    State.comfort = {};
    State.mgWon = false;
    State.warm = 100;
    State.dry = 100;
    State.wet = 0;
    State.x = 0;
    State.zoneId = 0;
    State.outfit = { base:'merino', mid:'down', outer:'membrane', color:'#C059FF', pattern:'solid' };
    showToast('🔄 Игра сброшена! Прогресс очищен.');
    const sB = document.getElementById('scoreBadge');
    if (sB) sB.textContent = `⭐ 0 · 🏆 0/4 · 📖 0/4`;
    if (State.activeScreen === 'encyclo') Encyclopedy.open();
    if (State.activeScreen === 'world') spawnParticles();
  }).catch(()=>{
    showToast('⚠️ Не удалось сбросить на сервере, но локальный прогресс очищен');
    State.score = 0;
    State.completed = {};
    State.artifacts = [];
    State.comfort = {};
    State.mgWon = false;
    if (State.activeScreen === 'encyclo') Encyclopedy.open();
  });
}

function showToast(text){
  const t = document.getElementById('toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(t._t);
  t._t = setTimeout(()=>t.classList.remove('show'), 3200);
}

const Wardrobe = (()=>{
  const previewCanvas = document.getElementById('previewCanvas');
  const previewCtx = previewCanvas.getContext('2d');

  function open(npcId){
    State.currentNPC = npcId;
    const npc = NPCS[npcId];
    State.outfit = { base:'merino', mid:'down', outer:'membrane', color: npc.clothes, pattern:'solid' };
    document.getElementById('wTask').textContent = npc.task;
    document.getElementById('wWho').innerHTML = `${npc.name} <small>· ${npc.role}</small>`;
    document.getElementById('wHint').textContent = '💡 ' + npc.hint;
    buildEditor(); buildCards(); drawPreview();
    Screens.show('wardrobe');
    Audio2.click();
  }
  function close(){ Screens.show('world'); }

  function buildEditor(){
    const colorRow = document.getElementById('colorRow');
    colorRow.innerHTML = '';
    COLORS.forEach(col=>{
      const sw = document.createElement('div');
      sw.className = 'color-swatch' + (State.outfit.color===col?' sel':'');
      sw.style.background = col;
      sw.onclick = ()=>{
        State.outfit.color = col;
        colorRow.querySelectorAll('.color-swatch').forEach(s=>s.classList.remove('sel'));
        sw.classList.add('sel');
        drawPreview();
        Audio2.pop();
      };
      colorRow.appendChild(sw);
    });

    const patRow = document.getElementById('patternRow');
    patRow.innerHTML = '';
    Object.keys(PATTERNS).forEach(k=>{
      const p = PATTERNS[k];
      const btn = document.createElement('button');
      btn.className = 'pattern-btn' + (State.outfit.pattern===k?' sel':'');
      btn.innerHTML = `<span class="icon">${p.icon}</span> ${p.name}`;
      btn.onclick = ()=>{
        State.outfit.pattern = k;
        patRow.querySelectorAll('.pattern-btn').forEach(b=>b.classList.remove('sel'));
        btn.classList.add('sel');
        drawPreview();
        Audio2.pop();
      };
      patRow.appendChild(btn);
    });
  }

  function buildCards(){
    const container = document.getElementById('layerBlocks');
    container.innerHTML = '';
    Object.keys(LAYERS).forEach(layerKey=>{
      const layer = LAYERS[layerKey];
      const block = document.createElement('div');
      block.className = 'layer-block';
      block.innerHTML = `<div class="layer-title">${layer.label}</div><div class="cards" id="cards-${layerKey}"></div>`;
      container.appendChild(block);

      const cardsGrid = block.querySelector(`#cards-${layerKey}`);
      Object.keys(layer.items).forEach(itemKey=>{
        const item = layer.items[itemKey];
        const card = document.createElement('div');
        card.className = 'card' + (State.outfit[layerKey]===itemKey?' sel':'');
        card.innerHTML = `
          <span class="ic">${item.icon}</span>
          <div class="nm">${item.name}</div>
          <div class="desc">${item.desc}</div>
          <div class="stat">
            <span>🔥${item.clo}</span>
            <span>💨${item.breath}</span>
            <span>💧${item.waterproof}</span>
          </div>
        `;
        card.onclick = ()=>{
          State.outfit[layerKey] = itemKey;
          cardsGrid.querySelectorAll('.card').forEach(c=>c.classList.remove('sel'));
          card.classList.add('sel');
          drawPreview();
          Audio2.pop();
        };
        cardsGrid.appendChild(card);
      });
    });
  }

  function drawPreview(){
    previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    drawCharacter(previewCtx, {
      x: 120, y: 250, scale: 1.8, facing: 1,
      walkPhase: 0, walking: false, jumping: 0, blink: 0,
      skin: '#f5d8b8', hair: '#8a5a3a', hairStyle: 'short',
      clothes: State.outfit.color, pattern: State.outfit.pattern, isIntern: true
    });
  }

  return { open, close, buildEditor, buildCards, drawPreview };
})();

const MembraneMinigame = (()=>{
  let cv, ctx, animId = null;
  let poreSize = 50;
  let passCount = 0, blockCount = 0, leakCount = 0, stopCount = 0;
  let particles = [];

  function init(){
    cv = document.getElementById('mgCanvas');
    if (!cv) return;
    ctx = cv.getContext('2d');
    const slider = document.getElementById('mgPore');
    const valEl = document.getElementById('mgPoreVal');
    slider.oninput = (e)=>{
      poreSize = +e.target.value;
      valEl.textContent = poreSize;
      checkVerdict();
    };
    document.getElementById('mgReset').onclick = resetStats;
    resetStats();
    spawn();
  }

  function resetStats(){
    passCount = 0; blockCount = 0; leakCount = 0; stopCount = 0;
    updateCounters();
    document.getElementById('mgVerdict').className = 'mg-verdict';
  }

  function spawn(){
    particles = [];
    for (let i=0; i<18; i++){
      particles.push({
        type: Math.random() < 0.5 ? 'steam' : 'water',
        x: Math.random()*cv.width*0.4,
        y: Math.random()*cv.height,
        vx: 1.5 + Math.random()*2,
        vy: (Math.random()-0.5)*0.8,
        active: true
      });
    }
  }

  function updateCounters(){
    document.getElementById('mgPass').textContent = passCount;
    document.getElementById('mgBlock').textContent = blockCount;
    document.getElementById('mgLeak').textContent = leakCount;
    document.getElementById('mgStop').textContent = stopCount;
  }

  function checkVerdict(){
    const v = document.getElementById('mgVerdict');
    v.className = 'mg-verdict show';
    if (poreSize >= 35 && poreSize <= 65){
      v.className = 'mg-verdict show win';
      v.textContent = '🌟 Идеально! Пар проходит свободно, капли воды задерживаются.';
      if (!State.mgWon){
        State.mgWon = true;
        State.score += 50;
        showToast('⭐ Успех в мини-игре! +50 очков');
        saveProgress();
      }
    } else if (poreSize < 35){
      v.className = 'mg-verdict show lose';
      v.textContent = '❌ Слишком узкие поры: пар застрял («эффект бани»).';
    } else {
      v.className = 'mg-verdict show lose';
      v.textContent = '❌ Слишком широкие поры: капли воды просачиваются внутрь.';
    }
  }

  function run(){
    if (!ctx) return;
    ctx.clearRect(0, 0, cv.width, cv.height);

    const mw = 40;
    const mx = cv.width/2 - mw/2;
    ctx.fillStyle = 'rgba(200,184,224,.4)';
    ctx.fillRect(mx, 0, mw, cv.height);

    ctx.fillStyle = '#7a5a40';
    for (let y=30; y<cv.height; y+=50){
      ctx.beginPath(); ctx.arc(mx + mw/2, y, poreSize*0.22, 0, 7); ctx.fill();
    }

    particles.forEach(p => {
      if (p.active){
        p.x += p.vx;
        p.y += p.vy;
        if (p.x > mx && p.x < mx + mw){
          if (p.type === 'steam'){
            if (poreSize >= 30){ passCount++; p.active = false; }
            else { blockCount++; p.active = false; }
          } else {
            if (poreSize <= 70){ stopCount++; p.active = false; }
            else { leakCount++; p.active = false; }
          }
          updateCounters();
        }
        if (p.x > cv.width){
          p.x = 0; p.y = Math.random()*cv.height; p.active = true;
          p.type = Math.random() < 0.5 ? 'steam' : 'water';
        }
      }

      ctx.beginPath();
      if (p.type === 'steam'){
        ctx.fillStyle = 'rgba(184,208,232,.75)';
        ctx.arc(p.x, p.y, 6, 0, 7);
      } else {
        ctx.fillStyle = 'rgba(194,89,255,.85)';
        ctx.arc(p.x, p.y, 5, 0, 7);
      }
      ctx.fill();
    });

    animId = requestAnimationFrame(run);
  }

  return { init, start:()=>run(), stop:()=>cancelAnimationFrame(animId) };
})();

const MissionRunner = (()=>{
  let cv, ctx, animId = null;
  let mWarm = 100, mDry = 100, timeElapsed = 0;
  let targetDist = 1000, playerX = 0;
  let activeNpcId = null;

  function start(npcId){
    activeNpcId = npcId;
    Screens.show('mission');
    const npc = NPCS[npcId];
    document.getElementById('mTitle').textContent = ZONES[npcId].name;
    document.getElementById('mSub').textContent = npc.task;
    cv = document.getElementById('missionCanvas');
    ctx = cv.getContext('2d');
    mWarm = 100; mDry = 100; timeElapsed = 0; playerX = 0;
    Audio2.click();
    run();
  }

  function run(){
    const dt = 0.033;
    timeElapsed += dt;
    playerX += 60 * dt;

    const z = ZONES[activeNpcId];
    const s = getOutfitStats(State.outfit);
    const windChill = z.wind*(1 - s.windproof/10);
    const diff = (z.temp - 20) - windChill;

    if (diff < 0) mWarm = Math.max(0, mWarm + diff*0.1*dt);
    if (z.rain > 0 && s.waterproof < 5) mDry = Math.max(0, mDry - z.rain*0.5*dt);
    if (s.breath < 5) mDry = Math.max(0, mDry - 0.4*dt);

    document.getElementById('mWarmVal').textContent = Math.round(mWarm) + '%';
    document.getElementById('mDryVal').textContent = Math.round(mDry) + '%';
    document.getElementById('mWarmBar').style.width = mWarm + '%';
    document.getElementById('mDryBar').style.width = mDry + '%';

    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = z.sky1; ctx.fillRect(0,0,cv.width, cv.height);
    ctx.fillStyle = z.ground; ctx.fillRect(0, cv.height-80, cv.width, 80);

    drawCharacter(ctx, {
      x: 100 + playerX, y: cv.height-80, scale: 1.3, facing: 1,
      walkPhase: performance.now()/150, walking: true, jumping: 0, blink: 0,
      skin: '#f5d8b8', hair: '#8a5a3a', hairStyle: 'short',
      clothes: State.outfit.color, pattern: State.outfit.pattern, isIntern: true
    });

    if (playerX >= targetDist || mWarm <= 0 || mDry <= 0){
      endMission(mWarm > 30 && mDry > 30);
      return;
    }

    animId = requestAnimationFrame(run);
  }

  function endMission(success){
    cancelAnimationFrame(animId);
    const comfort = Math.round((mWarm + mDry)/2);
    State.completed[activeNpcId] = true;
    State.comfort[activeNpcId] = comfort;

    let bonus = 0;
    if (comfort >= 90) {
      bonus = 100;
      showToast('🌟 Идеальный баланс комфорта! Бонус +100 очков');
    }

    if (success) {
      State.score += 150 + bonus;
      const artifact = NPCS[activeNpcId].artifact;
      if (!State.artifacts.includes(artifact)) State.artifacts.push(artifact);
      Audio2.win();
      showToast('🎉 Миссия успешно выполнена!');
    } else {
      Audio2.fail();
      showToast('⚠️ Миссия провалена. Персонаж замёрз или вспотел.');
    }
    saveProgress();
    ReportScreen.show(success, comfort, activeNpcId);
  }

  return { start };
})();

const ReportScreen = {
  show(success, comfort, npcId){
    Screens.show('report');
    const npc = NPCS[npcId];
    document.getElementById('rComfort').textContent = comfort + '%';
    document.getElementById('rStars').textContent = comfort >= 90 ? '⭐⭐⭐' : (comfort >= 60 ? '⭐⭐' : '⭐');

    const table = document.getElementById('rTable');
    table.innerHTML = `
      <tr><td>Регион:</td><td><b>${ZONES[npcId].name}</b></td></tr>
      <tr><td>Задача:</td><td><b>${npc.task}</b></td></tr>
      <tr><td>Итоговый комфорт:</td><td><b>${comfort}%</b></td></tr>
      <tr><td>Начислено очков:</td><td><b>${success ? (150 + (comfort >= 90 ? 100 : 0)) : 0}</b></td></tr>
    `;

    const tips = document.getElementById('rTips');
    if (comfort >= 90){
      tips.innerHTML = `<div class="r-tip good">🌟 Идеальный баланс! Вы подобрали слои безупречно, получены бонусные очки. ${npc.thanks}</div>`;
    } else if (success){
      tips.innerHTML = `<div class="r-tip good">✅ Миссия выполнена, но можно улучшить выбор слоев для идеального баланса. ${npc.thanks}</div>`;
    } else {
      tips.innerHTML = `<div class="r-tip bad">❌ Рейтинг комфорта упал: персонаж вспотел или замёрз. Изучите справочник тканей.</div>`;
    }

    const artBlock = document.getElementById('rArtifact');
    if (success){
      artBlock.classList.remove('hidden');
      artBlock.innerHTML = `🎁 Получен артефакт патруля: ${npc.artifact}`;
    } else {
      artBlock.classList.add('hidden');
    }

    const btn = document.getElementById('rContinue');
    const allDone = [1,2,3,4].every(id => State.completed[id]);
    if (allDone){
      btn.textContent = '🏁 К финишу';
      btn.onclick = ()=>{ Audio2.click(); FinalScreen.show(); };
    } else {
      btn.textContent = 'Продолжить службу';
      btn.onclick = ()=>{ Audio2.click(); Screens.show('world'); };
    }
  }
};

const FinalScreen = {
  show(){
    Screens.show('final');
    Audio2.fanfare();

    const table = document.getElementById('fTable');
    let rows = '';
    let total = 0;
    let count = 0;
    let allPerfect = true;
    let allAtLeast50 = true;
    let anyCompleted = false;

    [1,2,3,4].forEach(id=>{
      const zone = ZONES[id];
      const npc = NPCS[id];
      const done = !!State.completed[id];
      const c = State.comfort[id] || 0;
      if (done){
        anyCompleted = true;
        total += c;
        count++;
        if (c < 100) allPerfect = false;
        if (c < 50) allAtLeast50 = false;
      } else {
        allPerfect = false;
        allAtLeast50 = false;
      }
      const stars = done ? (c >= 90 ? '⭐⭐⭐' : (c >= 60 ? '⭐⭐' : '⭐')) : '—';
      rows += `
        <tr class="${done ? '' : 'f-row-fail'}">
          <td>${zone.name}</td>
          <td>${npc.artifact}</td>
          <td><b>${done ? c + '%' : 'не пройден'}</b></td>
          <td>${stars}</td>
        </tr>
      `;
    });

    const avg = count > 0 ? Math.round(total/count) : 0;

    table.innerHTML = `
      <thead>
        <tr><th>Регион</th><th>Артефакт</th><th>Комфорт</th><th>Оценка</th></tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr>
          <td colspan="2"><b>Средний рейтинг комфорта</b></td>
          <td colspan="2"><b class="f-avg">${avg}%</b></td>
        </tr>
        <tr>
          <td colspan="2"><b>Общий счёт</b></td>
          <td colspan="2"><b class="f-score">⭐ ${State.score}</b></td>
        </tr>
      </tfoot>
    `;

    const verdict = document.getElementById('fVerdict');
    let text = '';
    let cls = '';

    if (!anyCompleted){
      text = '😢 Ты не прошёл ни одного уровня. Попробуй ещё раз!';
      cls = 'bad';
    } else if (allPerfect){
      text = '🏆 Молодец, ты победил!';
      cls = 'perfect';
    } else if (allAtLeast50){
      text = '👍 Молодец, но можно ещё лучше!';
      cls = 'good';
    } else {
      text = '💪 Попробуй ещё раз!';
      cls = 'bad';
    }

    verdict.className = 'final-verdict ' + cls;
    verdict.textContent = text;
  }
};

const Encyclopedy = {
  open(){
    Screens.show('encyclo');
    const artGrid = document.getElementById('artGrid');
    artGrid.innerHTML = '';
    [1,2,3,4].forEach(id=>{
      const npc = NPCS[id];
      const unlocked = State.completed[id];
      const card = document.createElement('div');
      card.className = 'art-card ' + (unlocked ? 'unlocked' : 'locked');
      card.innerHTML = `
        <div class="e">${npc.artifact.split(' ')[0]}</div>
        <h4>${npc.artifact}</h4>
        <div class="from">${ZONES[id].name}</div>
      `;
      artGrid.appendChild(card);
    });

    const legendGrid = document.getElementById('legendGrid');
    legendGrid.innerHTML = '';
    Object.keys(LEGENDARY).forEach(k=>{
      const l = LEGENDARY[k];
      const unlocked = State.artifacts.length >= l.need;
      const card = document.createElement('div');
      card.className = 'legend-card ' + (unlocked ? 'unlocked' : 'locked');
      card.innerHTML = `
        <div class="ic">${l.icon}</div>
        <div class="nm">${l.name}</div>
        <div class="need">Требуется артефактов: ${l.need} / Найдено: ${State.artifacts.length}</div>
        <div class="desc">${l.desc}</div>
        <div class="props">
          <span class="prop">🔥 <b>${l.clo}</b></span>
          <span class="prop">💨 <b>${l.breath}</b></span>
          <span class="prop">☀️ <b>${l.uv}</b></span>
        </div>
      `;
      legendGrid.appendChild(card);
    });
    Audio2.click();
  },
  close(){ Screens.show('world'); }
};

window.addEventListener('DOMContentLoaded', ()=>{
  const logoCv = document.getElementById('logoCanvas');
  if (logoCv){
    const lCtx = logoCv.getContext('2d');
    drawCharacter(lCtx, {
      x: 110, y: 220, scale: 2.2, facing: 1,
      walkPhase: 0, walking: false, jumping: 0, blink: 0,
      skin: '#f5d8b8', hair: '#8a5a3a', hairStyle: 'short',
      clothes: '#C059FF', pattern: 'solid', isIntern: true
    });
  }

  MusicManager.init();

  const unlockMusic = ()=>{
    MusicManager.onUserInteraction();
    document.removeEventListener('click', unlockMusic);
    document.removeEventListener('keydown', unlockMusic);
    document.removeEventListener('touchstart', unlockMusic);
  };
  document.addEventListener('click', unlockMusic, { once: true });
  document.addEventListener('keydown', unlockMusic, { once: true });
  document.addEventListener('touchstart', unlockMusic, { once: true });

  document.getElementById('musicBtn').onclick = ()=>{
    Audio2.click();
    MusicManager.toggle();
  };

  document.getElementById('startBtn').onclick = ()=>{
    Audio2.init(); Audio2.resume(); Audio2.click();
    MusicManager.onUserInteraction();
    Screens.show('world');
    GameEngine.start();
    State.showStartSign = true;
    State.startSignTimer = 0;
    Audio2.success();
  };

  document.getElementById('aboutBtn').onclick = ()=>{
    Audio2.click();
    Screens.show('about');
  };

  document.getElementById('labBtn').onclick = ()=>{
    Audio2.click();
    Screens.show('lab');
    MembraneMinigame.init();
    MembraneMinigame.start();
  };

  document.getElementById('encycloBtn').onclick = ()=> Encyclopedy.open();

  document.querySelectorAll('[data-close]').forEach(btn=>{
    btn.onclick = ()=>{
      Audio2.click();
      const s = btn.getAttribute('data-close');
      if (s === 'lab') MembraneMinigame.stop();
      if (s === 'about') { Screens.show('start'); return; }
      Screens.show('world');
    };
  });

  document.getElementById('resetGameBtn').onclick = ()=>{
    Audio2.click();
    if (confirm('Вы уверены, что хотите сбросить весь прогресс? Это действие необратимо.')) {
      resetGame();
    }
  };

  document.getElementById('fRestart').onclick = ()=>{
    Audio2.click();
    if (confirm('Начать новое прохождение? Весь прогресс будет сброшен.')) {
      resetGame();
      Screens.show('world');
      State.showStartSign = true;
      State.startSignTimer = 0;
    }
  };
  document.getElementById('fToStart').onclick = ()=>{
    Audio2.click();
    Screens.show('start');
  };

  document.querySelectorAll('.tab').forEach(tab=>{
    tab.onclick = ()=>{
      Audio2.click();
      document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('lab-'+tab.getAttribute('data-tab')).classList.add('active');
      if (tab.getAttribute('data-tab') === 'mg') MembraneMinigame.start();
      else MembraneMinigame.stop();
    };
  });

  document.getElementById('dlgAccept').onclick = ()=>{
    Audio2.pop();
    document.getElementById('dialogue').classList.remove('show');
    Wardrobe.open(State.currentNPC);
  };
  document.getElementById('dlgDecline').onclick = ()=>{
    Audio2.click();
    document.getElementById('dialogue').classList.remove('show');
  };

  document.getElementById('launchMission').onclick = ()=>{
    Audio2.click();
    Wardrobe.close();
    MissionRunner.start(State.currentNPC);
  };

  window.addEventListener('keydown', e=>{
    State.keys[e.code] = true;
    if (e.code === 'KeyL' && State.activeScreen === 'world'){
      document.getElementById('labBtn').click();
    }
    if (e.code === 'KeyB' && State.activeScreen === 'world'){
      document.getElementById('encycloBtn').click();
    }
    if (e.code === 'KeyE' && State.nearNPC && State.activeScreen === 'world'){
      const npc = NPCS[State.nearNPC];
      State.currentNPC = State.nearNPC;
      document.getElementById('dlgAva').textContent = npc.avatar;
      document.getElementById('dlgName').textContent = npc.name;
      document.getElementById('dlgRole').textContent = npc.role;
      document.getElementById('dlgText').textContent = npc.greeting;
      document.getElementById('dialogue').classList.add('show');
      Audio2.pop();
    }
    if (e.code === 'Escape' && State.activeScreen !== 'world' && State.activeScreen !== 'start' && State.activeScreen !== 'final'){
      const closeBtn = document.querySelector('.screen.active [data-close]');
      if (closeBtn) closeBtn.click();
    }
  });

  window.addEventListener('keyup', e=>{
    State.keys[e.code] = false;
  });
});

})();