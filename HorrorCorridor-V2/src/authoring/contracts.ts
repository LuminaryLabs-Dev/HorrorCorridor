export const AUTHORING_SCHEMA = "horror-corridor.authoring/1" as const;
export const AUTHORING_TOOL_RESULT_SCHEMA = "horror-corridor.authoring-tool-result/1" as const;

export const AUTHORING_LIFECYCLES = [
  "mapped",
  "specified",
  "previewed",
  "playable",
  "integrated",
  "promoted",
] as const;

export type AuthoringLifecycle = (typeof AUTHORING_LIFECYCLES)[number];

export type AuthoringContentKind =
  | "district"
  | "set-piece"
  | "monster-family"
  | "monster"
  | "audio-motif"
  | "offering"
  | "progression-beat";

export type AuthoringCatalogMetadata = Readonly<{
  lifecycle: AuthoringLifecycle;
  evidenceRefs: readonly string[];
  version: number;
  updatedAt: string;
}>;

export type AuthoringCatalogEntry = Readonly<{
  id: string;
  kind: AuthoringContentKind;
  domain: "expedition" | "corridor" | "party" | "dread" | "shared-expedition" | "composition";
  title: string;
  intent: string;
  playerExperience: string;
  sourceRefs: readonly string[];
  dependencies: readonly string[];
  neighbors: readonly string[];
  pacingRole: string;
  variationAxes: readonly string[];
  acceptance: readonly string[];
  lifecycle: AuthoringLifecycle;
  evidenceRefs: readonly string[];
  version: number;
  runtime: Readonly<Record<string, unknown>>;
}>;

export type AuthoringContextCapsule = Readonly<{
  schema: "horror-corridor.authoring-context/1";
  globalIntent: string;
  globalIntentRefs: readonly string[];
  target: AuthoringCatalogEntry;
  neighborhood: readonly AuthoringCatalogEntry[];
  dependencies: readonly AuthoringCatalogEntry[];
  relevantDeltas: readonly AuthoringDelta[];
  evidenceRefs: readonly string[];
}>;

export type AuthoringPacketStatus = "created" | "claimed" | "submitted" | "accepted" | "revision" | "blocked";

export type AuthoringPacket = Readonly<{
  schema: "horror-corridor.authoring-packet/1";
  packetId: string;
  contentId: string;
  goal: string;
  domainBoundary: AuthoringCatalogEntry["domain"];
  context: AuthoringContextCapsule;
  neighborhood: readonly string[];
  relevantDeltas: readonly AuthoringDelta[];
  evidenceRefs: readonly string[];
  fixPlan: readonly string[];
  allowedFiles: readonly string[];
  acceptance: readonly string[];
  worker: string | null;
  status: AuthoringPacketStatus;
  createdAt: string;
  updatedAt: string;
  submittedDeltaId?: string;
}>;

export type AuthoringDelta = Readonly<{
  schema: "horror-corridor.authoring-delta/1";
  deltaId: string;
  packetId: string;
  contentId: string;
  summary: string;
  touchedFiles: readonly string[];
  impactedContent: readonly string[];
  evidenceRefs: readonly string[];
  crossDomainRisks: readonly string[];
  futureSuggestions: readonly string[];
  submittedAt: string;
  acceptedAt: string | null;
}>;

export type AuthoringReviewGate = "specification" | "preview" | "focused-proof" | "cohesion" | "promotion";
export type AuthoringReviewOutcome = "accepted" | "revision" | "blocked";

export type AuthoringReview = Readonly<{
  schema: "horror-corridor.authoring-review/1";
  reviewId: string;
  packetId: string;
  contentId: string;
  gate: AuthoringReviewGate;
  outcome: AuthoringReviewOutcome;
  notes: string;
  evidenceRefs: readonly string[];
  lifecycleBefore: AuthoringLifecycle;
  lifecycleAfter: AuthoringLifecycle;
  createdAt: string;
}>;

export type AuthoringPreviewPhase = "sign" | "approaching" | "repelling" | "blackout" | "last-chance";
export type AuthoringCameraPreset = "initial" | "approach" | "look-left" | "look-right";

export type AuthoringPreviewConfig = Readonly<{
  setPieceId: string;
  districtId: string;
  monsterId: string;
  phase: AuthoringPreviewPhase;
  cameraPreset: AuthoringCameraPreset;
}>;

export type AuthoringProofLevel = "focused" | "cohesion" | "promotion";
export type AuthoringProofStatus = "queued" | "running" | "passed" | "failed" | "cancelled";

export type AuthoringProofRun = Readonly<{
  schema: "horror-corridor.authoring-proof/1";
  runId: string;
  level: AuthoringProofLevel;
  contentIds: readonly string[];
  status: AuthoringProofStatus;
  startedAt: string | null;
  finishedAt: string | null;
  elapsedMs: number | null;
  artifactRefs: readonly string[];
  command: readonly string[];
  exitCode: number | null;
  error: string | null;
}>;

export type AuthoringToolError = Readonly<{
  code: string;
  message: string;
  retryable: boolean;
  details?: unknown;
}>;

export type AuthoringToolResult<T> = Readonly<{
  schema: typeof AUTHORING_TOOL_RESULT_SCHEMA;
  success: boolean;
  data?: T;
  error?: AuthoringToolError;
  artifactRefs: readonly string[];
  stateRevision: number;
  elapsedMs: number;
}>;

export function lifecycleIndex(value: AuthoringLifecycle): number {
  return AUTHORING_LIFECYCLES.indexOf(value);
}
