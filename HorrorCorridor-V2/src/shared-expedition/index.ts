import type {
  HorrorCorridorV2Mode,
  HorrorCorridorV2Snapshot,
  SharedExpeditionSnapshot,
} from "../contracts";

type SharedState = {
  mode: HorrorCorridorV2Mode;
  authority: SharedExpeditionSnapshot["authority"];
  sessionId: string;
  roomCode: string | null;
  connection: SharedExpeditionSnapshot["connection"];
  revision: number;
  lastPublishedAtMs: number;
  peers: Record<string, { id: string; connected: boolean; lastSeenMs: number }>;
};

function createInitialState(seed: number, mode: HorrorCorridorV2Mode, roomCode?: string): SharedState {
  return {
    mode,
    authority: mode === "client" ? "remote" : mode === "host" ? "host" : "local",
    sessionId: `hc2-${seed.toString(36)}-${roomCode ?? "solo"}`,
    roomCode: mode === "solo" ? null : (roomCode ?? seed.toString(36).slice(0, 6).toUpperCase()),
    connection: mode === "solo" ? "offline" : "connecting",
    revision: 0,
    lastPublishedAtMs: 0,
    peers: {},
  };
}

export type SharedExpeditionDomain = ReturnType<typeof createSharedExpeditionDomain>;

export function createSharedExpeditionDomain(seed: number, mode: HorrorCorridorV2Mode, roomCode?: string) {
  let state = createInitialState(seed, mode, roomCode);
  let recoveredSnapshot: HorrorCorridorV2Snapshot | null = null;

  const snapshot = (): SharedExpeditionSnapshot => ({
    ...state,
    peers: Object.fromEntries(Object.entries(state.peers).map(([id, peer]) => [id, { ...peer }])),
  });

  return Object.freeze({
    snapshot,
    commit(simTimeMs: number) {
      state.revision += 1;
      state.lastPublishedAtMs = simTimeMs;
      return snapshot();
    },
    status(connection: SharedExpeditionSnapshot["connection"], peerId?: string, simTimeMs = 0) {
      state.connection = connection;
      if (peerId) {
        state.peers[peerId] = { id: peerId, connected: connection === "connected", lastSeenMs: simTimeMs };
      }
      return snapshot();
    },
    presence(peerId: string, connected: boolean, simTimeMs: number) {
      state.peers[peerId] = { id: peerId, connected, lastSeenMs: simTimeMs };
      state.connection = connected ? "connected" : "recovering";
      return snapshot();
    },
    accept(snapshotValue: HorrorCorridorV2Snapshot) {
      if (snapshotValue.sharedExpedition.revision < state.revision) return false;
      recoveredSnapshot = snapshotValue;
      state.revision = snapshotValue.sharedExpedition.revision;
      state.connection = "connected";
      return true;
    },
    takeRecoveredSnapshot() {
      const value = recoveredSnapshot;
      recoveredSnapshot = null;
      return value;
    },
    reset() {
      state = createInitialState(seed, mode, roomCode);
      recoveredSnapshot = null;
      return snapshot();
    },
    load(next: SharedExpeditionSnapshot) {
      state = {
        ...next,
        peers: Object.fromEntries(Object.entries(next.peers).map(([id, peer]) => [id, { ...peer }])),
      };
      return snapshot();
    },
  });
}
