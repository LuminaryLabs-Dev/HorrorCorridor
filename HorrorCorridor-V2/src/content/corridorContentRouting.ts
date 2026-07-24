export type CorridorObjectFamily = "generator" | "service-door";
export type CorridorObjectMaterialFamily = "painted-metal" | "rusted-metal" | "rubber-cable";
export type CorridorObjectPartShape = "box" | "cylinder" | "trapezoid";
export type CorridorObjectAxis = "x" | "y" | "z";

export type CorridorObjectPart = Readonly<{
  id: string;
  label: string;
  shape: CorridorObjectPartShape;
  size: Readonly<{ x: number; y: number; z: number }>;
  center: Readonly<{ x: number; y: number; z: number }>;
  materialFamily: CorridorObjectMaterialFamily;
  tags: readonly string[];
  axis?: CorridorObjectAxis;
  radialSegments?: number;
  topScale?: number;
}>;

export type RoutedCorridorObjectProfile = Readonly<{
  id: string;
  family: CorridorObjectFamily;
  title: string;
  intent: string;
  targetTraits: readonly string[];
  placementTags: readonly string[];
  palette: readonly number[];
  sourceRecords: readonly string[];
  parts: readonly CorridorObjectPart[];
}>;

export type CorridorContentRouteContext = Readonly<{
  routeSeed: number;
  segmentIndex: number;
  districtId: string;
  setPieceKind: string;
}>;

export type CorridorContentRoutingService = Readonly<{
  routeGenerator: (context: CorridorContentRouteContext) => RoutedCorridorObjectProfile;
  routeServiceDoor: (context: CorridorContentRouteContext) => RoutedCorridorObjectProfile;
}>;

type PartSeed = Omit<CorridorObjectPart, "label" | "tags"> & Readonly<{
  label?: string;
  tags?: readonly string[];
}>;

function part(seed: PartSeed): CorridorObjectPart {
  return Object.freeze({
    ...seed,
    label: seed.label ?? seed.id.replaceAll("-", " "),
    size: Object.freeze({ ...seed.size }),
    center: Object.freeze({ ...seed.center }),
    tags: Object.freeze([...(seed.tags ?? [])]),
  });
}

function profile(seed: Omit<RoutedCorridorObjectProfile, "parts"> & Readonly<{ parts: readonly PartSeed[] }>): RoutedCorridorObjectProfile {
  return Object.freeze({
    ...seed,
    targetTraits: Object.freeze([...seed.targetTraits]),
    placementTags: Object.freeze([...seed.placementTags]),
    palette: Object.freeze([...seed.palette]),
    sourceRecords: Object.freeze([...seed.sourceRecords]),
    parts: Object.freeze(seed.parts.map(part)),
  });
}

