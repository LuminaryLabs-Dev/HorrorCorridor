import * as THREE from "three";
import type { HorrorCorridorV2Snapshot } from "../../contracts";
import {
  CORRIDOR_DISTRICTS,
  createAuthoredCorridorSetPiece,
  createCorridorSetPiece,
  districtForSegment,
  type ChamberDescriptor,
  type ChamberPropDescriptor,
  type CorridorDistrict,
  type SetPieceKind,
} from "../../content/chamber";
import { MONSTERS_BY_ID, type MonsterProfile } from "../../content/monsters";
import { bindCorridorPrefabBuilders } from "../../presentation/prefabRegistry";

const CORRIDOR_START_Z = 8;
const CORRIDOR_SEGMENT_LENGTH = 8;
const SEGMENTS_BEHIND = 2;
const SEGMENTS_AHEAD = 9;

function corridorSegmentIndex(z: number): number {
  return Math.max(0, Math.floor((CORRIDOR_START_Z - z) / CORRIDOR_SEGMENT_LENGTH));
}

function corridorSegmentCenter(segmentIndex: number): number {
  return CORRIDOR_START_Z - segmentIndex * CORRIDOR_SEGMENT_LENGTH - CORRIDOR_SEGMENT_LENGTH / 2;
}

type DisposableMaterial = THREE.Material | THREE.Material[];

type SurfaceRole = "wall" | "floor" | "metal";
type SurfaceMaps = Readonly<{ color: THREE.DataTexture; relief: THREE.DataTexture }>;

function stableSurfaceSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createSurfaceMaps(materialIdentity: string, role: SurfaceRole): SurfaceMaps {
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  const seed = stableSurfaceSeed(`${materialIdentity}:${role}`);
  let randomState = seed || 1;
  const random = () => {
    randomState ^= randomState << 13;
    randomState ^= randomState >>> 17;
    randomState ^= randomState << 5;
    return (randomState >>> 0) / 0xffffffff;
  };

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const grain = (random() - 0.5) * (role === "floor" ? 23 : 14);
      const broadMottle = Math.sin((x + seed % 29) * 0.083) * 7 + Math.cos((y + seed % 17) * 0.061) * 6;
      let value = 232 + grain + broadMottle;

      if (materialIdentity === "painted-brick") {
        const row = Math.floor(y / 22);
        const mortarY = y % 22 < 2;
        const mortarX = (x + (row % 2) * 24) % 48 < 2;
        if (mortarY || mortarX) value = 126 + grain * 0.25;
      } else if (materialIdentity === "oxidized-steel") {
        if ((x + seed) % 64 < 2) value = 112;
        const streak = ((x * 11 + seed) % 47) / 47;
        value -= Math.max(0, streak - 0.76) * (24 + (y / size) * 32);
      } else if (materialIdentity === "wet-concrete") {
        const dampRun = Math.abs(((x + seed) % 53) - 26);
        value -= Math.max(0, 9 - dampRun) * (0.7 + y / size);
        if ((x * 3 + y * 5 + seed) % 211 === 0) value -= 38;
      } else {
        value += Math.sin((x + y) * 0.13) * 5;
        if ((x * 7 + y * 3 + seed) % 173 < 2) value -= 24;
      }

      if (role === "floor") {
        value -= 8;
        value += Math.sin(x * 0.045 + y * 0.08) * 10;
      } else if (role === "metal") {
        value += Math.sin(x * 0.24) * 8;
      }

      const channel = Math.max(72, Math.min(255, Math.round(value)));
      const offset = (y * size + x) * 4;
      data[offset] = channel;
      data[offset + 1] = Math.max(0, channel - (materialIdentity === "oxidized-steel" ? 8 : 2));
      data[offset + 2] = Math.max(0, channel - (materialIdentity === "wet-concrete" ? 5 : 3));
      data[offset + 3] = 255;
    }
  }

  const configure = (texture: THREE.DataTexture) => {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(role === "wall" ? 2 : 3, role === "wall" ? 3 : 4);
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
  };
  const color = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  color.colorSpace = THREE.SRGBColorSpace;
  configure(color);
  const relief = new THREE.DataTexture(data.slice(), size, size, THREE.RGBAFormat);
  configure(relief);
  return Object.freeze({ color, relief });
}

function disposeMaterial(material: DisposableMaterial): void {
  if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
  else material.dispose();
}

export type ThreeSceneAdapter = ReturnType<typeof createThreeSceneAdapter>;

export type ThreeSceneAuthoringTarget = Readonly<{
  setPieceKind: SetPieceKind;
  districtId: string;
  side?: -1 | 1;
}>;

