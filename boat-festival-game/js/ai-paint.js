/* =========================================================================
   龙舟盛景 · ai-paint.js —— AI 辅助作画
   文字描述 → 3D 涂鸦生成引擎
   支持关键词匹配模式库（离线可用）
   ========================================================================= */
(function(){
"use strict";
const T = window.THREE;
const DBF = window.DBF;

// paint.js 导出
let _paintReady = false;
function getBST(){ return window.PaintInternals; }
function ensurePaint(){ if(!_paintReady && window.PaintInternals){ _paintReady=true; } return _paintReady; }

// ============ 几何工具 ============
function makePoints(xzFunc, n, yOffset){
  // xzFunc(t) => {x,z}   t in 0..1  返回点数组
  const pts=[];
  for(let i=0;i<=n;i++){
    const t=i/n;
    const {x,z}=xzFunc(t);
    pts.push(new T.Vector3(x,yOffset||0,z));
  }
  return pts;
}
function lerp(a,b,t){ return a+(b-a)*t; }
function rand(a,b){ return a+Math.random()*(b-a); }

// ============ 模式库：每个模式包含关键字 + 生成函数 ============
const PATTERNS = [

  // ====== 花 ======
  { keywords:['花','flower','玫瑰','rose','牡丹','莲','lotus','菊','chrysanthemum','梅','plum'],
    gen: function(p){
      const strokes=[]; const n=36, layers=2+Math.floor(rand(0,2));
      for(let l=0;l<layers;l++){
        const r=1.8+l*0.8, yBase=l*0.3+0.5, count=6+l*3;
        for(let i=0;i<count;i++){
          const ang=(i/count)*Math.PI*2+rand(-0.08,0.08);
          const dr=(Math.random()>0.6?0.8:1.2)*(0.8+rand(-0.2,0.2));
          const pts=[];
          for(let j=0;j<=n;j++){
            const t=j/n;
            const tw=Math.sin(t*Math.PI)*dr;
            const x=Math.cos(ang)*r*tw, z=Math.sin(ang)*r*tw;
            pts.push(new T.Vector3(x,yBase+t*0.5+Math.sin(t*Math.PI)*0.3,z));
          }
          const hue=Math.floor(rand(0,COLORS_AI.length)); // uses COLORS_AI
          strokes.push({points:pts,color:COLORS_AI[hue%COLORS_AI.length],size:rand(10,18),brush:'taper'});
        }
        // 花蕊
        const cpts=[];
        for(let j=0;j<=12;j++){
          const t=j/12;
          cpts.push(new T.Vector3(rand(-0.15,0.15),yBase+t*0.3,rand(-0.15,0.15)));
        }
        strokes.push({points:cpts,color:'#ffd76a',size:rand(10,12),brush:'sparkle'});
      }
      // 花茎
      const stem=[];
      for(let i=0;i<=8;i++){
        const t=i/8;
        stem.push(new T.Vector3(Math.sin(t*0.5)*0.05,t*2-1.5+rand(-0.02,0.02),Math.cos(t*0.3)*0.05));
      }
      strokes.push({points:stem,color:'#2faa55',size:rand(8,12),brush:'tube'});
      return strokes;
    }
  },

  // ====== 树 ======
  { keywords:['树','tree','木','wood','松','pine','杉','林','forest','forest','竹','bamboo'],
    gen: function(p){
      const strokes=[]; const h=rand(2,4);
      // 树干
      const trunk=[];
      for(let i=0;i<=10;i++){
        const t=i/10;
        trunk.push(new T.Vector3(Math.sin(t*1.5)*0.06,t*h-h/2,Math.cos(t*1.2)*0.06));
      }
      strokes.push({points:trunk,color:'#5d3a1a',size:rand(10,18),brush:'tube'});
      // 树冠（球簇）
      const canopy=[];
      const cR=h*0.4;
      for(let i=0;i<40+Math.floor(rand(0,20));i++){
        const ang=rand(0,Math.PI*2);
        const r=cR*Math.pow(rand(0.2,1),0.7);
        const x=Math.sin(ang)*r, z=Math.cos(ang)*r;
        const y=h*0.15+Math.sqrt(Math.max(0,cR*cR-r*r))*rand(0.7,1)-cR*0.4;
        canopy.push(new T.Vector3(x,y,z));
      }
      strokes.push({points:canopy,color:['#2faa55','#3cb371','#228b22','#9aff8a'][Math.floor(rand(0,4))],size:rand(14,22),brush:'sparkle'});
      return strokes;
    }
  },

  // ====== 星星 ======
  { keywords:['星','star','星星','辰','繁星'],
    gen: function(p){
      const strokes=[];
      const r=rand(1.2,2.2);
      const points=[];
      for(let i=0;i<=50;i++){
        const t=i/50;
        const ang=t*Math.PI*2;
        const rr=r*(0.5+0.5*Math.sin(5*ang+Math.PI/2));
        const x=Math.sin(ang)*rr, z=Math.cos(ang)*rr;
        points.push(new T.Vector3(x,Math.sin(t*Math.PI)*0.15,z));
      }
      strokes.push({points,color:'#ffd76a',size:rand(8,14),brush:'ribbon'});
      // 闪光
      const sp=[];
      for(let i=0;i<30;i++){
        const ang=rand(0,Math.PI*2);
        const rr=r*rand(0.6,1.1);
        sp.push(new T.Vector3(Math.sin(ang)*rr,rand(-0.2,0.2),Math.cos(ang)*rr));
      }
      strokes.push({points:sp,color:'#fff5d6',size:rand(6,10),brush:'sparkle'});
      return strokes;
    }
  },

  // ====== 心形 ======
  { keywords:['心','heart','爱心','love'],
    gen: function(p){
      const strokes=[];
      const s=rand(1,2);
      const pts=[];
      for(let i=0;i<=60;i++){
        const t=i/60;
        const ang=t*Math.PI*2;
        const x=16*Math.pow(Math.sin(ang),3)*s;
        const z=(13*Math.cos(ang)-5*Math.cos(2*ang)-2*Math.cos(3*ang)-Math.cos(4*ang))*s;
        pts.push(new T.Vector3(x*0.04,z*0.04-0.2,0));
      }
      strokes.push({points:pts,color:'#c41e3a',size:rand(12,18),brush:'tube'});
      // 叠一层发光
      strokes.push({points:pts.map(p=>p.clone().add(new T.Vector3(rand(-0.05,0.05),0,rand(-0.05,0.05)))),color:'#ff4d6d',size:rand(4,8),brush:'sparkle'});
      return strokes;
    }
  },

  // ====== 龙 ======
  { keywords:['龙','dragon','long','辰龙','金龙'],
    gen: function(p){
      const strokes=[];
      const n=60;
      const pts=[];
      for(let i=0;i<=n;i++){
        const t=i/n;
        const x=(t-0.5)*4;
        const z=Math.sin(t*Math.PI*4)*0.6+Math.sin(t*Math.PI*12)*0.1;
        const y=Math.sin(t*Math.PI)*0.8+0.2;
        pts.push(new T.Vector3(x,y,z));
      }
      strokes.push({points:pts,color:'#ffd76a',size:rand(10,16),brush:'tube'});
      // 龙尾须
      const tail=[];
      for(let i=0;i<=20;i++){
        const t=i/20;
        tail.push(new T.Vector3(-2+Math.sin(t*3)*0.3,0.2+Math.sin(t*2)*0.2,Math.sin(t*4)*0.2));
      }
      strokes.push({points:tail,color:'#ff6b35',size:6,brush:'ribbon'});
      // 龙珠
      const orb=[];
      for(let i=0;i<10;i++){
        const ang=rand(0,Math.PI*2);
        orb.push(new T.Vector3(2+Math.cos(ang)*0.15,0.5+Math.sin(ang)*0.15,Math.sin(ang)*0.15));}
      strokes.push({points:orb,color:'#fff5d6',size:rand(10,14),brush:'sparkle'});
      return strokes;
    }
  },

  // ====== 彩虹 ======
  { keywords:['彩虹','rainbow','虹','彩','bridge'],
    gen: function(p){
      const strokes=[];
      const colors=['#c41e3a','#ff6b35','#ffd76a','#2faa55','#5fe0ff','#c77dff'];
      const w=rand(2,3.5);
      for(let ci=0;ci<6;ci++){
        const r=w-ci*0.2, y0=ci*0.08;
        const pts=[];
        for(let i=0;i<=40;i++){
          const t=i/40;
          const ang=(t-0.5)*Math.PI;
          pts.push(new T.Vector3(Math.sin(ang)*r,Math.cos(ang)*r-w*0.3+y0,0));
        }
        strokes.push({points:pts,color:colors[ci],size:rand(6,10),brush:'tube'});
      }
      return strokes;
    }
  },

  // ====== 海浪 ======
  { keywords:['浪','wave','海','sea','水','water','涛'],
    gen: function(p){
      const strokes=[]; const n=60; const w=rand(2,4);
      // 多层波浪
      for(let layer=0;layer<3;layer++){
        const pts=[];
        for(let i=0;i<=n;i++){
          const t=i/n;
          const x=(t-0.5)*w;
          const y=Math.sin(t*Math.PI*4+layer*1.2)*(0.3+layer*0.15)-layer*0.4;
          const z=Math.sin(t*Math.PI*2+layer)*0.1;
          pts.push(new T.Vector3(x,y,z));
        }
        const blues=['#5fe0ff','#2196f3','#0d47a1','#9aff8a'];
        strokes.push({points:pts,color:blues[layer%blues.length],size:rand(8,14)-layer*2,brush:'ribbon'});
      }
      // 浪花
      const sp=[];
      for(let i=0;i<20;i++){
        const t=rand(0,1);
        sp.push(new T.Vector3((t-0.5)*w,Math.sin(t*Math.PI*4)*0.4,rand(-0.2,0.2)));
      }
      strokes.push({points:sp,color:'#ffffff',size:rand(4,8),brush:'sparkle'});
      return strokes;
    }
  },

  // ====== 山 ======
  { keywords:['山','mountain','hill','峰','峦','岳','青'],
    gen: function(p){
      const strokes=[]; const n=40; const w=rand(2.5,4);
      // 远山
      for(let layer=0;layer<3;layer++){
        const pts=[];
        for(let i=0;i<=n;i++){
          const t=i/n;
          const x=(t-0.5)*w;
          const y=Math.sin(layer*1.8+Math.sin(t*Math.PI*3)*1.2+Math.sin(t*Math.PI*7)*0.4)*(0.5+layer*0.1)-layer*0.3;
          const z=layer*0.3;
          pts.push(new T.Vector3(x,y,z));
        }
        const greens=['#2faa55','#228b22','#006400'];
        strokes.push({points:pts,color:greens[layer%greens.length],size:rand(10,16)-layer*3,brush:'ribbon'});
      }
      return strokes;
    }
  },

  // ====== 云 ======
  { keywords:['云','cloud','clouds','白云','彩云'],
    gen: function(p){
      const strokes=[];
      const cx=0, cy=0.5, r=rand(1,2);
      const pts=[];
      const clusters=[[0,0,1],[0.5,0.2,0.8],[-0.4,0.1,0.7],[0.2,-0.2,0.9],[-0.2,0.25,0.6]];
      for(const [dx,dy,scale] of clusters){
        const cr=r*scale;
        for(let i=0;i<20;i++){
          const ang=rand(0,Math.PI*2);
          const rr=cr*Math.sqrt(rand(0,1));
          pts.push(new T.Vector3(cx+dx+Math.cos(ang)*rr,cy+dy+Math.sin(ang)*rr,rand(-0.3,0.3)));
        }
      }
      strokes.push({points:pts,color:'#ffffff',size:rand(10,16),brush:'sparkle'});
      // 云的柔光
      const soft=[];
      for(let i=0;i<20;i++){
        soft.push(new T.Vector3(cx+rand(-r*0.8,r*0.8),cy+rand(-0.3,0.3),rand(-0.1,0.1)));
      }
      strokes.push({points:soft,color:'#e8f4ff',size:rand(16,24),brush:'sparkle'});
      return strokes;
    }
  },

  // ====== 太阳 ======
  { keywords:['太阳','sun','日','阳','光'],
    gen: function(p){
      const strokes=[]; const r=rand(1,2);
      // 光圈
      const cpts=[];
      for(let i=0;i<=40;i++){
        const t=i/40;
        const ang=t*Math.PI*2;
        cpts.push(new T.Vector3(Math.cos(ang)*r,0,Math.sin(ang)*r));
      }
      strokes.push({points:cpts,color:'#ffd76a',size:rand(10,14),brush:'tube'});
      // 光芒
      const rays=[];
      for(let i=0;i<16;i++){
        const ang=(i/16)*Math.PI*2;
        const rr=r*rand(1.2,1.8);
        rays.push(new T.Vector3(Math.cos(ang)*rr,rand(-0.05,0.05),Math.sin(ang)*rr));
      }
      strokes.push({points:rays,color:'#ff6b35',size:rand(6,10),brush:'ribbon'});
      // 高发光
      const glow=[];
      for(let i=0;i<30;i++){
        const ang=rand(0,Math.PI*2);
        const rr=r*rand(0.3,0.9);
        glow.push(new T.Vector3(Math.cos(ang)*rr,rand(-0.1,0.1),Math.sin(ang)*rr));
      }
      strokes.push({points:glow,color:'#fff5d6',size:rand(8,14),brush:'sparkle'});
      return strokes;
    }
  },

  // ====== 月亮 ======
  { keywords:['月','moon','月亮','月光','夕'],
    gen: function(p){
      const strokes=[]; const r=rand(1,1.8);
      // 月亮弧（不是满月，是半月/弯月）
      const pts=[];
      for(let i=0;i<=40;i++){
        const t=i/40;
        const ang=t*Math.PI*2;
        const inner=0.6+0.4*Math.sin(ang);
        const x=Math.cos(ang)*r*inner, z=Math.sin(ang)*r;
        pts.push(new T.Vector3(x,Math.sin(t*Math.PI)*0.08,z));
      }
      strokes.push({points:pts,color:'#f0e68c',size:rand(8,12),brush:'ribbon'});
      // 月光
      const glow=[];
      for(let i=0;i<20;i++){
        const ang=rand(0,Math.PI*2);
        const rr=r*rand(0.5,1.2);
        glow.push(new T.Vector3(Math.cos(ang)*rr,rand(-0.15,0.15),Math.sin(ang)*rr));
      }
      strokes.push({points:glow,color:'#fff8dc',size:rand(6,10),brush:'sparkle'});
      return strokes;
    }
  },

  // ====== 烟花 ======
  { keywords:['烟花','firework','焰火','炮','fireworks','花火'],
    gen: function(p){
      const strokes=[]; const n=24;
      for(let burst=0;burst<3;burst++){
        const r=rand(0.8,2);
        const cx=rand(-1,1), cy=rand(0,1.5), cz=rand(-1,1);
        const colors=['#c41e3a','#ffd76a','#5fe0ff','#ff6b35','#c77dff','#9aff8a'];
        const c=colors[Math.floor(rand(0,colors.length))];
        for(let i=0;i<n;i++){
          const ang=(i/n)*Math.PI*2;
          const rr=r*rand(0.5,1);
          const pts=[];
          for(let j=0;j<=4;j++){
            const t=j/4;
            const x=cx+Math.cos(ang)*rr*t, z=cz+Math.sin(ang)*rr*t;
            pts.push(new T.Vector3(x,cy+t*rand(0.2,0.6)-rr*t*0.2,z));
          }
          strokes.push({points:pts,color:c,size:rand(4,8),brush:'ribbon'});
        }
        // 爆炸星点
        const sp=[];
        for(let i=0;i<40;i++){
          const ang=rand(0,Math.PI*2);
          const rr=r*rand(0.3,0.9);
          sp.push(new T.Vector3(cx+Math.cos(ang)*rr,cy+rand(-0.3,0.3),cz+Math.sin(ang)*rr));
        }
        strokes.push({points:sp,color:'#fff',size:rand(3,6),brush:'sparkle'});
      }
      return strokes;
    }
  },

  // ====== 鱼 ======
  { keywords:['鱼','fish','锦鲤','金鱼','鲤'],
    gen: function(p){
      const strokes=[]; const s=rand(0.8,1.5);
      // 鱼身
      const body=[];
      for(let i=0;i<=30;i++){
        const t=i/30;
        const x=(t-0.5)*2*s;
        const y=Math.sin(t*Math.PI*2)*0.12*s;
        body.push(new T.Vector3(x,Math.sin(t*Math.PI)*0.1*s,y));
      }
      strokes.push({points:body,color:['#ff6b35','#ffd76a','#c41e3a','gold'][Math.floor(rand(0,4))],size:rand(10,14),brush:'tube'});
      // 尾鳍
      const tail=[];
      for(let i=0;i<=15;i++){
        const t=i/15;
        tail.push(new T.Vector3(-s*1.2+Math.sin(t*3)*0.3*s,Math.sin(t)*0.05*s,t*0.3*s));
      }
      strokes.push({points:tail,color:'#ff6b35',size:6,brush:'ribbon'});
      // 眼睛
      const eye=[];
      eye.push(new T.Vector3(s*0.6,0.1*s,0.1*s));
      strokes.push({points:eye,color:'#000',size:4,brush:'sparkle'});
      return strokes;
    }
  },

  // ====== 鸟 ======
  { keywords:['鸟','bird','鹰','eagle','飞鸟','鹤','crane'],
    gen: function(p){
      const strokes=[]; const w=rand(2,3.5);
      // 展翅：左翼 + 右翼 + 身体
      const wingL=[];
      for(let i=0;i<=20;i++){
        const t=i/20;
        wingL.push(new T.Vector3(-t*w,Math.sin(t*Math.PI)*0.2+Math.sin(t*Math.PI*2)*0.1,0));
      }
      strokes.push({points:wingL,color:'#5d3a1a',size:rand(6,10),brush:'ribbon'});
      const wingR=[];
      for(let i=0;i<=20;i++){
        const t=i/20;
        wingR.push(new T.Vector3(t*w,Math.sin(t*Math.PI)*0.2+Math.sin(t*Math.PI*2)*0.1,0));
      }
      strokes.push({points:wingR,color:'#5d3a1a',size:rand(6,10),brush:'ribbon'});
      // 身体
      const body=[];
      for(let i=0;i<=15;i++){
        const t=i/15;
        body.push(new T.Vector3(0,Math.sin(t*Math.PI)*0.1,t*0.5-0.25));
      }
      strokes.push({points:body,color:'#3a2510',size:rand(6,8),brush:'tube'});
      return strokes;
    }
  },

  // ====== 桥 ======
  { keywords:['桥','bridge','拱桥','廊桥'],
    gen: function(p){
      const strokes=[]; const w=rand(2,3.5), h=rand(1,2);
      // 拱形
      const arc=[];
      for(let i=0;i<=30;i++){
        const t=i/30;
        const x=(t-0.5)*w;
        const y=Math.sin(t*Math.PI)*h+0.2;
        arc.push(new T.Vector3(x,y,0));
      }
      strokes.push({points:arc,color:'#8b4513',size:rand(10,16),brush:'tube'});
      // 桥面
      const deck=[];
      for(let i=0;i<=30;i++){
        const t=i/30;
        const x=(t-0.5)*w;
        deck.push(new T.Vector3(x,-0.1,rand(-0.06,0.06)));
      }
      strokes.push({points:deck,color:'#a0522d',size:rand(8,12),brush:'ribbon'});
      // 桥柱
      for(let side of [-1,1]){
        for(let j=0;j<3;j++){
          const x=side*(w*0.4+j*0.15);
          const pillar=[];
          for(let i=0;i<=8;i++){
            const t=i/8;
            pillar.push(new T.Vector3(x+rand(-0.03,0.03),t*h+0.2,rand(-0.03,0.03)));
          }
          strokes.push({points:pillar,color:'#8b4513',size:6,brush:'tube'});
        }
      }
      return strokes;
    }
  },

  // ====== 灯笼 ======
  { keywords:['灯笼','lantern','灯','花灯'],
    gen: function(p){
      const strokes=[]; const r=rand(0.5,0.8);
      // 灯笼体
      const body=[];
      for(let i=0;i<=30;i++){
        const t=i/30;
        const ang=t*Math.PI*2;
        const rr=r*(0.85+0.15*Math.sin(2*t*Math.PI));
        body.push(new T.Vector3(Math.cos(ang)*rr,Math.sin(ang)*rr*0.7+1,0));
      }
      strokes.push({points:body,color:'#c41e3a',size:rand(8,14),brush:'tube'});
      // 穗子
      const tassel=[];
      for(let i=0;i<=10;i++){
        const t=i/10;
        tassel.push(new T.Vector3(Math.sin(t*3)*0.1,1-r*0.7-t*0.3,Math.cos(t*3)*0.1));
      }
      strokes.push({points:tassel,color:'#ffd76a',size:4,brush:'ribbon'});
      // 发光
      const glow=[];
      for(let i=0;i<15;i++){
        const ang=rand(0,Math.PI*2);
        const rr=r*rand(0.3,0.8);
        glow.push(new T.Vector3(Math.cos(ang)*rr,1+Math.sin(ang)*rr*0.7,rand(-0.1,0.1)));
      }
      strokes.push({points:glow,color:'#ffd76a',size:rand(6,10),brush:'sparkle'});
      return strokes;
    }
  },

];

// ============ 随机颜色（用于无匹配时的抽象生成）============
const COLORS_AI = ['#ffd76a','#c41e3a','#ff6b35','#5fe0ff','#9aff8a','#c77dff','#ffffff','#ff4d6d','#ffa726','#ab47bc','#26c6da','#66bb6a'];

// ============ 抽象生成（兜底：任何文本都能出图）============
function genAbstract(prompt){
  // 用 prompt 生成种子
  let seed = 0;
  for(let i=0;i<prompt.length;i++) seed = (seed*31 + prompt.charCodeAt(i)) & 0xFFFFFF;
  const rand2 = (max)=> ((seed=(seed*1103515245+12345)&0x7FFFFFFF)%max);
  const strokes=[];
  const count = 3 + rand2(3);
  for(let c=0;c<count;c++){
    const pts=[];
    const n=20+rand2(20);
    const r=1+rand2(30)/20;
    const color=COLORS_AI[rand2(COLORS_AI.length)];
    for(let i=0;i<=n;i++){
      const t=i/n;
      const ang=t*Math.PI*2+rand2(100)/50;
      const rr=r*(0.3+0.7*(0.5+0.5*Math.sin((c+1)*t*Math.PI*3)));
      const x=Math.cos(ang)*rr+rand2(100)/50-1;
      const y=Math.sin(ang*t*0.5)*rr*0.5+rand2(100)/50;
      const z=Math.sin(ang*0.7)*rr*0.3+rand2(100)/50-0.5;
      pts.push(new T.Vector3(x,y,z));
    }
    strokes.push({points:pts,color,size:8+rand2(12),brush:['tube','ribbon','taper'][rand2(3)]});
  }
  return strokes;
}

// ============ 关键词匹配引擎 ============
function bestPattern(prompt){
  const lower = prompt.toLowerCase();
  let best = null, bestScore = 0;
  for(const p of PATTERNS){
    let score = 0;
    for(const kw of p.keywords){
      if(kw.length===0) continue;
      // 长关键词命中加分更多
      if(lower.includes(kw)){
        score += kw.length * 3;
      }
    }
    if(score > bestScore){ bestScore = score; best = p; }
  }
  return {pattern:best, score:bestScore};
}

// ============ AI 生成入口 ============
function aiGenerate(prompt, count){
  count = count || 1;
  const result = bestPattern(prompt);
  const allStrokes = [];
  // 如果匹配度高，用匹配的模式生成
  if(result.score >= 3 && result.pattern){
    for(let i=0;i<count;i++){
      const strokes = result.pattern.gen(prompt);
      // 加入一些位置偏移使每次生成不同
      const offX = (i-(count-1)/2)*rand2_drift(count);
      allStrokes.push(...offsetStrokes(strokes, offX));
    }
  } else {
    // 无匹配 → 抽象生成
    for(let i=0;i<count;i++){
      allStrokes.push(...offsetStrokes(genAbstract(prompt), (i-(count-1)/2)*rand2_drift(count)));
    }
  }
  return allStrokes;
}
function rand2_drift(max){ return (Math.random()*2-1)*0.6; }
function offsetStrokes(strokes, x){
  return strokes.map(s=>({...s, points:s.points.map(p=>p.clone().add(new T.Vector3(x,0,0)))}));
}

// ============ AI 绘制 ============
function aiDraw(strokes){
  const drawn=[];
  for(const s of strokes){
    if(s.points.length<2) continue;
    const item = getBST().buildBrush(s.brush||'tube', s.points, s.color||'#ffd76a', s.size||15);
    if(item) drawn.push(item);
  }
  // 存入 items（可撤销）
  if(drawn.length){
    getBST().items.push({dispose:()=> drawn.forEach(it=>it.dispose())});
    DBF.setHint('AI 绘制了 <b>'+drawn.length+'</b> 条笔触 · Ctrl+Z 可撤销');
  } else {
    DBF.setHint('AI 生成失败，换个描述试试');
  }
  return drawn;
}

// ============ AI 面板 ============
let aiPanel = null;
function showAIPanel(){
  if(aiPanel){ aiPanel.style.display='block'; aiPanel.querySelector('textarea').focus(); return; }
  const d = document.createElement('div');
  d.id = 'ai-panel';
  d.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
      <div style="font-weight:700;font-size:14px;display:flex;align-items:center;gap:6px;">
        <span style="font-size:18px;">✨</span> AI 涂鸦助手
      </div>
      <div id="ai-close" style="cursor:pointer;color:#8fa0c8;font-size:18px;line-height:1;padding:0 4px;">×</div>
    </div>
    <textarea id="ai-input" placeholder="描述你想画的内容…&#10;例如：荷花、红色金龙、彩虹桥、端午赛龙舟…" style="
      width:100%;height:70px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,215,106,.25);
      border-radius:10px;color:#e9eefb;font-size:13px;padding:10px;resize:none;outline:none;
      font-family:inherit;line-height:1.5;
    "></textarea>
    <div style="display:flex;gap:8px;margin-top:8px;">
      <div id="ai-gen" style="flex:1;text-align:center;padding:9px 14px;border-radius:10px;
        background:linear-gradient(135deg,rgba(196,30,58,.6),rgba(224,168,46,.5));
        border:1px solid var(--gold);color:#fff;cursor:pointer;font-size:13px;font-weight:600;
        transition:all .2s;">
        涂鸦生成 →
      </div>
      <div style="display:flex;gap:6px;">
        <div class="ai-count-btn" data-count="1" style="padding:8px 12px;border-radius:10px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,215,106,.2);color:#cdd7f0;cursor:pointer;font-size:12px;">×1</div>
        <div class="ai-count-btn" data-count="3" style="padding:8px 12px;border-radius:10px;background:rgba(255,215,106,.16);border:1px solid var(--gold);color:#fff;cursor:pointer;font-size:12px;">×3</div>
        <div class="ai-count-btn" data-count="5" style="padding:8px 12px;border-radius:10px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,215,106,.2);color:#cdd7f0;cursor:pointer;font-size:12px;">×5</div>
      </div>
    </div>
    <div id="ai-hint" style="margin-top:8px;font-size:11px;color:#6b7aa0;line-height:1.4;">
      内置 15+ 种图案：🪷花 / 🌲树 / ⭐星 / ❤心 / 🐉龙 / 🌈彩虹 / 🌊浪 / 🏔山 / ☁云 / ☀太阳 / 🌙月 / 🎆烟花 / 🐟鱼 / 🐦鸟 / 🏮灯笼 …
    </div>
    <div id="ai-status" style="margin-top:6px;font-size:12px;color:#5fe0ff;display:none;"></div>
  `;
  d.style.cssText = 'position:fixed;bottom:130px;right:18px;z-index:25;width:320px;'+
    'background:rgba(10,14,31,.92);border:1px solid rgba(255,215,106,.2);border-radius:14px;'+
    'padding:16px;backdrop-filter:blur(10px);color:#e9eefb;font-size:13px;box-shadow:0 8px 32px rgba(0,0,0,.5);';
  document.body.appendChild(d);
  aiPanel = d;
  d.querySelector('#ai-input').focus();

  let curCount = 3;
  d.querySelectorAll('.ai-count-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      curCount = +btn.dataset.count;
      d.querySelectorAll('.ai-count-btn').forEach(b=>{b.style.background='rgba(255,255,255,0.06)';b.style.borderColor='rgba(255,215,106,.2)';b.style.color='#cdd7f0';});
      btn.style.background='rgba(255,215,106,.16)';btn.style.borderColor='var(--gold)';btn.style.color='#fff';
    });
  });

  d.querySelector('#ai-gen').addEventListener('click', ()=>{
    const prompt = d.querySelector('#ai-input').value.trim();
    if(!prompt){ DBF.setHint('请输入描述文字'); return; }
    const status = d.querySelector('#ai-status');
    status.style.display='block'; status.textContent='🤔 思考中…';
    setTimeout(()=>{
      const strokes = aiGenerate(prompt, curCount);
      aiDraw(strokes);
      status.textContent='✅ 已生成 '+strokes.length+' 条涂鸦';
      setTimeout(()=>{ status.style.display='none'; }, 2000);
    }, 100);
  });

  d.querySelector('#ai-close').addEventListener('click', ()=>{ d.style.display='none'; });
  // 回车提交
  d.querySelector('#ai-input').addEventListener('keydown', e=>{
    if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); d.querySelector('#ai-gen').click(); }
  });
}
function hideAIPanel(){
  if(aiPanel) aiPanel.style.display='none';
}

// ============ 导出 ============
window.AIPaint = {
  generate: aiGenerate,
  draw: aiDraw,
  showPanel: showAIPanel,
  hidePanel: hideAIPanel,
};

})();
