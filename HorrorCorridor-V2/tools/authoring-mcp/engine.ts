import { access } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import {
  AUTHORING_LIFECYCLES,
  lifecycleIndex,
  type AuthoringCatalogEntry,
  type AuthoringContentKind,
  type AuthoringContextCapsule,
  type AuthoringDelta,
  type AuthoringLifecycle,
  type AuthoringPacket,
  type AuthoringPacketStatus,
  type AuthoringProofLevel,
  type AuthoringReview,
  type AuthoringReviewGate,
  type AuthoringReviewOutcome,
} from "../../src/authoring/contracts";
import { authoringCatalogStats, buildAuthoringCatalog } from "../../src/authoring/catalog";
import { AuthoringDomainError } from "./errors";
import { APP_ROOT, REPO_ROOT, AuthoringStateStore } from "./state-store";

const GLOBAL_INTENT = "Preserve the full HorrorCorridor content universe while changing and proving one bounded content target at a time.";
const GLOBAL_INTENT_REFS = [
  "goal.md",
  "memory.md",
  "HorrorCorridor-V2/goal.md",
  "HorrorCorridor-V2/memory.md",
] as const;

const GATE_LIFECYCLE: Readonly<Record<AuthoringReviewGate, AuthoringLifecycle>> = {
  specification: "specified",
  preview: "previewed",
  "focused-proof": "playable",
  cohesion: "integrated",
  promotion: "promoted",
};

export type AuthoringProofReader = {
  get(runId: string): Promise<{
    level: AuthoringProofLevel;
    contentIds: readonly string[];
    status: string;
  } | null>;
  latest(level: AuthoringProofLevel, contentId: string): Promise<{
    runId: string;
    status: string;
  } | null>;
};

function now(): string {
  return new Date().toISOString();
}

function inside(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(`${root}${sep}`);
}

function unique(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values)]);
}

function requireText(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new AuthoringDomainError("INVALID_ARGUMENT", `${field} cannot be empty.`);
  return normalized;
}

export class AuthoringEngine {
  private catalog: readonly AuthoringCatalogEntry[] = [];
  private byId = new Map<string, AuthoringCatalogEntry>();

  constructor(
    readonly store = new AuthoringStateStore(),
    private readonly proofReader?: AuthoringProofReader,
  ) {}

  async initialize(): Promise<void> {
    const seed = buildAuthoringCatalog();
    for (const source of new Set(seed.flatMap((entry) => entry.sourceRefs))) {
      try {
        await access(resolve(REPO_ROOT, source));
      } catch (error) {
        throw new Error(`Authoring catalog runtime source does not exist: ${source}`, { cause: error });
      }
    }
    await this.store.initialize(seed);
    await this.store.migratePacketContracts();
    await this.refreshCatalog();
  }

  async status(): Promise<Readonly<Record<string, unknown>>> {
    const [state, packets, proofs] = await Promise.all([
      this.store.getState(),
      this.store.listPackets(),
      this.store.listProofs(),
    ]);
    const lifecycle: Record<string, number> = Object.fromEntries(AUTHORING_LIFECYCLES.map((value) => [value, 0]));
    for (const item of this.catalog) lifecycle[item.lifecycle] += 1;
    return Object.freeze({
      schema: "horror-corridor.authoring-status/1",
      stateRevision: state.revision,
      catalog: authoringCatalogStats(this.catalog),
      lifecycle,
      activePackets: packets.filter((packet) => !["accepted", "blocked"].includes(packet.status)).length,
      proofRuns: {
        total: proofs.length,
        running: proofs.filter((proof) => proof.status === "queued" || proof.status === "running").length,
      },
      acceptedDeltaCount: state.acceptedDeltaCount,
      cohesionDue: state.cohesionDue,
      stateRoot: ".agent/authoring",
      workerDispatchConfigured: false,
    });
  }