const OPEN_FRAME_GENERATOR = profile({
  id: "generator:open-frame",
  family: "generator",
  title: "Open-Frame Broken Generator",
  intent: "A grounded utility landmark with exposed machinery, a readable flywheel, and a cable trailing into the service bay.",
  targetTraits: ["open chassis", "exposed flywheel", "engine block", "fuel tank", "crooked exhaust", "trailing cable"],
  placementTags: ["floor-mounted", "large-landmark", "non-blocking"],
  palette: [0x24221c, 0x4d4634, 0x8a6038],
  sourceRecords: ["main:HorrorCorridor-V1/src/protokits/broken-generator-object-kit/index.ts"],
  parts: [
    { id: "runner-near", shape: "box", size: { x: 1.72, y: 0.12, z: 0.12 }, center: { x: 0, y: 0.08, z: 0.34 }, materialFamily: "rusted-metal", tags: ["ground-contact", "open-frame"] },
    { id: "runner-far", shape: "box", size: { x: 1.72, y: 0.12, z: 0.12 }, center: { x: 0, y: 0.08, z: -0.34 }, materialFamily: "rusted-metal", tags: ["ground-contact", "open-frame"] },
    { id: "frame-cross-left", shape: "box", size: { x: 0.12, y: 0.14, z: 0.78 }, center: { x: -0.68, y: 0.13, z: 0 }, materialFamily: "rusted-metal", tags: ["base", "open-frame"] },
    { id: "frame-cross-right", shape: "box", size: { x: 0.12, y: 0.14, z: 0.78 }, center: { x: 0.68, y: 0.13, z: 0 }, materialFamily: "rusted-metal", tags: ["base", "open-frame"] },
    { id: "frame-post-left", shape: "box", size: { x: 0.09, y: 0.9, z: 0.09 }, center: { x: -0.72, y: 0.56, z: -0.31 }, materialFamily: "rusted-metal", tags: ["open-frame", "vertical-silhouette"] },
    { id: "frame-post-right", shape: "box", size: { x: 0.09, y: 0.94, z: 0.09 }, center: { x: 0.72, y: 0.58, z: -0.31 }, materialFamily: "rusted-metal", tags: ["open-frame", "vertical-silhouette"] },
    { id: "frame-top", shape: "box", size: { x: 1.5, y: 0.09, z: 0.09 }, center: { x: 0, y: 1.02, z: -0.31 }, materialFamily: "rusted-metal", tags: ["open-frame", "broken"] },
    { id: "engine-drum", shape: "cylinder", size: { x: 0.82, y: 0.82, z: 0.64 }, center: { x: -0.3, y: 0.57, z: 0.02 }, axis: "z", radialSegments: 16, materialFamily: "painted-metal", tags: ["engine", "round-mass"] },
    { id: "flywheel-rim", shape: "cylinder", size: { x: 0.92, y: 0.92, z: 0.08 }, center: { x: -0.3, y: 0.57, z: 0.37 }, axis: "z", radialSegments: 16, materialFamily: "rusted-metal", tags: ["flywheel", "front-face"] },
    { id: "flywheel-face", shape: "cylinder", size: { x: 0.68, y: 0.68, z: 0.065 }, center: { x: -0.3, y: 0.57, z: 0.425 }, axis: "z", radialSegments: 16, materialFamily: "rubber-cable", tags: ["flywheel", "recess"] },
    { id: "rotor-hub", shape: "cylinder", size: { x: 0.2, y: 0.2, z: 0.14 }, center: { x: -0.3, y: 0.57, z: 0.49 }, axis: "z", radialSegments: 12, materialFamily: "rusted-metal", tags: ["flywheel", "hub"] },
    { id: "flywheel-spoke-horizontal", shape: "box", size: { x: 0.56, y: 0.065, z: 0.045 }, center: { x: -0.3, y: 0.57, z: 0.475 }, materialFamily: "rusted-metal", tags: ["flywheel", "spoke"] },
    { id: "flywheel-spoke-vertical", shape: "box", size: { x: 0.065, y: 0.56, z: 0.045 }, center: { x: -0.3, y: 0.57, z: 0.48 }, materialFamily: "rusted-metal", tags: ["flywheel", "spoke"] },
    { id: "engine-block", shape: "trapezoid", size: { x: 0.58, y: 0.66, z: 0.6 }, center: { x: 0.43, y: 0.55, z: -0.02 }, topScale: 0.82, materialFamily: "painted-metal", tags: ["engine", "offset-mass"] },
    { id: "cooling-fin-high", shape: "box", size: { x: 0.42, y: 0.055, z: 0.07 }, center: { x: 0.43, y: 0.7, z: 0.31 }, materialFamily: "rusted-metal", tags: ["engine", "vent"] },
    { id: "cooling-fin-mid", shape: "box", size: { x: 0.46, y: 0.055, z: 0.07 }, center: { x: 0.43, y: 0.56, z: 0.32 }, materialFamily: "rusted-metal", tags: ["engine", "vent"] },
    { id: "cooling-fin-low", shape: "box", size: { x: 0.34, y: 0.055, z: 0.07 }, center: { x: 0.38, y: 0.42, z: 0.31 }, materialFamily: "rusted-metal", tags: ["engine", "vent", "broken"] },
    { id: "fuel-tank", shape: "cylinder", size: { x: 0.84, y: 0.26, z: 0.26 }, center: { x: 0.02, y: 1.05, z: -0.09 }, axis: "x", radialSegments: 12, materialFamily: "painted-metal", tags: ["tank", "top-silhouette"] },
    { id: "fuel-band-left", shape: "cylinder", size: { x: 0.07, y: 0.31, z: 0.31 }, center: { x: -0.27, y: 1.05, z: -0.09 }, axis: "x", radialSegments: 12, materialFamily: "rusted-metal", tags: ["tank", "band"] },
    { id: "fuel-band-right", shape: "cylinder", size: { x: 0.07, y: 0.31, z: 0.31 }, center: { x: 0.3, y: 1.05, z: -0.09 }, axis: "x", radialSegments: 12, materialFamily: "rusted-metal", tags: ["tank", "band"] },
    { id: "exhaust-stack", shape: "cylinder", size: { x: 0.16, y: 0.62, z: 0.16 }, center: { x: 0.57, y: 1.22, z: -0.23 }, axis: "y", radialSegments: 10, materialFamily: "rusted-metal", tags: ["exhaust", "vertical-silhouette"] },
    { id: "exhaust-cap", shape: "cylinder", size: { x: 0.24, y: 0.08, z: 0.24 }, center: { x: 0.57, y: 1.56, z: -0.23 }, axis: "y", radialSegments: 10, materialFamily: "rusted-metal", tags: ["exhaust", "broken"] },
    { id: "control-panel", shape: "trapezoid", size: { x: 0.3, y: 0.26, z: 0.06 }, center: { x: 0.49, y: 0.75, z: 0.35 }, topScale: 0.74, materialFamily: "painted-metal", tags: ["controls", "front-face"] },
    { id: "socket-panel", shape: "box", size: { x: 0.19, y: 0.14, z: 0.05 }, center: { x: 0.49, y: 0.71, z: 0.405 }, materialFamily: "rubber-cable", tags: ["socket", "controls"] },
    { id: "cable-socket", shape: "cylinder", size: { x: 0.14, y: 0.14, z: 0.08 }, center: { x: 0.61, y: 0.31, z: 0.32 }, axis: "z", radialSegments: 10, materialFamily: "rubber-cable", tags: ["socket", "cable"] },
    { id: "loose-cable", shape: "box", size: { x: 0.1, y: 0.1, z: 0.48 }, center: { x: 0.76, y: 0.16, z: -0.04 }, materialFamily: "rubber-cable", tags: ["cable", "ground-contact"] },
    { id: "loose-cable-tail", shape: "box", size: { x: 0.38, y: 0.08, z: 0.1 }, center: { x: 0.9, y: 0.06, z: -0.32 }, materialFamily: "rubber-cable", tags: ["cable", "ground-contact"] },
  ],
});

