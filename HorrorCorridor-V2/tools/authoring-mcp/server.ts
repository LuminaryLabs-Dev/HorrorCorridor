#!/usr/bin/env node
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  AUTHORING_LIFECYCLES,
  AUTHORING_TOOL_RESULT_SCHEMA,
  type AuthoringToolResult,
} from "../../src/authoring/contracts";
import { AuthoringEngine } from "./engine";
import { AuthoringDomainError } from "./errors";
import { AuthoringPreviewManager } from "./preview-manager";
import { AuthoringProofManager, previewConfigForContent } from "./proof-manager";
import { AuthoringStateStore } from "./state-store";

const store = new AuthoringStateStore();
const previews = new AuthoringPreviewManager(store);
const proofs = new AuthoringProofManager(store, previews);
const engine = new AuthoringEngine(store, proofs);
const server = new McpServer({ name: "horror-corridor-authoring", version: "1.0.0" });

const CONTENT_KINDS = [
  "district",
  "set-piece",
  "monster-family",
  "monster",
  "audio-motif",
  "offering",
  "progression-beat",
] as const;
const DOMAINS = ["expedition", "corridor", "party", "dread", "shared-expedition", "composition"] as const;
const PREVIEW_PHASES = ["sign", "approaching", "repelling", "blackout", "last-chance"] as const;
const CAMERAS = ["initial", "approach", "look-left", "look-right"] as const;
const REVIEW_GATES = ["specification", "preview", "focused-proof", "cohesion", "promotion"] as const;
const REVIEW_OUTCOMES = ["accepted", "revision", "blocked"] as const;
const PROOF_LEVELS = ["focused", "cohesion", "promotion"] as const;

const OUTPUT_SCHEMA = {
  schema: z.literal(AUTHORING_TOOL_RESULT_SCHEMA),
  success: z.boolean(),
  data: z.any().optional(),
  error: z.object({
    code: z.string(),
    message: z.string(),
    retryable: z.boolean(),
    details: z.any().optional(),
  }).optional(),
  artifactRefs: z.array(z.string()),
  stateRevision: z.number().int().nonnegative(),
  elapsedMs: z.number().nonnegative(),
};

type ToolPayload = Readonly<{
  data: unknown;
  artifactRefs?: readonly string[];
  revision?: number;
}>;

function payload(data: unknown, artifactRefs: readonly string[] = [], revision?: number): ToolPayload {
  return { data, artifactRefs, revision };
}

async function toolResult(name: string, operation: () => ToolPayload | Promise<ToolPayload>) {
  const startedAt = performance.now();
  let result: AuthoringToolResult<unknown>;
  try {
    const value = await operation();
    const revision = value.revision ?? (await store.getState()).revision;
    result = Object.freeze({
      schema: AUTHORING_TOOL_RESULT_SCHEMA,
      success: true,
      data: value.data,
      artifactRefs: Object.freeze([...(value.artifactRefs ?? [])]),
      stateRevision: revision,
      elapsedMs: performance.now() - startedAt,
    });
  } catch (error) {
    const known = error instanceof AuthoringDomainError;
    let revision = 0;
    try {
      revision = (await store.getState()).revision;
    } catch {
      // Initialization errors still use the same structured result contract.
    }
    result = Object.freeze({
      schema: AUTHORING_TOOL_RESULT_SCHEMA,
      success: false,
      error: {
        code: known ? error.code : "AUTHORING_INTERNAL_ERROR",
        message: (error as Error).message,
        retryable: known ? error.retryable : false,
        ...(known && error.details !== undefined ? { details: error.details } : {}),
      },
      artifactRefs: [],
      stateRevision: revision,
      elapsedMs: performance.now() - startedAt,
    });
  }
  await store.recordToolCall({
    name,
    success: result.success,
    elapsedMs: result.elapsedMs,
    ...(result.error ? { errorCode: result.error.code } : {}),
  }).catch((error) => console.error(`Unable to persist ${name} call timing: ${(error as Error).message}`));
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result) }],
    structuredContent: result,
    isError: !result.success,
  };
}

