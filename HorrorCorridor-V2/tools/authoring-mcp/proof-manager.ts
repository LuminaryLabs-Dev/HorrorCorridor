import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { PNG } from "pngjs";
import { CORRIDOR_DISTRICTS } from "../../src/content/chamber";
import { MONSTER_PROFILES } from "../../src/content/monsters";
import { CORRIDOR_PREFABS } from "../../src/presentation/prefabRegistry";
import { DEFAULT_AUTHORING_PREVIEW } from "../../src/authoring/previewSnapshot";
import type {
  AuthoringCameraPreset,
  AuthoringPreviewConfig,
  AuthoringProofLevel,
  AuthoringProofRun,
  AuthoringProofStatus,
} from "../../src/authoring/contracts";
import {
  APP_ROOT,
  AUTHORING_ARTIFACT_ROOT,
  AUTHORING_EVIDENCE_ROOT,
  REPO_ROOT,
  AuthoringStateStore,
} from "./state-store";
import { AuthoringPreviewManager } from "./preview-manager";
import { AuthoringDomainError } from "./errors";

type RunControl = {
  cancelled: boolean;
  child: ChildProcessWithoutNullStreams | null;
};

type CaptureMetric = Readonly<{
  artifactRef: string;
  width: number;
  height: number;
  average: number;
  darkRatio: number;
  lightRatio: number;
  centerAverage: number;
  foregroundAverage: number;
  captureElapsedMs: number;
  passed: boolean;
}>;

const CAMERA_PROOF: readonly AuthoringCameraPreset[] = ["initial", "approach", "look-left", "look-right"];
const PROMOTION_COMMAND_LABELS: readonly (readonly string[])[] = [
  ["npm", "run", "lint"],
  ["npm", "run", "build"],
  ["npm", "run", "proof:runtime"],
  ["npm", "run", "proof:live", "--", "--url", "$PREVIEW_URL"],
  ["npm", "run", "proof:legacy"],
  ["npm", "run", "review:timeline", "--", "--url", "$PREVIEW_URL", "--seconds", "600"],
];

function artifactRef(path: string): string {
  return relative(REPO_ROOT, path).replaceAll("\\", "/");
}

export function previewConfigForContent(contentId: string): AuthoringPreviewConfig {
  if (contentId.startsWith("set-piece:")) {
    const kind = contentId.slice("set-piece:".length) as keyof typeof CORRIDOR_PREFABS;
    const districtId = CORRIDOR_PREFABS[kind]?.applicableDistricts[0];
    if (districtId) {
      return { ...DEFAULT_AUTHORING_PREVIEW, setPieceId: contentId, districtId: `district:${districtId}` };
    }
  }
  if (contentId.startsWith("district:")) {
    const districtId = contentId.slice("district:".length);
    const district = CORRIDOR_DISTRICTS.find((value) => value.id === districtId);
    if (district) return {
      ...DEFAULT_AUTHORING_PREVIEW,
      districtId: contentId,
      setPieceId: `set-piece:${district.setPieces[0]}`,
    };
  }
  if (contentId.startsWith("monster:")) {
    return { ...DEFAULT_AUTHORING_PREVIEW, monsterId: contentId };
  }
  if (contentId.startsWith("monster-family:")) {
    const family = contentId.slice("monster-family:".length);
    const monster = MONSTER_PROFILES.find((value) => value.family === family);
    if (monster) return { ...DEFAULT_AUTHORING_PREVIEW, monsterId: `monster:${monster.id}` };
  }
  if (contentId.startsWith("audio-motif:")) {
    const channel = contentId.slice("audio-motif:".length);
    const monster = MONSTER_PROFILES.find((value) => value.sensoryChannel === channel);
    if (monster) return { ...DEFAULT_AUTHORING_PREVIEW, monsterId: `monster:${monster.id}`, phase: "sign" };
  }
  return DEFAULT_AUTHORING_PREVIEW;
}

export class AuthoringProofManager {
  private controls = new Map<string, RunControl>();

  constructor(
    private readonly store: AuthoringStateStore,
    private readonly previews: AuthoringPreviewManager,
  ) {}

  async start(
    level: AuthoringProofLevel,
    contentIds: readonly string[],
  ): Promise<{ run: AuthoringProofRun; revision: number }> {
    const normalizedIds = Object.freeze([...new Set(contentIds)]);
    if (normalizedIds.length === 0) throw new Error("A proof requires at least one content ID.");
    const transaction = await this.store.transaction("proof-queued", { level, contentIds: normalizedIds }, (tx) => {
      const runId = tx.nextId("proof");
      const run: AuthoringProofRun = Object.freeze({
        schema: "horror-corridor.authoring-proof/1",
        runId,
        level,
        contentIds: normalizedIds,
        status: "queued",
        startedAt: null,
        finishedAt: null,
        elapsedMs: null,
        artifactRefs: [],
        command: level === "promotion" ? PROMOTION_COMMAND_LABELS.map((command) => command.join(" ")) : ["focused-browser-preview"],
        exitCode: null,
        error: null,
      });
      tx.write(this.store.proofPath(runId), run);
      return run;
    });
    const control: RunControl = { cancelled: false, child: null };
    this.controls.set(transaction.value.runId, control);
    queueMicrotask(() => {
      void this.execute(transaction.value, control);
    });
    return { run: transaction.value, revision: transaction.revision };
  }