const ENCLOSED_SERVICE_GENERATOR = profile({
  id: "generator:enclosed-service",
  family: "generator",
  title: "Enclosed Service Generator",
  intent: "A compact, damaged portable generator whose layered shell and recessed controls read distinctly from exposed machinery.",
  targetTraits: ["low skid chassis", "sloped housing", "recessed controls", "stacked louvers", "rusted feet", "short exhaust"],
  placementTags: ["floor-mounted", "large-landmark", "non-blocking"],
  palette: [0x24221c, 0x4d4634, 0x8a6038],
  sourceRecords: ["swarm:starting-scene-fidelity-003/generator-kit:working-tree"],
  parts: [
    { id: "lower-chassis", shape: "trapezoid", size: { x: 1.52, y: 0.2, z: 0.82 }, center: { x: 0.02, y: 0.16, z: 0 }, topScale: 0.9, materialFamily: "rusted-metal", tags: ["silhouette", "base"] },
    { id: "engine-body", shape: "trapezoid", size: { x: 1.32, y: 0.76, z: 0.76 }, center: { x: -0.04, y: 0.58, z: 0 }, topScale: 0.82, materialFamily: "painted-metal", tags: ["silhouette", "housing"] },
    { id: "side-panel", shape: "trapezoid", size: { x: 0.72, y: 0.5, z: 0.06 }, center: { x: -0.34, y: 0.56, z: 0.4 }, topScale: 0.9, materialFamily: "painted-metal", tags: ["recessed-panel", "damage"] },
    { id: "top-cap", shape: "trapezoid", size: { x: 0.7, y: 0.14, z: 0.48 }, center: { x: -0.16, y: 1.04, z: 0.01 }, topScale: 0.88, materialFamily: "rusted-metal", tags: ["top-silhouette", "service"] },
    { id: "control-panel", shape: "trapezoid", size: { x: 0.48, y: 0.28, z: 0.08 }, center: { x: 0.4, y: 0.72, z: 0.4 }, topScale: 0.78, materialFamily: "rusted-metal", tags: ["control-surface", "front-facing"] },
    { id: "front-vent-a", shape: "box", size: { x: 0.68, y: 0.055, z: 0.045 }, center: { x: -0.02, y: 0.62, z: 0.405 }, materialFamily: "rusted-metal", tags: ["vent", "front-facing"] },
    { id: "front-vent-b", shape: "box", size: { x: 0.68, y: 0.055, z: 0.045 }, center: { x: -0.02, y: 0.49, z: 0.405 }, materialFamily: "rusted-metal", tags: ["vent", "front-facing"] },
    { id: "front-vent-c", shape: "box", size: { x: 0.58, y: 0.055, z: 0.045 }, center: { x: -0.02, y: 0.36, z: 0.405 }, materialFamily: "rusted-metal", tags: ["vent", "front-facing"] },
    { id: "socket-panel", shape: "box", size: { x: 0.34, y: 0.24, z: 0.06 }, center: { x: 0.48, y: 0.5, z: 0.405 }, materialFamily: "rusted-metal", tags: ["socket", "control-surface"] },
    { id: "exhaust-stack", shape: "trapezoid", size: { x: 0.14, y: 0.38, z: 0.14 }, center: { x: 0.48, y: 1.13, z: -0.2 }, topScale: 0.76, materialFamily: "rusted-metal", tags: ["exhaust", "top-silhouette"] },
    { id: "left-foot", shape: "box", size: { x: 0.28, y: 0.14, z: 0.22 }, center: { x: -0.48, y: 0.08, z: 0.28 }, materialFamily: "rusted-metal", tags: ["base", "mount"] },
    { id: "right-foot", shape: "box", size: { x: 0.28, y: 0.14, z: 0.22 }, center: { x: 0.46, y: 0.08, z: 0.28 }, materialFamily: "rusted-metal", tags: ["base", "mount"] },
    { id: "loose-cable", shape: "box", size: { x: 0.12, y: 0.1, z: 0.72 }, center: { x: 0.72, y: 0.18, z: -0.22 }, materialFamily: "rubber-cable", tags: ["cable", "ground-contact"] },
  ],
});

