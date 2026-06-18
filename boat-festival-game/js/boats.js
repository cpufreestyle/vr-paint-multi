/* =========================================================================
   龙舟盛景 · boats.js —— 龙舟 / 逼真划手 / 鼓手 / 竞速
   纯几何精细建模：分段四肢 + 收腰躯干 + 坐姿发力 + 整齐划桨。
   ========================================================================= */
(function(){
"use strict";
const DBF = window.DBF;
const T = window.THREE;

// 队伍配色（沉稳高级 · 朱红描金为主）
const TEAMS = [
  {hull:0xb3202e, trim:0xd9a93a, shirt:0xe8c25a, name:'赤焰'},
  {hull:0x1f5673, trim:0xcfe6f0, shirt:0xdfeef5, name:'靛江'},
  {hull:0x2d6a4f, trim:0xd7e8b0, shirt:0xeaf3d6, name:'翠屏'},
  {hull:0xb5701a, trim:0x4a2c0d, shirt:0xf0d9a8, name:'金穗'},
  {hull:0x6d3b6e, trim:0xe7c6e7, shirt:0xf0dcf0, name:'紫宸'},
];
const SKINS = [0xd9a877, 0xcf9d6a, 0xe0b386, 0xc8915a];
const PANTS = [0x2b3340, 0x33302a, 0x2a3b3a, 0x3a2f2a];
const HAIR  = 0x1a1410;
const pick = (a,i)=> a[Math.floor(Math.abs(i))%a.length];

// ============================================================
//  逼真人物（坐姿划手 / 站姿观众通用）
// ============================================================
function makePerson(opt){
  opt = opt||{};
  const scale = opt.scale||1;
  const sitting = opt.sitting!==false;
  const skinM = DBF.mat(opt.skin||pick(SKINS,opt.seed||0), {roughness:0.78});
  const shirtM= DBF.mat(opt.shirt||0xcccccc, {roughness:0.85});
  const pantsM= DBF.mat(opt.pants||pick(PANTS,opt.seed||1), {roughness:0.9});
  const hairM = DBF.mat(HAIR, {roughness:0.7});

  const g = new T.Group();
  const torso = new T.Group(); g.add(torso);

  const pelvis = new T.Mesh(new T.CylinderGeometry(0.14,0.15,0.16,12), pantsM);
  pelvis.position.y=0.05; pelvis.castShadow=true; torso.add(pelvis);
  const chest = new T.Mesh(new T.CylinderGeometry(0.175,0.135,0.40,14), shirtM);
  chest.position.y=0.34; chest.castShadow=true; torso.add(chest);
  const shoulder = new T.Mesh(new T.CylinderGeometry(0.06,0.06,0.40,10), shirtM);
  shoulder.rotation.z=Math.PI/2; shoulder.position.y=0.53; torso.add(shoulder);
  const neck = new T.Mesh(new T.CylinderGeometry(0.05,0.055,0.09,8), skinM);
  neck.position.y=0.60; torso.add(neck);

  const headPivot = new T.Group(); headPivot.position.y=0.65; torso.add(headPivot);
  const head = new T.Mesh(new T.SphereGeometry(0.115,16,14), skinM);
  head.scale.set(0.92,1.05,0.96); head.position.y=0.06; head.castShadow=true; headPivot.add(head);
  const hair = new T.Mesh(new T.SphereGeometry(0.122,16,12, 0,Math.PI*2, 0,Math.PI*0.62), hairM);
  hair.position.y=0.075; hair.rotation.x=-0.15; headPivot.add(hair);

  function makeArm(side){
    const sh = new T.Group(); sh.position.set(side*0.19, 0.50, 0);
    const upper = new T.Mesh(new T.CylinderGeometry(0.05,0.045,0.27,8), skinM);
    upper.position.y=-0.135; upper.castShadow=true; sh.add(upper);
    const el = new T.Group(); el.position.y=-0.27; sh.add(el);
    const fore = new T.Mesh(new T.CylinderGeometry(0.043,0.038,0.25,8), skinM);
    fore.position.y=-0.125; fore.castShadow=true; el.add(fore);
    const hand = new T.Mesh(new T.SphereGeometry(0.05,10,8), skinM);
    hand.position.y=-0.26; el.add(hand);
    torso.add(sh);
    return {sh, el};
  }
  const aL = makeArm(-1), aR = makeArm(1);

  function makeLeg(side){
    const hip = new T.Group(); hip.position.set(side*0.09, 0.02, 0);
    const thigh = new T.Mesh(new T.CylinderGeometry(0.065,0.06,0.34,8), pantsM);
    thigh.position.y=-0.17; thigh.castShadow=true; hip.add(thigh);
    const knee = new T.Group(); knee.position.y=-0.34; hip.add(knee);
    const shin = new T.Mesh(new T.CylinderGeometry(0.055,0.045,0.32,8), pantsM);
    shin.position.y=-0.16; shin.castShadow=true; knee.add(shin);
    const foot = new T.Mesh(new T.BoxGeometry(0.10,0.06,0.20), DBF.mat(0x222024));
    foot.position.set(0,-0.32,0.06); knee.add(foot);
    g.add(hip);
    return {hip, knee};
  }
  const lL = makeLeg(-1), lR = makeLeg(1);

  if(sitting){
    torso.rotation.x = 0.30;
    aL.sh.rotation.x = -0.9; aR.sh.rotation.x = -0.9;
    aL.el.rotation.x = -0.5; aR.el.rotation.x = -0.5;
    lL.hip.rotation.x = -1.5; lR.hip.rotation.x = -1.5;
    lL.knee.rotation.x = 1.45; lR.knee.rotation.x = 1.45;
  } else {
    aL.sh.rotation.x = 0.12; aR.sh.rotation.x = 0.12;
    aL.el.rotation.x = -0.25; aR.el.rotation.x = -0.25;
  }

  g.scale.setScalar(scale);
  return {group:g, torso, headPivot, armL:aL, armR:aR, legL:lL, legR:lR, sitting};
}
DBF.makePerson = makePerson;

// ============================================================
//  船身纹样贴图
// ============================================================
function shade(hex,f){
  const n=parseInt(hex.slice(1),16);
  let r=(n>>16)&255,g=(n>>8)&255,b=n&255;
  r=Math.min(255,r*f)|0; g=Math.min(255,g*f)|0; b=Math.min(255,b*f)|0;
  return '#'+((r<<16)|(g<<8)|b).toString(16).padStart(6,'0');
}
function hullTexture(hull, trim){
  const c=document.createElement('canvas'); c.width=512; c.height=128;
  const ctx=c.getContext('2d');
  const hx='#'+hull.toString(16).padStart(6,'0');
  const tx='#'+trim.toString(16).padStart(6,'0');
  const grad=ctx.createLinearGradient(0,0,0,128);
  grad.addColorStop(0, shade(hx,1.18)); grad.addColorStop(0.5,hx); grad.addColorStop(1,shade(hx,0.78));
  ctx.fillStyle=grad; ctx.fillRect(0,0,512,128);
  ctx.fillStyle=tx; ctx.fillRect(0,6,512,7); ctx.fillRect(0,115,512,7);
  ctx.strokeStyle=tx; ctx.lineWidth=3; ctx.globalAlpha=0.9;
  for(let k=0;k<2;k++){
    ctx.beginPath();
    for(let x=0;x<=512;x+=8){ const y=58+k*12+Math.sin(x*0.08+k)*7; x===0?ctx.moveTo(x,y):ctx.lineTo(x,y); }
    ctx.stroke();
  }
  ctx.globalAlpha=0.85;
  for(let x=20;x<512;x+=64){ ctx.strokeRect(x,40,18,18); ctx.strokeRect(x+4,44,10,10); }
  ctx.globalAlpha=1;
  const tex=new T.CanvasTexture(c); tex.wrapS=T.RepeatWrapping; tex.repeat.set(3,1);
  tex.anisotropy=4; tex.encoding=T.sRGBEncoding;
  return tex;
}

// ============================================================
//  龙舟工厂
// ============================================================
function makeDragonBoat(team, lane){
  const boat = new T.Group();
  const trimM = DBF.mat(team.trim, {metalness:0.45, roughness:0.42});
  const woodDark = DBF.mat(0x3a2a1c, {roughness:0.9});
  const hMat=DBF.mat(team.hull,{roughness:0.5,metalness:0.18});

  // 船身
  const hullMat = new T.MeshStandardMaterial({map:hullTexture(team.hull, team.trim), roughness:0.62, metalness:0.12});
  const mid = new T.Mesh(new T.BoxGeometry(2.6,1.15,18), hullMat);
  mid.position.y=0.55; mid.castShadow=true; mid.receiveShadow=true; boat.add(mid);
  [-1,1].forEach(s=>{
    const taper=new T.Mesh(new T.CylinderGeometry(0.2,1.4,4.5,4,1,false), hullMat);
    taper.rotation.x=Math.PI/2; taper.rotation.y=Math.PI/4;
    taper.scale.set(0.92,1,0.62);
    taper.position.set(0,0.55, s*11); taper.castShadow=true; boat.add(taper);
  });
  [-1,1].forEach(sx=>{
    const rail=new T.Mesh(new T.BoxGeometry(0.12,0.16,19), trimM);
    rail.position.set(sx*1.3,1.12,0); boat.add(rail);
  });
  const inner=new T.Mesh(new T.BoxGeometry(1.9,0.7,17), woodDark);
  inner.position.y=0.95; boat.add(inner);

  // 龙头
  const headG=new T.Group();
  const neck=new T.Mesh(new T.CylinderGeometry(0.7,1.0,2.2,10), hMat);
  neck.rotation.x=-0.5; neck.position.set(0,1.3,9.6); headG.add(neck);
  const skull=new T.Mesh(new T.SphereGeometry(1.05,16,14), hMat);
  skull.scale.set(1,0.95,1.25); skull.position.set(0,2.35,10.8); skull.castShadow=true; headG.add(skull);
  const snout=new T.Mesh(new T.BoxGeometry(1.0,0.7,1.4), hMat);
  snout.position.set(0,2.0,12.0); headG.add(snout);
  const jaw=new T.Mesh(new T.BoxGeometry(1.1,0.18,1.5), trimM); jaw.position.set(0,1.72,12.0); headG.add(jaw);
  [-0.32,0.32].forEach(tx=>{
    const tooth=new T.Mesh(new T.ConeGeometry(0.08,0.3,5), DBF.mat(0xf3ecd8));
    tooth.position.set(tx,1.5,12.5); tooth.rotation.x=Math.PI; headG.add(tooth);
  });
  [-0.55,0.55].forEach(sx=>{
    const eyeW=new T.Mesh(new T.SphereGeometry(0.26,12,12), DBF.mat(0xf5f0e0,{roughness:0.4}));
    eyeW.position.set(sx,2.7,11.5); headG.add(eyeW);
    const pup=new T.Mesh(new T.SphereGeometry(0.13,10,10), DBF.mat(0x140a08));
    pup.position.set(sx,2.72,11.72); headG.add(pup);
    const brow=new T.Mesh(new T.BoxGeometry(0.4,0.1,0.3), trimM);
    brow.position.set(sx,3.0,11.5); brow.rotation.z=sx*0.3; headG.add(brow);
  });
  [-0.55,0.55].forEach(sx=>{
    const horn=new T.Mesh(new T.ConeGeometry(0.16,1.5,7), trimM);
    horn.position.set(sx,3.5,10.4); horn.rotation.set(-0.6,0,sx*0.25); headG.add(horn);
  });
  [-1,1].forEach(sx=>{
    const w=new T.Mesh(new T.CylinderGeometry(0.04,0.01,1.8,5), trimM);
    w.position.set(sx*0.75,1.7,12.2); w.rotation.set(0.7,0,sx*0.5); headG.add(w);
  });
  for(let i=0;i<5;i++){
    const m=new T.Mesh(new T.ConeGeometry(0.14,0.5,4), trimM);
    m.position.set(0,2.9-i*0.28, 10.2-i*0.5); m.rotation.x=-0.3; headG.add(m);
  }
  headG.castShadow=true; boat.add(headG);

  // 龙尾
  const tail=new T.Group();
  const tBase=new T.Mesh(new T.CylinderGeometry(0.6,0.2,2.6,8), hMat);
  tBase.rotation.x=-1.0; tBase.position.set(0,1.6,-10.2); tail.add(tBase);
  const tFan=new T.Mesh(new T.ConeGeometry(1.1,2.0,6), trimM);
  tFan.position.set(0,2.9,-10.9); tFan.rotation.x=-0.5; tail.add(tFan);
  tail.castShadow=true; boat.add(tail);

  // 鼓
  const drum=new T.Mesh(new T.CylinderGeometry(0.85,0.85,1.2,20), DBF.mat(0x8c2418,{roughness:0.7}));
  drum.position.set(0,1.55,6.3); drum.castShadow=true; boat.add(drum);
  const drumHoop=new T.Mesh(new T.TorusGeometry(0.86,0.07,8,20), trimM);
  drumHoop.rotation.x=Math.PI/2; drumHoop.position.set(0,1.55,6.3); boat.add(drumHoop);
  const drumSkin=new T.Mesh(new T.CylinderGeometry(0.9,0.9,0.12,20), DBF.mat(0xe8d6a8,{roughness:0.6}));
  drumSkin.position.set(0,2.18,6.3); boat.add(drumSkin);

  // 鼓手
  const drummer = makePerson({sitting:false, scale:1.0, shirt:team.shirt, seed:lane*3.1, skin:pick(SKINS,lane)});
  drummer.group.position.set(0,2.2,7.4);
  drummer.group.rotation.y=Math.PI;
  boat.add(drummer.group);
  [-1,1].forEach(side=>{
    const stick=new T.Mesh(new T.CylinderGeometry(0.03,0.025,0.6,6), woodDark);
    stick.position.y=-0.3;
    (side<0?drummer.armL:drummer.armR).el.add(stick);
  });

  // 划手
  const paddlers=[];
  for(let r=0;r<6;r++){
    const pz = 4.0 - r*1.7;
    [-1,1].forEach(side=>{
      const p = makePerson({sitting:true, scale:1.0, shirt:team.shirt, seed:lane*7+r*2+side, skin:pick(SKINS,r+side)});
      p.group.position.set(side*0.62, 1.35, pz);
      p.group.rotation.y = side>0 ? 0.18 : -0.18;
      boat.add(p.group);
      const paddle=new T.Group();
      const shaft=new T.Mesh(new T.CylinderGeometry(0.045,0.04,2.4,7), woodDark);
      shaft.position.y=-1.1;
      const blade=new T.Mesh(new T.BoxGeometry(0.42,0.85,0.06), DBF.mat(team.trim,{roughness:0.6}));
      blade.position.y=-2.35;
      paddle.add(shaft,blade);
      paddle.position.set(0,-0.25,0.12);
      paddle.rotation.x=0.85;
      (side>0 ? p.armR : p.armL).el.add(paddle);
      paddlers.push({p, side, paddle});
    });
  }

  // 队旗
  const flagPole=new T.Mesh(new T.CylinderGeometry(0.05,0.05,3.4,6), trimM);
  flagPole.position.set(0,3.4,-8.2); boat.add(flagPole);
  const flagGeo=new T.PlaneGeometry(1.8,1.1,10,6); flagGeo.translate(0.9,0,0);
  const flagTex=DBF.makeTextTexture(team.name,{w:256,h:160,
    c1:shade('#'+team.hull.toString(16).padStart(6,'0'),0.8),
    c2:'#'+team.hull.toString(16).padStart(6,'0'),
    color:'#'+team.trim.toString(16).padStart(6,'0'), fs:108});
  const flag=new T.Mesh(flagGeo, new T.MeshStandardMaterial({map:flagTex, side:T.DoubleSide, roughness:0.8}));
  flag.position.set(0.05,4.6,-8.2); boat.add(flag);

  boat.position.set(lane,0.5,0);
  DBF.scene.add(boat);

  return {
    group:boat, drummer, paddlers, team, lane,
    flag, flagGeo, flagBase:flagGeo.attributes.position.array.slice(),
    beatPhase:Math.random()*6, cadence:3,
    speed:0, power:0, isPlayer:false, finished:false, finishTime:0,
  };
}

// ============================================================
//  构建所有龙舟
// ============================================================
const RACE = { active:false, startZ:0, startTime:0, playerDone:false };

DBF.buildBoats = function(){
  const lanes = [-22,-11,0,11,22];
  DBF.boats = [];
  for(let i=0;i<5;i++){
    const b = makeDragonBoat(TEAMS[i], lanes[i]);
    b.group.position.z = -10 - i*3;
    DBF.boats.push(b);
  }
  DBF.boats[2].isPlayer = true;
  DBF.player = DBF.boats[2];
  RACE.startZ = -DBF.DIM.RIVER_L/2 + 45;

  DBF.registerTick((dt,t)=> updateBoats(dt,t));
  DBF.on('mode', ({mode})=>{ if(mode==='race'){ startRace(); } else { endRaceCleanup(); } });

  window.addEventListener('keydown', e=>{
    if(e.code==='Space' && DBF.state.mode==='race'){ e.preventDefault(); drumBeat(); }
  });
  const tip=document.getElementById('drum-tip');
  if(tip){ tip.addEventListener('click', ()=>{ if(DBF.state.mode==='race') drumBeat(); }); }
};

function animatePaddlers(b, beat){
  const drive = Math.sin(beat);
  b.paddlers.forEach(p=>{
    const per=p.p;
    per.torso.rotation.x = 0.30 + drive*0.26;
    per.armL.sh.rotation.x = -0.9 - drive*0.45;
    per.armR.sh.rotation.x = -0.9 - drive*0.45;
    per.armL.el.rotation.x = -0.5 + drive*0.30;
    per.armR.el.rotation.x = -0.5 + drive*0.30;
    p.paddle.rotation.x = 0.85 + drive*0.35;
  });
  const hit = Math.max(0, Math.sin(beat));
  b.drummer.armL.sh.rotation.x = -1.4 - hit*0.7;
  b.drummer.armR.sh.rotation.x = -1.4 - hit*0.7;
  b.drummer.armL.el.rotation.x = -0.8;
  b.drummer.armR.el.rotation.x = -0.8;
  b.drummer.headPivot.rotation.x = hit*0.15;
}

function updateBoats(dt,t){
  const inRace = (DBF.state.mode==='race' && RACE.active);
  const RIVER_L = DBF.DIM.RIVER_L;

  DBF.boats.forEach((b,i)=>{
    if(inRace){
      if(b.isPlayer){
        b.power = Math.max(0, b.power - dt*0.55);
        b.speed += (26*b.power - b.speed)*Math.min(1,dt*2.2);
        b.cadence = 2.5 + b.power*8;
      } else {
        const base = 17.5 + i*0.6 + Math.sin(t*1.3+i)*2.2;
        b.speed += (base-b.speed)*Math.min(1,dt*1.5);
        b.cadence = 3 + b.speed*0.12;
      }
      if(!b.finished){
        b.group.position.z += b.speed*dt;
        if(b.group.position.z >= DBF.FINISH_Z){
          b.group.position.z = DBF.FINISH_Z; b.finished=true;
          b.finishTime = t-RACE.startTime; onBoatFinish(b);
        }
      }
    } else {
      b.speed += (10-b.speed)*Math.min(1,dt*1.0);
      b.cadence = 3.2;
      b.group.position.z += b.speed*dt;
      if(b.group.position.z > RIVER_L/2-20) b.group.position.z = -RIVER_L/2+20 - i*3;
    }

    const fl = DBF.waterHeightAt(b.lane, b.group.position.z, t);
    b.group.position.y = 0.5 + fl*0.45;
    b.group.rotation.z = Math.sin(t*1.2+b.lane)*0.03;
    b.group.rotation.x = -b.speed*0.003 + Math.sin(t*0.9+i)*0.012;

    b.beatPhase += b.cadence*dt;
    animatePaddlers(b, b.beatPhase);

    if(DBF.spawnWake) DBF.spawnWake(b.group.position.x, b.group.position.z, b.speed);

    const arr=b.flagGeo.attributes.position.array, base=b.flagBase;
    for(let k=0;k<arr.length;k+=3){ arr[k+2]=Math.sin(base[k]*2+t*6+i)*(base[k]*0.18); }
    b.flagGeo.attributes.position.needsUpdate=true;
  });

  if(inRace) updateRaceHUDAndCamera(t);
}

let lastBeatT=0;
function drumBeat(){
  const p=DBF.player, now=DBF._t, gap=now-lastBeatT; lastBeatT=now;
  const rhythm=(gap>0.22&&gap<0.75)?0.26:0.16;
  p.power=Math.min(1,p.power+rhythm);
}

function startRace(){
  RACE.active=true; RACE.playerDone=false; RACE.startTime=DBF._t;
  DBF.boats.forEach((b,i)=>{
    b.group.position.z = RACE.startZ - i*1.2;
    b.speed=0; b.power=0; b.finished=false; b.finishTime=0;
  });
  DBF.controls.enabled=false;
  DBF.banner('预备', '敲鼓！齐心冲过终点牌楼', 1400);
  DBF.setHint('连续<b>敲鼓</b>（空格/点鼓按钮）冲刺！稳定节奏冲力更大');
}
function endRaceCleanup(){
  RACE.active=false; DBF.controls.enabled=true;
  document.getElementById('race-banner').style.display='none';
}
function onBoatFinish(b){
  if(b.isPlayer && !RACE.playerDone){
    RACE.playerDone=true;
    const rank=computeRank(b);
    const txt= rank===1?'夺魁':(rank+' 名');
    DBF.banner(txt, '用时 '+b.finishTime.toFixed(1)+' 秒 · 点左侧"龙舟竞速"再赛', 4200);
  }
}
function computeRank(boat){
  const order=DBF.boats.slice().sort((a,b)=>{
    const az=a.finished?a.finishTime:1e9-a.group.position.z;
    const bz=b.finished?b.finishTime:1e9-b.group.position.z;
    return az-bz;
  });
  return order.indexOf(boat)+1;
}

function updateRaceHUDAndCamera(t){
  const p=DBF.player;
  document.getElementById('race-rank').innerHTML=computeRank(p)+'<small>当前名次</small>';
  document.getElementById('bar-power').style.width=(p.power*100).toFixed(0)+'%';
  document.getElementById('race-speed').textContent=p.speed.toFixed(1)+' m/s';
  const prog=Math.max(0,Math.min(1,(p.group.position.z-RACE.startZ)/(DBF.FINISH_Z-RACE.startZ)));
  document.getElementById('bar-prog').style.width=(prog*100).toFixed(0)+'%';
  document.getElementById('race-dist').textContent=p.finished?'已撞线':(prog*100).toFixed(0)+'%';
  const cam=DBF.camera, pz=p.group.position.z;
  // 贴近水面、侧后方低角度跟拍，突出竞渡冲劲
  cam.position.lerp(new T.Vector3(p.lane-8.5, 4.8, pz-10.5), Math.min(1,0.07));
  cam.lookAt(p.lane+1.5, 3.0, pz+7);
}

DBF.drumBeat=drumBeat;
})();
