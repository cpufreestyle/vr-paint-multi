/**
 * VR Paint Multiplayer Client
 * 多人在线绘画 WebSocket 客户端
 * 
 * 使用方式:
 * 1. 在 index.html 中引入此脚本
 * 2. 在 URL 中添加 ?multi=1&room=房间号&name=你的名字
 * 3. 笔触会自动同步到房间内的所有人
 */

class VRPaintMultiplayer {
    constructor() {
        this.ws = null;
        this.roomID = this.getUrlParam('room') || 'default';
        this.playerName = this.getUrlParam('name') || 'Player';
        this.enabled = this.getUrlParam('multi') === '1';
        this.players = [];
        this.remoteStrokes = []; // 存储远程笔触
        this.pendingStrokes = []; // 待处理的远程笔触
        this.serverURL = ''; // 需要配置服务器地址
        this.connected = false;
        this.brushSystem = null;
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
            await this.setup();
        } else {
            document.querySelector('a-scene').addEventListener('loaded', () => this.setup());
        }
    }

    async setup() {
        console.log('[Multiplayer] 初始化多人绘画...');
        
        // 尝试自动检测服务器地址
        this.serverURL = this.detectServerURL();
        
        // 连接到 WebSocket 服务器
        this.connect();
        
        // 监听画笔事件
        this.setupBrushListener();
        
        // 创建 UI 元素
        this.createUI();
    }

    detectServerURL() {
        // 优先使用同源 WebSocket
        const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${wsProtocol}//${location.host}/ws`;
    }

    connect() {
        const url = `${this.serverURL}?room=${encodeURIComponent(this.roomID)}&name=${encodeURIComponent(this.playerName)}`;
        console.log('[Multiplayer] 连接服务器:', url);
        
        this.ws = new WebSocket(url);
        
        this.ws.onopen = () => {
            console.log('[Multiplayer] 已连接到服务器');
            this.connected = true;
            this.updateStatus('已连接 ✓', '#00ff00');
        };
        
        this.ws.onclose = () => {
            console.log('[Multiplayer] 与服务器断开连接');
            this.connected = false;
            this.updateStatus('已断开 ✗', '#ff4444');
            
            // 尝试重新连接
            setTimeout(() => this.connect(), 3000);
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
                this.players = msg.players || [];
                this.updatePlayerCount();
                break;
                
            case 'join':
                this.players.push(msg.player);
                this.updatePlayerCount();
                this.showNotification(`${msg.player.name} 加入了房间`);
                break;
                
            case 'leave':
                this.players = this.players.filter(p => p.id !== msg.player.id);
                this.updatePlayerCount();
                this.showNotification(`${msg.player.name} 离开了房间`);
                break;
                
            case 'stroke':
                if (msg.stroke) {
                    this.receiveRemoteStroke(msg.stroke);
                }
                break;
        }
    }

    setupBrushListener() {
        // 监听 brush 组件的笔触完成事件
        document.querySelector('a-scene').addEventListener('brush-stroke-complete', (e) => {
            if (this.enabled && this.connected) {
                this.sendStroke(e.detail);
            }
        });
        
        // 或者监听 undo 事件
        document.querySelector('a-scene').addEventListener('undo', (e) => {
            if (this.enabled && this.connected) {
                this.broadcastEvent('undo');
            }
        });
    }

    sendStroke(strokeData) {
        if (!this.ws || !this.connected) return;
        
        const stroke = {
            id: Date.now().toString(36) + Math.random().toString(36).substr(2),
            brush: {
                index: strokeData.brushIndex || 0,
                color: strokeData.color || [1, 0, 0],
                size: strokeData.size || 0.01
            },
            points: strokeData.points || [],
            timestamp: Date.now()
        };
        
        this.ws.send(JSON.stringify({
            type: 'stroke',
            stroke: stroke
        }));
        
        console.log('[Multiplayer] 发送笔触:', stroke.points.length, '点');
    }

    receiveRemoteStroke(stroke) {
        console.log('[Multiplayer] 收到远程笔触:', stroke.points.length, '点');
        
        // 获取 brush system
        const scene = document.querySelector('a-scene');
        const brushSystem = scene.components.brush;
        
        if (!brushSystem) {
            console.warn('[Multiplayer] Brush system 未找到');
            return;
        }
        
        // 创建远程笔触
        const brushInfo = stroke.brush;
        const brushName = Object.keys(AFRAME.BRUSHES)[brushInfo.index] || 'smooth';
        
        // 添加点到 brush system
        // 这需要根据实际的 brush system API 来实现
        // 以下是示例逻辑
        brushSystem.addRemoteStroke({
            brushName: brushName,
            color: new THREE.Color().fromArray(brushInfo.color),
            size: brushInfo.size,
            points: stroke.points.map(p => ({
                position: new THREE.Vector3().fromArray(p.position),
                orientation: new THREE.Quaternion().fromArray(p.orientation),
                pressure: p.pressure,
                timestamp: p.timestamp
            }))
        });
    }

    broadcastEvent(eventType) {
        if (!this.ws || !this.connected) return;
        
        this.ws.send(JSON.stringify({
            type: 'event',
            event: eventType
        }));
    }

    createUI() {
        // 创建状态显示
        const status = document.createElement('div');
        status.id = 'multiplayer-status';
        status.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            padding: 10px 15px;
            background: rgba(0, 0, 0, 0.8);
            color: #fff;
            border-radius: 8px;
            font-family: Arial, sans-serif;
            font-size: 14px;
            z-index: 9999;
            border: 2px solid #0070d1;
        `;
        status.innerHTML = `
            <div style="color: #00d9ff; font-weight: bold;">🎨 多人绘画</div>
            <div>房间: <span id="room-name">${this.roomID}</span></div>
            <div>玩家: <span id="player-count">0</span></div>
            <div>状态: <span id="conn-status">连接中...</span></div>
        `;
        document.body.appendChild(status);
    }

    updateStatus(text, color) {
        const statusEl = document.getElementById('conn-status');
        if (statusEl) {
            statusEl.textContent = text;
            statusEl.style.color = color;
        }
    }

    updatePlayerCount() {
        const countEl = document.getElementById('player-count');
        if (countEl) {
            countEl.textContent = this.players.length;
        }
    }

    showNotification(message) {
        // 创建通知
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            padding: 10px 20px;
            background: rgba(0, 118, 209, 0.9);
            color: #fff;
            border-radius: 20px;
            font-family: Arial, sans-serif;
            font-size: 14px;
            z-index: 9999;
            animation: fadeInOut 3s forwards;
        `;
        notification.textContent = message;
        document.body.appendChild(notification);
        
        // 3秒后移除
        setTimeout(() => notification.remove(), 3000);
    }

    // 获取当前房间信息
    getRoomInfo() {
        return {
            roomID: this.roomID,
            playerName: this.playerName,
            playerCount: this.players.length,
            connected: this.connected
        };
    }

    // 分享链接
    getShareLink() {
        const url = new URL(location.href);
        url.searchParams.set('room', this.roomID);
        return url.toString();
    }
}

// 创建全局实例
window.vrPaintMultiplayer = new VRPaintMultiplayer();

// 自动初始化
document.addEventListener('DOMContentLoaded', () => {
    // 检查是否启用多人模式
    const params = new URLSearchParams(window.location.search);
    if (params.get('multi') === '1') {
        window.vrPaintMultiplayer.init();
    }
});

// 添加淡入淡出动画样式
const style = document.createElement('style');
style.textContent = `
    @keyframes fadeInOut {
        0% { opacity: 0; transform: translateX(-50%) translateY(20px); }
        10% { opacity: 1; transform: translateX(-50%) translateY(0); }
        90% { opacity: 1; transform: translateX(-50%) translateY(0); }
        100% { opacity: 0; transform: translateX(-50%) translateY(-20px); }
    }
`;
document.head.appendChild(style);

console.log('[VR Paint Multiplayer] 客户端已加载');
