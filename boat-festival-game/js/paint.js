/* =========================================================================
   龙舟盛景 · paint.js —— 空间绘画
   6 种笔触：圆管 / 绸带 / 毛笔(渐尖) / 星光 / 下雨 / 下雪
   粗细 1~40，多色调色板，撤销 / 清空。
   ========================================================================= */
(function(){
"use strict";
const DBF = window.DBF;
const T = window.THREE;

const COLORS = ['#ffd76a','#c41e3a','#ff6b35','#5fe0ff','#9aff8a','#c77dff','#ffffff','#2faa55','#2f6bd0','#ff4d6d'];

let curColor = '#ffd76a';
let curSize  = 10;     // 1~40
let curBrush = 'tube';
let drawing  = false;
let cur = null;        // {points, preview}
const items = [];      // 历史，每项 {dispose}
const emitters = [];   // 雨/雪发射器，每帧更新
let paintGroup = null;

// ---------- UI ----------
function buildPalette(){
  const pal = document.getElementById('palette');
  COLORS.forEach((c,i)=>{
    const s=document.createElement('div');
    s.className='swatch'+(i===0?' on':'');
    s.style.background=c; s.style.color=c;
    s.addEventListener('click', ()=>{
      curColor=c;
      document.querySelectorAll('.swatch').forEach(x=>x.classList.remove('on'));
      s.classList.add('on');
    });
    pal.appendChild(s);
  });
}
function buildBrushBar(){
  document.querySelectorAll('.brush-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      curBrush = btn.dataset.brush;
      document.querySelectorAll('.brush-btn').forEach(x=>x.classList.remove('on'));
      btn.classList.add('on');
      const tip={tube:'圆润发光的线条',ribbon:'飘逸的扁平绸带',taper:'起粗收尖的毛笔锋',
                 sparkle:'沿途撒落的星光',rain:'框出一片区域，落下雨丝',snow:'框出一片区域，飘落雪花'}[curBrush];
      DBF.setHint('当前笔触：<b>'+btn.textContent.trim()+'</b> · '+tip);
    });
  });
}

// ---------- 工具 ----------
function screenToWorld(clientX, clientY){
  const rect = DBF.renderer.domElement.getBoundingClientRect();
  DBF.pointer.x = ((clientX-rect.left)/rect.width)*2 - 1;
  DBF.pointer.y = -((clientY-rect.top)/rect.height)*2 + 1;
  DBF.raycaster.setFromCamera(DBF.pointer, DBF.camera);
  const dist = DBF.camera.position.distanceTo(DBF.controls.target);
  return DBF.raycaster.ray.at(dist, new T.Vector3());
}
function glowMat(color, emi){
  const c=new T.Color(color);
  return new T.MeshStandardMaterial({color:c, emissive:c, emissiveIntensity:emi==null?0.85:emi, roughness:0.4, metalness:0.1});
}
function disposeObj(o){
  paintGroup.remove(o);
  o.traverse&&o.traverse(n=>{ if(n.geometry)n.geometry.dispose(); if(n.material)n.material.dispose&&n.material.dispose(); });
  if(o.geometry)o.geometry.dispose();
}

