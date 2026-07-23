import type {
  ExpeditionPhase,
  ExpeditionSnapshot,
  MonsterId,
  MonsterIndexEntry,
  MonsterStudy,
} from "../contracts";
import { MONSTER_PROFILES } from "../content/monsters";

type ExpeditionState = {
  phase: ExpeditionPhase;
  runId: string;
  seed: number;
  elapsedMs: number;
  distanceMeters: number;
  distanceSinceEncounter: number;
  score: number;
  fate: ExpeditionSnapshot["fate"];
  buildingNumber: number;
  chronicle: string[];
  monsterIndex: Record<MonsterId, MonsterIndexEntry>;
};

function createIndex(): Record<MonsterId, MonsterIndexEntry> {
  return Object.fromEntries(
    MONSTER_PROFILES.map((profile) => [
      profile.id,
      {
        monsterId: profile.id,
        status: "unseen" as const,
        encounters: 0,
        survivals: 0,
        captures: 0,
        firstBuilding: null,
      },
    ]),
  ) as Record<MonsterId, MonsterIndexEntry>;
}

function cloneIndex(index: Readonly<Record<MonsterId, MonsterIndexEntry>>): Record<MonsterId, MonsterIndexEntry> {
  return Object.fromEntries(Object.entries(index).map(([id, entry]) => [id, { ...entry }])) as Record<MonsterId, MonsterIndexEntry>;
}

function initialState(seed: number, runNumber = 1): ExpeditionState {
  return {
    phase: "title",
    runId: `${seed.toString(16).padStart(8, "0")}-${runNumber}`,
    seed,
    elapsedMs: 0,
    distanceMeters: 0,
    distanceSinceEncounter: 0,
    score: 0,
    fate: "unwritten",
    buildingNumber: 1,
    chronicle: [],
    monsterIndex: createIndex(),
  };
}

export type ExpeditionDomain = ReturnType<typeof createExpeditionDomain>;

export function createExpeditionDomain(seed: number) {
  let runNumber = 1;
  let state = initialState(seed, runNumber);
  let cachedSnapshot: ExpeditionSnapshot | null = null;

  const invalidateSnapshot = () => {
    cachedSnapshot = null;
  };

  const addChronicle = (entry: string) => {
    state.chronicle = [entry, ...state.chronicle].slice(0, 16);
  };

  const snapshot = (): ExpeditionSnapshot => {
    if (!cachedSnapshot) {
      cachedSnapshot = {
        ...state,
        chronicle: [...state.chronicle],
        monsterIndex: cloneIndex(state.monsterIndex),
      };
    }
    return cachedSnapshot;
  };

  const api = {
    snapshot,
    begin() {
      if (state.phase === "title" || state.phase === "paused") {
        state.phase = "delving";
        state.fate = "alive";
        addChronicle("The service lift closed. The corridor kept going.");
        invalidateSnapshot();
      }
      return snapshot();
    },
    step(deltaMs: number, distanceMeters: number) {
      if (state.phase !== "delving") return snapshot();
      state.elapsedMs += deltaMs;
      state.distanceMeters += distanceMeters;
      state.distanceSinceEncounter += distanceMeters;
      state.score += distanceMeters * 2;
      invalidateSnapshot();
      return snapshot();
    },
    hearMonster(monsterId: MonsterId, monsterName: string) {
      const current = state.monsterIndex[monsterId];
      state.monsterIndex[monsterId] = {
        ...current,
        status: current.status === "unseen" ? "heard" : current.status,
        encounters: current.encounters + 1,
        firstBuilding: current.firstBuilding ?? state.buildingNumber,
      };
      state.distanceSinceEncounter = 0;
      addChronicle(`${monsterName} announced itself in Building ${state.buildingNumber}.`);
      invalidateSnapshot();
      return snapshot();
    },
    recordOutcome(monsterId: MonsterId, monsterName: string, outcome: Extract<MonsterStudy, "studied" | "collected">) {
      const current = state.monsterIndex[monsterId];
      const status: MonsterStudy = outcome === "collected" || current.status === "collected" ? "collected" : "studied";
      state.monsterIndex[monsterId] = {
        ...current,
        status,
        survivals: current.survivals + 1,
        captures: current.captures + (outcome === "collected" ? 1 : 0),
      };
      state.score += outcome === "collected" ? 300 : 120;
      state.phase = "offering";
      addChronicle(
        outcome === "collected"
          ? `${monsterName} completed its scare. You stayed long enough to collect it.`
          : `${monsterName} withdrew under the beam. Its habits were studied.`,
      );
      invalidateSnapshot();
      return snapshot();
    },
    caught(monsterId: MonsterId, monsterName: string) {
      const current = state.monsterIndex[monsterId];
      state.monsterIndex[monsterId] = {
        ...current,
        encounters: Math.max(1, current.encounters),
      };
      state.phase = "caught";
      state.fate = "caught";
      addChronicle(`${monsterName} found the quiet between your footsteps.`);
      invalidateSnapshot();
      return snapshot();
    },
    advanceBuilding() {
      state.buildingNumber += 1;
      state.distanceSinceEncounter = 0;
      state.phase = "delving";
      state.score += 50;
      addChronicle(`The threshold opened into Building ${state.buildingNumber}.`);
      invalidateSnapshot();
      return snapshot();
    },
    pause(paused: boolean) {
      if (state.phase === "caught" || state.phase === "title") return snapshot();
      state.phase = paused ? "paused" : "delving";
      invalidateSnapshot();
      return snapshot();
    },
    restartRun() {
      const retainedIndex = cloneIndex(state.monsterIndex);
      const retainedChronicle = [...state.chronicle];
      runNumber += 1;
      state = initialState(seed, runNumber);
      state.monsterIndex = retainedIndex;
      state.chronicle = retainedChronicle;
      state.phase = "delving";
      state.fate = "alive";
      addChronicle("Another lift opened. The Index remembered.");
      invalidateSnapshot();
      return snapshot();
    },
    reset() {
      runNumber = 1;
      state = initialState(seed, runNumber);
      invalidateSnapshot();
      return snapshot();
    },
    load(next: ExpeditionSnapshot) {
      state = {
        ...next,
        chronicle: [...next.chronicle],
        monsterIndex: cloneIndex(next.monsterIndex),
      };
      const suffix = Number(next.runId.split("-").at(-1));
      runNumber = Number.isFinite(suffix) ? suffix : runNumber;
      invalidateSnapshot();
      return snapshot();
    },
  } as const;

  return Object.freeze(api);
}
