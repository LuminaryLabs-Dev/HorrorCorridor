import type { MonsterId } from "../contracts";

export type MonsterMovement = "steady" | "rush-when-still" | "stall-in-beam" | "weave" | "surge-near";
export type MonsterResponse = "hold-beam" | "move-with-beam" | "stand-with-beam";
export type MonsterSilhouette = "elongated" | "hunched" | "broad" | "veiled" | "crooked" | "hollow";

export type MonsterProfile = Readonly<{
  id: MonsterId;
  family: string;
  manifestation: string;
  name: string;
  indexDescription: string;
  sign: string;
  sensoryChannel: "footstep" | "voice" | "metal" | "breath" | "water" | "electrical";
  movement: MonsterMovement;
  response: MonsterResponse;
  silhouette: MonsterSilhouette;
  responseInstruction: string;
  failureConsequence: string;
  signDurationMs: number;
  initialDistanceMeters: number;
  approachMetersPerSecond: number;
  beamHoldMs: number;
  lastChanceMs: number;
  bearingOffset: number;
  color: number;
}>;

type Family = Readonly<{
  id: string;
  name: string;
  description: string;
  sign: string;
  channel: MonsterProfile["sensoryChannel"];
  movement: MonsterMovement;
  response: MonsterResponse;
  consequence: string;
  color: number;
}>;

