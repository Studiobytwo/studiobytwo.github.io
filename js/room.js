// The 3D studio desk. Everything here is built from Three.js primitives and
// procedural materials. To swap an object for a .glb, see CLAUDE.md.
import * as THREE from 'three';
import { CSS3DRenderer, CSS3DObject } from '/vendor/three/CSS3DRenderer.js';
import { RoundedBoxGeometry } from '/vendor/three/RoundedBoxGeometry.js';
import { RoomEnvironment } from '/vendor/three/RoomEnvironment.js';

const FOV = 32;
const SCREEN_PX_W = 1280; // the StudioOS root is 1280 x 800 CSS px
const SCREEN = { w: 0.5, h: 0.3125, x: 0, y: 1.11, z: -0.0975 };
const WIDE = {
  pos: new THREE.Vector3(2.0, 1.75, 3.3),
  look: new THREE.Vector3(-0.2, 1.5, -0.2),
};
const ZOOM_MS = 1600;
const LAMP_ON = { spot: 5, bulb: 3.2, hemi: 0.55, bounce: 0.9 };
const LAMP_OFF = { spot: 0, bulb: 0.15, hemi: 0.1, bounce: 0 };
const REFUSAL_MAX = { light: 1.1, glow: 3.2, halo: 0.75 }; // at 100% on the dimmer (light is per globe)
// The Refusal's rods are 2 m, 1.25 m and 0.75 m long; the room shows them at this scale.
const REFUSAL_SCALE = 1; // real size: the room is built in metres
const REFUSAL_BOX_Y = 2.15; // box centre, high on the wall, about 30 cm below the ceiling
const CEILING_Y = 2.52;

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

// Stucco frieze: a repeating band of scrolls and leaves, as in old German
// buildings. Used as colour and as a bump map so it reads as relief.
function makeFriezeTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 512, 96);
  g.strokeStyle = '#d2ccc1';
  g.fillStyle = '#ddd8ce';
  g.lineCap = 'round';
  for (let i = 0; i < 4; i++) {
    const x = i * 128 + 64;
    // a scroll on each side of a central leaf
    for (const dir of [-1, 1]) {
      g.lineWidth = 5;
      g.beginPath();
      for (let t = 0; t < 1; t += 0.02) {
        const a = t * Math.PI * 3.2;
        const r = 30 * (1 - t);
        g.lineTo(x + dir * (18 + Math.cos(a) * r), 48 + Math.sin(a) * r * 0.9);
      }
      g.stroke();
    }
    g.beginPath();
    g.ellipse(x, 48, 9, 30, 0, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(x, 20);
    g.lineTo(x, 76);
    g.stroke();
  }
  g.lineWidth = 3;
  g.strokeRect(1, 6, 510, 84);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(14, 1);
  return tex;
}

// Soft round glow for the opal globes (drawn additively around each globe).
function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255, 236, 205, 1)');
  grad.addColorStop(0.25, 'rgba(255, 214, 160, 0.45)');
  grad.addColorStop(1, 'rgba(255, 200, 140, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function place(mesh, x, y, z, { cast = true, receive = true } = {}) {
  mesh.position.set(x, y, z);
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  return mesh;
}

