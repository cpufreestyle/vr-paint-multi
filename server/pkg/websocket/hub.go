package websocket

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true // 允许所有 origin（生产环境应限制）
	},
}

// 消息类型
const (
 MsgTypeJoin       = "join"
 MsgTypeLeave      = "leave"
 MsgTypeStroke     = "stroke"
 MsgTypePlayerList = "player_list"
 MsgTypeError      = "error"
)

// Stroke 笔触数据
type Stroke struct {
 ID        string        `json:"id"`
 Brush     BrushInfo     `json:"brush"`
 Points    []PointInfo   `json:"points"`
 Timestamp int64         `json:"timestamp"`
}

// BrushInfo 画笔信息
type BrushInfo struct {
 Index int     `json:"index"`
 Color [3]float64 `json:"color"`
 Size  float64    `json:"size"`
}

// PointInfo 点数据
type PointInfo struct {
 Position   [3]float64 `json:"position"`
 Orientation [4]float64 `json:"orientation"`
 Pressure   float64    `json:"pressure"`
 Timestamp  int64      `json:"timestamp"`
}

// Player 玩家
type Player struct {
 ID   string `json:"id"`
 Name string `json:"name"`
}

// Message 消息结构
type Message struct {
 Type    string          `json:"type"`
 RoomID  string          `json:"room_id,omitempty"`
 Player  *Player         `json:"player,omitempty"`
 Players []*Player       `json:"players,omitempty"`
 Stroke  *Stroke         `json:"stroke,omitempty"`
 Error   string          `json:"error,omitempty"`
}

// Room 房间
type Room struct {
 ID      string
 Clients map[*Client]bool
	mu      sync.RWMutex
}

// Hub 中央管理器
type Hub struct {
	rooms    map[string]*Room
	clients  map[*Client]string // client -> roomID
	mu       sync.RWMutex
	broadcast chan *Message
	register   chan *Client
	unregister chan *Client
}

func NewHub() *Hub {
	return &Hub{
		rooms:      make(map[string]*Room),
		clients:    make(map[*Client]string),
		broadcast:  make(chan *Message, 256),
		register:   make(chan *Client),
		unregister: make(chan *Client),
	}
}

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			roomID := client.roomID
			room, ok := h.rooms[roomID]
			if !ok {
				room = &Room{ID: roomID, Clients: make(map[*Client]bool)}
				h.rooms[roomID] = room
				log.Printf("[Hub] Created room: %s", roomID)
			}
			room.mu.Lock()
			room.Clients[client] = true
			room.mu.Unlock()
			h.clients[client] = roomID
			
			// 通知房间内其他人
			msg := &Message{Type: MsgTypeJoin, Player: client.player, RoomID: roomID}
			h.broadcastToRoom(roomID, msg, client)
			
			// 发送当前房间玩家列表给新加入者
			playerList := h.getRoomPlayers(roomID)
			client.send <- &Message{Type: MsgTypePlayerList, Players: playerList, RoomID: roomID}
			
			log.Printf("[Hub] Player %s joined room %s (total: %d)", client.player.Name, roomID, len(room.Clients))
			h.mu.Unlock()

		case client := <-h.unregister:
			h.mu.Lock()
			roomID, ok := h.clients[client]
			if ok {
				room, ok := h.rooms[roomID]
				if ok {
					room.mu.Lock()
					delete(room.Clients, client)
					room.mu.Unlock()
					delete(h.clients, client)
					close(client.send)
					
					// 通知房间内其他人
					if client.player != nil {
						msg := &Message{Type: MsgTypeLeave, Player: client.player, RoomID: roomID}
						h.broadcastToRoom(roomID, msg, nil)
					}
					
					// 空房间删除
					room.mu.RLock()
					if len(room.Clients) == 0 {
						delete(h.rooms, roomID)
						log.Printf("[Hub] Deleted empty room: %s", roomID)
					}
					room.mu.RUnlock()
				}
			}
			h.mu.Unlock()

		case message := <-h.broadcast:
			if message.RoomID != "" {
				h.mu.RLock()
				_, ok := h.rooms[message.RoomID]
				h.mu.RUnlock()
				if ok {
					h.broadcastToRoom(message.RoomID, message, nil)
				}
			}
		}
	}
}

func (h *Hub) broadcastToRoom(roomID string, msg *Message, exclude *Client) {
	h.mu.RLock()
	room, ok := h.rooms[roomID]
	h.mu.RUnlock()
	if !ok {
		return
	}
	
	room.mu.RLock()
	for client := range room.Clients {
		if client != exclude {
			select {
			case client.send <- msg:
			default:
				h.unregister <- client
			}
		}
	}
	room.mu.RUnlock()
}

func (h *Hub) getRoomPlayers(roomID string) []*Player {
	players := []*Player{}
	h.mu.RLock()
	room, ok := h.rooms[roomID]
	if !ok {
		h.mu.RUnlock()
		return players
	}
	room.mu.RLock()
	for client := range room.Clients {
		if client.player != nil {
			players = append(players, client.player)
		}
	}
	room.mu.RUnlock()
	h.mu.RUnlock()
	return players
}

// Client WebSocket 客户端
type Client struct {
	hub     *Hub
	conn    *websocket.Conn
	send    chan *Message
	roomID  string
	player  *Player
}

func (c *Client) readPump() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()
	
	for {
		_, raw, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("[WebSocket] Read error: %v", err)
			}
			break
		}
		
		var msg Message
		if err := json.Unmarshal(raw, &msg); err != nil {
			log.Printf("[WebSocket] JSON parse error: %v", err)
			continue
		}
		
		c.handleMessage(&msg)
	}
}

func (c *Client) handleMessage(msg *Message) {
	switch msg.Type {
	case "stroke":
		// 广播笔触到同一房间的所有人
		c.hub.mu.RLock()
		roomID := c.roomID
		c.hub.mu.RUnlock()
		msg.RoomID = roomID
		if msg.Stroke != nil {
			msg.Stroke.Timestamp = 0 // 让前端设置
		}
		c.hub.broadcast <- msg
	}
}

func (c *Client) writePump() {
	defer c.conn.Close()
	
	for msg := range c.send {
		data, err := json.Marshal(msg)
		if err != nil {
			log.Printf("[WebSocket] Marshal error: %v", err)
			return
		}
		
		if err := c.conn.WriteMessage(websocket.TextMessage, data); err != nil {
			log.Printf("[WebSocket] Write error: %v", err)
			return
		}
	}
}

func (c *Client) sendPump() {
	for msg := range c.send {
		data, err := json.Marshal(msg)
		if err != nil {
			continue
		}
		if err := c.conn.WriteMessage(websocket.TextMessage, data); err != nil {
			return
		}
	}
}

func (h *Hub) ServeWs(w http.ResponseWriter, r *http.Request) {
	roomID := r.URL.Query().Get("room")
	if roomID == "" {
		roomID = "default"
	}
	
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[WebSocket] Upgrade error: %v", err)
		return
	}
	
	// 从 URL 获取玩家名称
	name := r.URL.Query().Get("name")
	if name == "" {
		name = "Anonymous"
	}
	
	client := &Client{
		hub:    h,
		conn:   conn,
		send:   make(chan *Message, 256),
		roomID: roomID,
		player: &Player{
			ID:   conn.RemoteAddr().String(),
			Name: name,
		},
	}
	
	h.register <- client
	
	go client.writePump()
	go client.readPump()
}