const FAMILIES: readonly Family[] = Object.freeze([
  { id: "bellhop", name: "Bellhop Without Hands", description: "Carries luggage that knocks from inside.", sign: "A suitcase latch clicks behind you.", channel: "metal", movement: "steady", response: "hold-beam", consequence: "Its luggage opens around your ankles.", color: 0x685b50 },
  { id: "chalk-child", name: "The Chalk Child", description: "Draws shortcuts that only it can use.", sign: "Chalk scratches at knee height.", channel: "footstep", movement: "weave", response: "move-with-beam", consequence: "Your outline joins the wall.", color: 0x85857a },
  { id: "drain-singer", name: "Drain Singer", description: "Sings upward through standing water.", sign: "A note bubbles under the floor.", channel: "water", movement: "surge-near", response: "stand-with-beam", consequence: "The corridor fills from inside your lungs.", color: 0x3f716c },
  { id: "switchman", name: "The Last Switchman", description: "Changes tracks in corridors with no rails.", sign: "A signal lever drops in the dark.", channel: "metal", movement: "rush-when-still", response: "move-with-beam", consequence: "The route closes over you.", color: 0x625c3e },
  { id: "velvet-nurse", name: "Velvet Nurse", description: "Checks pulses by listening through walls.", sign: "Fabric brushes the brick beside your ear.", channel: "breath", movement: "stall-in-beam", response: "hold-beam", consequence: "It quiets the pulse it cannot count.", color: 0x735c69 },
  { id: "receipt-man", name: "The Receipt Man", description: "Itemizes everything removed from a traveler.", sign: "A paper roll chatters from the left.", channel: "electrical", movement: "weave", response: "stand-with-beam", consequence: "Your name prints as the final charge.", color: 0x77715d },
  { id: "mop-bride", name: "The Mop Bride", description: "Leaves a clean path no one should follow.", sign: "Dirty water is wrung out nearby.", channel: "water", movement: "steady", response: "move-with-beam", consequence: "She washes away the path behind you.", color: 0x557067 },
  { id: "wire-saint", name: "Wire Saint", description: "Hangs blessings from live cable.", sign: "A transformer whispers your name.", channel: "electrical", movement: "surge-near", response: "hold-beam", consequence: "Its halo closes like a snare.", color: 0x596e55 },
  { id: "shift-foreman", name: "Night-Shift Foreman", description: "Counts workers who never clocked out.", sign: "A punch clock stamps once.", channel: "metal", movement: "rush-when-still", response: "stand-with-beam", consequence: "It assigns you the empty station.", color: 0x695747 },
  { id: "window-widow", name: "Window Widow", description: "Appears in glass facing the wrong direction.", sign: "A reflection takes one extra step.", channel: "footstep", movement: "stall-in-beam", response: "hold-beam", consequence: "The glass keeps the original.", color: 0x536b70 },
  { id: "choir-mouth", name: "The Choir Mouth", description: "Sings with voices collected from sealed rooms.", sign: "Several voices inhale as one.", channel: "voice", movement: "surge-near", response: "move-with-beam", consequence: "Your voice becomes its lowest note.", color: 0x66506a },
  { id: "pocket-doctor", name: "Pocket Doctor", description: "Carries instruments too small to see.", sign: "Tiny metal tools arrange themselves.", channel: "metal", movement: "weave", response: "stand-with-beam", consequence: "It repairs the part of you that escapes.", color: 0x68736d },
  { id: "under-cook", name: "The Under-Cook", description: "Prepares meals beneath abandoned counters.", sign: "A knife taps a cutting board twice.", channel: "metal", movement: "rush-when-still", response: "hold-beam", consequence: "The next covered dish is warm.", color: 0x704c3d },
  { id: "bed-counter", name: "Bed Counter", description: "Checks occupied bunks without entering rooms.", sign: "Bedsprings compress in sequence.", channel: "footstep", movement: "steady", response: "stand-with-beam", consequence: "It corrects the count by one.", color: 0x5c596a },
  { id: "salt-clerk", name: "Salt Clerk", description: "Audits every protective line for missing grains.", sign: "Salt pours onto dry concrete.", channel: "water", movement: "stall-in-beam", response: "move-with-beam", consequence: "It files you with the unprotected.", color: 0x7e7b68 },
  { id: "blue-porter", name: "The Blue Porter", description: "Opens doors into colder versions of the hall.", sign: "A distant handle turns without a door.", channel: "metal", movement: "surge-near", response: "hold-beam", consequence: "It checks you into the cold corridor.", color: 0x405d72 },
  { id: "ash-boarder", name: "Ash Boarder", description: "Pays rent in soot and sleeping breath.", sign: "Someone coughs through a sealed vent.", channel: "breath", movement: "steady", response: "move-with-beam", consequence: "Your footprints continue as ash.", color: 0x595854 },
  { id: "laundry-king", name: "Laundry King", description: "Wears every sheet lost below the flood line.", sign: "Wet linen drags around a corner.", channel: "water", movement: "weave", response: "stand-with-beam", consequence: "It folds the air out of you.", color: 0x5c706a },
  { id: "tin-priest", name: "The Tin Priest", description: "Absolves machines for what they did to people.", sign: "A metal prayer repeats backward.", channel: "voice", movement: "rush-when-still", response: "hold-beam", consequence: "Its congregation closes around you.", color: 0x655d4f },
  { id: "platform-daughter", name: "Platform Daughter", description: "Waits for a train that arrives through bodies.", sign: "A child announces a delayed service.", channel: "voice", movement: "stall-in-beam", response: "stand-with-beam", consequence: "The arrival passes through your chest.", color: 0x635b72 },
  { id: "mildew-judge", name: "Mildew Judge", description: "Reads verdicts in stains spreading overhead.", sign: "The ceiling clears its throat.", channel: "voice", movement: "surge-near", response: "move-with-beam", consequence: "The sentence blooms over your face.", color: 0x536345 },
  { id: "button-collector", name: "Button Collector", description: "Takes one fastening from every missing coat.", sign: "Small objects roll toward you.", channel: "footstep", movement: "weave", response: "hold-beam", consequence: "It opens what your clothes kept closed.", color: 0x625549 },
  { id: "radiator-wife", name: "Radiator Wife", description: "Warms rooms by standing inside their pipes.", sign: "A radiator knocks in a human rhythm.", channel: "metal", movement: "steady", response: "stand-with-beam", consequence: "The heat remembers your shape.", color: 0x764c3e },
  { id: "ticket-eater", name: "Ticket Eater", description: "Punches destinations into scraps of skin.", sign: "Teeth clip paper in the dark.", channel: "voice", movement: "rush-when-still", response: "move-with-beam", consequence: "It validates you for a one-way route.", color: 0x6d5f50 },
  { id: "ceiling-lodger", name: "Ceiling Lodger", description: "Rents the narrow space above every light.", sign: "Dust falls in the shape of footsteps.", channel: "footstep", movement: "stall-in-beam", response: "hold-beam", consequence: "It pulls the floor upward.", color: 0x525b54 },
  { id: "green-caller", name: "The Green Caller", description: "Rings telephones disconnected before the flood.", sign: "A receiver rings once inside the wall.", channel: "electrical", movement: "surge-near", response: "stand-with-beam", consequence: "Answering becomes the only sound left.", color: 0x3f7150 },
  { id: "bone-usher", name: "Bone Usher", description: "Seats late arrivals inside locked theaters.", sign: "A velvet rope unhooks itself.", channel: "metal", movement: "weave", response: "move-with-beam", consequence: "The audience turns from the stage to you.", color: 0x786d5d },
  { id: "furnace-boy", name: "Furnace Boy", description: "Feeds names into boilers after the coal is gone.", sign: "A child shovels something soft.", channel: "voice", movement: "rush-when-still", response: "hold-beam", consequence: "Your name catches before your body does.", color: 0x7b4934 },
  { id: "key-sleeper", name: "The Key Sleeper", description: "Dreams every lock open in the wrong order.", sign: "Keys turn beneath a pillow.", channel: "metal", movement: "steady", response: "stand-with-beam", consequence: "It locks your waking side away.", color: 0x615c52 },
  { id: "morgue-twin", name: "The Morgue Twin", description: "Arrives second, even when seen first.", sign: "Two drawers close; only one opened.", channel: "metal", movement: "surge-near", response: "move-with-beam", consequence: "It leaves with the warmer twin.", color: 0x526a6a },
]);

