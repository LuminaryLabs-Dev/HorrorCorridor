import { PerspectiveCamera } from "three";

export type CameraSurface = Readonly<{
  aspect: number;
}>;

export const createCamera = (surface?: CameraSurface): PerspectiveCamera => {
  const camera = new PerspectiveCamera(72, surface?.aspect ?? 1, 0.05, 1000);

  camera.position.set(0, 1.45, 0);
  camera.rotation.order = "YXZ";

  return camera;
};
