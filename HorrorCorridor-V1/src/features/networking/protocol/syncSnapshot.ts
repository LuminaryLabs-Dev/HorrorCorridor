import type { PlayerId, ReplicatedGameSnapshot, RoomState } from "@/types/shared";

import type { GameState } from "@/features/game-state/domain/gameTypes";

import {
  NETWORK_PROTOCOL_VERSION,
  type FullSyncMessage,
  type FullSyncReason,
  type HostStartMessage,
  type LobbyEventKind,
  type LobbyEventMessage,
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

const cloneCubeState = (cube: ReplicatedGameSnapshot["cubes"][number]) => ({
  ...cube,
  cell: cube.cell ? cloneCellGrid(cube.cell) : null,
  position: cloneWorldPosition(cube.position),
});

const cloneSequenceSlot = (slot: ReplicatedGameSnapshot["sequenceSlots"][number]) => ({
  ...slot,
});

const cloneOozeTrailItem = (ooze: ReplicatedGameSnapshot["oozeTrail"][number]) => ({
  ...ooze,
});

const clonePlayerSnapshot = (player: ReplicatedGameSnapshot["players"][number]) => ({
  ...player,
  position: cloneWorldPosition(player.position),
  velocity: cloneWorldPosition(player.velocity),
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
  cubes: state.cubes.map(cloneCubeState),
  sequenceSlots: state.sequenceSlots.map(cloneSequenceSlot),
  oozeTrail: state.oozeTrail.map(cloneOozeTrailItem),
  oozeLevel: state.oozeLevel,
});

export const createHostStartMessage = (input: HostStartMessageInput): HostStartMessage => ({
  type: "host/start",
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
  type: "host/full-sync",
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
  type: "host/lobby-event",
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
  },
});