const MANIFESTATIONS = Object.freeze([
  { id: "hushed", label: "Hushed", sign: "Softly: ", distance: 3, speed: -0.12, beam: 120, last: 700, duration: 5_400, bearing: -0.03, color: 0x000605 },
  { id: "echoing", label: "Echoing", sign: "From both sides: ", distance: 6, speed: 0.04, beam: 230, last: 250, duration: 4_800, bearing: 0.04, color: 0x050009 },
  { id: "fevered", label: "Fevered", sign: "Too close: ", distance: 0, speed: 0.34, beam: -80, last: -650, duration: 3_900, bearing: 0.02, color: 0x0b0200 },
  { id: "hollow", label: "Hollow", sign: "Inside the wall: ", distance: 8, speed: 0.13, beam: 360, last: 1_050, duration: 6_200, bearing: -0.05, color: 0x00080a },
] as const);

const RESPONSE_INSTRUCTIONS: Readonly<Record<MonsterResponse, string>> = Object.freeze({
  "hold-beam": "Face the cue and keep the beam steady.",
  "move-with-beam": "Keep walking while the beam holds it.",
  "stand-with-beam": "Plant your feet and hold the beam still.",
});

const LEGACY_PROFILES: readonly MonsterProfile[] = Object.freeze([
  { id: "still-guest", family: "still-guest", manifestation: "original", name: "The Still Guest", indexDescription: "It waits where a doorway should feel empty. Its silence leans toward you.", sign: "A wet shoe settles behind you.", sensoryChannel: "footstep", movement: "steady", response: "hold-beam", silhouette: "elongated", responseInstruction: RESPONSE_INSTRUCTIONS["hold-beam"], failureConsequence: "It occupies the space you believed was empty.", signDurationMs: 5_000, initialDistanceMeters: 18, approachMetersPerSecond: 1.05, beamHoldMs: 900, lastChanceMs: 7_800, bearingOffset: 0.17, color: 0x77867a },
  { id: "wall-knocker", family: "wall-knocker", manifestation: "original", name: "The Wall Knocker", indexDescription: "Three knocks mean distance. Two mean it has crossed the wall.", sign: "Knuckles answer from the left wall.", sensoryChannel: "metal", movement: "rush-when-still", response: "move-with-beam", silhouette: "broad", responseInstruction: RESPONSE_INSTRUCTIONS["move-with-beam"], failureConsequence: "It finishes the knock from inside your ribs.", signDurationMs: 4_600, initialDistanceMeters: 20, approachMetersPerSecond: 1.16, beamHoldMs: 1_050, lastChanceMs: 7_200, bearingOffset: -0.19, color: 0x6d7f70 },
  { id: "rust-mother", family: "rust-mother", manifestation: "original", name: "Rust Mother", indexDescription: "She drags the building behind her and remembers every opened door.", sign: "Metal breathes on your right.", sensoryChannel: "breath", movement: "stall-in-beam", response: "stand-with-beam", silhouette: "veiled", responseInstruction: RESPONSE_INSTRUCTIONS["stand-with-beam"], failureConsequence: "The building closes around its newest room.", signDurationMs: 5_800, initialDistanceMeters: 17, approachMetersPerSecond: 0.92, beamHoldMs: 1_250, lastChanceMs: 8_400, bearingOffset: 0.16, color: 0x6b553f },
  { id: "breath-thief", family: "breath-thief", manifestation: "original", name: "The Breath Thief", indexDescription: "It borrows your breathing rhythm until only one of you is inhaling.", sign: "Your next breath comes from somewhere else.", sensoryChannel: "breath", movement: "surge-near", response: "hold-beam", silhouette: "hollow", responseInstruction: RESPONSE_INSTRUCTIONS["hold-beam"], failureConsequence: "It keeps the final breath for itself.", signDurationMs: 4_300, initialDistanceMeters: 21, approachMetersPerSecond: 1.24, beamHoldMs: 1_100, lastChanceMs: 6_800, bearingOffset: -0.18, color: 0x64736e },
]);

