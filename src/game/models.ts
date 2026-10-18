import * as THREE from 'three';

export interface SnowplowRig {
  root: THREE.Group;
  chassisGroup: THREE.Group;
  bladeGroup: THREE.Group;
  beaconMesh: THREE.Mesh;
  spreaderDisc: THREE.Mesh;
  wheels: THREE.Mesh[];
  hitFlashMaterials: THREE.MeshStandardMaterial[];
}

export interface CabinRig {
  group: THREE.Group;
  windowMaterials: THREE.MeshStandardMaterial[];
  lanternLight?: THREE.PointLight;
  bannerRing: THREE.Mesh;
}

export function createProceduralAsphaltTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#243044';
  ctx.fillRect(0, 0, 256, 256);

  // Subtle stone aggregate speckles
  for (let i = 0; i < 2400; i++) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const v = 32 + Math.floor(Math.random() * 28);
    ctx.fillStyle = `rgb(${v}, ${v + 8}, ${v + 20})`;
    ctx.fillRect(x, y, 2, 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(16, 16);
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createProceduralBumpTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 1200; i++) {
    const g = 90 + Math.floor(Math.random() * 75);
    ctx.fillStyle = `rgb(${g},${g},${g})`;
    ctx.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(12, 12);
  tex.anisotropy = maxAnisotropy;
  return tex;
}

/**
 * Builds the 11-part Composite Hero Snowplow Truck (`THREE.Group`)
 * Pivoted at bottom-center (y = 0 sits flush on road).
 */
