import { NETWORK_PROTOCOL_VERSION, type FullSyncMessage, type HostStartMessage, type InteractionRequestMessage, type LobbyEventMessage, type PlayerUpdateMessage, type ProtocolMessage } from "./messageTypes";
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

const isPlayerSnapshot = (value: unknown): value is ReplicatedGameSnapshot["players"][number] =>
  isRecord(value) &&
  isString(value.id) &&
  isString(value.name) &&
  isWorldPosition(value.position) &&
  isWorldPosition(value.velocity) &&
  isNumber(value.rotationY) &&
  isNumber(value.health) &&
  isNumber(value.stamina) &&
  isBoolean(value.isHost) &&
  isBoolean(value.isAlive) &&
  isBoolean(value.crouching) &&
  isString(value.connectionState);

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
  Array.isArray(value.players) &&
  value.players.every(isPlayerSnapshot) &&
  Array.isArray(value.cubes) &&
  Array.isArray(value.sequenceSlots) &&
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
  value.type === "client/player-update" &&
  isRecord(value.payload) &&
  isString(value.payload.playerId) &&
  isRecord(value.payload.input) &&
  isRecord(value.payload.pose) &&
  isNumber(value.payload.input.sequence) &&
  isNumber(value.payload.input.moveForward) &&
  isNumber(value.payload.input.moveStrafe) &&
  isNumber(value.payload.input.lookYaw) &&
  isBoolean(value.payload.input.sprint) &&
  isBoolean(value.payload.input.crouch) &&
  isBoolean(value.payload.input.interact) &&
  isBoolean(value.payload.input.primaryAction) &&
  isBoolean(value.payload.input.secondaryAction) &&
  isNumber(value.payload.pose.rotationY) &&
  isBoolean(value.payload.pose.grounded) &&
  isBoolean(value.payload.pose.crouching) &&
  isWorldPosition(value.payload.pose.position) &&
  isWorldPosition(value.payload.pose.velocity);

const hasInteractionRequestShape = (value: unknown): value is InteractionRequestMessage =>
  isEnvelope(value) &&
  value.type === "client/interaction-request" &&
  isRecord(value.payload) &&
  isString(value.payload.playerId) &&
  isString(value.payload.action) &&
  (value.payload.cubeId === undefined || isString(value.payload.cubeId)) &&
  (value.payload.slotId === undefined || isString(value.payload.slotId)) &&
  (value.payload.targetCellId === undefined || isString(value.payload.targetCellId));

const hasHostStartShape = (value: unknown): value is HostStartMessage =>
  isEnvelope(value) &&
  value.type === "host/start" &&
  isRecord(value.payload) &&
  isString(value.payload.hostPeerId) &&
  isRoomState(value.payload.room) &&
  isLobbyPlayer(value.payload.hostPlayer) &&
  isNumber(value.payload.seed) &&
  isNumber(value.payload.startedAtMs) &&
  isNumber(value.payload.maxPlayers);

const hasFullSyncShape = (value: unknown): value is FullSyncMessage =>
  isEnvelope(value) &&
  value.type === "host/full-sync" &&
  isRecord(value.payload) &&
  isSnapshot(value.payload.snapshot) &&
  isRoomState(value.payload.room) &&
  isString(value.payload.reason) &&
  isNumber(value.payload.authoritativeTick);

const hasLobbyEventShape = (value: unknown): value is LobbyEventMessage =>
  isEnvelope(value) &&
  value.type === "host/lobby-event" &&
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

  if (raw.type === "host/start" && hasHostStartShape(raw)) {
    return raw;
  }

  if (raw.type === "client/player-update" && hasPlayerUpdateShape(raw)) {
    return raw;
  }

  if (raw.type === "client/interaction-request" && hasInteractionRequestShape(raw)) {
    return raw;
  }

  if (raw.type === "host/full-sync" && hasFullSyncShape(raw)) {
    return raw;
  }

  if (raw.type === "host/lobby-event" && hasLobbyEventShape(raw)) {
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
