import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  type UpgradeId,
  type UpgradeLevels,
  type ComboState,
  type EconomyState,
  type SnowCellLogic,
  type CabinTarget,
  computeTruckStats,
  updateComboOnPlow,
  tickComboTimer,
  calculatePlowReward,
  isPointInPlowBlade,
  computeClearedPercentage,
  checkDistrictVictory,
  checkCabinLiberated,
  purchaseUpgrade,
} from './rules';
import {
  buildSnowplowTruck,
  buildCozyCabin,
  buildTownClocktower,
  buildCocoaThermos,
  createProceduralAsphaltTexture,
  createProceduralBumpTexture,
  type SnowplowRig,
  type CabinRig,
} from './models';
import { synthAudio } from './audio';

export type GameStateMode = 'title' | 'playing' | 'paused' | 'gameover';

export interface HudSnapshot {
  mode: GameStateMode;
  outcome: 'victory' | 'defeat' | null;
  districtIndex: number;
  districtName: string;
  targetPercent: number;
  clearedPercent: number;
  cabinsLiberated: number;
  totalCabins: number;
  coins: number;
  score: number;
  bestScore: number;
  warmth: number;
  maxWarmth: number;
  comboCount: number;
  multiplier: number;
  comboTimerRatio: number; // 0..1
  maxComboReached: number;
  boostCharge: number; // 0..1
  isBoosting: boolean;
  upgrades: UpgradeLevels;
  elapsedSeconds: number;
  recentBanner: string | null;
  cameraZoomPreset: 'isometric' | 'close';
}

interface PooledParticle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  scale: number;
  age: number;
  maxAge: number;
  colorHex: number;
}

interface WinterHazard {
  id: number;
  kind: 'snowball_charger' | 'frost_orbiter' | 'snowman_patrol';
  group: THREE.Group;
  telegraphRing: THREE.Mesh;
  x: number;
  z: number;
  vx: number;
  vz: number;
  angle: number;
  phaseTimer: number;
  isCharging: boolean;
  radius: number;
  orbitCenterX: number;
  orbitCenterZ: number;
  orbitRadius: number;
}

interface CocoaPickup {
  id: number;
  group: THREE.Group;
  x: number;
  z: number;
  active: boolean;
  respawnTimer: number;
}

const DISTRICT_CONFIGS = [
  { name: 'Pinecone Hollow', targetPercent: 45, iceRatio: 0.12 },
  { name: 'Clocktower Commons', targetPercent: 55, iceRatio: 0.24 },
  { name: 'Starlight Alpine Ridge', targetPercent: 65, iceRatio: 0.35 },
];

// Pre-allocated module-scope math helpers (Zero GC in render loop)
const _dummyObj = new THREE.Object3D();
const _tempColor = new THREE.Color();
const _camTargetPos = new THREE.Vector3();
const _camLookAt = new THREE.Vector3();

export class FrostplowSceneManager {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private isHeadless: boolean;
  private rafId: number | null = null;
  private lastFrameTime: number = 0;
  private lastHeadlessRenderTime: number = 0;

  // Game state
  private mode: GameStateMode = 'title';
  private outcome: 'victory' | 'defeat' | null = null;
  private districtIndex: number = 0;
  private elapsedSeconds: number = 0;
  private bestScore: number = 0;
  private cameraZoomPreset: 'isometric' | 'close' = 'isometric';

  // Economy & Combo
  private economy: EconomyState = {
    coins: 35, // Generous starter coins so player can test an upgrade immediately or after 1 drift
    score: 0,
    warmth: 5,
    maxWarmth: 5,
    upgrades: {
      bladeWidth: 1,
      engineTorque: 1,
      saltMelter: 1,
      hopperBounty: 1,
    },
  };

  private combo: ComboState = {
    comboCount: 0,
    multiplier: 1,
    timer: 0,
    maxTimer: 3.4,
    maxComboReached: 1,
  };

  // Truck kinematics
  private plowRig!: SnowplowRig;
  private truckX: number = 0;
  private truckZ: number = 14; // Open avenue facing North (-Z / +Z road)
  private truckAngle: number = Math.PI; // Facing North toward Central Clocktower (0, 0)
  private truckSpeed: number = 0;
  private boostCharge: number = 1.0;
  private boostActiveTimer: number = 0;
  private hitstopTimer: number = 0;
  private hitFlashTimer: number = 0;
  private cameraTrauma: number = 0;
  private hurtCooldown: number = 0;
  private bladeSquash: number = 1.0;

  // Input state
  private keysHeld: Set<string> = new Set();
  private keysJustPressed: Set<string> = new Set();
  private pointerSteerActive: boolean = false;
  private pointerTargetX: number = 0;
  private pointerTargetZ: number = 0;
  private raycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private pointerNdc = new THREE.Vector2();
  private pointerHit = new THREE.Vector3();

  // Snow InstancedMesh & Logic
  private snowCells: SnowCellLogic[] = [];
  private snowInstancedMesh!: THREE.InstancedMesh;
  private clearedSnowCount: number = 0;

  // Cabins & Landmarks
  private cabins: CabinTarget[] = [];
  private cabinRigs: CabinRig[] = [];
  private recentBanner: string | null = null;
  private bannerTimer: number = 0;

  // Pooled 3D Snow Spray & Sparkle Particles
  private particlePool: PooledParticle[] = [];
  private particleMesh!: THREE.InstancedMesh;
  private particleCursor: number = 0;
  private readonly MAX_PARTICLES = 260;

  // Ambient Snowfall Points
  private snowfallPoints!: THREE.Points;

  // Hazards & Cocoa Pickups
  private hazards: WinterHazard[] = [];
  private cocoaPickups: CocoaPickup[] = [];

  // HUD Callback (throttled)
  private onHudUpdate: (snap: HudSnapshot) => void;
  private lastHudEmitAt: number = 0;

  constructor(container: HTMLElement, onHudUpdate: (snap: HudSnapshot) => void) {
    this.container = container;
    this.onHudUpdate = onHudUpdate;
    this.isHeadless =
      navigator.webdriver || /HeadlessChrome/i.test(navigator.userAgent);

    // 1. Initialize Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isHeadless,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.setPixelRatio(
      this.isHeadless ? 1 : Math.min(window.devicePixelRatio || 1, 2)
    );
    this.renderer.shadowMap.enabled = !this.isHeadless;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const rect = this.container.getBoundingClientRect();
    const width = Math.max(320, rect.width || window.innerWidth);
    const height = Math.max(240, rect.height || window.innerHeight);
    this.renderer.setSize(width, height);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.setAttribute('data-testid', 'frostplow-canvas');
    this.container.appendChild(this.renderer.domElement);

