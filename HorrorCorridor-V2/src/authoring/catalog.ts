import { CORRIDOR_DISTRICTS, type SetPieceKind } from "../content/chamber";
import {
  CORRIDOR_GENERATOR_VARIANTS,
  CORRIDOR_SERVICE_DOOR_VARIANTS,
} from "../content/corridorContentRouting";
import { MONSTER_PROFILES } from "../content/monsters";
import { OFFERINGS } from "../content/offerings";
import type {
  AuthoringCatalogEntry,
  AuthoringCatalogMetadata,
  AuthoringContentKind,
} from "./contracts";

const SOURCE = {
  chamber: "HorrorCorridor-V2/src/content/chamber.ts",
  contentRouting: "HorrorCorridor-V2/src/content/corridorContentRouting.ts",
  monsters: "HorrorCorridor-V2/src/content/monsters.ts",
  audio: "HorrorCorridor-V2/src/adapters/spatialAudio.ts",
  offerings: "HorrorCorridor-V2/src/content/offerings.ts",
  composition: "HorrorCorridor-V2/src/composition/createHorrorCorridorV2.ts",
} as const;

const AUDIO_CHANNELS = ["footstep", "voice", "metal", "breath", "water", "electrical"] as const;
const PROGRESSION_BEATS = [
  ["safe-traversal", "Give the player enough quiet distance to understand movement, light, and route direction."],
  ["warning", "Let the player infer a hidden threat from a directional sensory pattern before seeing it."],
  ["pursuit", "Turn the inferred threat into a readable moving confrontation."],
  ["blackout", "Remove dependable light while preserving a movement-based chance to survive."],
  ["last-chance", "Give the player a short final response window before capture."],
  ["resolution", "Record whether the monster was studied or collected."],
  ["offering", "Reward survival and open the next building without teleporting the player."],
  ["caught", "End the current expedition when the response fails."],
  ["restart", "Start a new run while preserving the Monster Index."],
  ["shared-recovery", "Restore an authoritative shared expedition after a disconnect."],
] as const;

type EntrySeed = Omit<AuthoringCatalogEntry, "lifecycle" | "evidenceRefs" | "version">;

function withMetadata(seed: EntrySeed, metadata: Readonly<Record<string, AuthoringCatalogMetadata>>): AuthoringCatalogEntry {
  const saved = metadata[seed.id];
  return Object.freeze({
    ...seed,
    lifecycle: saved?.lifecycle ?? "mapped",
    evidenceRefs: Object.freeze([...(saved?.evidenceRefs ?? [])]),
    version: saved?.version ?? 1,
  });
}