export function createThreeSceneAdapter(
  canvas: HTMLCanvasElement,
  options: Readonly<{ authoringTarget?: ThreeSceneAuthoringTarget | null }> = {},
) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
    preserveDrawingBuffer: true,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020604);
  scene.fog = new THREE.Fog(0x06100c, 5.5, 43);

  const camera = new THREE.PerspectiveCamera(68, 1, 0.05, 90);
  camera.rotation.order = "YXZ";
  const world = new THREE.Group();
  world.name = "corridor-world";
  scene.add(world);

  const ambient = new THREE.HemisphereLight(0x86aa94, 0x151a16, 1.12);
  scene.add(ambient);
  const entranceFill = new THREE.PointLight(0x7da58c, 25, 14, 1.7);
  entranceFill.position.set(-1.8, 2.65, 6.5);
  scene.add(entranceFill);

  const flashlight = new THREE.SpotLight(0xd8ffe2, 92, 27, 0.39, 0.78, 1.45);
  flashlight.castShadow = true;
  flashlight.shadow.mapSize.set(1024, 1024);
  flashlight.shadow.bias = -0.00035;
  flashlight.position.set(0, 1.65, 0);
  const flashlightTarget = new THREE.Object3D();
  scene.add(flashlight, flashlightTarget);
  flashlight.target = flashlightTarget;
  const flashlightFill = new THREE.PointLight(0x8fb69c, 9, 5.5, 1.5);
  scene.add(flashlightFill);

  const routeLight = new THREE.PointLight(0x4bff9e, 24, 18, 2.1);
  scene.add(routeLight);
  const redLampA = new THREE.PointLight(0xff3e2e, 8, 8, 2.2);
  redLampA.position.set(-2.9, 2.75, -5.8);
  scene.add(redLampA);
  const redLampB = new THREE.PointLight(0xe46a31, 5, 7, 2.2);
  redLampB.position.set(2.8, 2.65, -15.8);
  scene.add(redLampB);

  const monster = createMonsterFigure();
  scene.add(monster.group);
  const monsterRim = new THREE.PointLight(0x74ff9d, 0, 7.5, 2.2);
  scene.add(monsterRim);
  const altarGlow = new THREE.PointLight(0x9fffc0, 0, 6, 2);
  altarGlow.position.set(0, 1.1, -20.8);
  scene.add(altarGlow);

  const scratch = new THREE.Vector3();
  const fogBase = new THREE.Color(0x06100c);
  const fogGreen = new THREE.Color(0x0a2b16);
  const surfaceMapCache = new Map<string, SurfaceMaps>();
  const fanRotors: THREE.Group[] = [];
  let tavernSignTexture: THREE.CanvasTexture | null = null;
  let pantrySignTexture: THREE.CanvasTexture | null = null;
  let nurserySignTexture: THREE.CanvasTexture | null = null;
  let clinicSignTexture: THREE.CanvasTexture | null = null;
  let laundrySignTexture: THREE.CanvasTexture | null = null;
  let pilgrimSignTexture: THREE.CanvasTexture | null = null;
  let boilerSignTexture: THREE.CanvasTexture | null = null;
  let archiveSignTexture: THREE.CanvasTexture | null = null;
  let ticketSignTexture: THREE.CanvasTexture | null = null;
  let dormitorySignTexture: THREE.CanvasTexture | null = null;
  let mortuarySignTexture: THREE.CanvasTexture | null = null;
  const segmentGroups = new Map<number, THREE.Group>();
  let overlayGroup: THREE.Group | null = null;
  let builtWorldIdentity = "";
  let builtWindowKey = "";
  let authoringTarget = options.authoringTarget ?? null;
  let disposed = false;

  function disposeWorldObject(child: THREE.Object3D): void {
    child.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      disposeMaterial(object.material);
    });
  }

  function removeWorldGroup(group: THREE.Group): void {
    for (let index = fanRotors.length - 1; index >= 0; index -= 1) {
      if (group.getObjectById(fanRotors[index].id)) fanRotors.splice(index, 1);
    }
    world.remove(group);
    disposeWorldObject(group);
  }

  function captureWorldGroup(name: string, existing: ReadonlySet<THREE.Object3D>): THREE.Group {
    const group = new THREE.Group();
    group.name = name;
    const additions = world.children.filter((child) => !existing.has(child));
    for (const child of additions) {
      world.remove(child);
      group.add(child);
    }
    world.add(group);
    return group;
  }

  function clearWorld(): void {
    fanRotors.length = 0;
    for (const child of [...world.children]) {
      world.remove(child);
      disposeWorldObject(child);
    }
    segmentGroups.clear();
    overlayGroup = null;
    builtWorldIdentity = "";
  }

  function addBox(
    name: string,
    position: [number, number, number],
    scale: [number, number, number],
    material: THREE.MeshStandardMaterial,
    options: Readonly<{ cast?: boolean; receive?: boolean; rotationX?: number; rotationY?: number; rotationZ?: number }> = {},
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...scale), material);
    mesh.name = name;
    mesh.position.set(...position);
    mesh.rotation.set(options.rotationX ?? 0, options.rotationY ?? 0, options.rotationZ ?? 0);
    mesh.castShadow = options.cast ?? true;
    mesh.receiveShadow = options.receive ?? true;
    world.add(mesh);
    return mesh;
  }

  function addCylinder(
    name: string,
    position: [number, number, number],
    radius: number,
    height: number,
    material: THREE.MeshStandardMaterial,
    radialSegments = 14,
    options: Readonly<{ cast?: boolean; rotationX?: number; rotationY?: number; rotationZ?: number }> = {},
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.94, height, radialSegments), material);
    mesh.name = name;
    mesh.position.set(...position);
    mesh.rotation.set(options.rotationX ?? 0, options.rotationY ?? 0, options.rotationZ ?? 0);
    mesh.castShadow = options.cast ?? true;
    mesh.receiveShadow = true;
    world.add(mesh);
    return mesh;
  }

  function getTavernSignTexture(): THREE.CanvasTexture {
    if (tavernSignTexture) return tavernSignTexture;
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 192;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Unable to create the closed-tavern sign texture.");
    context.fillStyle = "#120b08";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = "#6b3b24";
    context.lineWidth = 18;
    context.strokeRect(12, 12, canvas.width - 24, canvas.height - 24);
    context.fillStyle = "#d6b08a";
    context.font = "700 86px Georgia, serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("CLOSED", canvas.width / 2, canvas.height / 2 + 4);
    tavernSignTexture = new THREE.CanvasTexture(canvas);
    tavernSignTexture.colorSpace = THREE.SRGBColorSpace;
    tavernSignTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    tavernSignTexture.needsUpdate = true;
    return tavernSignTexture;
  }

  function getPantrySignTexture(): THREE.CanvasTexture {
    if (pantrySignTexture) return pantrySignTexture;
    const canvas = document.createElement("canvas");
    canvas.width = 384;
    canvas.height = 256;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Unable to create the empty-pantry sign texture.");
    context.fillStyle = "#17120c";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = "#6f5739";
    context.lineWidth = 14;
    context.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
    context.fillStyle = "#d2c6a4";
    context.font = "700 54px Georgia, serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("RATIONS", canvas.width / 2, 88);
    context.fillStyle = "#b94b32";
    context.font = "800 70px Georgia, serif";
    context.fillText("EMPTY", canvas.width / 2, 174);
    pantrySignTexture = new THREE.CanvasTexture(canvas);
    pantrySignTexture.colorSpace = THREE.SRGBColorSpace;
    pantrySignTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    pantrySignTexture.needsUpdate = true;
    return pantrySignTexture;
  }

  function getNurserySignTexture(): THREE.CanvasTexture {
    if (nurserySignTexture) return nurserySignTexture;
    const canvas = document.createElement("canvas");
    canvas.width = 384;
    canvas.height = 256;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Unable to create the sealed-nursery sign texture.");
    context.fillStyle = "#d4d1b8";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = "#31382f";
    context.lineWidth = 14;
    context.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
    context.fillStyle = "#2f3b31";
    context.font = "700 49px Georgia, serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("WARD 03", canvas.width / 2, 82);
    context.fillStyle = "#8c241c";
    context.font = "800 72px Georgia, serif";
    context.fillText("SEALED", canvas.width / 2, 172);
    nurserySignTexture = new THREE.CanvasTexture(canvas);
    nurserySignTexture.colorSpace = THREE.SRGBColorSpace;
    nurserySignTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    nurserySignTexture.needsUpdate = true;
    return nurserySignTexture;
  }

  function getClinicSignTexture(): THREE.CanvasTexture {
    if (clinicSignTexture) return clinicSignTexture;
    const canvas = document.createElement("canvas");
    canvas.width = 384;
    canvas.height = 256;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Unable to create the abandoned-clinic sign texture.");
    context.fillStyle = "#c5c9b8";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = "#384a42";
    context.lineWidth = 14;
    context.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
    context.fillStyle = "#31443b";
    context.font = "700 38px Georgia, serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("CHARITY WARD", canvas.width / 2, 55);
    context.font = "800 58px Georgia, serif";
    context.fillText("TRIAGE", canvas.width / 2, 124);
    context.fillStyle = "#8d241d";
    context.font = "800 48px Georgia, serif";
    context.fillText("NO ADMIT", canvas.width / 2, 196);
    clinicSignTexture = new THREE.CanvasTexture(canvas);
    clinicSignTexture.colorSpace = THREE.SRGBColorSpace;
    clinicSignTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    clinicSignTexture.needsUpdate = true;
    return clinicSignTexture;
  }

  function getLaundrySignTexture(): THREE.CanvasTexture {
    if (laundrySignTexture) return laundrySignTexture;
    const canvas = document.createElement("canvas");
    canvas.width = 384;
    canvas.height = 256;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Unable to create the flooded-laundry sign texture.");
    context.fillStyle = "#b8c8bd";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = "#27433d";
    context.lineWidth = 14;
    context.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
    context.fillStyle = "#263b37";
    context.font = "700 42px Georgia, serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("LOWER WASH", canvas.width / 2, 62);
    context.fillStyle = "#365f5b";
    context.font = "800 52px Georgia, serif";
    context.fillText("FLOOD LINE", canvas.width / 2, 132);
    context.fillStyle = "#8d241d";
    context.font = "800 50px Georgia, serif";
    context.fillText("CLOSED", canvas.width / 2, 201);
    laundrySignTexture = new THREE.CanvasTexture(canvas);
    laundrySignTexture.colorSpace = THREE.SRGBColorSpace;
    laundrySignTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    laundrySignTexture.needsUpdate = true;
    return laundrySignTexture;
  }

  function getPilgrimSignTexture(): THREE.CanvasTexture {
    if (pilgrimSignTexture) return pilgrimSignTexture;
    const canvas = document.createElement("canvas");
    canvas.width = 384;
    canvas.height = 256;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Unable to create the pilgrim-alcove sign texture.");
    context.fillStyle = "#17140d";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = "#817451";
    context.lineWidth = 14;
    context.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
    context.fillStyle = "#d0c79b";
    context.font = "700 42px Georgia, serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("PILGRIM MILE", canvas.width / 2, 58);
    context.fillStyle = "#e1d69a";
    context.font = "800 46px Georgia, serif";
    context.fillText("KEEP WALKING", canvas.width / 2, 132);
    context.fillStyle = "#a6412b";
    context.font = "800 46px Georgia, serif";
    context.fillText("NO REST", canvas.width / 2, 202);
    pilgrimSignTexture = new THREE.CanvasTexture(canvas);
    pilgrimSignTexture.colorSpace = THREE.SRGBColorSpace;
    pilgrimSignTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    pilgrimSignTexture.needsUpdate = true;
    return pilgrimSignTexture;
  }

  function getBoilerSignTexture(): THREE.CanvasTexture {
    if (boilerSignTexture) return boilerSignTexture;
    const canvas = document.createElement("canvas");
    canvas.width = 384;
    canvas.height = 256;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Unable to create the boiler-shrine sign texture.");
    context.fillStyle = "#1a0d08";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = "#8e4b2d";
    context.lineWidth = 14;
    context.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
    context.fillStyle = "#d7b27b";
    context.font = "700 42px Georgia, serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("BOILER SAINT", canvas.width / 2, 58);
    context.fillStyle = "#f0c070";
    context.font = "800 40px Georgia, serif";
    context.fillText("KEEP PRESSURE", canvas.width / 2, 132);
    context.fillStyle = "#b53b28";
    context.font = "800 40px Georgia, serif";
    context.fillText("DO NOT DRAIN", canvas.width / 2, 202);
    boilerSignTexture = new THREE.CanvasTexture(canvas);
    boilerSignTexture.colorSpace = THREE.SRGBColorSpace;
    boilerSignTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    boilerSignTexture.needsUpdate = true;
    return boilerSignTexture;
  }

  function getArchiveSignTexture(): THREE.CanvasTexture {
    if (archiveSignTexture) return archiveSignTexture;
    const canvas = document.createElement("canvas");
    canvas.width = 384;
    canvas.height = 256;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Unable to create the night-archive sign texture.");
    context.fillStyle = "#0b1119";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = "#596b80";
    context.lineWidth = 14;
    context.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
    context.fillStyle = "#b8c9d8";
    context.font = "700 39px Georgia, serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("RECORDS BELOW", canvas.width / 2, 58);
    context.fillStyle = "#d7e1e8";
    context.font = "800 45px Georgia, serif";
    context.fillText("NIGHT FILES", canvas.width / 2, 130);
    context.fillStyle = "#a43d39";
    context.font = "800 43px Georgia, serif";
    context.fillText("NO NAMES", canvas.width / 2, 202);
    archiveSignTexture = new THREE.CanvasTexture(canvas);
    archiveSignTexture.colorSpace = THREE.SRGBColorSpace;
    archiveSignTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    archiveSignTexture.needsUpdate = true;
    return archiveSignTexture;
  }

  function getTicketSignTexture(): THREE.CanvasTexture {
    if (ticketSignTexture) return ticketSignTexture;
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 256;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Unable to create the ticket-hall sign texture.");
    context.fillStyle = "#0c1218";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = "#73684e";
    context.lineWidth = 14;
    context.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
    context.fillStyle = "#c8d5dd";
    context.font = "700 47px Georgia, serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("NIGHT TICKETS", canvas.width / 2, 58);
    context.fillStyle = "#e3d7aa";
    context.font = "800 61px Georgia, serif";
    context.fillText("ONE WAY", canvas.width / 2, 132);
    context.fillStyle = "#b64238";
    context.font = "800 52px Georgia, serif";
    context.fillText("NO RETURN", canvas.width / 2, 202);
    ticketSignTexture = new THREE.CanvasTexture(canvas);
    ticketSignTexture.colorSpace = THREE.SRGBColorSpace;
    ticketSignTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    ticketSignTexture.needsUpdate = true;
    return ticketSignTexture;
  }

  function getDormitorySignTexture(): THREE.CanvasTexture {
    if (dormitorySignTexture) return dormitorySignTexture;
    const canvas = document.createElement("canvas");
    canvas.width = 384;
    canvas.height = 256;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Unable to create the workers-dormitory sign texture.");
    context.fillStyle = "#111018";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = "#696378";
    context.lineWidth = 14;
    context.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
    context.fillStyle = "#c9c7d8";
    context.font = "700 43px Georgia, serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("NIGHT SHIFT", canvas.width / 2, 58);
    context.fillStyle = "#ded6b4";
    context.font = "800 42px Georgia, serif";
    context.fillText("BUNKS 07-12", canvas.width / 2, 130);
    context.fillStyle = "#a84039";
    context.font = "800 42px Georgia, serif";
    context.fillText("DO NOT WAKE", canvas.width / 2, 202);
    dormitorySignTexture = new THREE.CanvasTexture(canvas);
    dormitorySignTexture.colorSpace = THREE.SRGBColorSpace;
    dormitorySignTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    dormitorySignTexture.needsUpdate = true;
    return dormitorySignTexture;
  }

  function getMortuarySignTexture(): THREE.CanvasTexture {
    if (mortuarySignTexture) return mortuarySignTexture;
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 256;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Unable to create the mortuary-bay sign texture.");
    context.fillStyle = "#0b1515";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = "#607b78";
    context.lineWidth = 14;
    context.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
    context.fillStyle = "#c8dad6";
    context.font = "700 46px Georgia, serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("COLD DELIVERY", canvas.width / 2, 58);
    context.fillStyle = "#e1e5d5";
    context.font = "800 61px Georgia, serif";
    context.fillText("INTAKE 04", canvas.width / 2, 132);
    context.fillStyle = "#b8433b";
    context.font = "800 52px Georgia, serif";
    context.fillText("COUNT AGAIN", canvas.width / 2, 202);
    mortuarySignTexture = new THREE.CanvasTexture(canvas);
    mortuarySignTexture.colorSpace = THREE.SRGBColorSpace;
    mortuarySignTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    mortuarySignTexture.needsUpdate = true;
    return mortuarySignTexture;
  }

  function createMaterials(district?: CorridorDistrict) {
    const materialIdentity = district?.material ?? "wet-concrete";
    const surface = (role: SurfaceRole): SurfaceMaps => {
      const key = `${materialIdentity}:${role}`;
      const existing = surfaceMapCache.get(key);
      if (existing) return existing;
      const created = createSurfaceMaps(materialIdentity, role);
      surfaceMapCache.set(key, created);
      return created;
    };
    const wall = surface("wall");
    const floor = surface("floor");
    const metal = surface("metal");
    return {
      wall: new THREE.MeshStandardMaterial({ color: district?.wallColor ?? 0x35443d, map: wall.color, bumpMap: wall.relief, bumpScale: 0.038, roughness: 0.9, metalness: 0.04 }),
      wallDark: new THREE.MeshStandardMaterial({ color: 0x1c2621, map: wall.color, bumpMap: wall.relief, bumpScale: 0.026, roughness: 0.96 }),
      concrete: new THREE.MeshStandardMaterial({ color: 0x39443e, map: wall.color, bumpMap: wall.relief, bumpScale: 0.045, roughness: 0.86, metalness: 0.05 }),
      floor: new THREE.MeshStandardMaterial({ color: district?.floorColor ?? 0x27332d, map: floor.color, bumpMap: floor.relief, bumpScale: 0.022, roughness: 0.42, metalness: 0.22 }),
      rust: new THREE.MeshStandardMaterial({ color: 0x654634, map: metal.color, bumpMap: metal.relief, bumpScale: 0.035, roughness: 0.76, metalness: 0.36 }),
      steel: new THREE.MeshStandardMaterial({ color: 0x46524c, map: metal.color, bumpMap: metal.relief, bumpScale: 0.018, roughness: 0.56, metalness: 0.58 }),
      black: new THREE.MeshStandardMaterial({ color: 0x080b09, roughness: 0.9 }),
      glass: new THREE.MeshStandardMaterial({ color: 0x315044, roughness: 0.18, metalness: 0.12, transparent: true, opacity: 0.46 }),
      green: new THREE.MeshStandardMaterial({ color: 0x215f3d, emissive: 0x1dff79, emissiveIntensity: 1.8, roughness: 0.5 }),
      red: new THREE.MeshStandardMaterial({ color: 0x5e1812, emissive: 0xff2c18, emissiveIntensity: 1.25, roughness: 0.45 }),
      amber: new THREE.MeshStandardMaterial({ color: 0x6b351f, emissive: 0xff7a38, emissiveIntensity: 0.9, roughness: 0.52 }),
      paper: new THREE.MeshStandardMaterial({ color: 0x8a8c77, roughness: 1 }),
    };
  }

  function buildClosedTavernFacade(descriptor: ChamberDescriptor, materials: ReturnType<typeof createMaterials>): void {
    const counter = descriptor.props.find((prop) => prop.kind === "counter");
    if (!counter) return;
    const side = Math.sign(counter.position.x) || 1;
    const centerZ = counter.position.z;
    const wallX = side * 3.47;
    const faceX = side * 3.34;

    addBox(`${descriptor.id}-recess`, [wallX, 1.58, centerZ], [0.14, 3.08, 5.1], materials.black, { cast: false });
    addBox(`${descriptor.id}-header`, [faceX, 3.08, centerZ], [0.28, 0.22, 5.05], materials.rust);
    for (const zOffset of [-2.38, 2.38]) {
      addBox(`${descriptor.id}-post-${zOffset}`, [faceX, 1.55, centerZ + zOffset], [0.28, 3.05, 0.24], materials.rust);
    }

    addBox(`${descriptor.id}-window`, [side * 3.29, 2.02, centerZ - 0.72], [0.08, 1.15, 1.75], materials.amber, { cast: false });
    addBox(`${descriptor.id}-window-crossbar`, [side * 3.22, 2.02, centerZ - 0.72], [0.08, 0.1, 1.82], materials.steel);
    for (const zOffset of [-0.56, 0.56]) {
      addBox(`${descriptor.id}-window-mullion-${zOffset}`, [side * 3.22, 2.02, centerZ - 0.72 + zOffset], [0.08, 1.18, 0.08], materials.steel);
    }

    const signMaterial = new THREE.MeshStandardMaterial({
      map: getTavernSignTexture(),
      emissive: 0x4a1f10,
      emissiveMap: getTavernSignTexture(),
      emissiveIntensity: 0.72,
      roughness: 0.86,
      metalness: 0.02,
      side: THREE.DoubleSide,
    });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.55, 0.58), signMaterial);
    sign.name = `${descriptor.id}-closed-sign`;
    sign.position.set(side * 3.18, 2.66, centerZ + 1.16);
    sign.rotation.y = -side * Math.PI / 2;
    world.add(sign);

    for (const zOffset of [-0.72, 0.72]) {
      addCylinder(`${descriptor.id}-stool-seat-${zOffset}`, [side * 1.9, 0.68, centerZ + zOffset], 0.3, 0.14, materials.rust, 16);
      addCylinder(`${descriptor.id}-stool-leg-${zOffset}`, [side * 1.9, 0.34, centerZ + zOffset], 0.075, 0.62, materials.steel, 10);
      const foot = addCylinder(`${descriptor.id}-stool-foot-${zOffset}`, [side * 1.9, 0.18, centerZ + zOffset], 0.26, 0.04, materials.steel, 16);
      foot.castShadow = false;
    }

    const warmPool = new THREE.PointLight(0xff7840, 9, 6.5, 2.15);
    warmPool.name = `${descriptor.id}-warm-pool`;
    warmPool.position.set(side * 2.85, 2.35, centerZ - 0.65);
    world.add(warmPool);
  }

  function buildServiceNookFacade(descriptor: ChamberDescriptor, materials: ReturnType<typeof createMaterials>): void {
    const generator = descriptor.props.find((prop) => prop.kind === "generator");
    if (!generator) return;
    const side = Math.sign(generator.position.x) || 1;
    const centerZ = generator.position.z - 1.45;
    const wallX = side * 3.47;
    const faceX = side * 3.33;

    addBox(`${descriptor.id}-recess`, [wallX, 1.5, centerZ], [0.14, 2.92, 4.7], materials.black, { cast: false });
    addBox(`${descriptor.id}-header`, [faceX, 2.95, centerZ], [0.3, 0.2, 4.65], materials.steel);
    for (const zOffset of [-2.18, 2.18]) {
      addBox(`${descriptor.id}-post-${zOffset}`, [faceX, 1.48, centerZ + zOffset], [0.3, 2.92, 0.22], materials.steel);
    }

    const panelX = side * 3.2;
    addBox(`${descriptor.id}-breaker-box`, [panelX, 1.58, centerZ - 0.82], [0.16, 1.08, 0.82], materials.steel);
    addBox(`${descriptor.id}-breaker-face`, [side * 3.1, 1.58, centerZ - 0.82], [0.05, 0.86, 0.64], materials.black, { cast: false });
    for (let index = 0; index < 3; index += 1) {
      addBox(
        `${descriptor.id}-breaker-${index}`,
        [side * 3.06, 1.84 - index * 0.25, centerZ - 0.82],
        [0.04, 0.1, 0.13],
        index === 0 ? materials.green : materials.red,
        { cast: false },
      );
    }

    addCylinder(`${descriptor.id}-vertical-conduit`, [side * 3.18, 2.35, centerZ + 1.42], 0.055, 1.3, materials.rust, 10);
    addCylinder(
      `${descriptor.id}-ceiling-conduit`,
      [side * 3.18, 3.02, centerZ + 0.42],
      0.055,
      2.05,
      materials.rust,
      10,
      { rotationX: Math.PI / 2 },
    );

    const fanAssembly = new THREE.Group();
    fanAssembly.name = `${descriptor.id}-fan-assembly`;
    fanAssembly.position.set(side * 3.13, 2.03, centerZ + 0.45);
    fanAssembly.rotation.y = -side * Math.PI / 2;
    const cage = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.055, 8, 24), materials.steel);
    cage.castShadow = true;
    fanAssembly.add(cage);
    const rotor = new THREE.Group();
    rotor.name = `${descriptor.id}-fan-rotor`;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.14, 12), materials.rust);
    hub.rotation.x = Math.PI / 2;
    hub.castShadow = true;
    rotor.add(hub);
    for (let index = 0; index < 4; index += 1) {
      const angle = index * Math.PI / 2;
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.5, 0.045), materials.rust);
      blade.position.set(-Math.sin(angle) * 0.23, Math.cos(angle) * 0.23, 0);
      blade.rotation.z = angle;
      blade.castShadow = true;
      rotor.add(blade);
    }
    fanAssembly.add(rotor);
    world.add(fanAssembly);
    fanRotors.push(rotor);

    for (let index = 0; index < 6; index += 1) {
      addBox(
        `${descriptor.id}-hazard-${index}`,
        [side * 2.95, 0.022, centerZ - 1.55 + index * 0.54],
        [0.82, 0.028, 0.3],
        index % 2 === 0 ? materials.paper : materials.red,
        { cast: false },
      );
    }

    const maintenanceGlow = new THREE.PointLight(0x72f5a0, 7, 5.5, 2.2);
    maintenanceGlow.name = `${descriptor.id}-maintenance-glow`;
    maintenanceGlow.position.set(side * 2.95, 2.05, centerZ - 0.72);
    world.add(maintenanceGlow);
  }

  function buildEmptyPantryFacade(descriptor: ChamberDescriptor, materials: ReturnType<typeof createMaterials>): void {
    const table = descriptor.props.find((prop) => prop.kind === "table");
    if (!table) return;
    const side = Math.sign(table.position.x) || 1;
    const centerZ = table.position.z;
    const wallX = side * 3.47;
    const faceX = side * 3.33;

    addBox(`${descriptor.id}-recess`, [wallX, 1.5, centerZ], [0.14, 2.96, 5.45], materials.black, { cast: false });
    addBox(`${descriptor.id}-header`, [faceX, 3.02, centerZ], [0.3, 0.2, 5.4], materials.rust);
    for (const zOffset of [-2.52, 2.52]) {
      addBox(`${descriptor.id}-post-${zOffset}`, [faceX, 1.5, centerZ + zOffset], [0.3, 2.95, 0.22], materials.rust);
    }

    const shutterZ = centerZ + 1.56;
    addCylinder(
      `${descriptor.id}-shutter-roll`,
      [faceX - side * 0.02, 2.76, shutterZ],
      0.16,
      2.1,
      materials.steel,
      14,
      { rotationX: Math.PI / 2 },
    );
    for (let index = 0; index < 9; index += 1) {
      addBox(
        `${descriptor.id}-shutter-slat-${index}`,
        [faceX - side * 0.02, 2.56 - index * 0.18, shutterZ],
        [0.1, 0.13, 2.05],
        index % 3 === 0 ? materials.rust : materials.steel,
      );
    }
    addBox(`${descriptor.id}-broken-shutter-edge`, [faceX - side * 0.08, 0.98, shutterZ - 0.34], [0.08, 0.95, 0.12], materials.rust, { rotationZ: side * 0.18 });

    const signMaterial = new THREE.MeshStandardMaterial({
      map: getPantrySignTexture(),
      emissive: 0x3c1b0e,
      emissiveMap: getPantrySignTexture(),
      emissiveIntensity: 0.58,
      roughness: 0.94,
      side: THREE.DoubleSide,
    });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 0.72), signMaterial);
    sign.name = `${descriptor.id}-ration-sign`;
    sign.position.set(faceX - side * 0.08, 1.64, shutterZ);
    sign.rotation.y = -side * Math.PI / 2;
    world.add(sign);

    for (let level = 0; level < 2; level += 1) {
      for (let index = 0; index < 3; index += 1) {
        const can = addCylinder(
          `${descriptor.id}-ration-can-${level}-${index}`,
          [side * 2.54, 0.82 + level * 0.66, centerZ - 1.94 + index * 0.34],
          0.09,
          0.28,
          index === 1 && level === 0 ? materials.rust : materials.paper,
          12,
        );
        can.rotation.z = index === 2 && level === 1 ? 0.16 : 0;
      }
    }

    for (let index = 0; index < 3; index += 1) {
      const sack = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), materials.paper);
      sack.name = `${descriptor.id}-empty-sack-${index}`;
      sack.position.set(side * (2.38 + index * 0.12), 0.24 + index * 0.04, centerZ + 0.45 + index * 0.42);
      sack.scale.set(0.82, 1.18, 0.56);
      sack.rotation.set(0, index * 0.44, side * (index - 1) * 0.12);
      sack.castShadow = true;
      sack.receiveShadow = true;
      world.add(sack);
    }

    const pantryGlow = new THREE.PointLight(0xff9a52, 8.5, 6.2, 2.15);
    pantryGlow.name = `${descriptor.id}-pantry-glow`;
    pantryGlow.position.set(side * 2.96, 2.28, centerZ - 1.3);
    world.add(pantryGlow);
  }

  function buildSealedNurseryFacade(descriptor: ChamberDescriptor, materials: ReturnType<typeof createMaterials>): void {
    const table = descriptor.props.find((prop) => prop.kind === "table");
    if (!table) return;
    const side = Math.sign(table.position.x) || 1;
    const centerZ = table.position.z - 0.8;
    const wallX = side * 3.47;
    const faceX = side * 3.32;

    addBox(`${descriptor.id}-recess`, [wallX, 1.52, centerZ], [0.14, 3, 5.3], materials.black, { cast: false });
    addBox(`${descriptor.id}-header`, [faceX, 3.05, centerZ], [0.34, 0.22, 5.25], materials.concrete);
    for (const zOffset of [-2.45, 2.45]) {
      addBox(`${descriptor.id}-post-${zOffset}`, [faceX, 1.52, centerZ + zOffset], [0.34, 3, 0.24], materials.concrete);
    }

    const cribX = side * 2.55;
    const cribZ = centerZ + 0.36;
    addBox(`${descriptor.id}-crib-mattress`, [cribX, 0.65, cribZ], [1.08, 0.18, 1.72], materials.paper);
    addBox(`${descriptor.id}-crib-blanket`, [cribX - side * 0.03, 0.77, cribZ + 0.25], [1, 0.08, 0.72], materials.wallDark, { cast: false });
    const nearRailX = side * 1.98;
    const farRailX = side * 3.08;
    for (const railX of [nearRailX, farRailX]) {
      addBox(`${descriptor.id}-crib-rail-${railX}`, [railX, 1.08, cribZ], [0.08, 0.82, 1.84], materials.steel);
      for (const zOffset of [-0.68, -0.34, 0, 0.34, 0.68]) {
        addBox(`${descriptor.id}-crib-bar-${railX}-${zOffset}`, [railX - side * 0.02, 1.08, cribZ + zOffset], [0.07, 0.78, 0.07], materials.rust);
      }
    }
    for (const zOffset of [-0.88, 0.88]) {
      addBox(`${descriptor.id}-crib-end-${zOffset}`, [cribX, 1.08, cribZ + zOffset], [1.2, 0.82, 0.08], materials.steel);
    }

    addCylinder(`${descriptor.id}-mobile-stem`, [cribX, 2.76, cribZ], 0.025, 0.72, materials.steel, 8);
    addCylinder(`${descriptor.id}-mobile-arm-x`, [cribX, 2.38, cribZ], 0.025, 0.78, materials.steel, 8, { rotationZ: Math.PI / 2 });
    addCylinder(`${descriptor.id}-mobile-arm-z`, [cribX, 2.38, cribZ], 0.025, 0.78, materials.steel, 8, { rotationX: Math.PI / 2 });
    const mobileOffsets: readonly [number, number, THREE.MeshStandardMaterial][] = [
      [0.31, 0, materials.red],
      [-0.31, 0, materials.paper],
      [0, 0.31, materials.green],
      [0, -0.31, materials.rust],
    ];
    mobileOffsets.forEach(([xOffset, zOffset, material], index) => {
      addCylinder(`${descriptor.id}-mobile-string-${index}`, [cribX + xOffset, 2.12, cribZ + zOffset], 0.012, 0.48, materials.steel, 6, { cast: false });
      const toy = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), material);
      toy.name = `${descriptor.id}-mobile-toy-${index}`;
      toy.position.set(cribX + xOffset, 1.84, cribZ + zOffset);
      toy.scale.set(index % 2 === 0 ? 0.72 : 1, index % 2 === 0 ? 1.15 : 0.78, 0.72);
      toy.castShadow = true;
      world.add(toy);
    });

    const signMaterial = new THREE.MeshStandardMaterial({
      map: getNurserySignTexture(),
      emissive: 0x342019,
      emissiveMap: getNurserySignTexture(),
      emissiveIntensity: 0.42,
      roughness: 0.96,
      side: THREE.DoubleSide,
    });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.12, 0.75), signMaterial);
    sign.name = `${descriptor.id}-sealed-sign`;
    sign.position.set(faceX - side * 0.08, 2.4, centerZ + 1.67);
    sign.rotation.y = -side * Math.PI / 2;
    world.add(sign);

    for (let index = 0; index < 5; index += 1) {
      addBox(
        `${descriptor.id}-height-mark-${index}`,
        [side * 3.17, 0.88 + index * 0.22, centerZ - 1.72],
        [0.045, 0.026, 0.22 + index * 0.045],
        index === 4 ? materials.red : materials.paper,
        { cast: false },
      );
    }

    for (let index = 0; index < 7; index += 1) {
      addBox(
        `${descriptor.id}-toy-block-${index}`,
        [side * (2.05 + (index % 3) * 0.19), 0.09 + Math.floor(index / 3) * 0.1, centerZ - 0.78 + (index % 4) * 0.18],
        [0.16, 0.16, 0.16],
        index % 3 === 0 ? materials.red : index % 3 === 1 ? materials.paper : materials.green,
        { rotationY: index * 0.41 },
      );
    }

    const wardGlow = new THREE.PointLight(0xb8e0c5, 8.5, 6.2, 2.1);
    wardGlow.name = `${descriptor.id}-ward-glow`;
    wardGlow.position.set(side * 2.83, 2.32, centerZ - 0.15);
    world.add(wardGlow);
    const nightLight = new THREE.PointLight(0xff3f2d, 2.6, 3.8, 2.2);
    nightLight.name = `${descriptor.id}-night-light`;
    nightLight.position.set(side * 3.02, 1.08, centerZ + 1.65);
    world.add(nightLight);
  }

  function buildAbandonedClinicFacade(descriptor: ChamberDescriptor, materials: ReturnType<typeof createMaterials>): void {
    const table = descriptor.props.find((prop) => prop.kind === "table");
    if (!table) return;
    const side = Math.sign(table.position.x) || 1;
    const centerZ = table.position.z + 0.8;
    const wallX = side * 3.47;
    const faceX = side * 3.31;

    addBox(`${descriptor.id}-recess`, [wallX, 1.52, centerZ], [0.14, 3, 5.45], materials.black, { cast: false });
    addBox(`${descriptor.id}-header`, [faceX, 3.04, centerZ], [0.34, 0.22, 5.4], materials.steel);
    for (const zOffset of [-2.52, 2.52]) {
      addBox(`${descriptor.id}-post-${zOffset}`, [faceX, 1.52, centerZ + zOffset], [0.34, 3, 0.24], materials.steel);
    }

    const gurneyX = side * 2.42;
    const gurneyZ = centerZ + 0.28;
    addBox(`${descriptor.id}-gurney-frame`, [gurneyX, 0.77, gurneyZ], [1.22, 0.16, 2.22], materials.steel);
    addBox(`${descriptor.id}-gurney-mattress`, [gurneyX, 0.94, gurneyZ], [1.08, 0.18, 2.08], materials.paper);
    addBox(`${descriptor.id}-gurney-pillow`, [gurneyX, 1.06, gurneyZ - 0.72], [0.84, 0.14, 0.48], materials.wallDark, { rotationX: -0.08 });
    addBox(`${descriptor.id}-gurney-stain`, [gurneyX - side * 0.12, 1.045, gurneyZ + 0.3], [0.34, 0.035, 0.56], materials.red, { cast: false, rotationY: 0.18 });

    for (const railX of [side * 1.82, side * 3.02]) {
      addBox(`${descriptor.id}-gurney-rail-${railX}`, [railX, 1.26, gurneyZ], [0.06, 0.08, 2.16], materials.rust);
      for (const zOffset of [-0.72, 0, 0.72]) {
        addBox(`${descriptor.id}-gurney-rail-bar-${railX}-${zOffset}`, [railX, 1.08, gurneyZ + zOffset], [0.05, 0.38, 0.05], materials.rust);
      }
    }
    for (const xOffset of [-0.43, 0.43]) {
      for (const zOffset of [-0.76, 0.76]) {
        const legX = gurneyX + xOffset;
        const legZ = gurneyZ + zOffset;
        addBox(`${descriptor.id}-gurney-leg-${xOffset}-${zOffset}`, [legX, 0.39, legZ], [0.07, 0.62, 0.07], materials.steel);
        addCylinder(`${descriptor.id}-gurney-wheel-${xOffset}-${zOffset}`, [legX, 0.1, legZ], 0.11, 0.06, materials.rust, 12, { rotationZ: Math.PI / 2 });
      }
    }

    const cabinetX = side * 3.16;
    const cabinetZ = centerZ - 1.58;
    addBox(`${descriptor.id}-medicine-cabinet`, [cabinetX, 1.82, cabinetZ], [0.18, 1.3, 1.16], materials.steel);
    addBox(`${descriptor.id}-medicine-glass`, [side * 3.04, 1.82, cabinetZ], [0.05, 1.08, 0.96], materials.glass, { cast: false });
    for (const yOffset of [-0.34, 0.12, 0.42]) {
      addBox(`${descriptor.id}-medicine-shelf-${yOffset}`, [side * 2.99, 1.7 + yOffset, cabinetZ], [0.05, 0.035, 0.92], materials.paper, { cast: false });
    }
    for (let index = 0; index < 5; index += 1) {
      addCylinder(
        `${descriptor.id}-medicine-bottle-${index}`,
        [side * 2.94, 1.48 + (index % 2) * 0.46, cabinetZ - 0.34 + index * 0.17],
        0.055 + (index % 2) * 0.018,
        0.19 + (index % 3) * 0.05,
        index === 3 ? materials.red : materials.paper,
        10,
      );
    }

    const ivX = side * 1.68;
    const ivZ = centerZ + 0.82;
    addCylinder(`${descriptor.id}-iv-pole`, [ivX, 1.3, ivZ], 0.035, 2.48, materials.steel, 10);
    addCylinder(`${descriptor.id}-iv-arm`, [ivX, 2.5, ivZ], 0.025, 0.48, materials.steel, 8, { rotationX: Math.PI / 2 });
    for (const zOffset of [-0.21, 0.21]) {
      addCylinder(`${descriptor.id}-iv-base-${zOffset}`, [ivX, 0.08, ivZ + zOffset], 0.025, 0.58, materials.steel, 8, { rotationX: Math.PI / 2 });
    }
    addBox(`${descriptor.id}-iv-bag`, [ivX, 2.22, ivZ + 0.22], [0.08, 0.42, 0.24], materials.glass, { cast: false });
    addBox(`${descriptor.id}-iv-fluid`, [ivX - side * 0.006, 2.13, ivZ + 0.22], [0.085, 0.16, 0.21], materials.amber, { cast: false });
    addCylinder(`${descriptor.id}-iv-line`, [ivX, 1.65, ivZ + 0.27], 0.012, 0.76, materials.rust, 6);

    addCylinder(`${descriptor.id}-exam-arm`, [side * 2.78, 3.03, centerZ + 0.15], 0.045, 0.92, materials.steel, 10, { rotationZ: Math.PI / 2 });
    addCylinder(`${descriptor.id}-exam-lamp`, [side * 2.28, 2.84, centerZ + 0.15], 0.36, 0.18, materials.paper, 18);
    addCylinder(`${descriptor.id}-exam-lamp-face`, [side * 2.28, 2.72, centerZ + 0.15], 0.28, 0.035, materials.green, 18, { cast: false });

    const signMaterial = new THREE.MeshStandardMaterial({
      map: getClinicSignTexture(),
      emissive: 0x273b32,
      emissiveMap: getClinicSignTexture(),
      emissiveIntensity: 0.38,
      roughness: 0.95,
      side: THREE.DoubleSide,
    });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.16, 0.78), signMaterial);
    sign.name = `${descriptor.id}-triage-sign`;
    sign.position.set(faceX - side * 0.08, 2.28, centerZ + 1.95);
    sign.rotation.y = -side * Math.PI / 2;
    world.add(sign);

    const clinicGlow = new THREE.PointLight(0xbde8d8, 9, 6.3, 2.05);
    clinicGlow.name = `${descriptor.id}-clinic-glow`;
    clinicGlow.position.set(side * 2.72, 2.45, centerZ + 0.08);
    world.add(clinicGlow);
  }

  function buildFloodedLaundryFacade(descriptor: ChamberDescriptor, materials: ReturnType<typeof createMaterials>): void {
    const generator = descriptor.props.find((prop) => prop.kind === "generator");
    if (!generator) return;
    const side = Math.sign(generator.position.x) || 1;
    const centerZ = generator.position.z;
    const wallX = side * 3.47;
    const faceX = side * 3.31;
    const machineX = side * 3.01;
    const machineFaceX = side * 2.61;
    const towardRoute = -side;

    addBox(`${descriptor.id}-recess`, [wallX, 1.5, centerZ], [0.14, 2.96, 5.55], materials.black, { cast: false });
    addBox(`${descriptor.id}-header`, [faceX, 3.02, centerZ], [0.34, 0.2, 5.5], materials.steel);
    // Keep the approach edge open: a full-height near post sits directly on the
    // player's natural sightline into the bay and hides the washer bank.
    addBox(`${descriptor.id}-post-far`, [faceX, 1.5, centerZ - 2.58], [0.34, 2.96, 0.24], materials.rust);

    for (const [machineIndex, zOffset] of [-1.42, 0, 1.42].entries()) {
      const machineZ = centerZ + zOffset;
      addBox(`${descriptor.id}-washer-${machineIndex}`, [machineX, 1.04, machineZ], [0.72, 1.78, 1.18], machineIndex === 1 ? materials.rust : materials.steel);
      addBox(`${descriptor.id}-washer-panel-${machineIndex}`, [machineFaceX, 1.67, machineZ], [0.08, 0.28, 1.02], materials.wallDark, { cast: false });
      addCylinder(`${descriptor.id}-washer-rim-${machineIndex}`, [machineFaceX + towardRoute * 0.055, 1.02, machineZ], 0.39, 0.12, materials.steel, 22, { rotationZ: Math.PI / 2 });
      addCylinder(`${descriptor.id}-washer-door-${machineIndex}`, [machineFaceX + towardRoute * 0.13, 1.02, machineZ], 0.3, 0.055, materials.black, 22, { cast: false, rotationZ: Math.PI / 2 });
      addCylinder(`${descriptor.id}-washer-glass-${machineIndex}`, [machineFaceX + towardRoute * 0.17, 1.02, machineZ], 0.23, 0.025, materials.glass, 22, { cast: false, rotationZ: Math.PI / 2 });
      for (let controlIndex = 0; controlIndex < 3; controlIndex += 1) {
        addBox(
          `${descriptor.id}-washer-control-${machineIndex}-${controlIndex}`,
          [machineFaceX + towardRoute * 0.08, 1.68, machineZ - 0.32 + controlIndex * 0.31],
          [0.05, 0.08, 0.12],
          controlIndex === 0 && machineIndex !== 1 ? materials.green : materials.red,
          { cast: false },
        );
      }
    }

    const pipeX = side * 3.16;
    for (const zOffset of [-2.08, 2.08]) {
      addCylinder(`${descriptor.id}-feed-pipe-${zOffset}`, [pipeX, 2.35, centerZ + zOffset], 0.055, 1.22, materials.rust, 10);
    }
    addCylinder(`${descriptor.id}-feed-main`, [pipeX, 2.94, centerZ], 0.065, 4.18, materials.rust, 10, { rotationX: Math.PI / 2 });

    const cartX = side * 2.35;
    const cartZ = centerZ + 1.72;
    addBox(`${descriptor.id}-linen-cart-base`, [cartX, 0.36, cartZ], [0.72, 0.08, 1.08], materials.steel);
    for (const xOffset of [-0.32, 0.32]) {
      for (const zOffset of [-0.48, 0.48]) {
        addBox(`${descriptor.id}-linen-cart-rail-${xOffset}-${zOffset}`, [cartX + xOffset, 0.82, cartZ + zOffset], [0.045, 0.94, 0.045], materials.rust);
        addCylinder(`${descriptor.id}-linen-cart-wheel-${xOffset}-${zOffset}`, [cartX + xOffset, 0.1, cartZ + zOffset], 0.09, 0.05, materials.rust, 10, { rotationZ: Math.PI / 2 });
      }
    }
    addBox(`${descriptor.id}-linen-cart-top-left`, [cartX - 0.32, 1.28, cartZ], [0.045, 0.05, 1.02], materials.rust);
    addBox(`${descriptor.id}-linen-cart-top-right`, [cartX + 0.32, 1.28, cartZ], [0.045, 0.05, 1.02], materials.rust);
    for (let index = 0; index < 6; index += 1) {
      const linen = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), index % 3 === 0 ? materials.wallDark : materials.paper);
      linen.name = `${descriptor.id}-wet-linen-${index}`;
      linen.position.set(cartX + ((index % 2) - 0.5) * 0.32, 0.64 + Math.floor(index / 2) * 0.18, cartZ - 0.3 + (index % 3) * 0.3);
      linen.scale.set(1.05, 0.54, 1.32);
      linen.rotation.set(index * 0.12, index * 0.41, index * 0.09);
      linen.castShadow = true;
      world.add(linen);
    }

    addCylinder(`${descriptor.id}-clothes-line`, [side * 2.96, 2.94, centerZ], 0.018, 4.3, materials.steel, 6, { cast: false, rotationX: Math.PI / 2 });
    for (const [sheetIndex, zOffset] of [-0.82, 0.82].entries()) {
      addBox(
        `${descriptor.id}-hanging-sheet-${sheetIndex}`,
        [side * 3, 2.68, centerZ + zOffset],
        [0.035, 0.48 - sheetIndex * 0.06, 0.62],
        sheetIndex === 0 ? materials.paper : materials.wallDark,
        { cast: false, rotationZ: side * (sheetIndex === 0 ? 0.035 : -0.045) },
      );
    }

    const standingWaterMaterial = materials.glass.clone();
    standingWaterMaterial.opacity = 0.34;
    addBox(`${descriptor.id}-standing-water`, [side * 2.62, 0.012, centerZ], [1.72, 0.024, 5.05], standingWaterMaterial, { cast: false, receive: true });
    addCylinder(`${descriptor.id}-floor-drain`, [side * 1.82, 0.035, centerZ - 1.72], 0.22, 0.025, materials.black, 18, { cast: false });
    for (let index = -2; index <= 2; index += 1) {
      addBox(`${descriptor.id}-drain-slot-${index}`, [side * 1.8, 0.055, centerZ - 1.72 + index * 0.07], [0.28, 0.015, 0.018], materials.steel, { cast: false });
    }

    const signMaterial = new THREE.MeshStandardMaterial({
      map: getLaundrySignTexture(),
      emissive: 0x25433e,
      emissiveMap: getLaundrySignTexture(),
      emissiveIntensity: 0.46,
      roughness: 0.94,
      side: THREE.DoubleSide,
    });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.8), signMaterial);
    sign.name = `${descriptor.id}-flood-line-sign`;
    sign.position.set(faceX + towardRoute * 0.08, 2.28, centerZ - 2.1);
    sign.rotation.y = -side * Math.PI / 2;
    world.add(sign);

    const laundryGlow = new THREE.PointLight(0x72d9cf, 9.5, 6.6, 2.1);
    laundryGlow.name = `${descriptor.id}-laundry-glow`;
    laundryGlow.position.set(side * 2.68, 2.34, centerZ - 0.1);
    world.add(laundryGlow);
    const submergedWarning = new THREE.PointLight(0xff4936, 2.8, 3.8, 2.2);
    submergedWarning.name = `${descriptor.id}-submerged-warning`;
    submergedWarning.position.set(side * 2.82, 0.48, centerZ + 2.1);
    world.add(submergedWarning);
  }

  function buildPilgrimAlcoveFacade(descriptor: ChamberDescriptor, materials: ReturnType<typeof createMaterials>): void {
    const table = descriptor.props.find((prop) => prop.kind === "table");
    if (!table) return;
    const side = Math.sign(table.position.x) || 1;
    const centerZ = table.position.z;
    const wallX = side * 3.47;
    const faceX = side * 3.31;
    const towardRoute = -side;

    addBox(`${descriptor.id}-recess`, [wallX, 1.5, centerZ], [0.14, 2.96, 5.35], materials.black, { cast: false });
    addBox(`${descriptor.id}-far-jamb`, [faceX, 1.45, centerZ - 2.48], [0.34, 2.84, 0.3], materials.concrete);
    addBox(`${descriptor.id}-near-knee-wall`, [faceX, 0.42, centerZ + 2.48], [0.34, 0.82, 0.3], materials.concrete);
    const archOffsets = [-1.82, -1.2, -0.6, 0, 0.6, 1.2, 1.82];
    for (const [index, zOffset] of archOffsets.entries()) {
      const archRise = 0.24 * (1 - Math.abs(zOffset) / 1.82);
      addBox(
        `${descriptor.id}-arch-${index}`,
        [faceX, 2.76 + archRise, centerZ + zOffset],
        [0.34, 0.22, 0.7],
        index === 3 ? materials.rust : materials.concrete,
        { rotationX: zOffset * 0.035 },
      );
    }

    const altarX = side * 2.72;
    const altarZ = centerZ - 0.22;
    addBox(`${descriptor.id}-shrine-plinth`, [altarX, 0.42, altarZ], [1.12, 0.76, 1.58], materials.concrete);
    addBox(`${descriptor.id}-shrine-top`, [altarX, 0.84, altarZ], [1.3, 0.12, 1.78], materials.rust);
    addBox(`${descriptor.id}-worn-step`, [side * 2.32, 0.12, altarZ], [0.84, 0.22, 1.7], materials.concrete);

    const effigyX = side * 3.02;
    const effigyZ = altarZ;
    const cloak = new THREE.Mesh(new THREE.ConeGeometry(0.48, 1.06, 12), materials.wallDark);
    cloak.name = `${descriptor.id}-veiled-effigy`;
    cloak.position.set(effigyX, 1.43, effigyZ);
    cloak.scale.z = 0.72;
    cloak.castShadow = true;
    world.add(cloak);
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.29, 14, 10), materials.black);
    hood.name = `${descriptor.id}-effigy-hood`;
    hood.position.set(effigyX, 2.03, effigyZ);
    hood.scale.set(0.92, 1.08, 0.9);
    hood.castShadow = true;
    world.add(hood);
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.18, 14, 10), materials.paper);
    face.name = `${descriptor.id}-blank-face`;
    face.position.set(effigyX + towardRoute * 0.24, 2.01, effigyZ);
    face.scale.set(0.34, 0.94, 0.72);
    face.castShadow = true;
    world.add(face);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.035, 8, 24), materials.rust);
    halo.name = `${descriptor.id}-halo`;
    halo.position.set(side * 3.18, 2.04, effigyZ);
    halo.rotation.y = Math.PI / 2;
    halo.castShadow = true;
    world.add(halo);

    for (const [handIndex, zOffset] of [-0.065, 0.065].entries()) {
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.085, 10, 8), materials.paper);
      hand.name = `${descriptor.id}-effigy-hand-${handIndex}`;
      hand.position.set(side * 2.7, 1.45 + handIndex * 0.035, effigyZ + zOffset);
      hand.scale.set(0.48, 1.04, 0.56);
      hand.castShadow = true;
      world.add(hand);
    }

    const candleLayout: readonly [number, number, number][] = [
      [2.2, -0.58, 0.2],
      [2.18, -0.27, 0.32],
      [2.16, 0.05, 0.16],
      [2.2, 0.34, 0.27],
      [2.24, 0.62, 0.12],
    ];
    candleLayout.forEach(([xMagnitude, zOffset, height], index) => {
      const candleY = 0.94 + height / 2;
      addCylinder(`${descriptor.id}-votive-${index}`, [side * xMagnitude, candleY, altarZ + zOffset], 0.045, height, materials.paper, 9);
      const flame = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), index === 2 ? materials.red : materials.amber);
      flame.name = `${descriptor.id}-votive-flame-${index}`;
      flame.position.set(side * xMagnitude, candleY + height / 2 + 0.055, altarZ + zOffset);
      flame.scale.set(0.7, 1.7, 0.7);
      world.add(flame);
    });
    addCylinder(`${descriptor.id}-offering-bowl`, [side * 2.19, 0.98, altarZ - 0.73], 0.16, 0.09, materials.rust, 18);

    const kneelerX = side * 2.26;
    const kneelerZ = centerZ + 1.55;
    addBox(`${descriptor.id}-kneeler-base`, [kneelerX, 0.13, kneelerZ], [0.66, 0.18, 1.08], materials.rust);
    addBox(`${descriptor.id}-kneeler-pad`, [kneelerX + towardRoute * 0.08, 0.42, kneelerZ], [0.64, 0.18, 0.96], materials.wallDark, { rotationZ: side * 0.12 });
    for (const zOffset of [-0.43, 0.43]) {
      addBox(`${descriptor.id}-kneeler-leg-${zOffset}`, [kneelerX, 0.28, kneelerZ + zOffset], [0.08, 0.42, 0.08], materials.steel);
    }

    addCylinder(`${descriptor.id}-prayer-line`, [side * 3.13, 2.5, centerZ + 0.3], 0.018, 3.35, materials.rust, 6, { cast: false, rotationX: Math.PI / 2 });
    for (let index = 0; index < 6; index += 1) {
      const zOffset = -1.15 + index * 0.46;
      addCylinder(`${descriptor.id}-prayer-thread-${index}`, [side * 3.11, 2.27, centerZ + 0.3 + zOffset], 0.009, 0.42 + (index % 2) * 0.12, materials.rust, 5, { cast: false });
      addBox(
        `${descriptor.id}-prayer-strip-${index}`,
        [side * 3.07, 2.02 - (index % 2) * 0.05, centerZ + 0.3 + zOffset],
        [0.035, 0.32 + (index % 3) * 0.06, 0.16],
        index === 4 ? materials.red : materials.paper,
        { cast: false, rotationZ: side * (index - 2.5) * 0.025 },
      );
    }

    const signMaterial = new THREE.MeshStandardMaterial({
      map: getPilgrimSignTexture(),
      emissive: 0x554923,
      emissiveMap: getPilgrimSignTexture(),
      emissiveIntensity: 0.42,
      roughness: 0.96,
      side: THREE.DoubleSide,
    });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.18, 0.78), signMaterial);
    sign.name = `${descriptor.id}-mile-sign`;
    sign.position.set(faceX + towardRoute * 0.08, 1.88, centerZ - 1.68);
    sign.rotation.y = -side * Math.PI / 2;
    world.add(sign);

    const votiveGlow = new THREE.PointLight(0xffa14d, 8.5, 5.8, 2.1);
    votiveGlow.name = `${descriptor.id}-votive-glow`;
    votiveGlow.position.set(side * 2.48, 1.45, altarZ - 0.05);
    world.add(votiveGlow);
    const haloGlow = new THREE.PointLight(0xb7ce83, 2.6, 4.2, 2.2);
    haloGlow.name = `${descriptor.id}-halo-glow`;
    haloGlow.position.set(side * 2.88, 2.12, effigyZ);
    world.add(haloGlow);
  }

  function buildBoilerShrineFacade(descriptor: ChamberDescriptor, materials: ReturnType<typeof createMaterials>): void {
    const generator = descriptor.props.find((prop) => prop.kind === "generator");
    if (!generator) return;
    const side = Math.sign(generator.position.x) || 1;
    const centerZ = generator.position.z;
    const wallX = side * 3.47;
    const faceX = side * 3.31;
    const towardRoute = -side;
    const tankX = side * 2.96;
    const tankFaceX = side * 2.3;
    const tankZ = centerZ - 0.18;

    addBox(`${descriptor.id}-recess`, [wallX, 1.5, centerZ], [0.14, 2.96, 5.4], materials.black, { cast: false });
    addBox(`${descriptor.id}-header`, [faceX, 3.02, centerZ], [0.34, 0.22, 5.34], materials.rust);
    addBox(`${descriptor.id}-far-jamb`, [faceX, 1.5, centerZ - 2.52], [0.34, 2.96, 0.26], materials.steel);
    addBox(`${descriptor.id}-near-curb`, [faceX, 0.28, centerZ + 2.52], [0.34, 0.52, 0.26], materials.concrete);

    const tank = addCylinder(`${descriptor.id}-pressure-vessel`, [tankX, 1.46, tankZ], 0.68, 2.42, materials.rust, 24);
    tank.scale.z = 0.94;
    for (const [bandIndex, y] of [0.48, 1.38, 2.28].entries()) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.69, 0.045, 8, 26), materials.steel);
      band.name = `${descriptor.id}-tank-band-${bandIndex}`;
      band.position.set(tankX, y, tankZ);
      band.rotation.x = Math.PI / 2;
      band.scale.z = 0.94;
      band.castShadow = true;
      world.add(band);
    }
    addCylinder(`${descriptor.id}-tank-cap`, [tankX, 2.67, tankZ], 0.54, 0.16, materials.steel, 20);
    addCylinder(`${descriptor.id}-tank-foot`, [tankX, 0.18, tankZ], 0.56, 0.18, materials.steel, 20);

    addCylinder(`${descriptor.id}-furnace-rim`, [tankFaceX, 0.86, tankZ], 0.41, 0.14, materials.steel, 24, { rotationZ: Math.PI / 2 });
    addCylinder(`${descriptor.id}-furnace-door`, [tankFaceX + towardRoute * 0.09, 0.86, tankZ], 0.33, 0.08, materials.black, 24, { cast: false, rotationZ: Math.PI / 2 });
    addCylinder(`${descriptor.id}-furnace-heat`, [tankFaceX + towardRoute * 0.15, 0.86, tankZ], 0.24, 0.03, materials.amber, 24, { cast: false, rotationZ: Math.PI / 2 });
    for (const zOffset of [-0.14, 0, 0.14]) {
      addBox(`${descriptor.id}-furnace-grate-${zOffset}`, [tankFaceX + towardRoute * 0.18, 0.86, tankZ + zOffset], [0.03, 0.54, 0.035], materials.rust, { cast: false });
    }
    addBox(`${descriptor.id}-furnace-crossbar`, [tankFaceX + towardRoute * 0.18, 0.86, tankZ], [0.03, 0.045, 0.55], materials.rust, { cast: false });

    addCylinder(`${descriptor.id}-gauge-rim`, [tankFaceX + towardRoute * 0.04, 1.88, tankZ], 0.25, 0.11, materials.rust, 22, { rotationZ: Math.PI / 2 });
    addCylinder(`${descriptor.id}-gauge-face`, [tankFaceX + towardRoute * 0.11, 1.88, tankZ], 0.2, 0.035, materials.paper, 22, { cast: false, rotationZ: Math.PI / 2 });
    addBox(`${descriptor.id}-gauge-needle`, [tankFaceX + towardRoute * 0.14, 1.9, tankZ + 0.045], [0.025, 0.035, 0.24], materials.red, { cast: false, rotationX: -0.58 });
    for (const zOffset of [-0.13, 0, 0.13]) {
      addBox(`${descriptor.id}-gauge-mark-${zOffset}`, [tankFaceX + towardRoute * 0.145, 2.03, tankZ + zOffset], [0.02, 0.045, 0.018], zOffset > 0 ? materials.red : materials.black, { cast: false });
    }

    const valveZ = tankZ + 0.62;
    const valve = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.045, 8, 20), materials.rust);
    valve.name = `${descriptor.id}-valve-wheel`;
    valve.position.set(tankFaceX + towardRoute * 0.12, 1.47, valveZ);
    valve.rotation.y = Math.PI / 2;
    valve.castShadow = true;
    world.add(valve);
    addBox(`${descriptor.id}-valve-spoke-y`, [tankFaceX + towardRoute * 0.14, 1.47, valveZ], [0.025, 0.5, 0.045], materials.rust);
    addBox(`${descriptor.id}-valve-spoke-z`, [tankFaceX + towardRoute * 0.14, 1.47, valveZ], [0.025, 0.045, 0.5], materials.rust);
    addCylinder(`${descriptor.id}-valve-hub`, [tankFaceX + towardRoute * 0.17, 1.47, valveZ], 0.08, 0.07, materials.steel, 12, { rotationZ: Math.PI / 2 });

    addCylinder(`${descriptor.id}-stack`, [tankX, 3.05, tankZ], 0.13, 0.9, materials.rust, 14);
    addCylinder(`${descriptor.id}-ceiling-main`, [side * 3.12, 3.18, centerZ], 0.12, 4.35, materials.rust, 14, { rotationX: Math.PI / 2 });
    for (const zOffset of [-1.82, 1.82]) {
      addCylinder(`${descriptor.id}-pipe-drop-${zOffset}`, [side * 3.12, 2.5, centerZ + zOffset], 0.085, 1.38, materials.steel, 12);
      addCylinder(`${descriptor.id}-pipe-collar-${zOffset}`, [side * 3.12, 1.83, centerZ + zOffset], 0.13, 0.1, materials.rust, 12);
    }

    const trayX = side * 2.24;
    const trayZ = centerZ + 1.52;
    addBox(`${descriptor.id}-ritual-tray`, [trayX, 0.72, trayZ], [0.72, 0.12, 1.16], materials.rust);
    addBox(`${descriptor.id}-tray-pedestal`, [side * 2.55, 0.36, trayZ], [0.16, 0.66, 0.82], materials.steel);
    for (let index = 0; index < 4; index += 1) {
      addCylinder(
        `${descriptor.id}-pressure-token-${index}`,
        [trayX + towardRoute * 0.05, 0.82, trayZ - 0.39 + index * 0.26],
        0.08,
        0.05,
        index === 3 ? materials.red : materials.paper,
        12,
        { rotationZ: Math.PI / 2 },
      );
    }
    addCylinder(`${descriptor.id}-oil-cup`, [trayX, 0.91, trayZ + 0.46], 0.1, 0.18, materials.amber, 14);

    for (let index = 0; index < 7; index += 1) {
      const link = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.018, 6, 12), materials.rust);
      link.name = `${descriptor.id}-chain-link-${index}`;
      link.position.set(side * 2.76, 2.62 - index * 0.17, centerZ + 0.88);
      link.rotation.y = Math.PI / 2;
      link.rotation.z = index % 2 === 0 ? 0 : Math.PI / 2;
      link.castShadow = true;
      world.add(link);
    }
    addBox(`${descriptor.id}-chain-reliquary`, [side * 2.74, 1.4, centerZ + 0.88], [0.16, 0.24, 0.08], materials.red, { rotationZ: Math.PI / 4 });

    for (let index = 0; index < 4; index += 1) {
      addBox(
        `${descriptor.id}-floor-mark-${index}`,
        [side * (1.88 + index * 0.14), 0.02, centerZ - 0.55 + index * 0.36],
        [0.42, 0.018, 0.04],
        index === 3 ? materials.red : materials.paper,
        { cast: false, rotationY: side * (0.22 + index * 0.08) },
      );
    }

    const signMaterial = new THREE.MeshStandardMaterial({
      map: getBoilerSignTexture(),
      emissive: 0x5f2a16,
      emissiveMap: getBoilerSignTexture(),
      emissiveIntensity: 0.48,
      roughness: 0.94,
      side: THREE.DoubleSide,
    });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.8), signMaterial);
    sign.name = `${descriptor.id}-pressure-sign`;
    sign.position.set(side * 2.28, 2.12, centerZ - 1.72);
    sign.rotation.y = -side * Math.PI / 2;
    world.add(sign);
    for (const zOffset of [-0.46, 0.46]) {
      addCylinder(
        `${descriptor.id}-sign-bracket-${zOffset}`,
        [side * 2.8, 2.48, centerZ - 1.72 + zOffset],
        0.025,
        1.04,
        materials.steel,
        8,
        { rotationZ: Math.PI / 2 },
      );
    }

    const furnaceGlow = new THREE.PointLight(0xff6b2e, 10.5, 6.2, 2);
    furnaceGlow.name = `${descriptor.id}-furnace-glow`;
    furnaceGlow.position.set(tankFaceX + towardRoute * 0.32, 1.02, tankZ);
    world.add(furnaceGlow);
    const pressureWarning = new THREE.PointLight(0xff301f, 2.8, 3.8, 2.2);
    pressureWarning.name = `${descriptor.id}-pressure-warning`;
    pressureWarning.position.set(tankFaceX + towardRoute * 0.25, 1.94, tankZ + 0.08);
    world.add(pressureWarning);
  }

  function buildNightArchiveFacade(descriptor: ChamberDescriptor, materials: ReturnType<typeof createMaterials>): void {
    const shelves = descriptor.props.filter((prop) => prop.kind === "shelf");
    if (shelves.length === 0) return;
    const side = Math.sign(shelves[0].position.x) || 1;
    const centerZ = shelves.reduce((total, prop) => total + prop.position.z, 0) / shelves.length;
    const towardRoute = -side;
    const wallX = side * 3.47;
    const faceX = side * 3.31;
    const cabinetX = side * 3.02;
    const drawerFaceX = side * 2.7;

    addBox(`${descriptor.id}-recess`, [wallX, 1.5, centerZ], [0.14, 2.96, 5.5], materials.black, { cast: false });
    addBox(`${descriptor.id}-header`, [faceX, 3.02, centerZ], [0.34, 0.22, 5.42], materials.steel);
    addBox(`${descriptor.id}-far-jamb`, [faceX, 1.5, centerZ - 2.58], [0.34, 2.96, 0.24], materials.rust);
    addBox(`${descriptor.id}-near-curb`, [faceX, 0.25, centerZ + 2.58], [0.34, 0.46, 0.24], materials.concrete);

    const archiveBlue = new THREE.MeshStandardMaterial({
      color: 0x273a4d,
      emissive: 0x477aa8,
      emissiveIntensity: 0.42,
      roughness: 0.72,
      metalness: 0.24,
    });
    const cabinetOffsets = [-1.38, 0, 1.38] as const;
    cabinetOffsets.forEach((zOffset, cabinetIndex) => {
      const cabinetZ = centerZ + zOffset;
      addBox(`${descriptor.id}-cabinet-${cabinetIndex}`, [cabinetX, 1.42, cabinetZ], [0.58, 2.56, 1.08], materials.steel);
      addBox(`${descriptor.id}-cabinet-cap-${cabinetIndex}`, [cabinetX, 2.73, cabinetZ], [0.64, 0.1, 1.14], materials.rust);
      addBox(`${descriptor.id}-cabinet-foot-${cabinetIndex}`, [cabinetX, 0.12, cabinetZ], [0.64, 0.12, 1.14], materials.rust);

      for (let drawerIndex = 0; drawerIndex < 5; drawerIndex += 1) {
        const drawerY = 0.43 + drawerIndex * 0.47;
        const isOpen = cabinetIndex === 1 && drawerIndex === 2;
        if (isOpen) {
          addBox(`${descriptor.id}-open-void`, [drawerFaceX, drawerY, cabinetZ], [0.055, 0.34, 0.88], materials.black, { cast: false });
          const openCenterX = drawerFaceX + towardRoute * 0.42;
          addBox(`${descriptor.id}-open-drawer-bottom`, [openCenterX, drawerY - 0.15, cabinetZ], [0.82, 0.06, 0.86], materials.rust);
          addBox(`${descriptor.id}-open-drawer-front`, [openCenterX + towardRoute * 0.39, drawerY, cabinetZ], [0.06, 0.34, 0.9], materials.steel);
          for (const fileOffset of [-0.27, -0.09, 0.1, 0.28]) {
            addBox(
              `${descriptor.id}-hanging-file-${fileOffset}`,
              [openCenterX + side * 0.04, drawerY + 0.02 + Math.abs(fileOffset) * 0.12, cabinetZ + fileOffset],
              [0.58, 0.25, 0.035],
              fileOffset === 0.1 ? materials.red : materials.paper,
              { cast: false, rotationZ: side * fileOffset * 0.18 },
            );
          }
          continue;
        }

        addBox(
          `${descriptor.id}-drawer-${cabinetIndex}-${drawerIndex}`,
          [drawerFaceX, drawerY, cabinetZ],
          [0.055, 0.36, 0.9],
          drawerIndex === 4 && cabinetIndex === 2 ? archiveBlue : materials.rust,
        );
        addBox(
          `${descriptor.id}-drawer-label-${cabinetIndex}-${drawerIndex}`,
          [drawerFaceX + towardRoute * 0.035, drawerY + 0.065, cabinetZ],
          [0.025, 0.11, 0.24],
          drawerIndex === 4 && cabinetIndex === 2 ? materials.red : materials.paper,
          { cast: false },
        );
        addBox(
          `${descriptor.id}-drawer-handle-${cabinetIndex}-${drawerIndex}`,
          [drawerFaceX + towardRoute * 0.055, drawerY - 0.075, cabinetZ],
          [0.035, 0.045, 0.3],
          materials.steel,
          { cast: false },
        );
      }
    });

    for (let linkIndex = 0; linkIndex < 9; linkIndex += 1) {
      const link = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.018, 6, 12), materials.rust);
      link.name = `${descriptor.id}-cabinet-chain-${linkIndex}`;
      link.position.set(drawerFaceX + towardRoute * 0.08, 0.68 + linkIndex * 0.2, centerZ - 1.38 + linkIndex * 0.035);
      link.rotation.y = Math.PI / 2;
      link.rotation.z = linkIndex % 2 === 0 ? -0.18 : Math.PI / 2 - 0.18;
      link.castShadow = true;
      world.add(link);
    }
    addBox(`${descriptor.id}-cabinet-lock`, [drawerFaceX + towardRoute * 0.11, 1.58, centerZ - 1.22], [0.08, 0.22, 0.2], materials.red, { rotationZ: side * 0.08 });

    const cartX = side * 2.24;
    const cartZ = centerZ + 1.72;
    addBox(`${descriptor.id}-sorting-cart`, [cartX, 0.76, cartZ], [0.82, 0.12, 1.02], materials.rust);
    addBox(`${descriptor.id}-cart-lip`, [cartX + towardRoute * 0.36, 0.94, cartZ], [0.08, 0.42, 1.02], materials.steel);
    for (const zOffset of [-0.43, 0.43]) {
      addBox(`${descriptor.id}-cart-leg-${zOffset}`, [cartX, 0.38, cartZ + zOffset], [0.08, 0.7, 0.08], materials.steel);
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.035, 7, 14), materials.black);
      wheel.name = `${descriptor.id}-cart-wheel-${zOffset}`;
      wheel.position.set(cartX + towardRoute * 0.02, 0.12, cartZ + zOffset);
      wheel.rotation.y = Math.PI / 2;
      world.add(wheel);
    }
    for (const [folderIndex, zOffset] of [-0.3, -0.08, 0.17, 0.34].entries()) {
      addBox(
        `${descriptor.id}-cart-folder-${folderIndex}`,
        [cartX, 0.98 + (folderIndex % 2) * 0.035, cartZ + zOffset],
        [0.5, 0.34, 0.035],
        folderIndex === 2 ? materials.red : materials.paper,
        { cast: false, rotationZ: side * (folderIndex - 1.5) * 0.035 },
      );
    }

    addCylinder(`${descriptor.id}-desk-lamp-stem`, [side * 2.46, 1.45, centerZ + 2.08], 0.025, 0.86, materials.steel, 8, { rotationZ: side * 0.18 });
    const lampShade = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.28, 14, 1, true), archiveBlue);
    lampShade.name = `${descriptor.id}-desk-lamp-shade`;
    lampShade.position.set(side * 2.38, 1.82, centerZ + 2.08);
    lampShade.rotation.z = side * 0.34;
    lampShade.castShadow = true;
    world.add(lampShade);

    for (let paperIndex = 0; paperIndex < 6; paperIndex += 1) {
      addBox(
        `${descriptor.id}-discarded-card-${paperIndex}`,
        [side * (1.85 + (paperIndex % 3) * 0.18), 0.022 + Math.floor(paperIndex / 3) * 0.006, centerZ - 0.72 + paperIndex * 0.29],
        [0.38, 0.018, 0.25],
        paperIndex === 4 ? materials.red : materials.paper,
        { cast: false, rotationY: side * (-0.42 + paperIndex * 0.14) },
      );
    }

    const signMaterial = new THREE.MeshStandardMaterial({
      map: getArchiveSignTexture(),
      emissive: 0x28445f,
      emissiveMap: getArchiveSignTexture(),
      emissiveIntensity: 0.55,
      roughness: 0.9,
      side: THREE.DoubleSide,
    });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.22, 0.82), signMaterial);
    sign.name = `${descriptor.id}-records-sign`;
    sign.position.set(side * 2.55, 2.28, centerZ - 2.16);
    sign.rotation.y = -side * Math.PI / 2;
    world.add(sign);
    for (const zOffset of [-0.46, 0.46]) {
      addCylinder(
        `${descriptor.id}-sign-bracket-${zOffset}`,
        [side * 2.92, 2.62, centerZ - 2.16 + zOffset],
        0.024,
        0.76,
        materials.steel,
        8,
        { rotationZ: Math.PI / 2 },
      );
    }

    const archiveLamp = new THREE.PointLight(0x84b8e0, 9.5, 5.8, 2.1);
    archiveLamp.name = `${descriptor.id}-archive-lamp`;
    archiveLamp.position.set(side * 2.18, 1.7, centerZ + 1.78);
    world.add(archiveLamp);
    const missingFileGlow = new THREE.PointLight(0xc4382f, 2.4, 2.8, 2.2);
    missingFileGlow.name = `${descriptor.id}-missing-file-glow`;
    missingFileGlow.position.set(drawerFaceX + towardRoute * 0.55, 1.4, centerZ);
    world.add(missingFileGlow);
  }

  function buildTicketHallFacade(descriptor: ChamberDescriptor, materials: ReturnType<typeof createMaterials>): void {
    const counter = descriptor.props.find((prop) => prop.kind === "counter");
    if (!counter) return;
    const side = Math.sign(counter.position.x) || 1;
    const centerZ = counter.position.z;
    const towardRoute = -side;
    const wallX = side * 3.47;
    const faceX = side * 3.31;
    const boothX = side * 3.02;
    const frameX = side * 2.89;
    const counterFrontX = side * 2.68;

    addBox(`${descriptor.id}-recess`, [wallX, 1.5, centerZ], [0.14, 2.96, 5.52], materials.black, { cast: false });
    addBox(`${descriptor.id}-header`, [faceX, 3.16, centerZ], [0.34, 0.22, 5.42], materials.rust);
    addBox(`${descriptor.id}-far-jamb`, [faceX, 1.56, centerZ - 2.58], [0.34, 3.08, 0.24], materials.steel);
    addBox(`${descriptor.id}-near-curb`, [faceX, 0.25, centerZ + 2.58], [0.34, 0.46, 0.24], materials.concrete);

    addBox(`${descriptor.id}-counter-base`, [boothX, 0.57, centerZ], [0.62, 1.08, 4.72], materials.rust);
    addBox(`${descriptor.id}-counter-top`, [side * 2.84, 1.15, centerZ], [0.94, 0.14, 4.94], materials.steel);
    for (const zOffset of [-1.48, 0, 1.48]) {
      addBox(`${descriptor.id}-counter-panel-${zOffset}`, [counterFrontX, 0.57, centerZ + zOffset], [0.055, 0.72, 1.12], materials.wallDark, { cast: false });
      addBox(`${descriptor.id}-panel-trim-${zOffset}`, [counterFrontX + towardRoute * 0.02, 0.57, centerZ + zOffset], [0.035, 0.82, 1.24], materials.steel, { cast: false });
      addBox(`${descriptor.id}-panel-inset-${zOffset}`, [counterFrontX + towardRoute * 0.045, 0.57, centerZ + zOffset], [0.02, 0.62, 1.02], materials.wallDark, { cast: false });
    }

    const windowOffsets = [-1.46, 0, 1.46] as const;
    windowOffsets.forEach((zOffset, windowIndex) => {
      const windowZ = centerZ + zOffset;
      addBox(`${descriptor.id}-window-void-${windowIndex}`, [side * 3.28, 2.02, windowZ], [0.05, 1.32, 1.17], materials.black, { cast: false });
      addBox(`${descriptor.id}-window-glass-${windowIndex}`, [side * 3.22, 2.02, windowZ], [0.035, 1.25, 1.1], materials.glass, { cast: false });
      for (const edge of [-0.62, 0.62]) {
        addBox(`${descriptor.id}-window-post-${windowIndex}-${edge}`, [frameX, 2.02, windowZ + edge], [0.16, 1.46, 0.1], materials.rust);
      }
      for (const y of [1.34, 2.7]) {
        addBox(`${descriptor.id}-window-rail-${windowIndex}-${y}`, [frameX, y, windowZ], [0.16, 0.12, 1.34], materials.rust);
      }

      if (windowIndex === 0) {
        for (let slatIndex = 0; slatIndex < 6; slatIndex += 1) {
          addBox(
            `${descriptor.id}-closed-slat-${slatIndex}`,
            [frameX + towardRoute * 0.08, 1.48 + slatIndex * 0.2, windowZ],
            [0.04, 0.13, 1.08],
            slatIndex === 3 ? materials.red : materials.steel,
            { cast: false },
          );
        }
      } else {
        for (const barOffset of [-0.36, 0, 0.36]) {
          addCylinder(
            `${descriptor.id}-grille-vertical-${windowIndex}-${barOffset}`,
            [frameX + towardRoute * 0.08, 2.02, windowZ + barOffset],
            0.018,
            1.16,
            materials.steel,
            7,
          );
        }
        for (const y of [1.73, 2.16]) {
          addCylinder(
            `${descriptor.id}-grille-horizontal-${windowIndex}-${y}`,
            [frameX + towardRoute * 0.08, y, windowZ],
            0.018,
            0.98,
            materials.steel,
            7,
            { rotationX: Math.PI / 2 },
          );
        }
        const speaker = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.022, 8, 18), materials.rust);
        speaker.name = `${descriptor.id}-speaker-${windowIndex}`;
        speaker.position.set(frameX + towardRoute * 0.12, 1.98, windowZ);
        speaker.rotation.y = Math.PI / 2;
        speaker.castShadow = true;
        world.add(speaker);
      }

      addBox(
        `${descriptor.id}-ticket-tray-${windowIndex}`,
        [side * 2.38, 1.24, windowZ],
        [0.7, 0.06, 0.74],
        windowIndex === 1 ? materials.rust : materials.steel,
        { cast: false },
      );
      addBox(`${descriptor.id}-tray-slot-${windowIndex}`, [side * 2.28, 1.28, windowZ], [0.3, 0.025, 0.44], materials.black, { cast: false });
    });

    for (let ticketIndex = 0; ticketIndex < 5; ticketIndex += 1) {
      addBox(
        `${descriptor.id}-loose-ticket-${ticketIndex}`,
        [side * (2.15 - (ticketIndex % 2) * 0.14), 1.3 + ticketIndex * 0.004, centerZ - 0.36 + ticketIndex * 0.18],
        [0.34, 0.018, 0.13],
        ticketIndex === 3 ? materials.red : materials.paper,
        { cast: false, rotationY: side * (-0.22 + ticketIndex * 0.1) },
      );
    }
    addBox(`${descriptor.id}-ticket-roll`, [side * 2.5, 1.08, centerZ + 0.08], [0.035, 0.5, 0.22], materials.paper, { cast: false, rotationZ: side * 0.06 });
    for (let perforationIndex = 0; perforationIndex < 4; perforationIndex += 1) {
      addBox(
        `${descriptor.id}-ticket-perforation-${perforationIndex}`,
        [side * 2.47, 0.96 + perforationIndex * 0.11, centerZ + 0.08],
        [0.02, 0.018, 0.17],
        materials.black,
        { cast: false },
      );
    }

    addBox(`${descriptor.id}-punch-base`, [side * 2.45, 1.29, centerZ - 0.72], [0.38, 0.08, 0.28], materials.rust);
    addBox(`${descriptor.id}-punch-upright`, [side * 2.58, 1.48, centerZ - 0.72], [0.08, 0.38, 0.08], materials.steel);
    addBox(`${descriptor.id}-punch-handle`, [side * 2.42, 1.63, centerZ - 0.72], [0.36, 0.06, 0.08], materials.red, { rotationZ: side * 0.18 });
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 8), materials.rust);
    bell.name = `${descriptor.id}-service-bell`;
    bell.position.set(side * 2.42, 1.36, centerZ + 0.72);
    bell.scale.y = 0.55;
    bell.castShadow = true;
    world.add(bell);
    addCylinder(`${descriptor.id}-bell-base`, [side * 2.42, 1.28, centerZ + 0.72], 0.16, 0.04, materials.steel, 16);

    const clockX = side * 2.78;
    const clockZ = centerZ - 0.68;
    addCylinder(`${descriptor.id}-clock-rim`, [clockX, 2.53, clockZ], 0.34, 0.1, materials.rust, 24, { rotationZ: Math.PI / 2 });
    addCylinder(`${descriptor.id}-clock-face`, [clockX + towardRoute * 0.07, 2.53, clockZ], 0.28, 0.025, materials.paper, 24, { cast: false, rotationZ: Math.PI / 2 });
    addBox(`${descriptor.id}-clock-hand-minute`, [clockX + towardRoute * 0.09, 2.61, clockZ - 0.055], [0.02, 0.24, 0.025], materials.black, { cast: false, rotationX: -0.5 });
    addBox(`${descriptor.id}-clock-hand-hour`, [clockX + towardRoute * 0.1, 2.51, clockZ + 0.065], [0.02, 0.025, 0.18], materials.red, { cast: false, rotationX: 0.22 });

    const signMaterial = new THREE.MeshStandardMaterial({
      map: getTicketSignTexture(),
      emissive: 0x33424d,
      emissiveMap: getTicketSignTexture(),
      emissiveIntensity: 0.52,
      roughness: 0.9,
      side: THREE.DoubleSide,
    });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.66), signMaterial);
    sign.name = `${descriptor.id}-night-tickets-sign`;
    sign.position.set(side * 2.52, 2.42, centerZ - 2.05);
    sign.rotation.y = -side * Math.PI / 2;
    world.add(sign);
    for (const zOffset of [-0.45, 0.45]) {
      addCylinder(
        `${descriptor.id}-sign-bracket-${zOffset}`,
        [side * 2.88, 2.68, centerZ - 2.05 + zOffset],
        0.024,
        0.68,
        materials.steel,
        8,
        { rotationZ: Math.PI / 2 },
      );
    }

    const queueX = side * 1.9;
    for (const zOffset of [-1.25, 1.25]) {
      addCylinder(`${descriptor.id}-queue-post-${zOffset}`, [queueX, 0.56, centerZ + zOffset], 0.065, 1.06, materials.rust, 14);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8), materials.steel);
      cap.name = `${descriptor.id}-queue-cap-${zOffset}`;
      cap.position.set(queueX, 1.1, centerZ + zOffset);
      cap.castShadow = true;
      world.add(cap);
    }
    addCylinder(`${descriptor.id}-queue-rope`, [queueX, 0.92, centerZ], 0.035, 2.5, materials.rust, 10, { rotationX: Math.PI / 2 });
    for (let floorTicket = 0; floorTicket < 5; floorTicket += 1) {
      addBox(
        `${descriptor.id}-floor-ticket-${floorTicket}`,
        [side * (1.48 + (floorTicket % 3) * 0.17), 0.022 + Math.floor(floorTicket / 3) * 0.005, centerZ - 0.58 + floorTicket * 0.31],
        [0.32, 0.018, 0.12],
        floorTicket === 2 ? materials.red : materials.paper,
        { cast: false, rotationY: side * (-0.35 + floorTicket * 0.16) },
      );
    }

    const wicketLight = new THREE.PointLight(0x8eb9d6, 9.2, 6.2, 2.1);
    wicketLight.name = `${descriptor.id}-wicket-light`;
    wicketLight.position.set(side * 2.2, 2.25, centerZ + 0.72);
    world.add(wicketLight);
    const closedWindowGlow = new THREE.PointLight(0xc33b30, 2.8, 3.2, 2.2);
    closedWindowGlow.name = `${descriptor.id}-closed-window-glow`;
    closedWindowGlow.position.set(side * 2.52, 2.03, centerZ - 1.46);
    world.add(closedWindowGlow);
  }

  function buildWorkersDormitoryFacade(descriptor: ChamberDescriptor, materials: ReturnType<typeof createMaterials>): void {
    const tables = descriptor.props.filter((prop) => prop.kind === "table");
    if (tables.length === 0) return;
    const side = Math.sign(tables[0].position.x) || 1;
    const centerZ = tables.reduce((total, prop) => total + prop.position.z, 0) / tables.length;
    const towardRoute = -side;
    const wallX = side * 3.47;
    const faceX = side * 3.31;
    const bedX = side * 2.88;
    const routeRailX = side * 2.24;

    addBox(`${descriptor.id}-recess`, [wallX, 1.5, centerZ], [0.14, 2.96, 5.58], materials.black, { cast: false });
    addBox(`${descriptor.id}-header`, [faceX, 3.08, centerZ], [0.34, 0.22, 5.48], materials.steel);
    addBox(`${descriptor.id}-far-jamb`, [faceX, 1.52, centerZ - 2.62], [0.34, 3.02, 0.24], materials.rust);
    addBox(`${descriptor.id}-near-curb`, [faceX, 0.25, centerZ + 2.62], [0.34, 0.46, 0.24], materials.concrete);

    const blanketMaterial = new THREE.MeshStandardMaterial({
      color: 0x454158,
      emissive: 0x37304d,
      emissiveIntensity: 0.18,
      roughness: 0.98,
    });
    const uniformMaterial = new THREE.MeshStandardMaterial({ color: 0x263c46, roughness: 0.94, metalness: 0.03 });
    const bedCenters = [-1.14, 1.14] as const;
    bedCenters.forEach((zOffset, bedIndex) => {
      const bedZ = centerZ + zOffset;
      for (const x of [side * 2.28, side * 3.43]) {
        for (const endOffset of [-0.86, 0.86]) {
          addBox(`${descriptor.id}-bunk-post-${bedIndex}-${x}-${endOffset}`, [x, 1.34, bedZ + endOffset], [0.08, 2.66, 0.08], materials.rust);
        }
      }

      for (const [levelIndex, mattressY] of [0.52, 1.84].entries()) {
        addBox(`${descriptor.id}-bed-frame-${bedIndex}-${levelIndex}`, [bedX, mattressY - 0.14, bedZ], [1.28, 0.1, 1.82], materials.steel);
        addBox(`${descriptor.id}-mattress-${bedIndex}-${levelIndex}`, [bedX + towardRoute * 0.03, mattressY, bedZ], [1.12, 0.17, 1.66], materials.paper);
        addBox(
          `${descriptor.id}-pillow-${bedIndex}-${levelIndex}`,
          [bedX + towardRoute * 0.05, mattressY + 0.14, bedZ - 0.58],
          [0.88, 0.16, 0.34],
          materials.paper,
          { cast: false, rotationY: side * (bedIndex === levelIndex ? 0.05 : -0.04) },
        );
        addBox(
          `${descriptor.id}-blanket-${bedIndex}-${levelIndex}`,
          [bedX + towardRoute * 0.08, mattressY + 0.13, bedZ + 0.38],
          [1.06, 0.12, 0.76],
          bedIndex === 1 && levelIndex === 0 ? materials.red : blanketMaterial,
          { cast: false, rotationY: side * (levelIndex === 0 ? 0.025 : -0.035) },
        );
        if (bedIndex === 0 || levelIndex === 1) {
          addBox(
            `${descriptor.id}-blanket-drape-${bedIndex}-${levelIndex}`,
            [routeRailX + towardRoute * 0.015, mattressY - 0.06, bedZ + 0.38],
            [0.07, 0.46, 0.72],
            bedIndex === 1 && levelIndex === 0 ? materials.red : blanketMaterial,
            { cast: false, rotationZ: side * 0.04 },
          );
        }
      }

      for (const railY of [1.83, 2.12]) {
        addBox(`${descriptor.id}-upper-guard-${bedIndex}-${railY}`, [routeRailX, railY, bedZ], [0.07, 0.07, 1.48], materials.rust);
      }
      for (const endOffset of [-0.72, 0.72]) {
        addBox(`${descriptor.id}-upper-guard-post-${bedIndex}-${endOffset}`, [routeRailX, 1.98, bedZ + endOffset], [0.07, 0.42, 0.07], materials.rust);
      }
    });

    const ladderX = side * 2.16;
    for (const zOffset of [-0.23, 0.23]) {
      addCylinder(`${descriptor.id}-ladder-side-${zOffset}`, [ladderX, 1.25, centerZ + zOffset], 0.025, 1.9, materials.steel, 8);
    }
    for (let rungIndex = 0; rungIndex < 5; rungIndex += 1) {
      addCylinder(
        `${descriptor.id}-ladder-rung-${rungIndex}`,
        [ladderX, 0.58 + rungIndex * 0.36, centerZ],
        0.022,
        0.48,
        materials.steel,
        8,
        { rotationX: Math.PI / 2 },
      );
    }

    const lockerZ = centerZ - 2.36;
    addBox(`${descriptor.id}-locker-body`, [side * 3.08, 1.18, lockerZ], [0.58, 2.26, 0.62], materials.steel);
    addBox(
      `${descriptor.id}-locker-door`,
      [side * 2.74, 1.18, lockerZ + 0.06],
      [0.055, 2.08, 0.55],
      materials.rust,
      { rotationY: side * 0.18 },
    );
    for (const y of [1.86, 1.98, 2.1]) {
      addBox(`${descriptor.id}-locker-vent-${y}`, [side * 2.69, y, lockerZ + 0.08], [0.025, 0.035, 0.3], materials.black, { cast: false });
    }
    addBox(`${descriptor.id}-locker-label`, [side * 2.68, 1.48, lockerZ + 0.08], [0.025, 0.16, 0.28], materials.paper, { cast: false });
    addBox(`${descriptor.id}-locker-hook`, [side * 2.54, 1.72, lockerZ + 0.22], [0.25, 0.035, 0.035], materials.rust, { rotationZ: side * 0.25 });

    const coatZ = centerZ + 2.05;
    addBox(`${descriptor.id}-coat-shoulders`, [routeRailX + towardRoute * 0.06, 1.68, coatZ], [0.1, 0.16, 0.7], uniformMaterial, { cast: false });
    addBox(`${descriptor.id}-coat-body`, [routeRailX + towardRoute * 0.06, 1.22, coatZ], [0.09, 0.86, 0.52], uniformMaterial, { cast: false });
    for (const sleeveOffset of [-0.38, 0.38]) {
      addBox(
        `${descriptor.id}-coat-sleeve-${sleeveOffset}`,
        [routeRailX + towardRoute * 0.05, 1.28, coatZ + sleeveOffset],
        [0.08, 0.72, 0.16],
        uniformMaterial,
        { cast: false, rotationX: sleeveOffset * 0.12 },
      );
    }
    const hardHat = new THREE.Mesh(new THREE.SphereGeometry(0.25, 14, 8), materials.rust);
    hardHat.name = `${descriptor.id}-hard-hat`;
    hardHat.position.set(routeRailX + towardRoute * 0.08, 2.12, coatZ);
    hardHat.scale.set(0.62, 0.42, 1);
    hardHat.castShadow = true;
    world.add(hardHat);
    addBox(`${descriptor.id}-hat-brim`, [routeRailX + towardRoute * 0.09, 2.06, coatZ], [0.1, 0.04, 0.62], materials.rust);

    for (const [bootIndex, zOffset] of [0.72, 1.18, 1.58].entries()) {
      addBox(`${descriptor.id}-boot-${bootIndex}-shaft`, [side * 2.42, 0.22, centerZ + zOffset], [0.2, 0.38, 0.2], materials.black, { rotationY: side * (bootIndex - 1) * 0.1 });
      addBox(`${descriptor.id}-boot-${bootIndex}-toe`, [side * 2.3, 0.09, centerZ + zOffset + 0.08], [0.38, 0.16, 0.24], materials.black, { rotationY: side * (bootIndex - 1) * 0.1 });
    }

    addBox(`${descriptor.id}-personal-shelf`, [side * 2.7, 1.19, centerZ - 0.1], [0.78, 0.08, 0.48], materials.rust);
    addCylinder(`${descriptor.id}-enamel-cup`, [side * 2.52, 1.36, centerZ - 0.18], 0.09, 0.24, materials.paper, 14);
    addBox(`${descriptor.id}-id-card`, [side * 2.43, 1.26, centerZ + 0.05], [0.28, 0.018, 0.18], materials.red, { cast: false, rotationY: side * 0.2 });

    for (let tagIndex = 0; tagIndex < 5; tagIndex += 1) {
      addBox(
        `${descriptor.id}-floor-tag-${tagIndex}`,
        [side * (1.62 + (tagIndex % 3) * 0.16), 0.022 + Math.floor(tagIndex / 3) * 0.005, centerZ - 0.62 + tagIndex * 0.3],
        [0.3, 0.018, 0.14],
        tagIndex === 3 ? materials.red : materials.paper,
        { cast: false, rotationY: side * (-0.3 + tagIndex * 0.14) },
      );
    }

    const signMaterial = new THREE.MeshStandardMaterial({
      map: getDormitorySignTexture(),
      emissive: 0x3e3853,
      emissiveMap: getDormitorySignTexture(),
      emissiveIntensity: 0.5,
      roughness: 0.92,
      side: THREE.DoubleSide,
    });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.12, 0.74), signMaterial);
    sign.name = `${descriptor.id}-night-shift-sign`;
    sign.position.set(side * 2.02, 2.48, centerZ - 2.1);
    sign.rotation.y = -side * Math.PI / 2;
    world.add(sign);
    for (const zOffset of [-0.44, 0.44]) {
      addCylinder(
        `${descriptor.id}-sign-bracket-${zOffset}`,
        [side * 2.66, 2.72, centerZ - 2.1 + zOffset],
        0.024,
        1.18,
        materials.steel,
        8,
        { rotationZ: Math.PI / 2 },
      );
    }

    const cageCore = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), blanketMaterial);
    cageCore.name = `${descriptor.id}-cage-light-core`;
    cageCore.position.set(side * 2.42, 2.75, centerZ + 0.42);
    world.add(cageCore);
    for (const zOffset of [-0.15, 0.15]) {
      addCylinder(`${descriptor.id}-cage-light-bar-${zOffset}`, [side * 2.41, 2.75, centerZ + 0.42 + zOffset], 0.015, 0.42, materials.steel, 6);
    }
    const cageRing = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.018, 7, 18), materials.steel);
    cageRing.name = `${descriptor.id}-cage-light-ring`;
    cageRing.position.set(side * 2.41, 2.75, centerZ + 0.42);
    cageRing.rotation.y = Math.PI / 2;
    cageRing.castShadow = true;
    world.add(cageRing);

    const dormitoryLight = new THREE.PointLight(0xa6a1d4, 12.8, 6.8, 2.1);
    dormitoryLight.name = `${descriptor.id}-dormitory-light`;
    dormitoryLight.position.set(side * 2.15, 2.35, centerZ + 0.42);
    world.add(dormitoryLight);
    const bunkFill = new THREE.PointLight(0x858dbb, 4.8, 5.4, 2.2);
    bunkFill.name = `${descriptor.id}-bunk-fill`;
    bunkFill.position.set(side * 1.72, 0.92, centerZ - 0.72);
    world.add(bunkFill);
    const wakeWarning = new THREE.PointLight(0xb6322f, 2.5, 3.4, 2.2);
    wakeWarning.name = `${descriptor.id}-wake-warning`;
    wakeWarning.position.set(side * 2.34, 2.5, centerZ - 2.08);
    world.add(wakeWarning);
  }

  function buildMortuaryBayFacade(descriptor: ChamberDescriptor, materials: ReturnType<typeof createMaterials>): void {
    const tables = descriptor.props.filter((prop) => prop.kind === "table");
    if (tables.length === 0) return;
    const side = Math.sign(tables[0].position.x) || 1;
    const centerZ = tables.reduce((total, prop) => total + prop.position.z, 0) / tables.length;
    const towardRoute = -side;
    const wallX = side * 3.47;
    const faceX = side * 3.31;
    const drawerFaceX = side * 2.77;

    addBox(`${descriptor.id}-recess`, [wallX, 1.5, centerZ], [0.14, 2.96, 5.58], materials.black, { cast: false });
    addBox(`${descriptor.id}-header`, [faceX, 3.08, centerZ], [0.34, 0.22, 5.48], materials.steel);
    addBox(`${descriptor.id}-far-jamb`, [faceX, 1.52, centerZ - 2.62], [0.34, 3.02, 0.24], materials.steel);
    addBox(`${descriptor.id}-near-curb`, [faceX, 0.25, centerZ + 2.62], [0.34, 0.46, 0.24], materials.concrete);

    const coldSteel = new THREE.MeshStandardMaterial({
      color: 0x667a77,
      emissive: 0x172826,
      emissiveIntensity: 0.16,
      roughness: 0.42,
      metalness: 0.68,
    });
    const tileMaterial = new THREE.MeshStandardMaterial({
      color: 0x455a56,
      roughness: 0.34,
      metalness: 0.12,
    });

    addBox(`${descriptor.id}-wash-floor`, [side * 2.64, 0.018, centerZ], [1.64, 0.035, 5.14], tileMaterial, { cast: false, receive: true });
    for (let tileIndex = -5; tileIndex <= 5; tileIndex += 1) {
      addBox(
        `${descriptor.id}-floor-joint-${tileIndex}`,
        [side * 2.64, 0.041, centerZ + tileIndex * 0.45],
        [1.58, 0.01, 0.018],
        materials.black,
        { cast: false },
      );
    }

    const cabinetZ = centerZ + 0.68;
    addBox(`${descriptor.id}-cold-bank`, [side * 3.1, 1.42, cabinetZ], [0.66, 2.62, 3.12], coldSteel);
    for (let row = 0; row < 3; row += 1) {
      for (let column = 0; column < 2; column += 1) {
        const drawerY = 0.59 + row * 0.82;
        const drawerZ = cabinetZ - 0.77 + column * 1.54;
        const isOpen = row === 1 && column === 0;
        addBox(
          `${descriptor.id}-drawer-aperture-${row}-${column}`,
          [drawerFaceX, drawerY, drawerZ],
          [0.075, 0.66, 1.39],
          isOpen ? materials.black : coldSteel,
          { cast: !isOpen },
        );
        if (isOpen) continue;
        addBox(
          `${descriptor.id}-drawer-label-${row}-${column}`,
          [drawerFaceX + towardRoute * 0.045, drawerY + 0.11, drawerZ],
          [0.025, 0.15, 0.36],
          materials.paper,
          { cast: false },
        );
        addCylinder(
          `${descriptor.id}-drawer-handle-${row}-${column}`,
          [drawerFaceX + towardRoute * 0.07, drawerY - 0.12, drawerZ],
          0.025,
          0.42,
          materials.rust,
          8,
          { rotationX: Math.PI / 2 },
        );
      }
    }

    const openDrawerY = 1.41;
    const openDrawerZ = cabinetZ - 0.77;
    addBox(`${descriptor.id}-open-drawer-tray`, [side * 2.28, openDrawerY, openDrawerZ], [1.04, 0.09, 1.12], coldSteel);
    addBox(`${descriptor.id}-open-drawer-front`, [side * 1.74, openDrawerY + 0.08, openDrawerZ], [0.08, 0.44, 1.18], coldSteel);
    for (const zOffset of [-0.48, 0.48]) {
      addBox(`${descriptor.id}-open-drawer-rail-${zOffset}`, [side * 2.3, openDrawerY - 0.08, openDrawerZ + zOffset], [1.08, 0.06, 0.055], materials.rust);
    }
    addBox(`${descriptor.id}-open-drawer-tag`, [side * 1.67, openDrawerY + 0.12, openDrawerZ + 0.2], [0.025, 0.24, 0.34], materials.paper, { cast: false, rotationX: -0.12 });
    addBox(`${descriptor.id}-open-drawer-mark`, [side * 1.65, openDrawerY + 0.04, openDrawerZ - 0.22], [0.025, 0.09, 0.28], materials.red, { cast: false });

    const slabX = side * 2.28;
    const slabZ = centerZ - 1.42;
    addBox(`${descriptor.id}-autopsy-frame`, [slabX, 0.72, slabZ], [1.1, 0.13, 1.96], materials.steel);
    addBox(`${descriptor.id}-autopsy-slab`, [slabX + towardRoute * 0.035, 0.84, slabZ], [1.02, 0.12, 1.86], coldSteel);
    addBox(`${descriptor.id}-head-block`, [slabX + towardRoute * 0.04, 0.95, slabZ - 0.69], [0.64, 0.12, 0.34], materials.wallDark, { cast: false, rotationX: -0.08 });
    addBox(`${descriptor.id}-folded-shroud`, [slabX + towardRoute * 0.06, 0.96, slabZ + 0.52], [0.86, 0.16, 0.48], materials.paper, { cast: false, rotationY: side * 0.05 });
    for (const xOffset of [-0.4, 0.4]) {
      for (const zOffset of [-0.7, 0.7]) {
        const legX = slabX + xOffset;
        const legZ = slabZ + zOffset;
        addBox(`${descriptor.id}-slab-leg-${xOffset}-${zOffset}`, [legX, 0.38, legZ], [0.07, 0.62, 0.07], materials.steel);
        addCylinder(`${descriptor.id}-slab-wheel-${xOffset}-${zOffset}`, [legX, 0.1, legZ], 0.1, 0.055, materials.rust, 10, { rotationZ: Math.PI / 2 });
      }
    }
    for (const zOffset of [-0.78, 0.78]) {
      addBox(`${descriptor.id}-slab-lip-${zOffset}`, [side * 1.75, 1.02, slabZ + zOffset], [0.055, 0.28, 0.06], materials.rust);
    }

    const instrumentX = side * 3.02;
    const instrumentZ = centerZ - 2.28;
    addBox(`${descriptor.id}-instrument-stand`, [instrumentX, 0.72, instrumentZ], [0.64, 0.08, 0.72], materials.steel);
    addCylinder(`${descriptor.id}-instrument-pedestal`, [instrumentX, 0.37, instrumentZ], 0.035, 0.68, materials.steel, 8);
    for (const zOffset of [-0.24, 0.24]) {
      addCylinder(`${descriptor.id}-instrument-base-${zOffset}`, [instrumentX, 0.07, instrumentZ + zOffset], 0.025, 0.52, materials.steel, 8, { rotationX: Math.PI / 2 });
    }
    for (const [toolIndex, zOffset] of [-0.2, 0, 0.2].entries()) {
      addCylinder(
        `${descriptor.id}-instrument-${toolIndex}`,
        [instrumentX + towardRoute * 0.13, 0.8, instrumentZ + zOffset],
        0.012,
        0.36,
        toolIndex === 1 ? materials.rust : coldSteel,
        6,
        { rotationZ: Math.PI / 2 },
      );
    }

    addCylinder(`${descriptor.id}-drain`, [side * 1.86, 0.05, centerZ + 0.18], 0.24, 0.028, materials.black, 20, { cast: false });
    for (let slot = -2; slot <= 2; slot += 1) {
      addBox(`${descriptor.id}-drain-slot-${slot}`, [side * 1.84, 0.07, centerZ + 0.18 + slot * 0.07], [0.3, 0.012, 0.018], materials.steel, { cast: false });
    }

    addCylinder(`${descriptor.id}-refrigeration-main`, [side * 3.11, 2.88, cabinetZ], 0.055, 2.78, materials.rust, 10, { rotationX: Math.PI / 2 });
    for (const zOffset of [-1.18, 1.18]) {
      addCylinder(`${descriptor.id}-refrigeration-drop-${zOffset}`, [side * 3.11, 2.55, cabinetZ + zOffset], 0.045, 0.64, materials.rust, 9);
    }

    const examZ = slabZ + 0.48;
    addCylinder(`${descriptor.id}-exam-arm`, [side * 2.72, 2.89, examZ], 0.045, 0.95, materials.steel, 10, { rotationZ: Math.PI / 2 });
    addCylinder(`${descriptor.id}-exam-joint`, [side * 2.23, 2.68, examZ], 0.06, 0.44, materials.rust, 10, { rotationZ: side * 0.28 });
    addCylinder(`${descriptor.id}-exam-dish`, [side * 2.02, 2.48, examZ], 0.32, 0.18, coldSteel, 18);
    addCylinder(`${descriptor.id}-exam-face`, [side * 2.02, 2.36, examZ], 0.25, 0.035, materials.green, 18, { cast: false });

    const signMaterial = new THREE.MeshStandardMaterial({
      map: getMortuarySignTexture(),
      emissive: 0x284b48,
      emissiveMap: getMortuarySignTexture(),
      emissiveIntensity: 0.52,
      roughness: 0.92,
      side: THREE.DoubleSide,
    });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.22, 0.76), signMaterial);
    sign.name = `${descriptor.id}-cold-delivery-sign`;
    sign.position.set(side * 2.02, 2.46, centerZ - 2.42);
    sign.rotation.y = -side * Math.PI / 2;
    world.add(sign);
    for (const zOffset of [-0.48, 0.48]) {
      addCylinder(
        `${descriptor.id}-sign-bracket-${zOffset}`,
        [side * 2.66, 2.7, centerZ - 2.42 + zOffset],
        0.024,
        1.18,
        materials.steel,
        8,
        { rotationZ: Math.PI / 2 },
      );
    }

    for (let tagIndex = 0; tagIndex < 4; tagIndex += 1) {
      addBox(
        `${descriptor.id}-intake-tag-${tagIndex}`,
        [side * (1.72 + (tagIndex % 2) * 0.15), 0.028 + Math.floor(tagIndex / 2) * 0.004, centerZ - 0.14 + tagIndex * 0.22],
        [0.28, 0.018, 0.14],
        tagIndex === 2 ? materials.red : materials.paper,
        { cast: false, rotationY: side * (-0.25 + tagIndex * 0.18) },
      );
    }

    const mortuaryLight = new THREE.PointLight(0xa5ddd7, 13.5, 6.8, 2.05);
    mortuaryLight.name = `${descriptor.id}-mortuary-light`;
    mortuaryLight.position.set(side * 2.12, 2.36, centerZ - 0.72);
    world.add(mortuaryLight);
    const drawerFill = new THREE.PointLight(0x7faeaa, 5.2, 5.6, 2.2);
    drawerFill.name = `${descriptor.id}-drawer-fill`;
    drawerFill.position.set(side * 1.78, 1.18, cabinetZ - 0.36);
    world.add(drawerFill);
    const intakeWarning = new THREE.PointLight(0xc83a32, 2.6, 3.5, 2.2);
    intakeWarning.name = `${descriptor.id}-intake-warning`;
    intakeWarning.position.set(side * 2.34, 2.42, centerZ - 2.36);
    world.add(intakeWarning);
  }

  function buildProp(prop: ChamberPropDescriptor, materials: ReturnType<typeof createMaterials>): void {
    const { x, y, z } = prop.position;
    if (prop.kind === "shelf") {
      for (let level = 0; level < 4; level += 1) {
        addBox(`${prop.id}-shelf-${level}`, [x, 0.45 + level * 0.66, z], [1.35, 0.08, 0.54], materials.steel, { rotationY: prop.rotationY });
      }
      for (const offset of [-0.58, 0.58]) {
        addBox(`${prop.id}-upright-${offset}`, [x + offset, 1.45, z], [0.08, 2.75, 0.1], materials.rust, { rotationY: prop.rotationY });
      }
      addBox(`${prop.id}-crate`, [x - 0.15, 1.15, z], [0.66, 0.48, 0.44], materials.wallDark, { rotationY: 0.12 });
    } else if (prop.kind === "generator") {
      addBox(prop.id, [x, 0.72, z], [1.35, 1.44, 0.92], materials.rust, { rotationY: prop.rotationY });
      addBox(`${prop.id}-panel`, [x, 0.86, z + 0.47], [0.82, 0.54, 0.045], materials.black, { rotationY: prop.rotationY });
      for (let index = -1; index <= 1; index += 1) {
        addBox(`${prop.id}-vent-${index}`, [x + index * 0.22, 0.84, z + 0.5], [0.11, 0.035, 0.03], materials.steel, { rotationY: prop.rotationY });
      }
    } else if (prop.kind === "pipe") {
      const scale = prop.scale ?? { x: 0.15, y: 0.15, z: 4 };
      const pipe = new THREE.Mesh(
        new THREE.CylinderGeometry(scale.x, scale.y, scale.z, 12),
        materials.rust,
      );
      pipe.name = prop.id;
      pipe.position.set(x, y, z);
      pipe.rotation.x = Math.PI / 2;
      pipe.castShadow = true;
      world.add(pipe);
    } else if (prop.kind === "rubble") {
      for (let index = 0; index < 13; index += 1) {
        const angle = index * 2.399;
        const radius = 0.2 + (index % 5) * 0.17;
        addBox(
          `${prop.id}-${index}`,
          [x + Math.cos(angle) * radius, 0.08 + (index % 3) * 0.055, z + Math.sin(angle) * radius],
          [0.16 + (index % 4) * 0.05, 0.12 + (index % 2) * 0.08, 0.22],
          index % 3 === 0 ? materials.rust : materials.concrete,
          { rotationY: angle },
        );
      }
    } else if (prop.kind === "altar") {
      addBox(prop.id, [x, 0.4, z], [1.25, 0.8, 0.8], materials.concrete);
      addBox(`${prop.id}-top`, [x, 0.84, z], [1.52, 0.12, 1.02], materials.steel);
    } else if (prop.kind === "lamp") {
      addBox(prop.id, [x, y, z], [0.9, 0.18, 0.34], materials.steel);
      addBox(`${prop.id}-glass`, [x, y - 0.12, z + 0.17], [0.55, 0.12, 0.04], materials.green);
    } else if (prop.kind === "counter") {
      addBox(prop.id, [x, 0.62, z], [0.72, 1.24, 3.15], materials.rust, { rotationY: prop.rotationY });
      addBox(`${prop.id}-top`, [x, 1.29, z], [0.9, 0.12, 3.35], materials.steel, { rotationY: prop.rotationY });
      for (const offset of [-0.92, 0, 0.92]) {
        addCylinder(`${prop.id}-bottle-${offset}`, [x, 1.52, z + offset], 0.085, 0.42, materials.glass, 12);
        addCylinder(`${prop.id}-bottle-neck-${offset}`, [x, 1.78, z + offset], 0.04, 0.16, materials.glass, 10);
      }
    } else if (prop.kind === "table") {
      addBox(prop.id, [x, 0.72, z], [1.18, 0.12, 0.78], materials.rust, { rotationY: prop.rotationY });
      for (const [offsetX, offsetZ] of [[-0.45, -0.28], [-0.45, 0.28], [0.45, -0.28], [0.45, 0.28]]) {
        addBox(`${prop.id}-leg-${offsetX}-${offsetZ}`, [x + offsetX, 0.34, z + offsetZ], [0.09, 0.68, 0.09], materials.steel, { rotationY: prop.rotationY });
      }
    } else if (prop.kind === "sign") {
      addBox(prop.id, [x, y, z], [1.28, 0.72, 0.12], materials.rust, { rotationY: prop.rotationY });
      addBox(`${prop.id}-face`, [x - Math.sign(x) * 0.07, y, z], [1.04, 0.46, 0.04], materials.red, { cast: false, rotationY: prop.rotationY });
    }
  }

  const prefabRegistry = bindCorridorPrefabBuilders<ReturnType<typeof createMaterials>>({
    "closed-tavern": buildClosedTavernFacade,
    "service-nook": buildServiceNookFacade,
    "empty-pantry": buildEmptyPantryFacade,
    "sealed-nursery": buildSealedNurseryFacade,
    "abandoned-clinic": buildAbandonedClinicFacade,
    "flooded-laundry": buildFloodedLaundryFacade,
    "pilgrim-alcove": buildPilgrimAlcoveFacade,
    "boiler-shrine": buildBoilerShrineFacade,
    "night-archive": buildNightArchiveFacade,
    "ticket-hall": buildTicketHallFacade,
    "workers-dormitory": buildWorkersDormitoryFacade,
    "mortuary-bay": buildMortuaryBayFacade,
  });

  function buildCorridorWindow(snapshot: HorrorCorridorV2Snapshot, activeSegment: number): void {
    const activeDistrict = authoringTarget
      ? CORRIDOR_DISTRICTS.find((district) => district.id === authoringTarget?.districtId) ?? districtForSegment(activeSegment)
      : districtForSegment(activeSegment);
    const firstSegment = activeSegment - SEGMENTS_BEHIND;
    const lastSegment = activeSegment + SEGMENTS_AHEAD;
    const authoredSegment = authoringTarget ? 2 : activeSegment + 2;
    const worldIdentity = `${snapshot.corridor.chamberId}:${snapshot.corridor.routeSeed}:${authoringTarget?.districtId ?? ""}:${authoringTarget?.setPieceKind ?? ""}`;
    if (worldIdentity !== builtWorldIdentity) {
      clearWorld();
      builtWorldIdentity = worldIdentity;
    }
    builtWindowKey = `${snapshot.corridor.chamberId}:${activeSegment}:${authoringTarget?.districtId ?? ""}:${authoringTarget?.setPieceKind ?? ""}`;

    for (const [segment, group] of [...segmentGroups]) {
      if (segment >= firstSegment && segment <= lastSegment) continue;
      removeWorldGroup(group);
      segmentGroups.delete(segment);
    }

    for (let segment = firstSegment; segment <= lastSegment; segment += 1) {
      if (segmentGroups.has(segment)) continue;
      const existing = new Set(world.children);
      const z = corridorSegmentCenter(segment);
      const segmentDistrict = authoringTarget
        ? activeDistrict
        : districtForSegment(segment);
      const materials = createMaterials(segmentDistrict);
      addBox(`wet-floor-${segment}`, [0, -0.16, z], [7.6, 0.32, CORRIDOR_SEGMENT_LENGTH + 0.12], materials.floor, { cast: false });
      addBox(`ceiling-${segment}`, [0, 3.8, z], [7.6, 0.28, CORRIDOR_SEGMENT_LENGTH + 0.12], materials.wallDark, { cast: false });
      addBox(`left-wall-${segment}`, [-3.72, 1.8, z], [0.42, 3.6, CORRIDOR_SEGMENT_LENGTH + 0.08], segment % 3 === 0 ? materials.concrete : materials.wall, { cast: false });
      addBox(`right-wall-${segment}`, [3.72, 1.8, z], [0.42, 3.6, CORRIDOR_SEGMENT_LENGTH + 0.08], segment % 4 === 0 ? materials.concrete : materials.wall, { cast: false });
      addBox(`ceiling-rib-${segment}`, [0, 3.48, z - CORRIDOR_SEGMENT_LENGTH / 2], [7.4, 0.18, 0.24], materials.rust);

      const puddle = new THREE.Mesh(
        new THREE.CircleGeometry(0.45 + (segment % 3) * 0.18, 24),
        materials.glass.clone(),
      );
      puddle.name = `puddle-${segment}`;
      puddle.scale.x = 1.8 + (segment % 2) * 0.7;
      puddle.rotation.x = -Math.PI / 2;
      puddle.position.set(((segment * 1.73) % 3.2) - 1.6, 0.015, z + 1.25);
      puddle.receiveShadow = true;
      world.add(puddle);

      if ((segment > 0 && segment % 3 === 2) || (authoringTarget && segment === authoredSegment)) {
        const descriptor = authoringTarget && segment === authoredSegment
          ? createAuthoredCorridorSetPiece(
              authoringTarget.setPieceKind,
              authoringTarget.districtId,
              segment,
              z,
              authoringTarget.side ?? -1,
            )
          : createCorridorSetPiece(snapshot.corridor.routeSeed, segment, z);
        const prefab = prefabRegistry[descriptor.kind];
        prefab.build(descriptor, materials);
        for (const prop of descriptor.props) {
          if (prefab.consumedPropKinds.includes(prop.kind)) continue;
          buildProp(prop, materials);
        }
      }
      segmentGroups.set(segment, captureWorldGroup(`corridor-segment-${segment}`, existing));
    }

    if (overlayGroup) removeWorldGroup(overlayGroup);
    const overlayExisting = new Set(world.children);
    const overlayMaterials = createMaterials(activeDistrict);
    const routeMarkerZ = corridorSegmentCenter(activeSegment + 2);
    const warning = addBox(`route-stripe-${activeSegment}`, [0, 0.018, routeMarkerZ], [5.1, 0.025, 0.22], overlayMaterials.paper, { cast: false });
    warning.rotation.y = -0.04;
    buildProp({ id: "offering-altar", kind: "altar", position: { x: 2.68, y: 0, z: routeMarkerZ + 1.5 } }, overlayMaterials);
    overlayGroup = captureWorldGroup(`corridor-overlay-${activeSegment}`, overlayExisting);
    routeLight.color.setHex(activeDistrict.lightColor);
  }

  function resize(): void {
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    const pixelRatio = Math.min(window.devicePixelRatio, 1.75);
    const renderWidth = Math.floor(width * pixelRatio);
    const renderHeight = Math.floor(height * pixelRatio);
    if (canvas.width !== renderWidth || canvas.height !== renderHeight) {
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    }
  }

  const render = (snapshot: HorrorCorridorV2Snapshot): void => {
    if (disposed) return;
    resize();

    const party = snapshot.party;
    const activeSegment = corridorSegmentIndex(party.position.z);
    const windowKey = `${snapshot.corridor.chamberId}:${activeSegment}:${authoringTarget?.districtId ?? ""}:${authoringTarget?.setPieceKind ?? ""}`;
    if (windowKey !== builtWindowKey) buildCorridorWindow(snapshot, activeSegment);
    const dread = snapshot.dread;
    const illumination = snapshot.corridor.illumination;
    camera.position.set(party.position.x, party.position.y, party.position.z);
    camera.rotation.set(party.pitch, party.yaw, 0, "YXZ");
    if (dread.phase === "jumpscare") {
      const shake = Math.sin(snapshot.simTimeMs * 0.064) * 0.055;
      camera.position.x += shake;
      camera.position.y += Math.cos(snapshot.simTimeMs * 0.047) * 0.035;
    }

    camera.getWorldDirection(scratch);
    flashlight.position.copy(camera.position).addScaledVector(scratch, 0.18);
    flashlightTarget.position.copy(camera.position).addScaledVector(scratch, 8);
    flashlight.visible = party.flashlight.effectiveOn;
    flashlight.intensity = party.flashlight.effectiveOn ? 74 * illumination.intensity + 22 : 0;
    flashlightFill.position.copy(camera.position).addScaledVector(scratch, 0.5);
    flashlightFill.position.y -= 0.48;
    flashlightFill.intensity = party.flashlight.effectiveOn ? 5 + illumination.intensity * 8 : 0;

    entranceFill.position.set(party.position.x - 1.8, 2.65, party.position.z + 5.5);
    routeLight.position.set(0, 2.45, corridorSegmentCenter(activeSegment + 2));
    redLampA.position.set(-2.9, 2.75, corridorSegmentCenter(activeSegment + 1));
    redLampB.position.set(2.8, 2.65, corridorSegmentCenter(activeSegment + 3));
    altarGlow.position.set(2.68, 1.1, corridorSegmentCenter(activeSegment + 2) + 1.5);

    ambient.intensity = 1.25 + illumination.intensity * 1.15;
    entranceFill.intensity = 38 + illumination.intensity * 28;
    routeLight.intensity = 28 + illumination.greenShift * 42;
    redLampA.intensity = illumination.mode === "flicker" ? 5 : 15;
    redLampB.intensity = illumination.mode === "blackout" ? 0.5 : 10;
    (scene.fog as THREE.Fog).color.copy(fogBase).lerp(fogGreen, illumination.greenShift);
    scene.background = (scene.fog as THREE.Fog).color.clone().multiplyScalar(0.34);

    const monsterVisible = Boolean(dread.monsterId && !["dormant", "sign", "resolved"].includes(dread.phase));
    monster.group.visible = monsterVisible;
    if (monsterVisible && dread.monsterId) {
      const displayDistance = dread.phase === "jumpscare"
        ? 0.72
        : dread.phase === "last-chance"
          ? Math.max(3.8, dread.distanceMeters)
          : Math.max(1.2, dread.distanceMeters);
      monster.group.position.set(
        party.position.x - Math.sin(dread.bearingRadians) * displayDistance,
        0,
        party.position.z - Math.cos(dread.bearingRadians) * displayDistance,
      );
      monster.group.rotation.y = dread.bearingRadians + Math.PI;
      const profile = MONSTERS_BY_ID[dread.monsterId];
      applyMonsterSilhouette(monster, profile);
      monster.skin.color.setHex(profile.color);
      monster.skin.emissive.setHex(dread.phase === "repelling" || snapshot.corridor.beam.contact ? 0x173b24 : 0x020302);
      monster.skin.emissiveIntensity = snapshot.corridor.beam.contact ? 1.2 : 0.12;
      monster.eyeMaterial.emissiveIntensity = snapshot.corridor.beam.contact ? 4.2 : dread.phase === "last-chance" ? 2.1 : 0.35;
      monsterRim.position.copy(monster.group.position);
      monsterRim.position.y = 2.1;
      monsterRim.position.x += Math.sin(dread.bearingRadians) * 0.8;
      monsterRim.position.z += Math.cos(dread.bearingRadians) * 0.8;
      monsterRim.intensity = dread.phase === "last-chance" ? 13 : snapshot.corridor.beam.contact ? 18 : 3.5;
      const scale = dread.phase === "jumpscare" ? 1.55 : 0.94 + dread.threat * 0.18;
      monster.group.scale.setScalar(scale);
      monster.head.rotation.z = Math.sin(snapshot.simTimeMs * 0.0017) * 0.08;
      monster.arms.forEach((arm, index) => {
        arm.rotation.x = Math.sin(snapshot.simTimeMs * 0.0023 + index * Math.PI) * (0.035 + dread.threat * 0.055);
      });
    } else {
      monsterRim.intensity = 0;
    }

    altarGlow.intensity = snapshot.corridor.offering ? 18 : 0;
    const altar = world.getObjectByName("offering-altar");
    if (altar) altar.visible = Boolean(snapshot.corridor.offering);
    for (const rotor of fanRotors) rotor.rotation.z = snapshot.simTimeMs * 0.00125;
    renderer.render(scene, camera);
  };

  return Object.freeze({
    ready: true,
    render,
    configureAuthoring(target: ThreeSceneAuthoringTarget | null) {
      authoringTarget = target;
      builtWindowKey = "";
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      clearWorld();
      monster.group.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        disposeMaterial(object.material);
      });
      for (const maps of surfaceMapCache.values()) {
        maps.color.dispose();
        maps.relief.dispose();
      }
      surfaceMapCache.clear();
      tavernSignTexture?.dispose();
      tavernSignTexture = null;
      pantrySignTexture?.dispose();
      pantrySignTexture = null;
      nurserySignTexture?.dispose();
      nurserySignTexture = null;
      clinicSignTexture?.dispose();
      clinicSignTexture = null;
      laundrySignTexture?.dispose();
      laundrySignTexture = null;
      pilgrimSignTexture?.dispose();
      pilgrimSignTexture = null;
      boilerSignTexture?.dispose();
      boilerSignTexture = null;
      archiveSignTexture?.dispose();
      archiveSignTexture = null;
      ticketSignTexture?.dispose();
      ticketSignTexture = null;
      dormitorySignTexture?.dispose();
      dormitorySignTexture = null;
      mortuarySignTexture?.dispose();
      mortuarySignTexture = null;
      renderer.dispose();
    },
  });
}

