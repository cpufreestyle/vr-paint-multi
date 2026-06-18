/**
 * VR Paint Multiplayer Client v2
 * 支持差分压缩 + 版本向量冲突检测
 * 
 * 使用方式:
 * 1. 引入此脚本
 * 2. 在 URL 中添加 ?multi=1&room=房间号&name=你的名字
 * 3. 笔触会自动同步到房间内的所有人
 */
;(function() {
'use strict';

class VRPaintMultiplayer {
    constructor() {
        this.ws = null;
        this.roomID = this.getUrlParam('room') || 'default';
        this.playerName = this.getUrlParam('name') || 'Player';
        this.clientID = localStorage.getItem('vrpaint_client_id') || 'client_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('vrpaint_client_id', this.clientID);
        
        this.enabled = this.getUrlParam('multi') === '1';
        this.players = [];
        this.strokes = [];         // 房间内的所有笔触
        this.pendingStrokes = {};   // 待确认的笔触
        this.serverClock = {};     // 服务端版本向量
        this.clientClock = {};     // 客户端版本向量
        this.connected = false;
        this.pendingDelta = {};     // 差分缓冲
        
        // 配置
        this.config = {
            deltaInterval: 100,      // 差分发送间隔 (ms)
            deltaThreshold: 5,        // 积累多少点后触发发送
            heartbeatInterval: 30000, // 心跳间隔 (ms)
            reconnectDelay: 3000,    // 重连延迟 (ms)
            maxStrokes: 1000,        // 内存中保留的最大笔触数
        };
        
        // 定时器
        this.deltaTimer = null;
        this.heartbeatTimer = null;
        
        // 回调
        this.callbacks = {
            onConnect: null,
            onDisconnect: null,
            onPlayerJoin: null,
            onPlayerLeave: null,
            onStroke: null,
            onStrokeDelta: null,
            onUndo: null,
            onClear: null,
            onCursor: null,
            onSync: null,
        };
        
        // 缓冲当前笔触的增量
        this.currentDelta = {};
    }

    getUrlParam(name) {
        const params = new URLSearchParams(window.location.search);
        return params.get(name);
    }

    async init() {
        if (!this.enabled) {
            console.log('[Multiplayer] 多人模式未启用');
            return;
        }
        
        // 等待 A-Frame 场景加载
        if (document.querySelector('a-scene').hasAttribute('loaded')) {
            this.setup();
        } else {
            document.querySelector('a-scene').addEventListener('loaded', () => this.setup());
        }
    }

    setup() {
        console.log('[Multiplayer] 初始化多人绘画 v2...');
        
        // 初始化版本向量
        this.clientClock[this.clientID] = 0;
        
        // 连接服务器
        this.connect();
        
        // 监听画笔事件
        this.setupBrushListener();
        
        // 启动差分定时器
        this.startDeltaTimer();
        
        // 启动心跳
        this.startHeartbeat();
        
        // 创建 UI
        this.createUI();
    }

    connect() {
        const url = `ws://${location.host}/ws?room=${encodeURIComponent(this.roomID)}&name=${encodeURIComponent(this.playerName)}&client_id=${encodeURIComponent(this.clientID)}`;
        console.log('[Multiplayer] 连接服务器:', url);
        
        this.ws = new WebSocket(url);
        
        this.ws.onopen = () => {
            console.log('[Multiplayer] 已连接到服务器');
            this.connected = true;
            this.updateStatus('已连接 ✓', '#00ff00');
            
            // 请求全量同步
            this.send({ type: 'sync' });
            
            // 触发回调
            if (this.callbacks.onConnect) {
                this.callbacks.onConnect();
            }
        };
        
        this.ws.onclose = () => {
            console.log('[Multiplayer] 与服务器断开连接');
            this.connected = false;
            this.updateStatus('已断开 ✗', '#ff4444');
            
            if (this.callbacks.onDisconnect) {
                this.callbacks.onDisconnect();
            }
            
            // 延迟重连
            setTimeout(() => this.connect(), this.config.reconnectDelay);
        };
        
        this.ws.onerror = (err) => {
            console.error('[Multiplayer] WebSocket 错误:', err);
            this.updateStatus('连接错误', '#ff8800');
        };
        
        this.ws.onmessage = (event) => {
            this.handleMessage(JSON.parse(event.data));
        };
    }

    handleMessage(msg) {
        switch (msg.type) {
            case 'player_list':
            case 'sync_resp':
                this.handleSyncResp(msg);
                break;
            case 'join':
                this.handlePlayerJoin(msg);
                break;
            case 'leave':
                this.handlePlayerLeave(msg);
                break;
            case 'stroke':
                this.handleRemoteStroke(msg);
                break;
            case 'stroke_delta':
                this.handleRemoteStrokeDelta(msg);
                break;
            case 'ack':
                this.handleAck(msg);
                break;
            case 'undo':
                this.handleUndo(msg);
                break;
            case 'clear':
                this.handleClear(msg);
                break;
            case 'cursor':
                this.handleCursor(msg);
                break;
            case 'pong':
                // 心跳响应
                break;
        }
    }

    handleSyncResp(msg) {
        console.log('[Multiplayer] 收到全量同步:', msg.strokes ? msg.strokes.length : 0, '笔触', msg.players ? msg.players.length : 0, '玩家');
        
        // 更新玩家列表
        this.players = msg.players || [];
        this.updatePlayerCount();
        
        // 更新服务端版本向量
        if (msg.server_clock) {
            this.serverClock = msg.server_clock;
        }
        
        // 加载历史笔触
        if (msg.strokes) {
            this.strokes = msg.strokes;
            
            // 触发回调让前端渲染历史笔触
            if (this.callbacks.onSync) {
                this.callbacks.onSync(msg.strokes);
            }
        }
    }

    handlePlayerJoin(msg) {
        if (!this.players.find(p => p.id === msg.player.id)) {
            this.players.push(msg.player);
        }
        this.updatePlayerCount();
        this.showNotification(msg.player.name + ' 加入了房间');
        
        if (this.callbacks.onPlayerJoin) {
            this.callbacks.onPlayerJoin(msg.player);
        }
    }

    handlePlayerLeave(msg) {
        this.players = this.players.filter(p => p.id !== msg.player.id);
        this.updatePlayerCount();
        this.showNotification(msg.player.name + ' 离开了房间');
        
        if (this.callbacks.onPlayerLeave) {
            this.callbacks.onPlayerLeave(msg.player);
        }
    }

    handleRemoteStroke(msg) {
        if (!msg.stroke) return;
        
        // 合并版本向量
        if (msg.stroke.vector_clock) {
            this.serverClock = this.mergeClocks(this.serverClock, msg.stroke.vector_clock);
        }
        
        // 检查是否重复（通过版本向量检测）
        const strokeClock = msg.stroke.vector_clock || {};
        if (this.isNewer(strokeClock)) {
            this.strokes.push(msg.stroke);
            this.trimStrokes();
            
            // 触发回调让前端渲染
            if (this.callbacks.onStroke) {
                this.callbacks.onStroke(msg.stroke);
            }
        }
    }

    handleRemoteStrokeDelta(msg) {
        if (!msg.stroke_delta) return;
        
        const delta = msg.stroke_delta;
        const strokeID = delta.stroke_id;
        
        // 找到对应的笔触
        let stroke = this.strokes.find(s => s.id === strokeID);
        
        if (!stroke) {
            // 如果没找到笔触，请求全量同步
            console.warn('[Multiplayer] 收到未知笔触的差分，请求全量同步');
            this.send({ type: 'sync' });
            return;
        }
        
        // 追加新点
        stroke.points = stroke.points.concat(delta.new_points);
        stroke.total_points = delta.total_points;
        
        // 触发回调
        if (this.callbacks.onStrokeDelta) {
            this.callbacks.onStrokeDelta(strokeID, delta.new_points);
        }
    }

    handleAck(msg) {
        // 确认笔触已收到
        if (msg.stroke && msg.stroke.id && this.pendingStrokes[msg.stroke.id]) {
            delete this.pendingStrokes[msg.stroke.id];
            console.log('[Multiplayer] 笔触确认:', msg.stroke.id);
        }
        
        // 合并服务端版本向量
        if (msg.server_clock) {
            this.serverClock = this.mergeClocks(this.serverClock, msg.server_clock);
        }
    }

    handleUndo(msg) {
        // 撤销指定笔触
        this.strokes = this.strokes.filter(s => s.id !== msg.undo_id);
        
        if (this.callbacks.onUndo) {
            this.callbacks.onUndo(msg.undo_id);
        }
    }

    handleClear(msg) {
        this.strokes = [];
        
        if (this.callbacks.onClear) {
            this.callbacks.onClear();
        }
        
        if (msg.player) {
            this.showNotification(msg.player.name + ' 清空了画布');
        }
    }

    handleCursor(msg) {
        if (this.callbacks.onCursor) {
            this.callbacks.onCursor(msg.player);
        }
    }

    // ========== 版本向量操作 ==========

    /**
     * 合并两个版本向量
     */
    mergeClocks(vc1, vc2) {
        const result = { ...vc1 };
        for (const k in vc2) {
            result[k] = Math.max(result[k] || 0, vc2[k]);
        }
        return result;
    }

    /**
     * 检查本地版本向量是否比远程新
     */
    isNewer(remoteClock) {
        // 如果 remote 不比本地新，说明本地已有或本地更新
        for (const k in remoteClock) {
            if ((this.clientClock[k] || 0) < remoteClock[k]) {
                return true; // 远程有本地不知道的更新
            }
        }
        return false;
    }

    /**
     * 递增本地版本向量
     */
    incrementClock() {
        this.clientClock[this.clientID] = (this.clientClock[this.clientID] || 0) + 1;
        return this.clientClock[this.clientID];
    }

    // ========== 发送操作 ==========

    /**
     * 发送消息
     */
    send(data) {
        if (!this.ws || !this.connected) return false;
        
        try {
            this.ws.send(JSON.stringify(data));
            return true;
        } catch (e) {
            console.error('[Multiplayer] 发送失败:', e);
            return false;
        }
    }

    /**
     * 发送完整笔触
     */
    sendStroke(strokeData) {
        // 递增版本向量
        const clockValue = this.incrementClock();
        
        // 创建笔触
        const stroke = {
            id: strokeData.id || this.generateStrokeID(),
            brush: {
                index: strokeData.brushIndex || 0,
                name: strokeData.brushName || 'flat',
                color: strokeData.color || [1, 0, 0],
                size: strokeData.size || 0.01,
            },
            points: strokeData.points || [],
            timestamp: Date.now(),
            vector_clock: { [this.clientID]: clockValue },
            prev_stroke_id: strokeData.prevStrokeID || null,
        };
        
        // 记录到本地
        this.strokes.push(stroke);
        this.pendingStrokes[stroke.id] = stroke;
        this.trimStrokes();
        
        // 广播
        this.send({
            type: 'stroke',
            stroke: stroke,
        });
        
        // 也发送到差分缓冲（用于实时增量同步）
        this.addToDeltaBuffer(stroke);
        
        return stroke.id;
    }

    /**
     * 发送差分笔触（增量点）
     */
    sendStrokeDelta(strokeID, newPoints) {
        if (!newPoints || newPoints.length === 0) return;
        
        // 递增版本向量
        this.incrementClock();
        
        const delta = {
            stroke_id: strokeID,
            new_points: newPoints,
            timestamp: Date.now(),
        };
        
        // 找笔触更新总点数
        const stroke = this.strokes.find(s => s.id === strokeID);
        if (stroke) {
            delta.total_points = stroke.points.length;
        }
        
        this.send({
            type: 'stroke_delta',
            stroke_delta: delta,
        });
    }

    /**
     * 发送撤销
     */
    sendUndo(strokeID) {
        this.send({
            type: 'undo',
            undo_id: strokeID,
        });
        
        // 本地立即移除
        this.strokes = this.strokes.filter(s => s.id !== strokeID);
        
        if (this.callbacks.onUndo) {
            this.callbacks.onUndo(strokeID);
        }
    }

    /**
     * 发送清空画布
     */
    sendClear() {
        this.incrementClock();
        this.send({ type: 'clear' });
        this.strokes = [];
        
        if (this.callbacks.onClear) {
            this.callbacks.onClear();
        }
    }

    /**
     * 发送光标位置
     */
    sendCursor(position) {
        this.send({
            type: 'cursor',
            cursor_pos: position,
        });
    }

    // ========== 差分压缩 ==========

    /**
     * 添加点到差分缓冲
     */
    addToDeltaBuffer(stroke) {
        if (!this.currentDelta[stroke.id]) {
            this.currentDelta[stroke.id] = {
                strokeID: stroke.id,
                points: [],
                lastSent: Date.now(),
            };
        }
    }

    /**
     * 启动差分定时器
     */
    startDeltaTimer() {
        this.deltaTimer = setInterval(() => {
            this.flushDeltaBuffer();
        }, this.config.deltaInterval);
    }

    /**
     * 刷新差分缓冲
     */
    flushDeltaBuffer() {
        for (const strokeID in this.currentDelta) {
            const delta = this.currentDelta[strokeID];
            
            if (delta.points.length >= this.config.deltaThreshold) {
                // 达到阈值，发送差分
                this.sendStrokeDelta(strokeID, delta.points);
                delta.points = [];
                delta.lastSent = Date.now();
            }
        }
    }

    /**
     * 心跳
     */
    startHeartbeat() {
        this.heartbeatTimer = setInterval(() => {
            if (this.connected) {
                this.send({ type: 'ping' });
            }
        }, this.config.heartbeatInterval);
    }

    /**
     * 清理内存
     */
    trimStrokes() {
        if (this.strokes.length > this.config.maxStrokes) {
            this.strokes = this.strokes.slice(-this.config.maxStrokes);
        }
    }

    // ========== 事件监听 ==========

    setupBrushListener() {
        const scene = document.querySelector('a-scene');
        
        // 监听笔触完成
        scene.addEventListener('brush-stroke-complete', (e) => {
            if (this.enabled && this.connected) {
                this.sendStroke(e.detail);
            }
        });
        
        // 监听笔触中（用于差分）
        scene.addEventListener('brush-stroke-point', (e) => {
            if (this.enabled && this.connected) {
                const strokeID = e.detail.strokeID;
                this.addToDeltaBuffer({ id: strokeID });
                if (this.currentDelta[strokeID]) {
                    this.currentDelta[strokeID].points.push(e.detail.point);
                }
            }
        });
        
        // 监听撤销
        scene.addEventListener('undo', (e) => {
            if (this.enabled && this.connected) {
                const lastStroke = this.strokes[this.strokes.length - 1];
                if (lastStroke) {
                    this.sendUndo(lastStroke.id);
                }
            }
        });
        
        // 监听清空
        scene.addEventListener('clear', (e) => {
            if (this.enabled && this.connected) {
                this.sendClear();
            }
        });
    }

    // ========== 回调设置 ==========

    on(event, callback) {
        const events = ['connect', 'disconnect', 'playerJoin', 'playerLeave', 
                        'stroke', 'strokeDelta', 'undo', 'clear', 'cursor', 'sync'];
        if (events.includes(event)) {
            this.callbacks['on' + event.charAt(0).toUpperCase() + event.slice(1)] = callback;
        }
    }

    // ========== UI ==========

    createUI() {
        const status = document.createElement('div');
        status.id = 'multiplayer-status';
        status.style.cssText = 'position:fixed;top:10px;right:10px;padding:10px 15px;background:rgba(0,0,0,0.8);color:#fff;border-radius:8px;font-family:Arial,sans-serif;font-size:14px;z-index:9999;border:2px solid #0070d1;';
        status.innerHTML = '<div style="color:#00d9ff;font-weight:bold;">VR Paint Multiplayer v2</div>' +
            '<div>房间: <span id="room-name">' + this.roomID + '</span></div>' +
            '<div>玩家: <span id="player-count">0</span></div>' +
            '<div>笔触: <span id="stroke-count">0</span></div>' +
            '<div>状态: <span id="conn-status">连接中...</span></div>';
        document.body.appendChild(status);
    }

    updateStatus(text, color) {
        const el = document.getElementById('conn-status');
        if (el) {
            el.textContent = text;
            el.style.color = color;
        }
    }

    updatePlayerCount() {
        const el = document.getElementById('player-count');
        if (el) el.textContent = this.players.length;
    }

    updateStrokeCount() {
        const el = document.getElementById('stroke-count');
        if (el) el.textContent = this.strokes.length;
    }

    showNotification(message) {
        const notif = document.createElement('div');
        notif.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);padding:12px 24px;background:rgba(0,118,209,0.95);color:#fff;border-radius:25px;font-size:14px;z-index:9999;animation:fadeInOut 3s forwards;';
        notif.textContent = message;
        document.body.appendChild(notif);
        setTimeout(() => notif.remove(), 3000);
    }

    // ========== 工具 ==========

    generateStrokeID() {
        return Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 8);
    }

    getShareLink() {
        const url = new URL(location.href);
        url.searchParams.set('room', this.roomID);
        url.searchParams.set('name', this.playerName);
        url.searchParams.set('multi', '1');
        return url.toString();
    }

    getRoomInfo() {
        return {
            roomID: this.roomID,
            playerName: this.playerName,
            playerCount: this.players.length,
            strokeCount: this.strokes.length,
            connected: this.connected,
            serverClock: this.serverClock,
        };
    }

    // 销毁
    destroy() {
        if (this.deltaTimer) clearInterval(this.deltaTimer);
        if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
        if (this.ws) this.ws.close();
    }
}

// 创建全局实例
window.vrPaintMultiplayer = new VRPaintMultiplayer();

// 自动初始化
document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('multi') === '1') {
        window.vrPaintMultiplayer.init();
    }
});

// 清理
window.addEventListener('beforeunload', () => {
    if (window.vrPaintMultiplayer) {
        window.vrPaintMultiplayer.destroy();
    }
});

console.log('[VR Paint Multiplayer v2] 客户端已加载');

})();