export function createRoom({ canvasHost, cssHost, screenEl, onZoomChange, onLampChange, onDimmerChange }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
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
    wall: new THREE.MeshStandardMaterial({ color: 0x6c6e55, roughness: 0.92 }), // olive green, as in the studio
    floor: new THREE.MeshStandardMaterial({ color: 0x252019, roughness: 0.9 }),
    beige: new THREE.MeshStandardMaterial({ color: 0xcfc5b0, roughness: 0.55 }),
    bezel: new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.4 }),
    plastic: new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.45 }),
    keys: new THREE.MeshStandardMaterial({ color: 0x3a3936, roughness: 0.6 }),
    pad: new THREE.MeshStandardMaterial({ color: 0x2b2622, roughness: 0.95 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xc19a5b, roughness: 0.28, metalness: 0.9, envMap, envMapIntensity: 0.55 }),
    greenGlass: new THREE.MeshStandardMaterial({ color: 0x1fa33c, roughness: 0.1, metalness: 0, envMap, envMapIntensity: 0.9, emissive: 0x13802c, emissiveIntensity: 0 }),
    shadeInner: new THREE.MeshStandardMaterial({ color: 0xfff4e0, roughness: 0.5, side: THREE.BackSide, emissive: 0xffd8a0, emissiveIntensity: 0 }),
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

  // The left wall meets the back wall in the corner The Refusal is mounted in.
  const CORNER = { x: -1.6, z: -0.72 };
  const side = place(new THREE.Mesh(new THREE.PlaneGeometry(10, 5), mat.wall), CORNER.x, 2.5, 0, { cast: false });
  side.rotation.y = Math.PI / 2;
  room.add(side);

  // Ceiling with a stepped white cornice along both walls, white skirting at the floor.
  const ceiling = place(new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshStandardMaterial({ color: 0xe4ddd0, roughness: 0.9 })), 0, CEILING_Y, 0, { cast: false });
  ceiling.rotation.x = Math.PI / 2;
  room.add(ceiling);
  const whitePaint = new THREE.MeshStandardMaterial({ color: 0xf0ebe1, roughness: 0.75 });
  // Each step: [height down from the ceiling (or up from the floor), depth from the wall, y].
  const trims = [
    [0.15, 0.03, CEILING_Y - 0.075], [0.11, 0.06, CEILING_Y - 0.055], [0.07, 0.1, CEILING_Y - 0.035], // cornice
    [0.12, 0.018, 0.06], // skirting
  ];
  for (const [h, d, y] of trims) {
    room.add(place(new THREE.Mesh(new THREE.BoxGeometry(10, h, d), whitePaint), CORNER.x + 5, y, CORNER.z + d / 2, { cast: false }));
    const sideTrim = place(new THREE.Mesh(new THREE.BoxGeometry(10, h, d), whitePaint), CORNER.x + d / 2, y, CORNER.z + 5, { cast: false });
    sideTrim.rotation.y = Math.PI / 2;
    room.add(sideTrim);
  }

  // ---- stucco: Altbau cornice details and ceiling mouldings ----------------
  // Both walls get the same profile: a dentil row, an egg-and-dart row and a
  // carved frieze below the stepped cornice. The ceiling gets moulded frames
  // and a rosette.
  const stuccoRuns = [
    { along: 'x', place: (t, y, d) => [CORNER.x + t, y, CORNER.z + d] },
    { along: 'z', place: (t, y, d) => [CORNER.x + d, y, CORNER.z + t] },
  ];
  const RUN = 8; // metres of wall each run covers
  const dentilGeo = new THREE.BoxGeometry(0.024, 0.032, 0.03);
  const eggGeo = new THREE.SphereGeometry(1, 10, 8);
  for (const run of stuccoRuns) {
    const dentils = new THREE.InstancedMesh(dentilGeo, whitePaint, Math.floor(RUN / 0.045));
    const eggs = new THREE.InstancedMesh(eggGeo, whitePaint, Math.floor(RUN / 0.038));
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    for (let i = 0; i < dentils.count; i++) {
      const [x, y, z] = run.place(0.03 + i * 0.045, CEILING_Y - 0.166, 0.015);
      dentils.setMatrixAt(i, m.makeTranslation(x, y, z));
    }
    for (let i = 0; i < eggs.count; i++) {
      const [x, y, z] = run.place(0.03 + i * 0.038, CEILING_Y - 0.198, 0.004);
      scale.set(run.along === 'x' ? 0.011 : 0.008, 0.015, run.along === 'x' ? 0.008 : 0.011);
      eggs.setMatrixAt(i, m.compose(new THREE.Vector3(x, y, z), q, scale));
    }
    room.add(dentils, eggs);
  }
  // Carved frieze band under the eggs, and a thin bead under that.
  const friezeTex = makeFriezeTexture();
  const friezeMat = new THREE.MeshStandardMaterial({ map: friezeTex, bumpMap: friezeTex, bumpScale: 4, roughness: 0.85 });
  for (const [h, d, y, mat2] of [[0.1, 0.008, CEILING_Y - 0.27, friezeMat], [0.014, 0.016, CEILING_Y - 0.327, whitePaint]]) {
    room.add(place(new THREE.Mesh(new THREE.BoxGeometry(RUN, h, d), mat2), CORNER.x + RUN / 2, y, CORNER.z + d / 2, { cast: false }));
    const sideBand = place(new THREE.Mesh(new THREE.BoxGeometry(RUN, h, d), mat2), CORNER.x + d / 2, y, CORNER.z + RUN / 2, { cast: false });
    sideBand.rotation.y = Math.PI / 2;
    room.add(sideBand);
  }
  // Ceiling: two moulded frames running parallel to the walls.
  for (const inset of [0.42, 0.52]) {
    const w = inset === 0.42 ? 0.04 : 0.022;
    room.add(place(new THREE.Mesh(new THREE.BoxGeometry(RUN, 0.02, w), whitePaint), CORNER.x + inset + RUN / 2, CEILING_Y - 0.01, CORNER.z + inset, { cast: false }));
    room.add(place(new THREE.Mesh(new THREE.BoxGeometry(w, 0.02, RUN), whitePaint), CORNER.x + inset, CEILING_Y - 0.01, CORNER.z + inset + RUN / 2, { cast: false }));
  }
  // Ceiling rosette: stacked rings with a ring of leaves.
  const rosette = new THREE.Group();
  rosette.position.set(0.3, CEILING_Y, 1.2);
  [[0.34, 0.016], [0.27, 0.02], [0.18, 0.024]].forEach(([r, t], i) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, t, 10, 64), whitePaint);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.012 - i * 0.012;
    rosette.add(ring);
  });
  const leafGeo = new THREE.SphereGeometry(1, 10, 8);
  const leaves = new THREE.InstancedMesh(leafGeo, whitePaint, 16);
  const lm = new THREE.Matrix4();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    lm.compose(
      new THREE.Vector3(Math.cos(a) * 0.225, -0.03, Math.sin(a) * 0.225),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a),
      new THREE.Vector3(0.045, 0.014, 0.02)
    );
    leaves.setMatrixAt(i, lm);
  }
  rosette.add(leaves);
  const boss = new THREE.Mesh(new THREE.SphereGeometry(0.07, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), whitePaint);
  boss.position.y = -0.03;
  rosette.add(boss);
  room.add(rosette);

  // The ByTwo logo, framed, on the back wall.
  const logoTex = new THREE.TextureLoader().load('/assets/bytwo-logo.webp');
  logoTex.colorSpace = THREE.SRGBColorSpace;
  logoTex.anisotropy = 4;
  room.add(place(new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.64, 0.02), mat.beige), 0.42, 1.76, -0.71, { cast: false }));
  room.add(place(
    new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.56), new THREE.MeshStandardMaterial({ map: logoTex, roughness: 0.6 })),
    0.42, 1.76, -0.6985,
    { cast: false }
  ));

  // ---- desk ----------------------------------------------------------------
  const deskTop = place(new THREE.Mesh(new RoundedBoxGeometry(1.7, 0.04, 0.8, 3, 0.012), mat.wood), 0, 0.74, 0);
  room.add(deskTop);
  for (const [x, z] of [[-0.8, -0.34], [0.8, -0.34], [-0.8, 0.34], [0.8, 0.34]]) {
    room.add(place(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.72, 0.05), mat.darkWood), x, 0.36, z));
  }

  // Shelf on the back wall with three design objects.
  room.add(place(new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.03, 0.22), mat.darkWood), 1.3, 1.45, -0.6));
  for (const x of [0.85, 1.75]) {
    room.add(place(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, 0.2), mat.darkWood), x, 1.38, -0.6));
  }

  // Object 1: a turned vessel (lathe profile).
  const vesselProfile = [
    [0.0, 0.0], [0.05, 0.0], [0.07, 0.04], [0.06, 0.12], [0.035, 0.2], [0.04, 0.23], [0.045, 0.24], [0.035, 0.245], [0.0, 0.245],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const vessel = place(new THREE.Mesh(new THREE.LatheGeometry(vesselProfile, 48), mat.glaze), 0.95, 1.465, -0.52);
  room.add(vessel);

  // Object 2: a cube with a round recess (a stand-in for a cut block).
  const block = new THREE.Group();
  block.add(place(new THREE.Mesh(new RoundedBoxGeometry(0.14, 0.14, 0.14, 2, 0.006), mat.beige), 0, 0.07, 0));
  block.add(place(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.01, 32), mat.ink), 0, 0.141, 0, { cast: false }));
  block.position.set(1.27, 1.465, -0.52);
  room.add(block);

  // Object 3: a stack of three discs.
  const discs = new THREE.Group();
  [[0.09, 0.03, mat.red], [0.07, 0.025, mat.beige], [0.11, 0.035, mat.ink]].forEach(([r, h, m], i, arr) => {
    const y = arr.slice(0, i).reduce((s, a) => s + a[1], 0) + h / 2;
    discs.add(place(new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 40), m), 0, y, 0));
  });
  discs.position.set(1.63, 1.465, -0.52);
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

  // A framed photo of the two of us, standing on the desk and turned toward the camera.
  const photoTex = new THREE.TextureLoader().load('/assets/photo-arian-paniz.webp');
  photoTex.colorSpace = THREE.SRGBColorSpace;
  photoTex.anisotropy = 4;
  const photoFrame = new THREE.Group();
  photoFrame.add(place(new THREE.Mesh(new RoundedBoxGeometry(0.13, 0.17, 0.012, 2, 0.003), mat.darkWood), 0, 0.085, 0));
  photoFrame.add(place(
    new THREE.Mesh(new THREE.PlaneGeometry(0.106, 0.141), new THREE.MeshStandardMaterial({ map: photoTex, roughness: 0.45, emissiveMap: photoTex, emissive: 0xffffff, emissiveIntensity: 0.22 })),
    0, 0.087, 0.0065,
    { cast: false }
  ));
  photoFrame.rotation.order = 'YXZ';
  photoFrame.rotation.set(-0.14, 0.6, 0);
  photoFrame.scale.setScalar(1.3);
  photoFrame.position.set(-0.3, 0.76, 0.04);
  photoFrame.userData.action = 'photo';
  room.add(photoFrame);
  photoFrame.updateMatrixWorld(true);
  const PHOTO = {
    w: 0.106 * 1.3,
    h: 0.141 * 1.3,
    center: photoFrame.localToWorld(new THREE.Vector3(0, 0.087, 0.0065)),
    normal: new THREE.Vector3(0, 0, 1).applyQuaternion(photoFrame.quaternion),
  };

  // ---- desk lamp: a banker's lamp with a green glass shade -----------------
  const lamp = new THREE.Group();
  lamp.userData.action = 'lamp';
  lamp.position.set(-0.62, 0.76, -0.04);
  lamp.rotation.y = 0.66; // the long side of the shade faces the camera
  lamp.scale.setScalar(1.2);
  room.add(lamp);
  lamp.add(place(new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.095, 0.018, 48), mat.brass), 0, 0.009, -0.01));
  lamp.add(place(new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 0.02, 40), mat.brass), 0, 0.028, -0.03));
  const footProfile = [[0, 0], [0.03, 0], [0.035, 0.02], [0.022, 0.045], [0.018, 0.07], [0.026, 0.085], [0, 0.085]]
    .map(([x, y]) => new THREE.Vector2(x, y));
  lamp.add(place(new THREE.Mesh(new THREE.LatheGeometry(footProfile, 32), mat.brass), 0, 0.038, -0.04));
  const stemCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.12, -0.04),
    new THREE.Vector3(0, 0.24, -0.046),
    new THREE.Vector3(0, 0.33, -0.02),
    new THREE.Vector3(0, 0.392, -0.012),
  ]);
  const stem = new THREE.Mesh(new THREE.TubeGeometry(stemCurve, 32, 0.008, 12), mat.brass);
  stem.castShadow = true;
  lamp.add(stem);

  // Shade: an elongated glass dome, green outside, warm white inside.
  const SHADE = { r: 0.07, len: 0.3, y: 0.345, z: 0.045 };
  const domeGeo = new THREE.SphereGeometry(1, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  for (const material of [mat.greenGlass, mat.shadeInner]) {
    const dome = new THREE.Mesh(domeGeo, material);
    dome.scale.set(SHADE.len / 2, SHADE.r, 0.085);
    dome.position.set(0, SHADE.y, SHADE.z);
    dome.castShadow = material === mat.greenGlass;
    lamp.add(dome);
  }
  // Brass rim around the lower edge of the shade.
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.035, 8, 64), mat.brass);
  rim.rotation.x = Math.PI / 2;
  rim.scale.set(SHADE.len / 2, 0.085, 0.12);
  rim.position.set(0, SHADE.y, SHADE.z);
  lamp.add(rim);
  lamp.add(place(new THREE.Mesh(new THREE.SphereGeometry(0.012, 16, 12), mat.brass), 0, SHADE.y + SHADE.r, SHADE.z));
  const bulb = place(new THREE.Mesh(new THREE.SphereGeometry(0.018, 16, 12), mat.bulb), 0, SHADE.y - 0.01, SHADE.z, { cast: false });
  lamp.add(bulb);
  // Pull chain with a bead.
  lamp.add(place(new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.09, 6), mat.brass), 0.1, SHADE.y - 0.045, SHADE.z + 0.05, { cast: false }));
  lamp.add(place(new THREE.Mesh(new THREE.SphereGeometry(0.006, 12, 8), mat.brass), 0.1, SHADE.y - 0.092, SHADE.z + 0.05, { cast: false }));
  lamp.updateMatrixWorld(true);

  const lampLight = new THREE.SpotLight(0xffc98a, 0, 2.5, Math.PI / 2.3, 0.8, 1.6);
  lampLight.position.copy(lamp.localToWorld(new THREE.Vector3(0, SHADE.y - 0.02, SHADE.z + 0.01)));
  const lampTarget = new THREE.Object3D();
  lampTarget.position.copy(lamp.localToWorld(new THREE.Vector3(0, -SHADE.y, SHADE.z + 0.14)));
  room.add(lampTarget);
  lampLight.target = lampTarget;
  lampLight.castShadow = true;
  lampLight.shadow.mapSize.set(1024, 1024);
  lampLight.shadow.bias = -0.0004;
  lampLight.shadow.normalBias = 0.02;
  lampLight.shadow.camera.near = 0.02;
  lampLight.shadow.camera.far = 3;
  room.add(lampLight);

  // Soft warm bounce from the lamp, so the wall and the logo read when it is on.
  const bounce = new THREE.PointLight(0xffb070, 0, 4, 1.6);
  bounce.position.set(-0.45, 1.35, -0.3);
  room.add(bounce);

  // ---- The Refusal (from the studio's portfolio) ----------------------------
  // A red corner box with an angled front, flush in the corner. Three glossy
  // red rods leave it on one vertical line, stacked a few centimetres apart.
  // All three are horizontal; only their directions differ, and visitors can
  // swivel each one by dragging it, like on the real lamp. Each rod ends in a
  // 100 mm opal glass globe (Orion, snow white) on a 16 mm carbon fibre rod:
  // the longest (2 m) points out into the room, the middle
  // one (1.25 m) runs along the left wall, the shortest (0.75 m) along the back
  // wall. A red cable runs down the corner and along the wall to a socket.
  const refusal = new THREE.Group();
  refusal.userData.action = 'refusal';
  room.add(refusal);
  const red = new THREE.MeshStandardMaterial({ color: 0xd0201a, roughness: 0.3, envMap, envMapIntensity: 0.35 });
  const globeMat = new THREE.MeshStandardMaterial({ color: 0xfaf6ee, roughness: 0.3, emissive: 0xffe4bd, emissiveIntensity: 0 });
  // Real sizes (box about 9 x 15 cm, globes 100 mm, rods 16 mm) times REFUSAL_SCALE.
  const S = REFUSAL_SCALE;
  const BOX = { w: 0.09 * S, h: 0.15 * S, y: REFUSAL_BOX_Y };
  // Box footprint: a square in the corner with the front corner cut off.
  const outline = new THREE.Shape();
  outline.moveTo(0, 0);
  outline.lineTo(BOX.w, 0);
  outline.lineTo(BOX.w, -BOX.w * 0.5);
  outline.lineTo(BOX.w * 0.5, -BOX.w);
  outline.lineTo(0, -BOX.w);
  outline.closePath();
  const boxGeo = new THREE.ExtrudeGeometry(outline, { depth: BOX.h, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 2 });
  boxGeo.rotateX(-Math.PI / 2); // shape y becomes -z, extrusion becomes +y
  refusal.add(place(new THREE.Mesh(boxGeo, red), CORNER.x, BOX.y - BOX.h / 2, CORNER.z));

  // Each arm pivots on the box's front edge. Its angle is measured from the back
  // wall (0) to the left wall (90 degrees).
  const front = new THREE.Vector3(CORNER.x + BOX.w * 0.78, 0, CORNER.z + BOX.w * 0.78);
  const ARM_LIMITS = [THREE.MathUtils.degToRad(6), THREE.MathUtils.degToRad(84)];
  const rods = [
    { length: 2.0, rise: 0.045 * S, angle: 32 },  // out into the room
    { length: 1.25, rise: 0, angle: 80 },         // along the left wall
    { length: 0.75, rise: -0.045 * S, angle: 10 }, // along the back wall
  ];
  const glowTex = makeGlowTexture();
  const glows = [];
  const refusalLights = [];
  const arms = [];
  rods.forEach((rod, index) => {
    const arm = new THREE.Group();
    arm.userData.arm = index;
    arm.position.set(front.x, BOX.y + rod.rise, front.z);
    const len = rod.length * S;
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.008 * S, 0.008 * S, len, 12), red); // 16 mm rod
    tube.rotation.z = -Math.PI / 2; // cylinder axis along the arm (local +x)
    tube.position.x = len / 2;
    tube.castShadow = true;
    arm.add(tube);
    arm.add(place(new THREE.Mesh(new THREE.SphereGeometry(0.05 * S, 32, 20), globeMat), len, 0, 0, { cast: false }));
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
    glow.position.x = len;
    glow.scale.setScalar(0.36 * S);
    arm.add(glow);
    glows.push(glow);
    const light = new THREE.PointLight(0xffd6a0, 0, 2.6, 1.7);
    light.position.x = len;
    arm.add(light);
    refusalLights.push(light);
    arm.rotation.y = -THREE.MathUtils.degToRad(rod.angle); // local +x becomes (cos a, 0, sin a)
    refusal.add(arm);
    arms.push(arm);
  });

  // Red cable: out of the box, down the corner, along the back wall to a socket.
  const socket = { x: CORNER.x + 0.6, y: 0.32 };
  const off = 0.012; // the cable lies about a centimetre off the wall
  const run = 0.44; // height of the run along the wall, just above the skirting
  const cableY = BOX.y - BOX.h / 2;
  const cable = new THREE.CatmullRomCurve3([
    new THREE.Vector3(CORNER.x + 0.02, cableY + 0.01, CORNER.z + 0.02),
    new THREE.Vector3(CORNER.x + off, cableY - 0.06, CORNER.z + off),
    new THREE.Vector3(CORNER.x + off, (cableY + run) / 2, CORNER.z + off),
    new THREE.Vector3(CORNER.x + off, run + 0.04, CORNER.z + off),
    new THREE.Vector3(CORNER.x + off + 0.015, run + 0.005, CORNER.z + off),
    new THREE.Vector3(CORNER.x + 0.06, run, CORNER.z + off),
    new THREE.Vector3(socket.x - 0.08, run, CORNER.z + off),
    new THREE.Vector3(socket.x - 0.012, run - 0.012, CORNER.z + off),
    new THREE.Vector3(socket.x, run - 0.06, CORNER.z + off + 0.004),
    new THREE.Vector3(socket.x, socket.y + 0.03, CORNER.z + 0.024),
  ], false, 'catmullrom', 0.2);
  const cableMesh = new THREE.Mesh(new THREE.TubeGeometry(cable, 260, 0.004, 8, false), red);
  refusal.add(cableMesh);
  // Small white cable clips along the wall.
  const clipGeo = new THREE.BoxGeometry(0.014, 0.008, 0.014);
  for (let y = cableY - 0.15; y > run + 0.08; y -= 0.3) {
    room.add(place(new THREE.Mesh(clipGeo, whitePaint), CORNER.x + off, y, CORNER.z + off, { cast: false }));
  }
  for (let x = CORNER.x + 0.2; x < socket.x - 0.1; x += 0.25) {
    room.add(place(new THREE.Mesh(clipGeo, whitePaint), x, run, CORNER.z + off, { cast: false }));
  }
  // Wall socket with the plug in it.
  room.add(place(new THREE.Mesh(new RoundedBoxGeometry(0.08, 0.08, 0.012, 2, 0.004), whitePaint), socket.x, socket.y, CORNER.z + 0.006, { cast: false }));
  const plug = place(new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.03, 20), whitePaint), socket.x, socket.y, CORNER.z + 0.026, { cast: false });
  plug.rotation.x = Math.PI / 2;
  room.add(plug);

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
    focus: 'screen', // what the camera glides to: 'screen' | 'photo'
    lamp: true,
    lampLevel: 0,
    dimmer: 0.6, // The Refusal, 0..1
    dimmerLevel: 0,
    lastDimmer: 0.6,
    tween: null,
    look: WIDE.look.clone(), // where the camera is looking, kept for tweens
    pointer: { x: 0, y: 0 },
    parallax: new THREE.Vector2(),
    last: performance.now(),
  };

  // Distance at which a w x h rectangle fills `fill` of the view.
  function fitDistance(w, h, fill) {
    const tan = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    return Math.max(h / fill / (2 * tan), w / fill / (2 * tan * camera.aspect));
  }

  function zoomPose(focus) {
    if (focus === 'photo') {
      return {
        pos: PHOTO.center.clone().addScaledVector(PHOTO.normal, fitDistance(PHOTO.w, PHOTO.h, 0.82)),
        look: PHOTO.center.clone(),
      };
    }
    return {
      pos: new THREE.Vector3(SCREEN.x, SCREEN.y, SCREEN.z + fitDistance(SCREEN.w, SCREEN.h, 0.93)),
      look: new THREE.Vector3(SCREEN.x, SCREEN.y, SCREEN.z),
    };
  }

  function setMode(mode) {
    state.mode = mode;
    onZoomChange?.(mode, state.focus);
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

  function zoomIn(focus = 'screen') {
    if (state.mode !== 'wide') return;
    state.focus = focus;
    setMode('moving');
    tweenTo(zoomPose(focus), ZOOM_MS, () => setMode('zoomed'));
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

  function setDimmer(value) {
    state.dimmer = Math.min(1, Math.max(0, value));
    if (state.dimmer > 0) state.lastDimmer = state.dimmer;
    onDimmerChange?.(state.dimmer);
  }

  // ---- picking -------------------------------------------------------------
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const pickables = [hit, body, lamp, refusal, photoFrame];

  // Returns { action, arm } for the first clickable object under the pointer.
  // `arm` is set when the pointer is on one of The Refusal's arms or globes.
  function pick(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(pickables, true);
    for (const h of hits) {
      let arm = null;
      let o = h.object;
      while (o) {
        if (o.userData.arm !== undefined && arm === null) arm = o.userData.arm;
        if (o.userData.action) return { action: o.userData.action, arm };
        o = o.parent;
      }
    }
    return null;
  }

  // Dragging an arm of The Refusal sideways swivels it around the box.
  const drag = { arm: null, startX: 0, startAngle: 0, moved: false, swallowClick: false };

  canvasHost.addEventListener('pointerdown', (e) => {
    if (state.mode !== 'wide' || e.button !== 0) return;
    const hit = pick(e);
    if (!hit || hit.arm === null) return;
    drag.arm = arms[hit.arm];
    drag.startX = e.clientX;
    drag.startAngle = -drag.arm.rotation.y;
    drag.moved = false;
    canvasHost.setPointerCapture(e.pointerId);
    canvasHost.style.cursor = 'grabbing';
  });

  function endDrag(e) {
    if (!drag.arm) return;
    drag.swallowClick = drag.moved; // a drag is not a click on the lamp
    drag.arm = null;
    if (canvasHost.hasPointerCapture(e.pointerId)) canvasHost.releasePointerCapture(e.pointerId);
  }
  canvasHost.addEventListener('pointerup', endDrag);
  canvasHost.addEventListener('pointercancel', endDrag);

  canvasHost.addEventListener('click', (e) => {
    if (drag.swallowClick) {
      drag.swallowClick = false;
      return;
    }
    if (state.mode !== 'wide') return;
    const action = pick(e)?.action;
    if (action === 'monitor') zoomIn('screen');
    if (action === 'photo') zoomIn('photo');
    if (action === 'lamp') toggleLamp();
    if (action === 'refusal') setDimmer(state.dimmer > 0 ? 0 : state.lastDimmer || 0.6);
  });

  canvasHost.addEventListener('pointermove', (e) => {
    if (drag.arm) {
      const dx = e.clientX - drag.startX;
      if (Math.abs(dx) > 4) drag.moved = true;
      // Dragging right turns the arm toward the back wall, left toward the left wall.
      const angle = THREE.MathUtils.clamp(drag.startAngle - dx * 0.006, ARM_LIMITS[0], ARM_LIMITS[1]);
      drag.arm.rotation.y = -angle;
      return; // keep the camera still while an arm is being turned
    }
    const rect = renderer.domElement.getBoundingClientRect();
    state.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    state.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    if (state.mode === 'wide') {
      const hit = pick(e);
      canvasHost.style.cursor = !hit ? '' : hit.arm !== null ? 'grab' : 'pointer';
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
      const p = zoomPose(state.focus);
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
    mat.shadeInner.emissiveIntensity = 0.7 * L;
    mat.greenGlass.emissiveIntensity = 0.05 * L;
    mat.bulb.color.setRGB(0.25 + 0.75 * L, 0.2 + 0.6 * L, 0.1 + 0.3 * L);
    hemi.intensity = LAMP_OFF.hemi + (LAMP_ON.hemi - LAMP_OFF.hemi) * L;
    bounce.intensity = LAMP_ON.bounce * L;
    monitorLight.intensity = 0.12 + 0.12 * (1 - L);

    // The Refusal follows its dimmer with a short ease, like a real dimmer.
    state.dimmerLevel += (state.dimmer - state.dimmerLevel) * (1 - Math.exp(-dt * 8));
    const D = state.dimmerLevel;
    for (const light of refusalLights) light.intensity = REFUSAL_MAX.light * D;
    for (const glow of glows) glow.material.opacity = REFUSAL_MAX.halo * D;
    globeMat.emissiveIntensity = 0.05 + REFUSAL_MAX.glow * D;

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
    setDimmer,
    get dimmer() {
      return state.dimmer;
    },
    get zoomed() {
      return state.mode === 'zoomed';
    },
    get focus() {
      return state.focus;
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
