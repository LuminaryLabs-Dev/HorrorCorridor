import {
  createCoreAnimationKit,
  createCoreAssetsKit,
  createCoreAudioKit,
  createCoreCameraFramingKit,
  createCoreCameraKit,
  createCoreCaptureKit,
  createCoreCharacterKit,
  createCoreCompositionKit,
  createCoreCreatureKit,
  createCoreDataKit,
  createCoreDebugKit,
  createCoreDiagnosticsKit,
  createCoreGraphicsKit,
  createCoreInputKit,
  createCoreInteractionKit,
  createCoreMotionKit,
  createCoreNetworkKit,
  createCoreObjectFidelityKit,
  createCoreObjectKit,
  createCoreObjectShapeKit,
  createCorePersistenceKit,
  createCorePhysicsKit,
  createCorePlatformKit,
  createCorePlayerKit,
  createCorePresentationKit,
  createCorePresentationOutputKit,
  createCoreSceneKit,
  createCoreSimulationKit,
  createCoreSkyboxKit,
  createCoreSpatialKit,
  createCoreStartupKit,
  createCoreTransactionLedgerKit,
  createCoreUIKit,
  createCoreUIScaleKit,
  createCoreVegetationKit,
  createCoreWorldDomain,
  createNavMeshKit,
  createPathfindingKit,
  createProceduralKit,
  createRealtimeCoreKit,
  createRouteFieldKit,
  createSequenceCoreKit,
  type NexusRuntimeKit,
} from "nexusengine";

export const SHIPPING_CORE_KIT_COUNT = 36;
export const DEVELOPMENT_CORE_KIT_COUNT = 38;

export type HorrorCorridorCoreManifest = Readonly<{
  coreKits: readonly NexusRuntimeKit[];
  corridorGenerationKits: readonly NexusRuntimeKit[];
  coreKitIds: readonly string[];
}>;

function assertUniqueKitIds(kits: readonly NexusRuntimeKit[]): void {
  const seen = new Set<string>();
  for (const kit of kits) {
    if (seen.has(kit.id)) throw new Error(`Duplicate explicit NexusEngine kit: ${kit.id}`);
    seen.add(kit.id);
  }
}

export function createHorrorCorridorCoreManifest(development: boolean): HorrorCorridorCoreManifest {
  const shipping: NexusRuntimeKit[] = [
    createRealtimeCoreKit(),
    createSequenceCoreKit(),
    createCoreStartupKit(),
    createCorePlatformKit(),
    createCoreCompositionKit(),
    createCoreDataKit(),
    createCoreTransactionLedgerKit(),
    createCorePersistenceKit(),
    createCoreAssetsKit(),
    createCoreWorldDomain(),
    createCoreSceneKit(),
    createCoreSpatialKit(),
    createCorePhysicsKit(),
    createCoreObjectKit(),
    createCoreObjectShapeKit(),
    createCoreObjectFidelityKit(),
    createCoreVegetationKit(),
    createCoreSkyboxKit(),
    createCoreCreatureKit(),
    createCoreCharacterKit(),
    createCorePlayerKit(),
    createCoreInputKit(),
    createCoreMotionKit(),
    createCoreInteractionKit(),
    createCoreSimulationKit({ resolution: true }),
    createCoreCameraKit(),
    createCoreAnimationKit(),
    createCoreAudioKit(),
    createCoreGraphicsKit(),
    createCorePresentationKit(),
    createCorePresentationOutputKit(),
    createCoreUIScaleKit(),
    createCoreCameraFramingKit(),
    createCoreUIKit(),
    createCoreNetworkKit(),
    createCoreDiagnosticsKit(),
  ];
  if (shipping.length !== SHIPPING_CORE_KIT_COUNT) {
    throw new Error(`Shipping core manifest resolved ${shipping.length}; expected ${SHIPPING_CORE_KIT_COUNT}.`);
  }

  const coreKits = development ? [...shipping, createCoreDebugKit(), createCoreCaptureKit()] : shipping;
  if (coreKits.length !== (development ? DEVELOPMENT_CORE_KIT_COUNT : SHIPPING_CORE_KIT_COUNT)) {
    throw new Error("Development core manifest count drifted.");
  }

  const corridorGenerationKits = [
    createProceduralKit({ seed: 0x48435632, width: 18, height: 28 }),
    createNavMeshKit(),
    createPathfindingKit(),
    createRouteFieldKit(),
  ];
  assertUniqueKitIds([...coreKits, ...corridorGenerationKits]);

  return Object.freeze({
    coreKits,
    corridorGenerationKits,
    coreKitIds: coreKits.map((kit) => kit.id),
  });
}
