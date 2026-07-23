import type { PartySnapshot, SemanticInput } from "../contracts";
import { clamp, normalizeAngle } from "../composition/determinism";

export type MotionResolver = (position: PartySnapshot["position"]) => PartySnapshot["position"];

type PartyState = {
  explorerId: string;
  name: string;
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  yaw: number;
  pitch: number;
  flashlight: { intentOn: boolean; effectiveOn: boolean; charge: number };
  condition: PartySnapshot["condition"];
};

function initialState(explorerId: string): PartyState {
  return {
    explorerId,
    name: "The Listener",
    position: { x: 0, y: 1.68, z: 4 },
    velocity: { x: 0, y: 0, z: 0 },
    yaw: 0,
    pitch: -0.03,
    flashlight: { intentOn: true, effectiveOn: true, charge: 1 },
    condition: "ready",
  };
}

export type PartyDomain = ReturnType<typeof createPartyDomain>;

export function createPartyDomain(explorerId: string) {
  let state = initialState(explorerId);

  const snapshot = (): PartySnapshot => ({
    ...state,
    position: { ...state.position },
    velocity: { ...state.velocity },
    flashlight: { ...state.flashlight },
  });

  return Object.freeze({
    snapshot,
    look(yawDelta: number, pitchDelta: number) {
      state.yaw = normalizeAngle(state.yaw + yawDelta);
      state.pitch = clamp(state.pitch + pitchDelta, -1.18, 1.08);
      return snapshot();
    },
    setFlashlight(active: boolean) {
      state.flashlight.intentOn = active;
      return snapshot();
    },
    setEffectiveFlashlight(active: boolean) {
      state.flashlight.effectiveOn = active && state.flashlight.intentOn && state.condition !== "captured";
      return snapshot();
    },
    setCondition(condition: PartySnapshot["condition"]) {
      state.condition = condition;
      return snapshot();
    },
    step(deltaSeconds: number, input: SemanticInput, resolveMotion: MotionResolver) {
      if (state.condition === "captured") return { snapshot: snapshot(), distanceMeters: 0 };
      state.yaw = normalizeAngle(state.yaw + input.turn * deltaSeconds * 1.65);
      const speed = input.sprint ? 4.45 : 3.05;
      const forwardX = -Math.sin(state.yaw);
      const forwardZ = -Math.cos(state.yaw);
      const rightX = Math.cos(state.yaw);
      const rightZ = -Math.sin(state.yaw);
      const intendedX = forwardX * input.forward + rightX * input.strafe;
      const intendedZ = forwardZ * input.forward + rightZ * input.strafe;
      const magnitude = Math.hypot(intendedX, intendedZ);
      const scale = magnitude > 1 ? 1 / magnitude : 1;
      const velocityX = intendedX * scale * speed;
      const velocityZ = intendedZ * scale * speed;
      const previous = state.position;
      const resolved = resolveMotion({
        x: previous.x + velocityX * deltaSeconds,
        y: previous.y,
        z: previous.z + velocityZ * deltaSeconds,
      });
      state.position = { ...resolved };
      state.velocity = { x: velocityX, y: 0, z: velocityZ };
      const distanceMeters = Math.hypot(resolved.x - previous.x, resolved.z - previous.z);
      return { snapshot: snapshot(), distanceMeters };
    },
    reset() {
      state = initialState(explorerId);
      return snapshot();
    },
    load(next: PartySnapshot) {
      state = {
        ...next,
        position: { ...next.position },
        velocity: { ...next.velocity },
        flashlight: { ...next.flashlight },
      };
      return snapshot();
    },
  });
}
