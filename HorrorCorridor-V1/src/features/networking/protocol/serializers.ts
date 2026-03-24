import {
  NETWORK_PROTOCOL_VERSION,
  PROTOCOL_MESSAGE_TYPES,
  type FullSyncMessage,
  type HostStartMessage,
  type InteractionRequestMessage,
  type LobbyEventMessage,
  type PlayerUpdateMessage,
  type ProtocolMessage,
} from "./messageTypes";
import type { LobbyPlayer, ReplicatedGameSnapshot, RoomState } from "@/types/shared";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isString = (value: unknown): value is string => typeof value === "string";
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";

const isWorldPosition = (value: unknown): value is { x: number; y: number; z: number } =>
  isRecord(value) && isNumber(value.x) && isNumber(value.y) && isNumber(value.z);

const isOozeTrailItem = (
  value: unknown,
): value is { x: number; z: number; y: number; rotY: number; scale: number } =>
  isRecord(value) &&
  isNumber(value.x) &&
  isNumber(value.z) &&
  isNumber(value.y) &&
  isNumber(value.rotY) &&
  isNumber(value.scale);

const isLobbyPlayer = (value: unknown): value is LobbyPlayer =>
  isRecord(value) &&
  isString(value.id) &&
  isString(value.name) &&
  isBoolean(value.isHost) &&
  isBoolean(value.ready) &&
  isString(value.connectionState);

const isMazeCellSnapshot = (value: unknown): value is ReplicatedGameSnapshot["maze"][number] =>
  isRecord(value) &&
  isString(value.id) &&
  isRecord(value.grid) &&
  isNumber(value.grid.x) &&
  isNumber(value.grid.y) &&
  isNumber(value.value) &&
  value.value >= 0 &&
  value.value <= 4;

const isPlayerSnapshot = (value: unknown): value is ReplicatedGameSnapshot["players"][number] =>
  isRecord(value) &&
  isString(value.id) &&
  isString(value.color) &&
  isWorldPosition(value.position) &&
  isNumber(value.rotationY) &&
  isNumber(value.pitch);

const isCubeSnapshot = (value: unknown): value is ReplicatedGameSnapshot["cubes"][number] =>
  isRecord(value) &&
  isString(value.id) &&
  isString(value.color) &&
  isWorldPosition(value.position) &&
  isString(value.state) &&
  (value.state === "ground" || value.state === "held" || value.state === "placed") &&
  (value.ownerId === null || isString(value.ownerId));

const isAnomalySnapshot = (value: unknown): value is ReplicatedGameSnapshot["anomaly"] =>
  isRecord(value) &&
  Array.isArray(value.sequence) &&
  value.sequence.every(isString) &&
  Array.isArray(value.slots) &&
  value.slots.every((slot) => slot === null || isString(slot));

const isRoomState = (value: unknown): value is RoomState =>
  isRecord(value) &&
  isString(value.roomId) &&
  (value.joinCode === null || isString(value.joinCode)) &&
  (value.hostId === null || isString(value.hostId)) &&
  isString(value.phase) &&
  isNumber(value.maxPlayers) &&
  Array.isArray(value.players) &&
  value.players.every(isLobbyPlayer) &&
  isNumber(value.createdAt) &&
  isNumber(value.updatedAt);

const isSnapshot = (value: unknown): value is ReplicatedGameSnapshot =>
  isRecord(value) &&
  isString(value.gameId) &&
  isNumber(value.seed) &&
  isRoomState(value.room) &&
  isString(value.appState) &&
  isString(value.gameState) &&
  isNumber(value.tick) &&
  isNumber(value.timestampMs) &&
  Array.isArray(value.maze) &&
  value.maze.every(isMazeCellSnapshot) &&
  Array.isArray(value.players) &&
  value.players.every(isPlayerSnapshot) &&
  Array.isArray(value.cubes) &&
  value.cubes.every(isCubeSnapshot) &&
  isAnomalySnapshot(value.anomaly) &&
  Array.isArray(value.oozeTrail) &&
  value.oozeTrail.every(isOozeTrailItem) &&
  isNumber(value.oozeLevel);

const isEnvelope = (value: unknown): value is ProtocolMessage =>
  isRecord(value) &&
  isString(value.type) &&
  value.version === NETWORK_PROTOCOL_VERSION &&
  isString(value.senderId) &&
  isString(value.roomId) &&
  isNumber(value.timestampMs) &&
  isRecord(value.payload);

