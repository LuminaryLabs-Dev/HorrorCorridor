import type { CubeColorKey } from "@/lib/colors";

export type CellGridPosition = Readonly<{
  x: number;
  y: number;
}>;

export type WorldPosition = Readonly<{
  x: number;
  y: number;
  z: number;
}>;

export type MazeCellSnapshot = Readonly<{
  id: string;
  grid: CellGridPosition;
  value: 0 | 1 | 2 | 3 | 4;
}>;

export type CubeStateId = string;
export type PlayerId = string;

export type ReplicatedCubeState = "ground" | "held" | "placed";

export type ReplicatedCubeSnapshot = Readonly<{
  id: CubeStateId;
  color: CubeColorKey;
  position: WorldPosition;
  state: ReplicatedCubeState;
  ownerId: PlayerId | null;
}>;

export type ConnectionState = "connecting" | "connected" | "reconnecting" | "disconnected";

export type PlayerSnapshot = Readonly<{
  id: PlayerId;
  color: string;
  position: WorldPosition;
  rotationY: number;
  pitch: number;
}>;

export type LobbyPlayer = Readonly<{
  id: PlayerId;
  name: string;
  isHost: boolean;
  ready: boolean;
  connectionState: ConnectionState;
}>;

export type RoomPhase = "idle" | "lobby" | "starting" | "active" | "ending" | "closed";

export type RoomState = Readonly<{
  roomId: string;
  joinCode: string | null;
  hostId: PlayerId | null;
  phase: RoomPhase;
  maxPlayers: number;
  players: readonly LobbyPlayer[];
  createdAt: number;
  updatedAt: number;
}>;

export type ReplicatedAnomalySnapshot = Readonly<{
  sequence: readonly CubeColorKey[];
  slots: readonly (CubeStateId | null)[];
}>;

export type OozeTrailItem = Readonly<{
  x: number;
  z: number;
  y: number;
  rotY: number;
  scale: number;
}>;

export type GameScreenState = "loading" | "lobby" | "playing" | "paused" | "victory" | "failure";

export type AppScreenState =
  | "START"
  | "JOIN_MENU"
  | "LOBBY_HOST"
  | "LOBBY_CLIENT"
  | "PLAYING"
  | "PAUSED"
  | "COMPLETED";

export type ReplicatedGameSnapshot = Readonly<{
  gameId: string;
  seed: number;
  room: RoomState;
  appState: AppScreenState;
  gameState: GameScreenState;
  tick: number;
  timestampMs: number;
  maze: readonly MazeCellSnapshot[];
  players: readonly PlayerSnapshot[];
  cubes: readonly ReplicatedCubeSnapshot[];
  anomaly: ReplicatedAnomalySnapshot;
  oozeTrail: readonly OozeTrailItem[];
  oozeLevel: number;
}>;

export type NetworkProtocolVersion = 1;

export type NetworkEnvelope<TType extends string, TPayload> = Readonly<{
  type: TType;
  version: NetworkProtocolVersion;
  senderId: PlayerId;
  roomId: string;
  timestampMs: number;
  requestId?: string;
  payload: TPayload;
}>;

export type ClientHelloMessage = NetworkEnvelope<
  "client/hello",
  {
    name: string;
    preferredRole?: "host" | "client";
  }
>;

export type ClientJoinRoomMessage = NetworkEnvelope<
  "client/join-room",
  {
    joinCode: string;
  }
>;

export type ClientLeaveRoomMessage = NetworkEnvelope<"client/leave-room", Record<string, never>>;

export type ClientInputMessage = NetworkEnvelope<
  "client/input",
  {
    sequence: number;
    moveForward: number;
    moveStrafe: number;
    lookYaw: number;
    sprint: boolean;
    interact: boolean;
  }
>;

export type ClientReadyMessage = NetworkEnvelope<
  "client/ready",
  {
    ready: boolean;
  }
>;

export type ClientActionMessage = NetworkEnvelope<
  "client/action",
  {
    action:
      | "toggle-ready"
      | "request-respawn"
      | "request-sync"
      | "interact"
      | "cancel";
  }
>;

export type HostRoomStateMessage = NetworkEnvelope<
  "host/room-state",
  {
    room: RoomState;
  }
>;

export type HostSnapshotMessage = NetworkEnvelope<
  "host/snapshot",
  {
    snapshot: ReplicatedGameSnapshot;
  }
>;

export type HostKickMessage = NetworkEnvelope<
  "host/kick",
  {
    reason: string;
  }
>;

export type HostPingMessage = NetworkEnvelope<"host/ping", { nonce: string }>;

export type HostPongMessage = NetworkEnvelope<"host/pong", { nonce: string }>;

export type NetworkMessage =
  | ClientHelloMessage
  | ClientJoinRoomMessage
  | ClientLeaveRoomMessage
  | ClientInputMessage
  | ClientReadyMessage
  | ClientActionMessage
  | HostRoomStateMessage
  | HostSnapshotMessage
  | HostKickMessage
  | HostPingMessage
  | HostPongMessage;
