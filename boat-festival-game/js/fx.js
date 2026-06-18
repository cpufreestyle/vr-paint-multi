/* =========================================================================
   龙舟盛景 · fx.js —— 岸边人群 / 烟花 / 河灯 / 孔明灯
   ========================================================================= */
(function(){
"use strict";
const DBF = window.DBF;
const T = window.THREE;

// 喜庆衣服色
const SHIRTS = [0xd64545,0x3a7bd5,0x40a060,0xe0a82e,0x9b59b6,0xe67e22,0x16a085,0xe84393];

// ---------- 岸边观众 ----------
function makeSpectator(seed){
  const g=new T.Group();
  const skin=DBF.mat(0xe6b88a,{roughness:0.9});
  const shirt=DBF.mat(SHIRTS[Math.floor(seed)%SHIRTS.length],{roughness:0.85});
  const body=new T.Mesh(new T.CylinderGeometry(0.28,0.34,1.1,8), shirt);
  body.position.y=0.85; body.castShadow=true; g.add(body);
  const head=new T.Mesh(new T.SphereGeometry(0.24,12,10), skin);
  head.position.y=1.62; head.castShadow=true; g.add(head);
  function arm(side){
    const pivot=new T.Group(); pivot.position.set(side*0.32,1.35,0);
    const a=new T.Mesh(new T.BoxGeometry(0.14,0.62,0.14), skin); a.position.y=-0.3; pivot.add(a);
    g.add(pivot); return pivot;
  }
  return {group:g, leftArm:arm(-1), rightArm:arm(1)};
}

function buildCrowd(){
  const {RIVER_W, RIVER_L} = DBF.DIM;
  const crowd=[];
  [-1,1].forEach(side=>{
    for(let i=0;i<55;i++){
      const sp=makeSpectator(i*1.7+side*3);
      const px=side*(RIVER_W/2 + 5 + Math.random()*16);
      const pz=-RIVER_L/2+35 + Math.random()*(RIVER_L-70);
      sp.group.position.set(px,0,pz);
      sp.group.rotation.y = side>0? -Math.PI/2 : Math.PI/2;
      sp.group.scale.setScalar(0.9+Math.random()*0.35);
      DBF.scene.add(sp.group);
      crowd.push({sp, seed:Math.random()*10, cheer:Math.random()<0.55});
    }
  });
  DBF.registerTick((dt,t)=>{
    for(let k=0;k<crowd.length;k++){
      const c=crowd[k], s=Math.sin(t*2.4+c.seed);
      c.sp.group.rotation.z = s*0.10;
      if(c.cheer){
        c.sp.leftArm.rotation.x = -2.3 + Math.sin(t*6+c.seed)*0.4;
        c.sp.rightArm.rotation.x = -2.3 + Math.cos(t*6+c.seed)*0.4;
      } else {
        c.sp.leftArm.rotation.x = Math.sin(t*2+c.seed)*0.2;
      }
    }
  });
}

// ============================================================
//  水花 / 浪沫系统（船首劈浪 + 划桨溅水，环形缓冲池）
// ============================================================
const WK_CAP = 900;
let wkPos, wkVel, wkLife, wkGeo, wkCursor=0, wkPts;
function initWake(){
  wkPos=new Float32Array(WK_CAP*3);
  wkVel=new Float32Array(WK_CAP*3);
  wkLife=new Float32Array(WK_CAP);
  for(let i=0;i<WK_CAP;i++){ wkPos[i*3+1]=-999; }   // 初始藏到水下
  wkGeo=new T.BufferGeometry();
  wkGeo.setAttribute('position', new T.BufferAttribute(wkPos,3));
  wkPts=new T.Points(wkGeo, new T.PointsMaterial({
    color:0xf4fbff, size:0.55, transparent:true, opacity:0.85,
    depthWrite:false, sizeAttenuation:true
  }));
  DBF.scene.add(wkPts);
  DBF.registerTick((dt)=>{
    for(let i=0;i<WK_CAP;i++){
      if(wkLife[i]<=0) continue;
      wkLife[i]-=dt;
      wkVel[i*3+1]-=11*dt;                 // 重力
      wkPos[i*3]  +=wkVel[i*3]*dt;
      wkPos[i*3+1]+=wkVel[i*3+1]*dt;
      wkPos[i*3+2]+=wkVel[i*3+2]*dt;
      if(wkLife[i]<=0 || wkPos[i*3+1]<0.05){ wkPos[i*3+1]=-999; wkLife[i]=0; }
    }
    wkGeo.attributes.position.needsUpdate=true;
  });
}
function emitWake(x,y,z,vx,vy,vz,life){
  const i=wkCursor; wkCursor=(wkCursor+1)%WK_CAP;
  wkPos[i*3]=x; wkPos[i*3+1]=y; wkPos[i*3+2]=z;
  wkVel[i*3]=vx; wkVel[i*3+1]=vy; wkVel[i*3+2]=vz;
  wkLife[i]=life;
}
// 供 boats 调用：船首劈浪 + 两侧桨花
DBF.spawnWake = function(x, z, speed){
  if(!wkPos || speed < 2.5) return;
  const bow = z + 11.5;
  const n = speed>16 ? 3 : (speed>8?2:1);
  for(let k=0;k<n;k++){
    const s=(Math.random()<0.5?-1:1);
    emitWake(x + s*(0.8+Math.random()*0.8), 0.55, bow + Math.random()*0.6,
             s*(1.2+Math.random()*1.6), 1.2+Math.random()*1.4, 1.0+Math.random()*1.5, 0.55);
  }
  if(speed>5 && Math.random()<0.8){
    const s=(Math.random()<0.5?-1:1);
    emitWake(x + s*1.6, 0.45, z + (Math.random()-0.5)*9,
             s*1.2, 0.9+Math.random(), -0.5, 0.45);
  }
  emitWake(x + (Math.random()-0.5)*1.8, 0.4, z-11, (Math.random()-0.5)*0.8, 0.4, -1.2, 0.6);
};

// ============================================================
//  烟花系统
// ============================================================
const fireworks = []; // {pts, geo, mat, state, vel, life, color}
const FW_COLORS = [0xff4d6d,0xffd76a,0x5fe0ff,0x9aff8a,0xc77dff,0xff9e3d,0xffffff];

function makeFireworkRocket(x, targetY, color){
  const N=110;
  const pos=new Float32Array(N*3);
  const vel=new Float32Array(N*3);
  for(let i=0;i<N;i++){ pos[i*3]=x; pos[i*3+1]=0.6; pos[i*3+2]=-30; } // 从河面升起
  const geo=new T.BufferGeometry();
  geo.setAttribute('position', new T.BufferAttribute(pos,3));
  const mat=new T.PointsMaterial({color, size:1.4, transparent:true, opacity:1,
    blending:T.AdditiveBlending, depthWrite:false});
  const pts=new T.Points(geo, mat);
  DBF.scene.add(pts);
  fireworks.push({pts, geo, mat, vel, state:'rise', riseY:0.6, targetY, x, z:-30, life:0, color});
}

function explode(fw){
  fw.state='boom';
  const pos=fw.geo.attributes.position.array;
  const N=pos.length/3;
  for(let i=0;i<N;i++){
    // 球面随机方向
    const th=Math.random()*Math.PI*2, ph=Math.acos(2*Math.random()-1);
    const sp=8+Math.random()*9;
    fw.vel[i*3]=Math.sin(ph)*Math.cos(th)*sp;
    fw.vel[i*3+1]=Math.cos(ph)*sp;
    fw.vel[i*3+2]=Math.sin(ph)*Math.sin(th)*sp;
    pos[i*3]=fw.x; pos[i*3+1]=fw.targetY; pos[i*3+2]=fw.z;
  }
  fw.geo.attributes.position.needsUpdate=true;
  fw.life=0;
}

DBF.registerTick((dt)=>{
  for(let f=fireworks.length-1; f>=0; f--){
    const fw=fireworks[f];
    const pos=fw.geo.attributes.position.array;
    if(fw.state==='rise'){
      fw.riseY += 42*dt;
      for(let i=0;i<pos.length;i+=3){
        pos[i]=fw.x + Math.sin(fw.riseY*0.4+i)*0.1;
        pos[i+1]=fw.riseY;
        pos[i+2]=fw.z;
      }
      fw.geo.attributes.position.needsUpdate=true;
      if(fw.riseY>=fw.targetY) explode(fw);
    } else {
      fw.life += dt;
      for(let i=0;i<pos.length;i+=3){
        fw.vel[i+1] -= 9.5*dt;       // 重力
        fw.vel[i]   *= 0.985;
        fw.vel[i+2] *= 0.985;
        pos[i]   += fw.vel[i]*dt;
        pos[i+1] += fw.vel[i+1]*dt;
        pos[i+2] += fw.vel[i+2]*dt;
      }
      fw.geo.attributes.position.needsUpdate=true;
      fw.mat.opacity = Math.max(0, 1 - fw.life/2.0);
      fw.mat.size = 1.4 + fw.life*0.5;
      if(fw.life>2.0){
        DBF.scene.remove(fw.pts);
        fw.geo.dispose(); fw.mat.dispose();
        fireworks.splice(f,1);
      }
    }
  }
});

// 放一组烟花
DBF.launchFireworkShow = function(){
  const n=4+Math.floor(Math.random()*3);
  for(let i=0;i<n;i++){
    setTimeout(()=>{
      const x=(Math.random()-0.5)*70;
      const y=40+Math.random()*30;
      makeFireworkRocket(x, y, FW_COLORS[Math.floor(Math.random()*FW_COLORS.length)]);
    }, i*260);
  }
};

// ============================================================
//  河灯（荷花灯，顺流漂）
// ============================================================
const riverLanterns=[];
function makeRiverLantern(x,z){
  const g=new T.Group();
  const glow=new T.Mesh(new T.SphereGeometry(0.32,12,10),
    new T.MeshStandardMaterial({color:0xffb24a, emissive:0xff8c2a, emissiveIntensity:1.4, roughness:0.5}));
  glow.scale.y=0.7;
  // 花瓣
  for(let i=0;i<6;i++){
    const ang=i*Math.PI/3;
    const petal=new T.Mesh(new T.ConeGeometry(0.18,0.5,5),
      new T.MeshStandardMaterial({color:0xff8fa3, emissive:0x6a2030, emissiveIntensity:0.3, roughness:0.7}));
    petal.position.set(Math.cos(ang)*0.3,0.05,Math.sin(ang)*0.3);
    petal.rotation.set(Math.PI*0.62, 0, -ang);
    g.add(petal);
  }
  g.add(glow);
  g.position.set(x,0.35,z);
  DBF.scene.add(g);
  riverLanterns.push({g, drift:(Math.random()-0.5)*1.2, spin:(Math.random()-0.5)*0.5, seed:Math.random()*9});
}
DBF.dropRiverLanterns = function(n){
  n=n||10;
  const {RIVER_W,RIVER_L}=DBF.DIM;
  for(let i=0;i<n;i++){
    makeRiverLantern((Math.random()-0.5)*(RIVER_W-8), -RIVER_L/2+30 + Math.random()*40);
  }
};
DBF.registerTick((dt,t)=>{
  for(let i=0;i<riverLanterns.length;i++){
    const r=riverLanterns[i];
    r.g.position.z += (4 + r.drift)*dt;           // 顺流而下
    r.g.position.x += Math.sin(t*0.6+r.seed)*0.06;
    r.g.position.y = 0.35 + DBF.waterHeightAt(r.g.position.x, r.g.position.z, t)*0.4;
    r.g.rotation.y += r.spin*dt;
    if(r.g.position.z > DBF.DIM.RIVER_L/2-10) r.g.position.z = -DBF.DIM.RIVER_L/2+30;
  }
});

// ============================================================
//  孔明灯（夜晚升空）
// ============================================================
const skyLanterns=[];
function makeSkyLantern(x,z){
  const g=new T.Group();
  const body=new T.Mesh(new T.CylinderGeometry(0.5,0.35,0.9,10,1,true),
    new T.MeshStandardMaterial({color:0xffcf7a, emissive:0xff9a2a, emissiveIntensity:1.2, side:T.DoubleSide, roughness:0.6}));
  const top=new T.Mesh(new T.SphereGeometry(0.5,10,6, 0, Math.PI*2, 0, Math.PI/2),
    new T.MeshStandardMaterial({color:0xffcf7a, emissive:0xff9a2a, emissiveIntensity:0.8}));
  top.position.y=0.45;
  g.add(body, top);
  g.position.set(x, 2, z);
  DBF.scene.add(g);
  skyLanterns.push({g, vy:1.2+Math.random()*0.8, seed:Math.random()*9});
}
DBF.releaseSkyLanterns = function(n){
  n=n||10;
  for(let i=0;i<n;i++){
    setTimeout(()=> makeSkyLantern((Math.random()-0.5)*90, -40+Math.random()*120), i*350);
  }
};
DBF.registerTick((dt,t)=>{
  for(let i=skyLanterns.length-1;i>=0;i--){
    const s=skyLanterns[i];
    s.g.position.y += s.vy*dt;
    s.g.position.x += Math.sin(t*0.4+s.seed)*0.08;
    if(s.g.position.y>120){ DBF.scene.remove(s.g); skyLanterns.splice(i,1); }
  }
});

// ============================================================
//  构建
// ============================================================
DBF.buildFX = function(){
  initWake();
  buildCrowd();
  DBF.dropRiverLanterns(14);
};

})();
