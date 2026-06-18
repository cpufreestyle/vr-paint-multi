/**
 * VR Paint Multiplayer Integration
 * 桥接 multiplayer-client.js 和 A-Painter 画笔系统
 * 依赖: multiplayer-client.js (必须先加载)
 */

;(function() {
'use strict';

// 等待场景和画笔系统就绪
function waitForPaintSystem(callback, retries) {
    retries = retries || 0;
    if (retries > 100) { console.error('[Multiplayer] Paint system not ready after 10s'); return; }
    
    const scene = document.querySelector('a-scene');
    if (!scene || !scene.systems || !scene.systems.brush) {
        return setTimeout(() => waitForPaintSystem(callback, retries + 1), 100);
    }
    callback(scene.systems.brush);
}

// 注册多人事件监听器
function setupEventListeners(brushSystem) {
    const mp = window.vrPaintMultiplayer;
    if (!mp || !mp.enabled) return;
    
    const scene = document.querySelector('a-scene');
    const THREE = window.THREE || AFRAME.THREE;
    
    // ---- 远程笔触渲染 ----
    
    // 同步全量历史
    mp.on('sync', function(strokes) {
        console.log('[Multiplayer] Rendering', strokes.length, 'remote strokes');
        strokes.forEach(function(s) { renderRemoteStroke(brushSystem, s); });
    });
    
    // 单条远程笔触
    mp.on('stroke', function(strokeData) {
        renderRemoteStroke(brushSystem, strokeData);
    });
    
    // 远程笔触增量
    mp.on('strokeDelta', function(strokeID, newPoints) {
        // 查找并追加点
        const existing = brushSystem.strokes.find(function(s) { return s.id && s.id === strokeID; });
        if (existing) {
            newPoints.forEach(function(p) {
                const pos = new THREE.Vector3(p.x || p[0], p.y || p[1], p.z || p[2]);
                const orientation = new THREE.Quaternion();
                const pointerPos = brushSystem.getPointerPosition(pos, orientation);
                existing.addPoint(pos, orientation, pointerPos, p.pressure || 1, p.timestamp || Date.now());
            });
        }
    });
    
    // 远程撤销
    mp.on('undo', function(strokeID) {
        const drawing = document.querySelector('.a-drawing');
        brushSystem.strokes = brushSystem.strokes.filter(function(s) {
            if (s.id === strokeID) {
                s.undo();
                if (drawing) drawing.emit('stroke-removed', {stroke: s});
                return false;
            }
            return true;
        });
    });
    
    // 远程清空
    mp.on('clear', function() {
        brushSystem.clear();
    });
    
    console.log('[Multiplayer] Paint integration ready');

    // ─── WebGPU 粒子系统初始化 ───
    _initWebGPU(brushSystem);
}

// 渲染一条远程笔触
function renderRemoteStroke(brushSystem, strokeData) {
    if (!strokeData || !strokeData.points || strokeData.points.length === 0) return;
    
    const brush = strokeData.brush || {};
    
    // 获取画笔名称 —— 优先使用 name，回退到 index
    let brushName = brush.name || null;
    if (!brushName) {
        const usedBrushes = brushSystem.getUsedBrushes();
        brushName = usedBrushes[brush.index] || 'flat';
    }
    
    // 创建颜色
    const color = new (AFRAME.THREE.Color)().fromArray(brush.color || [1, 0, 0]);
    const size = brush.size || 0.01;
    
    // 创建笔触
    const stroke = brushSystem.addNewStroke(brushName, color, size, 'remote', Date.now());
    stroke.id = strokeData.id; // 保存笔触 ID 用于撤销
    
    // 添加点
    const THREE = AFRAME.THREE;
    for (let i = 0; i < strokeData.points.length; i++) {
        const p = strokeData.points[i];
        const pos = new THREE.Vector3().fromArray(p.position || [0, 0, 0]);
        const orientation = new THREE.Quaternion().fromArray(p.orientation || [0, 0, 0, 1]);
        const pointerPos = brushSystem.getPointerPosition(pos, orientation);
        stroke.addPoint(pos, orientation, pointerPos, p.pressure || 1, p.timestamp || Date.now());
    }

    // ─── WebGPU 粒子效果：远程笔触辉光 ───
    _addStrokeGlow(brushSystem, strokeData, stroke);
}

// ---- 本地笔触捕获 ----
function setupLocalCapture(brushSystem) {
    const mp = window.vrPaintMultiplayer;
    if (!mp || !mp.enabled) return;
    
    const scene = document.querySelector('a-scene');
    const leftHand = document.getElementById('left-hand');
    const rightHand = document.getElementById('right-hand');
    const hands = [leftHand, rightHand].filter(Boolean);
    
    // 当前正在绘制的笔触信息
    let currentStrokeInfo = null;
    let currentStrokeId = null;
    
    // 监听 stroke-started 事件
    scene.addEventListener('stroke-started', function(e) {
        if (!mp.connected) return;
        const stroke = e.detail.stroke;
        if (!stroke) return;
        
        // 跳过远程笔触
        if (stroke.data && stroke.data.owner === 'remote') return;
        
        currentStrokeInfo = {
            id: mp.generateStrokeID(),
            stroke: stroke,
            points: [],
            brushName: '',
            color: [1, 0, 0],
            size: 0.01,
            brushIndex: 0
        };
        currentStrokeId = currentStrokeInfo.id;
        
        // 获取笔刷信息
        const entity = e.detail.entity;
        if (entity) {
            const brushData = entity.getAttribute('brush');
            if (brushData) {
                currentStrokeInfo.brushName = brushData.brush || 'flat';
                const c = new THREE.Color(brushData.color || '#ef2d5e');
                currentStrokeInfo.color = [c.r, c.g, c.b];
                currentStrokeInfo.size = brushData.size || 0.01;
            }
        }
    });
    
    // 监听每一步绘制（通过 brush 组件的 tick）
    // A-Painter 没有 stroke-complete 事件，我们用 paint 事件的 trigger-released 来检测
    hands.forEach(function(hand) {
        if (!hand) return;
        hand.addEventListener('paint', function(e) {
            const value = e.detail.value;
            const wasPainting = currentStrokeInfo !== null && currentStrokeInfo.stroke !== null && currentStrokeInfo.brushName;
            
            if (value > 0.1 && !hand.components.brush.active && currentStrokeInfo) {
                // 新笔触开始 (startNewStroke 会触发 stroke-started)
                // 这里不做额外处理，stroke-started 会处理
            }
            
            // 检测笔触结束
            if (value <= 0.1 && wasPainting && currentStrokeInfo) {
                // 笔触完成，发送到服务器
                if (mp.connected && currentStrokeInfo.points.length > 0) {
                    const strokeData = {
                        id: currentStrokeInfo.id,
                        brushName: currentStrokeInfo.brushName,
                        brushIndex: currentStrokeInfo.brushIndex,
                        color: currentStrokeInfo.color,
                        size: currentStrokeInfo.size,
                        points: currentStrokeInfo.points,
                    };
                    mp.sendStroke(strokeData);
                }
                currentStrokeInfo = null;
                currentStrokeId = null;
            }
        });
    });
    
    // 捕获笔触点（在 stroke-started 之后每帧收集）
    // 通过重写 addPoint 来捕获，更可靠
    const origAddPoint = brushSystem.addNewStroke;
    brushSystem.addNewStroke = function(name, color, size, owner, timestamp) {
        const stroke = origAddPoint.call(this, name, color, size, owner, timestamp);
        
        if (owner === 'local' && currentStrokeInfo) {
            // 保存原始 addPoint 以捕获点
            const origStrokeAddPoint = stroke.addPoint;
            const strokeId = currentStrokeInfo.id;
            
            stroke.addPoint = function(pos, orient, ptrPos, pres, ts) {
                const result = origStrokeAddPoint.call(this, pos, orient, ptrPos, pres, ts);
                
                // 捕获点
                if (currentStrokeInfo && currentStrokeInfo.id === strokeId && mp.connected) {
                    currentStrokeInfo.points.push({
                        position: [pos.x, pos.y, pos.z],
                        orientation: [orient.x, orient.y, orient.z, orient.w],
                        pressure: pres,
                        timestamp: ts
                    });
                }
                return result;
            };
        }
        
        return stroke;
    };
    
    console.log('[Multiplayer] Local capture ready');
}

// 入口
document.addEventListener('DOMContentLoaded', function() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('multi') !== '1') return;
    
    waitForPaintSystem(function(brushSystem) {
        setupEventListeners(brushSystem);
    });
});