const RAIL_FRAME_SERVICE_DOOR = profile({
  id: "service-door:rail-frame",
  family: "service-door",
  title: "Rail-Frame Rusted Service Door",
  intent: "A warped recessed slab held by separate heavy rails, corroded hinges, a raised latch, and faded warning hardware.",
  targetTraits: ["separate frame rails", "warped slab", "panel seam", "corroded hinges", "raised latch", "warning rivets"],
  placementTags: ["wall-mounted", "route-landmark", "non-blocking"],
  palette: [0x241d18, 0x563522, 0x9a542d],
  sourceRecords: ["main:HorrorCorridor-V1/src/protokits/rusted-service-door-object-kit/index.ts"],
  parts: [
    { id: "backing-frame", shape: "box", size: { x: 1.42, y: 2.28, z: 0.1 }, center: { x: 0, y: 1.14, z: 0 }, materialFamily: "rusted-metal", tags: ["frame", "deep-grime"] },
    { id: "frame-top", shape: "box", size: { x: 1.46, y: 0.2, z: 0.18 }, center: { x: 0, y: 2.18, z: 0.1 }, materialFamily: "rusted-metal", tags: ["frame", "edge-wear"] },
    { id: "frame-bottom", shape: "box", size: { x: 1.46, y: 0.2, z: 0.18 }, center: { x: 0, y: 0.1, z: 0.1 }, materialFamily: "rusted-metal", tags: ["frame", "edge-wear"] },
    { id: "frame-left", shape: "box", size: { x: 0.2, y: 1.9, z: 0.18 }, center: { x: -0.63, y: 1.14, z: 0.1 }, materialFamily: "rusted-metal", tags: ["frame", "edge-wear"] },
    { id: "frame-right", shape: "box", size: { x: 0.2, y: 1.9, z: 0.18 }, center: { x: 0.63, y: 1.14, z: 0.1 }, materialFamily: "rusted-metal", tags: ["frame", "edge-wear"] },
    { id: "recessed-slab", shape: "trapezoid", size: { x: 1.1, y: 1.86, z: 0.1 }, center: { x: 0, y: 1.14, z: 0.16 }, topScale: 0.94, materialFamily: "painted-metal", tags: ["door-skin", "chipped-paint"] },
    { id: "inset-panel", shape: "trapezoid", size: { x: 0.88, y: 1.38, z: 0.045 }, center: { x: -0.03, y: 1.16, z: 0.225 }, topScale: 0.97, materialFamily: "painted-metal", tags: ["recess", "oil-stain"] },
    { id: "panel-seam", shape: "box", size: { x: 0.035, y: 1.48, z: 0.035 }, center: { x: -0.04, y: 1.14, z: 0.255 }, materialFamily: "rusted-metal", tags: ["seam", "dark-grime"] },
    { id: "panel-brace", shape: "box", size: { x: 0.72, y: 0.06, z: 0.045 }, center: { x: 0.09, y: 0.72, z: 0.26 }, materialFamily: "rusted-metal", tags: ["brace", "edge-wear"] },
    { id: "left-hinge-a", shape: "box", size: { x: 0.15, y: 0.28, z: 0.16 }, center: { x: -0.73, y: 1.72, z: 0.22 }, materialFamily: "rusted-metal", tags: ["hinge", "corrosion"] },
    { id: "left-hinge-b", shape: "box", size: { x: 0.15, y: 0.28, z: 0.16 }, center: { x: -0.73, y: 0.6, z: 0.22 }, materialFamily: "rusted-metal", tags: ["hinge", "corrosion"] },
    { id: "latch", shape: "box", size: { x: 0.2, y: 0.28, z: 0.1 }, center: { x: 0.47, y: 1.16, z: 0.27 }, materialFamily: "rusted-metal", tags: ["latch", "hand-contact"] },
    { id: "latch-handle", shape: "box", size: { x: 0.28, y: 0.07, z: 0.07 }, center: { x: 0.42, y: 1.08, z: 0.34 }, materialFamily: "rusted-metal", tags: ["latch", "edge-wear"] },
    { id: "warning-plate", shape: "box", size: { x: 0.5, y: 0.24, z: 0.04 }, center: { x: 0.02, y: 1.64, z: 0.29 }, materialFamily: "painted-metal", tags: ["warning", "faded-paint"] },
    { id: "warning-rivet-left", shape: "box", size: { x: 0.045, y: 0.045, z: 0.045 }, center: { x: -0.2, y: 1.64, z: 0.34 }, materialFamily: "rusted-metal", tags: ["fastener", "corrosion"] },
    { id: "warning-rivet-right", shape: "box", size: { x: 0.045, y: 0.045, z: 0.045 }, center: { x: 0.24, y: 1.64, z: 0.34 }, materialFamily: "rusted-metal", tags: ["fastener", "corrosion"] },
  ],
});

