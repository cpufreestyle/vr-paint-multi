package websocket

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
)

// ============ LRU 笔触缓存（内嵌实现） ============

// StrokeCacheData 笔触缓存数据
type StrokeCacheData struct {
	ID        string `json:"id"`
	PlayerID  string `json:"player_id"`
	Timestamp int64  `json:"timestamp"`
	Data      []byte `json:"data"`
}

// StrokeCache LRU 缓存 + 磁盘持久化
type StrokeCache struct {
	maxMemory int
	cacheDir  string
	mu        sync.RWMutex
	entries   map[string]*StrokeCacheData
	order     []string // LRU 顺序（最旧在前）
}

// NewStrokeCache 创建笔触缓存
func NewStrokeCache(maxMemory int, cacheDir string) *StrokeCache {
	os.MkdirAll(cacheDir, 0755)
	sc := &StrokeCache{
		maxMemory: maxMemory,
		cacheDir:  cacheDir,
		entries:   make(map[string]*StrokeCacheData),
		order:     make([]string, 0),
	}
	sc.loadFromDisk()
	return sc
}

// Add 添加笔触
func (sc *StrokeCache) Add(id string, data *StrokeCacheData) {
	sc.mu.Lock()
	defer sc.mu.Unlock()

	if _, exists := sc.entries[id]; exists {
		sc.entries[id] = data
		sc.moveToEnd(id)
	} else {
		sc.entries[id] = data
		sc.order = append(sc.order, id)
	}

	for len(sc.entries) > sc.maxMemory {
		oldest := sc.order[0]
		sc.writeToDisk(oldest, sc.entries[oldest])
		delete(sc.entries, oldest)
		sc.order = sc.order[1:]
	}
}

// Get 获取笔触
func (sc *StrokeCache) Get(id string) (*StrokeCacheData, bool) {
	sc.mu.Lock()
	defer sc.mu.Unlock()

	if data, exists := sc.entries[id]; exists {
		sc.moveToEnd(id)
		return data, true
	}

	if data := sc.loadOneFromDisk(id); data != nil {
		sc.entries[id] = data
		sc.order = append(sc.order, id)
		return data, true
	}

	return nil, false
}

// GetAll 获取所有笔触
func (sc *StrokeCache) GetAll() []*StrokeCacheData {
	sc.mu.RLock()
	defer sc.mu.RUnlock()

	result := make([]*StrokeCacheData, 0, len(sc.entries))
	for _, id := range sc.order {
		if data, exists := sc.entries[id]; exists {
			result = append(result, data)
		}
	}
	return result
}

// Remove 删除笔触
func (sc *StrokeCache) Remove(id string) {
	sc.mu.Lock()
	defer sc.mu.Unlock()

	delete(sc.entries, id)
	for i, oid := range sc.order {
		if oid == id {
			sc.order = append(sc.order[:i], sc.order[i+1:]...)
			break
		}
	}
	os.Remove(filepath.Join(sc.cacheDir, id+".json"))
}

// Flush 写回磁盘
func (sc *StrokeCache) Flush() {
	sc.mu.Lock()
	defer sc.mu.Unlock()

	for id, data := range sc.entries {
		sc.writeToDisk(id, data)
	}
}

// moveToEnd 移到 LRU 末尾
func (sc *StrokeCache) moveToEnd(id string) {
	for i, oid := range sc.order {
		if oid == id {
			sc.order = append(sc.order[:i], sc.order[i+1:]...)
			sc.order = append(sc.order, id)
			break
		}
	}
}

// writeToDisk 写入磁盘
func (sc *StrokeCache) writeToDisk(id string, data *StrokeCacheData) {
	jsonData, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return
	}
	os.WriteFile(filepath.Join(sc.cacheDir, id+".json"), jsonData, 0644)
}

// loadOneFromDisk 从磁盘加载单个
func (sc *StrokeCache) loadOneFromDisk(id string) *StrokeCacheData {
	jsonData, err := os.ReadFile(filepath.Join(sc.cacheDir, id+".json"))
	if err != nil {
		return nil
	}
	var data StrokeCacheData
	if err := json.Unmarshal(jsonData, &data); err != nil {
		return nil
	}
	return &data
}

// loadFromDisk 从磁盘加载所有
func (sc *StrokeCache) loadFromDisk() {
	files, err := os.ReadDir(sc.cacheDir)
	if err != nil {
		return
	}
	for _, file := range files {
		if filepath.Ext(file.Name()) != ".json" {
			continue
		}
		id := file.Name()[:len(file.Name())-5]
		if data := sc.loadOneFromDisk(id); data != nil {
			sc.entries[id] = data
			sc.order = append(sc.order, id)
		}
	}
}
