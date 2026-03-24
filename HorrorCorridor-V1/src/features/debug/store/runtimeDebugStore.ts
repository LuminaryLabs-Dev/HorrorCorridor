"use client";

import { create } from "zustand";

import type { AppScreenState, GameScreenState, PlayerId, ReplicatedGameSnapshot, WorldPosition } from "@/types/shared";
import type { PlayerInputSnapshot } from "@/features/player/domain/input";

const DEBUG_QUERY_VALUES = new Set(["1", "true", "frames", "verbose"]);
const DEBUG_STORAGE_KEY = "horror-corridor:runtime-debug";
const DEBUG_OVERLAY_STORAGE_KEY = "horror-corridor:runtime-debug-overlay";
const MAX_RUNTIME_DEBUG_FRAMES = 180;
const MAX_RUNTIME_DEBUG_EVENTS = 80;

export type RuntimeDebugFrameMode = "host-sim" | "client-sim" | "snapshot-replay" | "idle";

export type RuntimeDebugLocalPose = Readonly<{
  position: WorldPosition;
  rotationY: number;
  pitch: number;
  velocity: WorldPosition;
  carryingCubeId: string | null;
}>;

export type RuntimeDebugLocalSnapshotPlayer = Readonly<{
  id: PlayerId;
  color: string;
  position: WorldPosition;
  rotationY: number;
  pitch: number;
}> | null;

export type RuntimeDebugCubeRecord = Readonly<{
  id: string;
  color: ReplicatedGameSnapshot["cubes"][number]["color"];
  state: ReplicatedGameSnapshot["cubes"][number]["state"];
  ownerId: PlayerId | null;
  position: WorldPosition;
}>;

export type RuntimeDebugAnomalyRecord = Readonly<{
  sequence: readonly string[];
  slots: readonly (string | null)[];
}>;

export type RuntimeDebugCadenceRecord = Readonly<{
  networkTickAgeMs: number;
  authoritativePublishesPerSecond: number;
  clientUpdatesPerSecond: number;
  uiSyncsPerSecond: number;
}>;

export type RuntimeDebugFrameRecord = Readonly<{
  frameNumber: number;
  deltaMs: number;
  elapsedMs: number;
  recordedAtMs: number;
  mode: RuntimeDebugFrameMode;
  screen: AppScreenState;
  pointerLocked: boolean;
  roomId: string | null;
  localPlayerId: PlayerId | null;
  localPose: RuntimeDebugLocalPose;
  input: PlayerInputSnapshot;
  snapshot: Readonly<{
    tick: number | null;
    timestampMs: number | null;
    appState: AppScreenState | null;
    gameState: GameScreenState | null;
    playerCount: number;
    cubeCount: number;
    oozeCount: number;
    slotsFilled: number;
    cubeStates: Readonly<{
      ground: number;
      held: number;
      placed: number;
    }>;
    localPlayer: RuntimeDebugLocalSnapshotPlayer;
  }>;
  cubes: readonly RuntimeDebugCubeRecord[];
  anomaly: RuntimeDebugAnomalyRecord;
  cadence: RuntimeDebugCadenceRecord;
}>;

export type RuntimeDebugEventRecord = Readonly<{
  id: string;
  kind: string;
  recordedAtMs: number;
  message: string;
  payload: Readonly<Record<string, unknown>> | null;
}>;

export type RuntimeDebugExport = Readonly<{
  enabled: boolean;
  overlayVisible: boolean;
  latestFrame: RuntimeDebugFrameRecord | null;
  frames: readonly RuntimeDebugFrameRecord[];
  events: readonly RuntimeDebugEventRecord[];
}>;

type RuntimeDebugState = Readonly<{
  enabled: boolean;
  overlayVisible: boolean;
  latestFrame: RuntimeDebugFrameRecord | null;
  frames: readonly RuntimeDebugFrameRecord[];
  events: readonly RuntimeDebugEventRecord[];
}>;

type RuntimeDebugActions = Readonly<{
  setEnabled: (enabled: boolean) => void;
  setOverlayVisible: (visible: boolean) => void;
  recordFrame: (frame: RuntimeDebugFrameRecord) => void;
  recordEvent: (event: Omit<RuntimeDebugEventRecord, "id" | "recordedAtMs"> & Partial<Pick<RuntimeDebugEventRecord, "id" | "recordedAtMs">>) => void;
  clear: () => void;
}>;

type RuntimeDebugStore = RuntimeDebugState & RuntimeDebugActions;

const initialState: RuntimeDebugState = {
  enabled: false,
  overlayVisible: false,
  latestFrame: null,
  frames: [],
  events: [],
};

const trimToLimit = <T,>(items: readonly T[], limit: number): readonly T[] =>
  items.length <= limit ? items : items.slice(items.length - limit);

const writeDebugPreferences = (enabled: boolean, overlayVisible: boolean): void => {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(DEBUG_STORAGE_KEY, enabled ? "1" : "0");
  window.localStorage.setItem(DEBUG_OVERLAY_STORAGE_KEY, overlayVisible ? "1" : "0");
};

const cloneWorldPosition = (position: WorldPosition): WorldPosition => ({
  x: position.x,
  y: position.y,
  z: position.z,
});

const cloneFrameRecord = (frame: RuntimeDebugFrameRecord): RuntimeDebugFrameRecord => ({
  ...frame,
  localPose: {
    ...frame.localPose,
    position: cloneWorldPosition(frame.localPose.position),
    velocity: cloneWorldPosition(frame.localPose.velocity),
  },
  input: {
    ...frame.input,
  },
  snapshot: {
    ...frame.snapshot,
    localPlayer: frame.snapshot.localPlayer
      ? {
          ...frame.snapshot.localPlayer,
          position: cloneWorldPosition(frame.snapshot.localPlayer.position),
        }
      : null,
    cubeStates: {
      ...frame.snapshot.cubeStates,
    },
  },
  cubes: frame.cubes.map((cube) => ({
    ...cube,
    position: cloneWorldPosition(cube.position),
  })),
  anomaly: {
    sequence: [...frame.anomaly.sequence],
    slots: [...frame.anomaly.slots],
  },
  cadence: {
    ...frame.cadence,
  },
});

