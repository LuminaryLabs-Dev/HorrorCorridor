export const SNAPSHOT_SCHEMA = "horror-corridor-v2.snapshot/1" as const;
export const NETWORK_SCHEMA = "horror-corridor-v2.network/1" as const;
export const SAVE_SCHEMA = "horror-corridor-v2.save/1" as const;

export type HorrorCorridorV2Mode = "solo" | "host" | "client";
export type ExpeditionPhase = "title" | "delving" | "offering" | "caught" | "paused";
export type DreadPhase =
  | "dormant"
  | "sign"
  | "approaching"
  | "repelling"
  | "blackout"
  | "last-chance"
  | "jumpscare"
  | "resolved";
export type MonsterId = string;
export type MonsterStudy = "unseen" | "heard" | "studied" | "collected";
export type OfferingId = "fresh-cell" | "silver-bell" | "red-thread" | "salt-chalk";

export type Vec3 = Readonly<{ x: number; y: number; z: number }>;

export type MonsterIndexEntry = Readonly<{
  monsterId: MonsterId;
  status: MonsterStudy;
  encounters: number;
  survivals: number;
  captures: number;
  firstBuilding: number | null;
}>;

export type ExpeditionSnapshot = Readonly<{
  phase: ExpeditionPhase;
  runId: string;
  seed: number;
  elapsedMs: number;
  distanceMeters: number;
  distanceSinceEncounter: number;
  score: number;
  fate: "unwritten" | "alive" | "caught";
  buildingNumber: number;
  chronicle: readonly string[];
  monsterIndex: Readonly<Record<MonsterId, MonsterIndexEntry>>;
}>;

export type CorridorSnapshot = Readonly<{
  buildingId: string;
  chamberId: string;
  routeSeed: number;
  randomState: number;
  thresholdOpen: boolean;
  offering: Readonly<{
    id: OfferingId;
    name: string;
    description: string;
  }> | null;
  claimedOfferings: readonly OfferingId[];
  illumination: Readonly<{
    mode: "steady" | "flicker" | "blackout";
    intensity: number;
    greenShift: number;
    nextFlickerMs: number;
  }>;
  beam: Readonly<{
    active: boolean;
    contact: boolean;
    halfAngle: number;
  }>;
  acoustics: Readonly<{
    roomTone: "concrete" | "service-tunnel" | "flooded";
    cuePan: number;
    cueStrength: number;
  }>;
}>;

export type PartySnapshot = Readonly<{
  explorerId: string;
  name: string;
  position: Vec3;
  velocity: Vec3;
  yaw: number;
  pitch: number;
  flashlight: Readonly<{
    intentOn: boolean;
    effectiveOn: boolean;
    charge: number;
  }>;
  condition: "ready" | "shaken" | "blinded" | "captured";
}>;

export type DreadSnapshot = Readonly<{
  encounterId: string | null;
  monsterId: MonsterId | null;
  randomState: number;
  phase: DreadPhase;
  distanceMeters: number;
  bearingRadians: number;
  heardSide: "left" | "right" | "ahead" | null;
  threat: number;
  signRemainingMs: number;
  beamHoldMs: number;
  blackoutRemainingMs: number;
  lastChanceRemainingMs: number;
  jumpscareRemainingMs: number;
  lastOutcome: "studied" | "collected" | "caught" | null;
  message: string;
}>;

export type SharedPeer = Readonly<{
  id: string;
  connected: boolean;
  lastSeenMs: number;
}>;

export type SharedExpeditionSnapshot = Readonly<{
  mode: HorrorCorridorV2Mode;
  authority: "local" | "host" | "remote";
  sessionId: string;
  roomCode: string | null;
  connection: "offline" | "connecting" | "connected" | "recovering";
  revision: number;
  lastPublishedAtMs: number;
  peers: Readonly<Record<string, SharedPeer>>;
}>;

