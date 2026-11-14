import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';

export type BottleVariantId = 'sage' | 'basalt' | 'glacier';

interface VariantSpec {
  id: BottleVariantId;
  label: string;
  bodyColor: number;
  bodyRoughness: number;
  bodyMetalness: number;
  bodyClearcoat: number;
  bodyClearcoatRoughness: number;
  collarColor: number;
  collarRoughness: number;
  collarMetalness: number;
  capColor: number;
  markColor: string;
  useBrushedMap: boolean;
}

const VARIANT_SPECS: VariantSpec[] = [
  {
    id: 'sage',
    label: 'Alpine Sage',
    bodyColor: 0x48634b,
    bodyRoughness: 0.56,
    bodyMetalness: 0.14,
    bodyClearcoat: 0.08,
    bodyClearcoatRoughness: 0.65,
    collarColor: 0xd6dcd8,
    collarRoughness: 0.2,
    collarMetalness: 0.94,
    capColor: 0x171b19,
    markColor: 'rgba(240, 244, 241, 0.78)',
    useBrushedMap: false,
  },
  {
    id: 'basalt',
    label: 'Basalt Black',
    bodyColor: 0x1d211f,
    bodyRoughness: 0.64,
    bodyMetalness: 0.18,
    bodyClearcoat: 0.06,
    bodyClearcoatRoughness: 0.72,
    collarColor: 0xaab2ad,
    collarRoughness: 0.24,
    collarMetalness: 0.92,
    capColor: 0x131614,
    markColor: 'rgba(235, 240, 237, 0.72)',
    useBrushedMap: false,
  },
  {
    id: 'glacier',
    label: 'Glacier Silver',
    bodyColor: 0xc2cac5,
    bodyRoughness: 0.24,
    bodyMetalness: 0.86,
    bodyClearcoat: 0.2,
    bodyClearcoatRoughness: 0.26,
    collarColor: 0xe3e8e5,
    collarRoughness: 0.16,
    collarMetalness: 0.96,
    capColor: 0x1c211e,
    markColor: 'rgba(24, 30, 27, 0.76)',
    useBrushedMap: true,
  },
];

export interface HeroBottleOptions {
  initialVariantIndex: number;
  initialTheme: 'light' | 'dark';
  onSelectVariant?: (index: number) => void;
  onWebGLUnavailable?: () => void;
}

export interface HeroBottleController {
  setSliderProgress: (progress: number) => void;
  setCapacityScale: (scale: number) => void;
  setTheme: (theme: 'light' | 'dark') => void;
  dispose: () => void;
}

const CAROUSEL_SPACING = 2.65;
const BOTTLE_CENTER_Y = 1.38;

// Module-level reusable helpers (zero per-frame allocations)
const _raycaster = new THREE.Raycaster();
const _pointerNdc = new THREE.Vector2();
const _dummyObj = new THREE.Object3D();

function detectSoftwareWebGL(): boolean {
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function createPowderCoatBumpTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const img = ctx.createImageData(size, size);
    const data = img.data;
    let seed = 1337;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    for (let i = 0; i < data.length; i += 4) {
      const v = Math.floor(112 + rand() * 34);
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 8);
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

function createBrushedMetalTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, size, size);
    let seed = 4242;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    for (let y = 0; y < size; y++) {
      const lum = Math.floor(108 + rand() * 44);
      ctx.fillStyle = `rgb(${lum},${lum},${lum})`;
      ctx.fillRect(0, y, size, 1);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 4);
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