  catalogList(filters: {
    kind?: AuthoringContentKind;
    domain?: AuthoringCatalogEntry["domain"];
    lifecycle?: AuthoringLifecycle;
    search?: string;
    limit?: number;
  } = {}): Readonly<Record<string, unknown>> {
    const search = filters.search?.trim().toLocaleLowerCase();
    const limit = Math.min(Math.max(filters.limit ?? 250, 1), 500);
    const entries = this.catalog.filter((item) =>
      (!filters.kind || item.kind === filters.kind)
      && (!filters.domain || item.domain === filters.domain)
      && (!filters.lifecycle || item.lifecycle === filters.lifecycle)
      && (!search || `${item.id} ${item.title} ${item.intent}`.toLocaleLowerCase().includes(search)));
    return Object.freeze({
      total: entries.length,
      returned: Math.min(entries.length, limit),
      entries: Object.freeze(entries.slice(0, limit)),
    });
  }

  contentGet(contentId: string): AuthoringCatalogEntry {
    return this.requireContent(contentId);
  }

  async contextBuild(contentId: string): Promise<AuthoringContextCapsule> {
    const target = this.requireContent(contentId);
    const [deltas] = await Promise.all([this.store.listDeltas()]);
    const neighborhood = target.neighbors.map((id) => this.byId.get(id)).filter((value): value is AuthoringCatalogEntry => Boolean(value));
    const dependencies = target.dependencies.map((id) => this.byId.get(id)).filter((value): value is AuthoringCatalogEntry => Boolean(value));
    const relevantDeltas = deltas
      .filter((delta) => delta.acceptedAt !== null)
      .map((delta) => ({ delta, score: this.deltaRelevance(target, delta) }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score || right.delta.submittedAt.localeCompare(left.delta.submittedAt))
      .slice(0, 3)
      .map((item) => item.delta);

    return Object.freeze({
      schema: "horror-corridor.authoring-context/1",
      globalIntent: GLOBAL_INTENT,
      globalIntentRefs: GLOBAL_INTENT_REFS,
      target,
      neighborhood: Object.freeze(neighborhood),
      dependencies: Object.freeze(dependencies),
      relevantDeltas: Object.freeze(relevantDeltas),
      evidenceRefs: unique([
        ...target.evidenceRefs,
        ...relevantDeltas.flatMap((delta) => delta.evidenceRefs),
      ]),
    });
  }

  async packetCreate(input: {
    contentId: string;
    goal: string;
    fixPlan: readonly string[];
    allowedFiles?: readonly string[];
    acceptance?: readonly string[];
  }): Promise<{ packet: AuthoringPacket; revision: number }> {
    const target = this.requireContent(input.contentId);
    const context = await this.contextBuild(target.id);
    const goal = requireText(input.goal, "goal");
    const fixPlan = input.fixPlan.map((step) => requireText(step, "fixPlan item"));
    if (fixPlan.length === 0) throw new AuthoringDomainError("INVALID_ARGUMENT", "fixPlan needs at least one bounded action.");
    const allowedFiles = unique((input.allowedFiles?.length ? input.allowedFiles : target.sourceRefs)
      .map((path) => this.validateEditablePath(path)));
    const acceptance = unique(input.acceptance?.length ? input.acceptance : target.acceptance);
    const createdAt = now();

    const transaction = await this.store.transaction("packet-created", { contentId: target.id }, (tx) => {
      const packetId = tx.nextId("packet");
      const packet: AuthoringPacket = Object.freeze({
        schema: "horror-corridor.authoring-packet/1",
        packetId,
        contentId: target.id,
        goal,
        domainBoundary: target.domain,
        context,
        neighborhood: Object.freeze(context.neighborhood.map((entry) => entry.id)),
        relevantDeltas: context.relevantDeltas,
        evidenceRefs: context.evidenceRefs,
        fixPlan: Object.freeze(fixPlan),
        allowedFiles,
        acceptance,
        worker: null,
        status: "created",
        createdAt,
        updatedAt: createdAt,
      });
      tx.write(this.store.packetPath(packetId), packet);
      return packet;
    });
    return { packet: transaction.value, revision: transaction.revision };
  }

  async packetClaim(packetId: string, worker: string): Promise<{ packet: AuthoringPacket; revision: number }> {
    const current = await this.requirePacket(packetId);
    const workerId = requireText(worker, "worker");
    if (!["created", "claimed"].includes(current.status)) {
      throw new AuthoringDomainError("INVALID_PACKET_STATUS", `${packetId} is ${current.status}, not claimable.`);
    }
    if (current.worker && current.worker !== workerId) {
      throw new AuthoringDomainError("PACKET_ALREADY_CLAIMED", `${packetId} is already claimed by ${current.worker}.`);
    }
    return this.updatePacket(current, "packet-claimed", { worker: workerId }, {
      worker: workerId,
      status: "claimed",
    });
  }

  async packetSubmit(input: {
    packetId: string;
    summary: string;
    touchedFiles: readonly string[];
    impactedContent?: readonly string[];
    evidenceRefs?: readonly string[];
    crossDomainRisks?: readonly string[];
    futureSuggestions?: readonly string[];
  }): Promise<{ packet: AuthoringPacket; delta: AuthoringDelta; revision: number }> {
    const packet = await this.requirePacket(input.packetId);
    if (packet.status !== "claimed") {
      throw new AuthoringDomainError("INVALID_PACKET_STATUS", `${packet.packetId} must be claimed before submission.`);
    }
    const touchedFiles = unique(input.touchedFiles.map((path) => this.validateEditablePath(path)));
    if (touchedFiles.length === 0) throw new AuthoringDomainError("INVALID_ARGUMENT", "touchedFiles cannot be empty.");
    const disallowed = touchedFiles.filter((path) => !packet.allowedFiles.includes(path));
    if (disallowed.length) {
      throw new AuthoringDomainError("PATH_NOT_ALLOWED", "Submission contains files outside the packet allowlist.", false, { disallowed });
    }
    const impactedContent = unique([packet.contentId, ...(input.impactedContent ?? [])]);
    impactedContent.forEach((id) => this.requireContent(id));
    const submittedAt = now();
    const summary = requireText(input.summary, "summary");

    const transaction = await this.store.transaction("packet-submitted", {
      packetId: packet.packetId,
      contentId: packet.contentId,
    }, (tx) => {
      const deltaId = tx.nextId("delta");
      const delta: AuthoringDelta = Object.freeze({
        schema: "horror-corridor.authoring-delta/1",
        deltaId,
        packetId: packet.packetId,
        contentId: packet.contentId,
        summary,
        touchedFiles,
        impactedContent,
        evidenceRefs: unique(input.evidenceRefs ?? []),
        crossDomainRisks: unique((input.crossDomainRisks ?? []).map((value) => requireText(value, "crossDomainRisk"))),
        futureSuggestions: unique((input.futureSuggestions ?? []).map((value) => requireText(value, "futureSuggestion"))),
        submittedAt,
        acceptedAt: null,
      });
      const submittedPacket: AuthoringPacket = Object.freeze({
        ...packet,
        status: "submitted",
        submittedDeltaId: deltaId,
        updatedAt: submittedAt,
      });
      tx.write(this.store.deltaPath(deltaId), delta);
      tx.write(this.store.packetPath(packet.packetId), submittedPacket);
      return { packet: submittedPacket, delta };
    });
    return { ...transaction.value, revision: transaction.revision };
  }

  async reviewRecord(input: {
    packetId: string;
    gate: AuthoringReviewGate;
    outcome: AuthoringReviewOutcome;
    notes: string;
    evidenceRefs?: readonly string[];
    proofRunId?: string;
  }): Promise<{ review: AuthoringReview; packet: AuthoringPacket; content: AuthoringCatalogEntry; revision: number }> {
    const packet = await this.requirePacket(input.packetId);
    if (!packet.submittedDeltaId) {
      throw new AuthoringDomainError("INVALID_PACKET_STATUS", `${packet.packetId} has no submitted delta to review.`);
    }
    const delta = await this.requireDelta(packet.submittedDeltaId);
    const content = this.requireContent(packet.contentId);
    const lifecycleAfter = input.outcome === "accepted"
      ? await this.verifyGate(content, input.gate, input.evidenceRefs ?? [], input.proofRunId)
      : content.lifecycle;
    const metadata = await this.store.getCatalogMetadata();
    const deltas = await this.store.listDeltas();
    const acceptedAt = input.outcome === "accepted" && delta.acceptedAt === null ? now() : delta.acceptedAt;
    const reviewAt = now();

    const transaction = await this.store.transaction("review-recorded", {
      packetId: packet.packetId,
      gate: input.gate,
      outcome: input.outcome,
    }, (tx) => {
      const reviewId = tx.nextId("review");
      const review: AuthoringReview = Object.freeze({
        schema: "horror-corridor.authoring-review/1",
        reviewId,
        packetId: packet.packetId,
        contentId: content.id,
        gate: input.gate,
        outcome: input.outcome,
        notes: requireText(input.notes, "notes"),
        evidenceRefs: unique(input.evidenceRefs ?? []),
        lifecycleBefore: content.lifecycle,
        lifecycleAfter,
        createdAt: reviewAt,
      });
      const status: AuthoringPacketStatus = input.outcome === "accepted" ? "accepted" : input.outcome;
      const reviewedPacket: AuthoringPacket = Object.freeze({ ...packet, status, updatedAt: reviewAt });
      const reviewedDelta: AuthoringDelta = Object.freeze({ ...delta, acceptedAt });
      const nextMetadata = { ...metadata };
      if (input.outcome === "accepted") {
        nextMetadata[content.id] = {
          lifecycle: lifecycleAfter,
          evidenceRefs: unique([...(metadata[content.id]?.evidenceRefs ?? []), ...(input.evidenceRefs ?? [])]),
          version: (metadata[content.id]?.version ?? content.version) + (lifecycleAfter === content.lifecycle ? 0 : 1),
          updatedAt: reviewAt,
        };
        if (delta.acceptedAt === null) tx.state.acceptedDeltaCount += 1;
        const relevantAcceptedDeltas = deltas.filter((item) =>
          item.acceptedAt !== null
          && this.sameRouteSlice(content, this.byId.get(item.contentId)));
        tx.state.cohesionDue = delta.crossDomainRisks.length > 0
          || (input.gate !== "cohesion"
            && relevantAcceptedDeltas.length + (delta.acceptedAt === null ? 1 : 0) >= 3);
        if (input.gate === "cohesion") tx.state.cohesionDue = false;
      }
      tx.write(this.store.reviewPath(reviewId), review);
      tx.write(this.store.packetPath(packet.packetId), reviewedPacket);
      tx.write(this.store.deltaPath(delta.deltaId), reviewedDelta);
      tx.write(this.store.catalogPath(), nextMetadata);
      return { review, packet: reviewedPacket };
    });
    await this.refreshCatalog();
    return {
      ...transaction.value,
      content: this.requireContent(content.id),
      revision: transaction.revision,
    };
  }

  async contentTransition(contentId: string, lifecycle: AuthoringLifecycle): Promise<Readonly<Record<string, unknown>>> {
    const content = this.requireContent(contentId);
    if (content.lifecycle === lifecycle) return { changed: false, content };
    const reviews = await this.store.listReviews();
    const acceptedReview = [...reviews].reverse().find((review) =>
      review.contentId === content.id
      && review.outcome === "accepted"
      && review.lifecycleAfter === lifecycle);
    if (!acceptedReview) {
      throw new AuthoringDomainError(
        "EVIDENCE_GATE_REQUIRED",
        `${content.id} cannot transition to ${lifecycle} without an accepted ${this.gateForLifecycle(lifecycle)} review.`,
      );
    }
    if (lifecycleIndex(lifecycle) !== lifecycleIndex(content.lifecycle) + 1) {
      throw new AuthoringDomainError("INVALID_LIFECYCLE_TRANSITION", `Cannot move ${content.lifecycle} directly to ${lifecycle}.`);
    }
    const metadata = await this.store.getCatalogMetadata();
    const updatedAt = now();
    const transaction = await this.store.transaction("content-transitioned", { contentId, lifecycle }, (tx) => {
      tx.write(this.store.catalogPath(), {
        ...metadata,
        [content.id]: {
          lifecycle,
          evidenceRefs: unique([...(metadata[content.id]?.evidenceRefs ?? []), ...acceptedReview.evidenceRefs]),
          version: (metadata[content.id]?.version ?? content.version) + 1,
          updatedAt,
        },
      });
      return true;
    });
    await this.refreshCatalog();
    return { changed: transaction.value, content: this.requireContent(content.id), revision: transaction.revision };
  }

  async promotionEvaluate(contentIds: readonly string[]): Promise<Readonly<Record<string, unknown>>> {
    const contents = unique(contentIds).map((id) => this.requireContent(id));
    const blockers: string[] = [];
    for (const content of contents) {
      if (lifecycleIndex(content.lifecycle) < lifecycleIndex("integrated")) {
        blockers.push(`${content.id} is ${content.lifecycle}; integrated is required.`);
      }
      const proof = await this.proofReader?.latest("promotion", content.id);
      if (!proof || proof.status !== "passed") blockers.push(`${content.id} has no passing promotion proof.`);
    }
    return Object.freeze({
      eligible: blockers.length === 0,
      contentIds: contents.map((content) => content.id),
      blockers,
    });
  }

  workerDispatch(): never {
    throw new AuthoringDomainError(
      "WORKER_NOT_CONFIGURED",
      "Worker dispatch is disabled. Claim the packet from the connected MCP host or configure an explicit adapter.",
    );
  }

  validateEditablePath(path: string): string {
    const candidate = requireText(path, "path").replaceAll("\\", "/");
    if (isAbsolute(candidate) || candidate.split("/").includes("..")) {
      throw new AuthoringDomainError("PATH_NOT_ALLOWED", `Path must be repository-relative: ${path}`);
    }
    const absolute = resolve(REPO_ROOT, candidate);
    if (!inside(REPO_ROOT, absolute) || inside(resolve(REPO_ROOT, "HorrorCorridor-V1"), absolute)) {
      throw new AuthoringDomainError("PATH_NOT_ALLOWED", `Path is outside the V2 authoring boundary: ${path}`);
    }
    if (!inside(APP_ROOT, absolute) && !inside(resolve(REPO_ROOT, ".agent"), absolute)) {
      throw new AuthoringDomainError("PATH_NOT_ALLOWED", `Only HorrorCorridor-V2 and .agent files may be packet-authorized: ${path}`);
    }
    return relative(REPO_ROOT, absolute).replaceAll("\\", "/");
  }

  private async refreshCatalog(): Promise<void> {
    this.catalog = buildAuthoringCatalog(await this.store.getCatalogMetadata());
    this.byId = new Map(this.catalog.map((item) => [item.id, item]));
  }

  private requireContent(contentId: string): AuthoringCatalogEntry {
    const normalized = requireText(contentId, "contentId");
    const content = this.byId.get(normalized);
    if (!content) throw new AuthoringDomainError("CONTENT_NOT_FOUND", `Unknown authoring content ID: ${normalized}`);
    return content;
  }

  private async requirePacket(packetId: string): Promise<AuthoringPacket> {
    const packet = await this.store.readPacket(requireText(packetId, "packetId"));
    if (!packet) throw new AuthoringDomainError("PACKET_NOT_FOUND", `Unknown authoring packet: ${packetId}`);
    return packet;
  }

  private async requireDelta(deltaId: string): Promise<AuthoringDelta> {
    const delta = await this.store.readDelta(requireText(deltaId, "deltaId"));
    if (!delta) throw new AuthoringDomainError("DELTA_NOT_FOUND", `Unknown authoring delta: ${deltaId}`);
    return delta;
  }

  private async updatePacket(
    packet: AuthoringPacket,
    event: string,
    detail: Readonly<Record<string, unknown>>,
    update: Partial<AuthoringPacket>,
  ): Promise<{ packet: AuthoringPacket; revision: number }> {
    const updated: AuthoringPacket = Object.freeze({ ...packet, ...update, updatedAt: now() });
    const transaction = await this.store.transaction(event, { packetId: packet.packetId, ...detail }, (tx) => {
      tx.write(this.store.packetPath(packet.packetId), updated);
      return updated;
    });
    return { packet: transaction.value, revision: transaction.revision };
  }

  private deltaRelevance(target: AuthoringCatalogEntry, delta: AuthoringDelta): number {
    if (delta.contentId === target.id) return 100;
    if (delta.impactedContent.includes(target.id)) return 90;
    const related = new Set([...target.dependencies, ...target.neighbors]);
    if (delta.impactedContent.some((id) => related.has(id)) || related.has(delta.contentId)) return 60;
    const source = this.byId.get(delta.contentId);
    if (source?.domain === target.domain) return 20;
    return 0;
  }

  private async verifyGate(
    content: AuthoringCatalogEntry,
    gate: AuthoringReviewGate,
    evidenceRefs: readonly string[],
    proofRunId?: string,
  ): Promise<AuthoringLifecycle> {
    const target = GATE_LIFECYCLE[gate];
    const currentIndex = lifecycleIndex(content.lifecycle);
    const targetIndex = lifecycleIndex(target);
    if (targetIndex < currentIndex) return content.lifecycle;
    if (targetIndex > currentIndex + 1) {
      throw new AuthoringDomainError(
        "INVALID_LIFECYCLE_TRANSITION",
        `${content.id} is ${content.lifecycle}; ${target} cannot skip earlier evidence gates.`,
      );
    }
    if (gate === "specification" && (!content.intent || !content.playerExperience || content.acceptance.length === 0)) {
      throw new AuthoringDomainError("EVIDENCE_GATE_FAILED", `${content.id} lacks complete intent or acceptance metadata.`);
    }
    if (gate === "preview" && !evidenceRefs.some((ref) => ref.toLowerCase().endsWith(".png"))) {
      throw new AuthoringDomainError("EVIDENCE_GATE_FAILED", "Preview acceptance requires at least one PNG capture.");
    }
    if (gate === "focused-proof" || gate === "cohesion" || gate === "promotion") {
      if (!proofRunId) throw new AuthoringDomainError("EVIDENCE_GATE_FAILED", `${gate} requires proofRunId.`);
      const proof = await this.proofReader?.get(proofRunId);
      const expected: AuthoringProofLevel = gate === "focused-proof" ? "focused" : gate;
      if (!proof || proof.level !== expected || proof.status !== "passed" || !proof.contentIds.includes(content.id)) {
        throw new AuthoringDomainError("EVIDENCE_GATE_FAILED", `${proofRunId} is not a passing ${expected} proof for ${content.id}.`);
      }
    }
    return targetIndex === currentIndex ? content.lifecycle : target;
  }

  private gateForLifecycle(lifecycle: AuthoringLifecycle): AuthoringReviewGate | "mapping" {
    const value = Object.entries(GATE_LIFECYCLE).find(([, target]) => target === lifecycle);
    return (value?.[0] as AuthoringReviewGate | undefined) ?? "mapping";
  }

  private sameRouteSlice(target: AuthoringCatalogEntry, other?: AuthoringCatalogEntry): boolean {
    if (!other) return false;
    if (target.id === other.id) return true;
    if (target.domain !== other.domain) return false;
    return target.neighbors.includes(other.id)
      || target.dependencies.includes(other.id)
      || other.neighbors.includes(target.id)
      || other.dependencies.includes(target.id);
  }
}
