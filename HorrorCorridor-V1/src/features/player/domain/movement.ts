import {
  MOVE_SPEED,
  PLAYER_RADIUS as PROTOTYPE_PLAYER_RADIUS,
  TURN_SPEED,
} from "@/lib/constants";
import type { WorldPosition } from "@/types/shared";

import type { PlayerInputState } from "./input";
import type { PlayerViewAngles } from "./cameraLook";

export type PlayerPose = Readonly<{
  position: WorldPosition;
  rotationY: number;
  velocity: WorldPosition;
  grounded: boolean;
  crouching: boolean;
  carryingCubeId: string | null;
}>;

export type PlayerMovementResult = Readonly<{
  pose: PlayerPose;
  intendedVelocity: WorldPosition;
  speed: number;
}>;

export const PLAYER_EYE_HEIGHT = 1.45;
export const PLAYER_CROUCH_EYE_HEIGHT = 1.12;
export const PLAYER_RADIUS = PROTOTYPE_PLAYER_RADIUS;
export const PLAYER_START_POSITION = Object.freeze({
  x: 0,
  y: PLAYER_EYE_HEIGHT,
  z: 0,
});

const clampDt = (deltaMs: number): number => Math.max(0, Math.min(deltaMs, 50));

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
  grounded: true,
  crouching: false,
  carryingCubeId: null,
});

export const advancePlayerMovement = (
  pose: PlayerPose,
  input: PlayerInputState,
  viewAngles: PlayerViewAngles,
  deltaMs: number,
): PlayerMovementResult => {
  const dt = clampDt(deltaMs) / 1000;

  if (dt === 0) {
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
  const turnInput = (input.buttons.turnRight ? 1 : 0) - (input.buttons.turnLeft ? 1 : 0);
  const inputMagnitude = Math.hypot(forwardInput, strafeInput);
  const crouching = input.buttons.crouch;
  const speedMultiplier = input.buttons.sprint ? 1.5 : 1;
  const speed = MOVE_SPEED * speedMultiplier * (crouching ? 0.55 : 1) * (dt * 60);

  const normalizedForward = inputMagnitude > 0 ? forwardInput / inputMagnitude : 0;
  const normalizedStrafe = inputMagnitude > 0 ? strafeInput / inputMagnitude : 0;

  const nextYaw = viewAngles.yaw + turnInput * TURN_SPEED * (dt * 60);
  const forward = toWorldForward(nextYaw);
  const right = toWorldRight(nextYaw);

  const intendedVelocity = {
    x: (forward.x * normalizedForward + right.x * normalizedStrafe) * MOVE_SPEED * speedMultiplier,
    y: 0,
    z: (forward.z * normalizedForward + right.z * normalizedStrafe) * MOVE_SPEED * speedMultiplier,
  };

  const velocity = {
    x: intendedVelocity.x / dt,
    y: 0,
    z: intendedVelocity.z / dt,
  };

  const position = {
    x: pose.position.x + intendedVelocity.x * (dt * 60),
    y: crouching ? PLAYER_CROUCH_EYE_HEIGHT : PLAYER_EYE_HEIGHT,
    z: pose.position.z + intendedVelocity.z * (dt * 60),
  };

  return {
    pose: {
      position,
      rotationY: nextYaw,
      velocity,
      grounded: true,
      crouching,
      carryingCubeId: pose.carryingCubeId,
    },
    intendedVelocity,
    speed,
  };
};
