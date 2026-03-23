import {
  BoxGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  Object3D,
  PointLight,
  Scene,
  SphereGeometry,
  Vector3,
  type Material,
} from "three";

import { CELL_SIZE, WALL_HEIGHT } from "@/lib/constants";
import { CUBE_COLORS, type CubeColorHex } from "@/lib/colors";
import type { MazeResult, MazeCube } from "@/features/maze/domain/mazeTypes";
import type { ReplicatedGameSnapshot } from "@/types/shared";

import { createLights } from "./createLights";
import { createMaterials } from "./createMaterials";

export type MazeWorldFrame = Readonly<{
  snapshot: ReplicatedGameSnapshot | null;
  localPlayerId: string | null;
}>;

export type MazeWorld = Readonly<{
  root: Group;
  attach: (scene: Scene) => void;
  update: (elapsedMs: number, frame?: MazeWorldFrame) => void;
  dispose: () => void;
}>;

type MazeStaticLayer = Group &
  Readonly<{
    update: (elapsedMs: number) => void;
    dispose: () => void;
  }>;

const toWorldCellPosition = (gridX: number, gridY: number): Vector3 =>
  new Vector3(gridX * CELL_SIZE + CELL_SIZE / 2, 0, gridY * CELL_SIZE + CELL_SIZE / 2);

const cubeHexByName: ReadonlyMap<string, CubeColorHex> = new Map(
  CUBE_COLORS.map((color) => [color.name, color.hex] as const),
);
const defaultCubeHex: CubeColorHex = CUBE_COLORS[1].hex;

const disposeObject = (object: Object3D, skipMaterials: ReadonlySet<Material> = new Set()): void => {
  const disposedMaterials = new Set<Material>();

  object.traverse((child) => {
    const mesh = child as Mesh & {
      geometry?: { dispose: () => void };
      material?: Material | Material[];
    };

    if (mesh.geometry && typeof mesh.geometry.dispose === "function") {
      mesh.geometry.dispose();
    }

    const material = mesh.material;
    if (Array.isArray(material)) {
      for (const entry of material) {
        if (
          typeof entry.dispose === "function" &&
          !disposedMaterials.has(entry) &&
          !skipMaterials.has(entry)
        ) {
          disposedMaterials.add(entry);
          entry.dispose();
        }
      }
    } else if (
      material &&
      typeof material.dispose === "function" &&
      !disposedMaterials.has(material) &&
      !skipMaterials.has(material)
    ) {
      disposedMaterials.add(material);
      material.dispose();
    }
  });
};

const countCells = (maze: MazeResult, predicate: (value: number) => boolean): number => {
  let total = 0;

  for (const row of maze.grid) {
    for (const cell of row) {
      if (predicate(cell)) {
        total += 1;
      }
    }
  }

  return total;
};

const buildInstancedLayer = (
  geometry: BoxGeometry,
  count: number,
  material: Material,
  name: string,
): InstancedMesh => {
  const mesh = new InstancedMesh(geometry, material, Math.max(count, 1));
  mesh.instanceMatrix.setUsage(35044);
  mesh.name = name;
  return mesh;
};

const setInstanceMatrix = (
  mesh: InstancedMesh,
  index: number,
  position: Readonly<{ x: number; y: number; z: number }>,
  scale = 1,
): void => {
  const matrix = new Matrix4();
  matrix.compose(
    position as Vector3,
    new Object3D().quaternion,
    new Vector3(scale, scale, scale),
  );
  mesh.setMatrixAt(index, matrix);
};