function createBrandMarkTexture(
  markColor: string,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const width = 1024;
  const height = 512;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.clearRect(0, 0, width, height);

    // Center mark on front cylinder UV (u = 0.5 corresponds to +Z facing camera when rotated)
    const cx = width * 0.5;
    const cy = height * 0.62;

    ctx.strokeStyle = markColor;
    ctx.fillStyle = markColor;
    ctx.lineWidth = 4.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // Alpine peak icon matching site brand mark
    ctx.save();
    ctx.translate(cx - 26, cy - 58);
    ctx.scale(1.9, 1.9);
    ctx.beginPath();
    ctx.moveTo(2, 16);
    ctx.lineTo(10.5, 3);
    ctx.lineTo(16, 11.5);
    ctx.lineTo(19.5, 6.5);
    ctx.lineTo(26, 16);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    // Wordmark
    ctx.font = '700 22px "DM Sans", -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('M A T E R I A L', cx, cy - 4);

    // Subtle elevation capacity subtitle
    ctx.font = '500 13px "DM Mono", monospace';
    ctx.globalAlpha = 0.72;
    ctx.fillText('950 ML · 18/8', cx, cy + 24);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(
      size / 2,
      size / 2,
      size * 0.04,
      size / 2,
      size / 2,
      size * 0.48
    );
    grad.addColorStop(0, 'rgba(10, 14, 12, 0.52)');
    grad.addColorStop(0.45, 'rgba(10, 14, 12, 0.22)');
    grad.addColorStop(1, 'rgba(10, 14, 12, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

interface BuiltBottle {
  root: THREE.Group;
  spinGroup: THREE.Group;
  shadowMesh: THREE.Mesh;
  hitProxy: THREE.Mesh;
  disposables: {
    geometries: THREE.BufferGeometry[];
    materials: THREE.Material[];
    textures: THREE.Texture[];
  };
}

function buildBottleModel(
  spec: VariantSpec,
  shared: {
    powderBump: THREE.CanvasTexture;
    brushedMap: THREE.CanvasTexture;
    shadowTex: THREE.CanvasTexture;
    maxAnisotropy: number;
    isSoftwareGl: boolean;
  }
): BuiltBottle {
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];

  const root = new THREE.Group();
  const spinGroup = new THREE.Group();
  // Pivot spinGroup around the center of the bottle so X/Y rotation feels balanced
  spinGroup.position.y = BOTTLE_CENTER_Y;
  root.add(spinGroup);

  const modelOffset = new THREE.Group();
  modelOffset.position.y = -BOTTLE_CENTER_Y;
  spinGroup.add(modelOffset);

  const radialSegs = 64;

  // 1. Protective Silicone Base Ring (bottom-center flush at y = 0)
  const basePoints = [
    new THREE.Vector2(0.0, 0.004),
    new THREE.Vector2(0.36, 0.004),
    new THREE.Vector2(0.405, 0.012),
    new THREE.Vector2(0.422, 0.036),
    new THREE.Vector2(0.422, 0.062),
    new THREE.Vector2(0.408, 0.068),
  ];
  const baseGeo = new THREE.LatheGeometry(basePoints, radialSegs);
  baseGeo.computeVertexNormals();
  geometries.push(baseGeo);

  const rubberMat = new THREE.MeshStandardMaterial({
    color: 0x161917,
    roughness: 0.88,
    metalness: 0.04,
  });
  materials.push(rubberMat);

  const baseMesh = new THREE.Mesh(baseGeo, rubberMat);
  baseMesh.castShadow = !shared.isSoftwareGl;
  baseMesh.receiveShadow = !shared.isSoftwareGl;
  modelOffset.add(baseMesh);

  // 2. Main Double-Wall Insulated Body (LatheGeometry with smooth shoulder)
  const bodyPoints: THREE.Vector2[] = [
    new THREE.Vector2(0.408, 0.064),
    new THREE.Vector2(0.436, 0.088),
    new THREE.Vector2(0.445, 0.135),
    new THREE.Vector2(0.445, 1.84),
  ];
  const shoulderSteps = 18;
  for (let i = 1; i <= shoulderSteps; i++) {
    const t = i / shoulderSteps;
    // Smooth S-curve shoulder from r=0.445 at y=1.84 to r=0.295 at y=2.16
    const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const r = THREE.MathUtils.lerp(0.445, 0.295, Math.pow(t, 1.28));
    const y = THREE.MathUtils.lerp(1.84, 2.16, ease);
    bodyPoints.push(new THREE.Vector2(r, y));
  }
  bodyPoints.push(new THREE.Vector2(0.295, 2.18));

  const bodyGeo = new THREE.LatheGeometry(bodyPoints, radialSegs);
  bodyGeo.computeVertexNormals();
  bodyGeo.computeTangents();
  geometries.push(bodyGeo);

  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: spec.bodyColor,
    roughness: spec.bodyRoughness,
    metalness: spec.bodyMetalness,
    clearcoat: spec.bodyClearcoat,
    clearcoatRoughness: spec.bodyClearcoatRoughness,
    bumpMap: spec.useBrushedMap ? shared.brushedMap : shared.powderBump,
    bumpScale: spec.useBrushedMap ? 0.0022 : 0.0045,
    anisotropy: spec.useBrushedMap ? 0.65 : 0.0,
    anisotropyRotation: Math.PI / 2,
    envMapIntensity: spec.useBrushedMap ? 1.15 : 0.9,
  });
  materials.push(bodyMat);

  const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
  bodyMesh.castShadow = !shared.isSoftwareGl;
  bodyMesh.receiveShadow = !shared.isSoftwareGl;
  modelOffset.add(bodyMesh);

  // 3. Coplanar Brand Mark Sleeve (CanvasTexture with polygonOffset)
  const markTex = createBrandMarkTexture(spec.markColor, shared.maxAnisotropy);
  textures.push(markTex);
  const sleeveGeo = new THREE.CylinderGeometry(0.4465, 0.4465, 0.72, radialSegs, 1, true);
  geometries.push(sleeveGeo);
  const sleeveMat = new THREE.MeshStandardMaterial({
    map: markTex,
    transparent: true,
    roughness: spec.bodyRoughness + 0.08,
    metalness: spec.bodyMetalness * 0.5,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  materials.push(sleeveMat);
  const sleeveMesh = new THREE.Mesh(sleeveGeo, sleeveMat);
  sleeveMesh.position.y = 0.92;
  // Rotate so u=0.5 faces +Z
  sleeveMesh.rotation.y = Math.PI;
  modelOffset.add(sleeveMesh);

  // 4. Machined Stainless Steel Collar
  const collarPoints = [
    new THREE.Vector2(0.288, 2.15),
    new THREE.Vector2(0.308, 2.165),
    new THREE.Vector2(0.312, 2.185),
    new THREE.Vector2(0.312, 2.24),
    new THREE.Vector2(0.298, 2.255),
    new THREE.Vector2(0.308, 2.268),
    new THREE.Vector2(0.308, 2.305),
    new THREE.Vector2(0.292, 2.318),
    new THREE.Vector2(0.26, 2.318),
  ];
  const collarGeo = new THREE.LatheGeometry(collarPoints, radialSegs);
  collarGeo.computeVertexNormals();
  collarGeo.computeTangents();
  geometries.push(collarGeo);

  const collarMat = new THREE.MeshPhysicalMaterial({
    color: spec.collarColor,
    roughness: spec.collarRoughness,
    metalness: spec.collarMetalness,
    bumpMap: shared.brushedMap,
    bumpScale: 0.0018,
    anisotropy: 0.8,
    anisotropyRotation: Math.PI / 2,
    envMapIntensity: 1.25,
  });
  materials.push(collarMat);

  const collarMesh = new THREE.Mesh(collarGeo, collarMat);
  collarMesh.castShadow = !shared.isSoftwareGl;
  collarMesh.receiveShadow = !shared.isSoftwareGl;
  modelOffset.add(collarMesh);

  // 5. EPDM Silicone Gasket Ring
  const gasketGeo = new THREE.TorusGeometry(0.298, 0.011, 12, radialSegs);
  gasketGeo.rotateX(Math.PI / 2);
  geometries.push(gasketGeo);
  const gasketMesh = new THREE.Mesh(gasketGeo, rubberMat);
  gasketMesh.position.y = 2.318;
  modelOffset.add(gasketMesh);

  // 6. Chug Lid Base Skirt & Cap Crown
  const capMat = new THREE.MeshPhysicalMaterial({
    color: spec.capColor,
    roughness: 0.48,
    metalness: 0.08,
    clearcoat: 0.12,
    clearcoatRoughness: 0.55,
  });
  materials.push(capMat);

  const capPoints = [
    new THREE.Vector2(0.26, 2.318),
    new THREE.Vector2(0.316, 2.326),
    new THREE.Vector2(0.322, 2.345),
    new THREE.Vector2(0.322, 2.515),
    new THREE.Vector2(0.308, 2.535),
    new THREE.Vector2(0.236, 2.548),
    new THREE.Vector2(0.238, 2.71),
    new THREE.Vector2(0.222, 2.735),
    new THREE.Vector2(0.16, 2.742),
    new THREE.Vector2(0.0, 2.732),
  ];
  const capGeo = new THREE.LatheGeometry(capPoints, radialSegs);
  capGeo.computeVertexNormals();
  geometries.push(capGeo);

  const capMesh = new THREE.Mesh(capGeo, capMat);
  capMesh.castShadow = !shared.isSoftwareGl;
  capMesh.receiveShadow = !shared.isSoftwareGl;
  modelOffset.add(capMesh);

  // 7. Instanced Knurled Grip Ribs around Cap Collar (36 ribs via InstancedMesh)
  const ribCount = 36;
  const ribGeo = new THREE.CapsuleGeometry(0.0085, 0.125, 4, 8);
  geometries.push(ribGeo);
  const ribMat = new THREE.MeshStandardMaterial({
    color: 0x242926,
    roughness: 0.58,
    metalness: 0.08,
  });
  materials.push(ribMat);

  const ribInstanced = new THREE.InstancedMesh(ribGeo, ribMat, ribCount);
  const ribRadius = 0.321;
  for (let i = 0; i < ribCount; i++) {
    const angle = (i / ribCount) * Math.PI * 2;
    _dummyObj.position.set(
      Math.cos(angle) * ribRadius,
      2.43,
      Math.sin(angle) * ribRadius
    );
    _dummyObj.rotation.set(0, -angle, 0);
    _dummyObj.scale.set(1, 1, 1);
    _dummyObj.updateMatrix();
    ribInstanced.setMatrixAt(i, _dummyObj.matrix);
  }
  ribInstanced.instanceMatrix.needsUpdate = true;
  ribInstanced.computeBoundingSphere();
  modelOffset.add(ribInstanced);

  // 8. Cap Hinge Lugs & Integrated Carry Loop (TubeGeometry)
  const lugGeo = new THREE.CylinderGeometry(0.042, 0.046, 0.068, 18);
  lugGeo.rotateZ(Math.PI / 2);
  geometries.push(lugGeo);

  const leftLug = new THREE.Mesh(lugGeo, capMat);
  leftLug.position.set(-0.325, 2.46, 0);
  modelOffset.add(leftLug);

  const rightLug = new THREE.Mesh(lugGeo, capMat);
  rightLug.position.set(0.325, 2.46, 0);
  modelOffset.add(rightLug);

  // Ergonomic angled carry loop arcing behind the upper cap
  const loopCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.335, 2.46, 0.0),
    new THREE.Vector3(-0.365, 2.66, -0.14),
    new THREE.Vector3(-0.22, 2.84, -0.25),
    new THREE.Vector3(0.0, 2.89, -0.28),
    new THREE.Vector3(0.22, 2.84, -0.25),
    new THREE.Vector3(0.365, 2.66, -0.14),
    new THREE.Vector3(0.335, 2.46, 0.0),
  ]);
  const loopGeo = new THREE.TubeGeometry(loopCurve, 44, 0.028, 12, false);
  loopGeo.computeVertexNormals();
  geometries.push(loopGeo);

  const loopMat = new THREE.MeshStandardMaterial({
    color: 0x1e2320,
    roughness: 0.45,
    metalness: 0.12,
  });
  materials.push(loopMat);

  const loopMesh = new THREE.Mesh(loopGeo, loopMat);
  loopMesh.castShadow = !shared.isSoftwareGl;
  modelOffset.add(loopMesh);

  // 9. Contact Shadow Plane (grounded at y = -0.004)
  const shadowGeo = new THREE.PlaneGeometry(1.7, 1.7);
  shadowGeo.rotateX(-Math.PI / 2);
  geometries.push(shadowGeo);

  const shadowMat = new THREE.MeshBasicMaterial({
    map: shared.shadowTex,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  materials.push(shadowMat);

  const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
  shadowMesh.position.y = -0.004;
  root.add(shadowMesh);

  // 10. Simplified Invisible Proxy Cylinder for fast raycast click selection
  const proxyGeo = new THREE.CylinderGeometry(0.5, 0.5, 2.95, 12);
  geometries.push(proxyGeo);
  const proxyMat = new THREE.MeshBasicMaterial({ visible: false });
  materials.push(proxyMat);
  const hitProxy = new THREE.Mesh(proxyGeo, proxyMat);
  hitProxy.position.y = BOTTLE_CENTER_Y;
  root.add(hitProxy);

  return {
    root,
    spinGroup,
    shadowMesh,
    hitProxy,
    disposables: { geometries, materials, textures },
  };
}

export function initHeroBottle3D(
  container: HTMLElement,
  options: HeroBottleOptions
): HeroBottleController {
  const isSoftwareGl = detectSoftwareWebGL();
  const prefersReduced = window.matchMedia(
    '(prefers-reduced-motion: reduce)'
  ).matches;

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      alpha: true,
      powerPreference: 'high-performance',
    });
  } catch {
    options.onWebGLUnavailable?.();
    return {
      setSliderProgress: () => {},
      setCapacityScale: () => {},
      setTheme: () => {},
      dispose: () => {},
    };
  }

  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.setPixelRatio(
    isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2)
  );
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = !isSoftwareGl;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const canvas = renderer.domElement;
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.display = 'block';
  canvas.style.touchAction = 'pan-y';
  container.appendChild(canvas);

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 30);
  camera.position.set(0, 1.48, 5.55);
  camera.lookAt(0, 1.38, 0);

  // Procedural Studio Environment Reflection (RoomEnvironment)
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const roomEnv = new RoomEnvironment();
  const envTarget = pmremGenerator.fromScene(roomEnv, 0.04);
  scene.environment = envTarget.texture;
  roomEnv.dispose();
  pmremGenerator.dispose();

  // Balanced 3-Point Studio Lighting + Softbox
  const hemiLight = new THREE.HemisphereLight(0xe4efe9, 0x4b5650, 0.85);
  scene.add(hemiLight);

  const keyLight = new THREE.DirectionalLight(0xfff5e8, 2.25);
  keyLight.position.set(3.8, 5.2, 4.4);
  keyLight.castShadow = !isSoftwareGl;
  if (!isSoftwareGl) {
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 16;
    const d = 3.5;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
  }
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0xd4ebe0, 1.65);
  rimLight.position.set(-3.4, 3.2, -3.6);
  scene.add(rimLight);

  const fillLight = new THREE.DirectionalLight(0xeaf2ee, 0.72);
  fillLight.position.set(-3.2, 1.4, 3.4);
  scene.add(fillLight);

  let rectLight: THREE.RectAreaLight | null = null;
  if (!isSoftwareGl) {
    RectAreaLightUniformsLib.init();
    rectLight = new THREE.RectAreaLight(0xffffff, 2.6, 1.4, 3.6);
    rectLight.position.set(2.4, 1.8, 2.2);
    rectLight.lookAt(0, 1.4, 0);
    scene.add(rectLight);
  }

  // Shared Procedural Textures
  const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
  const powderBump = createPowderCoatBumpTexture();
  const brushedMap = createBrushedMetalTexture();
  const shadowTex = createContactShadowTexture();

  // Carousel Rail containing all 3 bottle variants
  const carouselGroup = new THREE.Group();
  scene.add(carouselGroup);

  const bottles: BuiltBottle[] = VARIANT_SPECS.map((spec, idx) => {
    const built = buildBottleModel(spec, {
      powderBump,
      brushedMap,
      shadowTex,
      maxAnisotropy,
      isSoftwareGl,
    });
    built.root.position.set(idx * CAROUSEL_SPACING, 0, 0);
    built.hitProxy.userData.variantIndex = idx;
    carouselGroup.add(built.root);
    return built;
  });

  const hitProxies = bottles.map((b) => b.hitProxy);

  // State for smooth damping
  let targetProgress = THREE.MathUtils.clamp(options.initialVariantIndex, 0, 2);
  let currentProgress = targetProgress;
  let targetCapacityScale = 1.0;
  let currentCapacityScale = 1.0;
  let currentTheme = options.initialTheme;

  // Interactive 360-degree rotation state
  let userRotY = -0.22;
  let targetRotY = -0.22;
  let userRotX = 0.04;
  let targetRotX = 0.04;
  let isPointerDown = false;
  let dragDistance = 0;
  let lastPointerX = 0;
  let lastPointerY = 0;
  let hasInteracted = false;

  const applyThemeLighting = (theme: 'light' | 'dark') => {
    currentTheme = theme;
    const isDark = theme === 'dark';
    hemiLight.intensity = isDark ? 0.65 : 0.92;
    keyLight.intensity = isDark ? 2.15 : 2.35;
    rimLight.intensity = isDark ? 2.1 : 1.45;
    fillLight.intensity = isDark ? 0.55 : 0.78;
    if (rectLight) {
      rectLight.intensity = isDark ? 2.4 : 2.6;
    }
    renderer.toneMappingExposure = isDark ? 1.05 : 1.1;
  };
  applyThemeLighting(currentTheme);

  const resize = () => {
    const w = Math.max(container.clientWidth, 1);
    const h = Math.max(container.clientHeight, 1);
    camera.aspect = w / h;
    // Slightly pull camera back on narrower viewports so the full bottle fits cleanly
    camera.position.z = w < 420 ? 6.1 : 5.45;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  };
  resize();

  if (!isSoftwareGl) {
    renderer.compile(scene, camera);
  }

  let disposed = false;
  let frameId = 0;
  let renderBusy = false;
  let renderDirty = false;
  let contextLost = false;
  const clock = new THREE.Clock();

  const updateSceneTransforms = (dt: number) => {
    currentProgress = THREE.MathUtils.damp(
      currentProgress,
      targetProgress,
      8.5,
      dt
    );
    currentCapacityScale = THREE.MathUtils.damp(
      currentCapacityScale,
      targetCapacityScale,
      9.0,
      dt
    );

    if (!isPointerDown && !prefersReduced && !hasInteracted) {
      // Gentle showcase turntable until user grabs the bottle
      targetRotY += dt * 0.28;
    }

    userRotY = THREE.MathUtils.damp(userRotY, targetRotY, 10, dt);
    userRotX = THREE.MathUtils.damp(userRotX, targetRotX, 10, dt);

    carouselGroup.position.x = -currentProgress * CAROUSEL_SPACING;

    for (let i = 0; i < bottles.length; i++) {
      const bottle = bottles[i];
      const offset = i - currentProgress;
      const dist = Math.abs(offset);

      // Center variant stands proud; adjacent variants step back & scale subtly
      const focusFactor = Math.max(0, 1 - Math.min(dist, 1));
      const scale =
        THREE.MathUtils.lerp(0.76, 1.0, focusFactor) * currentCapacityScale;
      bottle.root.scale.setScalar(scale);
      bottle.root.position.z = -Math.min(dist, 1.4) * 1.15;

      // Active bottle uses interactive 360 rotation; adjacent bottles angle slightly toward center
      const spinBlend = THREE.MathUtils.smoothstep(focusFactor, 0.25, 1.0);
      bottle.spinGroup.rotation.y =
        userRotY * spinBlend + offset * -0.35 * (1 - spinBlend);
      bottle.spinGroup.rotation.x = userRotX * spinBlend;

      // Fade contact shadow opacity cleanly with distance from center
      const shadowMat = bottle.shadowMesh.material as THREE.MeshBasicMaterial;
      const baseOpacity = currentTheme === 'dark' ? 0.62 : 0.45;
      shadowMat.opacity = baseOpacity * THREE.MathUtils.lerp(0.35, 1.0, focusFactor);
    }
  };

  function afterDraw(cb: () => void) {
    if (disposed) return;
    const gl = renderer.getContext() as WebGL2RenderingContext;
    if (!gl || typeof gl.fenceSync !== 'function') {
      frameId = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (disposed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        frameId = window.setTimeout(cb, 80);
      }
    };
    frameId = window.setTimeout(poll, 5);
  }

  const requestRender = () => {
    if (disposed || contextLost) return;
    if (renderBusy) {
      renderDirty = true;
      return;
    }
    renderBusy = true;
    frameId = requestAnimationFrame(() => {
      if (disposed || contextLost) {
        renderBusy = false;
        return;
      }
      renderDirty = false;
      const dt = Math.min(clock.getDelta(), 0.05);
      updateSceneTransforms(dt);
      renderer.render(scene, camera);

      const done = () => {
        renderBusy = false;
        const stillSettling =
          Math.abs(currentProgress - targetProgress) > 0.001 ||
          Math.abs(currentCapacityScale - targetCapacityScale) > 0.001 ||
          Math.abs(userRotY - targetRotY) > 0.001 ||
          Math.abs(userRotX - targetRotX) > 0.001;
        if (renderDirty || stillSettling) {
          requestRender();
        }
      };

      if (isSoftwareGl) afterDraw(done);
      else done();
    });
  };

  const tick = () => {
    if (disposed || contextLost) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    updateSceneTransforms(dt);
    renderer.render(scene, camera);
    if (isSoftwareGl) {
      afterDraw(tick);
    } else {
      frameId = requestAnimationFrame(tick);
    }
  };

  // Start loop (static on-demand if reduced-motion, otherwise continuous gentle loop)
  if (prefersReduced) {
    updateSceneTransforms(1);
    requestRender();
  } else {
    clock.start();
    if (isSoftwareGl) {
      tick();
    } else {
      frameId = requestAnimationFrame(tick);
    }
  }

  // Pointer interaction on 3D canvas: drag to spin 360°, click side bottle to select
  const onPointerDown = (e: PointerEvent) => {
    isPointerDown = true;
    dragDistance = 0;
    lastPointerX = e.clientX;
    lastPointerY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = 'grabbing';
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!isPointerDown) return;
    const dx = e.clientX - lastPointerX;
    const dy = e.clientY - lastPointerY;
    lastPointerX = e.clientX;
    lastPointerY = e.clientY;
    dragDistance += Math.hypot(dx, dy);

    if (dragDistance > 4) {
      hasInteracted = true;
      targetRotY += dx * 0.011;
      targetRotX = THREE.MathUtils.clamp(targetRotX + dy * 0.006, -0.36, 0.36);
      if (prefersReduced) requestRender();
    }
  };

  const onPointerUp = (e: PointerEvent) => {
    if (!isPointerDown) return;
    isPointerDown = false;
    canvas.style.cursor = 'grab';
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore if pointer capture already released
    }

    // Short click: check if user clicked an adjacent bottle to slide to it
    if (dragDistance <= 6) {
      const rect = canvas.getBoundingClientRect();
      _pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      _pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      _raycaster.setFromCamera(_pointerNdc, camera);
      const hits = _raycaster.intersectObjects(hitProxies, false);
      if (hits.length > 0) {
        const hitIdx = hits[0].object.userData.variantIndex;
        if (typeof hitIdx === 'number' && Math.round(targetProgress) !== hitIdx) {
          targetProgress = hitIdx;
          options.onSelectVariant?.(hitIdx);
          if (prefersReduced) requestRender();
        }
      }
    }
  };

  const onContextLost = (e: Event) => {
    e.preventDefault();
    contextLost = true;
    cancelAnimationFrame(frameId);
    window.clearTimeout(frameId);
  };

  const onContextRestored = () => {
    contextLost = false;
    if (prefersReduced) requestRender();
    else frameId = requestAnimationFrame(tick);
  };

  const onResize = () => {
    resize();
    if (prefersReduced) requestRender();
  };

  canvas.style.cursor = 'grab';
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('webglcontextlost', onContextLost);
  canvas.addEventListener('webglcontextrestored', onContextRestored);

  const resizeObserver = new ResizeObserver(onResize);
  resizeObserver.observe(container);

  return {
    setSliderProgress(progress: number) {
      targetProgress = THREE.MathUtils.clamp(progress, 0, VARIANT_SPECS.length - 1);
      if (prefersReduced) requestRender();
    },
    setCapacityScale(scale: number) {
      targetCapacityScale = THREE.MathUtils.clamp(scale, 0.85, 1.15);
      if (prefersReduced) requestRender();
    },
    setTheme(theme: 'light' | 'dark') {
      applyThemeLighting(theme);
      if (prefersReduced) requestRender();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frameId);
      window.clearTimeout(frameId);
      resizeObserver.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);

      powderBump.dispose();
      brushedMap.dispose();
      shadowTex.dispose();
      envTarget.dispose();

      for (const bottle of bottles) {
        bottle.disposables.geometries.forEach((g) => g.dispose());
        bottle.disposables.materials.forEach((m) => m.dispose());
        bottle.disposables.textures.forEach((t) => t.dispose());
      }

      renderer.dispose();
      if (canvas.parentElement === container) {
        container.removeChild(canvas);
      }
    },
  };
}
