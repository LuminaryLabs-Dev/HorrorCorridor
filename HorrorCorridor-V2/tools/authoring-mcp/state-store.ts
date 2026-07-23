import { appendFile, mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import type {
  AuthoringCatalogEntry,
  AuthoringCatalogMetadata,
  AuthoringDelta,
  AuthoringPacket,
  AuthoringProofRun,
  AuthoringReview,
} from "../../src/authoring/contracts";

export const APP_ROOT = resolve(import.meta.dirname, "../..");
export const REPO_ROOT = resolve(APP_ROOT, "..");
export const AUTHORING_STATE_ROOT = resolve(REPO_ROOT, ".agent/authoring");
export const AUTHORING_EVIDENCE_ROOT = resolve(AUTHORING_STATE_ROOT, "evidence");
export const AUTHORING_ARTIFACT_ROOT = resolve(APP_ROOT, "artifacts/authoring");

type CollectionName = "packets" | "deltas" | "reviews" | "proofs";
type CounterName = "packet" | "delta" | "review" | "proof";
type StoredAuthoringPacket = Omit<AuthoringPacket, "neighborhood" | "relevantDeltas" | "evidenceRefs"> &
  Partial<Pick<AuthoringPacket, "neighborhood" | "relevantDeltas" | "evidenceRefs">>;

export type DurableAuthoringState = {
  schema: "horror-corridor.authoring-state/1";
  revision: number;
  counters: Record<CounterName, number>;
  acceptedDeltaCount: number;
  cohesionDue: boolean;
  updatedAt: string;
};

type JsonValue = unknown;

type Transaction = {
  readonly state: DurableAuthoringState;
  nextId(kind: CounterName): string;
  write(relativePath: string, value: JsonValue): void;
};

const STATE_FILE = "state.json";
const CATALOG_FILE = "catalog-metadata.json";
const EVENT_FILE = "events.jsonl";

function inside(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(`${root}${sep}`);
}

function resolveStatePath(relativePath: string): string {
  const candidate = resolve(AUTHORING_STATE_ROOT, relativePath);
  if (!inside(AUTHORING_STATE_ROOT, candidate)) {
    throw new Error(`Authoring state path escapes its root: ${relativePath}`);
  }
  return candidate;
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function writeJsonAtomic(path: string, value: JsonValue): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, path);
}

function defaultState(now: string): DurableAuthoringState {
  return {
    schema: "horror-corridor.authoring-state/1",
    revision: 0,
    counters: { packet: 1, delta: 1, review: 1, proof: 1 },
    acceptedDeltaCount: 0,
    cohesionDue: false,
    updatedAt: now,
  };
}

function padCounter(value: number): string {
  return String(value).padStart(6, "0");
}

export class AuthoringStateStore {
  private mutationQueue: Promise<void> = Promise.resolve();

  async initialize(catalog: readonly AuthoringCatalogEntry[]): Promise<void> {
    const now = new Date().toISOString();
    await Promise.all([
      mkdir(AUTHORING_STATE_ROOT, { recursive: true }),
      mkdir(AUTHORING_EVIDENCE_ROOT, { recursive: true }),
      mkdir(AUTHORING_ARTIFACT_ROOT, { recursive: true }),
      ...(["packets", "deltas", "reviews", "proofs", "previews"] as const).map((name) =>
        mkdir(resolveStatePath(name), { recursive: true })),
    ]);

    const statePath = resolveStatePath(STATE_FILE);
    if (!(await readJson<DurableAuthoringState>(statePath))) {
      await writeJsonAtomic(statePath, defaultState(now));
    }

    const catalogPath = resolveStatePath(CATALOG_FILE);
    const existing = (await readJson<Record<string, AuthoringCatalogMetadata>>(catalogPath)) ?? {};
    let changed = false;
    const next = { ...existing };
    for (const item of catalog) {
      if (next[item.id]) continue;
      next[item.id] = {
        lifecycle: "mapped",
        evidenceRefs: [],
        version: 1,
        updatedAt: now,
      };
      changed = true;
    }
    if (!(await readJson<Record<string, AuthoringCatalogMetadata>>(catalogPath)) || changed) {
      await writeJsonAtomic(catalogPath, next);
    }
  }

  async getState(): Promise<DurableAuthoringState> {
    const state = await readJson<DurableAuthoringState>(resolveStatePath(STATE_FILE));
    if (!state) throw new Error("Authoring state is not initialized.");
    return state;
  }

  async getCatalogMetadata(): Promise<Record<string, AuthoringCatalogMetadata>> {
    return (await readJson<Record<string, AuthoringCatalogMetadata>>(resolveStatePath(CATALOG_FILE))) ?? {};
  }

