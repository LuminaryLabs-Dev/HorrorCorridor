#!/usr/bin/env node
import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { buildAuthoringCatalog } from "../src/authoring/catalog";
import {
  CORRIDOR_DISTRICTS,
  CORRIDOR_SEGMENT_LENGTH_METERS,
  createAuthoredCorridorSetPiece,
} from "../src/content/chamber";
import {
  CORRIDOR_GENERATOR_VARIANTS,
  CORRIDOR_SERVICE_DOOR_VARIANTS,
  createCorridorContentRoutingService,
  type CorridorContentRouteContext,
} from "../src/content/corridorContentRouting";

const APP_ROOT = resolve(import.meta.dirname, "..");
const CONTRACT_PATH = resolve(APP_ROOT, "harness/content-routing.contract.json");
const DEFAULT_ARTIFACT_ROOT = resolve(APP_ROOT, "artifacts/content-routing-harness");
const VALIDATOR_VERSION = "horror-corridor.content-routing-harness/1";
const TIMEOUT_MS = 30_000;

type GateResult = Readonly<{
  decisionId: string;
  gateId: "deterministic-replay" | "variant-coverage" | "placement-boundary" | "catalog-parity";
  passed: boolean;
  evidence: Readonly<Record<string, unknown>>;
}>;

function argumentValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function timestampId(date = new Date()): string {
  return `${date.toISOString().replaceAll(/[-:.TZ]/g, "")}-${process.pid}`;
}

