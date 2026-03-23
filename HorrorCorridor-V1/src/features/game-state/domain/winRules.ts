import type { GameScreenState, RoomState, SequenceSlot } from "@/types/shared";

import type { GameState, SequenceProgressState } from "./gameTypes";

const buildCubeLookup = (state: GameState): Readonly<Record<string, GameState["cubes"][number]>> => {
  const lookup: Record<string, GameState["cubes"][number]> = {};

  for (const cube of state.cubes) {
    lookup[cube.id] = cube;
  }

  return lookup;
};

const evaluateSlots = (state: GameState) => {
  const cubeLookup = buildCubeLookup(state);
  const nextSlots: SequenceSlot[] = [];
  let solvedCount = 0;
  let nextSlotUnlocked = true;

  for (const slot of state.sequenceSlots) {
    const cube = slot.occupiedCubeId ? cubeLookup[slot.occupiedCubeId] : undefined;
    const colorMatches =
      cube !== undefined &&
      (slot.requiredColor === null || cube.color === slot.requiredColor);
    const isSolved = Boolean(cube && colorMatches && nextSlotUnlocked);
    const isUnlocked = nextSlotUnlocked;

    nextSlots.push({
      ...slot,
      isSolved,
      isUnlocked,
    });

    if (isSolved) {
      solvedCount += 1;
    } else {
      nextSlotUnlocked = false;
    }
  }

  return {
    nextSlots,
    progress: {
      solvedCount,
      totalCount: state.sequenceSlots.length,
      complete: state.sequenceSlots.length > 0 && solvedCount === state.sequenceSlots.length,
    } satisfies SequenceProgressState,
  };
};

const nextRoomState = (
  room: RoomState,
  phase: RoomState["phase"],
  updatedAt: number,
): RoomState => ({
  ...room,
  phase,
  updatedAt,
});

const nextGameState = (
  state: GameState,
  gameState: GameScreenState,
  sequenceSlots: readonly SequenceSlot[],
  roomPhase: RoomState["phase"],
): GameState => ({
  ...state,
  gameState,
  room: nextRoomState(state.room, roomPhase, state.timestampMs),
  sequenceSlots,
});

export const validateOrderedSequenceCompletion = (state: GameState): GameState => {
  const evaluation = evaluateSlots(state);

  if (evaluation.progress.complete) {
    return nextGameState(state, "victory", evaluation.nextSlots, "ending");
  }

  if (state.gameState === "victory") {
    return nextGameState(state, "playing", evaluation.nextSlots, "active");
  }

  if (evaluation.nextSlots.some((slot, index) => slot !== state.sequenceSlots[index])) {
    return {
      ...state,
      sequenceSlots: evaluation.nextSlots,
    };
  }

  return state;
};
