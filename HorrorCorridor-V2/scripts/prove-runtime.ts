import assert from "node:assert/strict";
import { createHorrorCorridorV2 } from "../src/composition/createHorrorCorridorV2";
import { createDeterministicRandom, deterministicDigest, normalizeAngle } from "../src/composition/determinism";
import { createMemoryPersistenceAdapter } from "../src/adapters/persistence";
import { createSensoryCuePlan } from "../src/adapters/spatialAudio";
import type { HorrorCorridorV2Runtime, HorrorCorridorV2Snapshot, SemanticInput } from "../src/contracts";
import { createExpeditionDomain } from "../src/expedition";
import { createCorridorDomain } from "../src/corridor";
import { createPartyDomain } from "../src/party";
import { createDreadDomain } from "../src/dread";
import { createSharedExpeditionDomain } from "../src/shared-expedition";
import {
  CORRIDOR_DISTRICTS,
  CORRIDOR_SEGMENT_LENGTH_METERS,
  WALKABLE_CONTENT_MINUTES,
  WALKABLE_CONTENT_SEGMENTS,
  createCorridorSetPiece,
  districtForSegment,
} from "../src/content/chamber";
import { MONSTER_FAMILY_COUNT, MONSTER_PROFILES, MONSTERS_BY_ID, type MonsterProfile } from "../src/content/monsters";

const STEP = 1 / 60;

function tick(runtime: HorrorCorridorV2Runtime, frames = 1, input?: Partial<SemanticInput>): HorrorCorridorV2Snapshot {
  if (input) runtime.dispatch({ type: "set-input", input });
  for (let frame = 0; frame < frames; frame += 1) runtime.tick(STEP);
  return runtime.snapshot();
}

function until(
  runtime: HorrorCorridorV2Runtime,
  predicate: (snapshot: HorrorCorridorV2Snapshot) => boolean,
  maximumFrames: number,
  input?: Partial<SemanticInput>,
): HorrorCorridorV2Snapshot {
  if (input) runtime.dispatch({ type: "set-input", input });
  for (let frame = 0; frame < maximumFrames; frame += 1) {
    const snapshot = runtime.tick(STEP);
    if (predicate(snapshot)) return snapshot;
  }
  throw new Error(`Runtime proof condition timed out after ${maximumFrames} frames. Last state: ${JSON.stringify(runtime.snapshot())}`);
}

function stop(runtime: HorrorCorridorV2Runtime): void {
  runtime.dispatch({ type: "set-input", input: { forward: 0, strafe: 0, turn: 0, sprint: false } });
}

function moveUntilEncounter(runtime: HorrorCorridorV2Runtime): HorrorCorridorV2Snapshot {
  const snapshot = until(runtime, (value) => value.dread.phase === "approaching", 3_000, { forward: 1, sprint: false });
  stop(runtime);
  return snapshot;
}

function applyMonsterResponse(runtime: HorrorCorridorV2Runtime, monster: MonsterProfile): void {
  runtime.dispatch({
    type: "set-input",
    input: { forward: monster.response === "move-with-beam" ? 1 : 0, strafe: 0, turn: 0, sprint: false },
  });
}

function aimAtMonster(runtime: HorrorCorridorV2Runtime): void {
  const snapshot = runtime.snapshot();
  assert(snapshot.dread.monsterId, "An active monster is required before aiming.");
  runtime.dispatch({
    type: "look",
    yawDelta: normalizeAngle(snapshot.dread.bearingRadians - snapshot.party.yaw),
    pitchDelta: -snapshot.party.pitch,
  });
}

function studyEncounter(runtime: HorrorCorridorV2Runtime): HorrorCorridorV2Snapshot {
  const encounter = moveUntilEncounter(runtime);
  const monsterId = encounter.dread.monsterId;
  assert(monsterId);
  const monster = MONSTERS_BY_ID[monsterId];
  aimAtMonster(runtime);
  runtime.dispatch({ type: "flashlight", active: true });
  applyMonsterResponse(runtime, monster);
  const resolved = until(runtime, (value) => value.expedition.phase === "offering", 300);
  assert.equal(resolved.expedition.monsterIndex[monsterId].status, "studied");
  assert(resolved.corridor.offering, "Studying a monster must open an offering.");
  return resolved;
}

