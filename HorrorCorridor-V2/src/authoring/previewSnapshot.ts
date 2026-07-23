import {
  SNAPSHOT_SCHEMA,
  type DreadPhase,
  type HorrorCorridorV2Snapshot,
} from "../contracts";
import { CORRIDOR_DISTRICTS, type SetPieceKind } from "../content/chamber";
import { MONSTERS_BY_ID } from "../content/monsters";
import type {
  AuthoringCameraPreset,
  AuthoringPreviewConfig,
  AuthoringPreviewPhase,
} from "./contracts";

export const DEFAULT_AUTHORING_PREVIEW: AuthoringPreviewConfig = Object.freeze({
  setPieceId: "set-piece:mortuary-bay",
  districtId: "district:cold-delivery",
  monsterId: "monster:morgue-twin-hushed",
  phase: "approaching",
  cameraPreset: "initial",
});

const PREVIEW_PHASES: readonly AuthoringPreviewPhase[] = ["sign", "approaching", "repelling", "blackout", "last-chance"];
const CAMERA_PRESETS: readonly AuthoringCameraPreset[] = ["initial", "approach", "look-left", "look-right"];

function stripPrefix(value: string, prefix: string): string {
  return value.startsWith(prefix) ? value.slice(prefix.length) : value;
}

export function previewSetPieceKind(config: AuthoringPreviewConfig): SetPieceKind {
  return stripPrefix(config.setPieceId, "set-piece:") as SetPieceKind;
}

export function previewDistrictId(config: AuthoringPreviewConfig): string {
  return stripPrefix(config.districtId, "district:");
}

export function previewMonsterId(config: AuthoringPreviewConfig): string {
  return stripPrefix(config.monsterId, "monster:");
}

export function validateAuthoringPreviewConfig(config: AuthoringPreviewConfig): AuthoringPreviewConfig {
  const setPiece = previewSetPieceKind(config);
  const district = CORRIDOR_DISTRICTS.find((value) => value.id === previewDistrictId(config));
  const monsterId = previewMonsterId(config);
  if (!CORRIDOR_DISTRICTS.some((value) => value.setPieces.includes(setPiece))) {
    throw new Error(`Unknown authoring set piece: ${config.setPieceId}`);
  }
  if (!district) throw new Error(`Unknown authoring district: ${config.districtId}`);
  if (!MONSTERS_BY_ID[monsterId]) throw new Error(`Unknown authoring monster: ${config.monsterId}`);
  if (!PREVIEW_PHASES.includes(config.phase)) throw new Error(`Unknown authoring phase: ${config.phase}`);
  if (!CAMERA_PRESETS.includes(config.cameraPreset)) throw new Error(`Unknown authoring camera: ${config.cameraPreset}`);
  return Object.freeze({
    setPieceId: `set-piece:${setPiece}`,
    districtId: `district:${district.id}`,
    monsterId: `monster:${monsterId}`,
    phase: config.phase,
    cameraPreset: config.cameraPreset,
  });
}

function cameraState(preset: AuthoringCameraPreset): Readonly<{ z: number; yaw: number }> {
  if (preset === "approach") return { z: -1.5, yaw: 0.08 };
  if (preset === "look-left") return { z: -0.2, yaw: 0.34 };
  if (preset === "look-right") return { z: -0.2, yaw: -0.31 };
  return { z: 4, yaw: 0.04 };
}

export function createAuthoringPreviewSnapshot(
  unsafeConfig: AuthoringPreviewConfig,
  simTimeMs = 0,
): HorrorCorridorV2Snapshot {
  const config = validateAuthoringPreviewConfig(unsafeConfig);
  const monsterId = previewMonsterId(config);
  const monster = MONSTERS_BY_ID[monsterId];
  const camera = cameraState(config.cameraPreset);
  const phase: DreadPhase = config.phase;
  const blackout = phase === "blackout";
  const lastChance = phase === "last-chance";
  const beamContact = phase === "repelling";
  const distanceMeters = lastChance ? 4.2 : blackout ? 6.4 : phase === "repelling" ? 7.2 : 10.5;
  const effectiveLight = !blackout;

  const snapshot: HorrorCorridorV2Snapshot = {
    schema: SNAPSHOT_SCHEMA,
    seed: 0x4d4f5254,
    tick: Math.floor(simTimeMs / (1_000 / 60)),
    simTimeMs,
    digest: `authoring:${config.setPieceId}:${config.monsterId}:${config.phase}:${config.cameraPreset}`,
    expedition: {
      phase: "delving",
      runId: "authoring-preview",
      seed: 0x4d4f5254,
      elapsedMs: simTimeMs,
      distanceMeters: Math.max(0, 4 - camera.z),
      distanceSinceEncounter: 20,
      score: 0,
      fate: "unwritten",
      buildingNumber: 11,
      chronicle: [],
      monsterIndex: {
        [monsterId]: {
          monsterId,
          status: "heard",
          encounters: 1,
          survivals: 0,
          captures: 0,
          firstBuilding: 11,
        },
      },
    },
    corridor: {
      buildingId: "authoring-building",
      chamberId: `authoring:${config.districtId}:${config.setPieceId}`,
      routeSeed: 0x0c0111d0,
      randomState: 0x0c0111d0,
      thresholdOpen: false,
      offering: null,
      claimedOfferings: [],
      illumination: {
        mode: blackout ? "blackout" : lastChance ? "flicker" : "steady",
        intensity: blackout ? 0.16 : lastChance ? 0.55 : 0.92,
        greenShift: blackout ? 0.92 : lastChance ? 0.72 : 0.28,
        nextFlickerMs: blackout ? 3_000 : 4_000,
      },
      beam: {
        active: effectiveLight,
        contact: beamContact,
        halfAngle: 0.39,
      },
      acoustics: {
        roomTone: CORRIDOR_DISTRICTS.find((district) => district.id === previewDistrictId(config))?.roomTone ?? "flooded",
        cuePan: monster.bearingOffset,
        cueStrength: phase === "sign" ? 0.65 : 0.92,
      },
    },
    party: {
      explorerId: "authoring-listener",
      name: "Listener",
      position: { x: 0, y: 1.65, z: camera.z },
      velocity: { x: 0, y: 0, z: 0 },
      yaw: camera.yaw,
      pitch: -0.015,
      flashlight: {
        intentOn: true,
        effectiveOn: effectiveLight,
        charge: 1,
      },
      condition: blackout ? "blinded" : lastChance ? "shaken" : "ready",
    },
    dread: {
      encounterId: "authoring-encounter",
      monsterId,
      randomState: 0x000d2ead,
      phase,
      distanceMeters,
      bearingRadians: 0.08 + monster.bearingOffset * 0.35,
      heardSide: monster.bearingOffset < 0 ? "left" : "right",
      threat: phase === "sign" ? 0.2 : lastChance ? 0.95 : blackout ? 0.82 : 0.58,
      signRemainingMs: phase === "sign" ? monster.signDurationMs * 0.5 : 0,
      beamHoldMs: beamContact ? monster.beamHoldMs * 0.45 : 0,
      blackoutRemainingMs: blackout ? 1_850 : 0,
      lastChanceRemainingMs: lastChance ? monster.lastChanceMs * 0.5 : 0,
      jumpscareRemainingMs: 0,
      lastOutcome: null,
      message: monster.responseInstruction,
    },
    sharedExpedition: {
      mode: "solo",
      authority: "local",
      sessionId: "authoring-preview",
      roomCode: null,
      connection: "offline",
      revision: 0,
      lastPublishedAtMs: 0,
      peers: {},
    },
  };
  return Object.freeze(snapshot);
}