export function buildSnowplowTruck(): SnowplowRig {
  const root = new THREE.Group();
  const chassisGroup = new THREE.Group();
  root.add(chassisGroup);

  const hitFlashMaterials: THREE.MeshStandardMaterial[] = [];

  // 1. Contact shadow disc (y = 0.015)
  const shadowGeo = new THREE.CircleGeometry(1.95, 24);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({
    color: 0x050b14,
    transparent: true,
    opacity: 0.44,
    depthWrite: false,
  });
  const shadowDisc = new THREE.Mesh(shadowGeo, shadowMat);
  shadowDisc.position.y = 0.015;
  root.add(shadowDisc);

  // Materials with distinct roughness/metalness contrast (>= 0.25 delta)
  const bodyRedMat = new THREE.MeshStandardMaterial({
    color: 0xe64833, // Cozy Alpine Fire-Engine Crimson/Orange
    roughness: 0.28,
    metalness: 0.35,
  });
  hitFlashMaterials.push(bodyRedMat);

  const roofCreamMat = new THREE.MeshStandardMaterial({
    color: 0xfaf3e0, // Matte Warm Cream
    roughness: 0.72,
    metalness: 0.08,
  });
  hitFlashMaterials.push(roofCreamMat);

  const darkChassisMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.8,
    metalness: 0.25,
  });

  const chromeMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.15,
    metalness: 0.92,
  });

  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x93c5fd,
    roughness: 0.1,
    metalness: 0.2,
    clearcoat: 1.0,
    clearcoatRoughness: 0.08,
  });

  const brassHopperMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b, // Warm Brass / Safety Gold
    roughness: 0.35,
    metalness: 0.65,
  });
  hitFlashMaterials.push(brassHopperMat);

  // 2. Primary Hull / Underbody Frame
  const frameGeo = new THREE.BoxGeometry(1.65, 0.38, 2.75);
  const frameMesh = new THREE.Mesh(frameGeo, darkChassisMat);
  frameMesh.position.set(0, 0.42, -0.05);
  frameMesh.castShadow = true;
  frameMesh.receiveShadow = true;
  chassisGroup.add(frameMesh);

  // 3. Beveled Engine Hood (ExtrudeGeometry)
  const hoodShape = new THREE.Shape();
  hoodShape.moveTo(-0.74, 0);
  hoodShape.lineTo(0.74, 0);
  hoodShape.lineTo(0.68, 0.56);
  hoodShape.lineTo(-0.68, 0.56);
  hoodShape.closePath();

  const hoodGeo = new THREE.ExtrudeGeometry(hoodShape, {
    depth: 1.05,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.05,
    bevelSegments: 2,
  });
  const hoodMesh = new THREE.Mesh(hoodGeo, bodyRedMat);
  hoodMesh.position.set(0, 0.56, 0.25);
  hoodMesh.castShadow = true;
  hoodMesh.receiveShadow = true;
  chassisGroup.add(hoodMesh);

  // Chrome Front Grille
  const grilleGeo = new THREE.BoxGeometry(1.1, 0.4, 0.08);
  const grilleMesh = new THREE.Mesh(grilleGeo, chromeMat);
  grilleMesh.position.set(0, 0.82, 1.36);
  chassisGroup.add(grilleMesh);

  // 4. Cozy Cab Cabin & Cream Roof Cap
  const cabGeo = new THREE.BoxGeometry(1.56, 0.88, 1.12);
  const cabMesh = new THREE.Mesh(cabGeo, bodyRedMat);
  cabMesh.position.set(0, 1.02, -0.25);
  cabMesh.castShadow = true;
  cabMesh.receiveShadow = true;
  chassisGroup.add(cabMesh);

  const roofGeo = new THREE.BoxGeometry(1.62, 0.14, 1.18);
  const roofMesh = new THREE.Mesh(roofGeo, roofCreamMat);
  roofMesh.position.set(0, 1.5, -0.25);
  roofMesh.castShadow = true;
  chassisGroup.add(roofMesh);

  // 5. Wrap-Around Windshield & Side Windows
  const windshieldGeo = new THREE.BoxGeometry(1.42, 0.44, 0.08);
  const windshieldMesh = new THREE.Mesh(windshieldGeo, glassMat);
  windshieldMesh.position.set(0, 1.16, 0.31);
  chassisGroup.add(windshieldMesh);

  const sideWinGeo = new THREE.BoxGeometry(1.6, 0.4, 0.82);
  const sideWinMesh = new THREE.Mesh(sideWinGeo, glassMat);
  sideWinMesh.position.set(0, 1.16, -0.25);
  chassisGroup.add(sideWinMesh);

  // 6. Rear Salt & Coin Hopper (Lathe/Beveled Hopper)
  const hopperGeo = new THREE.CylinderGeometry(0.75, 0.52, 0.78, 8);
  hopperGeo.rotateY(Math.PI / 8);
  const hopperMesh = new THREE.Mesh(hopperGeo, brassHopperMat);
  hopperMesh.position.set(0, 0.98, -1.12);
  hopperMesh.castShadow = true;
  chassisGroup.add(hopperMesh);

  // Spinning Salt Spreader Disc at rear
  const spreaderGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.08, 12);
  const spreaderDisc = new THREE.Mesh(spreaderGeo, chromeMat);
  spreaderDisc.position.set(0, 0.45, -1.52);
  chassisGroup.add(spreaderDisc);

  // 7. Dual Chrome Vertical Exhaust Stacks
  const stackGeo = new THREE.CylinderGeometry(0.07, 0.08, 1.15, 10);
  const leftStack = new THREE.Mesh(stackGeo, chromeMat);
  leftStack.position.set(-0.82, 1.2, -0.76);
  const rightStack = new THREE.Mesh(stackGeo, chromeMat);
  rightStack.position.set(0.82, 1.2, -0.76);
  chassisGroup.add(leftStack, rightStack);

  // 8. Roof Amber Beacon Light Bar
  const beaconMat = new THREE.MeshStandardMaterial({
    color: 0xffb703,
    emissive: 0xff9e00,
    emissiveIntensity: 1.8,
    roughness: 0.2,
  });
  const beaconGeo = new THREE.CylinderGeometry(0.18, 0.22, 0.22, 12);
  const beaconMesh = new THREE.Mesh(beaconGeo, beaconMat);
  beaconMesh.position.set(0, 1.66, -0.22);
  chassisGroup.add(beaconMesh);

  // 9. Twin Warm Headlights
  const headlightMat = new THREE.MeshStandardMaterial({
    color: 0xfffbeb,
    emissive: 0xfde68a,
    emissiveIntensity: 2.0,
    roughness: 0.1,
  });
  const hlGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.1, 12);
  hlGeo.rotateX(Math.PI / 2);
  const hlLeft = new THREE.Mesh(hlGeo, headlightMat);
  hlLeft.position.set(-0.52, 0.82, 1.38);
  const hlRight = new THREE.Mesh(hlGeo, headlightMat);
  hlRight.position.set(0.52, 0.82, 1.38);
  chassisGroup.add(hlLeft, hlRight);

  // 10. 4 Chunky Winter Tires + Alloy Hubcaps
  const wheelMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.88,
    metalness: 0.1,
  });
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.36, 16);
  wheelGeo.rotateZ(Math.PI / 2);

  const hubGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.38, 10);
  hubGeo.rotateZ(Math.PI / 2);

  const wheelPositions: [number, number, number][] = [
    [-0.86, 0.42, 0.82],
    [0.86, 0.42, 0.82],
    [-0.86, 0.42, -0.88],
    [0.86, 0.42, -0.88],
  ];

  const wheels: THREE.Mesh[] = [];
  for (const [wx, wy, wz] of wheelPositions) {
    const tire = new THREE.Mesh(wheelGeo, wheelMat);
    tire.position.set(wx, wy, wz);
    tire.castShadow = true;
    const hub = new THREE.Mesh(hubGeo, chromeMat);
    tire.add(hub);
    root.add(tire);
    wheels.push(tire);
  }

  // 11. Heavy Curved V-Plow Blade Group (scales dynamically with bladeWidth upgrade!)
  const bladeGroup = new THREE.Group();
  bladeGroup.position.set(0, 0.46, 1.78);
  root.add(bladeGroup);

  const bladeSteelMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b, // High-vis safety amber/gold blade
    roughness: 0.32,
    metalness: 0.72,
  });
  hitFlashMaterials.push(bladeSteelMat);

  // Curved scoop profile extruded horizontally
  const scoopShape = new THREE.Shape();
  scoopShape.moveTo(0, -0.38);
  scoopShape.quadraticCurveTo(-0.36, 0.0, -0.05, 0.48);
  scoopShape.lineTo(0.1, 0.48);
  scoopShape.quadraticCurveTo(-0.18, 0.0, 0.16, -0.38);
  scoopShape.closePath();

  const rawBladeGeo = new THREE.ExtrudeGeometry(scoopShape, {
    depth: 2.9,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.04,
    bevelSegments: 2,
  });
  rawBladeGeo.center();
  rawBladeGeo.rotateY(Math.PI / 2);

  const bladeMesh = new THREE.Mesh(rawBladeGeo, bladeSteelMat);
  bladeMesh.castShadow = true;
  bladeMesh.receiveShadow = true;
  bladeGroup.add(bladeMesh);

  // Top dark snow deflector lip on blade
  const lipGeo = new THREE.BoxGeometry(2.96, 0.12, 0.24);
  const lipMesh = new THREE.Mesh(lipGeo, darkChassisMat);
  lipMesh.position.set(0, 0.46, 0.06);
  bladeGroup.add(lipMesh);

  // Hydraulic pistons connecting truck bumper to blade
  const pistonGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.55, 8);
  pistonGeo.rotateX(Math.PI / 2);
  const leftPiston = new THREE.Mesh(pistonGeo, chromeMat);
  leftPiston.position.set(-0.55, -0.08, -0.28);
  const rightPiston = new THREE.Mesh(pistonGeo, chromeMat);
  rightPiston.position.set(0.55, -0.08, -0.28);
  bladeGroup.add(leftPiston, rightPiston);

  return {
    root,
    chassisGroup,
    bladeGroup,
    beaconMesh,
    spreaderDisc,
    wheels,
    hitFlashMaterials,
  };
}

