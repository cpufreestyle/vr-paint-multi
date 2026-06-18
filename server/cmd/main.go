package main

import (
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
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

	// 静态文件服务：A-Painter 资源放在 ../vr-paint 中
	fs := http.FileServer(http.Dir("../../vr-paint"))
	http.Handle("/", fs)

	// 多人绘画页面：使用 ../multi.html
	http.HandleFunc("/multiplayer.html", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		data, err := os.ReadFile("../multi.html")
		if err != nil {
			log.Printf("[HTTP] Failed to read ../multi.html: %v", err)
			http.Error(w, "Multiplayer page not found", http.StatusInternalServerError)
			return
		}
		w.Write(data)
	})

	// 多人绘画客户端脚本
	http.Handle("/multiplayer/", http.StripPrefix("/multiplayer/", http.FileServer(http.Dir("../multiplayer"))))

	addr := fmt.Sprintf(":%d", *port)
	log.Printf("🚀 服务器启动: http://localhost:%d", *port)
	log.Printf("📡 WebSocket: ws://localhost:%d/ws", *port)

	if err := http.ListenAndServe(addr, nil); err != nil {
		log.Fatal(err)
	}
}
