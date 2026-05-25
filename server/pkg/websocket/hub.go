package websocket

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

// 消息类型
const (
	MsgTypeJoin       = "join"
	MsgTypeLeave      = "leave"
	MsgTypeStroke     = "stroke"
	MsgTypeStrokeDelta = "stroke_delta" // 差分笔触（只含新点）
	MsgTypePlayerList = "player_list"
	MsgTypeError      = "error"
	MsgTypeSync       = "sync"      // 全量同步请求
	MsgTypeSyncResp   = "sync_resp" // 全量同步响应
	MsgTypeAck        = "ack"       // 确认收到
	MsgTypePing       = "ping"
	MsgTypePong       = "pong"
	MsgTypeUndo       = "undo"
	MsgTypeClear      = "clear"
	MsgTypeCursor     = "cursor" // 玩家光标位置
)

// ============ 版本向量（用于冲突检测）============

// VectorClock 版本向量
type VectorClock map[string]int64

// Stroke 笔触数据
type Stroke struct {
	ID            string      `json:"id"`
	Brush         BrushInfo   `json:"brush"`
	Points        []PointInfo `json:"points"`
	Timestamp     int64       `json:"timestamp"`
	VectorClock   VectorClock `json:"vc,omitempty"` // 发起者的版本向量
	PrevStrokeID  string      `json:"prev_stroke_id,omitempty"` // 关联的上一个笔触（用于撤销）
}

// StrokeDelta 差分笔触（只含增量点）
type StrokeDelta struct {
	StrokeID string      `json:"stroke_id"`
	NewPoints []PointInfo `json:"new_points"` // 新增的点
	Timestamp int64       `json:"timestamp"`
	TotalPoints int       `json:"total_points"` // 当前总点数
	VectorClock VectorClock `json:"vc,omitempty"`
}

// BrushInfo 画笔信息
type BrushInfo struct {
	Index int       `json:"index"`
	Color [3]float64 `json:"color"`
	Size  float64   `json:"size"`
}

// PointInfo 点数据
type PointInfo struct {
	Position    [3]float64 `json:"position"`
	Orientation [4]float64 `json:"orientation"`
	Pressure    float64    `json:"pressure"`
	Timestamp   int64      `json:"timestamp"`
}

// Player 玩家
type Player struct {
	ID         string      `json:"id"`
	Name       string      `json:"name"`
	CursorPos  [3]float64 `json:"cursor_pos,omitempty"` // 光标3D位置
	Color      string      `json:"color,omitempty"`      // 玩家颜色
	LastActive int64       `json:"last_active"`
}

// RoomStroke 房间内的笔触记录（用于同步/回放）
type RoomStroke struct {
	Stroke   *Stroke
	PlayerID string
}

// Message 消息结构
type Message struct {
	Type         string          `json:"type"`
	RoomID       string          `json:"room_id,omitempty"`
	Player       *Player         `json:"player,omitempty"`
	Players      []*Player       `json:"players,omitempty"`
	Stroke       *Stroke         `json:"stroke,omitempty"`
	StrokeDelta  *StrokeDelta    `json:"stroke_delta,omitempty"`
	UndoID      string          `json:"undo_id,omitempty"`
	Error        string          `json:"error,omitempty"`
	ClientClock  VectorClock     `json:"client_clock,omitempty"`
	ServerClock  VectorClock     `json:"server_clock,omitempty"`
	Strokes      []*Stroke       `json:"strokes,omitempty"` // 用于全量同步
	CursorPos    [3]float64      `json:"cursor_pos,omitempty"`
}

// Room 房间
type Room struct {
	ID           string
	Clients      map[*Client]bool
	Strokes      []*Stroke      // 房间内所有笔触（按时间顺序）
	UndoStack    map[string]*Stroke // strokeID -> stroke（用于撤销）
	ServerClock  VectorClock    // 服务端版本向量
	mu           sync.RWMutex
	lastActivity time.Time
}

// Client WebSocket 客户端
type Client struct {
	hub         *Hub
	conn        *websocket.Conn
	send        chan []byte
	roomID      string
	player      *Player
	clientClock VectorClock     // 客户端版本向量
	pendingAcks map[int64]bool  // 待确认的消息ID
	mu          sync.Mutex
}

