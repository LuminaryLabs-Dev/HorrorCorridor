import {
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Material,
} from "three";

export type CorridorMaterials = Readonly<{
  floor: MeshStandardMaterial;
  ceiling: MeshStandardMaterial;
  wall: MeshStandardMaterial;
  trim: MeshStandardMaterial;
  endWall: MeshStandardMaterial;
  glow: MeshBasicMaterial;
  pedestal: MeshStandardMaterial;
  cube: MeshStandardMaterial;
  player: MeshStandardMaterial;
  guide: MeshBasicMaterial;
  ooze: MeshBasicMaterial;
  dispose: () => void;
}>;

export const createMaterials = (): CorridorMaterials => {
  const floor = new MeshStandardMaterial({
    color: 0x18211b,
    roughness: 1,
    metalness: 0.01,
  });

  const ceiling = new MeshStandardMaterial({
    color: 0x101511,
    roughness: 1,
    metalness: 0.01,
  });

  const wall = new MeshStandardMaterial({
    color: 0x1b2a21,
    roughness: 1,
    metalness: 0.01,
  });

  const trim = new MeshStandardMaterial({
    color: 0x355842,
    roughness: 0.9,
    metalness: 0.02,
  });

  const endWall = new MeshStandardMaterial({
    color: 0x070b08,
    roughness: 1,
    metalness: 0,
  });

  const glow = new MeshBasicMaterial({
    color: 0x8cff98,
    transparent: true,
    opacity: 0.9,
    toneMapped: false,
  });

  const pedestal = new MeshStandardMaterial({
    color: 0x101815,
    roughness: 0.8,
    metalness: 0.05,
  });

  const cube = new MeshStandardMaterial({
    color: 0x243526,
    roughness: 0.65,
    metalness: 0.1,
    emissive: 0x17361f,
    emissiveIntensity: 0.72,
  });

  const player = new MeshStandardMaterial({
    color: 0x32473a,
    roughness: 0.7,
    metalness: 0.08,
    emissive: 0x1a3f24,
    emissiveIntensity: 0.38,
  });

  const guide = new MeshBasicMaterial({
    color: 0x88ff99,
    transparent: true,
    opacity: 0.82,
    toneMapped: false,
  });

  const ooze = new MeshBasicMaterial({
    color: 0x75ff7b,
    transparent: true,
    opacity: 0.62,
    toneMapped: false,
  });

  const dispose = (): void => {
    const materials: readonly Material[] = [
      floor,
      ceiling,
      wall,
      trim,
      endWall,
      glow,
      pedestal,
      cube,
      player,
      guide,
      ooze,
    ];
    for (const material of materials) {
      material.dispose();
    }
  };

  return {
    floor,
    ceiling,
    wall,
    trim,
    endWall,
    glow,
    pedestal,
    cube,
    player,
    guide,
    ooze,
    dispose,
  };
};
