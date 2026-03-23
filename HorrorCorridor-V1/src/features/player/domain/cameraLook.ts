import { MAX_PITCH, MOUSE_SENSITIVITY } from "@/lib/constants";

const TWO_PI = Math.PI * 2;
const PITCH_RETURN_RATE = 0.0025;

export type PlayerViewAngles = Readonly<{
  yaw: number;
  pitch: number;
}>;

export const createPlayerViewAngles = (yaw = 0, pitch = 0): PlayerViewAngles => ({
  yaw,
  pitch,
});

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const wrapAngle = (angle: number): number => {
  const wrapped = angle % TWO_PI;

  if (wrapped > Math.PI) {
    return wrapped - TWO_PI;
  }

  if (wrapped < -Math.PI) {
    return wrapped + TWO_PI;
  }

  return wrapped;
};

export const applyPlayerLookDelta = (
  viewAngles: PlayerViewAngles,
  deltaX: number,
  deltaY: number,
  deltaMs = 0,
): PlayerViewAngles => {
  const nextYaw = wrapAngle(viewAngles.yaw - deltaX * MOUSE_SENSITIVITY);
  const nextPitch = clamp(viewAngles.pitch + deltaY * MOUSE_SENSITIVITY, -MAX_PITCH, MAX_PITCH);

  if (deltaX !== 0 || deltaY !== 0 || deltaMs <= 0) {
    return {
      yaw: nextYaw,
      pitch: nextPitch,
    };
  }

  const settle = Math.min(Math.max(deltaMs, 0), 50) / 1000;
  const pitch =
    nextPitch < 0
      ? Math.min(0, nextPitch + settle * PITCH_RETURN_RATE)
      : Math.max(0, nextPitch - settle * PITCH_RETURN_RATE);

  return {
    yaw: nextYaw,
    pitch,
  };
};