export type HorrorCorridorV2Snapshot = Readonly<{
  schema: typeof SNAPSHOT_SCHEMA;
  seed: number;
  tick: number;
  simTimeMs: number;
  digest: string;
  expedition: ExpeditionSnapshot;
  corridor: CorridorSnapshot;
  party: PartySnapshot;
  dread: DreadSnapshot;
  sharedExpedition: SharedExpeditionSnapshot;
}>;

export type HorrorCorridorV2Save = Readonly<{
  schema: typeof SAVE_SCHEMA;
  savedAt: string;
  snapshot: HorrorCorridorV2Snapshot;
}>;

export type SemanticInput = Readonly<{
  forward: number;
  strafe: number;
  turn: number;
  sprint: boolean;
}>;

export type HorrorCorridorV2Action =
  | Readonly<{ type: "set-input"; input: Partial<SemanticInput> }>
  | Readonly<{ type: "look"; yawDelta: number; pitchDelta: number }>
  | Readonly<{ type: "flashlight"; active?: boolean }>
  | Readonly<{ type: "interact" }>
  | Readonly<{ type: "claim-offering"; offeringId?: OfferingId }>
  | Readonly<{ type: "pause"; paused?: boolean }>
  | Readonly<{ type: "restart" }>
  | Readonly<{ type: "network-message"; message: HorrorCorridorNetworkMessage }>
  | Readonly<{ type: "network-status"; status: SharedExpeditionSnapshot["connection"]; peerId?: string }>;

export type HorrorCorridorNetworkMessage =
  | Readonly<{
      schema: typeof NETWORK_SCHEMA;
      type: "snapshot";
      sessionId: string;
      revision: number;
      snapshot: HorrorCorridorV2Snapshot;
    }>
  | Readonly<{
      schema: typeof NETWORK_SCHEMA;
      type: "intent";
      sessionId: string;
      peerId: string;
      input: SemanticInput;
    }>
  | Readonly<{
      schema: typeof NETWORK_SCHEMA;
      type: "presence";
      sessionId: string;
      peerId: string;
      connected: boolean;
    }>;

export type PersistenceAdapter = Readonly<{
  save: (value: HorrorCorridorV2Save) => Promise<void>;
  load: () => Promise<HorrorCorridorV2Save | null>;
  clear?: () => Promise<void>;
}>;

export type NetworkAdapter = Readonly<{
  publish: (message: HorrorCorridorNetworkMessage) => void;
  onMessage: (listener: (message: HorrorCorridorNetworkMessage) => void) => () => void;
  onStatus?: (listener: (status: SharedExpeditionSnapshot["connection"], peerId?: string) => void) => () => void;
  reconnect?: () => Promise<void>;
  dispose: () => void;
}>;

export type HorrorCorridorV2Adapters = Readonly<{
  persistence?: PersistenceAdapter;
  network?: NetworkAdapter;
}>;

export type HorrorCorridorV2Options = Readonly<{
  seed?: number | string;
  mode?: HorrorCorridorV2Mode;
  roomCode?: string;
  explorerId?: string;
  development?: boolean;
  adapters?: HorrorCorridorV2Adapters;
}>;

export type HorrorCorridorV2Runtime = Readonly<{
  start: () => HorrorCorridorV2Snapshot;
  tick: (deltaSeconds?: number) => HorrorCorridorV2Snapshot;
  dispatch: (action: HorrorCorridorV2Action) => HorrorCorridorV2Snapshot;
  snapshot: () => HorrorCorridorV2Snapshot;
  reset: () => HorrorCorridorV2Snapshot;
  save: () => Promise<HorrorCorridorV2Save>;
  load: (value?: HorrorCorridorV2Save) => Promise<boolean>;
  dispose: () => void;
  diagnostics: () => Readonly<{
    coreKitCount: number;
    explicitKitCount: number;
    installOrder: readonly string[];
    domainPaths: readonly string[];
  }>;
}>;

export const EMPTY_INPUT: SemanticInput = Object.freeze({
  forward: 0,
  strafe: 0,
  turn: 0,
  sprint: false,
});