function collectEncounter(runtime: HorrorCorridorV2Runtime): HorrorCorridorV2Snapshot {
  const encounter = moveUntilEncounter(runtime);
  const monsterId = encounter.dread.monsterId;
  assert(monsterId);
  const monster = MONSTERS_BY_ID[monsterId];
  runtime.dispatch({ type: "flashlight", active: false });
  until(runtime, (value) => value.dread.phase === "blackout", 1_800);
  const lastChance = until(runtime, (value) => value.dread.phase === "last-chance", 240);
  assert(lastChance.dread.lastChanceRemainingMs > 0);
  aimAtMonster(runtime);
  runtime.dispatch({ type: "flashlight", active: true });
  applyMonsterResponse(runtime, monster);
  const resolved = until(runtime, (value) => value.expedition.phase === "offering", 240);
  assert.equal(resolved.expedition.monsterIndex[monsterId].status, "collected");
  return resolved;
}

function loseEncounter(runtime: HorrorCorridorV2Runtime): HorrorCorridorV2Snapshot {
  moveUntilEncounter(runtime);
  runtime.dispatch({ type: "flashlight", active: false });
  stop(runtime);
  const caught = until(runtime, (value) => value.expedition.phase === "caught", 2_600);
  assert.equal(caught.party.condition, "captured");
  assert.equal(caught.expedition.fate, "caught");
  return caught;
}

function deterministicOpening(seed: string): string {
  const runtime = createHorrorCorridorV2({ seed });
  runtime.start();
  tick(runtime, 210, { forward: 1 });
  stop(runtime);
  tick(runtime, 45);
  const digest = runtime.snapshot().digest;
  runtime.dispose();
  return digest;
}

function proveIndependentDomainResets(): void {
  const expedition = createExpeditionDomain(101);
  const expeditionInitial = deterministicDigest(expedition.snapshot());
  expedition.begin();
  expedition.step(1_000, 3);
  expedition.reset();
  assert.equal(deterministicDigest(expedition.snapshot()), expeditionInitial);

  const corridor = createCorridorDomain(202, createDeterministicRandom(303));
  const corridorInitial = deterministicDigest(corridor.snapshot());
  assert.equal(corridor.resolveMotion({ x: 0, y: 1.68, z: -10_000 }).z, -10_000);
  corridor.step(3_200, false);
  corridor.openOffering(1);
  corridor.reset();
  assert.equal(deterministicDigest(corridor.snapshot()), corridorInitial);

  const party = createPartyDomain("reset-proof");
  const partyInitial = deterministicDigest(party.snapshot());
  party.look(0.7, 0.2);
  party.setFlashlight(false);
  party.reset();
  assert.equal(deterministicDigest(party.snapshot()), partyInitial);

  const dread = createDreadDomain(createDeterministicRandom(404));
  const dreadInitial = deterministicDigest(dread.snapshot());
  dread.step({
    deltaMs: 16,
    buildingNumber: 1,
    distanceSinceEncounter: 91,
    playerYaw: 0,
    flashlightEffective: false,
    beamContact: false,
    isMoving: true,
  });
  dread.reset();
  assert.equal(deterministicDigest(dread.snapshot()), dreadInitial);

  const shared = createSharedExpeditionDomain(505, "host", "RESET5");
  const sharedInitial = deterministicDigest(shared.snapshot());
  shared.commit(50);
  shared.status("connected", "peer", 50);
  shared.reset();
  assert.equal(deterministicDigest(shared.snapshot()), sharedInitial);
}

