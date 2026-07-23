declare module "nexusengine" {
  export type NexusRuntimeKit = Readonly<{
    id: string;
    provides?: readonly string[];
    requires?: readonly string[];
    bindings?: Readonly<Record<string, unknown>>;
    metadata?: Readonly<Record<string, any>>;
    [key: string]: unknown;
  }>;

  export type NexusEngine = {
    kits: readonly NexusRuntimeKit[];
    tick: (deltaSeconds?: number) => unknown;
    step: (deltaSeconds?: number) => unknown;
    n: Record<string, any>;
    gameComposer?: NexusGameKitComposer;
    game?: Readonly<{ installOrder: readonly string[]; bindings: Readonly<Record<string, unknown>> }>;
    dispose?: () => void;
    [key: string]: any;
  };

  export type NexusGameKitComposer = Readonly<{
    kits: readonly NexusRuntimeKit[];
    orderedKits: readonly NexusRuntimeKit[];
    installOrder: readonly string[];
    provides: readonly string[];
    bindings: Readonly<Record<string, unknown>>;
    getBinding: (name: string) => unknown;
    hasProvider: (name: string) => boolean;
  }>;

  export type NexusRuntimeKitConfig = Readonly<{
    id: string;
    provides?: readonly string[];
    requires?: readonly string[];
    bindings?: Readonly<Record<string, unknown>>;
    metadata?: Readonly<Record<string, unknown>>;
    install?: (context: Readonly<{ engine: NexusEngine; kit: NexusRuntimeKit; world: unknown; options: unknown }>) => unknown;
    [key: string]: unknown;
  }>;

  export type NexusDomainServiceKitConfig = Omit<NexusRuntimeKitConfig, "id"> & Readonly<{
    id?: string;
    domain: string;
    domainPath?: string;
    parentDomainPath?: string;
    apiPath?: string;
    apiName?: string;
    services?: readonly string[];
    stability: string;
    version: string;
    visibility?: "public" | "internal" | "editor-safe";
    inputs?: readonly string[];
    outputs?: readonly string[];
    createApi?: (context: Readonly<{ engine: NexusEngine; kit: NexusRuntimeKit; world: unknown; options: unknown }>) => unknown;
  }>;

  export function defineRuntimeKit(config: NexusRuntimeKitConfig): NexusRuntimeKit;
  export function defineDomainServiceKit(config: NexusDomainServiceKitConfig): NexusRuntimeKit;
  export function createGameKitComposer(config: Readonly<{ kits: readonly NexusRuntimeKit[]; provides?: readonly string[] }>): NexusGameKitComposer;
  export function createRealtimeGame(config?: Readonly<{
    composer?: NexusGameKitComposer;
    kits?: readonly NexusRuntimeKit[];
    coreKits?: boolean;
    root?: unknown;
    canvas?: unknown;
    [key: string]: unknown;
  }>): NexusEngine;

  export function createRealtimeCoreKit(config?: Record<string, unknown>): NexusRuntimeKit;
  export function createSequenceCoreKit(config?: Record<string, unknown>): NexusRuntimeKit;
  export function createCoreStartupKit(config?: Record<string, unknown>): NexusRuntimeKit;
  export function createCorePlatformKit(config?: Record<string, unknown>): NexusRuntimeKit;
  export function createCoreCompositionKit(config?: Record<string, unknown>): NexusRuntimeKit;
  export function createCoreDataKit(config?: Record<string, unknown>): NexusRuntimeKit;
  export function createCoreTransactionLedgerKit(config?: Record<string, unknown>): NexusRuntimeKit;
  export function createCorePersistenceKit(config?: Record<string, unknown>): NexusRuntimeKit;
  export function createCoreAssetsKit(config?: Record<string, unknown>): NexusRuntimeKit;
  export function createCoreWorldDomain(config?: Record<string, unknown>): NexusRuntimeKit;
  export function createCoreSceneKit(config?: Record<string, unknown>): NexusRuntimeKit;
  export function createCoreSpatialKit(config?: Record<string, unknown>): NexusRuntimeKit;
  export function createCorePhysicsKit(config?: Record<string, unknown>): NexusRuntimeKit;
  export function createCoreObjectKit(config?: Record<string, unknown>): NexusRuntimeKit;
  export function createCoreObjectShapeKit(config?: Record<string, unknown>): NexusRuntimeKit;
  export function createCoreObjectFidelityKit(config?: Record<string, unknown>): NexusRuntimeKit;
  export function createCoreVegetationKit(config?: Record<string, unknown>): NexusRuntimeKit;
  export function createCoreSkyboxKit(config?: Record<string, unknown>): NexusRuntimeKit;
  export function createCoreCreatureKit(config?: Record<string, unknown>): NexusRuntimeKit;
  export function createCoreCharacterKit(config?: Record<string, unknown>): NexusRuntimeKit;
  export function createCorePlayerKit(config?: Record<string, unknown>): NexusRuntimeKit;
  export function createCoreInputKit(config?: Record<string, unknown>): NexusRuntimeKit;
  export function createCoreMotionKit(config?: Record<string, unknown>): NexusRuntimeKit;
  export function createCoreInteractionKit(config?: Record<string, unknown>): NexusRuntimeKit;
  export function createCoreSimulationKit(config?: Record<string, unknown>): NexusRuntimeKit;
  export function createCoreCameraKit(config?: Record<string, unknown>): NexusRuntimeKit;
  export function createCoreAnimationKit(config?: Record<string, unknown>): NexusRuntimeKit;
  export function createCoreAudioKit(config?: Record<string, unknown>): NexusRuntimeKit;
  export function createCoreGraphicsKit(config?: Record<string, unknown>): NexusRuntimeKit;
  export function createCorePresentationKit(config?: Record<string, unknown>): NexusRuntimeKit;
  export function createCorePresentationOutputKit(config?: Record<string, unknown>): NexusRuntimeKit;
  export function createCoreUIScaleKit(config?: Record<string, unknown>): NexusRuntimeKit;
  export function createCoreCameraFramingKit(config?: Record<string, unknown>): NexusRuntimeKit;
  export function createCoreUIKit(config?: Record<string, unknown>): NexusRuntimeKit;
  export function createCoreNetworkKit(config?: Record<string, unknown>): NexusRuntimeKit;
  export function createCoreDiagnosticsKit(config?: Record<string, unknown>): NexusRuntimeKit;
  export function createCoreDebugKit(config?: Record<string, unknown>): NexusRuntimeKit;
  export function createCoreCaptureKit(config?: Record<string, unknown>): NexusRuntimeKit;
  export function createProceduralKit(config?: Record<string, unknown>): NexusRuntimeKit;
  export function createNavMeshKit(config?: Record<string, unknown>): NexusRuntimeKit;
  export function createPathfindingKit(config?: Record<string, unknown>): NexusRuntimeKit;
  export function createRouteFieldKit(config?: Record<string, unknown>): NexusRuntimeKit;
}
