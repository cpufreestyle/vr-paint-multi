package main

import (
	"flag"
	"log"
	"net/http"

	"vr-paint-multi/pkg/websocket"
)

var (
	addr = flag.String("addr", ":8081", "服务地址")
)

func main() {
	flag.Parse()

	hub := websocket.NewHub()
	go hub.Run()

	// HTTP 服务
	http.HandleFunc("/ws", hub.ServeWs)
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write([]byte(`
<!DOCTYPE html>
<html>
<head>
    <title>VR Paint Multiplayer</title>
    <style>
        body { font-family: Arial; background: #1a1a2e; color: #fff; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
        .container { text-align: center; }
        h1 { color: #00d9ff; }
        input { padding: 10px; font-size: 16px; margin: 10px; border: none; border-radius: 5px; }
        button { padding: 10px 30px; font-size: 16px; background: #0070d1; color: #fff; border: none; border-radius: 5px; cursor: pointer; }
        button:hover { background: #1a82ef; }
        .info { color: #8fa4c4; margin-top: 20px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🎨 VR Paint Multiplayer</h1>
        <p>多人在线 VR 绘画服务器</p>
        <input type="text" id="name" placeholder="你的名字" value="Player1">
        <br>
        <input type="text" id="room" placeholder="房间号" value="default">
        <br>
        <button onclick="joinRoom()">加入绘画</button>
        <div class="info">
            <p>连接状态: <span id="status">未连接</span></p>
            <p>在线人数: <span id="count">0</span></p>
        </div>
    </div>
    <script>
        let ws, name, room, players = [];
        
        function joinRoom() {
            name = document.getElementById('name').value || 'Anonymous';
            room = document.getElementById('room').value || 'default';
            
            ws = new WebSocket('ws://' + location.host + '/ws?room=' + encodeURIComponent(room) + '&name=' + encodeURIComponent(name));
            
            ws.onopen = () => {
                document.getElementById('status').textContent = '已连接 ✓';
                document.getElementById('status').style.color = '#00ff00';
            };
            
            ws.onclose = () => {
                document.getElementById('status').textContent = '已断开 ✗';
                document.getElementById('status').style.color = '#ff4444';
            };
            
            ws.onmessage = (evt) => {
                const msg = JSON.parse(evt.data);
                if (msg.type === 'player_list') {
                    players = msg.players || [];
                    document.getElementById('count').textContent = players.length;
                } else if (msg.type === 'join') {
                    players.push(msg.player);
                    document.getElementById('count').textContent = players.length;
                } else if (msg.type === 'leave') {
                    players = players.filter(p => p.id !== msg.player.id);
                    document.getElementById('count').textContent = players.length;
                }
            };
        }
    </script>
</body>
</html>
		`))
	})

	log.Printf("🎨 VR Paint Multiplayer Server 启动中...")
	log.Printf("📡 WebSocket: ws://localhost%s/ws", *addr)
	log.Printf("🌐 HTTP: http://localhost%s", *addr)
	
	if err := http.ListenAndServe(*addr, nil); err != nil {
		log.Fatal("启动失败:", err)
	}
}