function proveContentDepth(): Readonly<{ monsters: number; families: number; sensoryAudioMotifs: number; districts: number; setPieces: number; meters: number; walkMinutes: number; simulatedWalkMeters: number }> {
  assert(MONSTER_PROFILES.length > 120, "The Monster Index must contain more than 120 built manifestations.");
  assert.equal(new Set(MONSTER_PROFILES.map((profile) => profile.id)).size, MONSTER_PROFILES.length);
  assert.equal(new Set(MONSTER_PROFILES.map((profile) => profile.name)).size, MONSTER_PROFILES.length);
  for (const monster of MONSTER_PROFILES) {
    assert(monster.sign.length > 12);
    assert(monster.indexDescription.length > 24);
    assert(monster.responseInstruction.length > 12);
    assert(monster.failureConsequence.length > 12);
  }

  const route = Array.from({ length: WALKABLE_CONTENT_SEGMENTS }, (_, segment) => ({
    district: districtForSegment(segment).id,
    setPiece: createCorridorSetPiece(0x48435632, segment, -segment * CORRIDOR_SEGMENT_LENGTH_METERS).kind,
  }));
  const districtCount = new Set(route.map((entry) => entry.district)).size;
  const setPieceCount = new Set(route.map((entry) => entry.setPiece)).size;
  assert.equal(districtCount, CORRIDOR_DISTRICTS.length);
  assert(setPieceCount >= 10, "The ten-minute route must realize at least ten set-piece identities.");
  const meters = WALKABLE_CONTENT_SEGMENTS * CORRIDOR_SEGMENT_LENGTH_METERS;
  const walkMinutes = meters / 3.05 / 60;
  assert(walkMinutes >= WALKABLE_CONTENT_MINUTES);

  const walkingCorridor = createCorridorDomain(707, createDeterministicRandom(808));
  const walkingParty = createPartyDomain("ten-minute-walker");
  let simulatedWalkMeters = 0;
  for (let frame = 0; frame < WALKABLE_CONTENT_MINUTES * 60 * 60; frame += 1) {
    simulatedWalkMeters += walkingParty.step(
      STEP,
      { forward: 1, strafe: 0, turn: 0, sprint: false },
      walkingCorridor.resolveMotion,
    ).distanceMeters;
  }
  assert(simulatedWalkMeters >= 1_829, "The real Party/Corridor motion path must remain walkable for ten continuous minutes.");
  assert(walkingParty.snapshot().position.z < -1_820, "Ten-minute traversal must progress forward without a blocker or reset.");

  const warning = createDreadDomain(createDeterministicRandom(909));
  warning.step({ deltaMs: 16, buildingNumber: 1, distanceSinceEncounter: 91, playerYaw: 0, flashlightEffective: false, beamContact: false, isMoving: true });
  const signed = warning.snapshot();
  assert.equal(signed.phase, "sign");
  const warnedDistance = signed.distanceMeters;
  warning.step({ deltaMs: 1_000, buildingNumber: 1, distanceSinceEncounter: 91, playerYaw: 0, flashlightEffective: false, beamContact: false, isMoving: true });
  assert.equal(warning.snapshot().phase, "sign", "A warning must remain audible before pursuit begins.");
  assert.equal(warning.snapshot().distanceMeters, warnedDistance, "A monster cannot close distance during its warning.");

  const sensoryChannels = ["footstep", "voice", "metal", "breath", "water", "electrical"] as const;
  const sensoryPlans = sensoryChannels.map((channel) => createSensoryCuePlan(channel, 0.6));
  assert.equal(new Set(sensoryPlans.map((plan) => plan.motif)).size, sensoryChannels.length, "Every sensory channel must own a distinct warning motif.");
  assert(sensoryPlans.every((plan) => plan.pulses.length >= 2), "Every sensory warning must form a recognizable multi-pulse pattern.");
  assert(sensoryPlans.every((plan) => plan.pulses.every((entry) => entry.durationSeconds > 0 && entry.gain > 0)), "Every sensory pulse must have an audible envelope.");

  return { monsters: MONSTER_PROFILES.length, families: MONSTER_FAMILY_COUNT, sensoryAudioMotifs: sensoryPlans.length, districts: districtCount, setPieces: setPieceCount, meters, walkMinutes, simulatedWalkMeters };
}

