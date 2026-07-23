import { defineDomainServiceKit, type NexusRuntimeKit } from "nexusengine";
import type { CorridorDomain } from "../corridor";
import type { DreadDomain } from "../dread";
import type { ExpeditionDomain } from "../expedition";
import type { PartyDomain } from "../party";
import type { SharedExpeditionDomain } from "../shared-expedition";

export const HORROR_CORRIDOR_ROOT_DOMAIN = "n:horror-corridor-v2";
export const DOMAIN_PATHS = Object.freeze({
  expedition: `${HORROR_CORRIDOR_ROOT_DOMAIN}:expedition`,
  corridor: `${HORROR_CORRIDOR_ROOT_DOMAIN}:corridor`,
  party: `${HORROR_CORRIDOR_ROOT_DOMAIN}:party`,
  dread: `${HORROR_CORRIDOR_ROOT_DOMAIN}:dread`,
  sharedExpedition: `${HORROR_CORRIDOR_ROOT_DOMAIN}:shared-expedition`,
});

export type HorrorCorridorDomainControllers = Readonly<{
  expedition: ExpeditionDomain;
  corridor: CorridorDomain;
  party: PartyDomain;
  dread: DreadDomain;
  sharedExpedition: SharedExpeditionDomain;
}>;

export function createHorrorCorridorDomainKits(controllers: HorrorCorridorDomainControllers): readonly NexusRuntimeKit[] {
  return Object.freeze([
    defineDomainServiceKit({
      id: "horror-corridor-v2-expedition-dsk",
      domain: "expedition",
      domainPath: DOMAIN_PATHS.expedition,
      parentDomainPath: HORROR_CORRIDOR_ROOT_DOMAIN,
      apiName: "horrorCorridorExpedition",
      services: ["progress", "fate", "chronicle", "monster-index"],
      stability: "project",
      version: "1.0.0",
      inputs: ["movement-distance", "dread-outcome", "offering-claimed"],
      outputs: ["expedition-snapshot", "progression-event"],
      createApi: () => controllers.expedition,
    }),
    defineDomainServiceKit({
      id: "horror-corridor-v2-corridor-dsk",
      domain: "corridor",
      domainPath: DOMAIN_PATHS.corridor,
      parentDomainPath: HORROR_CORRIDOR_ROOT_DOMAIN,
      apiName: "horrorCorridorWorld",
      services: ["route", "chamber", "illumination", "beam", "acoustics", "offering"],
      stability: "project",
      version: "1.0.0",
      inputs: ["party-pose", "flashlight-intent", "dread-blackout"],
      outputs: ["corridor-snapshot", "beam-contact", "threshold-event"],
      createApi: () => controllers.corridor,
    }),
    defineDomainServiceKit({
      id: "horror-corridor-v2-party-dsk",
      domain: "party",
      domainPath: DOMAIN_PATHS.party,
      parentDomainPath: HORROR_CORRIDOR_ROOT_DOMAIN,
      apiName: "horrorCorridorParty",
      services: ["explorer", "pose", "gaze", "flashlight-intent", "condition"],
      stability: "project",
      version: "1.0.0",
      inputs: ["semantic-input", "collision-result", "dread-consequence"],
      outputs: ["party-snapshot", "movement-distance", "flashlight-intent"],
      createApi: () => controllers.party,
    }),
    defineDomainServiceKit({
      id: "horror-corridor-v2-dread-dsk",
      domain: "dread",
      domainPath: DOMAIN_PATHS.dread,
      parentDomainPath: HORROR_CORRIDOR_ROOT_DOMAIN,
      apiName: "horrorCorridorDread",
      services: ["monster", "sign", "pursuit", "blackout", "capture"],
      stability: "project",
      version: "1.0.0",
      inputs: ["party-pose", "corridor-beam-contact"],
      outputs: ["dread-snapshot", "encounter-outcome", "forced-blackout"],
      createApi: () => controllers.dread,
    }),
    defineDomainServiceKit({
      id: "horror-corridor-v2-shared-expedition-dsk",
      domain: "shared-expedition",
      domainPath: DOMAIN_PATHS.sharedExpedition,
      parentDomainPath: HORROR_CORRIDOR_ROOT_DOMAIN,
      apiName: "horrorCorridorSharedExpedition",
      services: ["authority", "replication", "reconnect", "recovery"],
      stability: "project",
      version: "1.0.0",
      inputs: ["authoritative-snapshot", "network-presence"],
      outputs: ["shared-snapshot", "recovery-event"],
      createApi: () => controllers.sharedExpedition,
    }),
  ]);
}
