/**
 * Commercial Dragon Boat Scene Layer
 * Adds a richer festival game loop on top of the existing VR paint scene.
 */
;(function () {
  'use strict';

  const palette = {
    ink: '#102b2b',
    river: '#1e9fc2',
    riverDeep: '#117f99',
    leaf: '#3d9856',
    grass: '#6aba55',
    sand: '#d8bf72',
    stone: '#8fa193',
    red: '#c9342b',
    redDark: '#84271f',
    gold: '#f2c75c',
    hullGold: '#f4d94f',
    scaleRed: '#d83b2e',
    scaleGold: '#ffd95a',
    cream: '#fff2bd',
    blue: '#2578b8',
    green: '#2d8f57',
    dragonTeal: '#46b79d',
    dragonTealDark: '#23806f',
    coral: '#ef6f5f',
    purple: '#7356a8',
    orange: '#e78335',
    wood: '#7b492b',
    skin: '#e8b07c'
  };

  const state = {
    score: 0,
    combo: 1,
    lanePower: 34,
    lanterns: 0,
    charms: 0,
    activeQuest: 0,
    mode: 'race',
    cameraMode: 'river',
    ready: false,
    quests: [
      { label: '击鼓开赛', target: 1, current: 0 },
      { label: '点亮灯笼', target: 5, current: 0 },
      { label: '收集粽叶', target: 6, current: 0 },
      { label: '完成五彩绳', target: 4, current: 0 }
    ]
  };

  const selectors = {
    hud: 'commercial-game-hud',
    toast: 'commercial-toast',
    questText: 'commercial-quest-text',
    questProgress: 'commercial-quest-progress',
    score: 'commercial-score',
    combo: 'commercial-combo',
    mode: 'commercial-mode',
    power: 'commercial-power',
    camera: 'commercial-camera'
  };

  function boot() {
    if (!window.AFRAME) {
      setTimeout(boot, 80);
      return;
    }

    registerComponents();
    document.addEventListener('DOMContentLoaded', initWhenSceneReady);
    if (document.readyState !== 'loading') initWhenSceneReady();
  }

  function initWhenSceneReady() {
    const scene = document.querySelector('a-scene');
    if (!scene || scene.dataset.commercialDragonboatReady) return;
    scene.dataset.commercialDragonboatReady = '1';
    requestAnimationFrame(function () {
      init(scene);
    });
    scene.addEventListener('loaded', function () {
      init(scene);
    });
  }

  function registerComponents() {
    if (AFRAME.components['festival-sway']) return;

    AFRAME.registerComponent('festival-sway', {
      schema: {
        amp: { default: 0.1 },
        speed: { default: 1 },
        rot: { default: 3 },
        phase: { default: 0 }
      },
      init: function () {
        this.base = this.el.object3D.position.clone();
        this.baseRot = this.el.object3D.rotation.clone();
      },
      tick: function (time) {
        const t = time / 1000 * this.data.speed + this.data.phase;
        this.el.object3D.position.y = this.base.y + Math.sin(t) * this.data.amp;
        this.el.object3D.rotation.y = this.baseRot.y + Math.sin(t * 0.8) * AFRAME.THREE.MathUtils.degToRad(this.data.rot);
      }
    });

    AFRAME.registerComponent('race-boat', {
      schema: {
        lane: { default: 0 },
        speed: { default: 1 },
        lead: { default: 0 }
      },
      init: function () {
        this.base = this.el.object3D.position.clone();
      },
      tick: function (time) {
        const t = time / 1000;
        const power = 0.12 + state.lanePower / 520;
        const loop = ((t * this.data.speed * power + this.data.lead) % 1) * 26 - 13;
        this.el.object3D.position.z = this.base.z - loop;
        this.el.object3D.position.y = this.base.y + Math.sin(t * 2.2 + this.data.lead * 10) * 0.035;
        this.el.object3D.rotation.z = Math.sin(t * 1.8 + this.data.lane) * 0.02;
      }
    });

    AFRAME.registerComponent('paddle-motion', {
      schema: {
        side: { default: 1 },
        phase: { default: 0 }
      },
      tick: function (time) {
        const t = time / 360 + this.data.phase;
        this.el.object3D.rotation.x = Math.sin(t) * 0.34;
        this.el.object3D.rotation.z = this.data.side * (0.48 + Math.cos(t) * 0.2);
      }
    });

    AFRAME.registerComponent('crowd-wave', {
      schema: {
        phase: { default: 0 }
      },
      init: function () {
        this.base = this.el.object3D.position.clone();
      },
      tick: function (time) {
        const t = time / 260 + this.data.phase;
        this.el.object3D.position.y = this.base.y + Math.max(0, Math.sin(t)) * 0.08;
      }
    });

    AFRAME.registerComponent('camera-director', {
      init: function () {
        this.targets = {
          river: { offset: { x: 0, y: 2.05, z: 8.4 }, rot: { x: -5, y: 0, z: 0 } },
          bank: { offset: { x: -7.8, y: 1.85, z: 1.2 }, rot: { x: -4, y: -42, z: 0 } },
          top: { offset: { x: 0, y: 9.5, z: 0.8 }, rot: { x: -68, y: 0, z: 0 } },
          drum: { offset: { x: 1.2, y: 1.45, z: 0.35 }, rot: { x: -3, y: 17, z: 0 } },
          dragon: { offset: { x: 4.6, y: 1.62, z: -3.25 }, rot: { x: -7, y: 64, z: 0 } }
        };
        this.targetPosition = new AFRAME.THREE.Vector3();
        this.focusPosition = new AFRAME.THREE.Vector3();
      },
      tick: function () {
        const target = this.targets[state.cameraMode] || this.targets.river;
        const obj = this.el.object3D;
        const focus = document.querySelector('[race-boat]');
        if (focus) {
          focus.object3D.getWorldPosition(this.focusPosition);
        } else {
          this.focusPosition.set(0, 0, -4);
        }
        this.targetPosition.set(
          this.focusPosition.x + target.offset.x,
          target.offset.y,
          this.focusPosition.z + target.offset.z
        );
        obj.position.lerp(this.targetPosition, 0.045);
        obj.rotation.x = lerp(obj.rotation.x, AFRAME.THREE.MathUtils.degToRad(target.rot.x), 0.04);
        obj.rotation.y = lerp(obj.rotation.y, AFRAME.THREE.MathUtils.degToRad(target.rot.y), 0.04);
        obj.rotation.z = lerp(obj.rotation.z, AFRAME.THREE.MathUtils.degToRad(target.rot.z), 0.04);
      }
    });

    AFRAME.registerComponent('quest-hotspot', {
      schema: {
        type: { default: 'lantern' },
        value: { default: 1 },
        label: { default: '互动点' }
      },
      init: function () {
        this.el.classList.add('clickable');
        this.el.setAttribute('animation__hover', 'property: scale; to: 1.08 1.08 1.08; startEvents: mouseenter; dur: 160');
        this.el.setAttribute('animation__leave', 'property: scale; to: 1 1 1; startEvents: mouseleave; dur: 160');
        this.el.addEventListener('click', () => this.activate());
      },
      activate: function () {
        if (this.el.dataset.hotspotUsed === '1') return;
        this.el.dataset.hotspotUsed = '1';
        completeInteraction(this.data.type, this.data.value, this.data.label);
        this.el.setAttribute('material', 'opacity: 0.45; transparent: true');
        this.el.emit('collected');
      }
    });
  }

  function init(scene) {
    if (state.ready) return;
    state.ready = true;

    const camera = document.getElementById('acamera');
    const rig = document.getElementById('cameraRig');
    if (rig) {
      rig.setAttribute('camera-director', '');
      rig.setAttribute('position', '0 2.05 8.4');
    }
    if (camera) {
      camera.setAttribute('position', '0 0 0');
      camera.setAttribute('cursor', 'rayOrigin: mouse; fuse: false');
      camera.setAttribute('raycaster', 'objects: .clickable; far: 45');
    }

    scene.setAttribute('renderer', 'colorManagement: true; physicallyCorrectLights: true');
    scene.setAttribute('fog', 'type: exponential; color: #bfe7db; density: 0.032');

    createHud();
    createScene(scene);
    bindControls();
    updateHud();
    showToast('商业场景已加载：点击灯笼、粽叶和鼓点推进任务。');
  }

  function createHud() {
    if (document.getElementById(selectors.hud)) return;
    const style = document.createElement('style');
    style.textContent = `
      #${selectors.hud} {
        position: fixed;
        top: 16px;
        left: 16px;
        z-index: 5000;
        width: min(390px, calc(100vw - 32px));
        color: #fdf2cf;
        font-family: "Segoe UI", "Noto Sans SC", sans-serif;
        pointer-events: auto;
      }
      .cg-panel {
        border: 1px solid rgba(255, 230, 155, .44);
        background: linear-gradient(135deg, rgba(38, 22, 20, .88), rgba(13, 47, 55, .78));
        box-shadow: 0 18px 45px rgba(11, 29, 31, .34);
        backdrop-filter: blur(14px);
        border-radius: 8px;
        padding: 14px;
      }
      .cg-title {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: center;
        margin-bottom: 10px;
      }
      .cg-title strong {
        font-size: 19px;
        letter-spacing: .02em;
      }
      .cg-pill {
        color: #2d1b14;
        background: #f2c75c;
        border-radius: 999px;
        padding: 4px 9px;
        font-weight: 800;
        font-size: 12px;
      }
      .cg-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 8px;
        margin: 10px 0;
      }
      .cg-stat {
        min-height: 54px;
        border: 1px solid rgba(255, 242, 189, .18);
        border-radius: 7px;
        padding: 8px;
        background: rgba(255, 242, 189, .08);
      }
      .cg-stat span {
        display: block;
        color: rgba(255, 242, 189, .68);
        font-size: 11px;
        margin-bottom: 4px;
      }
      .cg-stat b {
        font-size: 18px;
      }
      .cg-progress {
        height: 8px;
        overflow: hidden;
        border-radius: 999px;
        background: rgba(255, 242, 189, .16);
      }
      .cg-progress i {
        display: block;
        height: 100%;
        width: 0;
        border-radius: inherit;
        background: linear-gradient(90deg, #e73a2f, #f2c75c);
        transition: width .28s cubic-bezier(.22, 1, .36, 1);
      }
      .cg-actions {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
        margin-top: 10px;
      }
      .cg-views {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 7px;
        margin-top: 9px;
      }
      .cg-actions button {
        min-height: 42px;
        border: 1px solid rgba(255, 242, 189, .28);
        border-radius: 7px;
        background: rgba(255, 242, 189, .08);
        color: #fff2bd;
        font: inherit;
        font-weight: 800;
        cursor: pointer;
      }
      .cg-actions button:hover,
      .cg-actions button:focus-visible,
      .cg-views button:hover,
      .cg-views button:focus-visible {
        outline: none;
        background: rgba(242, 199, 92, .22);
        border-color: rgba(242, 199, 92, .7);
      }
      .cg-views button {
        min-height: 34px;
        border: 1px solid rgba(255, 242, 189, .2);
        border-radius: 7px;
        color: rgba(255, 242, 189, .9);
        background: rgba(255, 242, 189, .055);
        font: inherit;
        font-size: 12px;
        font-weight: 800;
        cursor: pointer;
      }
      .cg-views button.active {
        color: #2d1b14;
        background: #f2c75c;
        border-color: #f2c75c;
      }
      #${selectors.toast} {
        position: fixed;
        left: 50%;
        bottom: 22px;
        z-index: 5001;
        max-width: min(520px, calc(100vw - 32px));
        transform: translateX(-50%) translateY(18px);
        opacity: 0;
        color: #fff2bd;
        background: rgba(132, 39, 31, .92);
        border: 1px solid rgba(242, 199, 92, .5);
        border-radius: 8px;
        padding: 11px 14px;
        font: 700 14px "Segoe UI", "Noto Sans SC", sans-serif;
        box-shadow: 0 14px 34px rgba(32, 20, 18, .28);
        transition: opacity .24s ease, transform .24s ease;
      }
      #${selectors.toast}.show {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }
      @media (max-width: 700px) {
        #${selectors.hud} {
          top: 10px;
          left: 10px;
          width: calc(100vw - 20px);
        }
        .cg-panel { padding: 11px; }
        .cg-title strong { font-size: 16px; }
      }
    `;
    document.head.appendChild(style);

    const hud = document.createElement('div');
    hud.id = selectors.hud;
    hud.innerHTML = `
      <div class="cg-panel">
        <div class="cg-title">
          <strong>端午龙舟商业赛场</strong>
          <span class="cg-pill" id="${selectors.mode}">竞速</span>
        </div>
        <div id="${selectors.questText}">任务载入中</div>
        <div class="cg-progress" aria-hidden="true"><i id="${selectors.questProgress}"></i></div>
        <div class="cg-grid">
          <div class="cg-stat"><span>声望</span><b id="${selectors.score}">0</b></div>
          <div class="cg-stat"><span>连击</span><b id="${selectors.combo}">1x</b></div>
          <div class="cg-stat"><span>鼓点</span><b id="${selectors.power}">34%</b></div>
        </div>
        <div class="cg-actions">
          <button type="button" data-game-action="drum">击鼓</button>
          <button type="button" data-game-action="lantern">点灯</button>
          <button type="button" data-game-action="confetti">彩屑</button>
        </div>
        <div class="cg-views" id="${selectors.camera}">
          <button type="button" class="active" data-camera-view="river">河道</button>
          <button type="button" data-camera-view="bank">岸边</button>
          <button type="button" data-camera-view="top">俯瞰</button>
          <button type="button" data-camera-view="drum">鼓手</button>
          <button type="button" data-camera-view="dragon">龙头</button>
        </div>
      </div>
    `;
    document.body.appendChild(hud);

    const toast = document.createElement('div');
    toast.id = selectors.toast;
    document.body.appendChild(toast);
  }

  function createScene(scene) {
    const root = node('a-entity', { id: 'commercial-dragonboat-world' }, scene);

    const sky = document.getElementById('sunset-sky');
    if (sky) {
      sky.setAttribute('material', 'shader: flat; side: back; color: #a7dce8');
    }

    node('a-light', {
      type: 'directional',
      position: '-5 9 5',
      light: 'color: #fff3c2; intensity: 1.35; castShadow: true'
    }, root);
    node('a-light', {
      type: 'ambient',
      light: 'color: #d8fff1; intensity: 0.45'
    }, root);

    createGround(root);
    createRiver(root);
    createMountains(root);
    createRaceBoats(root);
    createSpectators(root);
    createFestivalProps(root);
    createCommercialDetails(root);
    createQuestItems(root);
  }

  function createGround(root) {
    const oldGround = document.getElementById('ground');
    if (oldGround) {
      oldGround.setAttribute('visible', 'false');
    }
    node('a-plane', {
      position: '0 -0.02 -9',
      rotation: '-90 0 0',
      width: 42,
      height: 46,
      material: `shader: flat; color: ${palette.grass}`
    }, root);
    node('a-plane', {
      position: '0 0 -9',
      rotation: '-90 0 0',
      width: 10,
      height: 38,
      material: `shader: flat; color: ${palette.river}; transparent: true; opacity: 0.92`
    }, root);
    node('a-plane', {
      position: '-10 0.01 -9',
      rotation: '-90 0 0',
      width: 7,
      height: 39,
      material: `shader: flat; color: ${palette.sand}`
    }, root);
    node('a-plane', {
      position: '10 0.01 -9',
      rotation: '-90 0 0',
      width: 7,
      height: 39,
      material: `shader: flat; color: ${palette.sand}`
    }, root);
  }

  function createRiver(root) {
    for (let i = 0; i < 32; i++) {
      node('a-plane', {
        position: `${random(-4.3, 4.3)} 0.025 ${random(-26, 8)}`,
        rotation: '-90 0 0',
        width: random(0.9, 2.2).toFixed(2),
        height: '0.025',
        material: 'shader: flat; color: #d9fbff; opacity: 0.42; transparent: true',
        'festival-sway': `amp: 0.012; speed: ${random(1.2, 2.4)}; rot: 8; phase: ${random(0, 9)}`
      }, root);
    }

    [-3.25, 0, 3.25].forEach((x, lane) => {
      node('a-cylinder', {
        position: `${x} 0.08 -9`,
        rotation: '90 0 0',
        radius: 0.025,
        height: 34,
        material: `shader: flat; color: ${lane === 1 ? palette.gold : palette.red}`
      }, root);
      for (let z = -25; z <= 7; z += 3.2) {
        node('a-sphere', {
          position: `${x} 0.16 ${z}`,
          radius: 0.12,
          material: `shader: flat; color: ${lane === 1 ? palette.gold : palette.red}`
        }, root);
      }
    });

    for (let i = 0; i < 14; i++) {
      createLilyPad(root, random(-5.8, 5.8), random(-25, 7), random(0.55, 1.25), i);
    }
  }

  function createLilyPad(root, x, z, size, idx) {
    const pad = node('a-entity', { position: `${x} 0.055 ${z}`, rotation: `0 ${random(0, 180)} 0` }, root);
    node('a-cylinder', {
      position: '0 0 0',
      radius: size * 0.34,
      height: 0.018,
      segmentsRadial: 18,
      scale: '1.35 1 0.72',
      material: `shader: flat; color: ${idx % 2 ? '#5ca65d' : '#78b46b'}; opacity: 0.9; transparent: true`
    }, pad);
    node('a-triangle', {
      position: `${size * 0.25} 0.012 0`,
      rotation: '-90 0 0',
      vertexA: '0 0 0',
      vertexB: `${size * 0.23} 0 0`,
      vertexC: `0 ${size * 0.22} 0`,
      material: `shader: flat; color: ${palette.river}; opacity: 0.95; transparent: true`
    }, pad);
    if (idx % 3 === 0) createLotus(pad, 0, 0.06, 0, size);
  }

  function createLotus(parent, x, y, z, size) {
    const lotus = node('a-entity', { position: `${x} ${y} ${z}` }, parent);
    for (let i = 0; i < 8; i++) {
      const angle = i * 45;
      node('a-cone', {
        position: `${Math.cos(angle * Math.PI / 180) * size * 0.1} 0 ${Math.sin(angle * Math.PI / 180) * size * 0.1}`,
        rotation: `65 ${-angle} 0`,
        radiusBottom: size * 0.065,
        radiusTop: size * 0.01,
        height: size * 0.28,
        material: `color: ${i % 2 ? '#f3a2c6' : '#ffd5e5'}; roughness: 0.46`
      }, lotus);
    }
    node('a-sphere', { position: '0 0.045 0', radius: size * 0.045, material: `color: ${palette.gold}` }, lotus);
  }

  function createMountains(root) {
    for (let i = 0; i < 14; i++) {
      const x = -20 + i * 3.2 + random(-0.6, 0.8);
      const h = random(3.5, 7.2);
      node('a-cone', {
        position: `${x} ${h / 2 - 0.04} -29`,
        radiusBottom: random(2.2, 4.2).toFixed(2),
        radiusTop: 0,
        height: h.toFixed(2),
        segmentsRadial: 5,
        material: `shader: flat; color: ${i % 2 ? '#7bbd72' : '#95c98b'}; opacity: ${i % 3 ? 0.82 : 0.64}; transparent: true`
      }, root);
    }

    for (let i = 0; i < 34; i++) {
      createTree(root, random(-18, 18), random(-26, 8), random(0.5, 1.25));
    }
  }

  function createRaceBoats(root) {
    createBoat(root, { x: 0, z: -4, color: palette.red, trim: palette.gold, label: '赤龙队', speed: 0.1, lead: 0.1 });
    createBoat(root, { x: -3.3, z: -2.5, color: palette.blue, trim: palette.cream, label: '沧浪队', speed: 0.09, lead: 0.48 });
    createBoat(root, { x: 3.3, z: -5.5, color: palette.green, trim: palette.gold, label: '青竹队', speed: 0.08, lead: 0.78 });
  }

  function createBoat(root, options) {
    const boat = node('a-entity', {
      position: `${options.x} 0.18 ${options.z}`,
      rotation: '0 0 0',
      scale: '1 1 1',
      'race-boat': `lane: ${options.x}; speed: ${options.speed}; lead: ${options.lead}`
    }, root);

    const hull = node('a-entity', { position: '0 0 0' }, boat);
    node('a-box', {
      position: '0 0.2 0',
      width: 1.42,
      height: 0.38,
      depth: 3.55,
      material: `color: ${palette.hullGold}; roughness: 0.62; metalness: 0.02`
    }, hull);
    node('a-cone', {
      position: '0 0.2 -1.95',
      rotation: '-90 0 0',
      radiusBottom: 0.72,
      radiusTop: 0.16,
      height: 0.82,
      segmentsRadial: 4,
      material: `color: ${palette.hullGold}; roughness: 0.58`
    }, hull);
    node('a-cone', {
      position: '0 0.2 1.95',
      rotation: '90 0 0',
      radiusBottom: 0.54,
      radiusTop: 0.12,
      height: 0.62,
      segmentsRadial: 4,
      material: `color: ${palette.hullGold}; roughness: 0.58`
    }, hull);
    node('a-box', {
      position: '0 0.48 0',
      width: 1.58,
      height: 0.08,
      depth: 3.72,
      material: `shader: flat; color: ${palette.scaleRed}`
    }, hull);
    [-1, 1].forEach(side => {
      node('a-box', {
        position: `${side * 0.786} 0.28 0`,
        width: 0.026,
        height: 0.42,
        depth: 3.34,
        material: `color: ${palette.cream}; roughness: 0.48`
      }, hull);
    });
    node('a-box', {
      position: '0 0.54 -0.18',
      width: 1.34,
      height: 0.035,
      depth: 3.25,
      material: `shader: flat; color: ${palette.cream}; opacity: 0.85; transparent: true`
    }, boat);
    createScalePattern(hull);
    createCurvedRedRail(boat);

    createDragonHead(boat);
    createTailOrnament(boat);
    createDrum(boat, options.trim);
    createBoatSign(boat, options.label, options.color, options.trim);

    for (let i = 0; i < 6; i++) {
      const z = -1.12 + i * 0.45;
      [-1, 1].forEach((side, sideIdx) => {
        createRower(boat, side, z, i + sideIdx, options.trim);
      });
    }
  }

  function createScalePattern(parent) {
    for (let z = -1.42; z <= 1.46; z += 0.28) {
      const row = Math.round((z + 1.42) / 0.28);
      [-1, 1].forEach(side => {
        for (let i = 0; i < 5; i++) {
          const y = 0.045 + i * 0.08;
          const x = side * (0.735 + (i % 2) * 0.012);
          const scale = node('a-torus', {
            position: `${x} ${y} ${z + (row % 2) * 0.055}`,
            rotation: `0 90 ${side > 0 ? 0 : 180}`,
            radius: 0.095,
            radiusTubular: 0.009,
            thetaLength: 185,
            material: `shader: flat; color: ${i % 2 ? palette.scaleRed : palette.orange}`
          }, parent);
          scale.setAttribute('scale', '1 0.62 1');
        }
      });
    }
    for (let z = -1.2; z <= 1.22; z += 0.26) {
      for (let x = -0.44; x <= 0.46; x += 0.22) {
        const topScale = node('a-torus', {
          position: `${x} 0.565 ${z}`,
          rotation: '90 0 0',
          radius: 0.07,
          radiusTubular: 0.006,
          thetaLength: 190,
          material: `shader: flat; color: ${Math.round((x + z) * 10) % 2 ? palette.scaleRed : palette.orange}`
        }, parent);
        topScale.setAttribute('scale', '1 0.58 1');
      }
    }
  }

  function createCurvedRedRail(parent) {
    [-1, 1].forEach(side => {
      for (let i = 0; i < 11; i++) {
        const z = -1.6 + i * 0.32;
        const y = 0.58 + Math.pow(Math.abs(z) / 1.9, 1.8) * 0.24;
        node('a-sphere', {
          position: `${side * 0.76} ${y} ${z}`,
          radius: 0.055,
          scale: '1 0.55 1',
          material: `color: ${palette.scaleRed}; roughness: 0.48`
        }, parent);
      }
      node('a-cylinder', {
        position: `${side * 0.76} 0.64 0`,
        rotation: '90 0 0',
        radius: 0.025,
        height: 3.5,
        material: `color: ${palette.scaleRed}; roughness: 0.52`
      }, parent);
    });
  }

  function createTailOrnament(parent) {
    const tail = node('a-entity', { position: '0 0.84 2.22', rotation: '-10 0 0' }, parent);
    node('a-cone', {
      position: '0 0.16 0.1',
      rotation: '72 0 0',
      radiusBottom: 0.26,
      radiusTop: 0.06,
      height: 0.86,
      material: `color: ${palette.gold}; roughness: 0.52`
    }, tail);
    node('a-torus', { position: '0 0.44 0.28', rotation: '0 0 0', radius: 0.24, radiusTubular: 0.03, thetaLength: 285, material: `color: ${palette.gold}` }, tail);
    for (let i = 0; i < 5; i++) {
      node('a-torus', {
        position: `0 ${0.2 + i * 0.055} ${0.2 + i * 0.075}`,
        rotation: '0 0 0',
        radius: 0.1 + i * 0.03,
        radiusTubular: 0.006,
        thetaLength: 220,
        material: `shader: flat; color: ${palette.orange}`
      }, tail);
    }
  }

  function createDragonHead(parent) {
    const head = node('a-entity', { position: '0 0.94 -2.22', rotation: '-4 0 0' }, parent);
    node('a-sphere', { position: '0 0 0', radius: 0.38, scale: '1.05 0.92 1.08', material: `color: ${palette.dragonTeal}; roughness: 0.54` }, head);
    node('a-box', { position: '0 0.0 0.26', width: 0.82, height: 0.43, depth: 0.3, material: `color: ${palette.dragonTeal}; roughness: 0.56` }, head);
    node('a-cone', {
      position: '0 0.02 -0.34',
      rotation: '-90 0 0',
      radiusBottom: 0.26,
      radiusTop: 0.34,
      height: 0.46,
      segmentsRadial: 4,
      material: `color: ${palette.dragonTeal}; roughness: 0.54`
    }, head);
    for (let i = 0; i < 3; i++) {
      node('a-cylinder', {
        position: `0 ${-0.02 + i * 0.12} -0.55`,
        rotation: '90 0 0',
        radius: 0.105 - i * 0.006,
        height: 0.5,
        material: `color: ${palette.dragonTealDark}; roughness: 0.48`
      }, head);
    }
    node('a-box', { position: '0 -0.14 -0.42', width: 0.66, height: 0.13, depth: 0.34, material: `color: ${palette.ink}; roughness: 0.7` }, head);
    node('a-box', { position: '0 -0.22 -0.32', width: 0.58, height: 0.065, depth: 0.34, material: `shader: flat; color: ${palette.coral}` }, head);
    [-1, 1].forEach(side => {
      node('a-sphere', { position: `${side * 0.25} 0.13 -0.16`, radius: 0.105, material: `color: ${palette.cream}; roughness: 0.36` }, head);
      node('a-sphere', { position: `${side * 0.265} 0.13 -0.235`, radius: 0.043, material: `color: ${palette.dragonTealDark}; emissive: ${palette.dragonTealDark}; emissiveIntensity: 0.22` }, head);
      node('a-torus', { position: `${side * 0.25} 0.13 -0.16`, rotation: '0 0 0', radius: 0.112, radiusTubular: 0.012, material: `shader: flat; color: ${palette.coral}` }, head);
      node('a-cone', { position: `${side * 0.26} 0.46 0.02`, rotation: `${side * -10} 0 ${side * 18}`, radiusBottom: 0.06, radiusTop: 0.01, height: 0.5, material: `color: ${palette.gold}; roughness: 0.4` }, head);
      node('a-cylinder', { position: `${side * 0.43} -0.1 -0.2`, rotation: `70 0 ${side * 72}`, radius: 0.015, height: 0.72, material: `color: ${palette.coral}; roughness: 0.5` }, head);
      node('a-cylinder', { position: `${side * 0.38} -0.16 -0.1`, rotation: `82 0 ${side * 55}`, radius: 0.011, height: 0.58, material: `color: ${palette.gold}; roughness: 0.5` }, head);
    });
    for (let i = 0; i < 6; i++) {
      node('a-cone', {
        position: `${-0.28 + i * 0.112} 0.38 ${0.08 - Math.abs(i - 2.5) * 0.018}`,
        rotation: `${-10 + i * 4} 0 ${-18 + i * 7}`,
        radiusBottom: 0.045,
        radiusTop: 0.006,
        height: 0.38 + (i % 2) * 0.08,
        material: `color: ${palette.gold}; roughness: 0.36`
      }, head);
    }
    node('a-cone', { position: '0 -0.36 -0.08', rotation: '-22 0 0', radiusBottom: 0.17, radiusTop: 0.025, height: 0.9, material: `color: ${palette.coral}; roughness: 0.55` }, head);
    node('a-box', { position: '0 0.0 0.52', width: 0.92, height: 0.08, depth: 0.12, material: `color: ${palette.dragonTealDark}` }, head);
    [-1, 1].forEach(side => {
      node('a-cone', {
        position: `${side * 0.48} 0.0 0.45`,
        rotation: `0 ${side * 24} ${side * 8}`,
        radiusBottom: 0.2,
        radiusTop: 0.04,
        height: 0.42,
        segmentsRadial: 4,
        material: `color: ${palette.dragonTeal}; roughness: 0.58`
      }, head);
      node('a-torus', {
        position: `${side * 0.52} 0.03 0.38`,
        rotation: `0 ${side * 35} 0`,
        radius: 0.18,
        radiusTubular: 0.012,
        thetaLength: 180,
        material: `shader: flat; color: ${palette.dragonTealDark}`
      }, head);
    });
  }

  function createDrum(parent, trim) {
    const drum = node('a-entity', { position: '0 0.72 -1.15', 'quest-hotspot': 'type: drum; value: 1; label: 击鼓开赛' }, parent);
    node('a-cylinder', { position: '0 0 0', rotation: '90 0 0', radius: 0.25, height: 0.32, material: `color: ${palette.redDark}` }, drum);
    node('a-cylinder', { position: '0 0 -0.18', rotation: '90 0 0', radius: 0.26, height: 0.035, material: `color: ${trim}` }, drum);
    node('a-cylinder', { position: '0 0 0.18', rotation: '90 0 0', radius: 0.26, height: 0.035, material: `color: ${trim}` }, drum);
    node('a-cylinder', { position: '-0.18 0.34 0', rotation: '40 0 25', radius: 0.015, height: 0.56, material: `color: ${palette.wood}` }, drum);
    node('a-cylinder', { position: '0.18 0.34 0', rotation: '40 0 -25', radius: 0.015, height: 0.56, material: `color: ${palette.wood}` }, drum);
  }

  function createBoatSign(parent, label, color, trim) {
    const sign = node('a-entity', { position: '0 0.98 0.75' }, parent);
    node('a-plane', { width: 1.2, height: 0.35, material: `shader: flat; color: ${trim}` }, sign);
    node('a-text', { position: '0 0 0.01', value: label, align: 'center', width: 3.8, color: color === palette.blue ? palette.ink : palette.redDark }, sign);
  }

  function createRower(parent, side, z, phase, trim) {
    const rower = node('a-entity', { position: `${side * 0.34} 0.55 ${z}`, rotation: `0 ${side > 0 ? -90 : 90} 0`, 'crowd-wave': `phase: ${phase}` }, parent);
    node('a-cylinder', { position: '0 0.12 0', radius: 0.065, height: 0.24, material: `color: ${phase % 3 ? palette.cream : palette.gold}` }, rower);
    node('a-sphere', { position: '0 0.31 0', radius: 0.07, material: `color: ${palette.skin}` }, rower);
    node('a-cylinder', { position: `${side * 0.46} 0.1 ${z}`, rotation: `0 0 ${side * 78}`, radius: 0.012, height: 0.88, material: `color: ${palette.wood}`, 'paddle-motion': `side: ${side}; phase: ${phase}` }, parent);
    node('a-box', { position: `${side * 0.88} 0.03 ${z - 0.04}`, width: 0.18, height: 0.035, depth: 0.32, material: `color: ${trim}` }, parent);
  }

  function createSpectators(root) {
    for (let i = 0; i < 86; i++) {
      const side = i % 2 ? -1 : 1;
      const x = side * random(6.8, 14.5);
      const z = random(-24, 7);
      createPerson(root, x, z, i);
      if (i % 8 === 0) createFlag(root, side * random(6.1, 11.5), z + random(-0.4, 0.5), i % 16 === 0 ? '端午安康' : '加油');
    }
  }

  function createPerson(root, x, z, idx) {
    const bodyColor = [palette.red, palette.gold, palette.blue, palette.green, palette.cream][idx % 5];
    const person = node('a-entity', {
      position: `${x} 0.02 ${z}`,
      rotation: `0 ${x > 0 ? -72 : 72} 0`,
      scale: `${random(0.72, 1)} ${random(0.72, 1)} ${random(0.72, 1)}`,
      'crowd-wave': `phase: ${idx * 0.23}`
    }, root);
    node('a-cylinder', { position: '0 0.28 0', radius: 0.08, height: 0.38, material: `color: ${bodyColor}` }, person);
    node('a-sphere', { position: '0 0.54 0', radius: 0.085, material: `color: ${palette.skin}` }, person);
    if (idx % 6 === 0) {
      node('a-cylinder', { position: '-0.12 0.48 0', rotation: '0 0 -50', radius: 0.012, height: 0.36, material: `color: ${palette.skin}` }, person);
      node('a-cylinder', { position: '0.12 0.48 0', rotation: '0 0 50', radius: 0.012, height: 0.36, material: `color: ${palette.skin}` }, person);
    }
  }

  function createFlag(root, x, z, text) {
    const flag = node('a-entity', { position: `${x} 0.1 ${z}`, rotation: `0 ${x > 0 ? -80 : 80} 0` }, root);
    node('a-cylinder', { position: '0 0.7 0', radius: 0.018, height: 1.4, material: `color: ${palette.wood}` }, flag);
    node('a-plane', { position: '0.28 1.15 0', width: 0.58, height: 0.25, material: `shader: flat; color: ${text.length > 2 ? palette.red : palette.gold}`, 'festival-sway': `amp: 0.015; speed: ${random(1, 2)}; rot: 10; phase: ${random(0, 10)}` }, flag);
    node('a-text', { position: '0.28 1.15 0.012', value: text, align: 'center', width: 2.2, color: text.length > 2 ? palette.cream : palette.redDark }, flag);
  }

  function createFestivalProps(root) {
    createGate(root, -6.2, -18, '竞渡主会场');
    createGate(root, 6.2, -6, '端午安康');
    for (let i = 0; i < 12; i++) {
      createReeds(root, random(-5.1, 5.1), random(-24, 8));
    }
  }

  function createCommercialDetails(root) {
    createGrandStand(root, -13.5, -11, 62);
    createGrandStand(root, 13.5, -15, -62);
    createJudgeTower(root, -6.8, -21.5);
    createFinishGate(root, 0, -22.6);
    createDock(root, -5.8, -1.5, -12);
    createDock(root, 5.8, 2.5, 12);
    createPodium(root, 8.5, -2.5);

    const boothData = [
      [-12.2, -4.5, '粽香铺', palette.green],
      [-12.5, 1.2, '艾草香囊', palette.gold],
      [12.4, -8.8, '龙舟周边', palette.red],
      [12.2, 2.3, '五彩绳坊', palette.purple]
    ];
    boothData.forEach(item => createBooth(root, item[0], item[1], item[2], item[3]));

    const sponsorData = [
      [-7.4, -24.4, '荣耀冲刺'],
      [7.4, -24.4, '同舟共进'],
      [-8.4, 5.5, '端午安康'],
      [8.4, 5.5, '奋楫争先']
    ];
    sponsorData.forEach(item => createBillboard(root, item[0], item[1], item[2]));

    for (let i = 0; i < 18; i++) {
      createFlowerPot(root, (i % 2 ? 1 : -1) * random(7.5, 12.8), random(-23, 7), i);
    }

    for (let i = 0; i < 8; i++) {
      const blessing = node('a-entity', {
        position: `${random(-11.2, 11.2)} ${random(0.75, 1.35)} ${random(-20, 4)}`,
        rotation: `0 ${random(-35, 35)} 0`,
        'festival-sway': `amp: 0.025; speed: ${random(0.8, 1.5)}; rot: 8; phase: ${i}`,
        'quest-hotspot': 'type: blessing; value: 1; label: 挂上祈福牌'
      }, root);
      node('a-plane', { width: 0.34, height: 0.44, material: `shader: flat; color: ${i % 2 ? palette.gold : palette.red}` }, blessing);
      node('a-text', { position: '0 0 0.012', value: i % 2 ? '福' : '胜', align: 'center', width: 1.8, color: i % 2 ? palette.redDark : palette.cream }, blessing);
    }

    for (let i = 0; i < 5; i++) {
      const firework = node('a-cylinder', {
        position: `${random(-10, 10)} 0.18 ${random(-18, 2)}`,
        radius: 0.12,
        height: 0.36,
        material: `color: ${[palette.red, palette.gold, palette.blue, palette.purple, palette.orange][i]}`,
        'quest-hotspot': 'type: firework; value: 1; label: 放礼花'
      }, root);
      node('a-cone', { position: '0 0.28 0', radiusBottom: 0.12, radiusTop: 0.02, height: 0.22, material: `color: ${palette.cream}` }, firework);
    }
  }

  function createGrandStand(root, x, z, rotY) {
    const stand = node('a-entity', { position: `${x} 0 ${z}`, rotation: `0 ${rotY} 0` }, root);
    for (let row = 0; row < 4; row++) {
      node('a-box', {
        position: `0 ${0.16 + row * 0.22} ${row * 0.45}`,
        width: 4.8,
        height: 0.18,
        depth: 0.42,
        material: `color: ${row % 2 ? '#c99652' : '#d9ad64'}`
      }, stand);
      for (let i = 0; i < 7; i++) {
        createPerson(stand, -2.1 + i * 0.7, row * 0.45, row * 7 + i);
      }
    }
    node('a-text', { position: '0 1.55 1.45', value: 'VIP 看台', align: 'center', width: 5, color: palette.redDark }, stand);
  }

  function createJudgeTower(root, x, z) {
    const tower = node('a-entity', { position: `${x} 0 ${z}`, rotation: '0 18 0' }, root);
    node('a-box', { position: '0 0.2 0', width: 1.15, height: 0.18, depth: 1.15, material: `color: ${palette.stone}` }, tower);
    [-0.42, 0.42].forEach(px => [-0.42, 0.42].forEach(pz => {
      node('a-cylinder', { position: `${px} 0.88 ${pz}`, radius: 0.045, height: 1.55, material: `color: ${palette.wood}` }, tower);
    }));
    node('a-box', { position: '0 1.7 0', width: 1.45, height: 0.12, depth: 1.45, material: `color: ${palette.wood}` }, tower);
    node('a-cone', { position: '0 2.05 0', radiusBottom: 0.95, radiusTop: 0.18, height: 0.55, segmentsRadial: 4, material: `color: ${palette.red}` }, tower);
    node('a-text', { position: '0 1.92 -0.54', value: '裁判塔', align: 'center', width: 3, color: palette.cream }, tower);
  }

  function createFinishGate(root, x, z) {
    const gate = node('a-entity', { position: `${x} 0 ${z}` }, root);
    [-4.8, 4.8].forEach(px => {
      node('a-cylinder', { position: `${px} 1.55 0`, radius: 0.08, height: 3.1, material: `color: ${palette.red}` }, gate);
    });
    node('a-box', { position: '0 3.05 0', width: 10.2, height: 0.34, depth: 0.16, material: `color: ${palette.red}` }, gate);
    node('a-text', { position: '0 3.08 0.09', value: '冲刺线', align: 'center', width: 8, color: palette.cream }, gate);
    for (let i = 0; i < 12; i++) {
      node('a-box', {
        position: `${-4.4 + i * 0.8} 0.04 0`,
        width: 0.42,
        height: 0.025,
        depth: 1.1,
        material: `shader: flat; color: ${i % 2 ? palette.cream : palette.red}`
      }, gate);
    }
  }

  function createDock(root, x, z, rotY) {
    const dock = node('a-entity', { position: `${x} 0.07 ${z}`, rotation: `0 ${rotY} 0` }, root);
    node('a-box', { position: '0 0.08 0', width: 2.2, height: 0.12, depth: 1.2, material: `color: ${palette.wood}` }, dock);
    for (let i = 0; i < 4; i++) {
      node('a-cylinder', { position: `${-0.9 + i * 0.6} -0.05 -0.48`, radius: 0.04, height: 0.6, material: `color: ${palette.wood}` }, dock);
    }
    node('a-text', { position: '0 0.28 -0.62', value: '补给码头', align: 'center', width: 3, color: palette.cream }, dock);
  }

  function createPodium(root, x, z) {
    const podium = node('a-entity', { position: `${x} 0 ${z}`, rotation: '0 -45 0' }, root);
    [0, 1, 2].forEach((rank, idx) => {
      node('a-box', {
        position: `${(idx - 1) * 0.58} ${0.12 + (2 - idx) * 0.08} 0`,
        width: 0.52,
        height: 0.24 + (2 - idx) * 0.16,
        depth: 0.58,
        material: `color: ${idx === 0 ? palette.gold : idx === 1 ? palette.stone : palette.orange}`
      }, podium);
      node('a-text', { position: `${(idx - 1) * 0.58} 0.62 0.31`, value: String(idx + 1), align: 'center', width: 2, color: palette.ink }, podium);
    });
    node('a-torus', { position: '0 0.95 0', rotation: '90 0 0', radius: 0.24, radiusTubular: 0.035, material: `color: ${palette.gold}; emissive: ${palette.gold}; emissiveIntensity: 0.2`, 'quest-hotspot': 'type: trophy; value: 1; label: 领取奖杯' }, podium);
  }

  function createBooth(root, x, z, label, color) {
    const booth = node('a-entity', { position: `${x} 0 ${z}`, rotation: `0 ${x > 0 ? -90 : 90} 0` }, root);
    node('a-box', { position: '0 0.35 0', width: 1.3, height: 0.18, depth: 0.76, material: `color: ${palette.wood}` }, booth);
    node('a-box', { position: '0 1.02 0', width: 1.48, height: 0.12, depth: 0.9, material: `color: ${color}` }, booth);
    [-0.55, 0.55].forEach(px => {
      node('a-cylinder', { position: `${px} 0.72 -0.32`, radius: 0.025, height: 0.78, material: `color: ${palette.wood}` }, booth);
      node('a-cylinder', { position: `${px} 0.72 0.32`, radius: 0.025, height: 0.78, material: `color: ${palette.wood}` }, booth);
    });
    node('a-text', { position: '0 1.1 -0.47', value: label, align: 'center', width: 3.4, color: color === palette.gold ? palette.redDark : palette.cream }, booth);
  }

  function createBillboard(root, x, z, label) {
    const board = node('a-entity', { position: `${x} 0.4 ${z}`, rotation: `0 ${x > 0 ? -18 : 18} 0`, 'quest-hotspot': 'type: sponsor; value: 1; label: 打卡赞助牌' }, root);
    node('a-box', { position: '0 0 0', width: 2.35, height: 0.65, depth: 0.06, material: `color: ${palette.cream}` }, board);
    node('a-text', { position: '0 0 0.04', value: label, align: 'center', width: 4.2, color: palette.redDark }, board);
    [-1.05, 1.05].forEach(px => node('a-cylinder', { position: `${px} -0.52 0`, radius: 0.025, height: 1.05, material: `color: ${palette.wood}` }, board));
  }

  function createFlowerPot(root, x, z, idx) {
    const pot = node('a-entity', { position: `${x} 0 ${z}` }, root);
    node('a-cylinder', { position: '0 0.12 0', radius: 0.13, height: 0.22, material: `color: ${idx % 2 ? palette.redDark : palette.orange}` }, pot);
    for (let i = 0; i < 4; i++) {
      node('a-sphere', {
        position: `${random(-0.11, 0.11)} ${random(0.25, 0.42)} ${random(-0.11, 0.11)}`,
        radius: 0.055,
        material: `color: ${[palette.red, palette.gold, palette.purple, palette.cream][(idx + i) % 4]}`
      }, pot);
    }
  }

  function createGate(root, x, z, label) {
    const gate = node('a-entity', { position: `${x} 0 ${z}`, rotation: `0 ${x > 0 ? -90 : 90} 0` }, root);
    node('a-cylinder', { position: '-1.1 1.1 0', radius: 0.06, height: 2.2, material: `color: ${palette.red}` }, gate);
    node('a-cylinder', { position: '1.1 1.1 0', radius: 0.06, height: 2.2, material: `color: ${palette.red}` }, gate);
    node('a-box', { position: '0 2.15 0', width: 2.65, height: 0.34, depth: 0.08, material: `color: ${palette.red}` }, gate);
    node('a-text', { position: '0 2.17 0.055', value: label, align: 'center', width: 5.5, color: palette.cream }, gate);
    [-0.75, 0, 0.75].forEach((lx, idx) => createLantern(gate, lx, 1.62, idx, true));
  }

  function createLantern(parent, x, y, idx, small) {
    const lantern = node('a-entity', {
      position: `${x} ${y} 0`,
      'festival-sway': `amp: ${small ? 0.035 : 0.06}; speed: ${1.1 + idx * 0.24}; rot: 7; phase: ${idx}`
    }, parent);
    node('a-sphere', { position: '0 0 0', radius: small ? 0.13 : 0.21, scale: '1 1.15 1', material: `color: ${palette.red}; emissive: #8a241c; emissiveIntensity: 0.18` }, lantern);
    node('a-cylinder', { position: '0 0.17 0', radius: small ? 0.06 : 0.09, height: 0.035, material: `color: ${palette.gold}` }, lantern);
    node('a-cylinder', { position: '0 -0.17 0', radius: small ? 0.06 : 0.09, height: 0.035, material: `color: ${palette.gold}` }, lantern);
    return lantern;
  }

  function createReeds(root, x, z) {
    const reed = node('a-entity', { position: `${x} 0 ${z}` }, root);
    for (let i = 0; i < 4; i++) {
      node('a-cylinder', { position: `${random(-0.16, 0.16)} 0.38 ${random(-0.16, 0.16)}`, rotation: `0 0 ${random(-10, 10)}`, radius: 0.012, height: random(0.6, 1.1), material: 'color: #9a8650' }, reed);
      node('a-cone', { position: `${random(-0.16, 0.16)} 0.93 ${random(-0.16, 0.16)}`, radiusBottom: 0.045, radiusTop: 0.01, height: 0.24, material: 'color: #dbc27a' }, reed);
    }
  }

  function createQuestItems(root) {
    for (let i = 0; i < 5; i++) {
      const lantern = createLantern(root, random(-4.4, 4.4), random(1.5, 2.9), i, false);
      lantern.setAttribute('position', `${random(-7, 7)} ${random(1.7, 3)} ${random(-20, 4)}`);
      lantern.setAttribute('quest-hotspot', 'type: lantern; value: 1; label: 点亮灯笼');
      attachManualHotspot(lantern, 'type: lantern; value: 1; label: 点亮灯笼');
    }
    for (let i = 0; i < 6; i++) {
      const zongzi = createZongzi(root, random(-5.6, 5.6), random(-23, 4), i);
      zongzi.setAttribute('quest-hotspot', 'type: leaf; value: 1; label: 收集粽叶');
      attachManualHotspot(zongzi, 'type: leaf; value: 1; label: 收集粽叶');
    }
    for (let i = 0; i < 4; i++) {
      const charm = node('a-torus', {
        position: `${random(-3.8, 3.8)} 1.2 ${random(-18, 3)}`,
        rotation: '90 0 0',
        radius: 0.28,
        radiusTubular: 0.018,
        material: `color: ${[palette.red, palette.gold, palette.blue, palette.green][i]}; emissive: ${[palette.red, palette.gold, palette.blue, palette.green][i]}; emissiveIntensity: 0.22`,
        'festival-sway': `amp: 0.08; speed: ${1.2 + i * 0.2}; rot: 12; phase: ${i}`,
        'quest-hotspot': 'type: charm; value: 1; label: 编织五彩绳'
      }, root);
      charm.classList.add('clickable');
    }
  }

  function createZongzi(root, x, z, idx) {
    const zongzi = node('a-entity', {
      position: `${x} 0.22 ${z}`,
      rotation: `0 ${random(0, 180)} 0`,
      'festival-sway': `amp: 0.06; speed: ${1 + idx * 0.12}; rot: 6; phase: ${idx}`
    }, root);
    node('a-cone', { position: '0 0.22 0', radiusBottom: 0.18, radiusTop: 0.04, height: 0.42, segmentsRadial: 4, material: `color: ${palette.leaf}` }, zongzi);
    node('a-box', { position: '0 0.22 0', width: 0.42, height: 0.018, depth: 0.04, material: `color: ${palette.cream}` }, zongzi);
    node('a-box', { position: '0 0.22 0', width: 0.04, height: 0.018, depth: 0.42, material: `color: ${palette.cream}` }, zongzi);
    return zongzi;
  }

  function createTree(root, x, z, s) {
    const tree = node('a-entity', { position: `${x} 0 ${z}`, scale: `${s} ${s} ${s}` }, root);
    node('a-cylinder', { position: '0 0.38 0', radius: 0.08, height: 0.75, material: `color: ${palette.wood}` }, tree);
    node('a-cone', { position: '0 1.02 0', radiusBottom: 0.42, radiusTop: 0.05, height: 0.95, segmentsRadial: 7, material: `color: ${palette.leaf}` }, tree);
  }

  function bindControls() {
    document.querySelectorAll('[data-game-action]').forEach(button => {
      button.addEventListener('click', () => {
        const action = button.getAttribute('data-game-action');
        if (action === 'drum') completeInteraction('drum', 1, '鼓点加速');
        if (action === 'lantern') completeInteraction('lantern', 1, '点亮灯笼');
        if (action === 'confetti') triggerConfetti();
      });
    });

    document.querySelectorAll('[data-camera-view]').forEach(button => {
      button.addEventListener('click', () => setCameraView(button.getAttribute('data-camera-view')));
    });

    window.addEventListener('keydown', event => {
      if (event.key === '1') setMode('race');
      if (event.key === '2') setMode('paint');
      if (event.key === '3') setMode('festival');
      if (event.key.toLowerCase() === 'v') cycleCameraView();
      if (event.key.toLowerCase() === 'e') completeInteraction(nextQuestType(), 1, '快捷互动');
    });
  }

  function completeInteraction(type, value, label) {
    const map = { drum: 0, lantern: 1, leaf: 2, charm: 3, blessing: 3, firework: 3, trophy: 3, sponsor: 1 };
    const idx = map[type];
    if (idx !== undefined) {
      const quest = state.quests[idx];
      if (quest.current < quest.target) {
        quest.current = Math.min(quest.target, quest.current + value);
      }
    }
    state.activeQuest = state.quests.findIndex(q => q.current < q.target);
    if (state.activeQuest < 0) state.activeQuest = state.quests.length - 1;
    state.score += 120 * state.combo;
    state.combo = Math.min(9, state.combo + 1);
    state.lanePower = Math.min(68, state.lanePower + (type === 'drum' ? 3 : 1));
    if (type === 'lantern') state.lanterns += value;
    if (type === 'charm') state.charms += value;
    if (type === 'firework') triggerConfetti(12);
    showToast(`${label} +${120 * state.combo} 声望`);
    updateHud();
  }

  function triggerConfetti(countOverride) {
    const scene = document.querySelector('a-scene');
    const root = document.getElementById('commercial-dragonboat-world') || scene;
    const count = countOverride || 24;
    for (let i = 0; i < count; i++) {
      const shard = node('a-box', {
        position: `${random(-4, 4)} ${random(1.8, 4.2)} ${random(-18, -2)}`,
        rotation: `${random(0, 180)} ${random(0, 180)} ${random(0, 180)}`,
        width: 0.05,
        height: 0.012,
        depth: 0.18,
        material: `shader: flat; color: ${[palette.red, palette.gold, palette.blue, palette.green, palette.cream][i % 5]}`,
        animation__fall: `property: position; to: ${random(-4, 4)} 0.25 ${random(-18, -2)}; dur: ${random(1300, 2400)}; easing: easeOutQuad`,
        animation__spin: `property: rotation; to: ${random(120, 480)} ${random(120, 480)} ${random(120, 480)}; dur: ${random(900, 1600)}; easing: linear`
      }, root);
      setTimeout(() => shard.remove(), 2600);
    }
    state.score += 90;
    state.combo = Math.min(9, state.combo + 1);
    showToast('节庆彩屑释放，赛场氛围提升。');
    updateHud();
  }

  function nextQuestType() {
    const order = ['drum', 'lantern', 'leaf', 'charm'];
    const idx = state.quests.findIndex(q => q.current < q.target);
    return order[Math.max(0, idx)];
  }

  function setMode(mode) {
    state.mode = mode;
    if (mode === 'race') state.lanePower = Math.min(100, state.lanePower + 5);
    if (mode === 'paint') showToast('创作模式：用画笔补充你的节庆图案。');
    if (mode === 'festival') triggerConfetti();
    updateHud();
  }

  function setCameraView(mode) {
    state.cameraMode = mode || 'river';
    document.querySelectorAll('[data-camera-view]').forEach(button => {
      button.classList.toggle('active', button.getAttribute('data-camera-view') === state.cameraMode);
    });
    const labels = { river: '河道跟随', bank: '岸边观赛', top: '俯瞰赛场', drum: '鼓手近景', dragon: '龙头特写' };
    showToast(`视角切换：${labels[state.cameraMode] || '河道跟随'}`);
  }

  function cycleCameraView() {
    const views = ['river', 'bank', 'top', 'drum', 'dragon'];
    const idx = views.indexOf(state.cameraMode);
    setCameraView(views[(idx + 1) % views.length]);
  }

  function updateHud() {
    const quest = state.quests[state.activeQuest] || state.quests[state.quests.length - 1];
    const progress = Math.round((quest.current / quest.target) * 100);
    setText(selectors.questText, `${quest.label} ${quest.current}/${quest.target}`);
    setStyle(selectors.questProgress, 'width', `${progress}%`);
    setText(selectors.score, String(state.score));
    setText(selectors.combo, `${state.combo}x`);
    setText(selectors.power, `${state.lanePower}%`);
    setText(selectors.mode, ({ race: '竞速', paint: '创作', festival: '庆典' })[state.mode] || '竞速');
  }

  function showToast(text) {
    const toast = document.getElementById(selectors.toast);
    if (!toast) return;
    toast.textContent = text;
    toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove('show'), 2200);
  }

  function node(tag, attrs, parent) {
    const el = document.createElement(tag);
    Object.keys(attrs || {}).forEach(key => {
      const value = attrs[key];
      if (value !== undefined && value !== null) {
        el.setAttribute(toKebab(key), String(value));
      }
    });
    if (attrs && attrs['quest-hotspot']) attachManualHotspot(el, attrs['quest-hotspot']);
    if (parent) parent.appendChild(el);
    return el;
  }

  function attachManualHotspot(el, config) {
    const data = parseHotspotConfig(config);
    el.classList.add('clickable');
    el.dataset.manualHotspotReady = '1';
    el.addEventListener('click', function () {
      if (el.dataset.hotspotUsed === '1') return;
      el.dataset.hotspotUsed = '1';
      completeInteraction(data.type, data.value, data.label);
      el.setAttribute('material', 'opacity: 0.45; transparent: true');
    });
  }

  function parseHotspotConfig(config) {
    const data = { type: 'lantern', value: 1, label: '互动点' };
    String(config).split(';').forEach(part => {
      const pieces = part.split(':');
      if (pieces.length < 2) return;
      const key = pieces[0].trim();
      const value = pieces.slice(1).join(':').trim();
      if (key === 'type') data.type = value;
      if (key === 'value') data.value = Number(value) || 1;
      if (key === 'label') data.label = value;
    });
    return data;
  }

  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function setStyle(id, prop, value) {
    const el = document.getElementById(id);
    if (el) el.style[prop] = value;
  }

  function random(min, max) {
    return Math.random() * (max - min) + min;
  }

  function lerp(from, to, amount) {
    return from + (to - from) * amount;
  }

  function toKebab(value) {
    return value.replace(/[A-Z]/g, match => '-' + match.toLowerCase());
  }

  boot();
})();