const OXIDIZED_PANEL_SERVICE_DOOR = profile({
  id: "service-door:oxidized-panel",
  family: "service-door",
  title: "Oxidized Panel Service Door",
  intent: "A compact heavy frame around a sunken, oil-stained panel with warning stripes and deep oxidized seams.",
  targetTraits: ["heavy outer frame", "sunken face", "reinforcement straps", "threshold", "warning stripes", "frame bolts"],
  placementTags: ["wall-mounted", "route-landmark", "non-blocking"],
  palette: [0x28231d, 0x4f4639, 0x704329, 0x9a6438],
  sourceRecords: ["swarm:starting-scene-fidelity-003/rusted-door-kit:working-tree"],
  parts: [
    { id: "outer-frame", shape: "box", size: { x: 1.42, y: 2.28, z: 0.16 }, center: { x: 0, y: 1.14, z: 0 }, materialFamily: "rusted-metal", tags: ["frame", "load-bearing"] },
    { id: "recessed-slab", shape: "trapezoid", size: { x: 1.12, y: 1.88, z: 0.1 }, center: { x: 0, y: 1.12, z: 0.08 }, topScale: 0.96, materialFamily: "painted-metal", tags: ["door-face", "chipped-paint"] },
    { id: "inner-recess", shape: "trapezoid", size: { x: 0.9, y: 1.42, z: 0.045 }, center: { x: -0.04, y: 1.06, z: 0.145 }, topScale: 0.92, materialFamily: "rusted-metal", tags: ["recess", "shadow-break"] },
    { id: "upper-brace", shape: "box", size: { x: 0.9, y: 0.055, z: 0.045 }, center: { x: -0.04, y: 1.48, z: 0.19 }, materialFamily: "rusted-metal", tags: ["brace", "seam"] },
    { id: "lower-brace", shape: "box", size: { x: 0.72, y: 0.055, z: 0.045 }, center: { x: 0.1, y: 0.7, z: 0.19 }, materialFamily: "rusted-metal", tags: ["brace", "seam"] },
    { id: "threshold", shape: "trapezoid", size: { x: 1.16, y: 0.12, z: 0.2 }, center: { x: 0, y: 0.12, z: 0.1 }, topScale: 0.86, materialFamily: "rusted-metal", tags: ["drip-line", "floor-edge"] },
    { id: "left-hinge-a", shape: "box", size: { x: 0.12, y: 0.26, z: 0.13 }, center: { x: -0.66, y: 1.72, z: 0.16 }, materialFamily: "rusted-metal", tags: ["hinge"] },
    { id: "left-hinge-b", shape: "box", size: { x: 0.12, y: 0.26, z: 0.13 }, center: { x: -0.66, y: 0.62, z: 0.16 }, materialFamily: "rusted-metal", tags: ["hinge"] },
    { id: "latch", shape: "box", size: { x: 0.16, y: 0.24, z: 0.08 }, center: { x: 0.46, y: 1.18, z: 0.18 }, materialFamily: "rusted-metal", tags: ["latch", "hardware"] },
    { id: "latch-handle", shape: "box", size: { x: 0.28, y: 0.07, z: 0.12 }, center: { x: 0.56, y: 1.18, z: 0.22 }, materialFamily: "rusted-metal", tags: ["latch", "silhouette"] },
    { id: "warning-plate", shape: "box", size: { x: 0.48, y: 0.22, z: 0.035 }, center: { x: 0.08, y: 1.52, z: 0.2 }, materialFamily: "painted-metal", tags: ["warning", "high-contrast"] },
    { id: "warning-stripe-a", shape: "box", size: { x: 0.3, y: 0.035, z: 0.025 }, center: { x: -0.02, y: 1.48, z: 0.225 }, materialFamily: "rusted-metal", tags: ["warning", "stripe"] },
    { id: "warning-stripe-b", shape: "box", size: { x: 0.3, y: 0.035, z: 0.025 }, center: { x: 0.18, y: 1.56, z: 0.225 }, materialFamily: "rusted-metal", tags: ["warning", "stripe"] },
    { id: "frame-bolt-a", shape: "box", size: { x: 0.07, y: 0.07, z: 0.05 }, center: { x: -0.5, y: 1.95, z: 0.2 }, materialFamily: "rusted-metal", tags: ["fastener"] },
    { id: "frame-bolt-b", shape: "box", size: { x: 0.07, y: 0.07, z: 0.05 }, center: { x: 0.5, y: 0.34, z: 0.2 }, materialFamily: "rusted-metal", tags: ["fastener"] },
  ],
});

