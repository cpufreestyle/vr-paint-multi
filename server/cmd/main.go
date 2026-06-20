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

	exe, _ := os.Executable()
	// exe 在 server/ 子目录，需要上两级到项目根目录
	// 例如: .../vr-paint-multi/server/vr-paint-multi.exe → .../vr-paint-multi
	projectRoot = filepath.Dir(filepath.Dir(exe))
	log.Printf("Project root: %s", projectRoot)

	port := flag.Int("port", 8081, "Server port")
	flag.Parse()

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

	http.Handle("/multiplayer/", http.StripPrefix("/multiplayer/", http.FileServer(http.Dir(filepath.Join(projectRoot, "multiplayer")))))
	http.Handle("/assets/", http.StripPrefix("/assets/", http.FileServer(http.Dir(filepath.Join(projectRoot, "assets")))))
	http.Handle("/img/", http.StripPrefix("/img/", http.FileServer(http.Dir(filepath.Join(projectRoot, "img")))))
	http.Handle("/css/", http.StripPrefix("/css/", http.FileServer(http.Dir(filepath.Join(projectRoot, "css")))))
	http.Handle("/vendor/", http.StripPrefix("/vendor/", http.FileServer(http.Dir(filepath.Join(projectRoot, "vendor")))))
	http.Handle("/sounds/", http.StripPrefix("/sounds/", http.FileServer(http.Dir(filepath.Join(projectRoot, "sounds")))))
	http.Handle("/boat-festival-game/", http.StripPrefix("/boat-festival-game/", http.FileServer(http.Dir(filepath.Join(projectRoot, "boat-festival-game")))))

	addr := fmt.Sprintf(":%d", *port)
	log.Printf("Server starting http://localhost:%d", *port)
	log.Printf("WebSocket: ws://localhost:%d/ws", *port)

	if err := http.ListenAndServe(addr, nil); err != nil {
		log.Fatal(err)
	}
}
