export const CORRIDOR_SEGMENT_LENGTH_METERS = 8;
export const WALKABLE_CONTENT_MINUTES = 10;
export const WALKABLE_CONTENT_SEGMENTS = 240;

export type ChamberPropDescriptor = Readonly<{
  id: string;
  kind: "lamp" | "shelf" | "generator" | "pipe" | "rubble" | "altar" | "counter" | "table" | "sign";
  position: Readonly<{ x: number; y: number; z: number }>;
  rotationY?: number;
  scale?: Readonly<{ x: number; y: number; z: number }>;
}>;

export type CorridorDistrict = Readonly<{
  id: string;
  name: string;
  material: string;
  roomTone: "concrete" | "service-tunnel" | "flooded";
  lightColor: number;
  wallColor: number;
  floorColor: number;
  setPieces: readonly SetPieceKind[];
}>;

export type SetPieceKind =
  | "closed-tavern"
  | "service-nook"
  | "pilgrim-alcove"
  | "abandoned-clinic"
  | "flooded-laundry"
  | "sealed-nursery"
  | "night-archive"
  | "boiler-shrine"
  | "ticket-hall"
  | "empty-pantry"
  | "workers-dormitory"
  | "mortuary-bay";

export const CORRIDOR_DISTRICTS: readonly CorridorDistrict[] = Object.freeze([
  { id: "service-mouth", name: "The Service Mouth", material: "wet-concrete", roomTone: "concrete", lightColor: 0x73e69a, wallColor: 0x35443d, floorColor: 0x27332d, setPieces: ["service-nook", "closed-tavern"] },
  { id: "shuttered-market", name: "Shuttered Market", material: "oxidized-steel", roomTone: "service-tunnel", lightColor: 0xd88a54, wallColor: 0x49382f, floorColor: 0x302c27, setPieces: ["closed-tavern", "empty-pantry"] },
  { id: "charity-ward", name: "The Charity Ward", material: "painted-brick", roomTone: "concrete", lightColor: 0xa9d2b0, wallColor: 0x3e4942, floorColor: 0x29332e, setPieces: ["abandoned-clinic", "sealed-nursery"] },
  { id: "flood-line", name: "The Flood Line", material: "dust-glass", roomTone: "flooded", lightColor: 0x5bbaa6, wallColor: 0x273e3b, floorColor: 0x1d3534, setPieces: ["flooded-laundry", "service-nook"] },
  { id: "pilgrim-mile", name: "Pilgrim Mile", material: "wet-concrete", roomTone: "concrete", lightColor: 0xc6b874, wallColor: 0x484536, floorColor: 0x343128, setPieces: ["pilgrim-alcove", "boiler-shrine"] },
  { id: "records-below", name: "Records Below", material: "painted-brick", roomTone: "service-tunnel", lightColor: 0x7594b5, wallColor: 0x303945, floorColor: 0x252b33, setPieces: ["night-archive", "ticket-hall"] },
  { id: "boiler-parish", name: "Boiler Parish", material: "oxidized-steel", roomTone: "service-tunnel", lightColor: 0xdf6d3e, wallColor: 0x503529, floorColor: 0x342820, setPieces: ["boiler-shrine", "service-nook"] },
  { id: "last-platform", name: "The Last Platform", material: "dust-glass", roomTone: "concrete", lightColor: 0x8a91b8, wallColor: 0x383a48, floorColor: 0x292b35, setPieces: ["ticket-hall", "workers-dormitory"] },
  { id: "provision-tombs", name: "Provision Tombs", material: "painted-brick", roomTone: "concrete", lightColor: 0xb39462, wallColor: 0x453d31, floorColor: 0x302b24, setPieces: ["empty-pantry", "mortuary-bay"] },
  { id: "sleeping-shift", name: "The Sleeping Shift", material: "wet-concrete", roomTone: "flooded", lightColor: 0x756b91, wallColor: 0x373440, floorColor: 0x282630, setPieces: ["workers-dormitory", "sealed-nursery"] },
  { id: "cold-delivery", name: "Cold Delivery", material: "oxidized-steel", roomTone: "flooded", lightColor: 0x77b7b0, wallColor: 0x2d4141, floorColor: 0x223333, setPieces: ["mortuary-bay", "abandoned-clinic"] },
  { id: "unmarked-return", name: "The Unmarked Return", material: "wet-concrete", roomTone: "service-tunnel", lightColor: 0x75d584, wallColor: 0x304238, floorColor: 0x243129, setPieces: ["pilgrim-alcove", "night-archive", "closed-tavern"] },
]);

function hashSegment(routeSeed: number, segmentIndex: number): number {
  let value = (routeSeed ^ Math.imul(segmentIndex + 1, 0x9e3779b1)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x21f0aaad) >>> 0;
  value ^= value >>> 15;
  return value >>> 0;
}

export function districtForSegment(segmentIndex: number): CorridorDistrict {
  const normalized = Math.max(0, segmentIndex);
  const districtIndex = Math.floor(normalized / 20) % CORRIDOR_DISTRICTS.length;
  return CORRIDOR_DISTRICTS[districtIndex];
}