const buildMazeStaticLayer = (
  maze: MazeResult,
  materials: ReturnType<typeof createMaterials>,
  lights: ReturnType<typeof createLights>,
): MazeStaticLayer => {
  const staticGroup = new Group();
  staticGroup.name = "maze-static";
  const wallGeometry = new BoxGeometry(CELL_SIZE, WALL_HEIGHT, CELL_SIZE);
  const floorGeometry = new BoxGeometry(CELL_SIZE, 0.08, CELL_SIZE);
  const ceilingGeometry = new BoxGeometry(CELL_SIZE, 0.08, CELL_SIZE);

  const walkableCount = countCells(maze, (value) => value !== 0);
  const wallCount = countCells(maze, (value) => value === 0);

  const floorLayer = buildInstancedLayer(floorGeometry, walkableCount, materials.floor, "maze-floor");
  const ceilingLayer = buildInstancedLayer(
    ceilingGeometry,
    walkableCount,
    materials.ceiling,
    "maze-ceiling",
  );
  const wallLayer = buildInstancedLayer(wallGeometry, wallCount, materials.wall, "maze-walls");

  let floorIndex = 0;
  let ceilingIndex = 0;
  let wallIndex = 0;

  for (let y = 0; y < maze.grid.length; y += 1) {
    for (let x = 0; x < maze.grid[y].length; x += 1) {
      const cell = maze.grid[y][x];
      const position = toWorldCellPosition(x, y);

      if (cell === 0) {
        setInstanceMatrix(wallLayer, wallIndex, {
          x: position.x,
          y: WALL_HEIGHT / 2,
          z: position.z,
        });
        wallIndex += 1;
        continue;
      }

      setInstanceMatrix(floorLayer, floorIndex, {
        x: position.x,
        y: 0.04,
        z: position.z,
      });
      setInstanceMatrix(ceilingLayer, ceilingIndex, {
        x: position.x,
        y: WALL_HEIGHT - 0.04,
        z: position.z,
      });
      floorIndex += 1;
      ceilingIndex += 1;
    }
  }

  floorLayer.count = floorIndex;
  ceilingLayer.count = ceilingIndex;
  wallLayer.count = wallIndex;
  floorLayer.instanceMatrix.needsUpdate = true;
  ceilingLayer.instanceMatrix.needsUpdate = true;
  wallLayer.instanceMatrix.needsUpdate = true;

  const startCell = toWorldCellPosition(maze.start.x, maze.start.y);
  const endCell = toWorldCellPosition(maze.end.x, maze.end.y);

  const startGlowMaterial = materials.glow.clone();
  const endGlowMaterial = materials.glow.clone();

  const startMarker = new Mesh(
    new BoxGeometry(CELL_SIZE * 0.58, 0.12, CELL_SIZE * 0.58),
    startGlowMaterial,
  );
  startMarker.name = "maze-start-marker";
  startMarker.position.set(startCell.x, 0.08, startCell.z);

  const startLight = new PointLight(0x8cff98, 2.65, 18, 2.15);
  startLight.position.set(startCell.x, WALL_HEIGHT * 0.7, startCell.z);

  const endOrb = new Mesh(new SphereGeometry(CELL_SIZE * 0.16, 14, 14), materials.glow.clone());
  endOrb.name = "maze-end-orb";
  endOrb.position.set(endCell.x, WALL_HEIGHT * 0.62, endCell.z);

  const endLight = new PointLight(0xb0ff8f, 2.8, 18, 2);
  endLight.position.set(endCell.x, WALL_HEIGHT * 0.7, endCell.z);

  const pedestalOffsets = [
    [-CELL_SIZE * 0.55, 0],
    [CELL_SIZE * 0.55, 0],
    [0, CELL_SIZE * 0.55],
  ] as const;

  const pedestalGroup = new Group();
  pedestalGroup.name = "maze-pedestals";

  for (const [offsetX, offsetZ] of pedestalOffsets) {
    const pedestal = new Mesh(
      new BoxGeometry(CELL_SIZE * 0.24, WALL_HEIGHT * 0.42, CELL_SIZE * 0.24),
      materials.pedestal,
    );
    pedestal.position.set(endCell.x + offsetX, WALL_HEIGHT * 0.21, endCell.z + offsetZ);
    pedestalGroup.add(pedestal);
  }

  const guideGroup = new Group();
  guideGroup.name = "maze-guide-paths";
  const guideSampleSpacing = 6;

  for (const path of Object.values(maze.paths)) {
    for (let index = 0; index < path.length; index += guideSampleSpacing) {
      const node = path[index];
      const guideNode = new Mesh(
        new SphereGeometry(CELL_SIZE * 0.06, 6, 6),
        materials.guide,
      );
      guideNode.position.set(
        node.x * CELL_SIZE + CELL_SIZE / 2,
        0.22 + Math.sin(index * 0.2) * 0.02,
        node.y * CELL_SIZE + CELL_SIZE / 2,
      );
      guideGroup.add(guideNode);
    }
  }

  const endHalo = new Mesh(new SphereGeometry(CELL_SIZE * 0.28, 16, 16), endGlowMaterial);
  endHalo.position.set(endCell.x, WALL_HEIGHT * 0.56, endCell.z);

  staticGroup.add(floorLayer);
  staticGroup.add(ceilingLayer);
  staticGroup.add(wallLayer);
  staticGroup.add(startMarker);
  staticGroup.add(startLight);
  staticGroup.add(endOrb);
  staticGroup.add(endLight);
  staticGroup.add(endHalo);
  staticGroup.add(pedestalGroup);
  staticGroup.add(guideGroup);

  const extraMaterials: Material[] = [startGlowMaterial, endGlowMaterial];

  return Object.assign(staticGroup, {
    dispose: () => {
      disposeObject(staticGroup);
      for (const material of extraMaterials) {
        material.dispose();
      }
      materials.dispose();
    },
    update: (elapsedMs: number) => {
      lights.update(elapsedMs);
      endLight.intensity = 2.2 + Math.sin(elapsedMs * 0.0023) * 0.28;
      endGlowMaterial.opacity = 0.55 + Math.sin(elapsedMs * 0.0031) * 0.08;
      startGlowMaterial.opacity = 0.75 + Math.sin(elapsedMs * 0.0041) * 0.08;
    },
  });
};

const createCubeMesh = (cube: MazeCube, materials = createMaterials()): Mesh => {
  const cubeMaterial = materials.cube.clone();
  cubeMaterial.color.setHex(cube.colorHex);
  cubeMaterial.emissive.setHex(cube.colorHex);
  cubeMaterial.emissiveIntensity = 0.55;

  const mesh = new Mesh(
    new BoxGeometry(CELL_SIZE * 0.42, CELL_SIZE * 0.42, CELL_SIZE * 0.42),
    cubeMaterial,
  );
  mesh.name = cube.id;
  mesh.position.set(cube.x, CELL_SIZE * 0.28, cube.z);
  mesh.userData.cubeId = cube.id;
  return mesh;
};

