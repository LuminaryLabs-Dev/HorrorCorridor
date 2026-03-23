import type {
  LobbyPlayer,
  PlayerId,
  ReplicatedGameSnapshot,
  RoomState,
  WorldPosition,
} from "@/types/shared";

export const NETWORK_PROTOCOL_VERSION = 1 as const;

export type ProtocolVersion = typeof NETWORK_PROTOCOL_VERSION;

export type ProtocolEnvelope<TType extends string, TPayload> = Readonly<{
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

export type HostStartMessage = ProtocolEnvelope<"host/start", HostStartPayload>;

export type PlayerInputState = Readonly<{
  sequence: number;
  moveForward: number;
  moveStrafe: number;
  lookYaw: number;
  sprint: boolean;
  crouch: boolean;
  interact: boolean;
  primaryAction: boolean;
  secondaryAction: boolean;
}>;

export type PlayerPoseState = Readonly<{
  position: WorldPosition;
  rotationY: number;
  velocity: WorldPosition;
  grounded: boolean;
  crouching: boolean;
}>;

export type PlayerUpdatePayload = Readonly<{
  playerId: PlayerId;
  input: PlayerInputState;
  pose: PlayerPoseState;
}>;

export type PlayerUpdateMessage = ProtocolEnvelope<"client/player-update", PlayerUpdatePayload>;

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
  "client/interaction-request",
  InteractionRequestPayload
>;

export type FullSyncReason = "initial" | "join" | "resync" | "reconnect" | "recovery";

export type FullSyncPayload = Readonly<{
  snapshot: ReplicatedGameSnapshot;
  room: RoomState;
  reason: FullSyncReason;
  authoritativeTick: number;
}>;

export type FullSyncMessage = ProtocolEnvelope<"host/full-sync", FullSyncPayload>;

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

export type LobbyEventMessage = ProtocolEnvelope<"host/lobby-event", LobbyEventPayload>;

export type ProtocolMessage =
  | HostStartMessage
  | PlayerUpdateMessage
  | InteractionRequestMessage
  | FullSyncMessage
  | LobbyEventMessage;

export type ProtocolMessageType = ProtocolMessage["type"];
