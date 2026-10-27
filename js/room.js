// The 3D studio desk. Everything here is built from Three.js primitives and
// procedural materials. To swap an object for a .glb, see CLAUDE.md.
import * as THREE from 'three';
import { CSS3DRenderer, CSS3DObject } from '/vendor/three/CSS3DRenderer.js';
import { RoundedBoxGeometry } from '/vendor/three/RoundedBoxGeometry.js';

const FOV = 32;
const SCREEN_PX_W = 1280; // the StudioOS root is 1280 x 800 CSS px
const SCREEN = { w: 0.5, h: 0.3125, x: 0, y: 1.11, z: -0.0975 };
const WIDE = {
  pos: new THREE.Vector3(1.5, 1.62, 2.45),
  look: new THREE.Vector3(-0.12, 0.98, -0.12),
};
const ZOOM_MS = 1600;
const LAMP_ON = { spot: 9, bulb: 3.2, hemi: 0.34 };
const LAMP_OFF = { spot: 0, bulb: 0.15, hemi: 0.1 };

const UP_NEG = new THREE.Vector3(0, -1, 0);

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function makeWoodTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#6e4d33';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 180; i++) {
    const y = Math.random() * 512;
    const shade = 20 + Math.random() * 25;
    g.strokeStyle = `rgba(${shade + 20}, ${shade + 8}, ${shade - 6}, ${0.05 + Math.random() * 0.12})`;
    g.lineWidth = 0.5 + Math.random() * 2.2;
    g.beginPath();
    g.moveTo(0, y);
    for (let x = 0; x <= 512; x += 32) {
      g.lineTo(x, y + Math.sin(x * 0.02 + i) * 2 + (Math.random() - 0.5) * 1.2);
    }
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

function makePosterTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 720;
  const g = c.getContext('2d');
  g.fillStyle = '#e9e1d1';
  g.fillRect(0, 0, 512, 720);
  g.fillStyle = '#1d1b18';
  g.beginPath();
  g.arc(256, 300, 120, Math.PI * 1.05, Math.PI * 1.95);
  g.lineTo(330, 470);
  g.lineTo(182, 470);
  g.closePath();
  g.fill();
  g.fillRect(250, 470, 12, 110);
  g.fillStyle = '#e8934a';
  g.beginPath();
  g.arc(256, 300, 26, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#1d1b18';
  g.font = '34px Silkscreen, monospace';
  g.textAlign = 'center';
  g.fillText('STUDIO BY TWO', 256, 650);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Places a thin cylinder between two points (used for the lamp arms).
function limb(from, to, radius, material) {
  const dir = new THREE.Vector3().subVectors(to, from);
  const len = dir.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, 16), material);
  m.position.copy(from).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  m.castShadow = true;
  return m;
}

function place(mesh, x, y, z, { cast = true, receive = true } = {}) {
  mesh.position.set(x, y, z);
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  return mesh;
}

