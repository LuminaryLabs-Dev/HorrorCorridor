import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { AUTHORING_TOOL_RESULT_SCHEMA } from "../src/authoring/contracts";

const ROOT = resolve(import.meta.dirname, "..");
const REPORT_PATH = resolve(ROOT, "artifacts/authoring/mcp-proof-report.json");
const SERVER_PATH = resolve(ROOT, "tools/authoring-mcp/server.ts");
const TSX_PATH = resolve(ROOT, "node_modules/.bin/tsx");
const EXPECTED_TOOLS = new Set([
  "horror_authoring_status",
  "catalog_list",
  "content_get",
  "context_build",
  "packet_create",
  "packet_claim",
  "packet_submit",
  "review_record",
  "content_transition",
  "preview_open",
  "preview_update",
  "preview_capture",
  "preview_close",
  "proof_start",
  "proof_status",
  "proof_cancel",
  "promotion_evaluate",
  "worker_dispatch",
]);

type StructuredResult = {
  schema: string;
  success: boolean;
  data?: unknown;
  error?: { code: string; message: string };
  artifactRefs: string[];
  stateRevision: number;
  elapsedMs: number;
};

function asRecord(value: unknown): Record<string, unknown> {
  assert(value && typeof value === "object" && !Array.isArray(value));
  return value as Record<string, unknown>;
}

function dataRecord(result: StructuredResult): Record<string, unknown> {
  return asRecord(result.data);
}