server.registerTool("horror_authoring_status", {
  title: "Horror authoring status",
  description: "Inspect catalog coverage, active packets, proof runs, cohesion state, and the durable state revision.",
  inputSchema: {},
  outputSchema: OUTPUT_SCHEMA,
  annotations: { readOnlyHint: true, idempotentHint: true },
}, async () => toolResult("horror_authoring_status", async () => payload({
  ...await engine.status(),
  preview: {
    activeSessions: previews.list().length,
    capturedImages: previews.listCaptures().length,
  },
})));

server.registerTool("catalog_list", {
  title: "List authoring catalog",
  description: "List resolved runtime-backed authoring entries with optional kind, domain, lifecycle, and text filters.",
  inputSchema: {
    kind: z.enum(CONTENT_KINDS).optional(),
    domain: z.enum(DOMAINS).optional(),
    lifecycle: z.enum(AUTHORING_LIFECYCLES).optional(),
    search: z.string().optional(),
    limit: z.number().int().min(1).max(500).default(250),
  },
  outputSchema: OUTPUT_SCHEMA,
  annotations: { readOnlyHint: true, idempotentHint: true },
}, async (input) => toolResult("catalog_list", () => payload(engine.catalogList(input))));

server.registerTool("content_get", {
  title: "Get authoring content",
  description: "Read one resolved catalog entry, including runtime source references and current lifecycle evidence.",
  inputSchema: { contentId: z.string().min(1) },
  outputSchema: OUTPUT_SCHEMA,
  annotations: { readOnlyHint: true, idempotentHint: true },
}, async ({ contentId }) => toolResult("content_get", () => payload(engine.contentGet(contentId))));

server.registerTool("context_build", {
  title: "Build bounded authoring context",
  description: "Build a target capsule with neighbors, direct dependencies, evidence, and up to three relevance-ranked accepted deltas.",
  inputSchema: { contentId: z.string().min(1) },
  outputSchema: OUTPUT_SCHEMA,
  annotations: { readOnlyHint: true, idempotentHint: true },
}, async ({ contentId }) => toolResult("context_build", async () => payload(await engine.contextBuild(contentId))));

server.registerTool("packet_create", {
  title: "Create authoring packet",
  description: "Create one bounded implementation packet with an explicit fix plan and repository-relative file allowlist.",
  inputSchema: {
    contentId: z.string().min(1),
    goal: z.string().min(1),
    fixPlan: z.array(z.string().min(1)).min(1),
    allowedFiles: z.array(z.string().min(1)).optional(),
    acceptance: z.array(z.string().min(1)).optional(),
  },
  outputSchema: OUTPUT_SCHEMA,
}, async (input) => toolResult("packet_create", async () => {
  const result = await engine.packetCreate(input);
  return payload(result.packet, [], result.revision);
}));

server.registerTool("packet_claim", {
  title: "Claim authoring packet",
  description: "Bind an unclaimed implementation packet to one connected worker identity.",
  inputSchema: { packetId: z.string().min(1), worker: z.string().min(1) },
  outputSchema: OUTPUT_SCHEMA,
}, async ({ packetId, worker }) => toolResult("packet_claim", async () => {
  const result = await engine.packetClaim(packetId, worker);
  return payload(result.packet, [], result.revision);
}));