// Hub 中央管理器
type Hub struct {
	rooms      map[string]*Room
	clients    map[*Client]string
	mu         sync.RWMutex
	broadcast  chan []byte
	register   chan *Client
	unregister chan *Client
	msgID      int64
}

func NewHub() *Hub {
	h := &Hub{
		rooms:      make(map[string]*Room),
		clients:    make(map[*Client]string),
		broadcast:  make(chan []byte, 512),
		register:   make(chan *Client),
		unregister: make(chan *Client),
	}
	
	// 启动房间清理（删除空房间）
	go h.cleanupRooms()
	
	// 启动版本向量同步
	go h.syncClocks()
	
	return h
}

// 定期清理空房间
func (h *Hub) cleanupRooms() {
	ticker := time.NewTicker(5 * time.Minute)
	for range ticker.C {
		h.mu.Lock()
		for roomID, room := range h.rooms {
			room.mu.Lock()
			if len(room.Clients) == 0 && time.Since(room.lastActivity) > 30*time.Minute {
				delete(h.rooms, roomID)
				log.Printf("[Hub] Cleaned up inactive room: %s", roomID)
			}
			room.mu.Unlock()
		}
		h.mu.Unlock()
	}
}

// 定期广播服务端时钟（帮助客户端同步）
func (h *Hub) syncClocks() {
	ticker := time.NewTicker(10 * time.Second)
	for range ticker.C {
		h.mu.RLock()
		for roomID, room := range h.rooms {
			room.mu.RLock()
			if len(room.Clients) > 0 {
				msg := Message{
					Type:        MsgTypeSyncResp,
					RoomID:      roomID,
					ServerClock: room.ServerClock,
				}
				data, _ := json.Marshal(msg)
				room.mu.RLock()
				for client := range room.Clients {
					select {
					case client.send <- data:
					default:
					}
				}
			}
			room.mu.RUnlock()
		}
		h.mu.RUnlock()
	}
}

func (h *Hub) nextMsgID() int64 {
	h.mu.Lock()
	h.msgID++
	id := h.msgID
	h.mu.Unlock()
	return id
}

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			roomID := client.roomID
			room, ok := h.rooms[roomID]
			if !ok {
				room = &Room{
					ID:           roomID,
					Clients:      make(map[*Client]bool),
					UndoStack:    make(map[string]*Stroke),
					ServerClock:  make(VectorClock),
					lastActivity: time.Now(),
				}
				h.rooms[roomID] = room
				log.Printf("[Hub] Created room: %s", roomID)
			}
			room.mu.Lock()
			room.Clients[client] = true
			room.lastActivity = time.Now()
			room.mu.Unlock()
			h.clients[client] = roomID
			
			// 生成玩家颜色
			colors := []string{"#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7", "#DDA0DD", "#98D8C8", "#F7DC6F"}
			room.mu.RLock()
			color := colors[len(room.Clients)%len(colors)]
			room.mu.RUnlock()
			client.player.Color = color
			client.player.LastActive = time.Now().UnixMilli()
			
			// 发送当前房间玩家列表 + 历史笔触给新加入者
			playerList := h.getRoomPlayers(roomID)
			room.mu.RLock()
			syncMsg := Message{
				Type:    MsgTypeSyncResp,
				Players: playerList,
				Strokes: room.Strokes,
				ServerClock: room.ServerClock,
			}
			room.mu.RUnlock()
			
			syncData, _ := json.Marshal(syncMsg)
			select {
			case client.send <- syncData:
			default:
			}
			
			// 通知其他人
			joinMsg, _ := json.Marshal(Message{Type: MsgTypeJoin, Player: client.player, RoomID: roomID})
			h.broadcastToRoomBytes(roomID, joinMsg, client)
			
			log.Printf("[Hub] Player %s joined room %s", client.player.Name, roomID)
			h.mu.Unlock()

		case client := <-h.unregister:
			h.mu.Lock()
			roomID, ok := h.clients[client]
			if ok {
				room, ok := h.rooms[roomID]
				if ok {
					room.mu.Lock()
					delete(room.Clients, client)
					room.lastActivity = time.Now()
					room.mu.Unlock()
					delete(h.clients, client)
					close(client.send)
					
					// 通知其他人
					if client.player != nil {
						leaveMsg, _ := json.Marshal(Message{Type: MsgTypeLeave, Player: client.player, RoomID: roomID})
						h.broadcastToRoomBytes(roomID, leaveMsg, nil)
					}
					
					log.Printf("[Hub] Player %s left room %s", client.player.Name, roomID)
				}
			}
			h.mu.Unlock()
		}
	}
}

