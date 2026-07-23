#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";
import { PNG } from "pngjs";

const ROOT = resolve(import.meta.dirname, "..");
const ARTIFACT_DIR = resolve(ROOT, "docs/proofs/v2-live");
const DEFAULT_URL = "http://127.0.0.1:4173/";
const SYSTEM_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const args = new Set(process.argv.slice(2));
const urlArgument = process.argv.findIndex((value) => value === "--url");
const baseUrl = urlArgument >= 0 ? process.argv[urlArgument + 1] : DEFAULT_URL;
const headed = args.has("--headed");

async function reachable(url) {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
}

async function ensureServer() {
  if (await reachable(baseUrl)) return null;
  const requestedPort = new globalThis.URL(baseUrl).port || "4173";
  const child = spawn("npm", ["run", "dev", "--", "--port", requestedPort], {
    cwd: ROOT,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const startedAt = Date.now();
  while (Date.now() - startedAt < 30_000) {
    if (await reachable(baseUrl)) return child;
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  child.kill();
  throw new Error(`Timed out waiting for ${baseUrl}`);
}

async function call(page, method, ...methodArgs) {
  return page.evaluate(
    ({ name, values }) => window.__HORROR_CORRIDOR_V2__[name](...values),
    { name: method, values: methodArgs },
  );
}

async function state(page) {
  return page.evaluate(() => window.__HORROR_CORRIDOR_V2__.status().snapshot);
}

async function screenshot(page, name) {
  const path = resolve(ARTIFACT_DIR, `${name}.png`);
  await page.waitForTimeout(90);
  await page.screenshot({ path, fullPage: false });
  return path;
}

async function stepUntil(page, predicate, maximumFrames, chunk = 30, input) {
  let frames = 0;
  while (frames < maximumFrames) {
    await call(page, "step", Math.min(chunk, maximumFrames - frames), input);
    frames += Math.min(chunk, maximumFrames - frames);
    const snapshot = await state(page);
    if (predicate(snapshot)) return { frames, snapshot };
  }
  throw new Error(`Live proof timed out after ${maximumFrames} frames. State: ${JSON.stringify(await state(page))}`);
}

async function advanceStudyingUntil(page, reached, targetDescription, maximumFrames = 7_200) {
  let frames = 0;
  let resolvedEncounters = 0;
  while (frames < maximumFrames) {
    const snapshot = await state(page);
    if (snapshot.expedition.phase === "offering") {
      await call(page, "claimOffering");
      resolvedEncounters += 1;
      continue;
    }
    if (snapshot.expedition.phase === "caught") throw new Error(`Caught before reaching ${targetDescription}.`);
    if (reached(snapshot)) {
      await call(page, "setInput", { forward: 0, strafe: 0, turn: 0, sprint: false });
      return { frames, resolvedEncounters, snapshot };
    }

    if (["approaching", "repelling", "last-chance"].includes(snapshot.dread.phase)) {
      const contract = await call(page, "encounterContract");
      await call(page, "aimAtMonster");
      await call(page, "flashlight", true);
      await call(page, "step", 30, {
        forward: contract?.response === "move-with-beam" ? 1 : 0,
        strafe: 0,
        turn: 0,
        sprint: false,
      });
    } else if (snapshot.dread.phase === "blackout") {
      await call(page, "flashlight", false);
      await call(page, "step", 30, { forward: 1, strafe: 0, turn: 0, sprint: false });
    } else {
      await call(page, "lookBy", -snapshot.party.yaw, -snapshot.party.pitch);
      await call(page, "flashlight", true);
      await call(page, "step", 30, { forward: 1, strafe: 0, turn: 0, sprint: false });
    }
    frames += 30;
  }
  throw new Error(`Unable to reach ${targetDescription} after ${maximumFrames} frames. State: ${JSON.stringify(await state(page))}`);
}

async function advanceStudyingToDistance(page, targetDistanceMeters, maximumFrames = 7_200) {
  return advanceStudyingUntil(
    page,
    (snapshot) => snapshot.expedition.distanceMeters >= targetDistanceMeters,
    `${targetDistanceMeters} expedition meters`,
    maximumFrames,
  );
}

async function advanceStudyingToZ(page, targetZ, maximumFrames = 7_200) {
  return advanceStudyingUntil(
    page,
    (snapshot) => snapshot.party.position.z <= targetZ,
    `corridor z ${targetZ}`,
    maximumFrames,
  );
}

async function centerPartyOnRoute(page, maximumFrames = 120) {
  let snapshot = await state(page);
  await call(page, "lookBy", -snapshot.party.yaw, -snapshot.party.pitch);
  let frames = 0;
  while (Math.abs(snapshot.party.position.x) > 0.12 && frames < maximumFrames) {
    const strafe = snapshot.party.position.x > 0 ? -1 : 1;
    await call(page, "step", 2, { forward: 0, strafe, turn: 0, sprint: false });
    frames += 2;
    snapshot = await state(page);
  }
  await call(page, "setInput", { forward: 0, strafe: 0, turn: 0, sprint: false });
  assert(Math.abs(snapshot.party.position.x) <= 0.2, `Unable to center the player for landmark review: x=${snapshot.party.position.x}`);
  return { frames, snapshot };
}

async function findUpcomingSetPiece(page, kind, minimumSegment, maximumSegment) {
  return page.evaluate(
    async ({ requestedKind, firstSegment, lastSegment }) => {
      const { CORRIDOR_SEGMENT_LENGTH_METERS, createCorridorSetPiece } = await import("/src/content/chamber.ts");
      const snapshot = window.__HORROR_CORRIDOR_V2__.status().snapshot;
      for (let segment = firstSegment; segment <= lastSegment; segment += 1) {
        if (segment <= 0 || segment % 3 !== 2) continue;
        const centerZ = 4 - segment * CORRIDOR_SEGMENT_LENGTH_METERS - CORRIDOR_SEGMENT_LENGTH_METERS / 2;
        const descriptor = createCorridorSetPiece(snapshot.corridor.routeSeed, segment, centerZ);
        if (descriptor.kind !== requestedKind) continue;
        return {
          kind: descriptor.kind,
          segment,
          centerZ,
          side: Math.sign(descriptor.props[0]?.position.x ?? 1) || 1,
          routeSeed: snapshot.corridor.routeSeed,
        };
      }
      return null;
    },
    { requestedKind: kind, firstSegment: minimumSegment, lastSegment: maximumSegment },
  );
}

async function currentSetPiece(page, segment) {
  return page.evaluate(async (requestedSegment) => {
    const { CORRIDOR_SEGMENT_LENGTH_METERS, createCorridorSetPiece } = await import("/src/content/chamber.ts");
    const snapshot = window.__HORROR_CORRIDOR_V2__.status().snapshot;
    const centerZ = 4 - requestedSegment * CORRIDOR_SEGMENT_LENGTH_METERS - CORRIDOR_SEGMENT_LENGTH_METERS / 2;
    const descriptor = createCorridorSetPiece(snapshot.corridor.routeSeed, requestedSegment, centerZ);
    return { kind: descriptor.kind, segment: requestedSegment, routeSeed: snapshot.corridor.routeSeed };
  }, segment);
}

async function approachStableSetPiece(page, kind, maximumSegment, maximumAttempts = 5) {
  for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
    const snapshot = await state(page);
    const currentSegment = Math.max(0, Math.floor((4 - snapshot.party.position.z) / 8));
    const candidate = await findUpcomingSetPiece(page, kind, currentSegment, maximumSegment);
    assert(candidate, `The active district must expose an upcoming ${kind}.`);
    await advanceStudyingToZ(page, candidate.centerZ + 6);
    const actual = await currentSetPiece(page, candidate.segment);
    if (actual.kind === kind && actual.routeSeed === candidate.routeSeed) return candidate;
  }
  throw new Error(`Unable to hold a stable ${kind} through the approach.`);
}

async function metrics(path) {
  const png = PNG.sync.read(await readFile(path));
  let average = 0;
  let dark = 0;
  let light = 0;
  let center = 0;
  let centerCount = 0;
  let foreground = 0;
  let foregroundCount = 0;
  let cropCount = 0;
  const cropLeft = png.width * 0.09;
  const cropRight = png.width * 0.91;
  const cropTop = png.height * 0.09;
  const cropBottom = png.height * 0.91;
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const offset = (y * png.width + x) * 4;
      const luminance = 0.2126 * png.data[offset] + 0.7152 * png.data[offset + 1] + 0.0722 * png.data[offset + 2];
      if (x >= cropLeft && x <= cropRight && y >= cropTop && y <= cropBottom) {
        average += luminance;
        cropCount += 1;
        if (luminance < 15) dark += 1;
        if (luminance >= 35) light += 1;
      }
      if (x > png.width * 0.3 && x < png.width * 0.7 && y > png.height * 0.25 && y < png.height * 0.75) {
        center += luminance;
        centerCount += 1;
      }
      if (x > png.width * 0.25 && x < png.width * 0.75 && y > png.height * 0.65) {
        foreground += luminance;
        foregroundCount += 1;
      }
    }
  }
  return {
    average: average / cropCount,
    darkRatio: dark / cropCount,
    lightRatio: light / cropCount,
    centerAverage: center / centerCount,
    foregroundAverage: foreground / foregroundCount,
  };
}