server.registerTool("packet_submit", {
  title: "Submit authoring packet",
  description: "Record a bounded implementation delta; submission never advances content lifecycle.",
  inputSchema: {
    packetId: z.string().min(1),
    summary: z.string().min(1),
    touchedFiles: z.array(z.string().min(1)).min(1),
    impactedContent: z.array(z.string().min(1)).optional(),
    evidenceRefs: z.array(z.string().min(1)).optional(),
    crossDomainRisks: z.array(z.string().min(1)).optional(),
    futureSuggestions: z.array(z.string().min(1)).optional(),
  },
  outputSchema: OUTPUT_SCHEMA,
}, async (input) => toolResult("packet_submit", async () => {
  const result = await engine.packetSubmit(input);
  return payload({ packet: result.packet, delta: result.delta }, result.delta.evidenceRefs, result.revision);
}));

server.registerTool("review_record", {
  title: "Record authoring review",
  description: "Accept, revise, or block a submitted packet at one evidence-gated lifecycle boundary.",
  inputSchema: {
    packetId: z.string().min(1),
    gate: z.enum(REVIEW_GATES),
    outcome: z.enum(REVIEW_OUTCOMES),
    notes: z.string().min(1),
    evidenceRefs: z.array(z.string().min(1)).optional(),
    proofRunId: z.string().min(1).optional(),
  },
  outputSchema: OUTPUT_SCHEMA,
}, async (input) => toolResult("review_record", async () => {
  const result = await engine.reviewRecord(input);
  return payload(
    { review: result.review, packet: result.packet, content: result.content },
    result.review.evidenceRefs,
    result.revision,
  );
}));

server.registerTool("content_transition", {
  title: "Confirm content lifecycle transition",
  description: "Confirm an evidence-backed adjacent lifecycle transition; this cannot bypass review gates.",
  inputSchema: {
    contentId: z.string().min(1),
    lifecycle: z.enum(AUTHORING_LIFECYCLES),
  },
  outputSchema: OUTPUT_SCHEMA,
}, async ({ contentId, lifecycle }) => toolResult("content_transition", async () => payload(await engine.contentTransition(contentId, lifecycle))));

const PREVIEW_CONFIG_SCHEMA = {
  setPieceId: z.string().min(1).optional(),
  districtId: z.string().min(1).optional(),
  monsterId: z.string().min(1).optional(),
  phase: z.enum(PREVIEW_PHASES).optional(),
  cameraPreset: z.enum(CAMERAS).optional(),
};

server.registerTool("preview_open", {
  title: "Open focused preview",
  description: "Open one reusable, internal browser preview without route traversal or player-facing editor UI.",
  inputSchema: {
    contentId: z.string().min(1),
    ...PREVIEW_CONFIG_SCHEMA,
  },
  outputSchema: OUTPUT_SCHEMA,
}, async ({ contentId, ...config }) => toolResult("preview_open", async () => {
  engine.contentGet(contentId);
  return payload(await previews.open({
    contentId,
    config: { ...previewConfigForContent(contentId), ...config },
  }));
}));

server.registerTool("preview_update", {
  title: "Update focused preview",
  description: "Change the selected prefab, district, monster, encounter phase, or camera on a warm preview session.",
  inputSchema: {
    sessionId: z.string().min(1),
    ...PREVIEW_CONFIG_SCHEMA,
  },
  outputSchema: OUTPUT_SCHEMA,
}, async ({ sessionId, ...update }) => toolResult("preview_update", async () => {
  if (Object.values(update).every((value) => value === undefined)) {
    throw new AuthoringDomainError("INVALID_ARGUMENT", "preview_update needs at least one changed field.");
  }
  return payload(await previews.update(sessionId, update));
}));

server.registerTool("preview_capture", {
  title: "Capture focused preview",
  description: "Capture the clean player view for the current target and optional camera preset.",
  inputSchema: {
    sessionId: z.string().min(1),
    cameraPreset: z.enum(CAMERAS).optional(),
  },
  outputSchema: OUTPUT_SCHEMA,
}, async ({ sessionId, cameraPreset }) => toolResult("preview_capture", async () => {
  const result = await previews.capture(sessionId, cameraPreset);
  return payload(result.session, [result.artifactRef]);
}));

