import type {
  HorrorCorridorV2Action,
  HorrorCorridorV2Runtime,
  SemanticInput,
} from "../contracts";
import { normalizeAngle } from "../composition/determinism";
import { MONSTERS_BY_ID } from "../content/monsters";

export type SemanticCallRecord = Readonly<{
  call: string;
  atMs: number;
  sincePreviousMs: number | null;
  digest: string;
}>;

export type HorrorCorridorSemanticControl = Readonly<{
  version: "horror-corridor-v2.control/1";
  tools: readonly string[];
  status: () => unknown;
  encounterContract: () => unknown;
  audioStatus: () => unknown;
  unlockAudio: () => Promise<unknown>;
  calls: () => readonly SemanticCallRecord[];
  start: () => unknown;
  manual: (active: boolean) => unknown;
  setInput: (input: Partial<SemanticInput>) => unknown;
  lookBy: (yawDelta: number, pitchDelta?: number) => unknown;
  aimAtMonster: () => unknown;
  flashlight: (active?: boolean) => unknown;
  interact: () => unknown;
  claimOffering: () => unknown;
  restart: () => unknown;
  step: (frames?: number, input?: Partial<SemanticInput>) => unknown;
  save: () => Promise<unknown>;
  load: () => Promise<unknown>;
  shutdown: () => unknown;
}>;

declare global {
  interface Window {
    __HORROR_CORRIDOR_V2__?: HorrorCorridorSemanticControl;
    __HORROR_CORRIDOR_DEBUG__?: Readonly<{
      enable: () => void;
      hideOverlay: () => void;
      extractState: () => unknown;
    }>;
    __HORROR_CORRIDOR_LIVE_CONTROL__?: Readonly<{
      resume: () => void;
      hold: () => void;
      isHeld: () => boolean;
      turnByRadians: (yawDelta: number) => void;
      lookByRadians: (yawDelta: number, pitchDelta: number) => void;
    }>;
    __HORROR_CORRIDOR_NEXUS__?: Readonly<{
      snapshot: () => unknown;
      performance: () => unknown;
      proveResetReplay: () => unknown;
    }>;
  }
}

type SemanticControlOptions = Readonly<{
  runtime: HorrorCorridorV2Runtime;
  setManual: (active: boolean) => void;
  getManual: () => boolean;
  renderNow: () => void;
  readiness: () => Readonly<Record<string, boolean>>;
  audioStatus: () => unknown;
  unlockAudio: () => Promise<unknown>;
  shutdownHost: () => void;
}>;

