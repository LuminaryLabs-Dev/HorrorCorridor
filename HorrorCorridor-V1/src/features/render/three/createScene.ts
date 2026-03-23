import { Color, FogExp2, Scene } from "three";

export const createScene = (): Scene => {
  const scene = new Scene();

  scene.background = new Color(0x020704);
  scene.fog = new FogExp2(0x041108, 0.015);

  return scene;
};