func (h *Hub) broadcastToRoomBytes(roomID string, data []byte, exclude *Client) {
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
			case client.send <- data:
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

// ============ 冲突检测与合并 ============

// HappensBefore 检查版本向量 vc 是否 happen-before other
func (vc VectorClock) HappensBefore(other VectorClock) bool {
	someLess := false
	for k, v1 := range vc {
		v2, exists := other[k]
		if !exists {
			continue
		}
		if v1 > v2 {
			return false
		}
		if v1 < v2 {
			someLess = true
		}
	}
	for k, v2 := range other {
		v1 := vc[k]
		if v1 > v2 {
			return false
		}
		if v1 < v2 {
			someLess = true
		}
	}
	return someLess
}

// MergeClocks 合并两个版本向量
func MergeClocks(vc1, vc2 VectorClock) VectorClock {
	result := make(VectorClock)
	for k, v := range vc1 {
		result[k] = v
	}
	for k, v := range vc2 {
		if result[k] < v {
			result[k] = v
		}
	}
	return result
}

// ============ Client ============

func (c *Client) readPump() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()
	
	c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})
	
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
	case MsgTypeStroke:
		c.handleStroke(msg)
	case MsgTypeStrokeDelta:
		c.handleStrokeDelta(msg)
	case MsgTypeSync:
		c.handleSync(msg)
	case MsgTypePing:
		c.sendpong()
	case MsgTypeUndo:
		c.handleUndo(msg)
	case MsgTypeClear:
		c.handleClear(msg)
	case MsgTypeCursor:
		c.handleCursor(msg)
	case MsgTypeAck:
		// 确认消息
	}
}

func (c *Client) handleStroke(msg *Message) {
	h := c.hub
	h.mu.RLock()
	roomID := c.roomID
	room, ok := h.rooms[roomID]
	h.mu.RUnlock()
	
	if !ok || msg.Stroke == nil {
		return
	}
	
	// 1. 更新服务端版本向量
	playerID := c.player.ID
	room.mu.Lock()
	room.ServerClock[playerID]++
	currentVC := room.ServerClock[playerID]
	msg.Stroke.VectorClock = VectorClock{playerID: currentVC}
	
	// 2. 生成笔触 ID（如果没有）
	if msg.Stroke.ID == "" {
		msg.Stroke.ID = generateStrokeID()
	}
	
	// 3. 记录笔触（用于同步给新加入者）
	room.Strokes = append(room.Strokes, msg.Stroke)
	if len(room.Strokes) > 1000 {
		room.Strokes = room.Strokes[len(room.Strokes)-1000:]
	}
	room.UndoStack[msg.Stroke.ID] = msg.Stroke
	room.lastActivity = time.Now()
	room.mu.Unlock()
	
	// 4. 广播给房间内其他人
	msg.RoomID = roomID
	broadcastData, _ := json.Marshal(msg)
	h.broadcastToRoomBytes(roomID, broadcastData, c)
	
	// 5. 发送确认给发送者
	ack := Message{Type: MsgTypeAck, Stroke: &Stroke{ID: msg.Stroke.ID}, ServerClock: room.ServerClock}
	ackData, _ := json.Marshal(ack)
	select {
	case c.send <- ackData:
	default:
	}
	
	log.Printf("[Hub] Stroke %s from %s (%d points)", msg.Stroke.ID, c.player.Name, len(msg.Stroke.Points))
}

func (c *Client) handleStrokeDelta(msg *Message) {
	// 差分笔触处理（只传新点，减少带宽）
	h := c.hub
	h.mu.RLock()
	roomID := c.roomID
	room, ok := h.rooms[roomID]
	h.mu.RUnlock()
	
	if !ok || msg.StrokeDelta == nil {
		return
	}
	
	playerID := c.player.ID
	room.mu.Lock()
	room.ServerClock[playerID]++
	msg.StrokeDelta.VectorClock = VectorClock{playerID: room.ServerClock[playerID]}
	room.lastActivity = time.Now()
	room.mu.Unlock()
	
	msg.RoomID = roomID
	msg.Type = MsgTypeStrokeDelta
	broadcastData, _ := json.Marshal(msg)
	h.broadcastToRoomBytes(roomID, broadcastData, c)
}