function relativeToApp(path: string): string {
  const value = relative(APP_ROOT, path).replaceAll("\\", "/");
  return value.startsWith("..") ? path : value;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main(): Promise<void> {
  const startedAt = Date.now();
  const startedAtIso = new Date(startedAt).toISOString();
  const runId = `content-routing-${timestampId(new Date(startedAt))}`;
  const artifactRoot = resolve(argumentValue("--artifact-root") ?? DEFAULT_ARTIFACT_ROOT);
  const runRoot = resolve(artifactRoot, runId);
  const inputsRoot = resolve(runRoot, "inputs");
  const outputsRoot = resolve(runRoot, "outputs");
  const decisionsRoot = resolve(runRoot, "decisions");
  await Promise.all([
    mkdir(inputsRoot, { recursive: true }),
    mkdir(outputsRoot, { recursive: true }),
    mkdir(decisionsRoot, { recursive: true }),
  ]);

  let eventNumber = 0;
  const emit = async (
    type: string,
    actionId: string,
    artifactRefs: readonly string[] = [],
    detail: Readonly<Record<string, unknown>> = {},
  ): Promise<void> => {
    eventNumber += 1;
    await appendFile(resolve(runRoot, "events.jsonl"), `${JSON.stringify({
      runId,
      eventId: `event-${String(eventNumber).padStart(4, "0")}`,
      timestamp: new Date().toISOString(),
      type,
      layer: "chain",
      actorId: "routing-validator",
      actionId,
      decisionId: null,
      attempt: 1,
      parentRunId: null,
      artifactRefs,
      detail,
    })}\n`, "utf8");
  };

  const rawContract = await readFile(CONTRACT_PATH, "utf8");
  const contract = JSON.parse(rawContract) as Readonly<{ schemaVersion: string; name: string; goal: string }>;
  if (contract.schemaVersion !== "harness-it.contract.v2" || contract.name !== "horror-corridor-content-routing") {
    throw new Error("The content-routing harness contract identity is invalid.");
  }

  const segmentCount = Number(argumentValue("--segments") ?? "96");
  const routeSeed = Number(argumentValue("--seed") ?? "0x48435632");
  const manifest = {
    schema: "horror-corridor.content-routing-manifest/1",
    runId,
    goal: contract.goal,
    authorityClass: "agent",
    layers: ["chain"],
    contract: {
      path: relativeToApp(CONTRACT_PATH),
      schemaVersion: contract.schemaVersion,
      sha256: createHash("sha256").update(rawContract).digest("hex"),
    },
    validatorVersion: VALIDATOR_VERSION,
    budgets: { attempts: 1, timeoutMs: TIMEOUT_MS, segmentCount },
    routeSeed,
    startedAt: startedAtIso,
  } as const;
  await writeJson(resolve(runRoot, "manifest.json"), manifest);
  await emit("run-started", "initialize", ["manifest.json"]);

  try {
    if (!Number.isInteger(segmentCount) || segmentCount < 2 || segmentCount > 4_096) {
      throw new Error("--segments must be an integer between 2 and 4096.");
    }
    if (!Number.isInteger(routeSeed) || routeSeed < 0 || routeSeed > 0xffffffff) {
      throw new Error("--seed must be an unsigned 32-bit integer.");
    }

    const generatorDistricts = CORRIDOR_DISTRICTS.filter((district) => district.setPieces.includes("service-nook"));
    const serviceDoorDistricts = CORRIDOR_DISTRICTS.filter((district) => district.setPieces.includes("closed-tavern"));
    const contexts = Array.from({ length: segmentCount }, (_, segmentIndex) => ({
      generator: {
        routeSeed,
        segmentIndex,
        districtId: generatorDistricts[segmentIndex % generatorDistricts.length].id,
        setPieceKind: "service-nook",
      } satisfies CorridorContentRouteContext,
      serviceDoor: {
        routeSeed,
        segmentIndex,
        districtId: serviceDoorDistricts[segmentIndex % serviceDoorDistricts.length].id,
        setPieceKind: "closed-tavern",
      } satisfies CorridorContentRouteContext,
    }));
    const inputPath = resolve(inputsRoot, "route-contexts.json");
    await writeJson(inputPath, {
      schema: "horror-corridor.content-routing-input/1",
      routeSeed,
      segmentCount,
      contexts,
    });
    await emit("step-completed", "build-route-contexts", [relativeToApp(inputPath)], { contextCount: contexts.length * 2 });

    const routing = createCorridorContentRoutingService();
    const rows = contexts.map(({ generator, serviceDoor }) => {
      const generatorProfile = routing.routeGenerator(generator);
      const generatorReplay = routing.routeGenerator(generator);
      const serviceDoorProfile = routing.routeServiceDoor(serviceDoor);
      const serviceDoorReplay = routing.routeServiceDoor(serviceDoor);
      const centerZ = 4 - generator.segmentIndex * CORRIDOR_SEGMENT_LENGTH_METERS - CORRIDOR_SEGMENT_LENGTH_METERS / 2;
      const side = generator.segmentIndex % 2 === 0 ? -1 : 1;
      const generatorChamber = createAuthoredCorridorSetPiece(
        "service-nook",
        generator.districtId,
        generator.segmentIndex,
        centerZ,
        side,
        routeSeed,
        routing,
      );
      const serviceDoorChamber = createAuthoredCorridorSetPiece(
        "closed-tavern",
        serviceDoor.districtId,
        serviceDoor.segmentIndex,
        centerZ,
        side,
        routeSeed,
        routing,
      );
      const generatorProp = generatorChamber.props.find((prop) => prop.kind === "generator");
      const serviceDoorProp = serviceDoorChamber.props.find((prop) => prop.kind === "service-door");
      return {
        segmentIndex: generator.segmentIndex,
        generator: {
          context: generator,
          profileId: generatorProfile.id,
          replayProfileId: generatorReplay.id,
          sameImmutableProfile: generatorProfile === generatorReplay,
          frozen: Object.isFrozen(generatorProfile) && Object.isFrozen(generatorProfile.parts),
          nonBlocking: generatorProfile.placementTags.includes("non-blocking"),
          positionX: generatorProp?.position.x ?? null,
          chamberProfileId: generatorProp?.routedObject?.id ?? null,
        },
        serviceDoor: {
          context: serviceDoor,
          profileId: serviceDoorProfile.id,
          replayProfileId: serviceDoorReplay.id,
          sameImmutableProfile: serviceDoorProfile === serviceDoorReplay,
          frozen: Object.isFrozen(serviceDoorProfile) && Object.isFrozen(serviceDoorProfile.parts),
          nonBlocking: serviceDoorProfile.placementTags.includes("non-blocking"),
          positionX: serviceDoorProp?.position.x ?? null,
          chamberProfileId: serviceDoorProp?.routedObject?.id ?? null,
        },
      };
    });
    const resultsPath = resolve(outputsRoot, "routing-results.json");
    await writeJson(resultsPath, {
      schema: "horror-corridor.content-routing-results/1",
      runId,
      rows,
    });
    await emit("step-completed", "call-routing-service", [relativeToApp(resultsPath)], { rowCount: rows.length });

    const expectedGeneratorIds = CORRIDOR_GENERATOR_VARIANTS.map((variant) => variant.id).sort();
    const expectedServiceDoorIds = CORRIDOR_SERVICE_DOOR_VARIANTS.map((variant) => variant.id).sort();
    const actualGeneratorIds = [...new Set(rows.map((row) => row.generator.profileId))].sort();
    const actualServiceDoorIds = [...new Set(rows.map((row) => row.serviceDoor.profileId))].sort();
    const deterministicReplay = rows.every((row) =>
      row.generator.profileId === row.generator.replayProfileId
      && row.generator.sameImmutableProfile
      && row.generator.frozen
      && row.serviceDoor.profileId === row.serviceDoor.replayProfileId
      && row.serviceDoor.sameImmutableProfile
      && row.serviceDoor.frozen);
    const variantCoverage = JSON.stringify(actualGeneratorIds) === JSON.stringify(expectedGeneratorIds)
      && JSON.stringify(actualServiceDoorIds) === JSON.stringify(expectedServiceDoorIds);
    const placementBoundary = rows.every((row) =>
      row.generator.nonBlocking
      && row.generator.chamberProfileId === row.generator.profileId
      && typeof row.generator.positionX === "number"
      && Math.abs(row.generator.positionX) >= 2
      && row.serviceDoor.nonBlocking
      && row.serviceDoor.chamberProfileId === row.serviceDoor.profileId
      && typeof row.serviceDoor.positionX === "number"
      && Math.abs(row.serviceDoor.positionX) >= 3);

    const expectedCatalogIds = [...expectedGeneratorIds, ...expectedServiceDoorIds]
      .map((id) => `object-variant:${id}`)
      .sort();
    const objectCatalogEntries = buildAuthoringCatalog().filter((entry) => entry.kind === "object-variant");
    const actualCatalogIds = objectCatalogEntries.map((entry) => entry.id).sort();
    const catalogParity = JSON.stringify(actualCatalogIds) === JSON.stringify(expectedCatalogIds)
      && objectCatalogEntries.every((entry) =>
        entry.domain === "corridor"
        && entry.sourceRefs.length === 1
        && entry.sourceRefs[0] === "HorrorCorridor-V2/src/content/corridorContentRouting.ts");

    const gates: readonly GateResult[] = [
      {
        decisionId: "decision-0001",
        gateId: "deterministic-replay",
        passed: deterministicReplay,
        evidence: { checkedRows: rows.length },
      },
      {
        decisionId: "decision-0002",
        gateId: "variant-coverage",
        passed: variantCoverage,
        evidence: { expectedGeneratorIds, actualGeneratorIds, expectedServiceDoorIds, actualServiceDoorIds },
      },
      {
        decisionId: "decision-0003",
        gateId: "placement-boundary",
        passed: placementBoundary,
        evidence: { generatorMinimumAbsX: 2, serviceDoorMinimumAbsX: 3 },
      },
      {
        decisionId: "decision-0004",
        gateId: "catalog-parity",
        passed: catalogParity,
        evidence: { expectedCatalogIds, actualCatalogIds },
      },
    ];
    for (const gate of gates) {
      const decisionPath = resolve(decisionsRoot, `${gate.gateId}.json`);
      await writeJson(decisionPath, {
        schema: "horror-corridor.content-routing-decision/1",
        runId,
        decisionId: gate.decisionId,
        gateId: gate.gateId,
        actorId: "routing-validator",
        inputArtifacts: [relativeToApp(resultsPath)],
        evidence: gate.evidence,
        outcome: gate.passed ? "PASS" : "REJECT",
        next: gate.passed ? (gate.gateId === "catalog-parity" ? "validated" : "continue") : "blocked",
      });
      await emit("gate-evaluated", gate.gateId, [relativeToApp(decisionPath)], {
        decisionId: gate.decisionId,
        outcome: gate.passed ? "PASS" : "REJECT",
      });
    }

    const passed = gates.every((gate) => gate.passed);
    const elapsedMs = Date.now() - startedAt;
    if (elapsedMs > TIMEOUT_MS) throw new Error(`Harness exceeded its ${TIMEOUT_MS}ms wall-clock budget.`);
    const validationPath = resolve(runRoot, "validation-report.json");
    const finalPath = resolve(runRoot, "final-report.json");
    await writeJson(validationPath, {
      schema: "horror-corridor.content-routing-validation/1",
      runId,
      status: passed ? "passed" : "failed",
      validatorVersion: VALIDATOR_VERSION,
      gates: gates.map((gate) => ({ gateId: gate.gateId, passed: gate.passed, decisionId: gate.decisionId })),
      elapsedMs,
    });
    await writeJson(finalPath, {
      schema: "horror-corridor.content-routing-final/1",
      runId,
      status: passed ? "validated" : "blocked",
      routeSeed,
      segmentCount,
      generatorVariants: actualGeneratorIds,
      serviceDoorVariants: actualServiceDoorIds,
      artifactRefs: [
        relativeToApp(inputPath),
        relativeToApp(resultsPath),
        relativeToApp(validationPath),
      ],
      elapsedMs,
    });
    await emit(passed ? "run-validated" : "run-blocked", "finish", [
      relativeToApp(validationPath),
      relativeToApp(finalPath),
    ], { elapsedMs });
    console.log(JSON.stringify({
      ok: passed,
      runId,
      runRoot: relativeToApp(runRoot),
      generatorVariants: actualGeneratorIds,
      serviceDoorVariants: actualServiceDoorIds,
      elapsedMs,
    }, null, 2));
    if (!passed) process.exitCode = 1;
  } catch (error) {
    const elapsedMs = Date.now() - startedAt;
    const message = error instanceof Error ? error.message : String(error);
    const validationPath = resolve(runRoot, "validation-report.json");
    const finalPath = resolve(runRoot, "final-report.json");
    await writeJson(validationPath, {
      schema: "horror-corridor.content-routing-validation/1",
      runId,
      status: "failed",
      validatorVersion: VALIDATOR_VERSION,
      gates: [],
      error: message,
      elapsedMs,
    });
    await writeJson(finalPath, {
      schema: "horror-corridor.content-routing-final/1",
      runId,
      status: "blocked",
      error: message,
      artifactRefs: [relativeToApp(validationPath)],
      elapsedMs,
    });
    await emit("run-blocked", "finish", [relativeToApp(validationPath), relativeToApp(finalPath)], { error: message, elapsedMs });
    console.error(JSON.stringify({ ok: false, runId, runRoot: relativeToApp(runRoot), error: message, elapsedMs }, null, 2));
    process.exitCode = 1;
  }
}

await main();
