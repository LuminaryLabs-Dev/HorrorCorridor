import { CELL_SIZE, INTERACTION_DISTANCE } from "@/lib/constants";
import type { MazeCellSnapshot, WorldPosition } from "@/types/shared";

import { validateOrderedSequenceCompletion } from "./winRules";
import type { CubeInteractionInput, CubeState, EndAnomalyInteractionInput, GameState } from "./gameTypes";

const INTERACTION_DISTANCE_SQUARED = INTERACTION_DISTANCE * INTERACTION_DISTANCE;
const END_ANOMALY_DISTANCE = 6;
const END_ANOMALY_DISTANCE_SQUARED = END_ANOMALY_DISTANCE * END_ANOMALY_DISTANCE;

const isInteractionStateReady = (state: GameState): boolean => state.gameState === "playing";

const worldDistanceSquared = (left: WorldPosition, right: WorldPosition): number => {
  const dx = left.x - right.x;
  const dz = left.z - right.z;

  return dx * dx + dz * dz;
};

const cellCenter = (cell: MazeCellSnapshot): WorldPosition => ({
  x: cell.grid.x * CELL_SIZE + CELL_SIZE / 2,
  y: CELL_SIZE * 0.25,
  z: cell.grid.y * CELL_SIZE + CELL_SIZE / 2,
});

const cubePosition = (cube: CubeState): WorldPosition => cube.position;

const updateCube = (
  state: GameState,
  cubeId: string,
  updater: (cube: CubeState) => CubeState,
): GameState => {
  const currentCube = state.cubes.find((cube) => cube.id === cubeId);

  if (!currentCube) {
    return state;
  }

  const nextCube = updater(currentCube);

  if (nextCube === currentCube) {
    return state;
  }

  return {
    ...state,
    cubes: state.cubes.map((cube) => (cube.id === cubeId ? nextCube : cube)),
  };
};

const updateSequenceSlot = (
  state: GameState,
  slotId: string,
  updater: (slot: GameState["sequenceSlots"][number]) => GameState["sequenceSlots"][number],
): GameState => {
  const currentSlot = state.sequenceSlots.find((slot) => slot.id === slotId);

  if (!currentSlot) {
    return state;
  }

  const nextSlot = updater(currentSlot);

  if (nextSlot === currentSlot) {
    return state;
  }

  return {
    ...state,
    sequenceSlots: state.sequenceSlots.map((slot) => (slot.id === slotId ? nextSlot : slot)),
  };
};

const findPlayer = (state: GameState, playerId: string) => state.players.find((player) => player.id === playerId);

const findCarriedCube = (state: GameState, playerId: string) =>
  state.cubes.find((cube) => cube.heldByPlayerId === playerId);

const findNearestLooseCube = (state: GameState, player: GameState["players"][number], cubeId?: string) => {
  const candidates = state.cubes.filter(
    (cube) => cube.active && !cube.locked && cube.heldByPlayerId === null && cube.visible,
  );

  if (cubeId) {
    const targetCube = candidates.find((cube) => cube.id === cubeId) ?? null;

    if (!targetCube) {
      return null;
    }

    return worldDistanceSquared(player.position, cubePosition(targetCube)) <= INTERACTION_DISTANCE_SQUARED
      ? targetCube
      : null;
  }

  return (
    candidates
      .map((cube) => ({
        cube,
        distance: worldDistanceSquared(player.position, cubePosition(cube)),
      }))
      .filter(({ distance }) => distance <= INTERACTION_DISTANCE_SQUARED)
      .sort((left, right) => left.distance - right.distance || left.cube.id.localeCompare(right.cube.id))[0]?.cube ??
    null
  );
};

const getEndAnomalyCell = (state: GameState): MazeCellSnapshot | null => state.mazeLookup[state.endAnomalyCellId] ?? null;

const syncSequenceProgress = (state: GameState): GameState => validateOrderedSequenceCompletion(state);

