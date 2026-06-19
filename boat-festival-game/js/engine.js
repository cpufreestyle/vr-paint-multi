/* =========================================================================
   龙舟盛景 · engine.js —— 引擎核心
   场景 / 相机 / 渲染器 / 轨道控制 / 主循环 / 模式管理 / 事件总线 / 灯光
   全局命名空间：window.DBF
   ========================================================================= */
(function(){
"use strict";

const DBF = window.DBF = {
  THREE:null, scene:null, camera:null, renderer:null, controls:null, clock:null,
  ticks: [], _t: 0, lights: {},
  state: { mode:'view', timeOfDay:'day' },
  _events: {}, raycaster:null, pointer:null,
};

DBF.on = function(name, fn){ (DBF._events[name] = DBF._events[name] || []).push(fn); };
DBF.emit = function(name, payload){ (DBF._events[name]||[]).forEach(fn=>fn(payload)); };
DBF.registerTick = function(fn){ DBF.ticks.push(fn); };
DBF.mat = function(color, opts){
  return new THREE.MeshStandardMaterial(Object.assign({color, roughness:0.82, metalness:0.06}, opts||{}));
};

DBF.initEngine = function(container){
  const T = DBF.THREE = window.THREE;

  const scene = DBF.scene = new T.Scene();
  scene.background = new T.Color(0xbcd6e4);
  scene.fog = new T.Fog(0xd2e2e6, 170, 520);

  const camera = DBF.camera = new T.PerspectiveCamera(52, innerWidth/innerHeight, 0.1, 1200);
  camera.position.set(0, 30, 86);

  const renderer = DBF.renderer = new T.WebGLRenderer({antialias:true, powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.outputEncoding = T.sRGBEncoding;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  container.appendChild(renderer.domElement);

  const controls = DBF.controls = new T.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.maxPolarAngle = Math.PI*0.495;
  controls.minDistance = 14;
  controls.maxDistance = 260;
  controls.target.set(0, 5, 0);

  DBF.clock = new T.Clock();
  DBF.raycaster = new T.Raycaster();
  DBF.pointer = new T.Vector2();

  const amb = new T.AmbientLight(0xffffff, 0.6);
  const hemi = new T.HemisphereLight(0xbcd2ff, 0x4a4636, 0.55);
  const sun = new T.DirectionalLight(0xffffff, 1.1);
  sun.position.set(60, 95, 50);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048,2048);
  const sc = sun.shadow.camera;
  sc.left=-130; sc.right=130; sc.top=130; sc.bottom=-130; sc.near=1; sc.far=420;
  sun.shadow.bias = -0.0004;
  const warm = new T.PointLight(0xffb24a, 0.5, 240);
  warm.position.set(-10, 18, -10);
  scene.add(amb, hemi, sun, warm);
  DBF.lights = {amb, hemi, sun, warm};

  addEventListener('resize', ()=>{
    camera.aspect = innerWidth/innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  controls.addEventListener('start', ()=>{ DBF._autoOrbit = false; });
};

DBF.setMode = function(mode){
  if(DBF.state.mode === mode) return;
  const prev = DBF.state.mode;
  DBF.state.mode = mode;

  document.querySelectorAll('.mode-btn').forEach(b=> b.classList.toggle('on', b.dataset.mode === mode));
  document.getElementById('race-hud').style.display = (mode==='race') ? 'flex' : 'none';
  document.getElementById('paint-hud').style.display = (mode==='paint') ? 'flex' : 'none';

  if(mode === 'view'){
    DBF._autoOrbit = true;
    DBF.controls.enabled = true; DBF.controls.enableRotate = true;
    DBF.setHint('拖动环绕 · 滚轮缩放 · 左侧切换模式');
  } else if(mode === 'race'){
    DBF._autoOrbit = false;
    DBF.controls.enabled = true; DBF.controls.enableRotate = true;
    DBF.setHint('敲鼓加速，冲过终点！按 <b>空格</b> 或点底部鼓按钮');
  } else if(mode === 'paint'){
    DBF._autoOrbit = false;
    DBF.controls.enabled = true; DBF.controls.enableRotate = false;
    DBF.setHint('按住<b>左键</b>在空中挥毫 · <b>右键</b>转视角 · 选色与粗细在下方');
  }
  DBF.emit('mode', {mode, prev});
};

DBF.setHint = function(html){
  const el = document.getElementById('hint');
  if(el){ el.innerHTML = html; el.style.opacity = '1'; }
};

DBF.banner = function(text, sub, ms){
  const el = document.getElementById('race-banner');
  el.innerHTML = text + (sub ? '<small>'+sub+'</small>' : '');
  el.style.display = 'block';
  el.animate([{opacity:0,transform:'translate(-50%,-50%) scale(.7)'},
              {opacity:1,transform:'translate(-50%,-50%) scale(1)'}],
              {duration:400, easing:'cubic-bezier(.2,.9,.3,1)', fill:'forwards'});
  if(ms) setTimeout(()=>{ el.style.display='none'; }, ms);
};

DBF.bindUI = function(){
  document.querySelectorAll('.mode-btn').forEach(b=>{
    b.addEventListener('click', ()=> DBF.setMode(b.dataset.mode));
  });

  // 时辰图标（线性 SVG）
  const SUN='<svg class="ln" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/></svg>';
  const DUSK='<svg class="ln" viewBox="0 0 24 24"><path d="M3 18h18"/><path d="M7 18a5 5 0 0110 0"/><path d="M12 4v3M5 9l2 1M19 9l-2 1"/></svg>';
  const MOON='<svg class="ln" viewBox="0 0 24 24"><path d="M20 13A8 8 0 1111 4a6 6 0 009 9z"/></svg>';
  const order = ['day','dusk','night'];
  const label = {day:SUN+'时辰：白昼', dusk:DUSK+'时辰：黄昏', night:MOON+'时辰：夜晚'};
  document.getElementById('btn-time').addEventListener('click', function(){
    const i = order.indexOf(DBF.state.timeOfDay);
    const next = order[(i+1)%order.length];
    DBF.setTimeOfDay(next);
    this.innerHTML = label[next];
  });

  document.getElementById('btn-firework').addEventListener('click', ()=>{
    if(DBF.state.timeOfDay !== 'night'){
      DBF.setTimeOfDay('night');
      document.getElementById('btn-time').innerHTML = label.night;
    }
    if(DBF.launchFireworkShow) DBF.launchFireworkShow();
    DBF.setHint('夜空绽放烟花 — 再点继续放');
  });

  document.getElementById('btn-lantern').addEventListener('click', ()=>{
    if(DBF.dropRiverLanterns) DBF.dropRiverLanterns(12);
    DBF.setHint('放河灯祈福 · 灯随水流而下');
  });

  // 音效开关
  let soundOn = true;
  document.getElementById('btn-sound').addEventListener('click', ()=>{
    soundOn = !soundOn;
    if(bgGain) bgGain.gain.value = soundOn ? 0.15 : 0;
    if(sfxGain) sfxGain.gain.value = soundOn ? 0.5 : 0;
    DBF.setHint(soundOn ? '音效已开启 🔊' : '音效已关闭 🔇');
  });

  // 观赏模式偶尔笛声
  setInterval(()=>{
    if(DBF.state.mode==='view' && soundOn && DBF.playFlute) DBF.playFlute();
  }, 8000+Math.random()*6000);
};

DBF._autoOrbit = true;

// ---------- 背景音效系统 ----------
let audioCtx = null;
let bgGain = null;
let sfxGain = null;
let ambientStarted = false;

DBF.initAudio = function(){
  if(audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  bgGain = audioCtx.createGain(); bgGain.gain.value = 0.15; bgGain.connect(audioCtx.destination);
  sfxGain = audioCtx.createGain(); sfxGain.gain.value = 0.5; sfxGain.connect(audioCtx.destination);
};

DBF.startAmbient = function(){
  if(!audioCtx) DBF.initAudio();
  if(ambientStarted) return;
  ambientStarted = true;
  const bufLen = audioCtx.sampleRate * 4;
  const buf = audioCtx.createBuffer(1, bufLen, audioCtx.sampleRate);
  const d = buf.getChannelData(0);
  let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
  for(let i=0;i<bufLen;i++){
    const white = Math.random()*2-1;
    b0=0.99886*b0+white*0.0555179; b1=0.99332*b1+white*0.0750759;
    b2=0.96900*b2+white*0.1538520; b3=0.86650*b3+white*0.3104856;
    b4=0.55000*b4+white*0.5329522; b5=-0.7616*b5-white*0.0168980;
    d[i]=(b0+b1+b2+b3+b4+b5+b6+white*0.5362)*0.05;
    b6=white*0.115926;
  }
  const src = audioCtx.createBufferSource();
  src.buffer = buf; src.loop = true;
  const filter = audioCtx.createBiquadFilter();
  filter.type='lowpass'; filter.frequency.value=400; filter.Q.value=1;
  src.connect(filter); filter.connect(bgGain);
  src.start();
  // 偶尔水花声
  setInterval(()=>{
    if(!audioCtx || audioCtx.state!=='running') return;
    const o=audioCtx.createOscillator(); const g=audioCtx.createGain();
    o.type='sine'; o.frequency.value=200+Math.random()*300;
    g.gain.setValueAtTime(0.08, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime+0.3);
    o.connect(g); g.connect(sfxGain);
    o.start(); o.stop(audioCtx.currentTime+0.3);
  }, 2000+Math.random()*3000);
};

DBF.playDrum = function(){
  if(!audioCtx) DBF.initAudio();
  if(audioCtx.state==='suspended') audioCtx.resume();
  const now = audioCtx.currentTime;
  const o=audioCtx.createOscillator(); const g=audioCtx.createGain();
  o.type='sine'; o.frequency.setValueAtTime(150, now);
  o.frequency.exponentialRampToValueAtTime(60, now+0.15);
  g.gain.setValueAtTime(0.7, now);
  g.gain.exponentialRampToValueAtTime(0.001, now+0.25);
  o.connect(g); g.connect(sfxGain); o.start(); o.stop(now+0.3);
  const nb=audioCtx.createBuffer(1, audioCtx.sampleRate*0.1, audioCtx.sampleRate);
  const nd=nb.getChannelData(0);
  for(let i=0;i<nd.length;i++) nd[i]=(Math.random()*2-1)*Math.exp(-i/nd.length*5);
  const ns=audioCtx.createBufferSource(); ns.buffer=nb;
  const ng=audioCtx.createGain(); ng.gain.setValueAtTime(0.35,now);
  ng.gain.exponentialRampToValueAtTime(0.001,now+0.1);
  ns.connect(ng); ng.connect(sfxGain); ns.start();
};

DBF.playFlute = function(){
  if(!audioCtx) DBF.initAudio();
  if(audioCtx.state==='suspended') audioCtx.resume();
  const now=audioCtx.currentTime;
  const o=audioCtx.createOscillator(); const g=audioCtx.createGain();
  o.type='triangle';
  const notes=[523,587,659,784,880,1047];
  o.frequency.value=notes[Math.floor(Math.random()*notes.length)];
  g.gain.setValueAtTime(0,now);
  g.gain.linearRampToValueAtTime(0.12,now+0.1);
  g.gain.linearRampToValueAtTime(0.08,now+0.6);
  g.gain.exponentialRampToValueAtTime(0.001,now+1.2);
  o.connect(g); g.connect(sfxGain); o.start(); o.stop(now+1.3);
};

DBF.start = function(){
  const {clock, controls, renderer, scene, camera} = DBF;
  function animate(){
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);
    DBF._t += dt;
    const t = DBF._t;

    for(let i=0;i<DBF.ticks.length;i++) DBF.ticks[i](dt, t);

    if(DBF._autoOrbit && DBF.state.mode === 'view'){
      const a = t*0.045;
      camera.position.x = Math.sin(a)*92;
      camera.position.z = Math.cos(a)*92;
      camera.position.y = 30 + Math.sin(t*0.18)*8;
      camera.lookAt(controls.target);
    }

    controls.update();
    renderer.render(scene, camera);
  }
  animate();
};

})();