server.registerTool("preview_close", {
  title: "Close focused preview",
  description: "Close one preview page while preserving its durable capture artifacts.",
  inputSchema: { sessionId: z.string().min(1) },
  outputSchema: OUTPUT_SCHEMA,
}, async ({ sessionId }) => toolResult("preview_close", async () => payload(await previews.close(sessionId))));

server.registerTool("proof_start", {
  title: "Start authoring proof",
  description: "Queue an allowlisted focused, cohesion, or full milestone proof and return immediately.",
  inputSchema: {
    level: z.enum(PROOF_LEVELS),
    contentIds: z.array(z.string().min(1)).min(1).max(25),
  },
  outputSchema: OUTPUT_SCHEMA,
}, async ({ level, contentIds }) => toolResult("proof_start", async () => {
  contentIds.forEach((contentId) => engine.contentGet(contentId));
  const result = await proofs.start(level, contentIds);
  return payload(result.run, [], result.revision);
}));

server.registerTool("proof_status", {
  title: "Read authoring proof",
  description: "Read one durable proof run and its artifact references.",
  inputSchema: { runId: z.string().min(1) },
  outputSchema: OUTPUT_SCHEMA,
  annotations: { readOnlyHint: true, idempotentHint: true },
}, async ({ runId }) => toolResult("proof_status", async () => {
  const proof = await proofs.get(runId);
  if (!proof) throw new AuthoringDomainError("PROOF_NOT_FOUND", `Unknown proof run: ${runId}`);
  return payload(proof, proof.artifactRefs);
}));

server.registerTool("proof_cancel", {
  title: "Cancel authoring proof",
  description: "Cancel a queued or running proof process owned by this MCP server.",
  inputSchema: { runId: z.string().min(1) },
  outputSchema: OUTPUT_SCHEMA,
}, async ({ runId }) => toolResult("proof_cancel", async () => {
  const result = await proofs.cancel(runId);
  return payload(result.run, result.run.artifactRefs, result.revision);
}));

server.registerTool("promotion_evaluate", {
  title: "Evaluate promotion",
  description: "Report milestone promotion eligibility without mutating lifecycle state.",
  inputSchema: { contentIds: z.array(z.string().min(1)).min(1).max(25) },
  outputSchema: OUTPUT_SCHEMA,
  annotations: { readOnlyHint: true, idempotentHint: true },
}, async ({ contentIds }) => toolResult("promotion_evaluate", async () => payload(await engine.promotionEvaluate(contentIds))));

server.registerTool("worker_dispatch", {
  title: "Dispatch optional worker",
  description: "Dispatch a claimed packet only when an explicit external worker adapter is configured; disabled by default.",
  inputSchema: { packetId: z.string().min(1), adapter: z.string().min(1).optional() },
  outputSchema: OUTPUT_SCHEMA,
}, async () => toolResult("worker_dispatch", () => engine.workerDispatch()));

server.registerResource("horror-authoring-intent", "horror-authoring://intent", {
  title: "HorrorCorridor authoring intent",
  description: "The durable goal and architecture references governing bounded authoring.",
  mimeType: "application/json",
}, async () => ({
  contents: [{
    uri: "horror-authoring://intent",
    mimeType: "application/json",
    text: JSON.stringify({
      intention: "Preserve broad game intent and the complete content universe while proving one bounded target at a time.",
      references: ["goal.md", "memory.md", "HorrorCorridor-V2/goal.md", "HorrorCorridor-V2/memory.md"],
      interface: "stdio MCP only",
    }, null, 2),
  }],
}));

server.registerResource("horror-authoring-catalog", "horror-authoring://catalog", {
  title: "Resolved authoring catalog",
  description: "Runtime-backed content plus its authoring metadata overlay.",
  mimeType: "application/json",
}, async () => ({
  contents: [{
    uri: "horror-authoring://catalog",
    mimeType: "application/json",
    text: JSON.stringify(engine.catalogList({ limit: 500 }), null, 2),
  }],
}));