function createMonsterFigure() {
  const group = new THREE.Group();
  group.name = "dread-monster";
  const skin = new THREE.MeshStandardMaterial({
    color: 0x758178,
    roughness: 0.96,
    metalness: 0.02,
    emissive: 0x020302,
  });
  const voidMaterial = new THREE.MeshStandardMaterial({ color: 0x010201, roughness: 1 });
  const clothMaterial = new THREE.MeshStandardMaterial({ color: 0x101712, roughness: 1, metalness: 0.02, side: THREE.DoubleSide });
  const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0xbaffca, emissive: 0x5cff89, emissiveIntensity: 0.35, roughness: 0.22 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 1.45, 5, 10), skin);
  torso.position.y = 1.55;
  torso.scale.set(0.78, 1.28, 0.56);
  torso.castShadow = true;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.33, 16, 12), skin);
  head.name = "monster-head";
  head.position.set(0, 2.82, 0.02);
  head.scale.set(0.83, 1.22, 0.76);
  head.castShadow = true;
  group.add(head);
  const cloak = new THREE.Mesh(new THREE.ConeGeometry(0.74, 2.35, 9, 2, true), clothMaterial);
  cloak.name = "monster-cloak";
  cloak.position.set(0, 1.25, 0.08);
  cloak.castShadow = true;
  group.add(cloak);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.34), voidMaterial);
  face.position.set(0, -0.02, -0.325);
  face.rotation.y = Math.PI;
  head.add(face);
  const eyes: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.027, 8, 6), eyeMaterial);
    eye.position.set(side * 0.075, 0.035, -0.337);
    head.add(eye);
    eyes.push(eye);
  }
  const shoulders: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), clothMaterial);
    shoulder.position.set(side * 0.42, 2.1, 0);
    shoulder.scale.set(1.25, 0.68, 0.82);
    shoulder.castShadow = true;
    group.add(shoulder);
    shoulders.push(shoulder);
  }
  const arms: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 1.72, 4, 8), skin);
    arm.position.set(side * 0.52, 1.32, 0);
    arm.rotation.z = side * -0.08;
    arm.castShadow = true;
    group.add(arm);
    arms.push(arm);
  }
  group.visible = false;
  return { group, skin, torso, head, face, eyes, eyeMaterial, cloak, shoulders, arms };
}