  async get(runId: string): Promise<AuthoringProofRun | null> {
    return this.store.readProof(runId);
  }

  async latest(
    level: AuthoringProofLevel,
    contentId: string,
  ): Promise<{ runId: string; status: AuthoringProofStatus } | null> {
    const proofs = await this.store.listProofs();
    const proof = [...proofs].reverse().find((value) => value.level === level && value.contentIds.includes(contentId));
    return proof ? { runId: proof.runId, status: proof.status } : null;
  }

  async cancel(runId: string): Promise<{ run: AuthoringProofRun; revision: number }> {
    const run = await this.store.readProof(runId);
    if (!run) throw new AuthoringDomainError("PROOF_NOT_FOUND", `Unknown proof run: ${runId}`);
    if (!["queued", "running"].includes(run.status)) return { run, revision: (await this.store.getState()).revision };
    const control = this.controls.get(runId);
    if (control) {
      control.cancelled = true;
      control.child?.kill("SIGTERM");
    }
    const finishedAt = new Date().toISOString();
    const cancelled: AuthoringProofRun = Object.freeze({
      ...run,
      status: "cancelled",
      finishedAt,
      elapsedMs: run.startedAt ? Date.now() - Date.parse(run.startedAt) : 0,
      error: "Cancelled by MCP host.",
    });
    const transaction = await this.store.transaction("proof-cancelled", { runId }, (tx) => {
      tx.write(this.store.proofPath(runId), cancelled);
      return cancelled;
    });
    return { run: transaction.value, revision: transaction.revision };
  }

  async shutdown(): Promise<void> {
    for (const control of this.controls.values()) {
      control.cancelled = true;
      control.child?.kill("SIGTERM");
    }
    this.controls.clear();
  }

  private async execute(queued: AuthoringProofRun, control: RunControl): Promise<void> {
    const startedAt = new Date().toISOString();
    let current: AuthoringProofRun = Object.freeze({ ...queued, status: "running", startedAt });
    await this.persist(current, "proof-started");
    try {
      const artifacts = current.level === "promotion"
        ? await this.runPromotion(current, control)
        : await this.runVisualProof(current, control);
      if (control.cancelled) return;
      current = Object.freeze({
        ...current,
        status: "passed",
        finishedAt: new Date().toISOString(),
        elapsedMs: Date.now() - Date.parse(startedAt),
        artifactRefs: Object.freeze(artifacts),
        exitCode: 0,
      });
      await this.persist(current, "proof-passed");
    } catch (error) {
      if (control.cancelled) return;
      current = Object.freeze({
        ...current,
        status: "failed",
        finishedAt: new Date().toISOString(),
        elapsedMs: Date.now() - Date.parse(startedAt),
        exitCode: 1,
        error: (error as Error).message,
      });
      await this.persist(current, "proof-failed");
    } finally {
      this.controls.delete(current.runId);
    }
  }

  private async runVisualProof(run: AuthoringProofRun, control: RunControl): Promise<readonly string[]> {
    const proofRoot = resolve(AUTHORING_ARTIFACT_ROOT, "proofs", run.runId);
    const evidenceRoot = resolve(AUTHORING_EVIDENCE_ROOT, run.runId);
    await mkdir(proofRoot, { recursive: true });
    await mkdir(evidenceRoot, { recursive: true });
    const metrics: CaptureMetric[] = [];
    const contentIds = run.level === "focused" ? run.contentIds.slice(0, 1) : run.contentIds.slice(0, 3);

    for (const contentId of contentIds) {
      if (control.cancelled) throw new Error("Proof cancelled.");
      const preview = await this.previews.open({ contentId, config: previewConfigForContent(contentId) });
      try {
        for (const camera of CAMERA_PROOF) {
          const captureStarted = performance.now();
          const capture = await this.previews.capture(preview.sessionId, camera);
          const captureElapsedMs = performance.now() - captureStarted;
          const durablePath = resolve(evidenceRoot, `${contentId.replaceAll(":", "-")}-${camera}.png`);
          await copyFile(capture.absolutePath, durablePath);
          const measured = await this.measureCapture(durablePath, captureElapsedMs);
          metrics.push(measured);
          if (!measured.passed) throw new Error(`Visual readability gate failed for ${capture.artifactRef}.`);
          if (captureElapsedMs >= 5_000) throw new Error(`Warm preview capture exceeded five seconds: ${captureElapsedMs.toFixed(0)}ms.`);
        }
        const status = this.previews.get(preview.sessionId);
        if (status.errors.length) throw new Error(`Preview emitted browser errors: ${status.errors.join("; ")}`);
      } finally {
        await this.previews.close(preview.sessionId).catch(() => undefined);
      }
    }

    const elapsedMs = Date.now() - Date.parse(run.startedAt ?? new Date().toISOString());
    if (run.level === "focused" && elapsedMs >= 30_000) {
      throw new Error(`Focused proof exceeded thirty seconds: ${elapsedMs}ms.`);
    }
    const reportPath = resolve(evidenceRoot, "report.json");
    await writeFile(reportPath, `${JSON.stringify({
      schema: "horror-corridor.focused-visual-proof/1",
      runId: run.runId,
      level: run.level,
      contentIds,
      cameras: CAMERA_PROOF,
      metrics,
      elapsedMs,
      passed: metrics.length === contentIds.length * CAMERA_PROOF.length && metrics.every((metric) => metric.passed),
    }, null, 2)}\n`, "utf8");
    return Object.freeze([...metrics.map((metric) => metric.artifactRef), artifactRef(reportPath)]);
  }