export const CORRIDOR_GENERATOR_VARIANTS: readonly RoutedCorridorObjectProfile[] = Object.freeze([
  OPEN_FRAME_GENERATOR,
  ENCLOSED_SERVICE_GENERATOR,
]);

export const CORRIDOR_SERVICE_DOOR_VARIANTS: readonly RoutedCorridorObjectProfile[] = Object.freeze([
  RAIL_FRAME_SERVICE_DOOR,
  OXIDIZED_PANEL_SERVICE_DOOR,
]);

function routeHash(context: CorridorContentRouteContext, family: CorridorObjectFamily): number {
  let value = (context.routeSeed ^ Math.imul(context.segmentIndex + 1, 0x9e3779b1)) >>> 0;
  const identity = `${family}:${context.districtId}:${context.setPieceKind}`;
  for (let index = 0; index < identity.length; index += 1) {
    value ^= identity.charCodeAt(index);
    value = Math.imul(value, 16777619) >>> 0;
  }
  value ^= value >>> 16;
  value = Math.imul(value, 0x21f0aaad) >>> 0;
  value ^= value >>> 15;
  return value >>> 0;
}

function select(
  context: CorridorContentRouteContext,
  family: CorridorObjectFamily,
  variants: readonly RoutedCorridorObjectProfile[],
): RoutedCorridorObjectProfile {
  return variants[routeHash(context, family) % variants.length];
}

export function createCorridorContentRoutingService(): CorridorContentRoutingService {
  return Object.freeze({
    routeGenerator: (context) => select(context, "generator", CORRIDOR_GENERATOR_VARIANTS),
    routeServiceDoor: (context) => select(context, "service-door", CORRIDOR_SERVICE_DOOR_VARIANTS),
  });
}

export const CORRIDOR_CONTENT_ROUTING = createCorridorContentRoutingService();
