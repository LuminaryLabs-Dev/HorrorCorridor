#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const ROOT = resolve(import.meta.dirname, "..");
const PROOF_ROOT = resolve(ROOT, "docs/proofs/timeline-review");
const STATE_PATH = resolve(PROOF_ROOT, "state.json");
const FEED_PATH = resolve(PROOF_ROOT, "feed.json");
const DEFAULT_URL = "http://127.0.0.1:4175/";
const SYSTEM_CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const argv = process.argv.slice(2);
const arg = (name) => {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : null;
};
const baseUrl = arg("--url") ?? DEFAULT_URL;
const headed = argv.includes("--headed");
const forceHandoff = argv.includes("--force-handoff");

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

async function reachable(url) {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
}

async function ensureServer() {
  if (await reachable(baseUrl)) return null;
  const port = new globalThis.URL(baseUrl).port || "4175";
  const child = spawn("npm", ["run", "dev", "--", "--port", port], {
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

function timelineFor(durationSeconds) {
  const boundaries = [0, 0.12, 0.18, 0.24, 0.7, 0.76, 1];
  const ids = ["departure", "read-left", "read-right", "deep-delve", "field-index", "long-delve"];
  return ids.map((id, index) => ({
    id,
    startSecond: Math.floor(durationSeconds * boundaries[index]),
    endSecond: index === ids.length - 1 ? durationSeconds : Math.floor(durationSeconds * boundaries[index + 1]),
  }));
}

function stageAt(timeline, second) {
  return timeline.find((stage) => second >= stage.startSecond && second < stage.endSecond) ?? timeline.at(-1);
}

function indexProgress(snapshot) {
  return Object.values(snapshot.expedition.monsterIndex).filter((entry) => entry.status !== "unseen").length;
}

function progressSignature(snapshot) {
  return [
    snapshot.expedition.phase,
    snapshot.expedition.buildingNumber,
    Math.floor(snapshot.expedition.distanceMeters * 5),
    snapshot.dread.phase,
    Math.floor(snapshot.dread.distanceMeters * 5),
    Math.floor(snapshot.dread.beamHoldMs / 100),
    indexProgress(snapshot),
  ].join(":");
}

async function main() {
  await mkdir(PROOF_ROOT, { recursive: true });
  const state = await readJson(STATE_PATH, {
    schema: "horror-corridor.timeline-state/1",
    reviewCount: 0,
    totalSimulatedSeconds: 0,
    lastReviewDurationSeconds: 0,
    lastRunId: null,
  });
  const recordedBefore = state.recordedSimulatedSeconds ?? state.totalSimulatedSeconds ?? 0;
  const uniqueBefore = state.uniqueContiguousSeconds ?? state.lastReviewDurationSeconds ?? 0;
  const requestedSeconds = Number(arg("--seconds"));
  const reviewDurationSeconds = Number.isFinite(requestedSeconds) && requestedSeconds > 0
    ? Math.floor(requestedSeconds)
    : 180 + state.reviewCount * 120;
  const timeline = timelineFor(reviewDurationSeconds);
  const runId = `review-${String(state.reviewCount + 1).padStart(3, "0")}-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const runRoot = resolve(PROOF_ROOT, "runs", runId);
  const screenshotRoot = resolve(runRoot, "screenshots");
  const videoRoot = resolve(runRoot, "video");
  const decisionRoot = resolve(runRoot, "decisions");
  const eventPath = resolve(runRoot, "events.jsonl");
  await mkdir(screenshotRoot, { recursive: true });
  await mkdir(videoRoot, { recursive: true });
  await mkdir(decisionRoot, { recursive: true });
  await rm(eventPath, { force: true });

  const manifest = {
    schema: "horror-corridor.timeline-manifest/1",
    runId,
    goal: "Play an increasingly long mapped timeline and recover stalls on the same live page.",
    authorityClass: "orchestrator",
    layers: ["workflow", "stage", "chain"],
    contract: "harness/play-review.contract.json",
    sourceState: state,
    reviewDurationSeconds,
    projectedTotalSimulatedSeconds: state.totalSimulatedSeconds + reviewDurationSeconds,
    coverageMode: "deterministic-replay-with-growing-tail",
    previousUniqueContiguousSeconds: uniqueBefore,
    durationGrowthSeconds: 120,
    forceHandoff,
    url: baseUrl,
    timeline,
    startedAt: new Date().toISOString(),
  };
  await writeFile(resolve(runRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  let eventNumber = 0;
  const emit = async (type, detail = {}) => {
    eventNumber += 1;
    await appendFile(eventPath, `${JSON.stringify({
      runId,
      eventId: `${runId}-event-${String(eventNumber).padStart(5, "0")}`,
      timestamp: new Date().toISOString(),
      type,
      layer: detail.layer ?? "workflow",
      actorId: detail.actorId ?? "play-review-orchestrator",
      actionId: detail.actionId ?? null,
      decisionId: detail.decisionId ?? null,
      attempt: detail.attempt ?? 1,
      artifactRefs: detail.artifactRefs ?? [],
      ...detail,
    })}\n`);
  };

  const server = await ensureServer();
  const browser = await chromium.launch({
    headless: !headed,
    executablePath: existsSync(SYSTEM_CHROME) ? SYSTEM_CHROME : undefined,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-background-networking"],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    recordVideo: { dir: videoRoot, size: { width: 1440, height: 900 } },
  });
  const page = await context.newPage();
  const video = page.video();
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  const call = (method, ...values) => page.evaluate(
    ({ name, args: callArgs }) => window.__HORROR_CORRIDOR_V2__[name](...callArgs),
    { name: method, args: values },
  );
  const capture = async (name) => {
    const path = resolve(screenshotRoot, `${name}.png`);
    await page.screenshot({ path });
    return path;
  };

  let finalSnapshot = null;
  let handoffCount = 0;
  let recoveryAttempts = 0;
  let forcedHandoffUsed = false;
  const visitedStages = new Set();
  const encounteredMonsters = new Set();
  const capturedStages = new Set();
  const capturedBeats = new Set();
  let currentContract = null;
  let contractMonsterId = null;

  const encounterContract = async (snapshot) => {
    if (!snapshot.dread.monsterId) {
      currentContract = null;
      contractMonsterId = null;
      return null;
    }
    if (contractMonsterId !== snapshot.dread.monsterId) {
      currentContract = await call("encounterContract");
      contractMonsterId = snapshot.dread.monsterId;
    }
    return currentContract;
  };

  const applyResponse = async (contract) => {
    await call("aimAtMonster");
    await call("flashlight", true);
    await call("setInput", {
      forward: contract?.response === "move-with-beam" ? 1 : 0,
      strafe: 0,
      turn: 0,
      sprint: false,
    });
  };

  const recoveryAgent = async (reason, snapshot) => {
    handoffCount += 1;
    const handoffId = `handoff-${String(handoffCount).padStart(3, "0")}`;
    const beforeSignature = progressSignature(snapshot);
    const screenshotPath = await capture(`${handoffId}-before`);
    await emit("handoff-started", {
      layer: "stage",
      actorId: "play-review-orchestrator",
      actionId: "route-stall-to-recovery-agent",
      decisionId: `${handoffId}-route`,
      reason,
      artifactRefs: [screenshotPath],
    });

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      recoveryAttempts += 1;
      const decisionId = `${handoffId}-attempt-${String(attempt).padStart(2, "0")}`;
      const contract = await encounterContract(snapshot);
      let action = "forward-wiggle";
      if (snapshot.expedition.phase === "offering") {
        action = "claim-offering";
        await call("claimOffering");
      } else if (snapshot.expedition.phase === "caught") {
        action = "restart";
        await call("restart");
      } else if (["approaching", "repelling", "last-chance"].includes(snapshot.dread.phase)) {
        action = `respond-${contract?.response ?? "unknown"}`;
        await applyResponse(contract);
      } else if (snapshot.dread.phase === "blackout") {
        action = "move-through-blackout";
        await call("flashlight", false);
        await call("setInput", { forward: 1, strafe: attempt % 2 === 0 ? 0.35 : -0.35, turn: 0, sprint: false });
      } else if (snapshot.dread.phase === "sign") {
        action = "orient-to-sign";
        const yaw = snapshot.dread.heardSide === "left" ? 0.18 : snapshot.dread.heardSide === "right" ? -0.18 : 0;
        if (yaw) await call("lookBy", yaw, 0);
        await call("setInput", { forward: 1, strafe: 0, turn: 0, sprint: false });
      } else {
        await call("setInput", { forward: 0.75, strafe: attempt % 2 === 0 ? 0.45 : -0.45, turn: attempt === 3 ? 0.2 : 0, sprint: false });
      }
      const next = await call("step", 180);
      const passed = progressSignature(next) !== beforeSignature;
      const decision = {
        schema: "horror-corridor.handoff-decision/1",
        runId,
        decisionId,
        handoffId,
        reason,
        attempt,
        action,
        beforeSignature,
        afterSignature: progressSignature(next),
        outcome: passed ? "PASS" : attempt < 3 ? "RETRY" : "BLOCKED",
        next: passed ? "timeline" : attempt < 3 ? "recovery-agent" : null,
      };
      const decisionPath = resolve(decisionRoot, `${decisionId}.json`);
      await writeFile(decisionPath, `${JSON.stringify(decision, null, 2)}\n`);
      await emit("handoff-decision", {
        layer: "stage",
        actorId: "recovery-agent",
        actionId: action,
        decisionId,
        attempt,
        outcome: decision.outcome,
        artifactRefs: [decisionPath],
      });
      if (passed) {
        await capture(`${handoffId}-recovered`);
        return next;
      }
      snapshot = next;
    }
    throw new Error(`Recovery agent exhausted three attempts for ${reason}.`);
  };

  let status = "failed";
  let failure = null;
  let videoPath;
  try {
    await emit("run-started", { artifactRefs: [resolve(runRoot, "manifest.json")] });
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await page.waitForFunction(() => Boolean(window.__HORROR_CORRIDOR_V2__), null, { timeout: 30_000 });
    await call("manual", true);
    finalSnapshot = await call("start");
    assert.equal(finalSnapshot.expedition.phase, "delving");
    await capture("000-start");
    await emit("game-ready", { layer: "stage", actorId: "timeline-player", decisionId: "game-ready-pass" });

    let priorSignature = progressSignature(finalSnapshot);
    let priorDreadPhase = finalSnapshot.dread.phase;
    let stalledSeconds = 0;
    let priorStageId = null;
    for (let second = 0; second < reviewDurationSeconds; second += 1) {
      const stage = stageAt(timeline, second);
      visitedStages.add(stage.id);
      if (priorStageId !== stage.id) {
        await emit("stage-entered", {
          layer: "stage",
          actorId: "timeline-player",
          actionId: stage.id,
          simulatedSecond: second,
        });
        const desiredYaw = stage.id === "read-left" ? 0.65 : stage.id === "read-right" ? -0.65 : 0;
        finalSnapshot = await call(
          "lookBy",
          desiredYaw - finalSnapshot.party.yaw,
          -finalSnapshot.party.pitch,
        );
        if (stage.id === "field-index") {
          await page.getByTestId("open-monster-index").click();
          await capture(`${String(second).padStart(4, "0")}-field-index-open`);
          await page.getByRole("button", { name: "Close Monster Index" }).click();
        }
        priorStageId = stage.id;
      }
      if (!capturedStages.has(stage.id)) {
        capturedStages.add(stage.id);
        await capture(`${String(second).padStart(4, "0")}-${stage.id}`);
      }

      if (forceHandoff && !forcedHandoffUsed && second >= 12) {
        forcedHandoffUsed = true;
        finalSnapshot = await recoveryAgent("injected-stall-proof", finalSnapshot);
      } else if (finalSnapshot.expedition.phase === "offering") {
        if (Math.abs(finalSnapshot.party.yaw) > 0.05) await call("lookBy", -finalSnapshot.party.yaw, 0);
        await call("claimOffering");
        finalSnapshot = await call("step", 1);
      } else if (finalSnapshot.expedition.phase === "caught") {
        await call("restart");
        finalSnapshot = await call("step", 1);
      } else if (finalSnapshot.dread.phase === "sign") {
        if (second % 2 === 0) {
          const yaw = finalSnapshot.dread.heardSide === "left" ? 0.08 : finalSnapshot.dread.heardSide === "right" ? -0.08 : 0;
          if (yaw) await call("lookBy", yaw, 0);
        }
        finalSnapshot = await call("step", 60, { forward: 1, strafe: 0, turn: 0, sprint: false });
      } else if (["approaching", "repelling", "last-chance"].includes(finalSnapshot.dread.phase)) {
        const contract = await encounterContract(finalSnapshot);
        await applyResponse(contract);
        finalSnapshot = await call("step", 60);
      } else if (finalSnapshot.dread.phase === "blackout") {
        await call("flashlight", false);
        finalSnapshot = await call("step", 60, { forward: 1, strafe: 0, turn: 0, sprint: false });
      } else {
        if (!["read-left", "read-right"].includes(stage.id) && Math.abs(finalSnapshot.party.yaw) > 0.22) {
          await call("lookBy", -finalSnapshot.party.yaw, 0);
        }
        const forward = stage.id === "read-left" || stage.id === "read-right" ? 0.42 : 1;
        finalSnapshot = await call("step", 60, { forward, strafe: 0, turn: 0, sprint: false });
      }

      if (finalSnapshot.dread.monsterId) encounteredMonsters.add(finalSnapshot.dread.monsterId);
      if (finalSnapshot.dread.phase !== priorDreadPhase) {
        const beatId = `${finalSnapshot.dread.monsterId ?? "none"}-${finalSnapshot.dread.phase}`;
        if (["sign", "approaching", "blackout", "last-chance", "resolved"].includes(finalSnapshot.dread.phase) && !capturedBeats.has(beatId)) {
          capturedBeats.add(beatId);
          const beatPath = await capture(`beat-${String(second).padStart(4, "0")}-${beatId}`);
          await emit("gameplay-beat-captured", {
            layer: "stage",
            actorId: "timeline-player",
            actionId: finalSnapshot.dread.phase,
            simulatedSecond: second,
            artifactRefs: [beatPath],
          });
        }
        priorDreadPhase = finalSnapshot.dread.phase;
      }
      const nextSignature = progressSignature(finalSnapshot);
      stalledSeconds = nextSignature === priorSignature ? stalledSeconds + 1 : 0;
      priorSignature = nextSignature;
      if (stalledSeconds >= 6) {
        finalSnapshot = await recoveryAgent(`no-meaningful-progress-${stalledSeconds}s`, finalSnapshot);
        priorSignature = progressSignature(finalSnapshot);
        stalledSeconds = 0;
      }
    }

    await capture(`${String(reviewDurationSeconds).padStart(4, "0")}-final`);
    assert.equal(visitedStages.size, timeline.length, "Every mapped timeline stage must run.");
    assert(finalSnapshot.expedition.distanceMeters > 0, "The player must traverse the corridor.");
    assert.equal(consoleErrors.length, 0, `Console errors: ${consoleErrors.join(" | ")}`);
    status = "passed";
    await emit("review-complete", {
      decisionId: "review-complete-pass",
      simulatedSeconds: reviewDurationSeconds,
      distanceMeters: finalSnapshot.expedition.distanceMeters,
      encounteredMonsters: [...encounteredMonsters],
    });
  } catch (error) {
    failure = error instanceof Error ? error.stack ?? error.message : String(error);
    await emit("run-failed", { outcome: "BLOCKED", error: failure });
  } finally {
    await page.close();
    await context.close();
    videoPath = video ? await video.path() : null;
    await browser.close();
    if (server) server.kill();
  }

  const uniqueContiguousSeconds = status === "passed"
    ? Math.max(uniqueBefore, reviewDurationSeconds)
    : uniqueBefore;
  const newCoverageSeconds = status === "passed"
    ? Math.max(0, uniqueContiguousSeconds - uniqueBefore)
    : 0;
  const replayedPrefixSeconds = status === "passed"
    ? reviewDurationSeconds - newCoverageSeconds
    : 0;
  const recordedSimulatedSeconds = status === "passed"
    ? recordedBefore + reviewDurationSeconds
    : recordedBefore;

  const validationReport = {
    schema: "horror-corridor.timeline-validation/1",
    runId,
    status,
    reviewDurationSeconds,
    timelineStagesVisited: [...visitedStages],
    handoffCount,
    recoveryAttempts,
    forcedHandoffUsed,
    encounteredMonsters: [...encounteredMonsters],
    distanceMeters: finalSnapshot?.expedition.distanceMeters ?? 0,
    buildingNumber: finalSnapshot?.expedition.buildingNumber ?? 0,
    monsterIndexProgress: finalSnapshot ? indexProgress(finalSnapshot) : 0,
    consoleErrors,
    videoPath,
    failure,
  };
  await writeFile(resolve(runRoot, "validation-report.json"), `${JSON.stringify(validationReport, null, 2)}\n`);
  const finalReport = {
    ...validationReport,
    schema: "horror-corridor.timeline-report/1",
    previousTotalSimulatedSeconds: state.totalSimulatedSeconds,
    totalSimulatedSeconds: status === "passed"
      ? state.totalSimulatedSeconds + reviewDurationSeconds
      : state.totalSimulatedSeconds,
    nextReviewDurationSeconds: status === "passed" ? reviewDurationSeconds + 120 : reviewDurationSeconds,
    coverage: {
      mode: "deterministic-replay-with-growing-tail",
      rawVideosConcatenated: false,
      recordedSimulatedSeconds,
      uniqueContiguousSeconds,
      replayedSimulatedSeconds: Math.max(0, recordedSimulatedSeconds - uniqueContiguousSeconds),
      replayedPrefixSeconds,
      newCoverageSeconds,
      newCoverageIntervalSeconds: [uniqueBefore, uniqueContiguousSeconds],
    },
    artifacts: { runRoot, manifest: resolve(runRoot, "manifest.json"), events: eventPath, screenshots: screenshotRoot, video: videoPath },
  };
  await writeFile(resolve(runRoot, "final-report.json"), `${JSON.stringify(finalReport, null, 2)}\n`);

  if (status === "passed") {
    const nextState = {
      schema: "horror-corridor.timeline-state/1",
      reviewCount: state.reviewCount + 1,
      totalSimulatedSeconds: state.totalSimulatedSeconds + reviewDurationSeconds,
      recordedSimulatedSeconds,
      uniqueContiguousSeconds,
      replayedSimulatedSeconds: Math.max(0, recordedSimulatedSeconds - uniqueContiguousSeconds),
      lastReviewDurationSeconds: reviewDurationSeconds,
      nextReviewDurationSeconds: reviewDurationSeconds + 120,
      lastRunId: runId,
      updatedAt: new Date().toISOString(),
    };
    const temporaryStatePath = `${STATE_PATH}.tmp`;
    await writeFile(temporaryStatePath, `${JSON.stringify(nextState, null, 2)}\n`);
    await rename(temporaryStatePath, STATE_PATH);

    const feed = await readJson(FEED_PATH, {
      schema: "horror-corridor.timeline-feed/1",
      accumulationMode: "deterministic-replay-with-growing-tail",
      rawVideosConcatenated: false,
      runs: [],
    });
    const priorRuns = feed.runs.filter((run) => run.runId !== runId);
    const previouslyEncountered = new Set(priorRuns.flatMap((run) => run.encounteredMonsters ?? []));
    const encounteredMonsterIds = [...encounteredMonsters];
    const nextFeed = {
      schema: "horror-corridor.timeline-feed/1",
      accumulationMode: "deterministic-replay-with-growing-tail",
      rawVideosConcatenated: false,
      interpretation: "Recorded time sums every run. Unique contiguous time counts only the longest deterministic horizon; shorter prefixes replay on later runs.",
      recordedSimulatedSeconds,
      uniqueContiguousSeconds,
      replayedSimulatedSeconds: Math.max(0, recordedSimulatedSeconds - uniqueContiguousSeconds),
      nextTargetSeconds: reviewDurationSeconds + 120,
      runs: [...priorRuns, {
        runId,
        rawVideo: videoPath,
        simulatedSeconds: reviewDurationSeconds,
        replayedPrefixSeconds,
        newCoverageSeconds,
        newCoverageIntervalSeconds: [uniqueBefore, uniqueContiguousSeconds],
        cumulativeRecordedSeconds: recordedSimulatedSeconds,
        uniqueContiguousSeconds,
        distanceMeters: finalSnapshot.expedition.distanceMeters,
        buildingNumber: finalSnapshot.expedition.buildingNumber,
        encounteredMonsters: encounteredMonsterIds,
        newlyEncounteredMonsters: encounteredMonsterIds.filter((id) => !previouslyEncountered.has(id)),
      }],
      updatedAt: new Date().toISOString(),
    };
    const temporaryFeedPath = `${FEED_PATH}.tmp`;
    await writeFile(temporaryFeedPath, `${JSON.stringify(nextFeed, null, 2)}\n`);
    await rename(temporaryFeedPath, FEED_PATH);
  }

  console.log(JSON.stringify({ status, runId, report: resolve(runRoot, "final-report.json"), reviewDurationSeconds, nextReviewDurationSeconds: finalReport.nextReviewDurationSeconds }, null, 2));
  if (status !== "passed") process.exitCode = 1;
}

await main();