export const pickUpCube = (state: GameState, input: CubeInteractionInput): GameState => {
  if (!isInteractionStateReady(state)) {
    return state;
  }

  const player = findPlayer(state, input.playerId);
  const carriedCube = findCarriedCube(state, input.playerId);

  if (!player || carriedCube) {
    return state;
  }

  const cube = findNearestLooseCube(state, player, input.cubeId);

  if (!cube) {
    return state;
  }

  const nextState = updateCube(state, cube.id, (currentCube) => ({
    ...currentCube,
    cell: null,
    position: player.position,
    visible: true,
    active: true,
    locked: false,
    highlighted: false,
    heldByPlayerId: player.id,
  }));

  return nextState;
};

export const dropCube = (state: GameState, input: CubeInteractionInput): GameState => {
  if (!isInteractionStateReady(state)) {
    return state;
  }

  const player = findPlayer(state, input.playerId);
  const carriedCube = findCarriedCube(state, input.playerId);

  if (!player || !carriedCube) {
    return state;
  }

  const nextState = updateCube(state, carriedCube.id, (currentCube) => ({
    ...currentCube,
    cell: null,
    position: player.position,
    visible: true,
    active: true,
    locked: false,
    highlighted: false,
    heldByPlayerId: null,
  }));

  return nextState;
};

export const placeCubeAtEndAnomaly = (
  state: GameState,
  input: EndAnomalyInteractionInput,
): GameState => {
  if (!isInteractionStateReady(state)) {
    return state;
  }

  const player = findPlayer(state, input.playerId);
  const carriedCube = findCarriedCube(state, input.playerId);
  const anomalyCell = getEndAnomalyCell(state);

  if (!player || !carriedCube || !anomalyCell) {
    return state;
  }

  if (worldDistanceSquared(player.position, cellCenter(anomalyCell)) > END_ANOMALY_DISTANCE_SQUARED) {
    return state;
  }

  const nextSlot =
    input.slotId !== undefined
      ? state.sequenceSlots.find(
          (slot) => slot.id === input.slotId && slot.occupiedCubeId === null,
        ) ?? null
      : state.sequenceSlots.find(
          (slot) => slot.occupiedCubeId === null,
        ) ?? null;

  if (!nextSlot) {
    return state;
  }

  let nextState = updateSequenceSlot(state, nextSlot.id, (slot) => ({
    ...slot,
    occupiedCubeId: carriedCube.id,
    isSolved: carriedCube.color === slot.requiredColor,
    isUnlocked: true,
  }));

  nextState = updateCube(nextState, carriedCube.id, (currentCube) => ({
    ...currentCube,
    cell: null,
    position: cellCenter(anomalyCell),
    visible: false,
    active: false,
    locked: true,
    highlighted: false,
    heldByPlayerId: null,
    assignedSlotId: nextSlot.id,
  }));

  return syncSequenceProgress(nextState);
};

export const removeCubeFromEndAnomaly = (
  state: GameState,
  input: EndAnomalyInteractionInput,
): GameState => {
  if (!isInteractionStateReady(state)) {
    return state;
  }

  const player = findPlayer(state, input.playerId);
  const carriedCube = findCarriedCube(state, input.playerId);
  const anomalyCell = getEndAnomalyCell(state);

  if (!player || carriedCube || !anomalyCell) {
    return state;
  }

  if (worldDistanceSquared(player.position, cellCenter(anomalyCell)) > END_ANOMALY_DISTANCE_SQUARED) {
    return state;
  }

  const lastOccupiedSlot = [...state.sequenceSlots]
    .reverse()
    .find((slot) => slot.occupiedCubeId !== null);

  if (!lastOccupiedSlot) {
    return state;
  }

  if (input.slotId !== undefined && input.slotId !== lastOccupiedSlot.id) {
    return state;
  }

  const cubeId = lastOccupiedSlot.occupiedCubeId;

  if (!cubeId) {
    return state;
  }

  let nextState = updateSequenceSlot(state, lastOccupiedSlot.id, (slot) => ({
    ...slot,
    occupiedCubeId: null,
    isSolved: false,
    isUnlocked: true,
  }));

  nextState = updateCube(nextState, cubeId, (currentCube) => ({
    ...currentCube,
    cell: null,
    position: player.position,
    visible: true,
    active: true,
    locked: false,
    highlighted: false,
    heldByPlayerId: player.id,
  }));

  return syncSequenceProgress(nextState);
};
