import { defineRuntimeKit, type NexusRuntimeKit } from "nexusengine";
import { DOMAIN_PATHS, type HorrorCorridorDomainControllers } from "./domainKits";

export function createHorrorCorridorBehaviorKits(controllers: HorrorCorridorDomainControllers): readonly NexusRuntimeKit[] {
  return Object.freeze([
    defineRuntimeKit({
      id: "horror-corridor-v2-flashlight-response-kit",
      requires: [DOMAIN_PATHS.party, DOMAIN_PATHS.corridor, DOMAIN_PATHS.dread],
      provides: ["horror-corridor-v2:flashlight-response"],
      bindings: {
        horrorCorridorFlashlight: {
          party: controllers.party,
          corridor: controllers.corridor,
          dread: controllers.dread,
        },
      },
      metadata: { owner: "horror-corridor-v2", kind: "behavior-kit", version: "1.0.0" },
    }),
    defineRuntimeKit({
      id: "horror-corridor-v2-monster-index-kit",
      requires: [DOMAIN_PATHS.expedition, DOMAIN_PATHS.dread],
      provides: ["horror-corridor-v2:monster-index"],
      bindings: {
        horrorCorridorMonsterIndex: controllers.expedition,
      },
      metadata: { owner: "horror-corridor-v2", kind: "behavior-kit", version: "1.0.0" },
    }),
    defineRuntimeKit({
      id: "horror-corridor-v2-building-threshold-kit",
      requires: [DOMAIN_PATHS.expedition, DOMAIN_PATHS.corridor],
      provides: ["horror-corridor-v2:building-threshold"],
      bindings: {
        horrorCorridorThreshold: {
          expedition: controllers.expedition,
          corridor: controllers.corridor,
        },
      },
      metadata: { owner: "horror-corridor-v2", kind: "behavior-kit", version: "1.0.0" },
    }),
  ]);
}

export function createHorrorCorridorRootKit(): NexusRuntimeKit {
  return defineRuntimeKit({
    id: "horror-corridor-v2-game-kit",
    requires: [
      ...Object.values(DOMAIN_PATHS),
      "horror-corridor-v2:flashlight-response",
      "horror-corridor-v2:monster-index",
      "horror-corridor-v2:building-threshold",
    ],
    provides: ["game:horror-corridor-v2"],
    metadata: {
      owner: "horror-corridor-v2",
      kind: "root-composition-kit",
      coordinationOnly: true,
      version: "1.0.0",
    },
  });
}