  async recordToolCall(detail: Readonly<{
    name: string;
    success: boolean;
    elapsedMs: number;
    errorCode?: string;
  }>): Promise<void> {
    const state = await this.getState();
    await appendFile(resolveStatePath(EVENT_FILE), `${JSON.stringify({
      schema: "horror-corridor.authoring-event/1",
      event: "mcp-tool-call",
      at: new Date().toISOString(),
      revision: state.revision,
      detail,
    })}\n`, "utf8");
  }

  async migratePacketContracts(): Promise<number> {
    const packets = await this.listCollection<StoredAuthoringPacket>("packets");
    const legacy = packets.filter((packet) =>
      !("neighborhood" in packet)
      || !("relevantDeltas" in packet)
      || !("evidenceRefs" in packet));
    if (legacy.length === 0) return 0;
    const transaction = await this.transaction("packet-contracts-migrated", { count: legacy.length }, (tx) => {
      for (const packet of legacy) {
        tx.write(this.packetPath(packet.packetId), {
          ...packet,
          neighborhood: packet.context.neighborhood.map((entry) => entry.id),
          relevantDeltas: packet.context.relevantDeltas,
          evidenceRefs: packet.context.evidenceRefs,
        });
      }
      return legacy.length;
    });
    return transaction.value;
  }

  async readPacket(id: string): Promise<AuthoringPacket | null> {
    return this.readCollectionItem<AuthoringPacket>("packets", id);
  }

  async readDelta(id: string): Promise<AuthoringDelta | null> {
    return this.readCollectionItem<AuthoringDelta>("deltas", id);
  }

  async readProof(id: string): Promise<AuthoringProofRun | null> {
    return this.readCollectionItem<AuthoringProofRun>("proofs", id);
  }

  async listPackets(): Promise<readonly AuthoringPacket[]> {
    return this.listCollection<AuthoringPacket>("packets");
  }

  async listDeltas(): Promise<readonly AuthoringDelta[]> {
    return this.listCollection<AuthoringDelta>("deltas");
  }

  async listReviews(): Promise<readonly AuthoringReview[]> {
    return this.listCollection<AuthoringReview>("reviews");
  }

  async listProofs(): Promise<readonly AuthoringProofRun[]> {
    return this.listCollection<AuthoringProofRun>("proofs");
  }

  async transaction<T>(
    event: string,
    detail: Readonly<Record<string, unknown>>,
    operation: (transaction: Transaction) => T | Promise<T>,
  ): Promise<{ value: T; revision: number }> {
    let result: { value: T; revision: number } | undefined;
    const run = async (): Promise<void> => {
      const state = structuredClone(await this.getState());
      const writes = new Map<string, JsonValue>();
      const transaction: Transaction = {
        state,
        nextId(kind) {
          const value = state.counters[kind];
          state.counters[kind] += 1;
          return `${kind}-${padCounter(value)}`;
        },
        write(relativePath, value) {
          writes.set(resolveStatePath(relativePath), value);
        },
      };

      const value = await operation(transaction);
      state.revision += 1;
      state.updatedAt = new Date().toISOString();
      for (const [path, content] of writes) await writeJsonAtomic(path, content);
      await writeJsonAtomic(resolveStatePath(STATE_FILE), state);
      await appendFile(resolveStatePath(EVENT_FILE), `${JSON.stringify({
        schema: "horror-corridor.authoring-event/1",
        event,
        at: state.updatedAt,
        revision: state.revision,
        detail,
      })}\n`, "utf8");
      result = { value, revision: state.revision };
    };

    const queued = this.mutationQueue.then(run, run);
    this.mutationQueue = queued.catch(() => undefined);
    await queued;
    if (!result) throw new Error("Authoring transaction did not complete.");
    return result;
  }

  packetPath(id: string): string {
    return `packets/${id}.json`;
  }

  deltaPath(id: string): string {
    return `deltas/${id}.json`;
  }

  reviewPath(id: string): string {
    return `reviews/${id}.json`;
  }

  proofPath(id: string): string {
    return `proofs/${id}.json`;
  }

  previewPath(id: string): string {
    return `previews/${id}.json`;
  }

  catalogPath(): string {
    return CATALOG_FILE;
  }

  private async readCollectionItem<T>(collection: CollectionName, id: string): Promise<T | null> {
    if (!/^[a-z]+-[0-9]{6}$/.test(id)) return null;
    return readJson<T>(resolveStatePath(`${collection}/${id}.json`));
  }

  private async listCollection<T>(collection: CollectionName): Promise<readonly T[]> {
    const root = resolveStatePath(collection);
    const names = (await readdir(root)).filter((name) => name.endsWith(".json")).sort();
    const values: T[] = [];
    for (const name of names) {
      const value = await readJson<T>(resolve(root, name));
      if (value !== null) values.push(value);
    }
    return values;
  }
}
