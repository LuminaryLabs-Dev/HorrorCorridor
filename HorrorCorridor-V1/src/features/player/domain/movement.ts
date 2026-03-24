import { MOVE_SPEED, PLAYER_RADIUS as PROTOTYPE_PLAYER_RADIUS } from "@/lib/constants";
import type { WorldPosition } from "@/types/shared";

import type { PlayerInputState } from "./input";
import type { PlayerViewAngles } from "./cameraLook";

export type PlayerPose = Readonly<{
  position: WorldPosition;
  rotationY: number;
  velocity: WorldPosition;
  carryingCubeId: string | null;
}>;

export type PlayerMovementResult = Readonly<{
  pose: PlayerPose;
  intendedVelocity: WorldPosition;
  speed: number;
}>;

export const PLAYER_EYE_HEIGHT = 2;
export const PLAYER_RADIUS = PROTOTYPE_PLAYER_RADIUS;
export const PLAYER_START_POSITION = Object.freeze({
  x: 0,
  y: PLAYER_EYE_HEIGHT,
  z: 0,
});

const clampFrameScale = (deltaMs: number): number =>
  Math.max(0, Math.min(deltaMs, 50)) / (1000 / 60);

const toWorldForward = (yaw: number): Readonly<{ x: number; z: number }> => ({
  x: -Math.sin(yaw),
  z: -Math.cos(yaw),
});

const toWorldRight = (yaw: number): Readonly<{ x: number; z: number }> => ({
  x: Math.cos(yaw),
  z: -Math.sin(yaw),
});

export const createPlayerPose = (position: WorldPosition = PLAYER_START_POSITION): PlayerPose => ({
  position,
  rotationY: 0,
  velocity: {
    x: 0,
    y: 0,
    z: 0,
  },
  carryingCubeId: null,
});

export const advancePlayerMovement = (
  pose: PlayerPose,
  input: PlayerInputState,
  viewAngles: PlayerViewAngles,
  deltaMs: number,
): PlayerMovementResult => {
  const frameScale = clampFrameScale(deltaMs);

  if (frameScale === 0) {
    return {
      pose,
      intendedVelocity: {
        x: 0,
        y: 0,
        z: 0,
      },
      speed: 0,
    };
  }

  const forwardInput = (input.buttons.forward ? 1 : 0) - (input.buttons.back ? 1 : 0);
  const strafeInput = (input.buttons.right ? 1 : 0) - (input.buttons.left ? 1 : 0);
  const inputMagnitude = Math.hypot(forwardInput, strafeInput);
  const speed = MOVE_SPEED * frameScale;

  const normalizedForward = inputMagnitude > 0 ? forwardInput / inputMagnitude : 0;
  const normalizedStrafe = inputMagnitude > 0 ? strafeInput / inputMagnitude : 0;

  const forward = toWorldForward(viewAngles.yaw);
  const right = toWorldRight(viewAngles.yaw);

  const intendedVelocity = {
    x: (forward.x * normalizedForward + right.x * normalizedStrafe) * speed,
    y: 0,
    z: (forward.z * normalizedForward + right.z * normalizedStrafe) * speed,
  };

  const frameSeconds = frameScale / 60;
  const velocity = {
    x: frameSeconds > 0 ? intendedVelocity.x / frameSeconds : 0,
    y: 0,
    z: frameSeconds > 0 ? intendedVelocity.z / frameSeconds : 0,
  };

  const position = {
    x: pose.position.x + intendedVelocity.x,
    y: PLAYER_EYE_HEIGHT,
    z: pose.position.z + intendedVelocity.z,
  };

  return {
    pose: {
      position,
      rotationY: viewAngles.yaw,
      velocity,
      carryingCubeId: pose.carryingCubeId,
    },
    intendedVelocity,
    speed,
  };
};
