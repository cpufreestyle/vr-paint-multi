/* =========================================================================
   龙舟盛景 · world.js —— 世界与环境
   天空昼夜 / 远山 / 河流水面 / 两岸地形 / 建筑(牌楼·亭·看台) / 植被 / 节日装饰
   ========================================================================= */
(function(){
"use strict";
const DBF = window.DBF;
const T = window.THREE;

// 场景尺寸（赛道沿 z 轴；河中心 x=0）
const DIM = DBF.DIM = { RIVER_W:60, RIVER_L:420, BANK:120 };

// ---------- Canvas 文字纹理（横幅 / 标语 / 旗） ----------
function makeTextTexture(text, opt){
  opt = opt||{};
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  c.width = opt.w||1024; c.height = opt.h||160;
  if(opt.bg!==false){
    const g = ctx.createLinearGradient(0,0,c.width,0);
    g.addColorStop(0, opt.c1||'#7a1322'); g.addColorStop(.5, opt.c2||'#c41e3a'); g.addColorStop(1, opt.c1||'#7a1322');
    ctx.fillStyle=g; ctx.fillRect(0,0,c.width,c.height);
    ctx.strokeStyle='rgba(255,215,106,.85)'; ctx.lineWidth=7; ctx.strokeRect(9,9,c.width-18,c.height-18);
  }
  ctx.fillStyle = opt.color||'#ffe9b0';
  ctx.font = 'bold '+(opt.fs||92)+'px "Noto Serif SC","Microsoft YaHei",serif';
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.shadowColor='rgba(0,0,0,.5)'; ctx.shadowBlur=10;
  ctx.fillText(text, c.width/2, c.height/2+4);
  const tex = new T.CanvasTexture(c);
  tex.anisotropy=4; tex.encoding=T.sRGBEncoding;
  return tex;
}
DBF.makeTextTexture = makeTextTexture;

// ---------- 天空（渐变球 + 太阳/月亮） ----------
let skyMat, sunMesh, moonMesh, starField;
function buildSky(){
  const geo = new T.SphereGeometry(500, 32, 18);
  skyMat = new T.ShaderMaterial({
    side: T.BackSide, depthWrite:false,
    uniforms:{
      top:    {value:new T.Color(0x2a4a82)},
      bottom: {value:new T.Color(0xf6c98a)},
      offset: {value:33}, exponent:{value:0.7}
    },
    vertexShader:`varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader:`uniform vec3 top; uniform vec3 bottom; uniform float offset; uniform float exponent;
      varying vec3 vP; void main(){ float h=normalize(vP+vec3(0.0,offset,0.0)).y;
      float f=max(pow(max(h,0.0),exponent),0.0); gl_FragColor=vec4(mix(bottom,top,f),1.0);}`
  });
  DBF.scene.add(new T.Mesh(geo, skyMat));

  // 太阳
  sunMesh = new T.Mesh(new T.SphereGeometry(14,24,24),
    new T.MeshBasicMaterial({color:0xfff3c4}));
  sunMesh.position.set(-120, 70, -260);
  const sunHalo = new T.Mesh(new T.SphereGeometry(26,24,24),
    new T.MeshBasicMaterial({color:0xffd76a, transparent:true, opacity:0.28}));
  sunMesh.add(sunHalo);
  DBF.scene.add(sunMesh);

  // 月亮
  moonMesh = new T.Mesh(new T.SphereGeometry(11,24,24),
    new T.MeshBasicMaterial({color:0xfffbe8}));
  moonMesh.position.set(-110, 95, -260);
  const moonHalo = new T.Mesh(new T.SphereGeometry(22,24,24),
    new T.MeshBasicMaterial({color:0xbcd2ff, transparent:true, opacity:0.22}));
  moonMesh.add(moonHalo);
  moonMesh.visible = false;
  DBF.scene.add(moonMesh);

  // 星空（夜晚显隐）
  const N=600, pos=new Float32Array(N*3);
  for(let i=0;i<N;i++){
    const r=420, th=Math.random()*Math.PI*2, ph=Math.random()*Math.PI*0.5;
    pos[i*3]=r*Math.sin(ph)*Math.cos(th);
    pos[i*3+1]=r*Math.cos(ph)+30;
    pos[i*3+2]=r*Math.sin(ph)*Math.sin(th)-100;
  }
  const sg=new T.BufferGeometry(); sg.setAttribute('position', new T.BufferAttribute(pos,3));
  starField = new T.Points(sg, new T.PointsMaterial({color:0xffffff, size:1.4, transparent:true, opacity:0}));
  DBF.scene.add(starField);
}

// ---------- 河流水面 ----------
let water, waterBase, waterMat;
function buildWater(){
  const g = new T.PlaneGeometry(DIM.RIVER_W, DIM.RIVER_L, 70, 200);
  g.rotateX(-Math.PI/2);
  waterMat = new T.MeshStandardMaterial({
    color:0x2f7d86, transparent:true, opacity:0.9,
    roughness:0.18, metalness:0.5, emissive:0x0b2e33, emissiveIntensity:0.5,
  });
  water = new T.Mesh(g, waterMat);
  water.receiveShadow = true;
  DBF.scene.add(water);
  waterBase = g.attributes.position.array.slice();
  DBF.water = water;

  // 水面波动
  DBF.registerTick((dt,t)=>{
    const p = g.attributes.position.array;
    for(let i=0;i<p.length;i+=3){
      const x=waterBase[i], z=waterBase[i+2];
      p[i+1] = Math.sin(x*0.10 + t*1.5)*0.5 + Math.cos(z*0.06 + t*1.0)*0.55
             + Math.sin((x+z)*0.05 + t*0.7)*0.3;
    }
    g.attributes.position.needsUpdate = true;
    g.computeVertexNormals();
  });
}
// 供他处查询水面高度（近似）
DBF.waterHeightAt = function(x,z,t){
  t = t||DBF._t;
  return Math.sin(x*0.10 + t*1.5)*0.5 + Math.cos(z*0.06 + t*1.0)*0.55 + Math.sin((x+z)*0.05 + t*0.7)*0.3;
};

// ---------- 两岸地形 ----------
function buildBanks(){
  [-1,1].forEach(side=>{
    // 草坡
    const g = new T.PlaneGeometry(DIM.BANK, DIM.RIVER_L, 1, 1);
    g.rotateX(-Math.PI/2);
    const bank = new T.Mesh(g, DBF.mat(0x5f7b3a, {roughness:1}));
    bank.position.set(side*(DIM.RIVER_W/2 + DIM.BANK/2), -0.25, 0);
    bank.receiveShadow = true;
    DBF.scene.add(bank);
    // 石砌驳岸
    const edge = new T.Mesh(new T.BoxGeometry(3.2, 2.4, DIM.RIVER_L), DBF.mat(0x9a9486,{roughness:1}));
    edge.position.set(side*(DIM.RIVER_W/2 + 1.6), 0.0, 0);
    edge.receiveShadow = true; edge.castShadow = true;
    DBF.scene.add(edge);
  });
}

// ---------- 远处青山（多层） ----------
function buildMountains(){
  function layer(z, count, scale, color, opacity){
    for(let i=0;i<count;i++){
      const h=34+Math.random()*60, r=30+Math.random()*32;
      const m=new T.Mesh(new T.ConeGeometry(r*scale,h*scale,7),
        new T.MeshStandardMaterial({color, roughness:1, transparent:true, opacity}));
      m.position.set((i-count/2)*50 + (Math.random()*24-12), h*scale/2-3, z);
      DBF.scene.add(m);
    }
  }
  layer(-235, 9, 1.0, 0x46663f, 0.96);
  layer(-285, 8, 1.5, 0x3a5740, 0.7);
  layer(-330, 7, 2.0, 0x32493b, 0.42);
}

// ---------- 牌楼（起点门楼，跨河） ----------
function buildArchGate(){
  const grp = new T.Group();
  const pillarMat = DBF.mat(0xb22a32,{roughness:0.7});
  const goldMat = DBF.mat(0xe0a82e,{metalness:0.4, roughness:0.4, emissive:0x3a2a06, emissiveIntensity:0.3});
  [-1,1].forEach(s=>{
    const p = new T.Mesh(new T.BoxGeometry(3,22,3), pillarMat);
    p.position.set(s*(DIM.RIVER_W/2-2), 11, 0); p.castShadow=true;
    grp.add(p);
    const base = new T.Mesh(new T.BoxGeometry(5,2,5), DBF.mat(0x6b6356));
    base.position.set(s*(DIM.RIVER_W/2-2), 1, 0); grp.add(base);
  });
  // 横梁
  const beam = new T.Mesh(new T.BoxGeometry(DIM.RIVER_W+2,3,4), pillarMat);
  beam.position.set(0,20,0); beam.castShadow=true; grp.add(beam);
  // 飞檐（斜板）
  const roof = new T.Mesh(new T.BoxGeometry(DIM.RIVER_W+12,1,8), goldMat);
  roof.position.set(0,22.4,0); roof.rotation.x=0; grp.add(roof);
  [-1,1].forEach(s=>{
    const eave=new T.Mesh(new T.BoxGeometry(10,1,8), goldMat);
    eave.position.set(s*(DIM.RIVER_W/2+5),22.6,0); eave.rotation.z=s*0.18; grp.add(eave);
  });
  // 匾额
  const plaque = new T.Mesh(new T.PlaneGeometry(16,4),
    new T.MeshBasicMaterial({map:makeTextTexture('龙舟竞渡',{w:512,h:160,c1:'#5a0f18',c2:'#8b1228',color:'#ffd76a',fs:96}), transparent:true}));
  plaque.position.set(0,17.5,2.1); grp.add(plaque);
  grp.position.z = DIM.RIVER_L/2 - 30; // 终点门楼
  DBF.scene.add(grp);

  // 终点线（水面横线）
  const fl = new T.Mesh(new T.PlaneGeometry(DIM.RIVER_W, 2.5),
    new T.MeshBasicMaterial({color:0xffffff, transparent:true, opacity:0.5}));
  fl.rotation.x=-Math.PI/2; fl.position.set(0,0.3, DIM.RIVER_L/2-30);
  DBF.scene.add(fl);
  DBF.FINISH_Z = DIM.RIVER_L/2 - 30;
}

// ---------- 临水亭子 ----------
function buildPavilion(x, z, color){
  const grp = new T.Group();
  const wood = DBF.mat(color||0x8a4a2a);
  const gold = DBF.mat(0xe0a82e,{metalness:0.3,roughness:0.5});
  for(let i=0;i<4;i++){
    const ang=i*Math.PI/2;
    const p=new T.Mesh(new T.CylinderGeometry(0.35,0.4,7,8), wood);
    p.position.set(Math.cos(ang)*3, 3.5, Math.sin(ang)*3); p.castShadow=true; grp.add(p);
  }
  const floor=new T.Mesh(new T.BoxGeometry(8,0.5,8), DBF.mat(0x6b5340));
  floor.position.y=0.25; floor.receiveShadow=true; grp.add(floor);
  // 攒尖顶
  const roof=new T.Mesh(new T.ConeGeometry(7,4,4), gold);
  roof.position.y=9; roof.rotation.y=Math.PI/4; roof.castShadow=true; grp.add(roof);
  const top=new T.Mesh(new T.SphereGeometry(0.5,10,10), gold);
  top.position.y=11.2; grp.add(top);
  grp.position.set(x,0,z);
  DBF.scene.add(grp);
}

// ---------- 看台观礼台（阶梯 box） ----------
function buildStand(side, z){
  const grp = new T.Group();
  const mat = DBF.mat(0xb8b0a0,{roughness:0.95});
  for(let i=0;i<4;i++){
    const step=new T.Mesh(new T.BoxGeometry(26, 1.2, 3.5), mat);
    step.position.set(0, 0.6+i*1.2, i*3.5);
    step.castShadow=true; step.receiveShadow=true;
    grp.add(step);
  }
  grp.position.set(side*(DIM.RIVER_W/2 + 10), 0, z);
  grp.rotation.y = side>0 ? Math.PI : 0;
  DBF.scene.add(grp);
  return grp;
}

// ---------- 柳树 ----------
function buildWillow(x, z){
  const grp=new T.Group();
  const trunk=new T.Mesh(new T.CylinderGeometry(0.4,0.6,6,7), DBF.mat(0x5a4326));
  trunk.position.y=3; trunk.castShadow=true; grp.add(trunk);
  const crown=new T.Mesh(new T.SphereGeometry(3.2,10,8), DBF.mat(0x4e7d33,{roughness:1}));
  crown.position.y=7; crown.scale.y=0.8; crown.castShadow=true; grp.add(crown);
  // 垂枝
  for(let i=0;i<14;i++){
    const ang=Math.random()*Math.PI*2, rr=2.2+Math.random()*1.2;
    const len=2+Math.random()*2.5;
    const br=new T.Mesh(new T.CylinderGeometry(0.05,0.02,len,4), DBF.mat(0x6fae4a,{roughness:1}));
    br.position.set(Math.cos(ang)*rr, 6.5-len/2, Math.sin(ang)*rr);
    grp.add(br);
  }
  grp.position.set(x,0,z);
  DBF.scene.add(grp);
}

// ---------- 芦苇丛 ----------
function buildReeds(x,z){
  const grp=new T.Group();
  for(let i=0;i<7;i++){
    const h=1.2+Math.random()*1.6;
    const r=new T.Mesh(new T.CylinderGeometry(0.03,0.05,h,4), DBF.mat(0x9caa5a,{roughness:1}));
    r.position.set((Math.random()-0.5)*1.5, h/2, (Math.random()-0.5)*1.5);
    r.rotation.z=(Math.random()-0.5)*0.3;
    const tip=new T.Mesh(new T.ConeGeometry(0.08,0.4,4), DBF.mat(0xceb86a));
    tip.position.set(r.position.x, h, r.position.z); grp.add(r,tip);
  }
  grp.position.set(x,0,z);
  DBF.scene.add(grp);
}

// ---------- 灯笼（可发光，供昼夜调节） ----------
const lanternGlows = [];
function buildLantern(x,y,z,scale,color){
  scale=scale||1; color=color||0xc41e3a;
  const grp=new T.Group();
  const body=new T.Mesh(new T.SphereGeometry(0.5,14,12),
    new T.MeshStandardMaterial({color, emissive:color, emissiveIntensity:0.5, roughness:0.6}));
  body.scale.set(1,0.85,1);
  const capT=new T.Mesh(new T.CylinderGeometry(0.18,0.18,0.12,10), DBF.mat(0xe0a82e));
  capT.position.y=0.45;
  const capB=capT.clone(); capB.position.y=-0.45;
  const tassel=new T.Mesh(new T.CylinderGeometry(0.02,0.02,0.4,5), DBF.mat(0xffd76a));
  tassel.position.y=-0.7;
  grp.add(body,capT,capB,tassel);
  grp.position.set(x,y,z); grp.scale.setScalar(scale);
  DBF.scene.add(grp);
  lanternGlows.push(body.material);
  // 轻微摇摆
  const seed=Math.random()*10;
  DBF.registerTick((dt,t)=>{ grp.rotation.z=Math.sin(t*1.3+seed)*0.08; });
  return grp;
}

// 沿岸灯笼串
function buildLanternString(side){
  const colors=[0xc41e3a,0xe0a82e,0xff6b35];
  for(let i=0;i<22;i++){
    const z=-DIM.RIVER_L/2+30+i*18;
    buildLantern(side*(DIM.RIVER_W/2+4), 7+Math.sin(i*0.6)*0.6, z, 0.9, colors[i%3]);
  }
}

// ---------- 跨河横幅标语 ----------
function buildBanner(text, z){
  const g=new T.PlaneGeometry(DIM.RIVER_W*0.82, 5);
  const m=new T.MeshStandardMaterial({map:makeTextTexture(text,{w:1024,h:160}), side:T.DoubleSide, roughness:0.9, transparent:true});
  const b=new T.Mesh(g,m);
  b.position.set(0, 15, z);
  DBF.scene.add(b);
  // 轻飘
  const base=g.attributes.position.array.slice();
  DBF.registerTick((dt,t)=>{
    const p=g.attributes.position.array;
    for(let i=0;i<p.length;i+=3){ p[i+2]=Math.sin(base[i]*0.3+t*2)*0.5; }
    g.attributes.position.needsUpdate=true;
  });
}

// ---------- 彩旗阵 + 锦旗（顶点飘动） ----------
const flagList=[];
function buildFlag(x,y,z,color,scale){
  scale=scale||1;
  const grp=new T.Group();
  const pole=new T.Mesh(new T.CylinderGeometry(0.08,0.08,6,6), DBF.mat(0x4a3b28));
  pole.position.y=3; grp.add(pole);
  const fg=new T.PlaneGeometry(2.6,1.6,12,6); fg.translate(1.3,0,0);
  const flag=new T.Mesh(fg, new T.MeshStandardMaterial({color, side:T.DoubleSide, roughness:0.85}));
  flag.position.set(0.08,5,0); grp.add(flag);
  grp.position.set(x,y,z); grp.scale.setScalar(scale);
  DBF.scene.add(grp);
  flagList.push({geo:fg, base:fg.attributes.position.array.slice(), seed:Math.random()*10});
}
function buildFlagRows(){
  const colors=[0xc41e3a,0xe0a82e,0x2f7d86,0x6fae4a,0x8b4ab2,0xff6b35];
  [-1,1].forEach(side=>{
    for(let i=0;i<26;i++){
      const z=-DIM.RIVER_L/2+24+i*15;
      buildFlag(side*(DIM.RIVER_W/2+3.2), 0, z, colors[i%colors.length], 1.0);
    }
  });
}

// ---------- 粽子堆（点缀） ----------
function buildZongziPile(x,z){
  const grp=new T.Group();
  const leaf=DBF.mat(0x2e8b3a,{roughness:0.85});
  for(let i=0;i<5;i++){
    const z2=new T.Group();
    const body=new T.Mesh(new T.TetrahedronGeometry(0.45), leaf);
    body.rotation.set(Math.random(),Math.random(),Math.random());
    const tie=new T.Mesh(new T.TorusGeometry(0.3,0.03,6,12), DBF.mat(0xcaa14a));
    tie.rotation.x=Math.PI/2;
    z2.add(body,tie);
    z2.position.set((Math.random()-0.5)*1.4, 0.45+Math.random()*0.3, (Math.random()-0.5)*1.4);
    z2.castShadow=true;
    grp.add(z2);
  }
  grp.position.set(x,0,z);
  DBF.scene.add(grp);
}

// ============================================================
//  构建世界
// ============================================================
DBF.buildWorld = function(){
  buildSky();
  buildWater();
  buildBanks();
  buildMountains();
  buildArchGate();

  // 亭子（两岸各一）
  buildPavilion(-(DIM.RIVER_W/2+18), -40, 0x8a4a2a);
  buildPavilion( (DIM.RIVER_W/2+18),  60, 0x7a3a48);

  // 看台
  buildStand(-1, -10);
  buildStand( 1,  30);
  buildStand(-1,  90);

  // 植被
  for(let i=0;i<10;i++){
    buildWillow(-(DIM.RIVER_W/2+8+Math.random()*30), -DIM.RIVER_L/2+40+i*38);
    buildWillow( (DIM.RIVER_W/2+8+Math.random()*30), -DIM.RIVER_L/2+60+i*38);
  }
  for(let i=0;i<28;i++){
    buildReeds(-(DIM.RIVER_W/2+2.5), -DIM.RIVER_L/2+30+i*13);
    buildReeds( (DIM.RIVER_W/2+2.5), -DIM.RIVER_L/2+36+i*13);
  }

  // 节日装饰
  buildLanternString(-1);
  buildLanternString(1);
  buildFlagRows();
  buildBanner('端午安康 · 百舸争流', -20);
  buildBanner('鼓声震天 · 一桨一山河', 70);
  buildBanner('风调雨顺 · 国泰民安', 150);
  for(let i=0;i<6;i++){
    buildZongziPile(-(DIM.RIVER_W/2+6+Math.random()*20), -60+i*40);
    buildZongziPile( (DIM.RIVER_W/2+6+Math.random()*20), -80+i*40);
  }

  // 旗帜 / 飘动统一 tick
  DBF.registerTick((dt,t)=>{
    for(let k=0;k<flagList.length;k++){
      const f=flagList[k], arr=f.geo.attributes.position.array, base=f.base;
      for(let i=0;i<arr.length;i+=3){
        arr[i+2]=Math.sin(base[i]*1.5+t*5+f.seed)*(base[i]*0.18);
      }
      f.geo.attributes.position.needsUpdate=true;
    }
    // 星星微闪
    if(starField && starField.material.opacity>0.01){
      starField.material.opacity = (DBF.state.timeOfDay==='night') ? (0.7+Math.sin(t*2)*0.2) : starField.material.opacity;
    }
  });

  DBF._lanternGlows = lanternGlows;
  DBF._sky = {skyMat, sunMesh, moonMesh, starField};
};

// ============================================================
//  昼夜系统
// ============================================================
const PRESETS = {
  day: {
    bg:0x9dc4ee, fogC:0xb8d2f0, fogN:140, fogF:420,
    top:0x3f74c4, bottom:0xcfe6ff,
    amb:0.75, hemi:0.7, sun:1.25, sunC:0xfff3d6, warm:0.2,
    sun:true, moon:false, stars:0, waterC:0x3a93a0, waterE:0x16454c, waterEI:0.25,
  },
  dusk: {
    bg:0x2a3a66, fogC:0x3a3258, fogN:90, fogF:340,
    top:0x2a4a82, bottom:0xf6a861,
    amb:0.55, hemi:0.5, sun:0.95, sunC:0xffb060, warm:0.55,
    sunV:true, moonV:false, stars:0.15, waterC:0x356b80, waterE:0x3a2230, waterEI:0.4,
  },
  night: {
    bg:0x0a1228, fogC:0x10182f, fogN:70, fogF:300,
    top:0x060c1f, bottom:0x243a66,
    amb:0.32, hemi:0.3, sun:0.35, sunC:0x9fb6e0, warm:0.85,
    sunV:false, moonV:true, stars:0.85, waterC:0x16384a, waterE:0x1a3a4a, waterEI:0.6,
  },
};
DBF.setTimeOfDay = function(mode){
  const p = PRESETS[mode]; if(!p) return;
  DBF.state.timeOfDay = mode;
  const {scene} = DBF, L = DBF.lights, S = DBF._sky||{};

  scene.background.setHex(p.bg);
  scene.fog.color.setHex(p.fogC); scene.fog.near=p.fogN; scene.fog.far=p.fogF;
  if(skyMat){ skyMat.uniforms.top.value.setHex(p.top); skyMat.uniforms.bottom.value.setHex(p.bottom); }

  L.amb.intensity=p.amb; L.hemi.intensity=p.hemi;
  L.sun.intensity = (typeof p.sun==='number')?p.sun:1.0;
  L.sun.color.setHex(p.sunC); L.warm.intensity=p.warm;

  if(S.sunMesh) S.sunMesh.visible = !!(p.sunV ?? (mode==='day'||mode==='dusk'));
  if(S.moonMesh) S.moonMesh.visible = !!(p.moonV ?? (mode==='night'));
  if(S.starField) S.starField.material.opacity = p.stars||0;

  if(waterMat){ waterMat.color.setHex(p.waterC); waterMat.emissive.setHex(p.waterE); waterMat.emissiveIntensity=p.waterEI; }

  // 灯笼夜晚更亮
  const li = (mode==='night')?1.2:(mode==='dusk'?0.7:0.25);
  (DBF._lanternGlows||[]).forEach(m=> m.emissiveIntensity=li);
};

})();