const GENERATED_PROFILES = FAMILIES.flatMap((family, familyIndex) => MANIFESTATIONS.map((manifestation, manifestationIndex): MonsterProfile => {
  const side = (familyIndex + manifestationIndex) % 2 === 0 ? 1 : -1;
  return Object.freeze({
    id: `${family.id}-${manifestation.id}`,
    family: family.id,
    manifestation: manifestation.id,
    name: `${manifestation.label} ${family.name}`,
    indexDescription: `${family.description} In this manifestation, ${manifestation.label.toLowerCase()} signs change its timing and distance.`,
    sign: `${manifestation.sign}${family.sign}`,
    sensoryChannel: family.channel,
    movement: family.movement,
    response: family.response,
    silhouette: (["elongated", "hunched", "broad", "veiled", "crooked", "hollow"] as const)[familyIndex % 6],
    responseInstruction: RESPONSE_INSTRUCTIONS[family.response],
    failureConsequence: family.consequence,
    signDurationMs: manifestation.duration,
    initialDistanceMeters: 17 + (familyIndex % 5) + manifestation.distance,
    approachMetersPerSecond: 0.82 + (familyIndex % 7) * 0.075 + manifestation.speed,
    beamHoldMs: 850 + (familyIndex % 6) * 90 + manifestation.beam,
    lastChanceMs: 7_100 + (familyIndex % 5) * 320 + manifestation.last,
    bearingOffset: side * (0.13 + (familyIndex % 4) * 0.025) + manifestation.bearing,
    color: (family.color ^ manifestation.color) >>> 0,
  });
}));

export const MONSTER_PROFILES: readonly MonsterProfile[] = Object.freeze([...LEGACY_PROFILES, ...GENERATED_PROFILES]);
export const MONSTER_FAMILY_COUNT = FAMILIES.length + LEGACY_PROFILES.length;

export const MONSTERS_BY_ID = Object.freeze(
  Object.fromEntries(MONSTER_PROFILES.map((profile) => [profile.id, profile])) as Record<MonsterId, MonsterProfile>,
);

export function monsterForBuilding(buildingNumber: number): MonsterProfile {
  return MONSTER_PROFILES[(Math.max(1, buildingNumber) - 1) % MONSTER_PROFILES.length];
}