async function main(): Promise<void> {
  const persistence = createMemoryPersistenceAdapter();
  proveIndependentDomainResets();
  const content = proveContentDepth();
  const runtime = createHorrorCorridorV2({ seed: "proof-expedition", adapters: { persistence } });
  const developmentRuntime = createHorrorCorridorV2({ seed: "proof-development", development: true });

  assert.equal(runtime.diagnostics().coreKitCount, 36);
  assert.equal(developmentRuntime.diagnostics().coreKitCount, 38);
  assert.equal(new Set(runtime.diagnostics().installOrder).size, runtime.diagnostics().installOrder.length);
  assert(runtime.diagnostics().installOrder.includes("horror-corridor-v2-game-kit"));
  assert.equal(runtime.diagnostics().domainPaths.length, 5);
  developmentRuntime.dispose();

  const opening = runtime.start();
  assert.equal(opening.expedition.phase, "delving");
  assert.equal(opening.schema, "horror-corridor-v2.snapshot/1");

  const studied = studyEncounter(runtime);
  const studiedMonster = studied.dread.monsterId;
  assert(studiedMonster);
  const positionBeforeOffering = runtime.snapshot().party.position;
  runtime.dispatch({ type: "claim-offering" });
  assert.equal(runtime.snapshot().expedition.buildingNumber, 2);
  assert.equal(runtime.snapshot().expedition.phase, "delving");
  assert.deepEqual(runtime.snapshot().party.position, positionBeforeOffering);

  const collected = collectEncounter(runtime);
  const collectedMonster = collected.dread.monsterId;
  assert(collectedMonster);
  assert.equal(collected.expedition.monsterIndex[collectedMonster].status, "collected");

  const saved = await runtime.save();
  const savedDigest = saved.snapshot.digest;
  runtime.dispatch({ type: "restart" });
  tick(runtime, 12, { forward: 1 });
  assert.notEqual(runtime.snapshot().digest, savedDigest);
  assert.equal(await runtime.load(), true);
  assert.equal(runtime.snapshot().digest, savedDigest);
  assert.equal(runtime.snapshot().expedition.monsterIndex[studiedMonster].status, "studied");
  assert.equal(runtime.snapshot().expedition.monsterIndex[collectedMonster].status, "collected");

  runtime.dispatch({ type: "claim-offering" });
  const caught = loseEncounter(runtime);
  const indexBeforeRestart = caught.expedition.monsterIndex;
  runtime.dispatch({ type: "restart" });
  assert.equal(runtime.snapshot().expedition.phase, "delving");
  assert.deepEqual(runtime.snapshot().expedition.monsterIndex, indexBeforeRestart);

  const resetA = runtime.reset();
  tick(runtime, 90, { forward: 1 });
  runtime.reset();
  const resetB = runtime.snapshot();
  assert.equal(resetA.digest, resetB.digest);
  assert.equal(deterministicOpening("same-seed"), deterministicOpening("same-seed"));

  const serialized = JSON.stringify(runtime.snapshot());
  for (const forbidden of ["HTMLCanvasElement", "WebGLRenderer", "Peer", "AudioContext", "React"]) {
    assert(!serialized.includes(forbidden), `Snapshot leaked host object marker: ${forbidden}`);
  }

  runtime.dispose();
  console.log(JSON.stringify({
    ok: true,
    shippingCoreKits: 36,
    developmentCoreKits: 38,
    explicitShippingGraph: runtime.diagnostics().explicitKitCount,
    schemas: ["horror-corridor-v2.snapshot/1", "horror-corridor-v2.network/1", "horror-corridor-v2.save/1"],
    content,
    proven: [
      "independent-dsk-reset-replay",
      "deterministic-reset-and-replay",
      "studied-monster",
      "blackout-last-chance-collected-monster",
      "caught-and-restart",
      "offering-and-next-building",
      "save-load-index-retention",
      "browser-free-domain-snapshot",
      "audible-warning-before-visible-pursuit",
      "six-distinct-sensory-warning-motifs",
      "ten-minute-authored-route-horizon",
      "more-than-120-monster-manifestations",
    ],
  }, null, 2));
}

await main();
