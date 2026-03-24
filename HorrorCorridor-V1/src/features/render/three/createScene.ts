import { Color, FogExp2, Scene } from "three";

export const createScene = (): Scene => {
  const scene = new Scene();

  scene.background = new Color(0x0f0f15);
  scene.fog = new FogExp2(0x0f0f15, 0.04);

  return scene;
};
