import type { CorridorSnapshot, OfferingId, PartySnapshot } from "../contracts";
import type { DeterministicRandom } from "../composition/determinism";
import { clamp } from "../composition/determinism";
import {
  CORRIDOR_CONTENT_ROUTING,
  type CorridorContentRoutingService,
} from "../content/corridorContentRouting";
import { offeringForBuilding } from "../content/offerings";

type CorridorState = {
  buildingId: string;
  chamberId: string;
  routeSeed: number;
  thresholdOpen: boolean;
  offering: CorridorSnapshot["offering"];
  claimedOfferings: OfferingId[];
  illumination: {
    mode: CorridorSnapshot["illumination"]["mode"];
    intensity: number;
    greenShift: number;
    nextFlickerMs: number;
  };
  beam: { active: boolean; contact: boolean; halfAngle: number };
  acoustics: {
    roomTone: CorridorSnapshot["acoustics"]["roomTone"];
    cuePan: number;
    cueStrength: number;
  };
};

function initialState(seed: number): CorridorState {
  return {
    buildingId: "building-001",
    chamberId: "service-threshold-1",
    routeSeed: seed,
    thresholdOpen: false,
    offering: null,
    claimedOfferings: [],
    illumination: { mode: "steady", intensity: 0.78, greenShift: 0.18, nextFlickerMs: 2_800 },
    beam: { active: true, contact: false, halfAngle: 0.1 },
    acoustics: { roomTone: "service-tunnel", cuePan: 0, cueStrength: 0 },
  };
}

export type CorridorDomain = ReturnType<typeof createCorridorDomain>;

export function createCorridorDomain(
  seed: number,
  random: DeterministicRandom,
  contentRouting: CorridorContentRoutingService = CORRIDOR_CONTENT_ROUTING,
) {
  const initialRandomState = random.state();
  let state = initialState(seed);

  const snapshot = (): CorridorSnapshot => ({
    ...state,
    randomState: random.state(),
    offering: state.offering ? { ...state.offering } : null,
    claimedOfferings: [...state.claimedOfferings],
    illumination: { ...state.illumination },
    beam: { ...state.beam },
    acoustics: { ...state.acoustics },
  });

  return Object.freeze({
    snapshot,
    routeGenerator: contentRouting.routeGenerator,
    routeServiceDoor: contentRouting.routeServiceDoor,
    resolveMotion(position: PartySnapshot["position"]): PartySnapshot["position"] {
      const x = clamp(position.x, -3.15, 3.15);
      return { x, y: position.y, z: position.z };
    },
    step(deltaMs: number, forceBlackout: boolean) {
      if (forceBlackout) {
        state.illumination.mode = "blackout";
        state.illumination.intensity = 0.04;
        state.illumination.greenShift = 0.88;
        state.beam.active = false;
        state.beam.contact = false;
        return snapshot();
      }

      state.illumination.nextFlickerMs -= deltaMs;
      if (state.illumination.nextFlickerMs <= 0) {
        state.illumination.mode = state.illumination.mode === "flicker" ? "steady" : "flicker";
        state.illumination.nextFlickerMs = state.illumination.mode === "flicker"
          ? random.between(90, 420)
          : random.between(1_600, 4_800);
      }
      const flicker = state.illumination.mode === "flicker";
      state.illumination.intensity = flicker ? random.between(0.22, 0.62) : 0.78;
      state.illumination.greenShift = flicker ? random.between(0.48, 0.78) : 0.18;
      return snapshot();
    },
    setBeam(active: boolean, contact: boolean) {
      state.beam.active = active;
      state.beam.contact = active && contact;
      return snapshot();
    },
    setAcousticCue(pan: number, strength: number) {
      state.acoustics.cuePan = clamp(pan, -1, 1);
      state.acoustics.cueStrength = clamp(strength, 0, 1);
      return snapshot();
    },
    openOffering(buildingNumber: number) {
      state.offering = offeringForBuilding(buildingNumber);
      state.thresholdOpen = true;
      return snapshot();
    },
    claimOffering(offeringId?: OfferingId) {
      if (!state.offering || (offeringId && offeringId !== state.offering.id)) return null;
      const claimed = state.offering;
      if (!state.claimedOfferings.includes(claimed.id)) state.claimedOfferings.push(claimed.id);
      state.offering = null;
      return { ...claimed };
    },
    enterBuilding(buildingNumber: number) {
      state.buildingId = `building-${String(buildingNumber).padStart(3, "0")}`;
      state.chamberId = `service-threshold-${buildingNumber}`;
      state.routeSeed = (seed ^ Math.imul(buildingNumber, 0x9e3779b1)) >>> 0;
      state.thresholdOpen = false;
      state.offering = null;
      state.illumination = { mode: "steady", intensity: 0.78, greenShift: 0.18, nextFlickerMs: 1_900 };
      state.beam.contact = false;
      return snapshot();
    },
    reset() {
      random.restore(initialRandomState);
      state = initialState(seed);
      return snapshot();
    },
    load(next: CorridorSnapshot) {
      const { randomState, ...rest } = next;
      random.restore(randomState);
      state = {
        ...rest,
        offering: next.offering ? { ...next.offering } : null,
        claimedOfferings: [...next.claimedOfferings],
        illumination: { ...next.illumination },
        beam: { ...next.beam },
        acoustics: { ...next.acoustics },
      };
      return snapshot();
    },
  });
}