async function main(): Promise<void> {
  const transport = new StdioClientTransport({
    command: TSX_PATH,
    args: [SERVER_PATH],
    cwd: ROOT,
    env: { ...process.env, HORROR_AUTHORING_PREVIEW_PORT: "4185" } as Record<string, string>,
    stderr: "pipe",
  });
  const serverDiagnostics: string[] = [];
  transport.stderr?.on("data", (chunk) => serverDiagnostics.push(String(chunk)));
  const client = new Client({ name: "horror-authoring-contract-proof", version: "1.0.0" });
  const calls: Array<{ name: string; success: boolean; elapsedMs: number; errorCode?: string }> = [];

  const call = async (
    name: string,
    args: Record<string, unknown> = {},
    expectedSuccess = true,
  ): Promise<StructuredResult> => {
    const response = await client.callTool({ name, arguments: args });
    const result = response.structuredContent as StructuredResult;
    assert.equal(result.schema, AUTHORING_TOOL_RESULT_SCHEMA, `${name} returned the wrong schema.`);
    assert.equal(result.success, expectedSuccess, `${name}: ${result.error?.message ?? "unexpected outcome"}`);
    assert(Number.isFinite(result.elapsedMs) && result.elapsedMs >= 0, `${name} omitted elapsedMs.`);
    assert(Number.isInteger(result.stateRevision) && result.stateRevision >= 0, `${name} omitted stateRevision.`);
    calls.push({
      name,
      success: result.success,
      elapsedMs: result.elapsedMs,
      ...(result.error ? { errorCode: result.error.code } : {}),
    });
    return result;
  };

  const acceptSpecification = async (contentId: string, sourceFile: string): Promise<string> => {
    const current = dataRecord(await call("content_get", { contentId }));
    const created = dataRecord(await call("packet_create", {
      contentId,
      goal: `Validate the resolved specification contract for ${contentId}.`,
      fixPlan: ["Confirm intent, source, dependency, pacing, variation, and acceptance metadata resolve together."],
      allowedFiles: [sourceFile],
    }));
    const packetId = String(created.packetId);
    await call("packet_claim", { packetId, worker: "mcp-contract-proof" });
    const submitted = dataRecord(await call("packet_submit", {
      packetId,
      summary: "Resolved authoring metadata was validated against the authoritative TypeScript source.",
      touchedFiles: [sourceFile],
      impactedContent: [contentId],
      evidenceRefs: ["HorrorCorridor-V2/src/authoring/catalog.ts"],
    }));
    assert(asRecord(submitted.delta).deltaId);
    await call("review_record", {
      packetId,
      gate: "specification",
      outcome: current.lifecycle === "mapped" ? "accepted" : "revision",
      notes: current.lifecycle === "mapped"
        ? "Intent, dependencies, variation, pacing, acceptance, and runtime source are complete."
        : "Contract call exercised without replacing the already accepted specification.",
      evidenceRefs: ["HorrorCorridor-V2/src/authoring/catalog.ts"],
    });
    return packetId;
  };

  try {
    await client.connect(transport);

    const listedTools = await client.listTools();
    assert.deepEqual(new Set(listedTools.tools.map((tool) => tool.name)), EXPECTED_TOOLS);
    for (const tool of listedTools.tools) assert(tool.outputSchema, `${tool.name} lacks structured outputSchema.`);

    await call("horror_authoring_status");
    const catalogResult = await call("catalog_list", { limit: 500 });
    const catalog = dataRecord(catalogResult);
    assert.equal(catalog.total, 202);
    await call("content_get", { contentId: "set-piece:mortuary-bay" });
    await call("context_build", { contentId: "set-piece:mortuary-bay" });

    const metalPacket = await acceptSpecification(
      "audio-motif:metal",
      "HorrorCorridor-V2/src/adapters/spatialAudio.ts",
    );
    await acceptSpecification(
      "audio-motif:voice",
      "HorrorCorridor-V2/src/adapters/spatialAudio.ts",
    );
    await acceptSpecification(
      "offering:red-thread",
      "HorrorCorridor-V2/src/content/offerings.ts",
    );

    const contextual = dataRecord(await call("context_build", { contentId: "audio-motif:metal" }));
    const contextualDeltas = contextual.relevantDeltas as Array<Record<string, unknown>>;
    assert(contextualDeltas.some((delta) => delta.contentId === "audio-motif:metal"));
    assert(contextualDeltas.some((delta) => delta.contentId === "audio-motif:voice"));
    assert(!contextualDeltas.some((delta) => delta.contentId === "offering:red-thread"));

    const metalContent = dataRecord(await call("content_get", { contentId: "audio-motif:metal" }));
    await call("content_transition", {
      contentId: "audio-motif:metal",
      lifecycle: metalContent.lifecycle,
    });

    const opened = dataRecord(await call("preview_open", {
      contentId: "set-piece:mortuary-bay",
      setPieceId: "set-piece:mortuary-bay",
      districtId: "district:cold-delivery",
      monsterId: "monster:morgue-twin-hushed",
      phase: "approaching",
      cameraPreset: "initial",
    }));
    const sessionId = String(opened.sessionId);
    assert.equal(opened.ready, true);
    await call("preview_update", { sessionId, phase: "repelling", cameraPreset: "approach" });
    const captured = await call("preview_capture", { sessionId, cameraPreset: "look-left" });
    assert.equal(captured.artifactRefs.length, 1);
    const captureName = captured.artifactRefs[0].split("/").at(-1);
    assert(captureName);

    const livePreview = await client.readResource({ uri: `horror-authoring://previews/${sessionId}` });
    assert.equal(livePreview.contents[0].mimeType, "application/json");
    const liveImage = await client.readResource({
      uri: `horror-authoring://preview-images/${sessionId}/${encodeURIComponent(captureName)}`,
    });
    assert.equal(liveImage.contents[0].mimeType, "image/png");
    await call("preview_close", { sessionId });
    await call("preview_capture", { sessionId }, false);

    const focusedQueued = dataRecord(await call("proof_start", {
      level: "focused",
      contentIds: ["set-piece:mortuary-bay"],
    }));
    const focusedRunId = String(focusedQueued.runId);
    let focused: Record<string, unknown> = focusedQueued;
    const proofDeadline = Date.now() + 40_000;
    while (!["passed", "failed", "cancelled"].includes(String(focused.status)) && Date.now() < proofDeadline) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
      focused = dataRecord(await call("proof_status", { runId: focusedRunId }));
    }
    assert.equal(focused.status, "passed", `Focused proof failed: ${String(focused.error)}`);

    const promotionQueued = dataRecord(await call("proof_start", {
      level: "promotion",
      contentIds: ["set-piece:mortuary-bay"],
    }));
    const promotionRunId = String(promotionQueued.runId);
    const cancelled = dataRecord(await call("proof_cancel", { runId: promotionRunId }));
    assert.equal(cancelled.status, "cancelled");
    await call("promotion_evaluate", { contentIds: ["set-piece:mortuary-bay"] });
    await call("worker_dispatch", { packetId: metalPacket }, false);

    await call("content_get", { contentId: "not-real" }, false);
    await call("packet_create", {
      contentId: "set-piece:mortuary-bay",
      goal: "Reject traversal.",
      fixPlan: ["Do not escape the repository."],
      allowedFiles: ["../outside.ts"],
    }, false);
    await call("content_transition", {
      contentId: "set-piece:mortuary-bay",
      lifecycle: "promoted",
    }, false);

    const listedPrompts = await client.listPrompts();
    const promptArgs: Record<string, Record<string, string>> = {
      horror_implement_content: { packetId: metalPacket, contentId: "audio-motif:metal" },
      horror_review_content: { packetId: metalPacket, gate: "specification" },
      horror_review_cohesion: { contentIds: "audio-motif:metal,audio-motif:voice" },
      horror_review_promotion: { contentIds: "set-piece:mortuary-bay" },
    };
    assert.deepEqual(
      new Set(listedPrompts.prompts.map((prompt) => prompt.name)),
      new Set(Object.keys(promptArgs)),
    );
    for (const prompt of listedPrompts.prompts) {
      const result = await client.getPrompt({ name: prompt.name, arguments: promptArgs[prompt.name] });
      assert(result.messages.length > 0, `${prompt.name} returned no messages.`);
    }

    const resources = await client.listResources();
    assert(resources.resources.length >= 205, `Expected resolved catalog resources; received ${resources.resources.length}.`);
    for (const resource of resources.resources) {
      const read = await client.readResource({ uri: resource.uri });
      assert(read.contents.length > 0, `Resource ${resource.uri} returned no content.`);
    }
    const templates = await client.listResourceTemplates();
    assert(templates.resourceTemplates.length >= 5);

    const calledTools = new Set(calls.map((entry) => entry.name));
    assert.deepEqual(calledTools, EXPECTED_TOOLS);
    const events = (await readFile(resolve(ROOT, "../.agent/authoring/events.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { event: string; detail?: { name?: string; elapsedMs?: number } });
    const recordedToolCalls = events.filter((event) =>
      event.event === "mcp-tool-call"
      && event.detail?.name
      && Number.isFinite(event.detail.elapsedMs));
    const recordedToolNames = new Set(recordedToolCalls.map((event) => event.detail?.name));
    for (const name of EXPECTED_TOOLS) assert(recordedToolNames.has(name), `${name} timing was not durably recorded.`);
    const latestImageResources = resources.resources.filter((resource) =>
      resource.uri.startsWith("horror-authoring://preview-images/"));
    assert(latestImageResources.length > 0, "No latest preview image resource was exposed.");

    const report = {
      schema: "horror-corridor.authoring-mcp-proof/1",
      passed: true,
      toolCount: listedTools.tools.length,
      promptCount: listedPrompts.prompts.length,
      resourceCount: resources.resources.length,
      resourceTemplateCount: templates.resourceTemplates.length,
      recordedToolTimingCount: recordedToolCalls.length,
      calls,
      focusedRunId,
      focusedElapsedMs: focused.elapsedMs,
      latestPreviewImage: latestImageResources.at(-1)?.uri,
      serverDiagnostics,
      completedAt: new Date().toISOString(),
    };
    await mkdir(resolve(ROOT, "artifacts/authoring"), { recursive: true });
    await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await client.close().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