/**
 * Builds a Cozy Alpine Timber Cabin (7 distinct parts)
 * Window glow intensifies when the cabin's driveway is plowed clear!
 */
export function buildCozyCabin(
  roofColorHex: number,
  x: number,
  z: number,
  rotY: number,
  drivewayOffsetZ: number = 4.2
): CabinRig {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = rotY;

  // 1. Stone foundation base
  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0x475569,
    roughness: 0.9,
    metalness: 0.05,
  });
  const baseGeo = new THREE.BoxGeometry(4.6, 0.5, 4.0);
  const baseMesh = new THREE.Mesh(baseGeo, stoneMat);
  baseMesh.position.y = 0.25;
  baseMesh.castShadow = true;
  baseMesh.receiveShadow = true;
  group.add(baseMesh);

  // 2. Warm Timber Log Walls
  const timberMat = new THREE.MeshStandardMaterial({
    color: 0x7c4a27,
    roughness: 0.78,
    metalness: 0.05,
  });
  const wallGeo = new THREE.BoxGeometry(4.2, 2.3, 3.6);
  const wallMesh = new THREE.Mesh(wallGeo, timberMat);
  wallMesh.position.y = 1.65;
  wallMesh.castShadow = true;
  wallMesh.receiveShadow = true;
  group.add(wallMesh);

  // 3. Steep Pitched Gable Roof (ExtrudeGeometry)
  const roofShape = new THREE.Shape();
  roofShape.moveTo(-2.55, 0);
  roofShape.lineTo(2.55, 0);
  roofShape.lineTo(0, 1.95);
  roofShape.closePath();

  const roofGeo = new THREE.ExtrudeGeometry(roofShape, {
    depth: 4.3,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.06,
    bevelSegments: 2,
  });
  roofGeo.center();

  const roofMat = new THREE.MeshStandardMaterial({
    color: roofColorHex,
    roughness: 0.6,
    metalness: 0.15,
  });
  const roofMesh = new THREE.Mesh(roofGeo, roofMat);
  roofMesh.position.set(0, 3.65, 0);
  roofMesh.castShadow = true;
  roofMesh.receiveShadow = true;
  group.add(roofMesh);

  // 4. Thick Fluffy Snow Cap on Roof
  const snowCapMat = new THREE.MeshStandardMaterial({
    color: 0xf1f5f9,
    roughness: 0.85,
    metalness: 0.02,
  });
  const snowCapGeo = new THREE.ExtrudeGeometry(roofShape, {
    depth: 4.38,
    bevelEnabled: true,
    bevelThickness: 0.08,
    bevelSize: 0.08,
    bevelSegments: 2,
  });
  snowCapGeo.center();
  const snowCapMesh = new THREE.Mesh(snowCapGeo, snowCapMat);
  snowCapMesh.scale.set(1.03, 0.35, 1.02);
  snowCapMesh.position.set(0, 4.32, 0);
  group.add(snowCapMesh);

  // 5. Brick Chimney with Snow Rim
  const chimneyMat = new THREE.MeshStandardMaterial({
    color: 0x991b1b,
    roughness: 0.85,
  });
  const chimneyGeo = new THREE.BoxGeometry(0.68, 1.6, 0.68);
  const chimneyMesh = new THREE.Mesh(chimneyGeo, chimneyMat);
  chimneyMesh.position.set(1.15, 4.15, -0.7);
  chimneyMesh.castShadow = true;
  group.add(chimneyMesh);

  // 6. Wooden Front Door & Porch Canopy
  const doorMat = new THREE.MeshStandardMaterial({
    color: 0x451a03,
    roughness: 0.7,
  });
  const doorGeo = new THREE.BoxGeometry(0.85, 1.55, 0.12);
  const doorMesh = new THREE.Mesh(doorGeo, doorMat);
  doorMesh.position.set(0, 1.25, 1.82);
  group.add(doorMesh);

  // 7. Glowing Cozy Windows (emissive increases when liberated)
  const winMat = new THREE.MeshStandardMaterial({
    color: 0xfef3c7,
    emissive: 0xf59e0b,
    emissiveIntensity: 0.75, // Dims when snowed-in, jumps to 2.6 when liberated!
    roughness: 0.2,
  });
  const winGeo = new THREE.BoxGeometry(0.76, 0.72, 0.1);
  const winL = new THREE.Mesh(winGeo, winMat);
  winL.position.set(-1.18, 1.65, 1.82);
  const winR = new THREE.Mesh(winGeo, winMat);
  winR.position.set(1.18, 1.65, 1.82);
  const winSide = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.72, 0.85), winMat);
  winSide.position.set(2.12, 1.65, 0);
  group.add(winL, winR, winSide);

  // Driveway Target Ring on Ground (shows players where to clear to liberate the cabin)
  const ringGeo = new THREE.RingGeometry(2.6, 2.95, 28);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xf59e0b,
    transparent: true,
    opacity: 0.55,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const bannerRing = new THREE.Mesh(ringGeo, ringMat);
  bannerRing.position.set(0, 0.03, drivewayOffsetZ);
  group.add(bannerRing);

  return {
    group,
    windowMaterials: [winMat],
    bannerRing,
  };
}

