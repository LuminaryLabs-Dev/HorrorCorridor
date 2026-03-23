import { AmbientLight, Group, HemisphereLight, PointLight } from "three";

export type CorridorLights = Readonly<{
  group: Group;
  update: (elapsedMs: number) => void;
}>;

export const createLights = (): CorridorLights => {
  const group = new Group();

  const ambient = new AmbientLight(0x88aa8f, 0.18);
  const hemisphere = new HemisphereLight(0xb2f2bc, 0x020302, 0.38);
  const entryLight = new PointLight(0x8cff98, 1.55, 18, 2.1);
  const midLight = new PointLight(0x6c8b6f, 1.05, 14, 2.3);
  const endLight = new PointLight(0xb0ff8f, 2.6, 34, 2);
  const floorGlow = new PointLight(0x24402a, 0.58, 16, 2.8);

  ambient.position.set(0, 2.5, 0);
  hemisphere.position.set(0, 3, 0);
  entryLight.position.set(0, 2.7, 2.4);
  midLight.position.set(0, 2.65, -7.5);
  endLight.position.set(0, 2.7, -24);
  floorGlow.position.set(0, 0.9, -10);

  group.add(ambient);
  group.add(hemisphere);
  group.add(entryLight);
  group.add(midLight);
  group.add(endLight);
  group.add(floorGlow);

  return {
    group,
    update: (elapsedMs) => {
      const pulse = 0.5 + Math.sin(elapsedMs * 0.0022) * 0.5;
      const shimmer = 0.5 + Math.sin(elapsedMs * 0.0037 + 0.7) * 0.5;

      entryLight.intensity = 1.05 + pulse * 0.24;
      midLight.intensity = 0.55 + shimmer * 0.2;
      endLight.intensity = 1.7 + pulse * 0.32 + shimmer * 0.16;
      floorGlow.intensity = 0.35 + shimmer * 0.1;
    },
  };
};
