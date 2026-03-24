import type { PlayerId, ReplicatedGameSnapshot, RoomState } from "@/types/shared";

import type { GameState } from "@/features/game-state/domain/gameTypes";

import {
  NETWORK_PROTOCOL_VERSION,
  PROTOCOL_MESSAGE_TYPES,
  type FullSyncMessage,
  type FullSyncReason,
  type HostStartMessage,
  type InteractionRequestMessage,
  type LobbyEventKind,
  type LobbyEventMessage,
  type PlayerInputState,
  type PlayerPoseState,
  type PlayerUpdateMessage,
} from "./messageTypes";

type HostStartMessageInput = Readonly<{
  senderId: PlayerId;
  roomId: string;
  room: RoomState;
  hostPeerId: string;
  hostPlayerId: PlayerId;
  seed: number;
  startedAtMs?: number;
  timestampMs?: number;
  requestId?: string;
}>;

type FullSyncMessageInput = Readonly<{
  senderId: PlayerId;
  roomId?: string;
  state: GameState;
  reason?: FullSyncReason;
  timestampMs?: number;
  requestId?: string;
}>;

type LobbyEventMessageInput = Readonly<{
  senderId: PlayerId;
  roomId: string;
  room: RoomState;
  event: LobbyEventKind;
  timestampMs?: number;
  requestId?: string;
  message?: string;
  player?: RoomState["players"][number];
  previousHostId?: PlayerId | null;
}>;

type PlayerUpdateMessageInput = Readonly<{
  senderId: PlayerId;
  roomId: string;
  playerId: PlayerId;
  input: PlayerInputState;
  pose: PlayerPoseState;
  timestampMs?: number;
  requestId?: string;
}>;

type InteractionRequestMessageInput = Readonly<{
  senderId: PlayerId;
  roomId: string;
  playerId: PlayerId;
  action: InteractionRequestMessage["payload"]["action"];
  cubeId?: string;
  slotId?: string;
  targetCellId?: string;
  timestampMs?: number;
  requestId?: string;
}>;

const cloneCellGrid = (grid: { x: number; y: number }) => ({ x: grid.x, y: grid.y });

const cloneWorldPosition = (position: { x: number; y: number; z: number }) => ({
  x: position.x,
  y: position.y,
  z: position.z,
});

const cloneLobbyPlayer = (player: RoomState["players"][number]) => ({
  ...player,
});

const cloneRoomState = (room: RoomState): RoomState => ({
  ...room,
  players: room.players.map(cloneLobbyPlayer),
});

const cloneMazeCell = (cell: ReplicatedGameSnapshot["maze"][number]) => ({
  ...cell,
  grid: cloneCellGrid(cell.grid),
});

const toReplicatedCubeState = (
  cube: GameState["cubes"][number],
): ReplicatedGameSnapshot["cubes"][number]["state"] =>
  cube.heldByPlayerId !== null ? "held" : cube.assignedSlotId !== null || cube.locked ? "placed" : "ground";

const cloneCubeSnapshot = (cube: GameState["cubes"][number]): ReplicatedGameSnapshot["cubes"][number] => ({
  id: cube.id,
  color: cube.color,
  position: cloneWorldPosition(cube.position),
  state: toReplicatedCubeState(cube),
  ownerId: cube.heldByPlayerId,
});

const cloneAnomalySnapshot = (
  state: GameState,
): ReplicatedGameSnapshot["anomaly"] => ({
  sequence: state.sequenceSlots.map((slot) => slot.requiredColor),
  slots: state.sequenceSlots.map((slot) => slot.occupiedCubeId),
});

const cloneOozeTrailItem = (ooze: ReplicatedGameSnapshot["oozeTrail"][number]) => ({
  ...ooze,
});

const clonePlayerSnapshot = (player: GameState["players"][number]): ReplicatedGameSnapshot["players"][number] => ({
  id: player.id,
  color: player.color,
  position: cloneWorldPosition(player.position),
  rotationY: player.rotationY,
  pitch: player.pitch,
});

