import type { OfferingId } from "../contracts";

export type Offering = Readonly<{
  id: OfferingId;
  name: string;
  description: string;
}>;

export const OFFERINGS: readonly Offering[] = Object.freeze([
  { id: "fresh-cell", name: "Fresh Cell", description: "The beam steadies sooner after a blackout." },
  { id: "silver-bell", name: "Silver Bell", description: "A clear chime reveals which side is unsafe." },
  { id: "red-thread", name: "Red Thread", description: "The next threshold is easier to find in the dark." },
  { id: "salt-chalk", name: "Salt Chalk", description: "A captured encounter leaves more Chronicle score." },
]);

export function offeringForBuilding(buildingNumber: number): Offering {
  return OFFERINGS[(Math.max(1, buildingNumber) - 1) % OFFERINGS.length];
}
