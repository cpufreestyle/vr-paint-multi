/**
 * WebGPU Renderer for VR Paint Multiplayer
 * Phase 1: Canvas overlay + bloom/glow post-processing
 * 
 * 使用方式：
 *   const wgpu = await WebGPURenderer.init();
 *   wgpu.render(); // 每帧调用（requestAnimationFrame）
 */

;(async function() {
'use strict';

const WebGPURenderer = window.WebGPURenderer = {
    
    // ═══════════════════════════════════════════════════
    //  状态
    // ═══════════════════════════════════════════════════
    enabled: false,
    adapter: null,
    device: null,
    context: null,
    canvas: null,
    glCanvas: null,       // WebGL 源画布
    format: null,
    bloomPipeline: null,
    compositePipeline: null,
    blitPipeline: null,
    particles: [],        // 粒子数组
    particlePipeline: null,
    particleBindGroups: [],
    bloomTextures: {},
    time: 0,
    lastTime: 0,
    
    // ═══════════════════════════════════════════════════
    //  初始化
    // ═══════════════════════════════════════════════════
    async init() {
        if (typeof navigator === 'undefined' || !navigator.gpu) {
            console.warn('[WebGPU] 不支持 WebGPU，跳过初始化');
            return this;
        }
        
        try {
            console.log('[WebGPU] 初始化中...');
            
            // 1. 请求 Adapter
            this.adapter = await navigator.gpu.requestAdapter({
                powerPreference: 'high-performance'
            });
            if (!this.adapter) {
                console.warn('[WebGPU] 无法获取 GPU Adapter');
                return this;
            }
            
            // 2. 请求 Device
            this.device = await this.adapter.requestDevice({
                requiredLimits: {
                    maxStorageBufferBindingSize: this.adapter.limits.maxStorageBufferBindingSize
                }
            });
            
            // 捕获设备丢失事件
            this.device.lost.then((info) => {
                console.error('[WebGPU] 设备丢失:', info.message);
                this.enabled = false;
            });
            
            // 3. 查找 WebGL 源画布
            this.glCanvas = document.querySelector('a-scene canvas') || 
                            document.querySelector('canvas:last-of-type');
            if (!this.glCanvas) {
                console.warn('[WebGPU] 未找到 WebGL 画布');
                return this;
            }
            
            // 4. 创建 WebGPU Canvas 叠加层
            this.canvas = document.createElement('canvas');
            this.canvas.id = 'webgpu-overlay';
            this.canvas.style.cssText = `
                position: fixed;
                top: 0; left: 0;
                width: 100%; height: 100%;
                pointer-events: none;
                z-index: 9999;
                mix-blend-mode: screen;
                opacity: 0.9;
            `;
            document.body.appendChild(this.canvas);
            
            // 同步画布尺寸
            this._resize();
            window.addEventListener('resize', () => this._resize());
            
            // 5. 获取 WebGPU Context
            this.context = this.canvas.getContext('webgpu');
            this.format = navigator.gpu.getPreferredCanvasFormat();
            this.context.configure({
                device: this.device,
                format: this.format,
                alphaMode: 'premultiplied'
            });
            
            // 6. 编译 Shader + 创建 Pipeline
            await this._buildPipelines();
            
            // 7. 创建粒子缓冲
            this._initParticles();
            
            this.enabled = true;
            console.log('[WebGPU] ✅ 初始化完成！', this.canvas.width + 'x' + this.canvas.height);
            console.log('[WebGPU]   Adapter:', await this.adapter.requestAdapterInfo().then(i => i.vendor + ' ' + i.architecture));
            
            return this;
            
        } catch (err) {
            console.error('[WebGPU] 初始化失败:', err);
            return this;
        }
    },
    
    // ═══════════════════════════════════════════════════
    //  尺寸同步
    // ═══════════════════════════════════════════════════
    _resize() {
        if (!this.canvas) return;
        const w = window.innerWidth;
        const h = window.innerHeight;
        this.canvas.width = w;
        this.canvas.height = h;
        
        // 重建 bloom textures（尺寸改变时）
        if (this.enabled) {
            this._createBloomTextures();
        }
    },
    
    // ═══════════════════════════════════════════════════
    //  创建 Bloom 渲染目标纹理
    // ═══════════════════════════════════════════════════
    _createBloomTextures() {
        const w = this.canvas.width;
        const h = this.canvas.height;
        
        const levels = [0, 1, 2]; // 全分辨率、1/2、1/4
        const sizes = [
            { w: w, h: h },
            { w: Math.floor(w / 2), h: Math.floor(h / 2) },
            { w: Math.floor(w / 4), h: Math.floor(h / 4) }
        ];
        
        levels.forEach((level, i) => {
            const size = sizes[i];
            this.bloomTextures[level] = {
                texture: this.device.createTexture({
                    size: [size.w, size.h],
                    format: this.format,
                    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
                }),
                view: null
            };
            this.bloomTextures[level].view = this.bloomTextures[level].texture.createView();
        });
    },
    
    // ═══════════════════════════════════════════════════
    //  构建渲染管线（Shader 编译 + Pipeline 创建）
    // ═══════════════════════════════════════════════════
    async _buildPipelines() {
        
        // ─── Bloom Extract Shader (提取亮部) ───
        const bloomExtractWGPU = `
            @group(0) @binding(0) var inputTexture: texture_2d<f32>;
            @group(0) @binding(1) var inputSampler: sampler;
            
            struct Uniforms {
                threshold: f32,
                intensity: f32,
                padding: vec2<f32>,
            };
            @group(0) @binding(2) var<uniform> uniforms: Uniforms;
            
            @fragment
            fn main(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
                let texSize = vec2<f32>(textureDimensions(inputTexture));
                let texUV = vec2<f32>(uv.x, 1.0 - uv.y);
                let texel = textureSample(inputTexture, inputSampler, texUV).rgb;
                
                let brightness = dot(texel, vec3<f32>(0.2126, 0.7152, 0.0722));
                let softness = smoothstep(uniforms.threshold - 0.05, uniforms.threshold + 0.1, brightness);
                let extracted = texel * softness * uniforms.intensity;
                
                return vec4<f32>(extracted, 1.0);
            }
        `;
        
        // ─── Gaussian Blur Shader (高斯模糊) ───
        const blur9Shader = `
            @group(0) @binding(0) var inputTexture: texture_2d<f32>;
            @group(0) @binding(1) var inputSampler: sampler;
            
            struct Uniforms {
                direction: vec2<f32>,
                intensity: f32,
                padding: f32,
            };
            @group(0) @binding(2) var<uniform> uniforms: Uniforms;
            
            // 9-tap Gaussian weights
            const weights = array<f32, 5>(0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216);
            
            @fragment
            fn main(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
                let texSize = vec2<f32>(textureDimensions(inputTexture));
                let texelSize = 1.0 / texSize;
                let texUV = vec2<f32>(uv.x, 1.0 - uv.y);
                
                var result = textureSample(inputTexture, inputSampler, texUV).rgb * weights[0];
                
                for (var i = 1; i < 5; i++) {
                    let offset = uniforms.direction * texelSize * f32(i) * 2.0;
                    result += textureSample(inputTexture, inputSampler, texUV + offset).rgb * weights[i];
                    result += textureSample(inputTexture, inputSampler, texUV - offset).rgb * weights[i];
                }
                
                return vec4<f32>(result * uniforms.intensity, 1.0);
            }
        `;
        
        // ─── Composite Shader (合成) ───
        const compositeShader = `
            @group(0) @binding(0) var sceneTexture: texture_2d<f32>;
            @group(0) @binding(1) var sceneSampler: sampler;
            @group(0) @binding(2) var bloomTexture: texture_2d<f32>;
            @group(0) @binding(3) var bloomSampler: sampler;
            
            struct Uniforms {
                bloomStrength: f32,
                particleBrightness: f32,
                padding: vec2<f32>,
            };
            @group(0) @binding(4) var<uniform> uniforms: Uniforms;
            
            @fragment
            fn main(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
                let texUV = vec2<f32>(uv.x, 1.0 - uv.y);
                
                let scene = textureSample(sceneTexture, sceneSampler, texUV).rgb;
                let bloom = textureSample(bloomTexture, bloomSampler, texUV).rgb;
                
                // Additive bloom
                let final = scene + bloom * uniforms.bloomStrength;
                
                return vec4<f32>(final, 0.15);
            }
        `;
        
        // ─── 全屏 Blit Shader ───
        const blitShader = `
            @vertex
            fn main(@builtin(vertex_index) idx: u32) -> @builtin(position) vec4<f32> {
                // Full-screen triangle (no VBO needed)
                let coords = array<vec2<f32>, 3>(
                    vec2<f32>(-1.0, -1.0),
                    vec2<f32>( 3.0, -1.0),
                    vec2<f32>(-1.0,  3.0)
                );
                return vec4<f32>(coords[idx], 0.0, 1.0);
            }
            
            @group(0) @binding(0) var inputTexture: texture_2d<f32>;
            @group(0) @binding(1) var inputSampler: sampler;
            
            @fragment
            fn fmain(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
                let texUV = vec2<f32>(uv.x, 1.0 - uv.y);
                return vec4<f32>(textureSample(inputTexture, inputSampler, texUV).rgb, 1.0);
            }
        `;
        
        // ─── 粒子 Shader ───
        const particleShader = `
            @group(0) @binding(0) var particleSampler: sampler;
            @group(0) @binding(1) var particleTexture: texture_2d<f32>;
            
            struct Particle {
                pos: vec2<f32>,      // UV 位置 (0-1)
                vel: vec2<f32>,      // 速度
                life: f32,           // 生命值 (0-1)
                size: f32,           // 大小
                color: vec3<f32>,    // RGB 颜色
                type: u32,           // 类型
                padding: f32,
            };
            @group(0) @binding(2) var<storage, read> particleBuffer: array<Particle>;
            
            struct Uniforms {
                time: f32,
                count: u32,
                intensity: f32,
                padding: f32,
            };
            @group(0) @binding(3) var<uniform> uniforms: Uniforms;
            
            @vertex
            fn main(
                @builtin(vertex_index) idx: u32,
                @builtin(instance_index) inst: u32
            ) -> @builtin(position) vec4<f32> {
                let p = particleBuffer[inst];
                if (p.life <= 0.0) {
                    return vec4<f32>(2.0, 2.0, 0.0, 1.0); // 屏幕外
                }
                
                let texUV = vec2<f32>(p.pos.x, 1.0 - p.pos.y);
                return vec4<f32>(texUV * 2.0 - 1.0, 0.0, 1.0);
            }
            
            @fragment
            fn fmain(
                @builtin(vertex_index) idx: u32,
                @builtin(instance_index) inst: u32
            ) -> @location(0) vec32 {
                let p = particleBuffer[inst];
                if (p.life <= 0.0) {
                    discard;
                }
                
                // 从粒子纹理采样（圆形渐变）
                let texUV = vec2<f32>(p.pos.x, 1.0 - p.pos.y);
                let texel = textureSample(particleTexture, particleSampler, texUV);
                
                let alpha = p.life * p.size * uniforms.intensity;
                return vec4<f32>(p.color * texel.rgb, alpha);
            }
        `;
        
        // ─── Vertex Shader 共享（全屏四边形）───
        const vertexShader = `
            @vertex
            fn main(@builtin(vertex_index) idx: u32) -> @builtin(position) vec4<f32> {
                const coords = array<vec2<f32>, 6>(
                    vec2<f32>(-1.0, -1.0), vec2<f32>( 1.0, -1.0), vec2<f32>(-1.0,  1.0),
                    vec2<f32>(-1.0,  1.0), vec2<f32>( 1.0, -1.0), vec2<f32>( 1.0,  1.0)
                );
                return vec4<f32>(coords[idx], 0.0, 1.0);
            }
        `;
        
        // ─── 编译 Shader Modules ──
        const bloomExtractModule = this.device.createShaderModule({ code: bloomExtractWGPU });
        const blurModule = this.device.createShaderModule({ code: blur9Shader });
        const compositeModule = this.device.createShaderModule({ code: compositeShader });
        const particleModule = this.device.createShaderModule({ code: particleShader });
        const blitModule = this.device.createShaderModule({ code: blitShader });
        
        // ─── 创建 Render Pipeline ──
        const commonVertexState = { module: blitModule, entryPoint: 'main' };
        const commonFragmentState = (module, entryPoint = 'main') => ({
            module, entryPoint,
            targets: [{ format: this.format }]
        });
        
        // Bloom Extract Pipeline
        this.bloomExtractPipeline = this.device.createRenderPipeline({
            layout: 'auto',
            vertex: commonVertexState,
            fragment: commonFragmentState(bloomExtractModule),
            primitive: { topology: 'triangle-list' }
        });
        
        // Blur Pipeline
        this.blurPipeline = this.device.createRenderPipeline({
            layout: 'auto',
            vertex: commonVertexState,
            fragment: commonFragmentState(blurModule),
            primitive: { topology: 'triangle-list' }
        });
        
        // Composite Pipeline
        this.compositePipeline = this.device.createRenderPipeline({
            layout: 'auto',
            vertex: commonVertexState,
            fragment: commonFragmentState(compositeModule),
            primitive: { topology: 'triangle-list' }
        });
        
        // Particle Pipeline
        this.particlePipeline = this.device.createRenderPipeline({
            layout: 'auto',
            vertex: { module: particleModule, entryPoint: 'main' },
            fragment: {
                module: particleModule, entryPoint: 'fmain',
                targets: [{
                    format: this.format,
                    blend: {
                        color: { srcFactor: 'src-alpha', dstFactor: 'one', operation: 'add' },
                        alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' }
                    }
                }]
            },
            primitive: { topology: 'triangle-strip' }
        });
        
        // 创建 Bloom Textures
        this._createBloomTextures();
        
        // ─── 创建 Uniform Buffers ──
        this.bloomUniformBuffer = this.device.createBuffer({
            size: 64, // 对齐到 16 字节
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        
        this.blurUniformBuffer = this.device.createBuffer({
            size: 32,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        
        this.compositeUniformBuffer = this.device.createBuffer({
            size: 32,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        
        this.particleUniformBuffer = this.device.createBuffer({
            size: 32,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });
        
        console.log('[WebGPU] Shader 编译完成 ✅');
    },
    
    // ═══════════════════════════════════════════════════
    //  粒子系统初始化
    // ═══════════════════════════════════════════════════
    _initParticles() {
        const MAX_PARTICLES = 8192;
        const PARTICLE_SIZE = 48; // bytes per particle (vec2+vec2+f32+f32+vec3+u32+f32)
        
        this.particleBuffer = this.device.createBuffer({
            size: MAX_PARTICLES * PARTICLE_SIZE,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
        });
        
        // 预分配粒子数组
        this.particlePool = new Array(MAX_PARTICLES).fill(null).map(() => ({
            pos: [0.5, 0.5],
            vel: [0, 0],
            life: 0,
            maxLife: 2,
            size: 0.05,
            color: [1, 1, 1],
            type: 0
        }));
        
        this.particleCount = 0;
        
        // 创建粒子纹理（圆形渐变）
        this._createParticleTexture();
        
        // 创建粒子 BindGroup
        this.particleBindGroup = this.device.createBindGroup({
            layout: this.particlePipeline.getBindGroupLayout(0),
            entries: [
                { binding: 1, resource: this.particleTexture.createView() },
                { binding: 2, resource: { buffer: this.particleBuffer } },
                { binding: 3, resource: { buffer: this.particleUniformBuffer } }
            ]
        });
    },
    
    _createParticleTexture() {
        // 创建圆形粒子纹理（程序化生成）
        const size = 64;
        const data = new Uint8Array(size * size * 4);
        
        const cx = size / 2;
        const r = size / 2;
        
        for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
                const dx = x - cx;
                const dy = y - cx;
                const dist = Math.sqrt(dx * dx + dy * dy) / r;
                const alpha = Math.max(0, 1 - dist * dist) * 255;
                const i = (y * size + x) * 4;
                data[i] = 255;     // R
                data[i+1] = 255;   // G
                data[i+2] = 255;   // B
                data[i+3] = alpha; // A
            }
        }
        
        this.particleTexture = this.device.createTexture({
            size: [size, size, 1],
            format: 'rgba8unorm',
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
        });
        
        this.device.queue.writeTexture(
            { texture: this.particleTexture },
            data,
            { bytesPerRow: size * 4, rowsPerImage: size },
            [size, size, 1]
        );
        
        this.particleSampler = this.device.createSampler({
            magFilter: 'linear',
            minFilter: 'linear'
        });
    },
    
    // ═══════════════════════════════════════════════════
    //  粒子 API（供 multiplayer-integration.js 调用）
    // ═══════════════════════════════════════════════════
    
    /**
     * 添加辉光粒子（从笔触触发）
     * @param {number} x - 屏幕 UV x (0-1)
     * @param {number} y - 屏幕 UV y (0-1)  
     * @param {string|number} color - CSS 颜色或 RGB 数组
     * @param {number} count - 粒子数量
     * @param {number} life - 存活时间（秒）
     */
    addGlowParticles(x, y, color, count = 8, life = 1.5) {
        if (!this.enabled) return;
        
        // 解析颜色
        let rgb = [1, 1, 1];
        if (typeof color === 'string') {
            rgb = this._parseColor(color);
        } else if (Array.isArray(color)) {
            rgb = color;
        }
        
        for (let i = 0; i < count; i++) {
            const angle = (Math.random() * Math.PI * 2);
            const speed = 0.02 + Math.random() * 0.05;
            
            this.particlePool[this.particleCount % this.particlePool.length] = {
                pos: [x, y],
                vel: [Math.cos(angle) * speed, Math.sin(angle) * speed],
                life: life + Math.random() * 0.5,
                maxLife: life + 0.5,
                size: 0.03 + Math.random() * 0.05,
                color: rgb,
                type: 0
            };
            this.particleCount++;
        }
    },
    
    /**
     * 添加火花粒子（碰撞/快速笔触触发）
     */
    addSparkParticles(x, y, color, count = 12) {
        if (!this.enabled) return;
        this.addGlowParticles(x, y, color, count, 0.8);
    },
    
    /**
     * 从 CSS 颜色字符串解析为 RGB [0-1]
     */
    _parseColor(colorStr) {
        try {
            const c = new (window.THREE.Color || { prototype: {} }).constructor(colorStr);
            return [c.r, c.g, c.b];
        } catch {
            return [1, 1, 0.5];
        }
    },
    
    // ═══════════════════════════════════════════════════
    //  每帧渲染（由 RAF 调用）
    // ═══════════════════════════════════════════════════
    render(timestamp) {
        if (!this.enabled || !this.glCanvas) return;
        
        const dt = (timestamp - this.lastTime) / 1000;
        this.lastTime = timestamp;
        this.time += dt;
        
        // 1. 读取 WebGL Canvas 为 Texture
        const glTexture = this.device.importExternalTexture
            ? null  // 需要 captureSurface 或 alternative
            : null;
        
        // 由于 WebGL Canvas 无法直接作为 WebGPU 输入，
        // 使用 CSS 将 WebGL canvas 复制到 img 元素，
        // 再用 HTMLVideoElement / HTMLCanvasElement 
        // 方案：改用 texImage2D 方式（见下面注释）
        
        // 获取当前命令编码器
        const commandEncoder = this.device.createCommandEncoder();
        
        // ─── 2. Bloom Pass ───
        this._bloomPass(commandEncoder);
        
        // ─── 3. 粒子 Pass ───
        this._particlePass(commandEncoder, dt);
        
        // ─── 4. 提交命令 ───
        this.device.queue.submit([commandEncoder.finish()]);
    },
    
    _bloomPass(encoder) {
        if (!this.bloomExtractPipeline) return;
        
        // 从 WebGL canvas 获取图像数据
        const w = this.canvas.width;
        const h = this.canvas.height;
        
        // 创建临时 Canvas 读取数据
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = w;
        tempCanvas.height = h;
        const ctx = tempCanvas.getContext('2d');
        
        // 尝试读取 WebGL canvas（跨域需配置）
        try {
            ctx.drawImage(this.glCanvas, 0, 0, w, h);
        } catch (e) {
            // 读取失败，使用黑底
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, w, h);
        }
        
        // 提取亮部 (Pass 1)
        const extractPass = encoder.beginRenderPass({
            colorAttachments: [{
                view: this.bloomTextures[1].view,
                clearValue: { r: 0, g: 0, b: 0, a: 1 },
                loadOp: 'clear',
                storeOp: 'store'
            }]
        });
        
        const srcTexture = this.device.createTexture({
            size: [w, h],
            format: this.format,
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
        });
        
        // 将 canvas 数据上传到 GPU
        const imageData = ctx.getImageData(0, 0, w, h);
        this.device.queue.writeTexture(
            { texture: srcTexture, origin: [0, 0] },
            imageData.data,
            { bytesPerRow: w * 4, rowsPerImage: h },
            [w, h, 1]
        );
        
        const srcView = srcTexture.createView();
        const sampler = this.device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
        
        // Bloom Extract BindGroup
        const extractBG = this.device.createBindGroup({
            layout: this.bloomExtractPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: srcView },
                { binding: 1, resource: sampler },
                { binding: 2, resource: { buffer: this.bloomUniformBuffer } }
            ]
        });
        
        // 写入 Extract Uniforms
        const extractUniforms = new Float32Array([0.7, 1.5, 0, 0]); // threshold, intensity
        this.device.queue.writeBuffer(this.bloomUniformBuffer, 0, extractUniforms);
        
        extractPass.setPipeline(this.bloomExtractPipeline);
        extractPass.setBindGroup(0, extractBG);
        extractPass.draw(6);
        extractPass.end();
        
        // Blur Passes (水平 + 垂直，3次迭代)
        for (let iter = 0; iter < 3; iter++) {
            const levels = [1, 2, 1];
            for (let li = 0; li < levels.length - 1; li++) {
                const srcLevel = levels[li];
                const dstLevel = levels[li + 1];
                
                const blurBG = this.device.createBindGroup({
                    layout: this.blurPipeline.getBindGroupLayout(0),
                    entries: [
                        { binding: 0, resource: this.bloomTextures[srcLevel].view },
                        { binding: 1, resource: sampler },
                        { binding: 2, resource: { buffer: this.blurUniformBuffer } }
                    ]
                });
                
                // 水平模糊
                const hBlurPass = encoder.beginRenderPass({
                    colorAttachments: [{
                        view: this.bloomTextures[srcLevel].view,
                        loadOp: 'clear', storeOp: 'store'
                    }]
                });
                const hBlurUniforms = new Float32Array([1.5, 0, 1.0, 0]);
                this.device.queue.writeBuffer(this.blurUniformBuffer, 0, hBlurUniforms);
                hBlurPass.setPipeline(this.blurPipeline);
                hBlurPass.setBindGroup(0, blurBG);
                hBlurPass.draw(6);
                hBlurPass.end();
                
                // 垂直模糊
                const vBlurPass = encoder.beginRenderPass({
                    colorAttachments: [{
                        view: this.bloomTextures[dstLevel].view,
                        loadOp: 'clear', storeOp: 'store'
                    }]
                });
                const vBlurUniforms = new Float32Array([0, 1.5, 1.0, 0]);
                this.device.queue.writeBuffer(this.blurUniformBuffer, 0, vBlurUniforms);
                vBlurPass.setPipeline(this.blurPipeline);
                vBlurPass.setBindGroup(0, blurBG);
                vBlurPass.draw(6);
                vBlurPass.end();
            }
        }
    },
    
    _particlePass(encoder, dt) {
        if (!this.particlePipeline || this.particleCount === 0) return;
        
        // 更新粒子物理
        const pool = this.particlePool;
        const count = Math.min(this.particleCount, pool.length);
        
        for (let i = 0; i < count; i++) {
            const p = pool[i];
            if (p.life <= 0) continue;
            
            // 速度衰减
            p.vel[0] *= 0.96;
            p.vel[1] *= 0.96;
            
            // 位置更新
            p.pos[0] += p.vel[0];
            p.pos[1] += p.vel[1];
            
            // 生命周期衰减
            p.life -= dt / p.maxLife;
        }
        
        // 上传粒子数据到 GPU
        const PARTICLE_SIZE = 48;
        const uploadData = new Float32Array(count * (PARTICLE_SIZE / 4));
        for (let i = 0; i < count; i++) {
            const p = pool[i];
            const base = i * (PARTICLE_SIZE / 4);
            uploadData[base + 0] = p.pos[0];
            uploadData[base + 1] = p.pos[1];
            uploadData[base + 2] = p.vel[0];
            uploadData[base + 3] = p.vel[1];
            uploadData[base + 4] = p.life;
            uploadData[base + 5] = p.size;
            uploadData[base + 6] = p.color[0];
            uploadData[base + 7] = p.color[1];
            uploadData[base + 8] = p.color[2];
            uploadData[base + 9] = p.type;
        }
        
        this.device.queue.writeBuffer(this.particleBuffer, 0, uploadData);
        
        // 粒子 Uniforms
        const pUniforms = new Float32Array([this.time, count, 1.0, 0]);
        this.device.queue.writeBuffer(this.particleUniformBuffer, 0, pUniforms);
        
        // 渲染粒子
        const particleBG = this.device.createBindGroup({
            layout: this.particlePipeline.getBindGroupLayout(0),
            entries: [
                { binding: 1, resource: this.particleTexture.createView() },
                { binding: 2, resource: { buffer: this.particleBuffer } },
                { binding: 3, resource: { buffer: this.particleUniformBuffer } }
            ]
        });
        
        const particlePass = encoder.beginRenderPass({
            colorAttachments: [{
                view: this.context.getCurrentTexture().createView(),
                loadOp: 'load',
                storeOp: 'store'
            }]
        });
        
        particlePass.setPipeline(this.particlePipeline);
        particlePass.setBindGroup(0, particleBG);
        particlePass.draw(4, count);
        particlePass.end();
    },
    
    // ═══════════════════════════════════════════════════
    //  开始渲染循环
    // ═══════════════════════════════════════════════════
    startRenderLoop() {
        if (!this.enabled) return;
        
        const loop = (timestamp) => {
            this.render(timestamp);
            requestAnimationFrame(loop);
        };
        
        requestAnimationFrame(loop);
        console.log('[WebGPU] 渲染循环已启动 🔄');
    },
    
    // ═══════════════════════════════════════════════════
    //  清理
    // ═══════════════════════════════════════════════════
    destroy() {
        if (this.canvas && this.canvas.parentNode) {
            this.canvas.parentNode.removeChild(this.canvas);
        }
        if (this.device) {
            this.device.destroy();
        }
        this.enabled = false;
        console.log('[WebGPU] 已销毁');
    }
};

})();
