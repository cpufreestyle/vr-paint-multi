# VR Paint Multiplayer - 多人在线 VR 绘画

基于 [a-painter](https://github.com/aframevr/a-painter) 的多人在线绘画系统。

## 🎯 功能特性

- ✅ **实时同步** - 笔触实时同步到同一房间的所有玩家
- ✅ **房间管理** - 支持创建/加入房间
- ✅ **多人协作** - 最多支持多人同时绘画
- ✅ **WebSocket 通信** - 低延迟实时通信
- ✅ **桌面 + VR** - 支持桌面浏览器和 VR 设备

## 🏗️ 架构

```
┌─────────────────┐     WebSocket      ┌─────────────────┐
│   Browser 1     │◄──────────────────►│                 │
│  (VR Paint)     │                   │  Go WebSocket   │
├─────────────────┤     WebSocket      │    Server       │
│   Browser 2     │◄──────────────────►│   (端口 8081)   │
│  (VR Paint)     │                   │                 │
└─────────────────┘                   └────────┬────────┘
                                               │
                          ┌────────────────────┴────────────────────┐
                          │                                         │
                    ┌─────▼─────┐                             ┌─────▼─────┐
                    │  Browser  │                             │  Browser  │
                    │     3     │                             │     N     │
                    └───────────┘                             └───────────┘
```

## 🚀 快速开始

### 1. 启动服务器

```bash
# Windows
server\vr-paint-multi.exe

# 或编译后运行
cd server
go run cmd/main.go
```

### 2. 访问多人绘画

```
http://localhost:8081/multiplayer.html
```

或者直接在浏览器中访问 `http://localhost:8081`

### 3. 开始绘画

1. 输入你的名字
2. 输入房间号（或留空自动生成）
3. 点击「加入绘画」
4. 分享链接给朋友一起绘画！

## 📡 API

### WebSocket 连接

```
ws://localhost:8081/ws?room=房间号&name=你的名字
```

### 消息格式

**加入房间**
```json
{
  "type": "player_list",
  "players": [{"id": "...", "name": "Player1"}],
  "room_id": "room-abc123"
}
```

**笔触同步**
```json
{
  "type": "stroke",
  "room_id": "room-abc123",
  "stroke": {
    "id": "abc123",
    "brush": {
      "index": 0,
      "color": [1.0, 0.2, 0.5],
      "size": 0.01
    },
    "points": [
      {
        "position": [0.1, 0.2, -0.5],
        "orientation": [0, 0, 0, 1],
        "pressure": 0.8,
        "timestamp": 1716634800000
      }
    ],
    "timestamp": 1716634800000
  }
}
```

## 🛠️ 技术栈

- **后端**: Go + gorilla/websocket
- **前端**: A-Frame + Three.js + JavaScript
- **通信**: WebSocket (JSON)

## 📝 开发

### 构建服务器

```bash
cd server
go build -o vr-paint-multi.exe cmd/main.go
```

### 前端调试

直接修改 `multiplayer/multiplayer-client.js`，刷新页面即可。

## 🎮 使用说明

### 桌面模式
- 鼠标左键 + 拖拽：绘画
- 滚轮：缩放
- 右键 + 拖拽：旋转视角

### VR 模式
- VR 手柄触发：绘画
- 手柄摇杆：切换画笔
- 菜单按钮：打开画笔菜单

## 📄 许可证

MIT License - 继承自 [a-painter](https://github.com/aframevr/a-painter)

## 🙏 致谢

- [A-Frame](https://aframe.io/) - WebVR 框架
- [a-painter](https://github.com/aframevr/a-painter) - 原始 VR 绘画项目
