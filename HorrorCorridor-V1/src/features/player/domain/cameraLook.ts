import { MAX_PITCH, MOUSE_SENSITIVITY } from "@/lib/constants";

const TWO_PI = Math.PI * 2;
const PITCH_RETURN_DELAY_MS = 1000;
const PITCH_RETURN_BLEND = 0.05;

export type PlayerViewAngles = Readonly<{
  yaw: number;
  pitch: number;
  lastPitchInputAtMs: number;
}>;

export const createPlayerViewAngles = (
  yaw = 0,
  pitch = 0,
  lastPitchInputAtMs = 0,
): PlayerViewAngles => ({
  yaw,
  pitch,
  lastPitchInputAtMs,
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
  nowMs = 0,
): PlayerViewAngles => {
  const nextYaw = wrapAngle(viewAngles.yaw - deltaX * MOUSE_SENSITIVITY);

  if (deltaY !== 0) {
    return {
      yaw: nextYaw,
      pitch: clamp(viewAngles.pitch - deltaY * MOUSE_SENSITIVITY, -MAX_PITCH, MAX_PITCH),
      lastPitchInputAtMs: nowMs,
    };
  }

  if (nowMs - viewAngles.lastPitchInputAtMs <= PITCH_RETURN_DELAY_MS) {
    return {
      yaw: nextYaw,
      pitch: viewAngles.pitch,
      lastPitchInputAtMs: viewAngles.lastPitchInputAtMs,
    };
  }

  return {
    yaw: nextYaw,
    pitch: viewAngles.pitch + (0 - viewAngles.pitch) * PITCH_RETURN_BLEND,
    lastPitchInputAtMs: viewAngles.lastPitchInputAtMs,
  };
};