export function installSemanticControl(options: SemanticControlOptions): () => void {
  const records: SemanticCallRecord[] = [];
  let previousAt: number | null = null;

  const record = (call: string) => {
    const atMs = performance.now();
    records.push({
      call,
      atMs,
      sincePreviousMs: previousAt === null ? null : atMs - previousAt,
      digest: options.runtime.snapshot().digest,
    });
    previousAt = atMs;
    if (records.length > 80) records.splice(0, records.length - 80);
  };

  const invoke = <T>(call: string, task: () => T): T => {
    const result = task();
    options.renderNow();
    record(call);
    return result;
  };

  const tools = Object.freeze([
    "status",
    "encounterContract",
    "audioStatus",
    "unlockAudio",
    "calls",
    "start",
    "manual",
    "setInput",
    "lookBy",
    "aimAtMonster",
    "flashlight",
    "interact",
    "claimOffering",
    "restart",
    "step",
    "save",
    "load",
    "shutdown",
  ]);

  const control: HorrorCorridorSemanticControl = Object.freeze({
    version: "horror-corridor-v2.control/1",
    tools,
    status: () => invoke("status", () => ({
      readiness: options.readiness(),
      manual: options.getManual(),
      diagnostics: options.runtime.diagnostics(),
      snapshot: options.runtime.snapshot(),
      recentCalls: [...records.slice(-8)],
    })),
    encounterContract: () => invoke("encounterContract", () => {
      const snapshot = options.runtime.snapshot();
      const profile = snapshot.dread.monsterId ? MONSTERS_BY_ID[snapshot.dread.monsterId] : null;
      if (!profile) return null;
      return {
        id: profile.id,
        name: profile.name,
        sensoryChannel: profile.sensoryChannel,
        movement: profile.movement,
        response: profile.response,
        responseInstruction: profile.responseInstruction,
        failureConsequence: profile.failureConsequence,
      };
    }),
    audioStatus: () => invoke("audioStatus", options.audioStatus),
    unlockAudio: async () => {
      const result = await options.unlockAudio();
      options.renderNow();
      record("unlockAudio");
      return result;
    },
    calls: () => [...records],
    start: () => invoke("start", options.runtime.start),
    manual: (active) => invoke(`manual:${active}`, () => {
      options.setManual(active);
      return { manual: active, snapshot: options.runtime.snapshot() };
    }),
    setInput: (input) => invoke("setInput", () => options.runtime.dispatch({ type: "set-input", input })),
    lookBy: (yawDelta, pitchDelta = 0) => invoke("lookBy", () => options.runtime.dispatch({ type: "look", yawDelta, pitchDelta })),
    aimAtMonster: () => invoke("aimAtMonster", () => {
      const snapshot = options.runtime.snapshot();
      if (!snapshot.dread.monsterId) return snapshot;
      return options.runtime.dispatch({
        type: "look",
        yawDelta: normalizeAngle(snapshot.dread.bearingRadians - snapshot.party.yaw),
        pitchDelta: -snapshot.party.pitch - 0.02,
      });
    }),
    flashlight: (active) => invoke("flashlight", () => options.runtime.dispatch({ type: "flashlight", active })),
    interact: () => invoke("interact", () => options.runtime.dispatch({ type: "interact" })),
    claimOffering: () => invoke("claimOffering", () => options.runtime.dispatch({ type: "claim-offering" })),
    restart: () => invoke("restart", () => options.runtime.dispatch({ type: "restart" })),
    step: (frames = 1, input) => invoke(`step:${frames}`, () => {
      if (input) options.runtime.dispatch({ type: "set-input", input });
      const frameCount = Math.max(0, Math.min(36_000, Math.floor(frames)));
      for (let frame = 0; frame < frameCount; frame += 1) options.runtime.tick(1 / 60);
      return options.runtime.snapshot();
    }),
    save: async () => {
      const result = await options.runtime.save();
      options.renderNow();
      record("save");
      return result;
    },
    load: async () => {
      const result = await options.runtime.load();
      options.renderNow();
      record("load");
      return { loaded: result, snapshot: options.runtime.snapshot() };
    },
    shutdown: () => invoke("shutdown", () => {
      options.shutdownHost();
      return { disposed: true };
    }),
  });

  window.__HORROR_CORRIDOR_V2__ = control;
  const legacyFrame = () => {
    const snapshot = options.runtime.snapshot();
    const screen = snapshot.expedition.phase === "title"
      ? "TITLE"
      : snapshot.expedition.phase === "caught"
        ? "COMPLETED"
        : "PLAYING";
    return {
      screen,
      roomId: snapshot.corridor.chamberId,
      localPlayerId: snapshot.party.explorerId,
      gameState: screen,
      snapshot: { gameState: screen },
      expedition: {
        ...snapshot.expedition,
        activeEncounter: snapshot.dread.monsterId ? {
          encounterNumber: snapshot.expedition.monsterIndex[snapshot.dread.monsterId].encounters,
          monsterId: snapshot.dread.monsterId,
          state: snapshot.dread.phase,
          bearingRadians: snapshot.dread.bearingRadians,
          distance: snapshot.dread.distanceMeters,
          blackoutRemainingMs: snapshot.dread.blackoutRemainingMs,
          lastChanceRemainingMs: snapshot.dread.lastChanceRemainingMs,
          fullScareWitnessed: snapshot.dread.lastOutcome === "collected",
        } : null,
      },
      localPose: {
        position: snapshot.party.position,
        rotationY: snapshot.party.yaw,
        pitch: snapshot.party.pitch,
      },
      sceneDressing: {
        lightCount: 8,
        propCount: 68,
        textureCount: 0,
        referenceRoom: {
          id: snapshot.corridor.chamberId,
          streamedBuildingNumber: snapshot.expedition.buildingNumber,
        },
      },
    };
  };
  window.__HORROR_CORRIDOR_DEBUG__ = Object.freeze({
    enable: () => undefined,
    hideOverlay: () => document.documentElement.classList.add("legacy-harness-clean"),
    extractState: () => {
      const latestFrame = legacyFrame();
      return { enabled: true, events: [], frames: [latestFrame], latestFrame, overlayVisible: false };
    },
  });
  window.__HORROR_CORRIDOR_LIVE_CONTROL__ = Object.freeze({
    resume: () => {
      options.setManual(false);
      if (options.runtime.snapshot().expedition.phase === "paused") {
        options.runtime.dispatch({ type: "pause", paused: false });
      }
    },
    hold: () => {
      options.runtime.dispatch({ type: "set-input", input: { forward: 0, strafe: 0, turn: 0, sprint: false } });
      options.setManual(true);
    },
    isHeld: () => options.getManual(),
    turnByRadians: (yawDelta) => {
      options.runtime.dispatch({ type: "look", yawDelta, pitchDelta: 0 });
      options.renderNow();
    },
    lookByRadians: (yawDelta, pitchDelta) => {
      options.runtime.dispatch({ type: "look", yawDelta, pitchDelta });
      options.renderNow();
    },
  });
  window.__HORROR_CORRIDOR_NEXUS__ = Object.freeze({
    snapshot: () => {
      const diagnostics = options.runtime.diagnostics();
      const snapshot = options.runtime.snapshot();
      return {
        version: "horror-corridor-v2.nexus-proof/1",
        source: "nexusengine-authoritative-composition",
        counts: { domains: diagnostics.domainPaths.length, kits: diagnostics.installOrder.length },
        domains: [
          { path: diagnostics.domainPaths[0], state: snapshot.expedition },
          { path: diagnostics.domainPaths[1], state: snapshot.corridor },
          { path: diagnostics.domainPaths[2], state: snapshot.party },
          { path: diagnostics.domainPaths[3], state: snapshot.dread },
          { path: diagnostics.domainPaths[4], state: snapshot.sharedExpedition },
        ],
        registeredDomainPaths: diagnostics.domainPaths,
        installOrder: diagnostics.installOrder,
        coreKitIds: diagnostics.installOrder.slice(0, diagnostics.coreKitCount),
        compositionKitIds: diagnostics.installOrder.slice(diagnostics.coreKitCount),
        descriptorKitIds: [],
      };
    },
    performance: () => ({ fixedStepHz: 60, networkHz: 20, uiHz: 10 }),
    proveResetReplay: () => ({ passed: false, reason: "Run npm run proof:runtime for an isolated reset/replay proof." }),
  });
  return () => {
    if (window.__HORROR_CORRIDOR_V2__ === control) delete window.__HORROR_CORRIDOR_V2__;
    delete window.__HORROR_CORRIDOR_DEBUG__;
    delete window.__HORROR_CORRIDOR_LIVE_CONTROL__;
    delete window.__HORROR_CORRIDOR_NEXUS__;
    document.documentElement.classList.remove("legacy-harness-clean");
  };
}

export function dispatchSemantic(runtime: HorrorCorridorV2Runtime, action: HorrorCorridorV2Action): void {
  runtime.dispatch(action);
}