function titleCase(value: string): string {
  return value.split("-").map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`).join(" ");
}

function setPieceIds(): readonly SetPieceKind[] {
  return Object.freeze([...new Set(CORRIDOR_DISTRICTS.flatMap((district) => district.setPieces))]);
}

function entry(
  id: string,
  kind: AuthoringContentKind,
  values: Omit<EntrySeed, "id" | "kind">,
): EntrySeed {
  return Object.freeze({ id, kind, ...values });
}

export function buildAuthoringCatalog(
  metadata: Readonly<Record<string, AuthoringCatalogMetadata>> = {},
): readonly AuthoringCatalogEntry[] {
  const seeds: EntrySeed[] = [];

  CORRIDOR_DISTRICTS.forEach((district, index) => {
    const previous = CORRIDOR_DISTRICTS[(index - 1 + CORRIDOR_DISTRICTS.length) % CORRIDOR_DISTRICTS.length];
    const next = CORRIDOR_DISTRICTS[(index + 1) % CORRIDOR_DISTRICTS.length];
    seeds.push(entry(`district:${district.id}`, "district", {
      domain: "corridor",
      title: district.name,
      intent: `Give this route span a natural place identity through ${district.material} surfaces, ${district.roomTone} acoustics, and grounded side-room landmarks.`,
      playerExperience: `The player should recognize ${district.name} from its material, light, sound, and set-piece rhythm without reading debug text.`,
      sourceRefs: [SOURCE.chamber],
      dependencies: [],
      neighbors: [`district:${previous.id}`, `district:${next.id}`, ...district.setPieces.map((kind) => `set-piece:${kind}`)],
      pacingRole: `Twenty-segment district chapter using ${district.setPieces.length} recurring landmark identities.`,
      variationAxes: ["material", "room-tone", "light-color", "set-piece-order"],
      acceptance: ["Route remains open.", "Foreground and midground remain readable.", "District identity differs from both neighbors."],
      runtime: { ...district },
    }));
  });

  for (const kind of setPieceIds()) {
    const districts = CORRIDOR_DISTRICTS.filter((district) => district.setPieces.includes(kind));
    const neighborKinds = new Set(districts.flatMap((district) => district.setPieces).filter((value) => value !== kind));
    seeds.push(entry(`set-piece:${kind}`, "set-piece", {
      domain: "corridor",
      title: titleCase(kind),
      intent: `Make ${titleCase(kind)} read as a grounded location rather than a floating generic prop cluster.`,
      playerExperience: `The player notices a distinct ${titleCase(kind)} silhouette while the central corridor remains traversable.`,
      sourceRefs: [SOURCE.chamber, "HorrorCorridor-V2/src/hosts/browser/threeScene.ts"],
      dependencies: districts.map((district) => `district:${district.id}`),
      neighbors: [...neighborKinds].map((value) => `set-piece:${value}`),
      pacingRole: "A side-space landmark that interrupts corridor repetition without blocking motion.",
      variationAxes: ["district", "side", "camera-distance", "local-light", "prop-composition"],
      acceptance: ["Named silhouette is visible at normal brightness.", "The route remains open.", "Presentation owns no gameplay outcome."],
      runtime: { kind, districtIds: districts.map((district) => district.id) },
    }));
  }

  const objectVariants = [...CORRIDOR_GENERATOR_VARIANTS, ...CORRIDOR_SERVICE_DOOR_VARIANTS];
  for (const variant of objectVariants) {
    const familyVariants = objectVariants.filter((value) => value.family === variant.family);
    const setPieceId = variant.family === "generator" ? "set-piece:service-nook" : "set-piece:closed-tavern";
    seeds.push(entry(`object-variant:${variant.id}`, "object-variant", {
      domain: "corridor",
      title: variant.title,
      intent: variant.intent,
      playerExperience: `The player reads ${variant.title} as a grounded ${variant.family} identity without mistaking it for a route blocker.`,
      sourceRefs: [SOURCE.contentRouting],
      dependencies: [setPieceId],
      neighbors: familyVariants
        .filter((value) => value.id !== variant.id)
        .map((value) => `object-variant:${value.id}`),
      pacingRole: `One deterministic, non-blocking ${variant.family} landmark routed within its owning Corridor set piece.`,
      variationAxes: ["route-seed", "segment", "district", "set-piece", "silhouette"],
      acceptance: [
        "The Corridor routing service selects the variant deterministically.",
        "The central route remains open.",
        "Presentation realizes the descriptor without selecting content.",
      ],
      runtime: { ...variant },
    }));
  }

  const families = new Map<string, typeof MONSTER_PROFILES[number][]>();
  for (const monster of MONSTER_PROFILES) {
    const family = families.get(monster.family) ?? [];
    family.push(monster);
    families.set(monster.family, family);
  }

  for (const [familyId, monsters] of families) {
    const representative = monsters[0];
    seeds.push(entry(`monster-family:${familyId}`, "monster-family", {
      domain: "dread",
      title: titleCase(familyId),
      intent: representative.indexDescription,
      playerExperience: `Recognize this family through ${representative.sensoryChannel}, ${representative.movement}, and its ${representative.silhouette} silhouette.`,
      sourceRefs: [SOURCE.monsters],
      dependencies: [`audio-motif:${representative.sensoryChannel}`],
      neighbors: monsters.map((monster) => `monster:${monster.id}`),
      pacingRole: `Encounter family using the ${representative.response} response contract.`,
      variationAxes: ["manifestation", "sign-duration", "distance", "speed", "bearing"],
      acceptance: ["Cue is actionable.", "Movement differs meaningfully.", "Failure consequence remains specific."],
      runtime: { familyId, manifestationCount: monsters.length },
    }));
  }

  for (const monster of MONSTER_PROFILES) {
    const siblings = families.get(monster.family) ?? [];
    seeds.push(entry(`monster:${monster.id}`, "monster", {
      domain: "dread",
      title: monster.name,
      intent: monster.indexDescription,
      playerExperience: `${monster.sign} ${monster.responseInstruction}`,
      sourceRefs: [SOURCE.monsters],
      dependencies: [`monster-family:${monster.family}`, `audio-motif:${monster.sensoryChannel}`],
      neighbors: siblings.filter((value) => value.id !== monster.id).map((value) => `monster:${value.id}`),
      pacingRole: `${monster.signDurationMs}ms warning before a ${monster.movement} approach and ${monster.response} response.`,
      variationAxes: ["manifestation", "timing", "distance", "bearing", "color"],
      acceptance: ["Warning precedes visibility.", "Response instruction matches behavior.", "Study and collection paths remain possible."],
      runtime: { ...monster },
    }));
  }

  for (const channel of AUDIO_CHANNELS) {
    const monsters = MONSTER_PROFILES.filter((monster) => monster.sensoryChannel === channel);
    seeds.push(entry(`audio-motif:${channel}`, "audio-motif", {
      domain: "corridor",
      title: `${titleCase(channel)} Warning`,
      intent: `Give ${channel} monsters a recognizable directional pattern before pursuit.`,
      playerExperience: `The player hears a repeated ${channel} motif whose pan and cadence reveal danger.`,
      sourceRefs: [SOURCE.audio],
      dependencies: [],
      neighbors: AUDIO_CHANNELS.filter((value) => value !== channel).map((value) => `audio-motif:${value}`),
      pacingRole: "Hidden sign-phase language that tightens before visible pursuit.",
      variationAxes: ["pulse-count", "frequency", "cadence", "pan", "threat"],
      acceptance: ["Pattern has at least two pulses.", "Pan matches acoustics.", "Audio cannot decide outcomes."],
      runtime: { channel, monsterCount: monsters.length },
    }));
  }

  for (const offering of OFFERINGS) {
    seeds.push(entry(`offering:${offering.id}`, "offering", {
      domain: "expedition",
      title: offering.name,
      intent: offering.description,
      playerExperience: `Surviving an encounter produces ${offering.name} before the next building.`,
      sourceRefs: [SOURCE.offerings],
      dependencies: ["progression-beat:offering", "progression-beat:resolution"],
      neighbors: OFFERINGS.filter((value) => value.id !== offering.id).map((value) => `offering:${value.id}`),
      pacingRole: "A short reward and breath between encounters.",
      variationAxes: ["building-number", "reward-description"],
      acceptance: ["Exactly one offering opens.", "Claiming does not teleport the party.", "Next building advances once."],
      runtime: { ...offering },
    }));
  }

  PROGRESSION_BEATS.forEach(([beat, intent], index) => {
    const previous = PROGRESSION_BEATS[Math.max(0, index - 1)][0];
    const next = PROGRESSION_BEATS[Math.min(PROGRESSION_BEATS.length - 1, index + 1)][0];
    seeds.push(entry(`progression-beat:${beat}`, "progression-beat", {
      domain: beat === "shared-recovery" ? "shared-expedition" : beat === "offering" || beat === "resolution" ? "expedition" : "dread",
      title: titleCase(beat),
      intent,
      playerExperience: intent,
      sourceRefs: [SOURCE.composition],
      dependencies: index === 0 ? [] : [`progression-beat:${previous}`],
      neighbors: [...new Set([`progression-beat:${previous}`, `progression-beat:${next}`])].filter((value) => value !== `progression-beat:${beat}`),
      pacingRole: `Ordered expedition beat ${index + 1} of ${PROGRESSION_BEATS.length}.`,
      variationAxes: ["timing", "encounter", "building", "authority-mode"],
      acceptance: ["Domain ownership remains explicit.", "Snapshot remains deterministic.", "Player-visible transition is readable."],
      runtime: { beat, order: index },
    }));
  });

  const entries = seeds.map((seed) => withMetadata(seed, metadata));
  const byId = new Map(entries.map((value) => [value.id, value]));
  if (byId.size !== entries.length) throw new Error("Authoring catalog contains duplicate IDs.");
  const referenced = new Set<string>();
  for (const value of entries) {
    if (value.sourceRefs.length === 0 || value.sourceRefs.some((source) => !source.trim())) {
      throw new Error(`${value.id} has no valid runtime source reference.`);
    }
    for (const dependency of value.dependencies) {
      if (!byId.has(dependency)) throw new Error(`${value.id} depends on missing catalog entry ${dependency}.`);
      referenced.add(dependency);
    }
    for (const neighbor of value.neighbors) {
      if (!byId.has(neighbor)) throw new Error(`${value.id} references missing neighbor ${neighbor}.`);
      referenced.add(neighbor);
    }
  }
  for (const value of entries) {
    if (value.dependencies.length === 0 && value.neighbors.length === 0 && !referenced.has(value.id)) {
      throw new Error(`${value.id} is orphaned from the authoring content map.`);
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visited.has(id)) return;
    if (visiting.has(id)) throw new Error(`Authoring catalog contains a circular required dependency at ${id}.`);
    visiting.add(id);
    for (const dependency of byId.get(id)?.dependencies ?? []) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  entries.forEach((value) => visit(value.id));
  return Object.freeze(entries);
}

export function authoringCatalogStats(entries: readonly AuthoringCatalogEntry[]): Readonly<Record<string, number>> {
  const stats: Record<string, number> = { total: entries.length };
  for (const entry of entries) stats[entry.kind] = (stats[entry.kind] ?? 0) + 1;
  return Object.freeze(stats);
}