func (c *Client) handleSync(msg *Message) {
	h := c.hub
	h.mu.RLock()
	roomID := c.roomID
	room, ok := h.rooms[roomID]
	h.mu.RUnlock()
	
	if !ok {
		return
	}
	
	room.mu.RLock()
	syncMsg := Message{
		Type:        MsgTypeSyncResp,
		Players:     h.getRoomPlayers(roomID),
		Strokes:     room.Strokes,
		ServerClock: room.ServerClock,
	}
	room.mu.RUnlock()
	
	syncData, _ := json.Marshal(syncMsg)
	select {
	case c.send <- syncData:
	default:
	}
}

func (c *Client) handleUndo(msg *Message) {
	if msg.UndoID == "" {
		return
	}
	
	h := c.hub
	h.mu.RLock()
	room, ok := h.rooms[c.roomID]
	h.mu.RUnlock()
	
	if !ok {
		return
	}
	
	room.mu.Lock()
	delete(room.UndoStack, msg.UndoID)
	// 通知其他人撤销
	undoMsg, _ := json.Marshal(Message{
		Type:    MsgTypeUndo,
		UndoID:  msg.UndoID,
		RoomID:  c.roomID,
		Player:  c.player,
	})
	room.mu.Unlock()
	
	h.broadcastToRoomBytes(c.roomID, undoMsg, nil)
}

func (c *Client) handleClear(msg *Message) {
	h := c.hub
	h.mu.RLock()
	room, ok := h.rooms[c.roomID]
	h.mu.RUnlock()
	
	if !ok {
		return
	}
	
	room.mu.Lock()
	room.Strokes = nil
	room.UndoStack = make(map[string]*Stroke)
	room.mu.Unlock()
	
	clearMsg, _ := json.Marshal(Message{Type: MsgTypeClear, RoomID: c.roomID, Player: c.player})
	h.broadcastToRoomBytes(c.roomID, clearMsg, nil)
}

func (c *Client) handleCursor(msg *Message) {
	c.player.CursorPos = msg.CursorPos
	c.player.LastActive = time.Now().UnixMilli()
	
	cursorMsg, _ := json.Marshal(Message{
		Type:     MsgTypeCursor,
		RoomID:   c.roomID,
		Player:   c.player,
		CursorPos: msg.CursorPos,
	})
	c.hub.broadcastToRoomBytes(c.roomID, cursorMsg, c)
}

func (c *Client) sendpong() {
	pongMsg, _ := json.Marshal(Message{Type: MsgTypePong})
	select {
	case c.send <- pongMsg:
	default:
	}
}

func (c *Client) writePump() {
	ticker := time.NewTicker(30 * time.Second)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()
	
	for {
		select {
		case data, _ := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.conn.WriteMessage(websocket.TextMessage, data); err != nil {
				return
			}
		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// ============ 服务器入口 ============

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
	
	name := r.URL.Query().Get("name")
	if name == "" {
		name = "Anonymous"
	}
	
	clientID := r.URL.Query().Get("client_id")
	if clientID == "" {
		clientID = conn.RemoteAddr().String()
	}
	
	client := &Client{
		hub:          h,
		conn:         conn,
		send:         make(chan []byte, 256),
		roomID:       roomID,
		player:       &Player{ID: clientID, Name: name, LastActive: time.Now().UnixMilli()},
		clientClock:  make(VectorClock),
		pendingAcks:  make(map[int64]bool),
	}
	
	h.register <- client
	
	go client.writePump()
	go client.readPump()
}

// ============ 工具函数 ============

func generateStrokeID() string {
	return time.Now().Format("20060102150405") + "-" + randomString(8)
}

func randomString(n int) string {
	const letters = "abcdefghijklmnopqrstuvwxyz0123456789"
	b := make([]byte, n)
	for i := range b {
		b[i] = letters[time.Now().UnixNano()%int64(len(letters))]
		time.Sleep(time.Nanosecond)
	}
	return string(b)
}