function applyMonsterSilhouette(monster: ReturnType<typeof createMonsterFigure>, profile: MonsterProfile): void {
  monster.torso.rotation.set(0, 0, 0);
  monster.torso.position.set(0, 1.55, 0);
  monster.torso.scale.set(0.78, 1.28, 0.56);
  monster.head.position.set(0, 2.82, 0.02);
  monster.head.scale.set(0.83, 1.22, 0.76);
  monster.face.scale.set(1, 1, 1);
  monster.cloak.position.set(0, 1.25, 0.08);
  monster.cloak.rotation.set(0, 0, 0);
  monster.cloak.scale.set(1, 1, 1);
  monster.shoulders.forEach((shoulder, index) => {
    shoulder.position.set(index === 0 ? -0.42 : 0.42, 2.1, 0);
    shoulder.scale.set(1.25, 0.68, 0.82);
  });
  monster.arms.forEach((arm, index) => {
    const side = index === 0 ? -1 : 1;
    arm.position.set(side * 0.52, 1.32, 0);
    arm.rotation.set(0, 0, side * -0.08);
    arm.scale.set(1, 1, 1);
  });

  if (profile.silhouette === "elongated") {
    monster.torso.scale.set(0.62, 1.58, 0.46);
    monster.head.position.y = 3.18;
    monster.cloak.scale.set(0.72, 1.16, 0.72);
    monster.cloak.position.y = 1.36;
    monster.arms.forEach((arm) => arm.scale.set(0.82, 1.28, 0.82));
  } else if (profile.silhouette === "hunched") {
    monster.torso.rotation.x = 0.24;
    monster.torso.scale.set(0.94, 1.02, 0.82);
    monster.head.position.set(0, 2.48, -0.34);
    monster.head.scale.set(1.05, 0.86, 0.94);
    monster.cloak.rotation.x = 0.18;
    monster.cloak.scale.set(1.08, 0.88, 1.18);
  } else if (profile.silhouette === "broad") {
    monster.torso.scale.set(1.28, 1.04, 0.74);
    monster.head.position.y = 2.64;
    monster.head.scale.set(1.16, 0.96, 0.9);
    monster.cloak.scale.set(1.28, 0.92, 0.9);
    monster.shoulders.forEach((shoulder) => shoulder.scale.multiplyScalar(1.28));
    monster.arms.forEach((arm) => arm.position.x *= 1.38);
  } else if (profile.silhouette === "veiled") {
    monster.torso.scale.set(0.92, 1.35, 0.72);
    monster.head.scale.set(1.5, 1.42, 0.74);
    monster.cloak.scale.set(1.2, 1.12, 1.08);
    monster.face.scale.set(0.55, 1.45, 1);
  } else if (profile.silhouette === "crooked") {
    monster.torso.rotation.z = 0.14;
    monster.head.position.x = 0.18;
    monster.cloak.rotation.z = 0.1;
    monster.arms[0].scale.set(0.8, 1.42, 0.8);
    monster.arms[1].scale.set(1.1, 0.76, 1.1);
  } else {
    monster.torso.scale.set(0.7, 1.22, 0.42);
    monster.head.scale.set(0.72, 1.45, 0.62);
    monster.cloak.scale.set(0.78, 1.08, 0.66);
    monster.face.scale.set(1.42, 1.75, 1);
  }
}