export const buildMazeWorld = (maze: MazeResult): MazeWorld => {
  const root = new Group();
  root.name = "maze-world";

  const materials = createMaterials();
  const lights = createLights();
  const staticLayer = buildMazeStaticLayer(maze, materials, lights);

  const cubeGroup = new Group();
  cubeGroup.name = "maze-cubes";

  const playerGroup = new Group();
  playerGroup.name = "maze-players";

  const oozeGeometry = new SphereGeometry(CELL_SIZE * 0.08, 8, 8);
  const oozeMesh = new InstancedMesh(oozeGeometry, materials.ooze, Math.max(maze.cubes.length, 800));
  oozeMesh.name = "maze-ooze";
  oozeMesh.count = 0;

  const cubeMeshes = new Map<string, Mesh>();
  const playerMeshes = new Map<string, Mesh>();

  for (const cube of maze.cubes) {
    const mesh = createCubeMesh(cube, materials);
    cubeMeshes.set(cube.id, mesh);
    cubeGroup.add(mesh);
  }

  root.add(staticLayer);
  root.add(cubeGroup);
  root.add(playerGroup);
  root.add(oozeMesh);
  root.add(lights.group);

  const syncCubeMeshes = (snapshot: ReplicatedGameSnapshot["cubes"]): void => {
    for (const cube of snapshot) {
      let mesh = cubeMeshes.get(cube.id);

      if (!mesh) {
        mesh = createCubeMesh(
          {
            id: cube.id,
            colorName: cube.color,
            colorHex: cubeHexByName.get(cube.color) ?? defaultCubeHex,
            x: cube.position.x,
            z: cube.position.z,
            state: "ground",
            ownerId: null,
          },
          materials,
        );
        cubeMeshes.set(cube.id, mesh);
        cubeGroup.add(mesh);
      }

      mesh.visible = cube.visible;
      mesh.position.set(cube.position.x, cube.position.y, cube.position.z);
      mesh.rotation.y = cube.locked ? Math.PI * 0.25 : 0;
      mesh.scale.setScalar(cube.visible ? 1 : 0.001);
    }
  };

  const syncPlayerMeshes = (
    snapshot: ReplicatedGameSnapshot["players"],
    localPlayerId: string | null,
  ): void => {
    const activeIds = new Set<string>();

    for (const player of snapshot) {
      if (player.id === localPlayerId) {
        continue;
      }

      activeIds.add(player.id);
      let mesh = playerMeshes.get(player.id);

      if (!mesh) {
        mesh = new Mesh(
          new BoxGeometry(CELL_SIZE * 0.28, 1.65, CELL_SIZE * 0.28),
          materials.player,
        );
        mesh.name = `player-${player.id}`;
        playerMeshes.set(player.id, mesh);
        playerGroup.add(mesh);
      }

      mesh.visible = player.isAlive;
      mesh.position.set(player.position.x, 0.82 + (player.crouching ? -0.25 : 0), player.position.z);
      mesh.rotation.y = player.rotationY;
      mesh.scale.setScalar(player.isAlive ? 1 : 0.001);
    }

    for (const [playerId, mesh] of playerMeshes) {
      if (activeIds.has(playerId)) {
        continue;
      }

      mesh.visible = false;
      mesh.scale.setScalar(0.001);
    }
  };

  const syncOozeTrail = (snapshot: ReplicatedGameSnapshot["oozeTrail"]): void => {
    let index = 0;

    for (const ooze of snapshot) {
      const position = new Vector3(ooze.x, ooze.y, ooze.z);
      const matrix = new Matrix4();
      matrix.compose(position, new Object3D().quaternion, new Vector3(ooze.scale, ooze.scale, ooze.scale));
      oozeMesh.setMatrixAt(index, matrix);
      index += 1;
    }

    oozeMesh.count = index;
    oozeMesh.instanceMatrix.needsUpdate = true;
  };

  return {
    root,
    attach: (scene) => {
      scene.add(root);
    },
    update: (elapsedMs, frame) => {
      staticLayer.update(elapsedMs);

      const snapshot = frame?.snapshot;
      if (snapshot) {
        syncCubeMeshes(snapshot.cubes);
        syncPlayerMeshes(snapshot.players, frame?.localPlayerId ?? null);
        syncOozeTrail(snapshot.oozeTrail);
      }
    },
    dispose: () => {
      if (root.parent) {
        root.parent.remove(root);
      }

      disposeObject(
        root,
        new Set<Material>([
          materials.floor,
          materials.ceiling,
          materials.wall,
          materials.trim,
          materials.endWall,
          materials.glow,
          materials.pedestal,
          materials.cube,
          materials.player,
          materials.guide,
          materials.ooze,
        ]),
      );
      materials.dispose();
    },
  };
};