function propsFor(kind: SetPieceKind, id: string, x: number, z: number, side: number, facing: number): readonly ChamberPropDescriptor[] {
  const near = side * 2.25;
  const sign = (offset = 0): ChamberPropDescriptor => ({ id: `${id}-sign`, kind: "sign", position: { x: side * 3.45, y: 2.4, z: z + offset }, rotationY: facing });
  const table = (offset = 0): ChamberPropDescriptor => ({ id: `${id}-table-${offset}`, kind: "table", position: { x: near, y: 0, z: z + offset }, rotationY: 0.1 * side });
  const shelf = (offset = 0): ChamberPropDescriptor => ({ id: `${id}-shelf-${offset}`, kind: "shelf", position: { x, y: 0, z: z + offset }, rotationY: facing });
  switch (kind) {
    case "closed-tavern": return [{ id: `${id}-counter`, kind: "counter", position: { x, y: 0, z }, rotationY: facing }, table(1.9), sign(-1.3), { id: `${id}-lamp`, kind: "lamp", position: { x, y: 3.1, z: z + 0.3 } }];
    case "service-nook": return [shelf(-0.8), { id: `${id}-generator`, kind: "generator", position: { x: near, y: 0, z: z + 1.45 }, rotationY: facing }, { id: `${id}-rubble`, kind: "rubble", position: { x: near, y: 0, z: z + 2.25 } }];
    case "pilgrim-alcove": return [table(), sign(0.4), { id: `${id}-altar`, kind: "altar", position: { x: near, y: 0, z: z - 1.65 } }];
    case "abandoned-clinic": return [table(-0.8), shelf(1.25), sign(-2), { id: `${id}-pipe`, kind: "pipe", position: { x: side * 3.15, y: 2.7, z } }];
    case "flooded-laundry": return [table(-1.2), table(1.25), { id: `${id}-generator`, kind: "generator", position: { x, y: 0, z }, rotationY: facing }];
    case "sealed-nursery": return [shelf(-1.5), table(0.8), sign(1.9), { id: `${id}-rubble`, kind: "rubble", position: { x: near, y: 0, z: z - 0.4 } }];
    case "night-archive": return [shelf(-1.7), shelf(0), shelf(1.7), sign(-2.5)];
    case "boiler-shrine": return [{ id: `${id}-generator`, kind: "generator", position: { x, y: 0, z }, rotationY: facing }, { id: `${id}-altar`, kind: "altar", position: { x: near, y: 0, z: z + 1.8 } }, { id: `${id}-pipe`, kind: "pipe", position: { x: side * 3.2, y: 2.75, z } }];
    case "ticket-hall": return [{ id: `${id}-counter`, kind: "counter", position: { x, y: 0, z }, rotationY: facing }, sign(-1.9), sign(1.9)];
    case "empty-pantry": return [shelf(-1.6), shelf(1.1), table(), { id: `${id}-rubble`, kind: "rubble", position: { x: near, y: 0, z: z + 2 } }];
    case "workers-dormitory": return [table(-1.8), table(), table(1.8), sign(-2.6)];
    case "mortuary-bay": return [table(-1.35), table(1.35), shelf(), { id: `${id}-lamp`, kind: "lamp", position: { x, y: 3.05, z } }];
  }
}

export function createCorridorSetPiece(routeSeed: number, segmentIndex: number, centerZ: number): ChamberDescriptor {
  const hash = hashSegment(routeSeed, segmentIndex);
  const side = (hash & 1) === 0 ? -1 : 1;
  const x = side * 2.72;
  const facing = side < 0 ? Math.PI / 2 : -Math.PI / 2;
  const district = districtForSegment(segmentIndex);
  const kind = district.setPieces[hash % district.setPieces.length];
  const id = `${kind}-${segmentIndex}`;
  return Object.freeze({
    id,
    title: `${district.name}: ${kind.split("-").map((word) => word[0].toUpperCase() + word.slice(1)).join(" ")}`,
    materials: [district.material, "oxidized-steel"],
    props: propsFor(kind, id, x, centerZ, side, facing),
    district,
    kind,
  });
}

export function createAuthoredCorridorSetPiece(
  kind: SetPieceKind,
  districtId: string,
  segmentIndex: number,
  centerZ: number,
  side: -1 | 1 = -1,
): ChamberDescriptor {
  const district = CORRIDOR_DISTRICTS.find((value) => value.id === districtId);
  if (!district) throw new Error(`Unknown authored corridor district: ${districtId}`);
  const x = side * 2.72;
  const facing = side < 0 ? Math.PI / 2 : -Math.PI / 2;
  const id = `authoring-${kind}-${segmentIndex}`;
  return Object.freeze({
    id,
    title: `${district.name}: ${kind.split("-").map((word) => word[0].toUpperCase() + word.slice(1)).join(" ")}`,
    materials: [district.material, "oxidized-steel"],
    props: propsFor(kind, id, x, centerZ, side, facing),
    district,
    kind,
  });
}

export type ChamberDescriptor = Readonly<{
  id: string;
  title: string;
  materials: readonly string[];
  props: readonly ChamberPropDescriptor[];
  district: CorridorDistrict;
  kind: SetPieceKind;
}>;