// ---------- 圆管 ----------
function buildTube(points,color,size){
  if(points.length<2) return null;
  const curve=new T.CatmullRomCurve3(points);
  const geo=new T.TubeGeometry(curve, Math.max(4,points.length*4), size/200, 8, false);
  const m=new T.Mesh(geo, glowMat(color)); paintGroup.add(m); return m;
}
// ---------- 绸带（沿路径的水平扁平带） ----------
function buildRibbon(points,color,size){
  if(points.length<2) return null;
  const curve=new T.CatmullRomCurve3(points);
  const N=Math.max(8,points.length*5);
  const pts=curve.getPoints(N);
  const half=(size/55)/2, up=new T.Vector3(0,1,0);
  const verts=[], idx=[];
  for(let i=0;i<pts.length;i++){
    const a=pts[Math.max(0,i-1)], b=pts[Math.min(pts.length-1,i+1)];
    const tan=new T.Vector3().subVectors(b,a).normalize();
    let side=new T.Vector3().crossVectors(tan,up);
    if(side.lengthSq()<1e-4) side.set(1,0,0); else side.normalize();
    const l=new T.Vector3().copy(pts[i]).addScaledVector(side, half);
    const r=new T.Vector3().copy(pts[i]).addScaledVector(side,-half);
    verts.push(l.x,l.y,l.z, r.x,r.y,r.z);
  }
  for(let i=0;i<pts.length-1;i++){
    const a=i*2;
    idx.push(a,a+1,a+2, a+1,a+3,a+2);
  }
  const geo=new T.BufferGeometry();
  geo.setAttribute('position', new T.Float32BufferAttribute(verts,3));
  geo.setIndex(idx); geo.computeVertexNormals();
  const mat=glowMat(color,0.7); mat.side=T.DoubleSide;
  const m=new T.Mesh(geo,mat); paintGroup.add(m); return m;
}
// ---------- 毛笔（起粗收尖的球串） ----------
function buildTaper(points,color,size){
  if(points.length<2) return null;
  const curve=new T.CatmullRomCurve3(points);
  const N=Math.min(160, Math.max(10, points.length*6));
  const pts=curve.getPoints(N);
  const g=new T.Group();
  const mat=glowMat(color,0.8);
  const base=size/150;
  for(let i=0;i<pts.length;i++){
    const t=i/(pts.length-1);
    const r=base*(1-t)*(1-t)+0.008;        // 起笔粗、收笔尖
    const s=new T.Mesh(new T.SphereGeometry(r,7,6), mat);
    s.position.copy(pts[i]); g.add(s);
  }
  paintGroup.add(g); return g;
}
// ---------- 星光（沿路径撒发光星） ----------
function buildSparkle(points,color,size){
  const g=new T.Group();
  const mat=glowMat(color,1.1);
  const curve = points.length>1 ? new T.CatmullRomCurve3(points) : null;
  const pts = curve ? curve.getPoints(Math.max(6,points.length*3)) : points;
  pts.forEach((p,i)=>{
    if(i%2) return;
    const r=(size/55)*(0.5+Math.random());
    const star=new T.Mesh(new T.OctahedronGeometry(r,0), mat);
    star.position.set(p.x+(Math.random()-0.5)*0.6, p.y+(Math.random()-0.5)*0.6, p.z+(Math.random()-0.5)*0.6);
    star.rotation.set(Math.random()*3,Math.random()*3,Math.random()*3);
    g.add(star);
  });
  paintGroup.add(g); return g;
}

// ---------- 雨 / 雪发射器（框定区域，持续降落） ----------
function bbox(points){
  const b={minX:1e9,maxX:-1e9,minY:1e9,maxY:-1e9,minZ:1e9,maxZ:-1e9};
  points.forEach(p=>{ b.minX=Math.min(b.minX,p.x);b.maxX=Math.max(b.maxX,p.x);
    b.minY=Math.min(b.minY,p.y);b.maxY=Math.max(b.maxY,p.y);
    b.minZ=Math.min(b.minZ,p.z);b.maxZ=Math.max(b.maxZ,p.z);});
  // 给单点/极小范围一个最小尺度
  if(b.maxX-b.minX<3){const c=(b.minX+b.maxX)/2;b.minX=c-4;b.maxX=c+4;}
  if(b.maxZ-b.minZ<3){const c=(b.minZ+b.maxZ)/2;b.minZ=c-4;b.maxZ=c+4;}
  return b;
}
function buildRain(points,color,size){
  const b=bbox(points);
  const top=b.maxY+6, bottom=Math.max(0.4, b.minY-4);
  const N=Math.round(60+size*4);
  const seg=new Float32Array(N*2*3);
  const yv=new Float32Array(N);            // 每滴当前顶端 y
  const xs=new Float32Array(N), zs=new Float32Array(N);
  const len=0.7+size*0.02;
  for(let i=0;i<N;i++){
    xs[i]=b.minX+Math.random()*(b.maxX-b.minX);
    zs[i]=b.minZ+Math.random()*(b.maxZ-b.minZ);
    yv[i]=bottom+Math.random()*(top-bottom);
  }
  const geo=new T.BufferGeometry();
  geo.setAttribute('position', new T.BufferAttribute(seg,3));
  const mat=new T.LineBasicMaterial({color:new T.Color(color).lerp(new T.Color(0xbfe8ff),0.5), transparent:true, opacity:0.6});
  const lines=new T.LineSegments(geo,mat); paintGroup.add(lines);
  const obj={group:lines, dispose:()=>disposeObj(lines)};
  const speed=22+size*0.5;
  obj.update=(dt)=>{
    for(let i=0;i<N;i++){
      yv[i]-=speed*dt;
      if(yv[i]<bottom) yv[i]=top;
      const o=i*6;
      seg[o]=xs[i];   seg[o+1]=yv[i];     seg[o+2]=zs[i];
      seg[o+3]=xs[i]; seg[o+4]=yv[i]-len; seg[o+5]=zs[i];
    }
    geo.attributes.position.needsUpdate=true;
  };
  emitters.push(obj); return obj;
}
function buildSnow(points,color,size){
  const b=bbox(points);
  const top=b.maxY+6, bottom=Math.max(0.4, b.minY-4);
  const N=Math.round(80+size*6);
  const pos=new Float32Array(N*3);
  const ph=new Float32Array(N);
  for(let i=0;i<N;i++){
    pos[i*3]=b.minX+Math.random()*(b.maxX-b.minX);
    pos[i*3+1]=bottom+Math.random()*(top-bottom);
    pos[i*3+2]=b.minZ+Math.random()*(b.maxZ-b.minZ);
    ph[i]=Math.random()*6.28;
  }
  const geo=new T.BufferGeometry();
  geo.setAttribute('position', new T.BufferAttribute(pos,3));
  const mat=new T.PointsMaterial({color:new T.Color(color).lerp(new T.Color(0xffffff),0.6),
    size:0.12+size*0.012, transparent:true, opacity:0.92, depthWrite:false});
  const pts=new T.Points(geo,mat); paintGroup.add(pts);
  const obj={group:pts, dispose:()=>disposeObj(pts)};
  const speed=2.2+size*0.05;
  obj.update=(dt,t)=>{
    for(let i=0;i<N;i++){
      pos[i*3+1]-=speed*dt;
      pos[i*3]+=Math.sin(t*1.5+ph[i])*0.012;        // 横向飘摆
      if(pos[i*3+1]<bottom) pos[i*3+1]=top;
    }
    geo.attributes.position.needsUpdate=true;
  };
  emitters.push(obj); return obj;
}