const cloneEventRecord = (event: RuntimeDebugEventRecord): RuntimeDebugEventRecord => ({
  ...event,
  payload: event.payload ? { ...event.payload } : null,
});

export const useRuntimeDebugStore = create<RuntimeDebugStore>((set) => ({
  ...initialState,
  setEnabled: (enabled) =>
    set((state) => {
      writeDebugPreferences(enabled, state.overlayVisible);

      return {
        enabled,
      };
    }),
  setOverlayVisible: (overlayVisible) =>
    set((state) => {
      writeDebugPreferences(state.enabled, overlayVisible);

      return {
        overlayVisible,
      };
    }),
  recordFrame: (frame) =>
    set((state) => {
      if (!state.enabled) {
        return state;
      }

      const nextFrame = cloneFrameRecord(frame);
      const nextFrames = trimToLimit([...state.frames, nextFrame], MAX_RUNTIME_DEBUG_FRAMES);

      return {
        latestFrame: nextFrame,
        frames: nextFrames,
      };
    }),
  recordEvent: (event) =>
    set((state) => {
      if (!state.enabled) {
        return state;
      }

      const nextEvent = cloneEventRecord({
        id: event.id ?? `debug-event-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        kind: event.kind,
        recordedAtMs: event.recordedAtMs ?? Date.now(),
        message: event.message,
        payload: event.payload ? { ...event.payload } : null,
      });

      return {
        events: trimToLimit([...state.events, nextEvent], MAX_RUNTIME_DEBUG_EVENTS),
      };
    }),
  clear: () =>
    set((state) => ({
      ...state,
      latestFrame: null,
      frames: [],
      events: [],
    })),
}));

const getDebugExport = (): RuntimeDebugExport => {
  const state = useRuntimeDebugStore.getState();

  return {
    enabled: state.enabled,
    overlayVisible: state.overlayVisible,
    latestFrame: state.latestFrame ? cloneFrameRecord(state.latestFrame) : null,
    frames: state.frames.map(cloneFrameRecord),
    events: state.events.map(cloneEventRecord),
  };
};

const queryEnablesDebug = (): boolean => {
  if (typeof window === "undefined") {
    return false;
  }

  const params = new URLSearchParams(window.location.search);
  const debugValue = params.get("debug")?.toLowerCase() ?? "";
  const framesValue = params.get("debugFrames")?.toLowerCase() ?? "";

  return DEBUG_QUERY_VALUES.has(debugValue) || DEBUG_QUERY_VALUES.has(framesValue);
};

export const initializeRuntimeDebug = (): void => {
  if (typeof window === "undefined") {
    return;
  }

  const storedEnabled = window.localStorage.getItem(DEBUG_STORAGE_KEY) === "1";
  const storedOverlayVisible = window.localStorage.getItem(DEBUG_OVERLAY_STORAGE_KEY) === "1";
  const queryEnabled = queryEnablesDebug();
  const store = useRuntimeDebugStore.getState();

  if (queryEnabled && !store.enabled) {
    store.setEnabled(true);
  } else if (storedEnabled && !store.enabled) {
    store.setEnabled(true);
  }

  if (queryEnabled && !store.overlayVisible) {
    store.setOverlayVisible(true);
  } else if (storedOverlayVisible && !store.overlayVisible) {
    store.setOverlayVisible(true);
  }

  attachRuntimeDebugWindowApi();
};

export const recordRuntimeDebugFrame = (frame: RuntimeDebugFrameRecord): void => {
  useRuntimeDebugStore.getState().recordFrame(frame);
};

export const recordRuntimeDebugEvent = (
  event: Omit<RuntimeDebugEventRecord, "id" | "recordedAtMs"> & Partial<Pick<RuntimeDebugEventRecord, "id" | "recordedAtMs">>,
): void => {
  useRuntimeDebugStore.getState().recordEvent(event);
};

export const clearRuntimeDebug = (): void => {
  useRuntimeDebugStore.getState().clear();
};

export const attachRuntimeDebugWindowApi = (): void => {
  if (typeof window === "undefined") {
    return;
  }

  window.__HORROR_CORRIDOR_DEBUG__ = {
    enable: () => useRuntimeDebugStore.getState().setEnabled(true),
    disable: () => useRuntimeDebugStore.getState().setEnabled(false),
    showOverlay: () => useRuntimeDebugStore.getState().setOverlayVisible(true),
    hideOverlay: () => useRuntimeDebugStore.getState().setOverlayVisible(false),
    clear: () => useRuntimeDebugStore.getState().clear(),
    getLatestFrame: () => getDebugExport().latestFrame,
    getFrames: () => getDebugExport().frames,
    getEvents: () => getDebugExport().events,
    extractState: () => getDebugExport(),
  };
};

export type RuntimeDebugWindowApi = Readonly<{
  enable: () => void;
  disable: () => void;
  showOverlay: () => void;
  hideOverlay: () => void;
  clear: () => void;
  getLatestFrame: () => RuntimeDebugFrameRecord | null;
  getFrames: () => readonly RuntimeDebugFrameRecord[];
  getEvents: () => readonly RuntimeDebugEventRecord[];
  extractState: () => RuntimeDebugExport;
}>;

declare global {
  interface Window {
    __HORROR_CORRIDOR_DEBUG__?: RuntimeDebugWindowApi;
  }
}
