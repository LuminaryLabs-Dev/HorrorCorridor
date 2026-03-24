import {
  MeshBasicMaterial,
  MeshLambertMaterial,
  type Material,
} from "three";

export type CorridorMaterials = Readonly<{
  floor: MeshLambertMaterial;
  branchFloor: MeshLambertMaterial;
  ceiling: MeshLambertMaterial;
  wall: MeshLambertMaterial;
  trim: MeshLambertMaterial;
  endWall: MeshLambertMaterial;
  glow: MeshBasicMaterial;
  pedestal: MeshLambertMaterial;
  cube: MeshLambertMaterial;
  player: MeshLambertMaterial;
  guide: MeshBasicMaterial;
  ooze: MeshBasicMaterial;
  dispose: () => void;
}>;

export const createMaterials = (): CorridorMaterials => {
  const floor = new MeshLambertMaterial({
    color: 0x183020,
  });

  const branchFloor = new MeshLambertMaterial({
    color: 0x1a1a20,
  });

  const ceiling = new MeshLambertMaterial({
    color: 0x0a0a0e,
  });

  const wall = new MeshLambertMaterial({
    color: 0x2a2a35,
  });

  const trim = new MeshLambertMaterial({
    color: 0x355842,
  });

  const endWall = new MeshLambertMaterial({
    color: 0x11161a,
  });

  const glow = new MeshBasicMaterial({
    color: 0x8cff98,
    transparent: true,
    opacity: 0.9,
    toneMapped: false,
  });

  const pedestal = new MeshLambertMaterial({
    color: 0x333340,
  });

  const cube = new MeshLambertMaterial({
    color: 0x243526,
    emissive: 0x17361f,
    emissiveIntensity: 0.72,
  });

  const player = new MeshLambertMaterial({
    color: 0x32473a,
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
      branchFloor,
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
    branchFloor,
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