// ---------- 构建分发 ----------
function buildBrush(brush, points, color, size){
  switch(brush){
    case 'tube':    return {dispose:wrap(buildTube(points,color,size))};
    case 'ribbon':  return {dispose:wrap(buildRibbon(points,color,size))};
    case 'taper':   return {dispose:wrap(buildTaper(points,color,size))};
    case 'sparkle': return {dispose:wrap(buildSparkle(points,color,size))};
    case 'rain':    return rainItem(buildRain(points,color,size));
    case 'snow':    return rainItem(buildSnow(points,color,size));
  }
}
function wrap(mesh){ return ()=>{ if(mesh) disposeObj(mesh); }; }
function rainItem(emitter){
  return {dispose:()=>{
    if(!emitter) return;
    const k=emitters.indexOf(emitter); if(k>=0) emitters.splice(k,1);
    emitter.dispose();
  }};
}

// ---------- 交互 ----------
function onDown(e){
  if(DBF.state.mode!=='paint' || e.button!==0) return;
  drawing=true;
  cur={points:[screenToWorld(e.clientX,e.clientY)], preview:null};
}
function onMove(e){
  if(!drawing||!cur) return;
  const p=screenToWorld(e.clientX,e.clientY);
  if(p.distanceTo(cur.points[cur.points.length-1])>0.22){
    cur.points.push(p);
    // 路径类笔触：实时预览（圆管）
    if(curBrush==='tube'||curBrush==='ribbon'||curBrush==='taper'||curBrush==='sparkle'){
      if(cur.preview) disposeObj(cur.preview);
      cur.preview=buildTube(cur.points, curColor, Math.min(curSize,16));
    }
  }
}
function onUp(){
  if(!drawing) return;
  drawing=false;
  if(cur){
    if(cur.preview) disposeObj(cur.preview);
    const item=buildBrush(curBrush, cur.points, curColor, curSize);
    if(item) items.push(item);
  }
  cur=null;
}

// ---------- 入口 ----------
DBF.initPaint = function(){
  paintGroup = new T.Group();
  DBF.scene.add(paintGroup);
  buildPalette();
  buildBrushBar();

  const cv = DBF.renderer.domElement;
  cv.addEventListener('pointerdown', onDown);
  cv.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);

  const sizeEl=document.getElementById('paint-size');
  const sizeVal=document.getElementById('paint-size-val');
  if(sizeEl) sizeEl.addEventListener('input', e=>{ curSize=+e.target.value; if(sizeVal) sizeVal.textContent=curSize; });

  document.getElementById('paint-undo').addEventListener('click', ()=>{
    const it=items.pop(); if(it) it.dispose();
  });
  document.getElementById('paint-clear').addEventListener('click', ()=>{
    while(items.length) items.pop().dispose();
  });

  // 雨/雪发射器逐帧更新
  DBF.registerTick((dt,t)=>{ for(let i=0;i<emitters.length;i++) emitters[i].update(dt,t); });

  // 鼠标按键映射：paint 时左键绘画、右键转视角
  DBF.on('mode', ({mode})=>{
    if(mode==='paint'){
      DBF.controls.mouseButtons = { LEFT:-1, MIDDLE:T.MOUSE.DOLLY, RIGHT:T.MOUSE.ROTATE };
    } else {
      DBF.controls.mouseButtons = { LEFT:T.MOUSE.ROTATE, MIDDLE:T.MOUSE.DOLLY, RIGHT:T.MOUSE.PAN };
    }
  });
};

})();