async function waitForConnection(page, timeoutMs = 20_000) {
  await page.waitForFunction(
    () => window.__HORROR_CORRIDOR_V2__?.status().snapshot.sharedExpedition.connection === "connected",
    null,
    { timeout: timeoutMs },
  );
}

async function proveNetwork(context) {
  const roomCode = `P${Date.now().toString(36).slice(-7)}`.toUpperCase();
  const seed = "horror-corridor-v2-network-proof";
  const host = await context.newPage();
  const client = await context.newPage();
  const consoleErrors = [];
  const observeErrors = (page, label) => {
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(`${label}: ${message.text()}`);
    });
    page.on("pageerror", (error) => consoleErrors.push(`${label}: ${error.message}`));
  };
  observeErrors(host, "host");
  observeErrors(client, "client");
  const hostUrl = `${baseUrl}?mode=host&room=${roomCode}&seed=${encodeURIComponent(seed)}`;
  const clientUrl = `${baseUrl}?mode=client&room=${roomCode}&seed=${encodeURIComponent(seed)}`;

  await host.goto(hostUrl, { waitUntil: "networkidle" });
  await host.waitForFunction(() => Boolean(window.__HORROR_CORRIDOR_V2__));
  await call(host, "manual", true);
  await call(host, "start");
  await client.goto(clientUrl, { waitUntil: "networkidle" });
  await client.waitForFunction(() => Boolean(window.__HORROR_CORRIDOR_V2__));
  await call(client, "manual", true);
  await call(client, "start");
  await Promise.all([waitForConnection(host), waitForConnection(client)]);

  // Publish two 20 Hz snapshots without flooding the data channel with a synthetic burst.
  await call(host, "step", 6, { forward: 1 });
  const hostTick = (await state(host)).tick;
  try {
    await client.waitForFunction(
      (minimumTick) => window.__HORROR_CORRIDOR_V2__?.status().snapshot.tick >= minimumTick,
      hostTick - 3,
      { timeout: 10_000 },
    );
  } catch (error) {
    const hostState = await state(host);
    const clientState = await state(client);
    console.error(JSON.stringify({
      host: { tick: hostState.tick, sharedExpedition: hostState.sharedExpedition },
      client: { tick: clientState.tick, sharedExpedition: clientState.sharedExpedition },
    }, null, 2));
    throw error;
  }
  const clientTick = (await state(client)).tick;
  assert(hostTick - clientTick <= 3, "Client must remain within one 20 Hz publication of the host.");

  await call(client, "shutdown");
  await client.close();
  await host.waitForFunction(
    () => Object.values(window.__HORROR_CORRIDOR_V2__?.status().snapshot.sharedExpedition.peers ?? {}).some((peer) => !peer.connected),
    null,
    { timeout: 12_000 },
  );

  const recoveredClient = await context.newPage();
  observeErrors(recoveredClient, "recovered-client");
  await recoveredClient.goto(clientUrl, { waitUntil: "networkidle" });
  await recoveredClient.waitForFunction(() => Boolean(window.__HORROR_CORRIDOR_V2__));
  await call(recoveredClient, "manual", true);
  await call(recoveredClient, "start");
  await Promise.all([waitForConnection(host), waitForConnection(recoveredClient)]);
  await call(host, "step", 6, { forward: 0 });
  const recoveredTick = (await state(host)).tick;
  await recoveredClient.waitForFunction(
    (minimumTick) => window.__HORROR_CORRIDOR_V2__?.status().snapshot.tick >= minimumTick,
    recoveredTick - 3,
    { timeout: 10_000 },
  );
  assert(recoveredTick - (await state(recoveredClient)).tick <= 3);
  const peers = (await state(host)).sharedExpedition.peers;
  assert(Object.values(peers).some((peer) => peer.connected), "Host must retain a connected recovered presence.");
  await call(recoveredClient, "shutdown");
  await recoveredClient.close();
  await call(host, "shutdown");
  await host.close();
  assert.equal(consoleErrors.length, 0, `Network browser errors: ${consoleErrors.join(" | ")}`);
  return { roomCode, replicatedTick: hostTick, recoveredTick, peerCount: Object.keys(peers).length, consoleErrors };
}