    // 2. Initialize Scene, Studio Environment & Horizon Fog
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0d1829);
    this.scene.fog = new THREE.FogExp2(0x0d1829, 0.011);

    if (!this.isHeadless) {
      const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
      this.scene.environment = pmremGenerator.fromScene(
        new RoomEnvironment(),
        0.04
      ).texture;
      pmremGenerator.dispose();
    }

    // 3. Isometric-Feel Low-FOV Perspective Camera
    this.camera = new THREE.PerspectiveCamera(32, width / height, 1.0, 220);
    this.camera.position.set(22, 26, 36);
    this.camera.lookAt(0, 0, 6);

    // 4. Build Lighting, Static Environment, Snowplow, Pool, and District 1
    this.setupLighting();
    this.buildStaticVillageEnvironment();
    this.plowRig = buildSnowplowTruck();
    this.scene.add(this.plowRig.root);
    this.initParticlePool();
    this.initAmbientSnowfall();
    this.buildSnowGridAndActors();

    // Render initial frame immediately
    this.renderer.render(this.scene, this.camera);

    // 5. Bind Input & Resize Listeners
    this.bindEvents();
    this.syncBodyDataset();
    this.emitHudSnapshot(true);

    // 6. Start Animation Loop
    this.lastFrameTime = performance.now();
    this.scheduleNextFrame();
  }

  private setupLighting(): void {
    // Cool winter sky / snow reflection HemisphereLight fill
    const hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x334155, 1.15);
    hemiLight.position.set(0, 50, 0);
    this.scene.add(hemiLight);

    // Warm Golden-Hour Alpine Sun Key Light (1 shadow caster)
    const dirLight = new THREE.DirectionalLight(0xfff3d1, 2.65);
    dirLight.position.set(28, 42, 24);
    dirLight.castShadow = !this.isHeadless;
    if (!this.isHeadless) {
      dirLight.shadow.mapSize.width = 1024;
      dirLight.shadow.mapSize.height = 1024;
      const d = 38;
      dirLight.shadow.camera.left = -d;
      dirLight.shadow.camera.right = d;
      dirLight.shadow.camera.top = d;
      dirLight.shadow.camera.bottom = -d;
      dirLight.shadow.camera.near = 5;
      dirLight.shadow.camera.far = 110;
      dirLight.shadow.bias = -0.0005;
      dirLight.shadow.normalBias = 0.02;
    }
    this.scene.add(dirLight);

    // Crisp Ice Rim Backlight
    const rimLight = new THREE.DirectionalLight(0x93c5fd, 0.9);
    rimLight.position.set(-25, 22, -28);
    this.scene.add(rimLight);

    // Warm PointLight + 4 Cozy Streetlamps around Central Clocktower Plaza
    const plazaLight = new THREE.PointLight(0xffb703, 24, 28, 1.6);
    plazaLight.position.set(0, 5.0, 0);
    this.scene.add(plazaLight);

    const postMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.5,
      metalness: 0.7,
    });
    const bulbMat = new THREE.MeshStandardMaterial({
      color: 0xfffbeb,
      emissive: 0xfbbf24,
      emissiveIntensity: 2.6,
    });
    const lampCoords: [number, number][] = [
      [-6.8, 6.8],
      [6.8, 6.8],
      [-6.8, -6.8],
      [6.8, -6.8],
    ];
    for (const [lx, lz] of lampCoords) {
      const lampGroup = new THREE.Group();
      lampGroup.position.set(lx, 0, lz);
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.14, 3.2, 8),
        postMat
      );
      pole.position.y = 1.6;
      const lantern = new THREE.Mesh(
        new THREE.SphereGeometry(0.32, 10, 10),
        bulbMat
      );
      lantern.position.y = 3.3;
      lampGroup.add(pole, lantern);
      this.scene.add(lampGroup);
    }
  }

  private buildStaticVillageEnvironment(): void {
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    const asphaltTex = createProceduralAsphaltTexture(maxAniso);
    const bumpTex = createProceduralBumpTexture(maxAniso);

    // Outer Alpine Snow Meadow Ground (180x180m so no void is ever visible)
    const meadowGeo = new THREE.PlaneGeometry(200, 200);
    meadowGeo.rotateX(-Math.PI / 2);
    const meadowMat = new THREE.MeshStandardMaterial({
      color: 0xdbeafe,
      roughness: 0.88,
      metalness: 0.04,
      bumpMap: bumpTex,
      bumpScale: 0.04,
    });
    const meadowMesh = new THREE.Mesh(meadowGeo, meadowMat);
    meadowMesh.position.y = -0.04;
    meadowMesh.receiveShadow = true;
    this.scene.add(meadowMesh);

    // Plowable Village Road & Plaza Surface (sits at y = 0.0, offset from meadow by 0.04 so zero Z-fighting)
    const roadMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: asphaltTex,
      bumpMap: bumpTex,
      bumpScale: 0.03,
      roughness: 0.78,
      metalness: 0.12,
    });

    const roadSegments: [number, number, number, number][] = [
      [0, 0, 14, 14], // Central Clocktower Plaza
      [0, 0, 7.5, 52], // North-South Main Avenue
      [0, 0, 52, 7.5], // East-West Cross Street
      [0, -18, 42, 6.0], // North Ring Lane
      [0, 18, 42, 6.0], // South Ring Lane
      [-18, 0, 6.0, 42], // West Ring Lane
      [18, 0, 6.0, 42], // East Ring Lane
    ];

    for (let i = 0; i < roadSegments.length; i++) {
      const [rx, rz, rw, rd] = roadSegments[i];
      const segGeo = new THREE.PlaneGeometry(rw, rd);
      segGeo.rotateX(-Math.PI / 2);
      const segMesh = new THREE.Mesh(segGeo, roadMat);
      // Slight stagger in y (0.001 * i) to prevent coplanar road overlaps
      segMesh.position.set(rx, 0.001 * i, rz);
      segMesh.receiveShadow = true;
      this.scene.add(segMesh);
    }

    // Central Landmark: Alpine Town Clocktower at (0, 0, 0)
    const clocktower = buildTownClocktower();
    clocktower.position.set(0, 0, 0);
    this.scene.add(clocktower);

    // 6 Cozy Alpine Cabins around the Village Streets
    const cabinSpecs: {
      id: string;
      name: string;
      x: number;
      z: number;
      rotY: number;
      drivewayX: number;
      drivewayZ: number;
      roofColor: number;
    }[] = [
      {
        id: 'cabin-bakery',
        name: 'Cinnamon Hearth Bakery',
        x: -11.5,
        z: 11.5,
        rotY: 0,
        drivewayX: -11.5,
        drivewayZ: 16.5,
        roofColor: 0xb91c1c,
      },
      {
        id: 'cabin-cocoa',
        name: 'Hot Cocoa Roastery',
        x: 11.5,
        z: 11.5,
        rotY: 0,
        drivewayX: 11.5,
        drivewayZ: 16.5,
        roofColor: 0x0f766e,
      },
      {
        id: 'cabin-post',
        name: 'Alpine Parcel Post',
        x: -11.5,
        z: -11.5,
        rotY: Math.PI,
        drivewayX: -11.5,
        drivewayZ: -16.5,
        roofColor: 0x1d4ed8,
      },
      {
        id: 'cabin-lodge',
        name: 'Evergreen Timber Lodge',
        x: 11.5,
        z: -11.5,
        rotY: Math.PI,
        drivewayX: 11.5,
        drivewayZ: -16.5,
        roofColor: 0x9a3412,
      },
      {
        id: 'cabin-smith',
        name: 'Brass Bell Workshop',
        x: -24.5,
        z: -7.5,
        rotY: Math.PI / 2,
        drivewayX: -19.5,
        drivewayZ: -7.5,
        roofColor: 0x6d28d9,
      },
      {
        id: 'cabin-chalet',
        name: 'Snowdrop Ski Chalet',
        x: 24.5,
        z: 7.5,
        rotY: -Math.PI / 2,
        drivewayX: 19.5,
        drivewayZ: 7.5,
        roofColor: 0xbe123c,
      },
    ];

    this.cabins = [];
    this.cabinRigs = [];

    for (const spec of cabinSpecs) {
      const rig = buildCozyCabin(spec.roofColor, spec.x, spec.z, spec.rotY, 5.0);
      this.scene.add(rig.group);
      this.cabinRigs.push(rig);
      this.cabins.push({
        id: spec.id,
        name: spec.name,
        drivewayX: spec.drivewayX,
        drivewayZ: spec.drivewayZ,
        drivewayRadius: 3.4,
        liberated: false,
        bonusCoins: 30,
        bonusScore: 300,
      });
    }

    // Perimeter Pine Forest Grove (InstancedMesh with 3 parts: Trunk, Foliage Cone, Snow Tier)
    const treePositions: [number, number, number][] = [];
    for (let i = 0; i < 165; i++) {
      const angle = (i / 165) * Math.PI * 2 + (i % 5) * 0.17;
      const dist = 30 + (i % 7) * 4.2 + Math.sin(i * 1.7) * 2.5;
      const tx = Math.cos(angle) * dist;
      const tz = Math.sin(angle) * dist;
      const scale = 0.85 + (i % 5) * 0.08;
      treePositions.push([tx, tz, scale]);
    }
    // Add decorative trees in courtyard islands
    const courtyardTrees: [number, number, number][] = [
      [-8, 7, 0.95],
      [8, 7, 1.05],
      [-8, -7, 1.0],
      [8, -7, 0.9],
      [-24, 14, 1.1],
      [24, -14, 1.1],
      [-24, -18, 1.0],
      [24, 18, 1.0],
    ];
    treePositions.push(...courtyardTrees);

    const treeCount = treePositions.length;
    const trunkMat = new THREE.MeshStandardMaterial({
      color: 0x5c3a21,
      roughness: 0.9,
    });
    const pineMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.78,
    });
    const snowTopMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.85,
    });

    const trunkInst = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.24, 0.34, 1.2, 7),
      trunkMat,
      treeCount
    );
    const boughInst = new THREE.InstancedMesh(
      new THREE.ConeGeometry(1.45, 3.2, 7),
      pineMat,
      treeCount
    );
    const snowCrownInst = new THREE.InstancedMesh(
      new THREE.ConeGeometry(1.12, 1.85, 7),
      snowTopMat,
      treeCount
    );

    boughInst.castShadow = !this.isHeadless;
    boughInst.receiveShadow = true;

    for (let i = 0; i < treeCount; i++) {
      const [tx, tz, s] = treePositions[i];

      _dummyObj.position.set(tx, 0.6 * s, tz);
      _dummyObj.rotation.set(0, (i * 1.1) % Math.PI, 0);
      _dummyObj.scale.set(s, s, s);
      _dummyObj.updateMatrix();
      trunkInst.setMatrixAt(i, _dummyObj.matrix);

      _dummyObj.position.set(tx, 2.1 * s, tz);
      _dummyObj.updateMatrix();
      boughInst.setMatrixAt(i, _dummyObj.matrix);

      // Tint variation per tree instance
      const greenShade = 0.22 + (i % 4) * 0.04;
      _tempColor.setRGB(0.12, greenShade + 0.12, 0.24);
      boughInst.setColorAt(i, _tempColor);

      _dummyObj.position.set(tx, 3.15 * s, tz);
      _dummyObj.updateMatrix();
      snowCrownInst.setMatrixAt(i, _dummyObj.matrix);
    }

    trunkInst.instanceMatrix.needsUpdate = true;
    boughInst.instanceMatrix.needsUpdate = true;
    if (boughInst.instanceColor) boughInst.instanceColor.needsUpdate = true;
    snowCrownInst.instanceMatrix.needsUpdate = true;

    trunkInst.computeBoundingSphere();
    boughInst.computeBoundingSphere();
    snowCrownInst.computeBoundingSphere();

    this.scene.add(trunkInst, boughInst, snowCrownInst);

    // Distant Perimeter Snow Hills / Mountain Backdrop Silhouettes
    const hillGeo = new THREE.ConeGeometry(16, 14, 7);
    const hillMat = new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      roughness: 0.92,
    });
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const r = 64 + (i % 3) * 8;
      const hill = new THREE.Mesh(hillGeo, hillMat);
      hill.position.set(Math.cos(a) * r, 5.5, Math.sin(a) * r);
      hill.scale.set(1.2 + (i % 3) * 0.3, 0.8 + (i % 2) * 0.4, 1.2);
      hill.rotation.y = a;
      this.scene.add(hill);
    }
  }

  private initParticlePool(): void {
    const pGeo = new THREE.DodecahedronGeometry(0.24, 0);
    const pMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.6,
      metalness: 0.05,
    });
    this.particleMesh = new THREE.InstancedMesh(pGeo, pMat, this.MAX_PARTICLES);
    this.particleMesh.frustumCulled = false;

    for (let i = 0; i < this.MAX_PARTICLES; i++) {
      this.particlePool.push({
        active: false,
        x: 0,
        y: -10,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        scale: 0.001,
        age: 0,
        maxAge: 0.5,
        colorHex: 0xffffff,
      });
      _dummyObj.position.set(0, -10, 0);
      _dummyObj.scale.setScalar(0.001);
      _dummyObj.updateMatrix();
      this.particleMesh.setMatrixAt(i, _dummyObj.matrix);
      this.particleMesh.setColorAt(i, _tempColor.setHex(0xffffff));
    }
    this.particleMesh.instanceMatrix.needsUpdate = true;
    if (this.particleMesh.instanceColor) {
      this.particleMesh.instanceColor.needsUpdate = true;
    }
    this.scene.add(this.particleMesh);
  }

  private spawnSnowBurst(
    wx: number,
    wy: number,
    wz: number,
    count: number,
    colorHex: number = 0xf8fafc
  ): void {
    const rightX = Math.cos(this.truckAngle);
    const rightZ = -Math.sin(this.truckAngle);

    for (let i = 0; i < count; i++) {
      const idx = this.particleCursor;
      this.particleCursor = (this.particleCursor + 1) % this.MAX_PARTICLES;
      const p = this.particlePool[idx];
      p.active = true;
      p.x = wx + (Math.random() - 0.5) * 1.1;
      p.y = wy + 0.25 + Math.random() * 0.35;
      p.z = wz + (Math.random() - 0.5) * 1.1;

      const sideSign = i % 2 === 0 ? 1 : -1;
      const sideSpeed = 2.8 + Math.random() * 4.2;
      p.vx = rightX * sideSign * sideSpeed + (Math.random() - 0.5) * 1.8;
      p.vy = 3.2 + Math.random() * 4.0;
      p.vz = rightZ * sideSign * sideSpeed + (Math.random() - 0.5) * 1.8;
      p.scale = 0.65 + Math.random() * 0.85;
      p.age = 0;
      p.maxAge = 0.42 + Math.random() * 0.32;
      p.colorHex = colorHex;
    }
  }

  private initAmbientSnowfall(): void {
    const flakeCount = 420;
    const positions = new Float32Array(flakeCount * 3);
    for (let i = 0; i < flakeCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 70;
      positions[i * 3 + 1] = Math.random() * 24 + 1;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 70;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.26,
      transparent: true,
      opacity: 0.72,
    });
    this.snowfallPoints = new THREE.Points(geo, mat);
    this.scene.add(this.snowfallPoints);
  }

  private isRoadCoordinate(x: number, z: number): boolean {
    // Keep Clocktower plinth (r < 3.5) and truck spawn pocket (0, 14, r < 2.6) clear
    if (x * x + z * z < 3.6 * 3.6) return false;
    const dxSpawn = x - 0;
    const dzSpawn = z - 14;
    if (dxSpawn * dxSpawn + dzSpawn * dzSpawn < 2.7 * 2.7) return false;

    // Central plaza
    if (Math.abs(x) <= 6.6 && Math.abs(z) <= 6.6) return true;
    // Main North-South & East-West avenues
    if (Math.abs(x) <= 3.3 && Math.abs(z) <= 24.5) return true;
    if (Math.abs(z) <= 3.3 && Math.abs(x) <= 24.5) return true;
    // Outer ring lanes
    if (Math.abs(Math.abs(z) - 18) <= 2.5 && Math.abs(x) <= 20.5) return true;
    if (Math.abs(Math.abs(x) - 18) <= 2.5 && Math.abs(z) <= 20.5) return true;

    return false;
  }

  private buildSnowGridAndActors(): void {
    // Clean up previous snow mesh & hazards if rebuilding for a new District
    if (this.snowInstancedMesh) {
      this.scene.remove(this.snowInstancedMesh);
      this.snowInstancedMesh.geometry.dispose();
      (this.snowInstancedMesh.material as THREE.Material).dispose();
    }
    for (const h of this.hazards) {
      this.scene.remove(h.group);
      this.scene.remove(h.telegraphRing);
    }
    for (const c of this.cocoaPickups) {
      this.scene.remove(c.group);
    }
    this.hazards = [];
    this.cocoaPickups = [];

    const districtCfg =
      DISTRICT_CONFIGS[this.districtIndex % DISTRICT_CONFIGS.length];

    // Generate Snow Grid Cells across village roads and cabin driveways
    this.snowCells = [];
    this.clearedSnowCount = 0;
    const step = 1.65;
    let idCounter = 0;

    for (let x = -24; x <= 24; x += step) {
      for (let z = -24; z <= 24; z += step) {
        if (!this.isRoadCoordinate(x, z)) continue;

        // Determine snow depth (1 = fluffy powder, 2 = medium drift, 3 = packed ice block)
        const noise = Math.sin(x * 0.35) * Math.cos(z * 0.35);
        let depth = 1;
        if (Math.abs(noise) > 1 - districtCfg.iceRatio) {
          depth = 3;
        } else if (noise > 0.15) {
          depth = 2;
        }

        this.snowCells.push({
          id: idCounter++,
          x,
          z,
          depth,
          maxDepth: depth,
        });
      }
    }

    const totalCells = this.snowCells.length;
    const snowGeo = new THREE.BoxGeometry(1.56, 0.56, 1.56);
    const snowMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.65,
      metalness: 0.04,
      emissive: 0x1e293b,
      emissiveIntensity: 0.18,
    });

    this.snowInstancedMesh = new THREE.InstancedMesh(
      snowGeo,
      snowMat,
      totalCells
    );
    this.snowInstancedMesh.receiveShadow = true;
    this.snowInstancedMesh.castShadow = !this.isHeadless;
    this.snowInstancedMesh.frustumCulled = false;

    for (let i = 0; i < totalCells; i++) {
      this.updateSnowCellInstance(i);
    }
    this.snowInstancedMesh.instanceMatrix.needsUpdate = true;
    if (this.snowInstancedMesh.instanceColor) {
      this.snowInstancedMesh.instanceColor.needsUpdate = true;
    }
    this.scene.add(this.snowInstancedMesh);

    // Reset cabins for the district
    for (let i = 0; i < this.cabins.length; i++) {
      this.cabins[i].liberated = false;
      const rig = this.cabinRigs[i];
      for (const wm of rig.windowMaterials) {
        wm.emissive.setHex(0xf59e0b);
        wm.emissiveIntensity = 0.75;
      }
      (rig.bannerRing.material as THREE.MeshBasicMaterial).color.setHex(
        0xf59e0b
      );
    }

    // Spawn 3 Distinct Winter Hazard Archetypes
    this.spawnWinterHazards();

    // Spawn 4 Cozy Hot Cocoa Thermos Pickups
    const cocoaSpots: [number, number][] = [
      [-18, 0],
      [18, 0],
      [0, -18],
      [0, 22],
    ];
    cocoaSpots.forEach(([cx, cz], idx) => {
      const group = buildCocoaThermos();
      group.position.set(cx, 0, cz);
      this.scene.add(group);
      this.cocoaPickups.push({
        id: idx,
        group,
        x: cx,
        z: cz,
        active: true,
        respawnTimer: 0,
      });
    });

    // Reset truck to open spawn lane facing North toward Clocktower
    this.truckX = 0;
    this.truckZ = 14;
    this.truckAngle = Math.PI;
    this.truckSpeed = 0;
    this.boostCharge = 1.0;
    this.boostActiveTimer = 0;
    this.syncTruckTransform();
  }

  private spawnWinterHazards(): void {
    // 1. Rolling Snowball Charger (rolls along North Avenue with ground telegraph)
    const chargerGroup = new THREE.Group();
    const ballMat = new THREE.MeshStandardMaterial({
      color: 0xe0f2fe,
      roughness: 0.5,
    });
    const coreBall = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.95, 1),
      ballMat
    );
    coreBall.position.y = 0.95;
    const iceSpikeMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.6,
      roughness: 0.2,
    });
    const band = new THREE.Mesh(
      new THREE.TorusGeometry(0.85, 0.14, 8, 16),
      iceSpikeMat
    );
    band.position.y = 0.95;
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1.1, 16).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: 0x050b14,
        transparent: true,
        opacity: 0.4,
        depthWrite: false,
      })
    );
    shadow.position.y = 0.02;
    chargerGroup.add(coreBall, band, shadow);
    this.scene.add(chargerGroup);

    const teleGeo = new THREE.RingGeometry(1.1, 1.45, 24);
    teleGeo.rotateX(-Math.PI / 2);
    const teleMat = new THREE.MeshBasicMaterial({
      color: 0xf43f5e,
      transparent: true,
      opacity: 0.0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const teleRing = new THREE.Mesh(teleGeo, teleMat);
    teleRing.position.y = 0.04;
    this.scene.add(teleRing);

    this.hazards.push({
      id: 1,
      kind: 'snowball_charger',
      group: chargerGroup,
      telegraphRing: teleRing,
      x: -16,
      z: -18,
      vx: 0,
      vz: 0,
      angle: 0,
      phaseTimer: 1.5,
      isCharging: false,
      radius: 1.15,
      orbitCenterX: 0,
      orbitCenterZ: -18,
      orbitRadius: 16,
    });

    // 2. Frost Sprite Orbiter (orbits Clocktower Plaza)
    const orbiterGroup = new THREE.Group();
    const crystalMat = new THREE.MeshStandardMaterial({
      color: 0x7dd3fc,
      emissive: 0x0ea5e9,
      emissiveIntensity: 0.85,
      roughness: 0.15,
      metalness: 0.5,
    });
    const octa = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.75, 0),
      crystalMat
    );
    octa.position.y = 1.1;
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(0.95, 0.08, 8, 20).rotateX(Math.PI / 2),
      ballMat
    );
    halo.position.y = 1.1;
    orbiterGroup.add(octa, halo, shadow.clone());
    this.scene.add(orbiterGroup);

    const teleRing2 = new THREE.Mesh(teleGeo.clone(), teleMat.clone());
    this.scene.add(teleRing2);

    this.hazards.push({
      id: 2,
      kind: 'frost_orbiter',
      group: orbiterGroup,
      telegraphRing: teleRing2,
      x: 5.2,
      z: 0,
      vx: 0,
      vz: 0,
      angle: 0,
      phaseTimer: 0,
      isCharging: false,
      radius: 1.0,
      orbitCenterX: 0,
      orbitCenterZ: 0,
      orbitRadius: 5.4,
    });

    // 3. Chilly Snowman Patrol (patrols East Avenue)
    const snowmanGroup = new THREE.Group();
    const botSphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.68, 14, 14),
      ballMat
    );
    botSphere.position.y = 0.65;
    const midSphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 14, 14),
      ballMat
    );
    midSphere.position.y = 1.48;
    const topHat = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.32, 0.48, 12),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.7 })
    );
    topHat.position.y = 2.05;
    snowmanGroup.add(botSphere, midSphere, topHat, shadow.clone());
    this.scene.add(snowmanGroup);

    const teleRing3 = new THREE.Mesh(teleGeo.clone(), teleMat.clone());
    this.scene.add(teleRing3);

    this.hazards.push({
      id: 3,
      kind: 'snowman_patrol',
      group: snowmanGroup,
      telegraphRing: teleRing3,
      x: 18,
      z: -10,
      vx: 0,
      vz: 2.8,
      angle: 0,
      phaseTimer: 0,
      isCharging: false,
      radius: 1.0,
      orbitCenterX: 18,
      orbitCenterZ: 0,
      orbitRadius: 12,
    });
  }

  private updateSnowCellInstance(index: number): void {
    const cell = this.snowCells[index];
    if (cell.depth <= 0.05) {
      _dummyObj.position.set(cell.x, -5, cell.z);
      _dummyObj.scale.setScalar(0.001);
      _dummyObj.updateMatrix();
      this.snowInstancedMesh.setMatrixAt(index, _dummyObj.matrix);
      return;
    }

    const heightScale =
      cell.depth === 1 ? 0.52 : cell.depth === 2 ? 0.95 : 1.42;
    _dummyObj.position.set(cell.x, 0.25 * heightScale, cell.z);
    _dummyObj.rotation.set(0, ((index * 17) % 4) * (Math.PI / 2), 0);
    _dummyObj.scale.set(1.0, heightScale, 1.0);
    _dummyObj.updateMatrix();
    this.snowInstancedMesh.setMatrixAt(index, _dummyObj.matrix);

    if (cell.depth >= 3) {
      // Packed crystalline glacial blue-white
      _tempColor.setHex(0x93c5fd);
    } else if (cell.depth === 2) {
      // Deep winter drift
      _tempColor.setHex(0xe2e8f0);
    } else {
      // Fresh fluffy powder
      _tempColor.setHex(0xf8fafc);
    }
    this.snowInstancedMesh.setColorAt(index, _tempColor);
  }

  private syncTruckTransform(): void {
    const stats = computeTruckStats(this.economy.upgrades);
    this.plowRig.root.position.set(this.truckX, 0, this.truckZ);
    this.plowRig.root.rotation.y = this.truckAngle;

    // Scale physical V-blade width visibly with bladeWidth upgrade
    const bladeScaleX = stats.bladeHalfWidth / 1.55;
    this.plowRig.bladeGroup.scale.set(
      bladeScaleX * this.bladeSquash,
      1 / Math.sqrt(this.bladeSquash),
      this.bladeSquash
    );
  }

  private bindEvents(): void {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleWindowBlur);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    window.addEventListener('resize', this.handleResize);

    const dom = this.renderer.domElement;
    dom.addEventListener('pointerdown', this.handlePointerDown);
    dom.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.handlePointerUp);
  }

  public dispose(): void {
    if (this.rafId !== null) {
      if (this.isHeadless) {
        clearTimeout(this.rafId);
      } else {
        cancelAnimationFrame(this.rafId);
      }
    }
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleWindowBlur);
    document.removeEventListener(
      'visibilitychange',
      this.handleVisibilityChange
    );
    window.removeEventListener('resize', this.handleResize);

    const dom = this.renderer.domElement;
    dom.removeEventListener('pointerdown', this.handlePointerDown);
    dom.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);

    this.renderer.dispose();
    if (dom.parentNode === this.container) {
      this.container.removeChild(dom);
    }
  }

  private handleKeyDown = (e: KeyboardEvent): void => {
    const code = e.code;
    if (!this.keysHeld.has(code)) {
      this.keysJustPressed.add(code);
    }
    this.keysHeld.add(code);

    if (this.mode === 'title') {
      if (code === 'Enter' || code === 'Space') {
        e.preventDefault();
        this.startGame();
      }
      return;
    }

    if (code === 'Escape' || code === 'KeyP') {
      e.preventDefault();
      if (this.mode === 'playing') {
        this.setMode('paused');
      } else if (this.mode === 'paused') {
        this.setMode('playing');
      }
      return;
    }

    if (code === 'KeyM') {
      synthAudio.toggleMuted();
      this.emitHudSnapshot(true);
      return;
    }

    if (code === 'KeyC' && this.mode === 'playing') {
      this.toggleCameraPreset();
      return;
    }

    if (code === 'KeyR' && (this.mode === 'playing' || this.mode === 'paused')) {
      this.restartCurrentDistrict();
      return;
    }

    if (this.mode === 'playing') {
      if (code === 'Digit1') this.tryUpgrade('bladeWidth');
      if (code === 'Digit2') this.tryUpgrade('engineTorque');
      if (code === 'Digit3') this.tryUpgrade('saltMelter');
      if (code === 'Digit4') this.tryUpgrade('hopperBounty');
    }
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    this.keysHeld.delete(e.code);
  };

  private handleWindowBlur = (): void => {
    this.keysHeld.clear();
    this.keysJustPressed.clear();
    this.pointerSteerActive = false;
  };

  private handleVisibilityChange = (): void => {
    if (document.hidden) {
      this.keysHeld.clear();
      this.keysJustPressed.clear();
      this.pointerSteerActive = false;
    }
  };

  private handleResize = (): void => {
    const rect = this.container.getBoundingClientRect();
    const width = Math.max(320, rect.width || window.innerWidth);
    const height = Math.max(240, rect.height || window.innerHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  private updatePointerWorldTarget(clientX: number, clientY: number): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    this.pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointerNdc, this.camera);
    if (this.raycaster.ray.intersectPlane(this.groundPlane, this.pointerHit)) {
      this.pointerTargetX = THREE.MathUtils.clamp(
        this.pointerHit.x,
        -25.5,
        25.5
      );
      this.pointerTargetZ = THREE.MathUtils.clamp(
        this.pointerHit.z,
        -25.5,
        25.5
      );
    }
  }

  private handlePointerDown = (e: PointerEvent): void => {
    if (this.mode !== 'playing') return;
    if (e.button !== 0) return;
    this.pointerSteerActive = true;
    this.updatePointerWorldTarget(e.clientX, e.clientY);
  };

  private handlePointerMove = (e: PointerEvent): void => {
    if (!this.pointerSteerActive || this.mode !== 'playing') return;
    this.updatePointerWorldTarget(e.clientX, e.clientY);
  };

  private handlePointerUp = (): void => {
    this.pointerSteerActive = false;
  };

  private syncBodyDataset(): void {
    document.body.dataset.state = this.mode;
  }

  public setMode(nextMode: GameStateMode): void {
    this.mode = nextMode;
    this.keysHeld.clear();
    this.keysJustPressed.clear();
    this.pointerSteerActive = false;
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    this.syncBodyDataset();
    this.emitHudSnapshot(true);
  }

  public startGame(): void {
    if (this.mode === 'gameover' && this.outcome === 'victory') {
      // Advance to next district
      this.districtIndex = (this.districtIndex + 1) % DISTRICT_CONFIGS.length;
      this.outcome = null;
      this.elapsedSeconds = 0;
      this.economy.warmth = this.economy.maxWarmth;
      this.buildSnowGridAndActors();
    } else if (this.mode === 'gameover' && this.outcome === 'defeat') {
      this.outcome = null;
      this.elapsedSeconds = 0;
      this.economy.warmth = this.economy.maxWarmth;
      this.buildSnowGridAndActors();
    }
    this.setMode('playing');
  }

  public restartCurrentDistrict(): void {
    this.outcome = null;
    this.elapsedSeconds = 0;
    this.economy.warmth = this.economy.maxWarmth;
    this.combo = {
      comboCount: 0,
      multiplier: 1,
      timer: 0,
      maxTimer: computeTruckStats(this.economy.upgrades).comboMaxDuration,
      maxComboReached: 1,
    };
    this.buildSnowGridAndActors();
    this.setMode('playing');
  }

  public returnToTitle(): void {
    this.outcome = null;
    this.setMode('title');
  }

  public toggleCameraPreset(): void {
    this.cameraZoomPreset =
      this.cameraZoomPreset === 'isometric' ? 'close' : 'isometric';
    this.emitHudSnapshot(true);
  }

  public tryUpgrade(id: UpgradeId): boolean {
    const res = purchaseUpgrade(this.economy, id);
    if (!res.purchased) return false;

    this.economy = res.nextState;
    this.bladeSquash = 1.28;
    synthAudio.playUpgradePurchased();
    this.syncTruckTransform();
    this.showBanner(`Upgraded ${id === 'bladeWidth' ? 'V-Blade Span' : id === 'engineTorque' ? 'Twin-Turbo Diesel' : id === 'saltMelter' ? 'Thermal Salt Spreader' : 'Brass Hopper'}!`);
    this.emitHudSnapshot(true);
    return true;
  }

  public triggerBoost(): void {
    if (this.mode !== 'playing') return;
    if (this.boostCharge >= 0.35 && this.boostActiveTimer <= 0) {
      this.boostActiveTimer = 1.35;
      this.boostCharge = Math.max(0, this.boostCharge - 0.55);
      this.bladeSquash = 1.24;
      synthAudio.playBoostDash();
      this.emitHudSnapshot(true);
    }
  }

  private showBanner(text: string): void {
    this.recentBanner = text;
    this.bannerTimer = 2.6;
  }

  private scheduleNextFrame(): void {
    if (this.isHeadless) {
      this.rafId = window.setTimeout(() => {
        this.loop(performance.now());
      }, 110) as unknown as number;
    } else {
      this.rafId = requestAnimationFrame(this.loop);
    }
  }

  private loop = (now: number): void => {
    this.scheduleNextFrame();

    const rawDt = (now - this.lastFrameTime) / 1000;
    this.lastFrameTime = now;
    const dt = Math.min(Math.max(rawDt, 0.001), 0.05);

    // Update simulation
    this.tick(dt, now / 1000);

    this.renderer.render(this.scene, this.camera);
  };

  private tick(dt: number, elapsedTotal: number): void {
    // 1. Animate ambient snowfall & beacon in all states
    this.updateAmbientWorld(dt, elapsedTotal);

    // 2. Title Screen Live Isometric Camera Tour (frames Clocktower on right, calm negative space on left)
    if (this.mode === 'title') {
      const orbitAngle = 0.55 + Math.sin(elapsedTotal * 0.25) * 0.22;
      const radius = 35;
      _camTargetPos.set(
        Math.sin(orbitAngle) * radius,
        24,
        Math.cos(orbitAngle) * radius
      );
      this.camera.position.lerp(_camTargetPos, 1 - Math.exp(-4 * dt));
      this.camera.lookAt(-6.5, 1.2, 2.5);
      this.keysJustPressed.clear();
      return;
    }

    if (this.mode !== 'playing') {
      this.keysJustPressed.clear();
      return;
    }

    // 3. Real-time timers (hit flash, camera trauma, banner)
    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer -= dt;
      const flashActive = this.hitFlashTimer > 0;
      for (const m of this.plowRig.hitFlashMaterials) {
        m.emissive.setHex(flashActive ? 0xffffff : 0x000000);
        m.emissiveIntensity = flashActive ? 0.65 : 0;
      }
    }

    if (this.cameraTrauma > 0) {
      this.cameraTrauma = Math.max(0, this.cameraTrauma - dt * 2.2);
    }

    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) {
        this.recentBanner = null;
      }
    }

    if (this.hurtCooldown > 0) {
      this.hurtCooldown = Math.max(0, this.hurtCooldown - dt);
    }

    this.bladeSquash = THREE.MathUtils.damp(this.bladeSquash, 1.0, 10, dt);

    // 4. Simulation Hitstop check (heavy ice impacts pause physics for 40ms while camera/particles continue)
    this.updateParticles(dt);

    if (this.hitstopTimer > 0) {
      this.hitstopTimer -= dt;
      this.updateGameplayCamera(dt);
      this.keysJustPressed.clear();
      return;
    }

    this.elapsedSeconds += dt;

    // 5. Edge-triggered Boost (`Space` or `ShiftLeft`)
    if (
      this.keysJustPressed.has('Space') ||
      this.keysJustPressed.has('ShiftLeft')
    ) {
      this.triggerBoost();
    }
    this.keysJustPressed.clear();

    // 6. Update Truck Movement & Kinematics
    this.updateTruckMovement(dt);

    // 7. Plow Snow Cells in Blade Footprint
    this.plowSnowStep(dt);

    // 8. Tick Combo Timer
    const prevMult = this.combo.multiplier;
    this.combo = tickComboTimer(this.combo, dt);
    if (prevMult !== this.combo.multiplier) {
      this.emitHudSnapshot(true);
    }

    // 9. Update Winter Hazards & Cocoa Pickups
    this.updateHazardsAndPickups(dt, elapsedTotal);

    // 10. Update Smooth Isometric Follow Camera
    this.updateGameplayCamera(dt);

    // 11. Throttled HUD update (<= 10Hz)
    const nowMs = performance.now();
    if (nowMs - this.lastHudEmitAt >= 100) {
      this.emitHudSnapshot(false);
    }
  }

  private updateAmbientWorld(dt: number, elapsedTotal: number): void {
    // Rotate Snowplow Beacon & Spreader
    this.plowRig.beaconMesh.rotation.y += dt * 6;
    this.plowRig.spreaderDisc.rotation.y += dt * (4 + Math.abs(this.truckSpeed));

    // Gently drift snowflakes downward
    const posAttr = this.snowfallPoints.geometry.getAttribute(
      'position'
    ) as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;
    for (let i = 0; i < arr.length; i += 3) {
      arr[i] += Math.sin(elapsedTotal + i) * dt * 0.4;
      arr[i + 1] -= dt * 2.8;
      if (arr[i + 1] < 0.2) {
        arr[i + 1] = 24;
      }
    }
    posAttr.needsUpdate = true;
  }

  private updateTruckMovement(dt: number): void {
    const stats = computeTruckStats(this.economy.upgrades);

    if (this.boostActiveTimer > 0) {
      this.boostActiveTimer = Math.max(0, this.boostActiveTimer - dt);
    } else {
      this.boostCharge = Math.min(1.0, this.boostCharge + dt * 0.22);
    }

    // Isometric screen-aligned directional intent OR tank/car steering
    let inputX = 0;
    let inputZ = 0;

    if (this.keysHeld.has('KeyW') || this.keysHeld.has('ArrowUp')) inputZ -= 1;
    if (this.keysHeld.has('KeyS') || this.keysHeld.has('ArrowDown')) inputZ += 1;
    if (this.keysHeld.has('KeyA') || this.keysHeld.has('ArrowLeft')) inputX -= 1;
    if (this.keysHeld.has('KeyD') || this.keysHeld.has('ArrowRight')) inputX += 1;

    if (inputX === 0 && inputZ === 0 && this.pointerSteerActive) {
      const dx = this.pointerTargetX - this.truckX;
      const dz = this.pointerTargetZ - this.truckZ;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.8) {
        inputX = dx / dist;
        inputZ = dz / dist;
      }
    }

    const hasInput = Math.hypot(inputX, inputZ) > 0.05;
    const targetMaxSpeed =
      this.boostActiveTimer > 0 ? stats.boostSpeed : stats.maxSpeed;

    if (hasInput) {
      // Camera is positioned at (+X, +Y, +Z) isometric corner, or standard North-Up
      // Direct world-aligned isometric steering: W = North (-Z), S = South (+Z), A = West (-X), D = East (+X)
      const desiredAngle = Math.atan2(inputX, inputZ);
      let angleDiff = desiredAngle - this.truckAngle;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

      const turnRate = 9.5;
      this.truckAngle += angleDiff * Math.min(1, turnRate * dt);
      this.truckSpeed = THREE.MathUtils.damp(
        this.truckSpeed,
        targetMaxSpeed,
        7.5,
        dt
      );
    } else if (this.boostActiveTimer > 0) {
      this.truckSpeed = THREE.MathUtils.damp(
        this.truckSpeed,
        targetMaxSpeed,
        8.0,
        dt
      );
    } else {
      this.truckSpeed = THREE.MathUtils.damp(this.truckSpeed, 0, 8.5, dt);
    }

    if (Math.abs(this.truckSpeed) > 0.05) {
      const nextX = this.truckX + Math.sin(this.truckAngle) * this.truckSpeed * dt;
      const nextZ = this.truckZ + Math.cos(this.truckAngle) * this.truckSpeed * dt;

      // Soft collision with Central Clocktower plinth (radius 3.4) and Cabins
      const distClock = Math.hypot(nextX, nextZ);
      let blocked = false;
      if (distClock < 3.45 && distClock > 0.001) {
        const pushR = 3.48 / distClock;
        this.truckX = nextX * pushR;
        this.truckZ = nextZ * pushR;
        blocked = true;
      }

      if (!blocked) {
        this.truckX = THREE.MathUtils.clamp(nextX, -25.2, 25.2);
        this.truckZ = THREE.MathUtils.clamp(nextZ, -25.2, 25.2);
      }

      // Gait-synced wheel spin & gentle engine chassis bob
      const travelStep = this.truckSpeed * dt;
      for (const w of this.plowRig.wheels) {
        w.rotation.x += travelStep * 2.2;
      }
      this.plowRig.chassisGroup.position.y =
        Math.abs(Math.sin(performance.now() * 0.018)) * 0.035;
    }

    this.syncTruckTransform();
  }

  private plowSnowStep(dt: number): void {
    const stats = computeTruckStats(this.economy.upgrades);
    const bladeCenterDist = 1.85;
    const bladeX = this.truckX + Math.sin(this.truckAngle) * bladeCenterDist;
    const bladeZ = this.truckZ + Math.cos(this.truckAngle) * bladeCenterDist;

    let blocksFullyCleared = 0;
    let depthRemovedSum = 0;
    let shatteredPackedIce = false;
    let touchedAnySnow = false;

    const powerPerFrame =
      (this.boostActiveTimer > 0 ? stats.plowPower * 2.5 : stats.plowPower) *
      dt *
      14;

    for (let i = 0; i < this.snowCells.length; i++) {
      const cell = this.snowCells[i];
      if (cell.depth <= 0.05) continue;

      if (
        isPointInPlowBlade(
          cell.x,
          cell.z,
          bladeX,
          bladeZ,
          this.truckAngle,
          stats.bladeHalfWidth,
          stats.bladeDepth
        )
      ) {
        touchedAnySnow = true;
        const prevDepth = cell.depth;
        const damage = Math.min(cell.depth, Math.max(0.65, powerPerFrame));
        cell.depth = Math.max(0, cell.depth - damage);
        depthRemovedSum += prevDepth - cell.depth;

        if (cell.depth <= 0.05) {
          cell.depth = 0;
          blocksFullyCleared++;
          this.clearedSnowCount++;
          if (cell.maxDepth >= 3) {
            shatteredPackedIce = true;
          }
        }
        this.updateSnowCellInstance(i);
      }
    }

    if (touchedAnySnow) {
      this.snowInstancedMesh.instanceMatrix.needsUpdate = true;
      if (this.snowInstancedMesh.instanceColor) {
        this.snowInstancedMesh.instanceColor.needsUpdate = true;
      }
    }

    if (blocksFullyCleared > 0 || depthRemovedSum > 0.25) {
      this.combo = updateComboOnPlow(
        this.combo,
        Math.max(1, blocksFullyCleared),
        stats.comboMaxDuration
      );

      const reward = calculatePlowReward(
        blocksFullyCleared,
        depthRemovedSum,
        this.combo.multiplier,
        stats.coinMultiplier
      );

      this.economy.score += reward.scoreDelta;
      this.economy.coins += reward.coinsDelta;
      if (this.economy.score > this.bestScore) {
        this.bestScore = this.economy.score;
      }

      // Recharge a bit of boost as you plow
      this.boostCharge = Math.min(
        1.0,
        this.boostCharge + blocksFullyCleared * 0.018
      );

      // Visual & Audio Juice scaled to event weight
      if (shatteredPackedIce) {
        this.hitstopTimer = 0.038;
        this.hitFlashTimer = 0.055;
        this.cameraTrauma = Math.min(1.0, this.cameraTrauma + 0.38);
        this.bladeSquash = 1.22;
        this.spawnSnowBurst(bladeX, 0.35, bladeZ, 16, 0x93c5fd);
        synthAudio.playIceShatter();
      } else {
        this.bladeSquash = Math.max(this.bladeSquash, 1.09);
        this.spawnSnowBurst(
          bladeX,
          0.25,
          bladeZ,
          Math.min(12, 3 + blocksFullyCleared * 2),
          0xf8fafc
        );
        synthAudio.playSnowPlowChime(
          this.combo.multiplier,
          depthRemovedSum > 1.8
        );
      }

      // Check if any Cozy Cabin driveway was just liberated
      this.checkCabinsAndVictory();
      this.emitHudSnapshot(true);
    }
  }

  private checkCabinsAndVictory(): void {
    for (let i = 0; i < this.cabins.length; i++) {
      const cabin = this.cabins[i];
      if (!cabin.liberated && checkCabinLiberated(cabin, this.snowCells)) {
        cabin.liberated = true;
        this.economy.coins += cabin.bonusCoins;
        this.economy.score += cabin.bonusScore;
        if (this.economy.score > this.bestScore) {
          this.bestScore = this.economy.score;
        }

        const rig = this.cabinRigs[i];
        for (const wm of rig.windowMaterials) {
          wm.emissive.setHex(0xfde047);
          wm.emissiveIntensity = 2.8;
        }
        (rig.bannerRing.material as THREE.MeshBasicMaterial).color.setHex(
          0x10b981
        );

        this.spawnSnowBurst(
          cabin.drivewayX,
          0.6,
          cabin.drivewayZ,
          22,
          0xfbbf24
        );
        synthAudio.playCabinLiberated();
        this.showBanner(
          `${cabin.name} Driveway Cleared! +${cabin.bonusCoins} Coins`
        );
      }
    }

    const districtCfg =
      DISTRICT_CONFIGS[this.districtIndex % DISTRICT_CONFIGS.length];
    if (
      checkDistrictVictory(
        this.clearedSnowCount,
        this.snowCells.length,
        districtCfg.targetPercent
      )
    ) {
      this.outcome = 'victory';
      synthAudio.playStageClearFanfare();
      this.setMode('gameover');
    }
  }

  private updateHazardsAndPickups(dt: number, elapsedTotal: number): void {
    // 1. Update Cocoa Pickups
    for (const c of this.cocoaPickups) {
      if (!c.active) {
        c.respawnTimer -= dt;
        if (c.respawnTimer <= 0) {
          c.active = true;
          c.group.visible = true;
        }
        continue;
      }
      c.group.rotation.y += dt * 1.8;
      c.group.position.y = Math.sin(elapsedTotal * 3 + c.id) * 0.12;

      const dist = Math.hypot(this.truckX - c.x, this.truckZ - c.z);
      if (dist < 2.2) {
        c.active = false;
        c.group.visible = false;
        c.respawnTimer = 14;
        this.economy.warmth = Math.min(
          this.economy.maxWarmth,
          this.economy.warmth + 1
        );
        this.boostCharge = 1.0;
        this.economy.coins += 12;
        synthAudio.playCocoaPickup();
        this.spawnSnowBurst(c.x, 0.6, c.z, 14, 0xfbbf24);
        this.showBanner('Hot Cocoa Thermos! +1 Warmth & Full Boost');
        this.emitHudSnapshot(true);
      }
    }

    // 2. Update 3 Distinct Winter Hazard Archetypes
    for (const h of this.hazards) {
      const teleMat = h.telegraphRing.material as THREE.MeshBasicMaterial;

      if (h.kind === 'snowball_charger') {
        h.phaseTimer -= dt;
        if (!h.isCharging) {
          // Windup telegraph phase (0.65s warning ring)
          teleMat.opacity =
            h.phaseTimer < 0.75
              ? 0.45 + Math.sin(elapsedTotal * 18) * 0.3
              : 0.0;
          h.telegraphRing.position.set(h.x, 0.05, h.z);
          if (h.phaseTimer <= 0) {
            h.isCharging = true;
            h.phaseTimer = 3.2;
            h.vx = h.x < 0 ? 10.0 : -10.0;
            teleMat.opacity = 0;
          }
        } else {
          h.x += h.vx * dt;
          h.group.rotation.z -= h.vx * dt * 0.8;
          if (Math.abs(h.x) > 19 || h.phaseTimer <= 0) {
            h.x = THREE.MathUtils.clamp(h.x, -18, 18);
            h.isCharging = false;
            h.phaseTimer = 1.8;
          }
        }
      } else if (h.kind === 'frost_orbiter') {
        h.angle += dt * 0.95;
        h.x = h.orbitCenterX + Math.cos(h.angle) * h.orbitRadius;
        h.z = h.orbitCenterZ + Math.sin(h.angle) * h.orbitRadius;
        h.group.rotation.y += dt * 2.5;
        teleMat.opacity = 0.22;
        h.telegraphRing.position.set(h.x, 0.04, h.z);
      } else if (h.kind === 'snowman_patrol') {
        h.z += h.vz * dt;
        if (h.z > 16) h.vz = -Math.abs(h.vz);
        if (h.z < -16) h.vz = Math.abs(h.vz);
        h.group.rotation.z = Math.sin(elapsedTotal * 6) * 0.08;
        teleMat.opacity = 0.18;
        h.telegraphRing.position.set(h.x, 0.04, h.z);
      }

      h.group.position.set(h.x, 0, h.z);

      // Check collision with Snowplow
      const dist = Math.hypot(this.truckX - h.x, this.truckZ - h.z);
      if (dist < h.radius + 1.35) {
        if (this.boostActiveTimer > 0) {
          // Boosting smashes the hazard for bonus coins!
          this.economy.coins += 18;
          this.economy.score += 150;
          this.hitstopTimer = 0.045;
          this.cameraTrauma = Math.min(1.0, this.cameraTrauma + 0.45);
          this.spawnSnowBurst(h.x, 0.8, h.z, 22, 0x38bdf8);
          synthAudio.playIceShatter();
          this.showBanner('Boost Smash! +18 Coins');
          // Relocate hazard away
          h.x = -h.x;
          h.phaseTimer = 2.5;
          h.isCharging = false;
          this.emitHudSnapshot(true);
        } else if (this.hurtCooldown <= 0) {
          this.hurtCooldown = 1.8;
          this.hitstopTimer = 0.05;
          this.hitFlashTimer = 0.08;
          this.cameraTrauma = Math.min(1.0, this.cameraTrauma + 0.55);
          this.economy.warmth = Math.max(0, this.economy.warmth - 1);
          synthAudio.playHazardBump();
          this.spawnSnowBurst(this.truckX, 0.7, this.truckZ, 16, 0xf43f5e);

          // Knockback impulse away from hazard
          const nx = (this.truckX - h.x) / Math.max(0.1, dist);
          const nz = (this.truckZ - h.z) / Math.max(0.1, dist);
          this.truckX = THREE.MathUtils.clamp(this.truckX + nx * 2.2, -25, 25);
          this.truckZ = THREE.MathUtils.clamp(this.truckZ + nz * 2.2, -25, 25);

          if (this.economy.warmth <= 0) {
            this.outcome = 'defeat';
            this.setMode('gameover');
          } else {
            this.showBanner('Chilly Drift Bump! Grab Hot Cocoa or Upgrade Hopper');
            this.emitHudSnapshot(true);
          }
        }
      }
    }
  }

  private updateParticles(dt: number): void {
    let anyUpdated = false;
    for (let i = 0; i < this.MAX_PARTICLES; i++) {
      const p = this.particlePool[i];
      if (!p.active) continue;
      anyUpdated = true;

      p.age += dt;
      if (p.age >= p.maxAge) {
        p.active = false;
        _dummyObj.position.set(0, -10, 0);
        _dummyObj.scale.setScalar(0.001);
        _dummyObj.updateMatrix();
        this.particleMesh.setMatrixAt(i, _dummyObj.matrix);
        continue;
      }

      p.vy -= 14.5 * dt; // Gravity
      p.x += p.vx * dt;
      p.y = Math.max(0.08, p.y + p.vy * dt);
      p.z += p.vz * dt;

      const lifeRatio = 1 - p.age / p.maxAge;
      _dummyObj.position.set(p.x, p.y, p.z);
      _dummyObj.rotation.set(p.age * 5, p.age * 3, 0);
      _dummyObj.scale.setScalar(p.scale * lifeRatio);
      _dummyObj.updateMatrix();
      this.particleMesh.setMatrixAt(i, _dummyObj.matrix);
      _tempColor.setHex(p.colorHex);
      this.particleMesh.setColorAt(i, _tempColor);
    }

    if (anyUpdated) {
      this.particleMesh.instanceMatrix.needsUpdate = true;
      if (this.particleMesh.instanceColor) {
        this.particleMesh.instanceColor.needsUpdate = true;
      }
    }
  }

  private updateGameplayCamera(dt: number): void {
    const isClose = this.cameraZoomPreset === 'close';
    const offsetX = isClose ? 13 : 19;
    const offsetY = isClose ? 16 : 24;
    const offsetZ = isClose ? 15 : 22;

    const shake = this.cameraTrauma * this.cameraTrauma * 0.45;
    const shakeX = (Math.random() - 0.5) * shake;
    const shakeY = (Math.random() - 0.5) * shake;

    _camTargetPos.set(
      this.truckX + offsetX + shakeX,
      offsetY + shakeY,
      this.truckZ + offsetZ
    );

    const dampFactor = 1 - Math.exp(-6.5 * dt);
    this.camera.position.lerp(_camTargetPos, dampFactor);

    // Look slightly ahead of the snowplow
    const leadX = this.truckX + Math.sin(this.truckAngle) * 1.8;
    const leadZ = this.truckZ + Math.cos(this.truckAngle) * 1.8;
    _camLookAt.set(leadX, 0.6, leadZ);
    this.camera.lookAt(_camLookAt);
  }

  private emitHudSnapshot(force: boolean): void {
    const now = performance.now();
    if (!force && now - this.lastHudEmitAt < 95) return;
    this.lastHudEmitAt = now;

    const districtCfg =
      DISTRICT_CONFIGS[this.districtIndex % DISTRICT_CONFIGS.length];
    const clearedPercent = computeClearedPercentage(
      this.clearedSnowCount,
      this.snowCells.length
    );
    const cabinsLiberated = this.cabins.filter((c) => c.liberated).length;

    this.onHudUpdate({
      mode: this.mode,
      outcome: this.outcome,
      districtIndex: this.districtIndex,
      districtName: districtCfg.name,
      targetPercent: districtCfg.targetPercent,
      clearedPercent,
      cabinsLiberated,
      totalCabins: this.cabins.length,
      coins: Math.round(this.economy.coins),
      score: Math.round(this.economy.score),
      bestScore: Math.round(this.bestScore),
      warmth: this.economy.warmth,
      maxWarmth: this.economy.maxWarmth,
      comboCount: this.combo.comboCount,
      multiplier: this.combo.multiplier,
      comboTimerRatio:
        this.combo.maxTimer > 0
          ? Math.max(0, Math.min(1, this.combo.timer / this.combo.maxTimer))
          : 0,
      maxComboReached: this.combo.maxComboReached,
      boostCharge: this.boostCharge,
      isBoosting: this.boostActiveTimer > 0,
      upgrades: { ...this.economy.upgrades },
      elapsedSeconds: Math.round(this.elapsedSeconds),
      recentBanner: this.recentBanner,
      cameraZoomPreset: this.cameraZoomPreset,
    });
  }
}
