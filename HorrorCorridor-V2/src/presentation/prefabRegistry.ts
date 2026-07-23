import {
  CORRIDOR_DISTRICTS,
  type ChamberDescriptor,
  type ChamberPropDescriptor,
  type SetPieceKind,
} from "../content/chamber";

export type PrefabCameraPreset = Readonly<{
  id: "initial" | "approach" | "look-left" | "look-right";
  purpose: string;
}>;

export type PrefabDefinition = Readonly<{
  kind: SetPieceKind;
  consumedPropKinds: readonly ChamberPropDescriptor["kind"][];
  cameraPresets: readonly PrefabCameraPreset[];
  applicableDistricts: readonly string[];
}>;

const CAMERAS: readonly PrefabCameraPreset[] = Object.freeze([
  { id: "initial", purpose: "Read the route, landmark, and monster silhouette together." },
  { id: "approach", purpose: "Judge the landmark at normal traversal distance." },
  { id: "look-left", purpose: "Inspect the authored side-space and its foreground separation." },
  { id: "look-right", purpose: "Confirm the opposite route edge remains readable." },
]);

const CONSUMED: Readonly<Record<SetPieceKind, readonly ChamberPropDescriptor["kind"][]>> = Object.freeze({
  "closed-tavern": ["sign"],
  "service-nook": [],
  "empty-pantry": [],
  "sealed-nursery": ["table", "sign", "rubble"],
  "abandoned-clinic": ["table", "shelf", "sign"],
  "flooded-laundry": ["table", "generator"],
  "pilgrim-alcove": ["table", "sign", "altar"],
  "boiler-shrine": ["generator", "altar", "pipe"],
  "night-archive": ["shelf", "sign"],
  "ticket-hall": ["counter", "sign"],
  "workers-dormitory": ["table", "sign"],
  "mortuary-bay": ["table", "shelf", "lamp"],
});

export const CORRIDOR_PREFABS: Readonly<Record<SetPieceKind, PrefabDefinition>> = Object.freeze(
  Object.fromEntries(
    (Object.keys(CONSUMED) as SetPieceKind[]).map((kind) => [kind, Object.freeze({
      kind,
      consumedPropKinds: Object.freeze([...CONSUMED[kind]]),
      cameraPresets: CAMERAS,
      applicableDistricts: Object.freeze(
        CORRIDOR_DISTRICTS.filter((district) => district.setPieces.includes(kind)).map((district) => district.id),
      ),
    })]),
  ) as Record<SetPieceKind, PrefabDefinition>,
);

export type BoundPrefab<TMaterials> = PrefabDefinition & Readonly<{
  build: (descriptor: ChamberDescriptor, materials: TMaterials) => void;
}>;

export function bindCorridorPrefabBuilders<TMaterials>(
  builders: Readonly<Record<SetPieceKind, (descriptor: ChamberDescriptor, materials: TMaterials) => void>>,
): Readonly<Record<SetPieceKind, BoundPrefab<TMaterials>>> {
  return Object.freeze(
    Object.fromEntries(
      (Object.keys(CORRIDOR_PREFABS) as SetPieceKind[]).map((kind) => [kind, Object.freeze({
        ...CORRIDOR_PREFABS[kind],
        build: builders[kind],
      })]),
    ) as Record<SetPieceKind, BoundPrefab<TMaterials>>,
  );
}
