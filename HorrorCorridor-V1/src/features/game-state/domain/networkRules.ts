import type { PlayerId, WorldPosition } from "@/types/shared";

import { dropCube, pickUpCube, placeCubeAtEndAnomaly, removeCubeFromEndAnomaly } from "./interactionRules";
import type { GameState } from "./gameTypes";

export type NetworkInteractionAction =
  | "pickup-cube"
  | "drop-cube"
  | "place-cube-at-anomaly"
  | "remove-cube-from-anomaly"
  | "request-sync"
  | "toggle-ready"
  | "cancel";

export type NetworkPlayerUpdateInput = Readonly<{
  playerId: PlayerId;
  position: WorldPosition;
  rotationY: number;
  pitch: number;
  velocity: WorldPosition;
}>;

export type NetworkInteractionRequestInput = Readonly<{
  playerId: PlayerId;
  action: NetworkInteractionAction;
  cubeId?: string;
  slotId?: string;
}>;

export const syncHeldCubesToPlayers = (state: GameState): GameState => {
  const playerLookup = new Map(state.players.map((player) => [player.id, player] as const));

  let changed = false;
  const nextCubes = state.cubes.map((cube) => {
    if (!cube.heldByPlayerId) {
      return cube;
    }

    const player = playerLookup.get(cube.heldByPlayerId);

    if (!player) {
      return cube;
    }

    if (
      cube.position.x === player.position.x &&
      cube.position.y === player.position.y &&
      cube.position.z === player.position.z
    ) {
      return cube;
    }

    changed = true;
    return {
      ...cube,
      position: player.position,
    };
  });

  return changed
    ? {
        ...state,
        cubes: nextCubes,
      }
    : state;
};

export const applyNetworkPlayerUpdate = (
  state: GameState,
  input: NetworkPlayerUpdateInput,
): GameState => {
  const currentPlayer = state.players.find((player) => player.id === input.playerId);

  if (!currentPlayer) {
    return state;
  }

  const nextPlayers = state.players.map((player) =>
    player.id === input.playerId
      ? {
          ...player,
          position: input.position,
          rotationY: input.rotationY,
          pitch: input.pitch,
          velocity: input.velocity,
        }
      : player,
  );

  return syncHeldCubesToPlayers({
    ...state,
    players: nextPlayers,
  });
};

export const applyNetworkInteractionRequest = (
  state: GameState,
  input: NetworkInteractionRequestInput,
): GameState => {
  switch (input.action) {
    case "pickup-cube":
      return pickUpCube(state, input);
    case "drop-cube":
      return dropCube(state, input);
    case "place-cube-at-anomaly":
      return placeCubeAtEndAnomaly(state, input);
    case "remove-cube-from-anomaly":
      return removeCubeFromEndAnomaly(state, input);
    case "request-sync":
    case "toggle-ready":
    case "cancel":
    default:
      return state;
  }
};