const hasPlayerUpdateShape = (value: unknown): value is PlayerUpdateMessage =>
  isEnvelope(value) &&
  value.type === PROTOCOL_MESSAGE_TYPES.PLAYER_UPDATE &&
  isRecord(value.payload) &&
  isString(value.payload.playerId) &&
  isRecord(value.payload.input) &&
  isRecord(value.payload.pose) &&
  isNumber(value.payload.input.sequence) &&
  isNumber(value.payload.input.moveForward) &&
  isNumber(value.payload.input.moveStrafe) &&
  isNumber(value.payload.input.lookYaw) &&
  isBoolean(value.payload.input.interact) &&
  isNumber(value.payload.pose.rotationY) &&
  isNumber(value.payload.pose.pitch) &&
  isWorldPosition(value.payload.pose.position) &&
  isWorldPosition(value.payload.pose.velocity);

const hasInteractionRequestShape = (value: unknown): value is InteractionRequestMessage =>
  isEnvelope(value) &&
  value.type === PROTOCOL_MESSAGE_TYPES.TRY_INTERACT &&
  isRecord(value.payload) &&
  isString(value.payload.playerId) &&
  isString(value.payload.action) &&
  (value.payload.cubeId === undefined || isString(value.payload.cubeId)) &&
  (value.payload.slotId === undefined || isString(value.payload.slotId)) &&
  (value.payload.targetCellId === undefined || isString(value.payload.targetCellId));

const hasHostStartShape = (value: unknown): value is HostStartMessage =>
  isEnvelope(value) &&
  value.type === PROTOCOL_MESSAGE_TYPES.START_GAME &&
  isRecord(value.payload) &&
  isString(value.payload.hostPeerId) &&
  isRoomState(value.payload.room) &&
  isLobbyPlayer(value.payload.hostPlayer) &&
  isNumber(value.payload.seed) &&
  isNumber(value.payload.startedAtMs) &&
  isNumber(value.payload.maxPlayers);

const hasFullSyncShape = (value: unknown): value is FullSyncMessage =>
  isEnvelope(value) &&
  value.type === PROTOCOL_MESSAGE_TYPES.SYNC &&
  isRecord(value.payload) &&
  isSnapshot(value.payload.snapshot) &&
  isRoomState(value.payload.room) &&
  isString(value.payload.reason) &&
  isNumber(value.payload.authoritativeTick);

const hasLobbyEventShape = (value: unknown): value is LobbyEventMessage =>
  isEnvelope(value) &&
  value.type === PROTOCOL_MESSAGE_TYPES.LOBBY_EVENT &&
  isRecord(value.payload) &&
  isString(value.payload.event) &&
  isRoomState(value.payload.room) &&
  Array.isArray(value.payload.players) &&
  value.payload.players.every(isLobbyPlayer) &&
  (value.payload.player === undefined || isLobbyPlayer(value.payload.player)) &&
  (value.payload.previousHostId === undefined || value.payload.previousHostId === null || isString(value.payload.previousHostId)) &&
  (value.payload.message === undefined || isString(value.payload.message));

export const serializeProtocolMessage = (message: ProtocolMessage): string => JSON.stringify(message);

export const deserializeProtocolMessage = (input: unknown): ProtocolMessage | null => {
  let raw: unknown = input;

  if (typeof input === "string") {
    try {
      raw = JSON.parse(input) as unknown;
    } catch {
      return null;
    }
  }

  if (!isEnvelope(raw)) {
    return null;
  }

  if (raw.type === PROTOCOL_MESSAGE_TYPES.START_GAME && hasHostStartShape(raw)) {
    return raw;
  }

  if (raw.type === PROTOCOL_MESSAGE_TYPES.PLAYER_UPDATE && hasPlayerUpdateShape(raw)) {
    return raw;
  }

  if (raw.type === PROTOCOL_MESSAGE_TYPES.TRY_INTERACT && hasInteractionRequestShape(raw)) {
    return raw;
  }

  if (raw.type === PROTOCOL_MESSAGE_TYPES.SYNC && hasFullSyncShape(raw)) {
    return raw;
  }

  if (raw.type === PROTOCOL_MESSAGE_TYPES.LOBBY_EVENT && hasLobbyEventShape(raw)) {
    return raw;
  }

  return null;
};

export const isProtocolMessage = (value: unknown): value is ProtocolMessage =>
  deserializeProtocolMessage(value) !== null;

export const serializeProtocolMessages = (messages: readonly ProtocolMessage[]): readonly string[] =>
  messages.map(serializeProtocolMessage);

export const deserializeProtocolMessages = (inputs: readonly unknown[]): readonly ProtocolMessage[] =>
  inputs.map(deserializeProtocolMessage).filter((message): message is ProtocolMessage => message !== null);