/**
 * Builds the Central Alpine Clocktower & Cocoa Gazebo Landmark (tall silhouette landmark in initial spawn vista)
 */
export function buildTownClocktower(): THREE.Group {
  const group = new THREE.Group();

  const stoneMat = new THREE.MeshStandardMaterial({
    color: 0x64748b,
    roughness: 0.85,
  });
  const timberMat = new THREE.MeshStandardMaterial({
    color: 0x78350f,
    roughness: 0.7,
  });
  const copperMat = new THREE.MeshStandardMaterial({
    color: 0x0d9488,
    roughness: 0.35,
    metalness: 0.6,
  });
  const clockFaceMat = new THREE.MeshStandardMaterial({
    color: 0xfffbeb,
    emissive: 0xfbbf24,
    emissiveIntensity: 1.6,
    roughness: 0.2,
  });

  // Plinth base
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 3.1, 0.55, 8), stoneMat);
  plinth.position.y = 0.275;
  plinth.receiveShadow = true;
  group.add(plinth);

  // Tower shaft
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(2.2, 5.4, 2.2), stoneMat);
  shaft.position.y = 3.2;
  shaft.castShadow = true;
  shaft.receiveShadow = true;
  group.add(shaft);

  // Timber belfry upper section
  const belfry = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.6, 2.5), timberMat);
  belfry.position.y = 6.5;
  belfry.castShadow = true;
  group.add(belfry);

  // 4 Glowing Clock Faces
  const faceGeo = new THREE.CircleGeometry(0.68, 20);
  const dirs: [number, number, number, number][] = [
    [0, 6.5, 1.28, 0],
    [0, 6.5, -1.28, Math.PI],
    [1.28, 6.5, 0, Math.PI / 2],
    [-1.28, 6.5, 0, -Math.PI / 2],
  ];
  for (const [fx, fy, fz, ry] of dirs) {
    const face = new THREE.Mesh(faceGeo, clockFaceMat);
    face.position.set(fx, fy, fz);
    face.rotation.y = ry;
    group.add(face);
  }

  // Spire roof
  const spire = new THREE.Mesh(new THREE.ConeGeometry(2.05, 3.2, 4), copperMat);
  spire.rotation.y = Math.PI / 4;
  spire.position.y = 8.9;
  spire.castShadow = true;
  group.add(spire);

  // Brass weathervane finial
  const finial = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 12, 12),
    new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      metalness: 0.9,
      roughness: 0.15,
    })
  );
  finial.position.y = 10.6;
  group.add(finial);

  return group;
}

/**
 * Builds a Hot Cocoa Thermos Pickup (4-part group)
 */
export function buildCocoaThermos(): THREE.Group {
  const group = new THREE.Group();

  // Contact shadow
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.65, 16).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      color: 0x050b14,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
    })
  );
  shadow.position.y = 0.02;
  group.add(shadow);

  const redMat = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    emissive: 0x991b1b,
    emissiveIntensity: 0.4,
    roughness: 0.25,
    metalness: 0.4,
  });
  const creamMat = new THREE.MeshStandardMaterial({
    color: 0xfef3c7,
    roughness: 0.6,
  });
  const chromeMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.18,
    metalness: 0.88,
  });

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.95, 14), redMat);
  body.position.y = 0.55;
  group.add(body);

  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.39, 0.39, 0.24, 14), creamMat);
  stripe.position.y = 0.55;
  group.add(stripe);

  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.28, 14), chromeMat);
  cap.position.y = 1.15;
  group.add(cap);

  return group;
}
