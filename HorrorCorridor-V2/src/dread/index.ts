import type { DreadSnapshot, MonsterId } from "../contracts";
import type { DeterministicRandom } from "../composition/determinism";
import { clamp, normalizeAngle } from "../composition/determinism";
import { monsterForBuilding, MONSTERS_BY_ID, type MonsterProfile } from "../content/monsters";

const OPENING_SAFE_DISTANCE_METERS = 90;
const LATER_SAFE_DISTANCE_METERS = 55;

export type DreadOutcome =
  | Readonly<{ type: "encounter-started"; monster: MonsterProfile }>
  | Readonly<{ type: "repelled"; monster: MonsterProfile; study: "studied" | "collected" }>
  | Readonly<{ type: "caught"; monster: MonsterProfile }>;

type DreadState = {
  encounterId: string | null;
  monsterId: MonsterId | null;
  phase: DreadSnapshot["phase"];
  distanceMeters: number;
  bearingRadians: number;
  heardSide: DreadSnapshot["heardSide"];
  threat: number;
  signRemainingMs: number;
  beamHoldMs: number;
  blackoutRemainingMs: number;
  lastChanceRemainingMs: number;
  jumpscareRemainingMs: number;
  lastOutcome: DreadSnapshot["lastOutcome"];
  message: string;
};

function initialState(): DreadState {
  return {
    encounterId: null,
    monsterId: null,
    phase: "dormant",
    distanceMeters: 999,
    bearingRadians: 0,
    heardSide: null,
    threat: 0,
    signRemainingMs: 0,
    beamHoldMs: 0,
    blackoutRemainingMs: 0,
    lastChanceRemainingMs: 0,
    jumpscareRemainingMs: 0,
    lastOutcome: null,
    message: "Listen before the corridor listens back.",
  };
}

export type DreadDomain = ReturnType<typeof createDreadDomain>;

