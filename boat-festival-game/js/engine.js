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
};

DBF._autoOrbit = true;
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
