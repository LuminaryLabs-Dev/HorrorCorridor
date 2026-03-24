import type { GameScreenState, RoomState } from "@/types/shared";

import type { GameState, SequenceProgressState, SequenceSlot } from "./gameTypes";

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
  let allSlotsFilled = state.sequenceSlots.length > 0;
  let exactOrderMatch = state.sequenceSlots.length > 0;

  for (const slot of state.sequenceSlots) {
    const cube = slot.occupiedCubeId ? cubeLookup[slot.occupiedCubeId] : undefined;
    const colorMatches = cube !== undefined && cube.color === slot.requiredColor;
    const isSolved = Boolean(cube && colorMatches);
    const isUnlocked = slot.occupiedCubeId === null || isSolved;

    nextSlots.push({
      ...slot,
      isSolved,
      isUnlocked,
    });

    if (isSolved) {
      solvedCount += 1;
    } else {
      exactOrderMatch = false;
    }

    if (!cube) {
      allSlotsFilled = false;
      exactOrderMatch = false;
    }
  }

  return {
    nextSlots,
    progress: {
      solvedCount,
      totalCount: state.sequenceSlots.length,
      complete: allSlotsFilled && exactOrderMatch && solvedCount === state.sequenceSlots.length,
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