server.registerResource("horror-authoring-content", new ResourceTemplate("horror-authoring://content/{contentId}", {
  list: async () => ({
    resources: (engine.catalogList({ limit: 500 }).entries as Array<{ id: string; title: string }>).map((entry) => ({
      uri: `horror-authoring://content/${encodeURIComponent(entry.id)}`,
      name: entry.id,
      title: entry.title,
      mimeType: "application/json",
    })),
  }),
  complete: { contentId: () => (engine.catalogList({ limit: 500 }).entries as Array<{ id: string }>).map((entry) => entry.id) },
}), {
  title: "Authoring content entry",
  description: "One resolved authoring catalog entry.",
  mimeType: "application/json",
}, async (uri, { contentId }) => ({
  contents: [{
    uri: uri.href,
    mimeType: "application/json",
    text: JSON.stringify(engine.contentGet(decodeURIComponent(String(contentId))), null, 2),
  }],
}));

server.registerResource("horror-authoring-packet", new ResourceTemplate("horror-authoring://packets/{packetId}", {
  list: async () => ({
    resources: (await store.listPackets()).map((packet) => ({
      uri: `horror-authoring://packets/${packet.packetId}`,
      name: packet.packetId,
      title: `${packet.contentId}: ${packet.goal}`,
      description: packet.status,
      mimeType: "application/json",
    })),
  }),
  complete: { packetId: async () => (await store.listPackets()).map((packet) => packet.packetId) },
}), {
  title: "Authoring packet",
  description: "One durable bounded implementation packet.",
  mimeType: "application/json",
}, async (uri, { packetId }) => ({
  contents: [{
    uri: uri.href,
    mimeType: "application/json",
    text: JSON.stringify(await store.readPacket(String(packetId)), null, 2),
  }],
}));

server.registerResource("horror-authoring-proof", new ResourceTemplate("horror-authoring://proofs/{runId}", {
  list: async () => ({
    resources: (await store.listProofs()).map((proof) => ({
      uri: `horror-authoring://proofs/${proof.runId}`,
      name: proof.runId,
      title: `${proof.level} proof`,
      description: proof.status,
      mimeType: "application/json",
    })),
  }),
  complete: { runId: async () => (await store.listProofs()).map((proof) => proof.runId) },
}), {
  title: "Authoring proof",
  description: "One durable focused, cohesion, or promotion proof report.",
  mimeType: "application/json",
}, async (uri, { runId }) => ({
  contents: [{
    uri: uri.href,
    mimeType: "application/json",
    text: JSON.stringify(await store.readProof(String(runId)), null, 2),
  }],
}));

server.registerResource("horror-authoring-preview", new ResourceTemplate("horror-authoring://previews/{sessionId}", {
  list: async () => ({
    resources: previews.list().map((preview) => ({
      uri: `horror-authoring://previews/${preview.sessionId}`,
      name: preview.sessionId,
      title: `${preview.contentId} preview`,
      description: `${preview.captureRefs.length} captures`,
      mimeType: "application/json",
    })),
  }),
  complete: { sessionId: () => previews.list().map((preview) => preview.sessionId) },
}), {
  title: "Focused preview session",
  description: "One live focused preview and its latest capture references.",
  mimeType: "application/json",
}, async (uri, { sessionId }) => ({
  contents: [{
    uri: uri.href,
    mimeType: "application/json",
    text: JSON.stringify(previews.get(String(sessionId)), null, 2),
  }],
}));