// 延迟初始化（等待场景加载）
window.addEventListener('load', function() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('multi') !== '1') return;
    
    waitForPaintSystem(function(brushSystem) {
        setupLocalCapture(brushSystem);
    });
});

console.log('[VR Paint Multiplayer Integration] Loaded');


// ═══════════════════════════════════════════════════════════════
//  WebGPU 集成
// ═══════════════════════════════════════════════════════════════

let _webgpuRenderer = null;
let _webgpuReady = false;

async function _initWebGPU(brushSystem) {
    if (!window.WebGPURenderer) {
        console.warn('[WebGPU] WebGPURenderer 未加载，跳过');
        return;
    }
    
    try {
        _webgpuRenderer = await window.WebGPURenderer.init();
        if (_webgpuRenderer.enabled) {
            _webgpuRenderer.startRenderLoop();
            _webgpuReady = true;
            console.log('[WebGPU] ✅ 粒子系统已连接');
        }
    } catch (err) {
        console.warn('[WebGPU] 初始化失败:', err.message);
    }
}

function _addStrokeGlow(brushSystem, strokeData, stroke) {
    if (!_webgpuReady || !_webgpuRenderer) return;
    
    const brush = strokeData.brush || {};
    let color = '#ffffff';
    if (brush.color) {
        if (Array.isArray(brush.color)) {
            const [r, g, b] = brush.color;
            color = '#' + [r, g, b].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
        } else {
            color = brush.color;
        }
    }
    
    const points = strokeData.points || [];
    if (points.length === 0) return;
    
    const midIdx = Math.floor(points.length / 2);
    const lastPoint = points[points.length - 1];
    const midPoint = points[midIdx];
    
    const spawnPoints = [
        { x: 0.5 + (lastPoint.position?.[0] || 0) * 0.1, y: 0.5 - (lastPoint.position?.[2] || 0) * 0.1 },
        { x: 0.5 + (midPoint.position?.[0] || 0) * 0.1, y: 0.5 - (midPoint.position?.[2] || 0) * 0.1 }
    ];
    
    spawnPoints.forEach(function(sp) {
        _webgpuRenderer.addGlowParticles(
            Math.max(0, Math.min(1, sp.x)),
            Math.max(0, Math.min(1, sp.y)),
            color,
            6,
            1.2
        );
    });
}

window.addEventListener('stroke-complete', function(e) {
    if (!_webgpuReady || !e.detail) return;
    const stroke = e.detail.stroke;
    if (!stroke) return;
    
    const colorComp = stroke.color || new (AFRAME.THREE.Color)('#ffffff');
    const colorStr = '#' + [colorComp.r, colorComp.g, colorComp.b].map(v => 
        Math.round(v * 255).toString(16).padStart(2, '0')
    ).join('');
    
    const pointCount = stroke.points ? stroke.points.length : 0;
    if (pointCount > 10) {
        _webgpuRenderer.addSparkParticles(
            0.5 + Math.random() * 0.2 - 0.1,
            0.5 + Math.random() * 0.2 - 0.1,
            colorStr,
            5
        );
    }
}, false);

})();