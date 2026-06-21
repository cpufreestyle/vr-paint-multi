package main

import (
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"runtime"

	ws "vr-paint-multi/pkg/websocket"
)

var projectRoot string

func main() {
	log.SetFlags(log.LstdFlags | log.Lshortfile)
	log.Printf("VR Paint Multiplayer Server v2.2.0 (AI Paint)")
	log.Printf("Go: %s", runtime.Version())
	log.Printf("CPU: %d cores", runtime.NumCPU())

	// 支持环境变量指定静态文件目录（云部署用）
	// 本地开发: 自动从 exe 位置推算项目根目录
	projectRoot = os.Getenv("STATIC_DIR")
	if projectRoot == "" {
		exe, _ := os.Executable()
		// exe 在 server/ 子目录，上两级到项目根目录
		projectRoot = filepath.Dir(filepath.Dir(exe))
	}
	log.Printf("Static files root: %s", projectRoot)

	port := flag.Int("port", 0, "Server port (default: 8081, or PORT env var)")
	flag.Parse()

	listenPort := *port
	if listenPort == 0 {
		if p := os.Getenv("PORT"); p != "" {
			fmt.Sscanf(p, "%d", &listenPort)
		}
		if listenPort == 0 {
			listenPort = 8081
		}
	}

	hub := ws.NewHub()
	go hub.Run()

	http.HandleFunc("/ws", hub.ServeWs)

	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte("{\"status\":\"ok\",\"version\":\"2.2.0\"}"))
	})

	singleAndMultiHandler := func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Content-Security-Policy", "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; connect-src * ws: wss:; img-src * data: blob:; style-src * 'unsafe-inline'; font-src * data:; media-src * blob:;")
		data, err := os.ReadFile(filepath.Join(projectRoot, "multi.html"))
		if err != nil {
			log.Printf("[HTTP] Failed to read multi.html: %v", err)
			http.Error(w, "Page not found", http.StatusInternalServerError)
			return
		}
		w.Write(data)
	}
	http.HandleFunc("/", singleAndMultiHandler)
	http.HandleFunc("/multiplayer.html", singleAndMultiHandler)

	// Register static file dirs (skip if not exist) / 注册静态文件目录（不存在则跳过）
	staticDirs := []struct {
		path   string
		prefix string
	}{
		{"multiplayer", "/multiplayer/"},
		{"assets", "/assets/"},
		{"img", "/img/"},
		{"css", "/css/"},
		{"vendor", "/vendor/"},
		{"sounds", "/sounds/"},
		{"boat-festival-game", "/boat-festival-game/"},
	}
	for _, d := range staticDirs {
		dirPath := filepath.Join(projectRoot, d.path)
		if info, err := os.Stat(dirPath); err == nil && info.IsDir() {
			http.Handle(d.prefix, http.StripPrefix(d.prefix, http.FileServer(http.Dir(dirPath))))
			log.Printf("[Static] %s -> %s", d.prefix, dirPath)
		} else {
			log.Printf("[Static] %s skipped (dir not found: %s)", d.prefix, dirPath)
		}
	}

	addr := fmt.Sprintf(":%d", listenPort)
	log.Printf("Server starting http://localhost:%d", listenPort)
	log.Printf("WebSocket: ws://localhost:%d/ws", listenPort)

	if err := http.ListenAndServe(addr, nil); err != nil {
		log.Fatal(err)
	}
}
