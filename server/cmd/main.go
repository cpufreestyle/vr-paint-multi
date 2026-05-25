package main

import (
	"flag"
	"fmt"
	"log"
	"net/http"
	"runtime"

	ws "vr-paint-multi/pkg/websocket"
)

func main() {
	// 打印启动信息
	log.SetFlags(log.LstdFlags | log.Lshortfile)
	log.Printf("🎨 VR Paint Multiplayer Server")
	log.Printf("   Version: 1.0.0")
	log.Printf("   Go: %s", runtime.Version())
	log.Printf("   CPU: %d cores", runtime.NumCPU())
	
	// 解析参数
	port := flag.Int("port", 8081, "Server port")
	flag.Parse()
	
	// 创建 Hub
	hub := ws.NewHub()
	go hub.Run()
	
	// 注册 WebSocket 处理器
	http.HandleFunc("/ws", hub.ServeWs)
	
	// 健康检查
	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok","version":"1.0.0"}`))
	})
	
	// 首页
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		html := `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>VR Paint Multiplayer</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', Arial, sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            color: #fff;
        }
        .container {
            text-align: center;
            padding: 40px;
            background: rgba(255,255,255,0.05);
            border-radius: 20px;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255,255,255,0.1);
            box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5);
            max-width: 500px;
            width: 90%;
        }
        h1 {
            font-size: 2.5em;
            margin-bottom: 10px;
            background: linear-gradient(90deg, #00d9ff, #00ff88);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .subtitle {
            color: #8fa4c4;
            margin-bottom: 30px;
            font-size: 1.1em;
        }
        .input-group {
            margin: 20px 0;
            text-align: left;
        }
        label {
            display: block;
            margin-bottom: 8px;
            color: #00d9ff;
            font-weight: 500;
        }
        input {
            width: 100%;
            padding: 15px;
            border: 2px solid rgba(255,255,255,0.1);
            border-radius: 10px;
            background: rgba(0,0,0,0.3);
            color: #fff;
            font-size: 16px;
            transition: all 0.3s;
        }
        input:focus {
            outline: none;
            border-color: #00d9ff;
            box-shadow: 0 0 20px rgba(0,217,255,0.2);
        }
        .btn {
            width: 100%;
            padding: 18px;
            margin: 10px 0;
            border: none;
            border-radius: 10px;
            font-size: 18px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s;
        }
        .btn-primary {
            background: linear-gradient(90deg, #0070d1, #00d9ff);
            color: #fff;
        }
        .btn-primary:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 30px rgba(0,217,255,0.3);
        }
        .btn-secondary {
            background: rgba(255,255,255,0.1);
            color: #fff;
            border: 2px solid rgba(255,255,255,0.2);
        }
        .btn-secondary:hover {
            background: rgba(255,255,255,0.2);
        }
        .status {
            margin-top: 30px;
            padding: 20px;
            background: rgba(0,0,0,0.3);
            border-radius: 10px;
            text-align: left;
        }
        .status-item {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .status-item:last-child { border-bottom: none; }
        .status-label { color: #8fa4c4; }
        .status-value { color: #00ff88; font-weight: 600; }
        .status-value.disconnected { color: #ff4444; }
        .share-box {
            margin-top: 20px;
            padding: 15px;
            background: rgba(0,217,255,0.1);
            border-radius: 10px;
            display: none;
        }
        .share-box.show { display: block; }
        .share-url {
            word-break: break-all;
            color: #00d9ff;
            font-family: monospace;
            font-size: 12px;
            padding: 10px;
            background: rgba(0,0,0,0.3);
            border-radius: 5px;
            margin-top: 10px;
        }
        .features {
            margin-top: 30px;
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 15px;
        }
        .feature {
            padding: 15px;
            background: rgba(0,0,0,0.2);
            border-radius: 10px;
        }
        .feature-icon { font-size: 2em; }
        .feature-text { font-size: 0.85em; color: #8fa4c4; margin-top: 5px; }
        @media (max-width: 500px) {
            .features { grid-template-columns: 1fr; }
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🎨 VR Paint Multiplayer</h1>
        <p class="subtitle">多人在线 VR 绘画</p>
        
        <div class="input-group">
            <label>你的名字</label>
            <input type="text" id="name" placeholder="输入你的名字" value="">
        </div>
        
        <div class="input-group">
            <label>房间号</label>
            <input type="text" id="room" placeholder="留空自动创建新房间" value="">
        </div>
        
        <button class="btn btn-primary" onclick="joinRoom()">🎨 加入绘画</button>
        <button class="btn btn-secondary" onclick="shareLink()">🔗 复制分享链接</button>
        
        <div class="share-box" id="shareBox">
            <div style="color:#00d9ff;">分享链接（发送给朋友一起绘画）:</div>
            <div class="share-url" id="shareUrl"></div>
        </div>
        
        <div class="status">
            <div class="status-item">
                <span class="status-label">连接状态</span>
                <span class="status-value disconnected" id="connStatus">未连接</span>
            </div>
            <div class="status-item">
                <span class="status-label">房间号</span>
                <span class="status-value" id="roomDisplay">-</span>
            </div>
            <div class="status-item">
                <span class="status-label">在线人数</span>
                <span class="status-value" id="playerCount">0</span>
            </div>
            <div class="status-item">
                <span class="status-label">历史笔触</span>
                <span class="status-value" id="strokeCount">0</span>
            </div>
        </div>
        
        <div class="features">
            <div class="feature">
                <div class="feature-icon">🚀</div>
                <div class="feature-text">实时同步</div>
            </div>
            <div class="feature">
                <div class="feature-icon">🎮</div>
                <div class="feature-text">VR 支持</div>
            </div>
            <div class="feature">
                <div class="feature-icon">↩️</div>
                <div class="feature-text">撤销/恢复</div>
            </div>
        </div>
    </div>
    
    <script>
        let ws = null;
        let clientID = localStorage.getItem('vrpaint_client_id') || 'client_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('vrpaint_client_id', clientID);
        
        function generateRoomID() {
            return 'room-' + Math.random().toString(36).substr(2, 6);
        }
        
        function updateStatus(status, color) {
            document.getElementById('connStatus').textContent = status;
            document.getElementById('connStatus').style.color = color;
        }
        
        function joinRoom() {
            const name = document.getElementById('name').value.trim() || 'Anonymous';
            let room = document.getElementById('room').value.trim();
            
            if (!room) {
                room = generateRoomID();
                document.getElementById('room').value = room;
            }
            
            // 更新 URL
            const url = new URL(window.location.href);
            url.searchParams.set('room', room);
            url.searchParams.set('name', name);
            url.searchParams.set('client_id', clientID);
            window.history.pushState({}, '', url);
            
            // 显示分享链接
            const shareUrl = url.toString().replace('/?', '/multiplayer.html?');
            document.getElementById('shareUrl').textContent = shareUrl;
            document.getElementById('shareBox').classList.add('show');
            
            // 连接 WebSocket
            if (ws) ws.close();
            
            const wsUrl = 'ws://' + location.host + '/ws?room=' + encodeURIComponent(room) + '&name=' + encodeURIComponent(name) + '&client_id=' + clientID;
            ws = new WebSocket(wsUrl);
            
            ws.onopen = () => {
                updateStatus('已连接 ✓', '#00ff88');
                document.getElementById('roomDisplay').textContent = room;
                // 请求全量同步
                ws.send(JSON.stringify({ type: 'sync' }));
            };
            
            ws.onclose = () => {
                updateStatus('已断开 ✗', '#ff4444');
                // 3秒后重连
                setTimeout(() => {
                    if (document.getElementById('room').value) joinRoom();
                }, 3000);
            };
            
            ws.onerror = () => {
                updateStatus('连接错误', '#ff8800');
            };
            
            ws.onmessage = (evt) => {
                const msg = JSON.parse(evt.data);
                handleMessage(msg);
            };
        }
        
        function handleMessage(msg) {
            switch (msg.type) {
                case 'sync_resp':
                    // 全量同步响应
                    const players = msg.players || [];
                    document.getElementById('playerCount').textContent = players.length;
                    document.getElementById('strokeCount').textContent = msg.strokes ? msg.strokes.length : 0;
                    // TODO: 加载历史笔触到画布
                    break;
                case 'player_list':
                    document.getElementById('playerCount').textContent = msg.players ? msg.players.length : 0;
                    break;
                case 'join':
                    document.getElementById('playerCount').textContent = 
                        parseInt(document.getElementById('playerCount').textContent) + 1;
                    showNotification(msg.player.name + ' 加入了房间');
                    break;
                case 'leave':
                    document.getElementById('playerCount').textContent = 
                        Math.max(0, parseInt(document.getElementById('playerCount').textContent) - 1);
                    showNotification(msg.player.name + ' 离开了房间');
                    break;
                case 'stroke':
                    // TODO: 渲染远程笔触
                    document.getElementById('strokeCount').textContent = 
                        parseInt(document.getElementById('strokeCount').textContent) + 1;
                    break;
                case 'stroke_delta':
                    // TODO: 增量笔触渲染
                    break;
                case 'undo':
                    // TODO: 撤销指定笔触
                    break;
                case 'clear':
                    // TODO: 清空画布
                    showNotification(msg.player.name + ' 清空了画布');
                    break;
                case 'cursor':
                    // TODO: 更新其他玩家光标
                    break;
                case 'ack':
                    // 确认收到
                    break;
            }
        }
        
        function shareLink() {
            const room = document.getElementById('room').value;
            const name = document.getElementById('name').value.trim();
            if (!room) {
                alert('请先加入房间');
                return;
            }
            const url = location.protocol + '//' + location.host + '/multiplayer.html?room=' + encodeURIComponent(room) + '&name=' + encodeURIComponent(name);
            navigator.clipboard.writeText(url).then(() => {
                showNotification('链接已复制到剪贴板');
            });
        }
        
        function showNotification(msg) {
            const notif = document.createElement('div');
            notif.style.cssText = 'position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); padding: 12px 24px; background: rgba(0,118,209,0.95); color: #fff; border-radius: 25px; font-size: 14px; z-index: 9999; animation: fadeInOut 3s forwards;';
            notif.textContent = msg;
            document.body.appendChild(notif);
            setTimeout(() => notif.remove(), 3000);
        }
        
        // 检查 URL 参数自动加入
        const urlParams = new URLSearchParams(location.search);
        if (urlParams.get('room') && urlParams.get('name')) {
            document.getElementById('name').value = urlParams.get('name');
            document.getElementById('room').value = urlParams.get('room');
            setTimeout(joinRoom, 500);
        }
    </script>
    <style>
        @keyframes fadeInOut {
            0% { opacity: 0; transform: translateX(-50%) translateY(20px); }
            10% { opacity: 1; transform: translateX(-50%) translateY(0); }
            90% { opacity: 1; }
            100% { opacity: 0; }
        }
    </style>
</body>
</html>`
		w.Write([]byte(html))
	})
	
	// 多人绘画页面
	http.HandleFunc("/multiplayer.html", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write([]byte(`<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>VR Paint Multiplayer</title>
    <meta http-equiv="refresh" content="0;url=/" />
</head>
<body>
    <p>Redirecting to main page...</p>
</body>
</html>`))
	})
	
	addr := fmt.Sprintf(":%d", *port)
	log.Printf("🚀 服务器启动: http://localhost:%d", *port)
	log.Printf("📡 WebSocket: ws://localhost:%d/ws", *port)
	
	if err := http.ListenAndServe(addr, nil); err != nil {
		log.Fatal(err)
	}
}