async function main() {
  await mkdir(ARTIFACT_DIR, { recursive: true });
  for (const entry of await readdir(ARTIFACT_DIR, { withFileTypes: true })) {
    const durableVisualEvidence = entry.isFile() && (entry.name.endsWith("-decision.json") || entry.name.endsWith("-before.png"));
    if (durableVisualEvidence) continue;
    await rm(resolve(ARTIFACT_DIR, entry.name), { recursive: true, force: true });
  }
  const server = await ensureServer();
  const browser = await chromium.launch({
    headless: !headed,
    executablePath: existsSync(SYSTEM_CHROME) ? SYSTEM_CHROME : undefined,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-background-networking", "--autoplay-policy=no-user-gesture-required"],
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  const screenshots = {};

  try {
    if (args.has("--network-only")) {
      console.log(JSON.stringify({ status: "passed", network: await proveNetwork(context) }, null, 2));
      return;
    }
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.waitForFunction(() => Boolean(window.__HORROR_CORRIDOR_V2__));
    screenshots.title = await screenshot(page, "00-title");
    await call(page, "manual", true);
    const audioUnlocked = await call(page, "unlockAudio");
    assert.equal(audioUnlocked.ready, true, "The live player must run an unlocked WebAudio context.");
    await call(page, "start");
    await call(page, "step", 2);
    screenshots.spawn = await screenshot(page, "01-spawn");

    await call(page, "step", 90, { forward: 1 });
    await call(page, "setInput", { forward: 0 });
    await call(page, "lookBy", 0.38, 0);
    await call(page, "step", 1);
    screenshots.serviceNook = await screenshot(page, "01a-service-nook");
    await call(page, "lookBy", -0.38, 0);
    await call(page, "step", 1);

    await call(page, "step", 450, { forward: 1 });
    await call(page, "setInput", { forward: 0 });
    screenshots.movement = await screenshot(page, "02-movement");
    await call(page, "lookBy", 0.72, 0);
    await call(page, "step", 1);
    screenshots.left = await screenshot(page, "03-look-left");
    await call(page, "lookBy", -1.44, 0);
    await call(page, "step", 1);
    screenshots.right = await screenshot(page, "04-look-right");
    await call(page, "lookBy", 0.72, 0);
    await call(page, "step", 1);

    // Stop before the 90 m safety horizon and inspect the first authored side-room prefab.
    await call(page, "step", 1_050, { forward: 1 });
    await call(page, "setInput", { forward: 0 });
    await call(page, "lookBy", -0.42, 0);
    await call(page, "step", 1);
    screenshots.closedTavern = await screenshot(page, "04a-closed-tavern");
    await call(page, "lookBy", 0.42, 0);
    await call(page, "step", 1);

    const warning = await stepUntil(page, (snapshot) => snapshot.dread.phase === "sign", 1_200, 15, { forward: 1 });
    const warningContract = await call(page, "encounterContract");
    assert(warningContract, "The hidden warning phase must expose its monster contract.");
    const approaching = await stepUntil(page, (snapshot) => snapshot.dread.phase === "approaching", 900, 15, { forward: 1 });
    const audioAfterWarning = await call(page, "audioStatus");
    const warningCues = audioAfterWarning.recentCues.filter((cue) => cue.phase === "sign" && cue.monsterId === warningContract.id);
    assert.equal(audioAfterWarning.ready, true, "WebAudio must remain running through the warning phase.");
    assert(warningCues.length >= 3, "The hidden warning must repeat enough for the player to infer a source.");
    assert(warningCues.every((cue) => cue.sensoryChannel === warningContract.sensoryChannel), "Warning cues must use the active monster's sensory channel.");
    assert(warningCues.every((cue) => cue.pulseCount >= 2), "A warning motif must be a recognizable pattern rather than one generic beep.");
    assert(warningCues.at(-1).intervalMs < warningCues[0].intervalMs, "Warning cadence must tighten before pursuit.");
    assert(warningCues[0].atSimulationMs >= warning.snapshot.expedition.elapsedMs - 250, "The first cue must begin with the hidden warning phase.");
    assert(warningCues.at(-1).atSimulationMs < approaching.snapshot.expedition.elapsedMs, "Warning audio must precede visible pursuit.");
    const cuePan = warningCues.at(-1).pan;
    if (warning.snapshot.dread.heardSide === "left") assert(cuePan > 0.04, "A left warning must pan left.");
    if (warning.snapshot.dread.heardSide === "right") assert(cuePan < -0.04, "A right warning must pan right.");
    if (warning.snapshot.dread.heardSide === "ahead") assert(Math.abs(cuePan) <= 0.35, "An ahead warning must remain near center.");
    await call(page, "setInput", { forward: 0 });
    await call(page, "aimAtMonster");
    await call(page, "flashlight", true);
    const studied = await stepUntil(page, (snapshot) => snapshot.expedition.phase === "offering", 300, 30);
    assert.equal(studied.snapshot.expedition.monsterIndex[studied.snapshot.dread.monsterId].status, "studied");
    screenshots.studied = await screenshot(page, "05-studied-offering");
    const positionBeforeOffering = (await state(page)).party.position;
    await call(page, "claimOffering");
    assert.equal((await state(page)).expedition.buildingNumber, 2);
    assert.deepEqual((await state(page)).party.position, positionBeforeOffering);

    await stepUntil(page, (snapshot) => snapshot.dread.phase === "approaching", 1_800, 30, { forward: 1 });
    await call(page, "setInput", { forward: 0 });
    await call(page, "flashlight", false);
    await stepUntil(page, (snapshot) => snapshot.dread.phase === "blackout", 1_800, 60);
    screenshots.blackout = await screenshot(page, "06-blackout");
    await stepUntil(page, (snapshot) => snapshot.dread.phase === "last-chance", 240, 20);
    screenshots.lastChance = await screenshot(page, "07-last-chance");
    await call(page, "aimAtMonster");
    await call(page, "flashlight", true);
    await call(page, "setInput", { forward: 1 });
    const collected = await stepUntil(page, (snapshot) => snapshot.expedition.phase === "offering", 300, 30);
    assert.equal(collected.snapshot.expedition.monsterIndex[collected.snapshot.dread.monsterId].status, "collected");
    screenshots.collected = await screenshot(page, "08-collected-offering");
    await page.getByTestId("open-monster-index").click();
    screenshots.index = await screenshot(page, "09-monster-index");
    await page.getByRole("button", { name: "Close Monster Index" }).click();
    const saved = await call(page, "save");
    await call(page, "claimOffering");

    // Use the next safe traversal window to inspect the first Shuttered Market pantry.
    await call(page, "step", 360, { forward: 1 });
    await call(page, "setInput", { forward: 0 });
    await call(page, "lookBy", -0.38, 0);
    await call(page, "step", 1);
    screenshots.emptyPantry = await screenshot(page, "09a-empty-pantry");
    await call(page, "lookBy", 0.38, 0);
    await call(page, "step", 1);

    await stepUntil(page, (snapshot) => snapshot.dread.phase === "approaching", 1_800, 30, { forward: 1 });
    await call(page, "setInput", { forward: 0 });
    await call(page, "flashlight", false);
    const caught = await stepUntil(page, (snapshot) => snapshot.expedition.phase === "caught", 2_600, 90);
    assert.equal(caught.snapshot.party.condition, "captured");
    screenshots.caught = await screenshot(page, "10-caught");
    await call(page, "restart");
    assert.equal((await state(page)).expedition.phase, "delving");
    screenshots.restart = await screenshot(page, "11-restart");
    const loaded = await call(page, "load");
    assert.equal(loaded.loaded, true);
    assert.equal(loaded.snapshot.digest, saved.snapshot.digest);
    assert(Object.values(loaded.snapshot.expedition.monsterIndex).some((entry) => entry.status === "collected"));

    // Continue from the verified save through two more real encounters to inspect the first Charity Ward nursery.
    await call(page, "claimOffering");
    for (let encounter = 0; encounter < 2; encounter += 1) {
      await stepUntil(page, (snapshot) => snapshot.dread.phase === "approaching", 1_800, 30, { forward: 1 });
      await call(page, "setInput", { forward: 0 });
      const contract = await call(page, "encounterContract");
      await call(page, "aimAtMonster");
      await call(page, "flashlight", true);
      const responseInput = { forward: contract?.response === "move-with-beam" ? 1 : 0, strafe: 0, turn: 0, sprint: false };
      const resolved = await stepUntil(page, (snapshot) => snapshot.expedition.phase === "offering", 600, 30, responseInput);
      assert.equal(resolved.snapshot.expedition.monsterIndex[resolved.snapshot.dread.monsterId].status, "studied");
      await call(page, "claimOffering");
    }
    const nurseryApproach = await stepUntil(page, (snapshot) => snapshot.expedition.distanceMeters >= 316, 1_800, 30, { forward: 1 });
    await call(page, "setInput", { forward: 0 });
    await call(page, "lookBy", -0.42 - nurseryApproach.snapshot.party.yaw, -nurseryApproach.snapshot.party.pitch);
    await call(page, "step", 1);
    screenshots.sealedNursery = await screenshot(page, "12-sealed-nursery");
    await call(page, "lookBy", 0.42, 0);
    await call(page, "step", 1);

    const clinicApproach = await stepUntil(page, (snapshot) => snapshot.expedition.distanceMeters >= 340, 600, 30, { forward: 1 });
    await call(page, "setInput", { forward: 0 });
    await call(page, "lookBy", 0.24 - clinicApproach.snapshot.party.yaw, -clinicApproach.snapshot.party.pitch);
    await call(page, "step", 1);
    screenshots.abandonedClinic = await screenshot(page, "13-abandoned-clinic");
    await call(page, "lookBy", -0.24, 0);
    await call(page, "step", 1);

    await advanceStudyingToDistance(page, 493);
    const laundryApproach = await centerPartyOnRoute(page);
    await call(page, "lookBy", 0.48 - laundryApproach.snapshot.party.yaw, -laundryApproach.snapshot.party.pitch);
    await call(page, "step", 1);
    screenshots.floodedLaundry = await screenshot(page, "14-flooded-laundry");
    await call(page, "lookBy", -0.48, 0);
    await call(page, "step", 1);

    // Reach Pilgrim Mile through the real response-aware route, then select a
    // currently stable authored alcove from the active domain route seed.
    await advanceStudyingToZ(page, -624);
    const pilgrimLandmark = await approachStableSetPiece(page, "pilgrim-alcove", 99);
    const pilgrimApproach = await centerPartyOnRoute(page);
    const pilgrimYaw = pilgrimLandmark.side < 0 ? 0.48 : -0.48;
    await call(page, "lookBy", pilgrimYaw - pilgrimApproach.snapshot.party.yaw, -pilgrimApproach.snapshot.party.pitch);
    await call(page, "step", 1);
    screenshots.pilgrimAlcove = await screenshot(page, "15-pilgrim-alcove");
    await call(page, "lookBy", -pilgrimYaw, 0);
    await call(page, "step", 1);

    const boilerLandmark = await approachStableSetPiece(page, "boiler-shrine", 99);
    const boilerApproach = await centerPartyOnRoute(page);
    const boilerYaw = boilerLandmark.side < 0 ? 0.48 : -0.48;
    await call(page, "lookBy", boilerYaw - boilerApproach.snapshot.party.yaw, -boilerApproach.snapshot.party.pitch);
    await call(page, "step", 1);
    screenshots.boilerShrine = await screenshot(page, "16-boiler-shrine");
    await call(page, "lookBy", -boilerYaw, 0);
    await call(page, "step", 1);

    await advanceStudyingToZ(page, -784);
    const ticketLandmark = await approachStableSetPiece(page, "ticket-hall", 119);
    const ticketApproach = await centerPartyOnRoute(page);
    const ticketYaw = ticketLandmark.side < 0 ? 0.48 : -0.48;
    await call(page, "lookBy", ticketYaw - ticketApproach.snapshot.party.yaw, -ticketApproach.snapshot.party.pitch);
    await call(page, "step", 1);
    screenshots.ticketHall = await screenshot(page, "16a-ticket-hall");
    await call(page, "lookBy", -ticketYaw, 0);
    await call(page, "step", 1);

    const archiveLandmark = await approachStableSetPiece(page, "night-archive", 119);
    const archiveApproach = await centerPartyOnRoute(page);
    const archiveYaw = archiveLandmark.side < 0 ? 0.48 : -0.48;
    await call(page, "lookBy", archiveYaw - archiveApproach.snapshot.party.yaw, -archiveApproach.snapshot.party.pitch);
    await call(page, "step", 1);
    screenshots.nightArchive = await screenshot(page, "17-night-archive");
    await call(page, "lookBy", -archiveYaw, 0);
    await call(page, "step", 1);

    await advanceStudyingToZ(page, -1_104);
    const dormitoryLandmark = await approachStableSetPiece(page, "workers-dormitory", 159);
    const dormitoryApproach = await centerPartyOnRoute(page);
    const dormitoryYaw = dormitoryLandmark.side < 0 ? 0.48 : -0.48;
    await call(page, "lookBy", dormitoryYaw - dormitoryApproach.snapshot.party.yaw, -dormitoryApproach.snapshot.party.pitch);
    await call(page, "step", 1);
    screenshots.workersDormitory = await screenshot(page, "18-workers-dormitory");
    await call(page, "lookBy", -dormitoryYaw, 0);
    await call(page, "step", 1);

    await advanceStudyingToZ(page, -1_264);
    const mortuaryLandmark = await approachStableSetPiece(page, "mortuary-bay", 179);
    const mortuaryApproach = await centerPartyOnRoute(page);
    const mortuaryYaw = mortuaryLandmark.side < 0 ? 0.48 : -0.48;
    await call(page, "lookBy", mortuaryYaw - mortuaryApproach.snapshot.party.yaw, -mortuaryApproach.snapshot.party.pitch);
    await call(page, "step", 1);
    screenshots.mortuaryBay = await screenshot(page, "19-mortuary-bay");
    await call(page, "lookBy", -mortuaryYaw, 0);
    await call(page, "step", 1);

    const viewMetrics = {};
    for (const name of ["spawn", "serviceNook", "movement", "left", "right", "closedTavern", "emptyPantry", "sealedNursery", "abandonedClinic", "floodedLaundry", "pilgrimAlcove", "boilerShrine", "ticketHall", "nightArchive", "workersDormitory", "mortuaryBay"]) viewMetrics[name] = await metrics(screenshots[name]);
    assert(viewMetrics.spawn.darkRatio <= 0.9 && viewMetrics.spawn.lightRatio >= 0.025, "Spawn lighting must preserve a readable route while remaining dark.");
    assert(viewMetrics.serviceNook.lightRatio >= 0.025, "The opening service nook must read as a visible side-room landmark.");
    assert(viewMetrics.movement.darkRatio <= 0.9 && viewMetrics.movement.lightRatio >= 0.025, "Movement view must preserve route separation.");
    assert(viewMetrics.left.centerAverage >= 12 && viewMetrics.right.centerAverage >= 12, "Side views must expose readable wall and prop surfaces.");
    assert(viewMetrics.closedTavern.lightRatio >= 0.025, "The closed tavern must remain visible before the first encounter.");
    assert(viewMetrics.emptyPantry.lightRatio >= 0.025, "The empty pantry must read as a visible Shuttered Market landmark.");
    assert(viewMetrics.sealedNursery.lightRatio >= 0.025 && viewMetrics.sealedNursery.centerAverage >= 12, "The sealed nursery must read as a visible Charity Ward landmark.");
    assert(viewMetrics.abandonedClinic.lightRatio >= 0.025 && viewMetrics.abandonedClinic.centerAverage >= 12, "The abandoned clinic must remain visible as a Charity Ward landmark.");
    assert(viewMetrics.floodedLaundry.lightRatio >= 0.025 && viewMetrics.floodedLaundry.centerAverage >= 12, "The flooded laundry must remain visible as a Flood Line landmark.");
    assert(viewMetrics.pilgrimAlcove.lightRatio >= 0.025 && viewMetrics.pilgrimAlcove.centerAverage >= 12, "The pilgrim alcove must remain visible as a Pilgrim Mile landmark.");
    assert(viewMetrics.boilerShrine.lightRatio >= 0.025 && viewMetrics.boilerShrine.centerAverage >= 12, "The boiler shrine must remain visible as a Pilgrim Mile landmark.");
    assert(viewMetrics.ticketHall.lightRatio >= 0.025 && viewMetrics.ticketHall.centerAverage >= 12, "The ticket hall must remain visible as a Records Below landmark.");
    assert(viewMetrics.nightArchive.lightRatio >= 0.025 && viewMetrics.nightArchive.centerAverage >= 12, "The night archive must remain visible as a Records Below landmark.");
    assert(viewMetrics.workersDormitory.lightRatio >= 0.025 && viewMetrics.workersDormitory.centerAverage >= 12, "The workers dormitory must remain visible as a Last Platform landmark.");
    assert(viewMetrics.mortuaryBay.lightRatio >= 0.025 && viewMetrics.mortuaryBay.centerAverage >= 12, "The mortuary bay must remain visible as a Provision Tombs landmark.");

    const network = await proveNetwork(context);
    const calls = await page.evaluate(() => window.__HORROR_CORRIDOR_V2__.calls());
    const report = {
      status: "passed",
      createdAt: new Date().toISOString(),
      url: baseUrl,
      screenshots,
      lighting: {
        thresholds: { maxDarkRatio: 0.9, minLightRatio: 0.025, minSideCenterAverage: 12 },
        views: viewMetrics,
      },
      gameplay: {
        studiedMonster: true,
        blackoutObserved: true,
        lastChanceSurvived: true,
        collectedMonster: true,
        offeringAndNextBuilding: true,
        caughtAndRestarted: true,
        savedReloadedIndex: true,
      },
      network,
      audio: {
        ready: audioAfterWarning.ready,
        contextState: audioAfterWarning.contextState,
        masterGain: audioAfterWarning.masterGain,
        warning: {
          monsterId: warningContract.id,
          sensoryChannel: warningContract.sensoryChannel,
          heardSide: warning.snapshot.dread.heardSide,
          motif: warningCues[0].motif,
          cueCount: warningCues.length,
          firstCueAtSimulationMs: warningCues[0].atSimulationMs,
          finalCueAtSimulationMs: warningCues.at(-1).atSimulationMs,
          firstIntervalMs: warningCues[0].intervalMs,
          finalIntervalMs: warningCues.at(-1).intervalMs,
          finalPan: cuePan,
          pursuitAtSimulationMs: approaching.snapshot.expedition.elapsedMs,
        },
        recentCues: audioAfterWarning.recentCues,
      },
      externalControl: {
        version: "horror-corridor-v2.control/1",
        callCount: calls.length,
        recentCallTiming: calls.slice(-20).map(({ call: name, sincePreviousMs }) => ({ call: name, sincePreviousMs })),
      },
      consoleErrors: errors,
    };
    assert.equal(errors.length, 0, `Browser console errors: ${errors.join(" | ")}`);
    await writeFile(resolve(ARTIFACT_DIR, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify({ status: report.status, report: resolve(ARTIFACT_DIR, "report.json") }, null, 2));
  } finally {
    await browser.close();
    if (server) server.kill();
  }
}

await main();
