import type {
  LobbyPlayer,
  PlayerId,
  ReplicatedGameSnapshot,
  RoomState,
  WorldPosition,
} from "@/types/shared";

export const NETWORK_PROTOCOL_VERSION = 1 as const;

export type ProtocolVersion = typeof NETWORK_PROTOCOL_VERSION;

export const PROTOCOL_MESSAGE_TYPES = {
  START_GAME: "START_GAME",
  PLAYER_UPDATE: "PLAYER_UPDATE",
  TRY_INTERACT: "TRY_INTERACT",
  SYNC: "SYNC",
  LOBBY_EVENT: "LOBBY_EVENT",
} as const;

export type ProtocolMessageType =
  (typeof PROTOCOL_MESSAGE_TYPES)[keyof typeof PROTOCOL_MESSAGE_TYPES];

export type ProtocolEnvelope<TType extends ProtocolMessageType, TPayload> = Readonly<{
  type: TType;
  version: ProtocolVersion;
  senderId: PlayerId;
  roomId: string;
  timestampMs: number;
  requestId?: string;
  payload: TPayload;
}>;

export type HostStartPayload = Readonly<{
  hostPeerId: string;
  room: RoomState;
  hostPlayer: LobbyPlayer;
  seed: number;
  startedAtMs: number;
  maxPlayers: number;
}>;

export type HostStartMessage = ProtocolEnvelope<typeof PROTOCOL_MESSAGE_TYPES.START_GAME, HostStartPayload>;

export type PlayerInputState = Readonly<{
  sequence: number;
  moveForward: number;
  moveStrafe: number;
  lookYaw: number;
  interact: boolean;
}>;

export type PlayerPoseState = Readonly<{
  position: WorldPosition;
  rotationY: number;
  pitch: number;
  velocity: WorldPosition;
}>;

export type PlayerUpdatePayload = Readonly<{
  playerId: PlayerId;
  input: PlayerInputState;
  pose: PlayerPoseState;
}>;

export type PlayerUpdateMessage = ProtocolEnvelope<
  typeof PROTOCOL_MESSAGE_TYPES.PLAYER_UPDATE,
  PlayerUpdatePayload
>;

export type InteractionRequestAction =
  | "pickup-cube"
  | "drop-cube"
  | "place-cube-at-anomaly"
  | "remove-cube-from-anomaly"
  | "request-sync"
  | "toggle-ready"
  | "cancel";

export type InteractionRequestPayload = Readonly<{
  playerId: PlayerId;
  action: InteractionRequestAction;
  cubeId?: string;
  slotId?: string;
  targetCellId?: string;
}>;

export type InteractionRequestMessage = ProtocolEnvelope<
  typeof PROTOCOL_MESSAGE_TYPES.TRY_INTERACT,
  InteractionRequestPayload
>;

export type FullSyncReason = "initial" | "join" | "resync" | "reconnect" | "recovery";

export type FullSyncPayload = Readonly<{
  snapshot: ReplicatedGameSnapshot;
  room: RoomState;
  reason: FullSyncReason;
  authoritativeTick: number;
}>;

export type FullSyncMessage = ProtocolEnvelope<typeof PROTOCOL_MESSAGE_TYPES.SYNC, FullSyncPayload>;

export type LobbyEventKind =
  | "room-created"
  | "room-opened"
  | "player-joined"
  | "player-left"
  | "player-ready"
  | "player-unready"
  | "host-changed"
  | "room-closed"
  | "state-reset";

export type LobbyEventPayload = Readonly<{
  event: LobbyEventKind;
  room: RoomState;
  players: readonly LobbyPlayer[];
  player?: LobbyPlayer;
  previousHostId?: PlayerId | null;
  message?: string;
}>;

export type LobbyEventMessage = ProtocolEnvelope<typeof PROTOCOL_MESSAGE_TYPES.LOBBY_EVENT, LobbyEventPayload>;

export type ProtocolMessage =
  | HostStartMessage
  | PlayerUpdateMessage
  | InteractionRequestMessage
  | FullSyncMessage
  | LobbyEventMessage;