export const buildReplicatedSnapshot = (state: GameState): ReplicatedGameSnapshot => ({
  gameId: state.gameId,
  seed: state.seed,
  room: cloneRoomState(state.room),
  appState: state.appState,
  gameState: state.gameState,
  tick: state.tick,
  timestampMs: state.timestampMs,
  maze: state.maze.map(cloneMazeCell),
  players: state.players.map(clonePlayerSnapshot),
  cubes: state.cubes.map(cloneCubeSnapshot),
  anomaly: cloneAnomalySnapshot(state),
  oozeTrail: state.oozeTrail.map(cloneOozeTrailItem),
  oozeLevel: state.oozeLevel,
});

export const createHostStartMessage = (input: HostStartMessageInput): HostStartMessage => ({
  type: PROTOCOL_MESSAGE_TYPES.START_GAME,
  version: NETWORK_PROTOCOL_VERSION,
  senderId: input.senderId,
  roomId: input.roomId,
  timestampMs: input.timestampMs ?? input.startedAtMs ?? Date.now(),
  requestId: input.requestId,
  payload: {
    hostPeerId: input.hostPeerId,
    room: cloneRoomState(input.room),
    hostPlayer:
      input.room.players.find((player) => player.id === input.hostPlayerId) ?? input.room.players[0] ?? {
        id: input.hostPlayerId,
        name: "Host",
        isHost: true,
        ready: false,
        connectionState: "connected",
      },
    seed: input.seed,
    startedAtMs: input.startedAtMs ?? Date.now(),
    maxPlayers: input.room.maxPlayers,
  },
});

export const createFullSyncMessage = (input: FullSyncMessageInput): FullSyncMessage => ({
  type: PROTOCOL_MESSAGE_TYPES.SYNC,
  version: NETWORK_PROTOCOL_VERSION,
  senderId: input.senderId,
  roomId: input.roomId ?? input.state.room.roomId,
  timestampMs: input.timestampMs ?? input.state.timestampMs,
  requestId: input.requestId,
  payload: {
    snapshot: buildReplicatedSnapshot(input.state),
    room: cloneRoomState(input.state.room),
    reason: input.reason ?? "initial",
    authoritativeTick: input.state.tick,
  },
});

export const createLobbyEventMessage = (input: LobbyEventMessageInput): LobbyEventMessage => ({
  type: PROTOCOL_MESSAGE_TYPES.LOBBY_EVENT,
  version: NETWORK_PROTOCOL_VERSION,
  senderId: input.senderId,
  roomId: input.roomId,
  timestampMs: input.timestampMs ?? Date.now(),
  requestId: input.requestId,
  payload: {
    event: input.event,
    room: cloneRoomState(input.room),
    players: input.room.players.map(cloneLobbyPlayer),
    message: input.message,
    player: input.player ? cloneLobbyPlayer(input.player) : undefined,
    previousHostId: input.previousHostId,
  },
});

export const createPlayerUpdateMessage = (
  input: PlayerUpdateMessageInput,
): PlayerUpdateMessage => ({
  type: PROTOCOL_MESSAGE_TYPES.PLAYER_UPDATE,
  version: NETWORK_PROTOCOL_VERSION,
  senderId: input.senderId,
  roomId: input.roomId,
  timestampMs: input.timestampMs ?? Date.now(),
  requestId: input.requestId,
  payload: {
    playerId: input.playerId,
    input: input.input,
    pose: input.pose,
  },
});

export const createInteractionRequestMessage = (
  input: InteractionRequestMessageInput,
): InteractionRequestMessage => ({
  type: PROTOCOL_MESSAGE_TYPES.TRY_INTERACT,
  version: NETWORK_PROTOCOL_VERSION,
  senderId: input.senderId,
  roomId: input.roomId,
  timestampMs: input.timestampMs ?? Date.now(),
  requestId: input.requestId,
  payload: {
    playerId: input.playerId,
    action: input.action,
    cubeId: input.cubeId,
    slotId: input.slotId,
    targetCellId: input.targetCellId,
  },
});