export function createRoom({ canvasHost, cssHost, screenEl, onZoomChange, onLampChange }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  canvasHost.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x12110f);
  const camera = new THREE.PerspectiveCamera(FOV, window.innerWidth / window.innerHeight, 0.01, 40);
  camera.position.copy(WIDE.pos);
  camera.lookAt(WIDE.look);

  // ---- materials -----------------------------------------------------------
  const woodTex = makeWoodTexture();
  const mat = {
    wood: new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.55 }),
    darkWood: new THREE.MeshStandardMaterial({ color: 0x3a2a1e, roughness: 0.6 }),
    wall: new THREE.MeshStandardMaterial({ color: 0x35302a, roughness: 0.95 }),
    floor: new THREE.MeshStandardMaterial({ color: 0x252019, roughness: 0.9 }),
    beige: new THREE.MeshStandardMaterial({ color: 0xcfc5b0, roughness: 0.55 }),
    bezel: new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.4 }),
    plastic: new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.45 }),
    keys: new THREE.MeshStandardMaterial({ color: 0x3a3936, roughness: 0.6 }),
    pad: new THREE.MeshStandardMaterial({ color: 0x2b2622, roughness: 0.95 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.35, metalness: 0.6 }),
    shade: new THREE.MeshStandardMaterial({ color: 0xf1ece2, roughness: 0.6, side: THREE.DoubleSide, emissive: 0xe8934a, emissiveIntensity: 0 }),
    terracotta: new THREE.MeshStandardMaterial({ color: 0xb5603a, roughness: 0.7 }),
    glaze: new THREE.MeshStandardMaterial({ color: 0x9db0a0, roughness: 0.3 }),
    red: new THREE.MeshStandardMaterial({ color: 0xe6502f, roughness: 0.5 }),
    ink: new THREE.MeshStandardMaterial({ color: 0x1d1b18, roughness: 0.5 }),
    ledOn: new THREE.MeshBasicMaterial({ color: 0x7dff9a }),
    bulb: new THREE.MeshBasicMaterial({ color: 0xffd9a0 }),
  };
  mat.bulb.color.setScalar(1);

  // ---- room ----------------------------------------------------------------
  const room = new THREE.Group();
  scene.add(room);

  const floor = place(new THREE.Mesh(new THREE.PlaneGeometry(10, 10), mat.floor), 0, 0, 0, { cast: false });
  floor.rotation.x = -Math.PI / 2;
  room.add(floor);

  const back = place(new THREE.Mesh(new THREE.PlaneGeometry(10, 5), mat.wall), 0, 2.5, -0.72, { cast: false });
  room.add(back);

  const side = place(new THREE.Mesh(new THREE.PlaneGeometry(10, 5), mat.wall), -2.2, 2.5, 0, { cast: false });
  side.rotation.y = Math.PI / 2;
  room.add(side);

  // Poster on the back wall.
  const poster = place(
    new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.65), new THREE.MeshStandardMaterial({ map: makePosterTexture(), roughness: 0.8 })),
    -0.95, 1.5, -0.7,
    { cast: false }
  );
  room.add(poster);

  // ---- desk ----------------------------------------------------------------
  const deskTop = place(new THREE.Mesh(new RoundedBoxGeometry(1.7, 0.04, 0.8, 3, 0.012), mat.wood), 0, 0.74, 0);
  room.add(deskTop);
  for (const [x, z] of [[-0.8, -0.34], [0.8, -0.34], [-0.8, 0.34], [0.8, 0.34]]) {
    room.add(place(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.72, 0.05), mat.darkWood), x, 0.36, z));
  }

  // Shelf on the back wall with three design objects.
  room.add(place(new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.03, 0.22), mat.darkWood), 0.85, 1.45, -0.6));
  for (const x of [0.4, 1.3]) {
    room.add(place(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, 0.2), mat.darkWood), x, 1.38, -0.6));
  }

  // Object 1: a turned vessel (lathe profile).
  const vesselProfile = [
    [0.0, 0.0], [0.05, 0.0], [0.07, 0.04], [0.06, 0.12], [0.035, 0.2], [0.04, 0.23], [0.045, 0.24], [0.035, 0.245], [0.0, 0.245],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const vessel = place(new THREE.Mesh(new THREE.LatheGeometry(vesselProfile, 48), mat.glaze), 0.5, 1.465, -0.52);
  room.add(vessel);

  // Object 2: a cube with a round recess (a stand-in for a cut block).
  const block = new THREE.Group();
  block.add(place(new THREE.Mesh(new RoundedBoxGeometry(0.14, 0.14, 0.14, 2, 0.006), mat.beige), 0, 0.07, 0));
  block.add(place(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.01, 32), mat.ink), 0, 0.141, 0, { cast: false }));
  block.position.set(0.82, 1.465, -0.52);
  room.add(block);

  // Object 3: a stack of three discs.
  const discs = new THREE.Group();
  [[0.09, 0.03, mat.red], [0.07, 0.025, mat.beige], [0.11, 0.035, mat.ink]].forEach(([r, h, m], i, arr) => {
    const y = arr.slice(0, i).reduce((s, a) => s + a[1], 0) + h / 2;
    discs.add(place(new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 40), m), 0, y, 0));
  });
  discs.position.set(1.18, 1.465, -0.52);
  room.add(discs);

  // ---- monitor -------------------------------------------------------------
  const monitor = new THREE.Group();
  monitor.userData.action = 'monitor';
  room.add(monitor);
  const stand = place(new THREE.Mesh(new RoundedBoxGeometry(0.24, 0.018, 0.18, 2, 0.006), mat.beige), 0, 0.769, -0.2);
  monitor.add(stand);
  monitor.add(place(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.12, 0.04), mat.beige), 0, 0.84, -0.22));
  const body = place(new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.48, 0.2, 6, 0.03), mat.beige), 0, 1.1, -0.2);
  monitor.add(body);
  monitor.add(place(new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.42), mat.bezel), 0, 1.1, -0.0985, { cast: false }));
  monitor.add(place(new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.01, 12), mat.ledOn), 0.25, 0.9, -0.0975, { cast: false })
    .translateY(0).rotateX(Math.PI / 2));
  for (let i = 0; i < 3; i++) {
    monitor.add(place(new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.01, 0.01), mat.plastic), 0.2 + i * 0.03, 0.9, -0.0985, { cast: false }));
  }
  // Invisible hit target for the screen (raycast only).
  const hit = new THREE.Mesh(
    new THREE.PlaneGeometry(SCREEN.w, SCREEN.h),
    new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false })
  );
  hit.position.set(SCREEN.x, SCREEN.y, SCREEN.z + 0.002);
  hit.userData.action = 'monitor';
  room.add(hit);

  // ---- keyboard, mouse, desk objects ---------------------------------------
  room.add(place(new THREE.Mesh(new RoundedBoxGeometry(0.44, 0.02, 0.15, 3, 0.008), mat.plastic), 0, 0.772, 0.2));
  const keyGeo = new THREE.BoxGeometry(0.026, 0.012, 0.026);
  const keys = new THREE.InstancedMesh(keyGeo, mat.keys, 52);
  const m4 = new THREE.Matrix4();
  let k = 0;
  for (let row = 0; row < 4; row++) {
    const count = row === 3 ? 10 : 13;
    for (let col = 0; col < count; col++) {
      const x = -0.19 + col * 0.032 + (count === 10 ? 0.048 : 0);
      m4.makeTranslation(x, 0.7915, 0.14 + row * 0.03);
      keys.setMatrixAt(k++, m4);
    }
  }
  keys.count = k;
  keys.castShadow = true;
  room.add(keys);

  room.add(place(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.004, 0.24), mat.pad), 0.38, 0.763, 0.2));
  room.add(place(new THREE.Mesh(new RoundedBoxGeometry(0.065, 0.02, 0.1, 3, 0.01), mat.plastic), 0.38, 0.775, 0.2));

  // Mug (turned).
  const mugProfile = [
    [0.0, 0.0], [0.04, 0.0], [0.042, 0.005], [0.042, 0.095], [0.036, 0.095], [0.034, 0.02], [0.0, 0.02],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  room.add(place(new THREE.Mesh(new THREE.LatheGeometry(mugProfile, 40), mat.terracotta), 0.6, 0.76, 0.2));

  // Vessel on the desk, a second turned form.
  room.add(place(new THREE.Mesh(new THREE.LatheGeometry(vesselProfile.map((p) => new THREE.Vector2(p.x * 1.2, p.y * 0.8)), 40), mat.glaze), 0.6, 0.76, -0.2));

  // Books.
  [[0.14, 0.02, 0.1, 0xc23b22], [0.13, 0.025, 0.095, 0x2f4858], [0.15, 0.018, 0.11, 0xe0c27a]].forEach(([w, h, d, c], i, arr) => {
    const y = 0.76 + arr.slice(0, i).reduce((s, a) => s + a[1], 0) + h / 2;
    const b = place(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 })), -0.55, y, -0.22);
    b.rotation.y = (i - 1) * 0.08;
    room.add(b);
  });

  // ---- desk lamp (signature object) ----------------------------------------
  const lamp = new THREE.Group();
  lamp.userData.action = 'lamp';
  room.add(lamp);
  const base = new THREE.Vector3(-0.68, 0.77, 0.02);
  const joint1 = new THREE.Vector3(-0.66, 1.2, -0.06);
  const joint2 = new THREE.Vector3(-0.55, 1.33, 0.02);
  const head = new THREE.Vector3(-0.5, 1.35, 0.12);
  lamp.add(place(new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.09, 0.02, 40), mat.metal), base.x, base.y + 0.01, base.z));
  lamp.add(limb(base, joint1, 0.012, mat.metal));
  lamp.add(limb(joint1, joint2, 0.01, mat.metal));
  lamp.add(limb(joint2, head, 0.01, mat.metal));
  for (const j of [joint1, joint2]) {
    lamp.add(place(new THREE.Mesh(new THREE.SphereGeometry(0.018, 16, 12), mat.metal), j.x, j.y, j.z));
  }

  // The shade points down and slightly toward the desk centre.
  const shadeDir = new THREE.Vector3(0.35, -1, 0.45).normalize();
  const shadeGroup = new THREE.Group();
  shadeGroup.position.copy(head);
  shadeGroup.quaternion.setFromUnitVectors(UP_NEG, shadeDir);
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.105, 0.13, 48, 1, true), mat.shade);
  shade.position.y = -0.065;
  shade.castShadow = true;
  shadeGroup.add(shade);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.02, 16, 12), mat.bulb);
  bulb.position.y = -0.03;
  shadeGroup.add(bulb);
  lamp.add(shadeGroup);

  const lampLight = new THREE.SpotLight(0xffc27a, 0, 3.2, Math.PI / 3.1, 0.65, 1.6);
  lampLight.position.copy(head).addScaledVector(shadeDir, 0.02);
  const lampTarget = new THREE.Object3D();
  const toDesk = (head.y - 0.77) / -shadeDir.y;
  lampTarget.position.copy(head).addScaledVector(shadeDir, toDesk);
  room.add(lampTarget);
  lampLight.target = lampTarget;
  lampLight.castShadow = true;
  lampLight.shadow.mapSize.set(1024, 1024);
  lampLight.shadow.bias = -0.0004;
  lampLight.shadow.normalBias = 0.02;
  lampLight.shadow.camera.near = 0.05;
  lampLight.shadow.camera.far = 3;
  room.add(lampLight);

  // ---- lights --------------------------------------------------------------
  const hemi = new THREE.HemisphereLight(0x5a4c40, 0x0c0a09, LAMP_OFF.hemi);
  scene.add(hemi);
  const monitorLight = new THREE.PointLight(0x8fb3e6, 0.12, 1.2, 2);
  monitorLight.position.set(0, 1.12, 0.02);
  room.add(monitorLight);

  // ---- CSS layer: the StudioOS screen --------------------------------------
  const cssRenderer = new CSS3DRenderer({ element: cssHost });
  const cssScene = new THREE.Scene();
  const screenObj = new CSS3DObject(screenEl);
  screenObj.position.set(SCREEN.x, SCREEN.y, SCREEN.z);
  screenObj.scale.setScalar(SCREEN.w / SCREEN_PX_W);
  cssScene.add(screenObj);

  // ---- state ---------------------------------------------------------------
  const state = {
    mode: 'wide', // 'wide' | 'moving' | 'zoomed'
    lamp: true,
    lampLevel: 0,
    tween: null,
    look: WIDE.look.clone(), // where the camera is looking, kept for tweens
    pointer: { x: 0, y: 0 },
    parallax: new THREE.Vector2(),
    last: performance.now(),
  };

  function screenFitDistance() {
    const aspect = camera.aspect;
    const tan = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const byHeight = (SCREEN.h / 0.93) / (2 * tan);
    const byWidth = (SCREEN.w / 0.93) / (2 * tan * aspect);
    return Math.max(byHeight, byWidth);
  }

  function zoomPose() {
    return {
      pos: new THREE.Vector3(SCREEN.x, SCREEN.y, SCREEN.z + screenFitDistance()),
      look: new THREE.Vector3(SCREEN.x, SCREEN.y, SCREEN.z),
    };
  }

  function setMode(mode) {
    state.mode = mode;
    onZoomChange?.(mode);
  }

  function tweenTo(pose, ms, onDone) {
    state.tween = {
      fromPos: camera.position.clone(),
      fromLook: state.look.clone(),
      toPos: pose.pos,
      toLook: pose.look,
      t0: performance.now(),
      ms,
      onDone,
    };
  }

  function zoomIn() {
    if (state.mode !== 'wide') return;
    setMode('moving');
    tweenTo(zoomPose(), ZOOM_MS, () => setMode('zoomed'));
  }

  function zoomOut() {
    if (state.mode !== 'zoomed') return;
    setMode('moving');
    tweenTo({ pos: WIDE.pos.clone(), look: WIDE.look.clone() }, ZOOM_MS, () => setMode('wide'));
  }

  function toggleLamp() {
    if (state.mode === 'moving') return;
    state.lamp = !state.lamp;
    onLampChange?.(state.lamp);
    return state.lamp;
  }

  // ---- picking -------------------------------------------------------------
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const pickables = [hit, body, lamp];

  function pick(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(pickables, true);
    for (const h of hits) {
      let o = h.object;
      while (o) {
        if (o.userData.action) return o.userData.action;
        o = o.parent;
      }
    }
    return null;
  }

  canvasHost.addEventListener('click', (e) => {
    if (state.mode !== 'wide') return;
    const action = pick(e);
    if (action === 'monitor') zoomIn();
    if (action === 'lamp') toggleLamp();
  });

  canvasHost.addEventListener('pointermove', (e) => {
    const rect = renderer.domElement.getBoundingClientRect();
    state.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    state.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    if (state.mode === 'wide') {
      canvasHost.style.cursor = pick(e) ? 'pointer' : '';
    }
  });

  // ---- resize --------------------------------------------------------------
  function onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h);
    cssRenderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (state.mode === 'zoomed') {
      const p = zoomPose();
      camera.position.copy(p.pos);
      state.look.copy(p.look);
      camera.lookAt(state.look);
    }
  }
  window.addEventListener('resize', onResize);

  // ---- frame loop ----------------------------------------------------------
  function frame(now) {
    const dt = Math.min(0.1, (now - state.last) / 1000);
    state.last = now;

    if (state.tween) {
      const tw = state.tween;
      const t = Math.min(1, (now - tw.t0) / tw.ms);
      const e = easeInOutCubic(t);
      camera.position.lerpVectors(tw.fromPos, tw.toPos, e);
      state.look.lerpVectors(tw.fromLook, tw.toLook, e);
      camera.lookAt(state.look);
      if (t >= 1) {
        const done = tw.onDone;
        state.tween = null;
        done?.();
      }
    } else if (state.mode === 'wide') {
      // A gentle parallax that follows the pointer.
      state.parallax.x += (state.pointer.x * 0.05 - state.parallax.x) * (1 - Math.exp(-dt * 3));
      state.parallax.y += (state.pointer.y * 0.025 - state.parallax.y) * (1 - Math.exp(-dt * 3));
      camera.position.set(WIDE.pos.x + state.parallax.x, WIDE.pos.y + state.parallax.y, WIDE.pos.z);
      camera.lookAt(WIDE.look);
    }

    // Lamp: ease the light in or out so the switch feels physical.
    const target = state.lamp ? 1 : 0;
    state.lampLevel += (target - state.lampLevel) * (1 - Math.exp(-dt * 7));
    const L = state.lampLevel;
    lampLight.intensity = LAMP_OFF.spot + (LAMP_ON.spot - LAMP_OFF.spot) * L;
    mat.shade.emissiveIntensity = 0.12 * L;
    mat.bulb.color.setRGB(0.25 + 0.75 * L, 0.2 + 0.6 * L, 0.1 + 0.3 * L);
    hemi.intensity = LAMP_OFF.hemi + (LAMP_ON.hemi - LAMP_OFF.hemi) * L;
    monitorLight.intensity = 0.12 + 0.12 * (1 - L);

    renderer.render(scene, camera);
    cssRenderer.render(cssScene, camera);
  }

  renderer.setAnimationLoop(frame);
  onResize();

  return {
    compile() {
      return renderer.compileAsync(scene, camera);
    },
    zoomIn,
    zoomOut,
    toggleLamp,
    get zoomed() {
      return state.mode === 'zoomed';
    },
    get mode() {
      return state.mode;
    },
    get lampOn() {
      return state.lamp;
    },
    dispose() {
      renderer.setAnimationLoop(null);
      window.removeEventListener('resize', onResize);
    },
  };
}
