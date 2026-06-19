# 龙舟盛景 · 端午竞渡 VR / VR Paint Multiplayer

> **v2.2.0** · [GitHub](https://github.com/cpufreestyle/vr-paint-multi) · [Gitee](https://gitee.com/cpufreestyle/vr-paint-multi)

一个基于 Web 的端午主题 3D 体验平台，包含龙舟竞速游戏和 VR 绘画两个模块。

---

## 🎮 功能模块

### 🛶 龙舟盛景端午竞渡（首页 / 龙舟竞速）

**访问地址：** `http://localhost:8081/`

龙舟主题 3D 游戏，包含三种模式：

| 模式 | 说明 |
|------|------|
| 🎌 **自由观赏** | 漫游视角，观察龙舟巡游，可自由绘画 |
| 🚣 **龙舟竞速** | 第一/第三人称操控龙舟，鼓点节奏划桨 |
| 🎨 **空间绘画** | 在 3D 空间中自由涂鸦，16 种画笔 + AI 辅助 |

**画笔类型：** 马克笔 / 喷枪 / 火焰 / 烟花 / 激光 / 霓虹 / 泡沫 / 毛笔 / 方形 / 爆炸 / 泡泡 / 星星 / 雪人 / 闪电 / 拖尾 / 雪

**操作方式：**
- `鼠标左键 + 拖拽` — 绘画 / 划桨（竞速模式）
- `鼠标右键 + 拖拽` — 旋转视角
- `滚轮` — 缩放
- `[` / `]` — 调整笔触粗细
- `1-6` — 快速切换画笔类型
- `空格` — 切换绘画/观赏模式
- `Tab` — 切换至竞速模式（观赏模式时）

**内置功能：**
- 🌊 动态水面 + 雾效
- 🥁 背景音效（河流、鼓点、长笛）—— 点击右上角"音效"按钮开启
- ✨ 压力模拟（快画细、慢画粗）
- 🤖 AI 辅助作画（见下文）

---

### ✨ AI 涂鸦

在绘画模式下，点击工具栏 **"✨ AI 涂鸦"** 按钮，输入关键词即可生成 3D 涂鸦图案。

**支持图案（15+ 种）：**
花、树、生日蛋糕、星形、心形、龙、彩虹、海浪、高山、白云、太阳、月亮、烟花、鱼、鸟、拱桥、灯笼

**使用方式：**
1. 进入绘画模式（按空格切换）
2. 点击 "✨ AI 涂鸦" 按钮
3. 输入关键词，选择数量（×1 / ×3 / ×5）
4. 点击"生成"，AI 涂鸦将出现在场景中
5. 可 Ctrl+Z 撤销

纯客户端实现，无需 API Key，基于数学几何算法生成。

---

### 🌐 多人在线绘画（legacy multiplayer）

**访问地址：** `http://localhost:8081/multiplayer.html`

| 功能 | 说明 |
|------|------|
| 房间管理 | 创建/加入房间，分享链接即可协作 |
| 实时同步 | 笔触通过 WebSocket 低延迟同步 |
| 桌面 + VR | 支持浏览器和 VR 设备 |

---

## 🚀 快速开始

### 启动服务器

```bash
# Windows（预编译二进制）
server\cmd\vr-paint-multi-latest.exe

# 或用 Go 编译运行
cd server
go run cmd/main.go
```

服务器启动后访问：
- 龙舟游戏/绘画：`http://localhost:8081/`
- 多人绘画：`http://localhost:8081/multiplayer.html`

### 编译服务器

```bash
cd server/cmd
go build -o vr-paint-multi-latest.exe main.go
```

**Go 版本要求：** ≥ 1.21

### 编译前端（可选）

如需从源码构建 Three.js bundle：

```bash
cd frontend
npm install
npm run build
```

---

## 📁 项目结构

```
vr-paint-multi/
├── index.html              # 龙舟游戏 + 绘画首页
├── multi.html              # 龙舟游戏入口（含端午主题）
├── server/
│   └── cmd/
│       └── main.go         # Go WebSocket 服务器 (端口 8081)
├── js/
│   ├── paint.js            # 绘画核心引擎
│   ├── ai-paint.js         # AI 涂鸦生成器
│   ├── engine.js            # 游戏主循环 + 音效
│   ├── boats.js            # 龙舟物理与动画
│   └── ...
└── assets/
    ├── images/             # UI 图片资源
    └── models/             # 3D 模型（船、桨等）
```

---

## 🕹️ 龙舟竞速操作指南

### 自由观赏模式
- WASD / 方向键：移动
- 鼠标左键：选中龙舟后进入第三人称
- Q / E：上下高度调整
- 空格：进入绘画模式

### 龙舟竞速模式
- W / ↑：全力划桨
- A / ←：左转
- D / →：右转
- S / ↓：减速/后退
- 空格：暂停/恢复龙舟

---

## 🛠️ 技术栈

| 层级 | 技术 |
|------|------|
| 3D 引擎 | Three.js r128 + A-Frame 1.5.0 |
| 游戏逻辑 | 原生 JavaScript |
| 服务端 | Go + gorilla/websocket |
| 通信协议 | WebSocket (JSON) |
| 音效 | Web Audio API（纯合成，无外部音频文件）|

---

## 📝 更新日志

### v2.2.0 (2026-06-19)
- ✨ **新增 AI 涂鸦功能** — 关键词生成 3D 涂鸦，15+ 内置图案，纯客户端
- 🎨 PaintInternals API — paint.js 暴露内部构建函数供 AI 模块调用
- 🥁 背景音效系统 — 河流、水花、鼓点、长笛（Web Audio API 合成）
- 🚣 龙舟动画完善 — 速度波动、划手节奏感
- ⌨️ 键盘快捷键 — [ / ] 调粗细、1-6 切画笔、空格切换模式
- ✏️ 笔触粗细优化 — 初始值 10→20，更粗的视觉反馈

### v2.1.0 (2026-06-19)
- 🛶 龙舟盛景端午竞渡游戏上线
- 🌊 动态水面 + 雾效
- 🎌 三模式切换（观赏/竞速/绘画）
- 🔧 服务端路由重构，支持多静态子目录

---

## 🙏 致谢

- [A-Frame](https://aframe.io/) — WebVR 框架
- [Three.js](https://threejs.org/) — 3D 渲染引擎
- [a-painter](https://github.com/aframevr/a-painter) — 原始 VR 绘画项目灵感

---

## 📄 许可证

MIT License