export function createDreadDomain(random: DeterministicRandom) {
  const initialRandomState = random.state();
  let state = initialState();
  let encounterCount = 0;

  const snapshot = (): DreadSnapshot => ({ ...state, randomState: random.state() });
  const currentMonster = () => (state.monsterId ? MONSTERS_BY_ID[state.monsterId] : null);
  const heardSide = (relativeBearing: number): DreadSnapshot["heardSide"] => {
    const angle = normalizeAngle(relativeBearing);
    if (Math.abs(angle) < 0.24) return "ahead";
    return angle > 0 ? "left" : "right";
  };

  return Object.freeze({
    snapshot,
    step(input: Readonly<{
      deltaMs: number;
      buildingNumber: number;
      distanceSinceEncounter: number;
      playerYaw: number;
      flashlightEffective: boolean;
      beamContact: boolean;
      isMoving: boolean;
    }>): readonly DreadOutcome[] {
      const outcomes: DreadOutcome[] = [];
      const deltaSeconds = input.deltaMs / 1_000;

      const safeDistance = input.buildingNumber === 1 ? OPENING_SAFE_DISTANCE_METERS : LATER_SAFE_DISTANCE_METERS;
      if (
        (state.phase === "dormant" || state.phase === "resolved") &&
        input.distanceSinceEncounter >= safeDistance
      ) {
        const monster = monsterForBuilding(input.buildingNumber);
        encounterCount += 1;
        state = {
          ...initialState(),
          encounterId: `${monster.id}-${input.buildingNumber}-${encounterCount}`,
          monsterId: monster.id,
          phase: "sign",
          distanceMeters: monster.initialDistanceMeters,
          bearingRadians: normalizeAngle(input.playerYaw + monster.bearingOffset + random.between(-0.025, 0.025)),
          heardSide: heardSide(monster.bearingOffset),
          threat: 0.08,
          signRemainingMs: monster.signDurationMs,
          message: monster.sign,
        };
        outcomes.push({ type: "encounter-started", monster });
      }

      const monster = currentMonster();
      if (!monster) return outcomes;
      const relativeBearing = normalizeAngle(state.bearingRadians - input.playerYaw);
      state.heardSide = heardSide(relativeBearing);

      if (state.phase === "sign") {
        state.signRemainingMs = Math.max(0, state.signRemainingMs - input.deltaMs);
        state.threat = 0.08 + (1 - state.signRemainingMs / monster.signDurationMs) * 0.08;
        if (state.signRemainingMs <= 0) {
          state.phase = "approaching";
          state.message = `${monster.name} is moving. ${monster.responseInstruction}`;
        }
      }

      if (state.phase === "approaching" || state.phase === "repelling" || state.phase === "last-chance") {
        const closingMultiplier = state.phase === "last-chance" ? 1.45 : 1;
        const inBeam = input.flashlightEffective && input.beamContact;
        const movementMultiplier = monster.movement === "rush-when-still"
          ? (input.isMoving ? 0.72 : 1.65)
          : monster.movement === "stall-in-beam"
            ? (inBeam ? 0.12 : 1.12)
            : monster.movement === "weave"
              ? 0.8 + Math.abs(Math.sin(state.distanceMeters * 1.7)) * 0.55
              : monster.movement === "surge-near" && state.distanceMeters < monster.initialDistanceMeters * 0.42
                ? 1.58
                : 1;
        state.distanceMeters = Math.max(0, state.distanceMeters - monster.approachMetersPerSecond * closingMultiplier * movementMultiplier * deltaSeconds);
        state.threat = clamp(1 - state.distanceMeters / monster.initialDistanceMeters, 0.08, 1);
        const responseSatisfied = monster.response === "move-with-beam"
          ? input.isMoving
          : monster.response === "stand-with-beam"
            ? !input.isMoving
            : true;
        if (inBeam && responseSatisfied) {
          state.beamHoldMs += input.deltaMs;
          if (state.phase !== "last-chance") state.phase = "repelling";
          state.message = monster.responseInstruction;
        } else {
          state.beamHoldMs = Math.max(0, state.beamHoldMs - input.deltaMs * 0.65);
          if (state.phase === "repelling") state.phase = "approaching";
          if (inBeam && !responseSatisfied) state.message = monster.responseInstruction;
        }

        if (state.beamHoldMs >= monster.beamHoldMs) {
          const study = state.phase === "last-chance" ? "collected" : "studied";
          state.phase = "resolved";
          state.lastOutcome = study;
          state.threat = 0;
          state.distanceMeters = monster.initialDistanceMeters + 8;
          state.message = study === "collected"
            ? `${monster.name} entered the Monster Index.`
            : `${monster.name} was studied, but not fully collected.`;
          outcomes.push({ type: "repelled", monster, study });
          return outcomes;
        }

        if (state.phase !== "last-chance" && state.distanceMeters <= 2.2) {
          state.phase = "blackout";
          state.blackoutRemainingMs = 3_000;
          state.beamHoldMs = 0;
          state.message = "The flashlight is dead. Keep moving. Listen.";
        }
      } else if (state.phase === "blackout") {
        state.blackoutRemainingMs = Math.max(0, state.blackoutRemainingMs - input.deltaMs);
        state.threat = 0.96;
        if (state.blackoutRemainingMs <= 0) {
          state.phase = "last-chance";
          state.lastChanceRemainingMs = monster.lastChanceMs;
          state.message = "LAST CHANCE — find the sound and hold the light.";
        }
      } else if (state.phase === "jumpscare") {
        state.jumpscareRemainingMs = Math.max(0, state.jumpscareRemainingMs - input.deltaMs);
        state.threat = 1;
        if (state.jumpscareRemainingMs <= 0) {
          state.lastOutcome = "caught";
          state.message = `${monster.name} caught you.`;
          outcomes.push({ type: "caught", monster });
        }
      }

      if (state.phase === "last-chance") {
        state.lastChanceRemainingMs = input.isMoving
          ? Math.min(monster.lastChanceMs, state.lastChanceRemainingMs + input.deltaMs * 0.12)
          : Math.max(0, state.lastChanceRemainingMs - input.deltaMs);
        if (input.isMoving && !input.beamContact) {
          state.message = "It cannot close the distance while your footsteps continue.";
        }
        if (state.lastChanceRemainingMs <= 0) {
          state.phase = "jumpscare";
          state.jumpscareRemainingMs = 2_400;
          state.message = monster.failureConsequence;
        }
      }

      return outcomes;
    },
    forceDormant() {
      state = initialState();
      return snapshot();
    },
    reset() {
      random.restore(initialRandomState);
      encounterCount = 0;
      state = initialState();
      return snapshot();
    },
    load(next: DreadSnapshot) {
      const { randomState, ...rest } = next;
      random.restore(randomState);
      state = { ...rest };
      return snapshot();
    },
  });
}
