import { MAX_OOZE, OOZE_SPACING } from "@/lib/constants";
import type { MazeRng } from "@/features/maze/domain/mazeTypes";

import type { GameState, OozeTrailUpdateInput } from "./gameTypes";

const OOZE_DECAY_INTERVAL_MS = 10_000;

const round3 = (value: number): number => Math.round(value * 1000) / 1000;

const resolveRng = (rng?: MazeRng): MazeRng => rng ?? Math.random;

const trailDistance = (left: { x: number; z: number }, right: { x: number; z: number }): number =>
  Math.hypot(left.x - right.x, left.z - right.z);

export const decayOozeTrail = (
  state: GameState,
  input: OozeTrailUpdateInput,
): GameState => {
  if (input.nowMs - state.lastOozeDecayTime < OOZE_DECAY_INTERVAL_MS) {
    return state;
  }

  const rng = resolveRng(input.rng);
  const nextTrail = state.oozeTrail
    .filter(() => rng() >= 0.1)
    .map((ooze) => ({
      ...ooze,
      scale: round3(Math.max(0.001, ooze.scale * 0.75)),
    }));

  return {
    ...state,
    oozeTrail: nextTrail,
    oozeLevel: nextTrail.length,
    lastOozeDecayTime: input.nowMs,
  };
};

export const spawnOozeTrail = (
  state: GameState,
  input: OozeTrailUpdateInput,
): GameState => {
  const rng = resolveRng(input.rng);
  const nextTrail = [...state.oozeTrail];

  for (const position of input.playerPositions) {
    const lastOoze = nextTrail[nextTrail.length - 1];
    const distance = lastOoze ? trailDistance(position, lastOoze) : Number.POSITIVE_INFINITY;

    if (distance <= OOZE_SPACING || nextTrail.length >= MAX_OOZE) {
      continue;
    }

    nextTrail.push({
      x: position.x,
      z: position.z,
      y: round3(0.01 + rng() * 0.02),
      rotY: rng() * Math.PI,
      scale: 1,
    });
  }

  return {
    ...state,
    oozeTrail: nextTrail,
    oozeLevel: nextTrail.length,
  };
};

export const advanceOozeTrail = (
  state: GameState,
  input: OozeTrailUpdateInput,
): GameState => spawnOozeTrail(decayOozeTrail(state, input), input);