  private async runPromotion(run: AuthoringProofRun, control: RunControl): Promise<readonly string[]> {
    const proofRoot = resolve(AUTHORING_ARTIFACT_ROOT, "proofs", run.runId);
    await mkdir(proofRoot, { recursive: true });
    const artifacts: string[] = [];
    const previewUrl = `${await this.previews.ensureHostReady()}/`;
    const commands = PROMOTION_COMMAND_LABELS.map((command) =>
      command.map((value) => value === "$PREVIEW_URL" ? previewUrl : value));
    for (let index = 0; index < commands.length; index += 1) {
      if (control.cancelled) throw new Error("Proof cancelled.");
      const command = commands[index];
      const logPath = resolve(proofRoot, `${String(index + 1).padStart(2, "0")}-${command[1].replaceAll(":", "-")}.log`);
      const result = await this.runCommand(command, control, { HORROR_PROOF_URL: previewUrl });
      await writeFile(logPath, `${result.output}\n`, "utf8");
      artifacts.push(artifactRef(logPath));
      if (result.exitCode !== 0) {
        throw new Error(`Promotion command failed (${result.exitCode}): ${command.join(" ")}`);
      }
    }
    return Object.freeze(artifacts);
  }

  private async runCommand(
    command: readonly string[],
    control: RunControl,
    extraEnvironment: Readonly<Record<string, string>> = {},
  ): Promise<Readonly<{ exitCode: number; output: string }>> {
    return new Promise((resolveCommand, rejectCommand) => {
      const child = spawn(command[0], [...command.slice(1)], {
        cwd: APP_ROOT,
        env: { ...process.env, ...extraEnvironment, NO_COLOR: "1" },
        stdio: ["pipe", "pipe", "pipe"],
      });
      control.child = child;
      const output: string[] = [];
      child.stdout.on("data", (chunk) => output.push(String(chunk)));
      child.stderr.on("data", (chunk) => output.push(String(chunk)));
      child.on("error", rejectCommand);
      child.on("exit", (code, signal) => {
        control.child = null;
        resolveCommand({
          exitCode: code ?? (signal ? 130 : 1),
          output: output.join("").trim(),
        });
      });
    });
  }

  private async measureCapture(path: string, captureElapsedMs: number): Promise<CaptureMetric> {
    const png = PNG.sync.read(await readFile(path));
    let total = 0;
    let dark = 0;
    let light = 0;
    let center = 0;
    let centerCount = 0;
    let foreground = 0;
    let foregroundCount = 0;
    const count = png.width * png.height;
    for (let y = 0; y < png.height; y += 1) {
      for (let x = 0; x < png.width; x += 1) {
        const offset = (y * png.width + x) * 4;
        const luminance = 0.2126 * png.data[offset] + 0.7152 * png.data[offset + 1] + 0.0722 * png.data[offset + 2];
        total += luminance;
        if (luminance < 15) dark += 1;
        if (luminance >= 35) light += 1;
        if (x > png.width * 0.3 && x < png.width * 0.7 && y > png.height * 0.25 && y < png.height * 0.75) {
          center += luminance;
          centerCount += 1;
        }
        if (x > png.width * 0.2 && x < png.width * 0.8 && y > png.height * 0.65) {
          foreground += luminance;
          foregroundCount += 1;
        }
      }
    }
    const average = total / count;
    const darkRatio = dark / count;
    const lightRatio = light / count;
    const centerAverage = center / centerCount;
    const foregroundAverage = foreground / foregroundCount;
    return Object.freeze({
      artifactRef: artifactRef(path),
      width: png.width,
      height: png.height,
      average,
      darkRatio,
      lightRatio,
      centerAverage,
      foregroundAverage,
      captureElapsedMs,
      passed: darkRatio < 0.94 && lightRatio > 0.015 && centerAverage > 4 && foregroundAverage > 3,
    });
  }

  private async persist(run: AuthoringProofRun, event: string): Promise<void> {
    await this.store.transaction(event, { runId: run.runId, status: run.status }, (tx) => {
      tx.write(this.store.proofPath(run.runId), run);
      return null;
    });
  }
}