server.registerResource("horror-authoring-preview-image", new ResourceTemplate(
  "horror-authoring://preview-images/{sessionId}/{captureName}",
  {
    list: async () => ({
      resources: previews.listCaptures().map((capture) => ({
        uri: `horror-authoring://preview-images/${capture.sessionId}/${encodeURIComponent(capture.captureName)}`,
        name: capture.captureName,
        title: `Focused preview ${capture.captureName}`,
        mimeType: "image/png",
      })),
    }),
  },
), {
  title: "Focused preview image",
  description: "A clean player-view PNG from a live preview session.",
  mimeType: "image/png",
}, async (uri, { sessionId, captureName }) => {
  const requestedName = decodeURIComponent(String(captureName));
  const ref = previews.captureRef(String(sessionId), requestedName);
  if (!ref) throw new Error(`Unknown preview image: ${requestedName}`);
  const image = await previews.readCapture(ref);
  return { contents: [{ uri: uri.href, mimeType: image.mimeType, blob: image.blob }] };
});

server.registerPrompt("horror_implement_content", {
  title: "Implement one HorrorCorridor content target",
  description: "Canonical bounded implementation instructions for a claimed packet.",
  argsSchema: {
    packetId: z.string().describe("Claimed authoring packet ID"),
    contentId: z.string().describe("Target catalog content ID"),
  },
}, async ({ packetId, contentId }) => ({
  messages: [{
    role: "user",
    content: {
      type: "text",
      text: `Read horror-authoring://packets/${packetId} and horror-authoring://content/${contentId}. Implement only the packet goal inside its domain boundary and allowed files. Use the target, neighbors, direct dependencies, three accepted deltas, evidence, and fix plan as context. Return cross-domain discoveries as risks or futureSuggestions; do not expand scope. Preview and prove the target, then submit with packet_submit.`,
    },
  }],
}));

server.registerPrompt("horror_review_content", {
  title: "Review one HorrorCorridor content target",
  description: "Canonical focused review instructions.",
  argsSchema: { packetId: z.string(), gate: z.enum(REVIEW_GATES) },
}, async ({ packetId, gate }) => ({
  messages: [{
    role: "user",
    content: {
      type: "text",
      text: `Review horror-authoring://packets/${packetId} at the ${gate} gate. Inspect only the target, its immediate dependencies, and supplied evidence. Fail closed on browser errors, unreadable player view, missing proof, scope escape, or domain-owned decisions in adapters. Record accepted, revision, or blocked with review_record.`,
    },
  }],
}));

server.registerPrompt("horror_review_cohesion", {
  title: "Review changed route cohesion",
  description: "Canonical before-target-after cohesion review.",
  argsSchema: { contentIds: z.string().describe("Comma-separated changed content IDs") },
}, async ({ contentIds }) => ({
  messages: [{
    role: "user",
    content: {
      type: "text",
      text: `Start a cohesion proof for ${contentIds}. Review only the changed section and its immediate before/after beats for transitions, pacing, repetition, lighting, audio, movement, and route readability. Do not reopen accepted focused evidence unless the integration creates a new regression.`,
    },
  }],
}));

server.registerPrompt("horror_review_promotion", {
  title: "Review HorrorCorridor milestone promotion",
  description: "Canonical full-game milestone instructions.",
  argsSchema: { contentIds: z.string().describe("Comma-separated integrated content IDs") },
}, async ({ contentIds }) => ({
  messages: [{
    role: "user",
    content: {
      type: "text",
      text: `Run the promotion proof for ${contentIds}. Require lint, typecheck/build, deterministic runtime, full live gameplay, save/load, networking and reconnect, legacy harness, and ten-minute timeline gates. Promotion failure leaves focused and cohesion evidence intact and keeps content integrated.`,
    },
  }],
}));

let shuttingDown = false;
async function shutdown(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  await proofs.shutdown();
  await previews.shutdown();
  await server.close();
}

async function main(): Promise<void> {
  await engine.initialize();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("HorrorCorridor Authoring MCP running on stdio.");
}

process.on("SIGINT", () => {
  void shutdown().finally(() => process.exit(0));
});
process.on("SIGTERM", () => {
  void shutdown().finally(() => process.exit(0));
});

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
