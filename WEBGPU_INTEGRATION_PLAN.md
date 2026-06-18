# WebGPU 集成方案 - VR Paint Multiplayer v2.0

## 现状

- **渲染引擎**：A-Painter (Three.js / WebGL)
- **多人同步**：WebSocket 服务器 (Go) + multiplayer-client.js
- **画笔系统**：AFRAME.registerBrush，BufferGeometry 渲染
- **网络端口**：http://localhost:8081 | ws://localhost:8081/ws

## 三层集成路线

### 方案 A：WebGPU 叠加层（推荐起步）
- 新增 `<canvas id="webgpu-overlay">` 叠加在 WebGL 画布上
- `z-index` 更高，`pointer-events: none`（不阻挡 VR 输入）
- **GPU 辉光/后处理**：读取 WebGL Canvas → Texture → WebGPU Compute + Render
- **GPU 粒子效果**：彩虹笔刷、火花、星光等粒子用 WebGPU Compute Shader 模拟
- 改动量最小，不破坏现有功能

### 方案 B：GPU 画笔渲染（中期）
- WebGPU Compute Shader 生成笔触顶点数据
- WebGPU Render Pipeline 替代 Three.js BufferGeometry 渲染
- 多人同步逻辑不变（仍然是 stroke points 传输）
- 预计性能提升 3-5x（复杂笔刷场景）

### 方案 C：全量 WebGPU 替换（长期）
- 替换 Three.js 为原生 WebGPU Renderer
- 需要重写 VR 控制器输入、相机系统
- 工作量大，破坏性高
- 建议最后阶段考虑

## 推荐实施顺序

```
Phase 1 (A): WebGPU 叠加层 + 辉光后处理
Phase 2 (A): GPU 粒子系统 (彩虹笔刷等)
Phase 3 (B): WebGPU 笔触渲染
Phase 4 (C): VR 控制器 WebGPU 射线检测（可选）
```

## 技术约束

- WebGPU 兼容性：Chrome/Edge 113+，Safari 17+（不支持 Firefox）
- 需要 `navigator.gpu` API 检测
- 回退策略：WebGPU 不可用时回退到纯 WebGL
- VR 模式：WebXR WebGPU 支持仍在 draft，保持 WebGL VR 路径

## 文件清单

新增：
- `multiplayer/webgpu-renderer.js` — WebGPU 渲染器（Phase 1-2）
- `multiplayer/webgpu-particles.js` — GPU 粒子系统（Phase 2）
- `multiplayer/webgpu-postprocess.js` — 后处理管线（Phase 1）
- `shaders/glow.wgsl` — 辉光 Compute Shader
- `shaders/particles.wgsl` — 粒子 Compute Shader

修改：
- `multi.html` — 添加 WebGPU canvas 叠加层
- `multiplayer-integration.js` — 注册 WebGPU 笔触回调
