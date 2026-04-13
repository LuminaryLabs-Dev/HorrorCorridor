"use client";

import { useEffect, useRef, useState } from "react";
import type { PerspectiveCamera, WebGLRenderer } from "three";

import { CUBE_COLORS } from "@/lib/colors";
import { CELL_SIZE, GRID_SIZE, NETWORK_TICK_RATE } from "@/lib/constants";
import { useRuntimeStore } from "@/features/game-state/store/runtimeStore";
import { useSessionStore } from "@/features/game-state/store/sessionStore";
import { useUiStore } from "@/features/game-state/store/uiStore";
import {
  clearRuntimeDebug,
  initializeRuntimeDebug,
  recordRuntimeDebugEvent,
  recordRuntimeDebugFrame,
  useRuntimeDebugStore,
  type RuntimeDebugFrameMode,
} from "@/features/debug/store/runtimeDebugStore";

import { advanceOozeTrail } from "@/features/game-state/domain/oozeRules";
import {
  buildReplicatedSnapshot,
  createFullSyncMessage,
  createInteractionRequestMessage,
  createPlayerUpdateMessage,
} from "@/features/networking/protocol/syncSnapshot";
import { PROTOCOL_MESSAGE_TYPES } from "@/features/networking/protocol/messageTypes";
import type { ClientTransportAdapter, HostTransportAdapter } from "@/features/networking/peer/peerTypes";
import { buildPathsFromEndToCubeSpawns, cellKey } from "@/features/maze/domain/mazePathing";
import {
  applyNetworkInteractionRequest,
  applyNetworkPlayerUpdate,
  syncHeldCubesToPlayers,
} from "@/features/game-state/domain/networkRules";
import { validateOrderedSequenceCompletion } from "@/features/game-state/domain/winRules";
import type {
  MazeCube,
  MazeCubeColorHex,
  MazeCubeColorName,
  MazeResult,
  MazeTargetSequence,
} from "@/features/maze/domain/mazeTypes";
import type { GameCellLookup, GameState } from "@/features/game-state/domain/gameTypes";
import type { ReplicatedGameSnapshot, WorldPosition } from "@/types/shared";

import { applyPlayerLookDelta, createPlayerViewAngles } from "@/features/player/domain/cameraLook";
import { resolveMazeCollision } from "@/features/player/domain/collision";
import {
  accumulatePlayerLookDelta,
  clearPlayerLookDelta,
  createPlayerInputState,
  keyboardCodeToPlayerInputButton,
  setPlayerInputButton,
  setPlayerPointerLocked,
  toPlayerInputSnapshot,
} from "@/features/player/domain/input";
import {
  advancePlayerMovement,
  PLAYER_EYE_HEIGHT,
  type PlayerPose,
} from "@/features/player/domain/movement";

import { createAnimationLoop } from "@/features/render/three/animationLoop";
import { createCamera } from "@/features/render/three/createCamera";
import { createRenderer } from "@/features/render/three/createRenderer";
import { createScene } from "@/features/render/three/createScene";
import { buildMazeWorld } from "@/features/render/three/worldBuilder";
import { MINIMAP_CANVAS_ID, drawMinimapFrame } from "@/components/hud/Minimap";

import PointerLockGate from "./PointerLockGate";

const MAX_PIXEL_RATIO = 1;
const UI_SYNC_INTERVAL_MS = 100;
const CADENCE_WINDOW_MS = 1000;
const cubeHexByName = new Map<MazeCubeColorName, MazeCubeColorHex>(
  CUBE_COLORS.map((color) => [color.name, color.hex] as const),
);

const resizeRenderer = (
  renderer: WebGLRenderer,
  camera: PerspectiveCamera,
  mount: HTMLDivElement,
): void => {
  const width = mount.clientWidth;
  const height = mount.clientHeight;

  if (width <= 0 || height <= 0) {
    return;
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
};

const syncCameraFromPlayer = (
  camera: PerspectiveCamera,
  position: Readonly<{ x: number; y: number; z: number }>,
  viewAngles: Readonly<{ yaw: number; pitch: number }>,
): void => {
  camera.rotation.order = "YXZ";
  camera.position.set(position.x, position.y, position.z);
  camera.rotation.y = viewAngles.yaw;
  camera.rotation.x = viewAngles.pitch;
};

const mazeCellToWorld = (x: number, y: number): Readonly<{ x: number; y: number; z: number }> => ({
  x: x * CELL_SIZE + CELL_SIZE / 2,
  y: PLAYER_EYE_HEIGHT,
  z: y * CELL_SIZE + CELL_SIZE / 2,
});

const zeroWorldVelocity = (): WorldPosition => ({
  x: 0,
  y: 0,
  z: 0,
});

type RuntimeCadenceState = {
  lastNetworkTickAtMs: number;
  lastUiSyncAtMs: number;
  cadenceWindowStartedAtMs: number;
  publishesThisWindow: number;
  clientUpdatesThisWindow: number;
  uiSyncsThisWindow: number;
  publishesPerSecond: number;
  clientUpdatesPerSecond: number;
  uiSyncsPerSecond: number;
};

const createRuntimeDebugFrameRecord = (input: Readonly<{
  frameNumber: number;
  deltaMs: number;
  elapsedMs: number;
  recordedAtMs: number;
  mode: RuntimeDebugFrameMode;
  screen: ReplicatedGameSnapshot["appState"];
  pointerLocked: boolean;
  roomId: string | null;
  localPlayerId: string | null;
  snapshot: ReplicatedGameSnapshot | null;
  pose: PlayerPose;
  viewAngles: Readonly<{ yaw: number; pitch: number }>;
  inputSnapshot: ReturnType<typeof toPlayerInputSnapshot>;
  cadence: RuntimeCadenceState;
}>): Parameters<typeof recordRuntimeDebugFrame>[0] => {
  const localSnapshotPlayer =
    input.snapshot?.players.find((player) => player.id === input.localPlayerId) ?? null;
  const cubeStates = {
    ground: input.snapshot?.cubes.filter((cube) => cube.state === "ground").length ?? 0,
    held: input.snapshot?.cubes.filter((cube) => cube.state === "held").length ?? 0,
    placed: input.snapshot?.cubes.filter((cube) => cube.state === "placed").length ?? 0,
  };

  return {
    frameNumber: input.frameNumber,
    deltaMs: input.deltaMs,
    elapsedMs: input.elapsedMs,
    recordedAtMs: input.recordedAtMs,
    mode: input.mode,
    screen: input.screen,
    pointerLocked: input.pointerLocked,
    roomId: input.roomId,
    localPlayerId: input.localPlayerId,
    localPose: {
      position: input.pose.position,
      rotationY: input.viewAngles.yaw,
      pitch: input.viewAngles.pitch,
      velocity: input.pose.velocity,
      carryingCubeId: input.pose.carryingCubeId,
    },
    input: input.inputSnapshot,
    snapshot: {
      tick: input.snapshot?.tick ?? null,
      timestampMs: input.snapshot?.timestampMs ?? null,
      appState: input.snapshot?.appState ?? null,
      gameState: input.snapshot?.gameState ?? null,
      playerCount: input.snapshot?.players.length ?? 0,
      cubeCount: input.snapshot?.cubes.length ?? 0,
      oozeCount: input.snapshot?.oozeTrail.length ?? 0,
      slotsFilled: input.snapshot?.anomaly.slots.filter((slot) => slot !== null).length ?? 0,
      cubeStates,
      localPlayer: localSnapshotPlayer
        ? {
            id: localSnapshotPlayer.id,
            color: localSnapshotPlayer.color,
            position: localSnapshotPlayer.position,
            rotationY: localSnapshotPlayer.rotationY,
            pitch: localSnapshotPlayer.pitch,
          }
        : null,
    },
    cubes:
      input.snapshot?.cubes.map((cube) => ({
        id: cube.id,
        color: cube.color,
        state: cube.state,
        ownerId: cube.ownerId,
        position: cube.position,
      })) ?? [],
    anomaly: input.snapshot
      ? {
          sequence: [...input.snapshot.anomaly.sequence],
          slots: [...input.snapshot.anomaly.slots],
        }
      : {
          sequence: [],
          slots: [],
        },
    cadence: {
      networkTickAgeMs: Math.max(0, input.recordedAtMs - input.cadence.lastNetworkTickAtMs),
      authoritativePublishesPerSecond: input.cadence.publishesPerSecond,
      clientUpdatesPerSecond: input.cadence.clientUpdatesPerSecond,
      uiSyncsPerSecond: input.cadence.uiSyncsPerSecond,
    },
  };
};

type GameCanvasProps = Readonly<{
  transport: HostTransportAdapter | ClientTransportAdapter | null;
}>;

const buildMazeResultFromSnapshot = (snapshot: ReplicatedGameSnapshot): MazeResult => {
  const grid = Array.from({ length: GRID_SIZE }, () =>
    Array.from({ length: GRID_SIZE }, () => 0 as 0 | 1 | 2 | 3 | 4),
  );

  let start = { x: 0, y: 0 };
  let end = { x: 0, y: 0 };

  for (const cell of snapshot.maze) {
    const value = cell.value;
    grid[cell.grid.y][cell.grid.x] = value;

    if (value === 3) {
      start = { x: cell.grid.x, y: cell.grid.y };
    } else if (value === 4) {
      end = { x: cell.grid.x, y: cell.grid.y };
    }
  }

  const cubes: readonly MazeCube[] = snapshot.cubes.map((cube) => ({
    id: cube.id,
    colorName: cube.color,
    colorHex: cubeHexByName.get(cube.color) ?? CUBE_COLORS[0].hex,
    x: cube.position.x,
    z: cube.position.z,
    state: "ground",
    ownerId: null,
  }));

  const targetSequence = [...snapshot.anomaly.sequence] as MazeTargetSequence;

  const paths = buildPathsFromEndToCubeSpawns({
    grid,
    end,
    cubes,
    cellSize: CELL_SIZE,
  });

  return {
    grid,
    start,
    end,
    cubes,
    targetSequence,
    paths,
  };
};

const buildGameStateFromSnapshot = (
  snapshot: ReplicatedGameSnapshot,
): GameState => {
  const mazeLookup = Object.fromEntries(
    snapshot.maze.map((cell) => [cellKey(cell.grid), cell] as const),
  ) as GameCellLookup;
  const exitCell =
    snapshot.maze.find((cell) => cell.value === 4)?.grid ?? { x: 0, y: 0 };
  const playerNames = new Map(snapshot.room.players.map((player) => [player.id, player.name] as const));
  const slotIdByCubeId = new Map(
    snapshot.anomaly.slots.flatMap((cubeId, index) =>
      cubeId ? ([[cubeId, `slot-${index}`]] as const) : [],
    ),
  );

  const baseState = {
    gameId: snapshot.gameId,
    seed: snapshot.seed,
    room: snapshot.room,
    appState: snapshot.appState,
    gameState: snapshot.gameState,
    tick: snapshot.tick,
    timestampMs: snapshot.timestampMs,
    maze: snapshot.maze,
    oozeLevel: snapshot.oozeLevel,
    players: snapshot.players.map((player) => ({
      ...player,
      name: playerNames.get(player.id) ?? "Player",
      velocity: zeroWorldVelocity(),
    })),
    cubes: snapshot.cubes.map((cube) => ({
      id: cube.id,
      color: cube.color,
      cell:
        cube.state === "ground"
          ? {
              x: Math.floor(cube.position.x / CELL_SIZE),
              y: Math.floor(cube.position.z / CELL_SIZE),
            }
          : null,
      position: cube.position,
      visible: cube.state !== "held",
      active: cube.state === "ground",
      locked: cube.state === "placed",
      highlighted: false,
      heldByPlayerId: cube.state === "held" ? cube.ownerId : null,
      assignedSlotId: slotIdByCubeId.get(cube.id) ?? null,
    })),
    sequenceSlots: snapshot.anomaly.sequence.map((color, index) => ({
      id: `slot-${index}`,
      index,
      requiredColor: color,
      occupiedCubeId: snapshot.anomaly.slots[index] ?? null,
      isUnlocked: index === 0,
      isSolved: false,
    })),
    mazeLookup,
    endAnomalyCellId: cellKey(exitCell),
    oozeTrail: snapshot.oozeTrail,
    lastOozeDecayTime: snapshot.timestampMs,
  } satisfies GameState;

  return validateOrderedSequenceCompletion(baseState);
};

const buildPlayerPoseFromSnapshot = (
  player: ReplicatedGameSnapshot["players"][number] | undefined,
  fallbackPosition: WorldPosition,
): PlayerPose => ({
  position: player
    ? {
        x: player.position.x,
        y: player.position.y,
        z: player.position.z,
      }
    : fallbackPosition,
  rotationY: player?.rotationY ?? 0,
  velocity: zeroWorldVelocity(),
  carryingCubeId: null,
});

export default function GameCanvas({ transport }: GameCanvasProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [isPointerLocked, setIsPointerLocked] = useState(false);

  const setScreen = useUiStore((state) => state.setScreen);
  const setPaused = useUiStore((state) => state.setPaused);
  const setCompletion = useUiStore((state) => state.setCompletion);
  const toggleSettingsOverlay = useUiStore((state) => state.toggleSettingsOverlay);

  const setLocalPlayerPose = useRuntimeStore((state) => state.setLocalPlayerPose);
  const setViewAngles = useRuntimeStore((state) => state.setViewAngles);
  const setInputFlags = useRuntimeStore((state) => state.setInputFlags);
  const patchReadiness = useRuntimeStore((state) => state.patchReadiness);
  const setAuthoritativeSnapshot = useRuntimeStore((state) => state.setAuthoritativeSnapshot);

  useEffect(() => {
    const mount = mountRef.current;

    if (!mount) {
      return undefined;
    }

    let cleanupRuntime = (): void => {};
    let initialized = false;
    let unsubscribe: (() => void) | null = null;

    const initializeRuntime = (snapshot: ReplicatedGameSnapshot): void => {
      if (initialized) {
        return;
      }

      initialized = true;
      initializeRuntimeDebug();
      clearRuntimeDebug();

      const maze = buildMazeResultFromSnapshot(snapshot);
      const renderer = createRenderer({
        pixelRatio: Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO),
      });
      const scene = createScene();
      const camera = createCamera({
        aspect: mount.clientWidth > 0 && mount.clientHeight > 0 ? mount.clientWidth / mount.clientHeight : 1,
      });
      const world = buildMazeWorld(maze);
      const pointerLockTarget = mount;
      const session = useSessionStore.getState();
      const isHostSession = session.sessionMode === "host";
      const isHostTransport = transport?.role === "host";
      const isClientTransport = transport?.role === "client";
      const localPlayerId =
        session.peerIdentity.playerId ?? snapshot.room.hostId ?? snapshot.players[0]?.id ?? "local-player";
      const localPlayerSnapshot =
        snapshot.players.find((player) => player.id === localPlayerId) ?? snapshot.players[0];
      const fallbackStart = mazeCellToWorld(maze.start.x, maze.start.y);
      const localPose = buildPlayerPoseFromSnapshot(localPlayerSnapshot, fallbackStart);
      const localViewAngles = createPlayerViewAngles(
        localPose.rotationY,
        localPlayerSnapshot?.pitch ?? 0,
        Date.now(),
      );
      const inputState = createPlayerInputState();
      const poseRef = { current: localPose };
      const viewAnglesRef = { current: localViewAngles };
      const inputRef = { current: inputState };
      const pointerLockedRef = { current: false };
      const minimapCanvasRef = { current: null as HTMLCanvasElement | null };
      const nowMs = () => Date.now();
      const frameCadence: RuntimeCadenceState = {
        lastNetworkTickAtMs: nowMs(),
        lastUiSyncAtMs: 0,
        cadenceWindowStartedAtMs: nowMs(),
        publishesThisWindow: 0,
        clientUpdatesThisWindow: 0,
        uiSyncsThisWindow: 0,
        publishesPerSecond: 0,
        clientUpdatesPerSecond: 0,
        uiSyncsPerSecond: 0,
      };
      let networkUpdateSequence = 0;
      let debugFrameNumber = 0;
      const startingGameState = buildGameStateFromSnapshot(snapshot);
      let currentGameState = startingGameState;
      let latestHostSnapshot: ReplicatedGameSnapshot | null = snapshot;

      recordRuntimeDebugEvent({
        kind: "runtime",
        message: "Initialized maze runtime session",
        payload: {
          roomId: snapshot.room.roomId,
          localPlayerId,
          mode: transport?.role ?? "local",
          players: snapshot.players.length,
          cubes: snapshot.cubes.length,
        },
      });

      const getReferenceGameState = (): GameState => {
        const latestSnapshot = useRuntimeStore.getState().authoritativeSnapshot;

        return latestSnapshot ? buildGameStateFromSnapshot(latestSnapshot) : currentGameState;
      };

      const syncLocalCarryStateFromGameState = (gameState: GameState = currentGameState): void => {
        const carriedCubeId =
          gameState.cubes.find((cube) => cube.heldByPlayerId === localPlayerId)?.id ?? null;

        poseRef.current = {
          ...poseRef.current,
          carryingCubeId: carriedCubeId,
        };
      };

      const syncLocalCarryStateFromSnapshot = (
        snapshotState: ReplicatedGameSnapshot | null,
      ): void => {
        const carriedCubeId =
          snapshotState?.cubes.find(
            (cube) => cube.state === "held" && cube.ownerId === localPlayerId,
          )?.id ?? null;

        poseRef.current = {
          ...poseRef.current,
          carryingCubeId: carriedCubeId,
        };
      };

      const updateCadenceWindow = (recordedAtMs: number): void => {
        if (recordedAtMs - frameCadence.cadenceWindowStartedAtMs < CADENCE_WINDOW_MS) {
          return;
        }

        frameCadence.publishesPerSecond = frameCadence.publishesThisWindow;
        frameCadence.clientUpdatesPerSecond = frameCadence.clientUpdatesThisWindow;
        frameCadence.uiSyncsPerSecond = frameCadence.uiSyncsThisWindow;
        frameCadence.publishesThisWindow = 0;
        frameCadence.clientUpdatesThisWindow = 0;
        frameCadence.uiSyncsThisWindow = 0;
        frameCadence.cadenceWindowStartedAtMs = recordedAtMs;
      };

      const syncRuntimeStores = (recordedAtMs: number, force = false): void => {
        if (!force && recordedAtMs - frameCadence.lastUiSyncAtMs < UI_SYNC_INTERVAL_MS) {
          return;
        }

        frameCadence.lastUiSyncAtMs = recordedAtMs;
        frameCadence.uiSyncsThisWindow += 1;
        setLocalPlayerPose(poseRef.current);
        setViewAngles(viewAnglesRef.current);
        setInputFlags(toPlayerInputSnapshot(inputRef.current));
      };

      const publishAuthoritativeState = (
        reason: "initial" | "join" | "resync" | "reconnect" | "recovery" = "resync",
        publishedAtMs = nowMs(),
      ): ReplicatedGameSnapshot => {
        currentGameState = {
          ...currentGameState,
          room: {
            ...currentGameState.room,
            phase: "active",
            updatedAt: publishedAtMs,
          },
          appState: useUiStore.getState().screen,
          gameState: currentGameState.gameState,
          tick: currentGameState.tick + 1,
          timestampMs: publishedAtMs,
        };
        const nextSnapshot = buildReplicatedSnapshot(currentGameState);
        latestHostSnapshot = nextSnapshot;
        setAuthoritativeSnapshot(nextSnapshot);
        frameCadence.lastNetworkTickAtMs = publishedAtMs;
        frameCadence.publishesThisWindow += 1;
        recordRuntimeDebugEvent({
          kind: "sync",
          message: `Published authoritative snapshot (${reason})`,
          payload: {
            reason,
            tick: nextSnapshot.tick,
            gameState: nextSnapshot.gameState,
          },
        });

        if (isHostTransport) {
          transport?.broadcast(
            createFullSyncMessage({
              senderId: localPlayerId,
              roomId: currentGameState.room.roomId,
              state: currentGameState,
              reason,
              timestampMs: publishedAtMs,
            }),
          );
        }

        return nextSnapshot;
      };

      const stepLocalPose = (
        deltaMs: number,
      ): Readonly<{
        nextViewAngles: ReturnType<typeof createPlayerViewAngles>;
        resolvedPose: PlayerPose;
      }> => {
        const nextViewAngles = applyPlayerLookDelta(
          viewAnglesRef.current,
          inputRef.current.lookDeltaX,
          inputRef.current.lookDeltaY,
          nowMs(),
        );
        const nextMovement = advancePlayerMovement(
          poseRef.current,
          inputRef.current,
          nextViewAngles,
          deltaMs,
        );
        const collision = resolveMazeCollision(
          poseRef.current.position,
          nextMovement.pose.position,
          maze.grid,
        );

        return {
          nextViewAngles,
          resolvedPose: {
            ...nextMovement.pose,
            position: collision.position,
            velocity: {
              x: collision.blockedX ? 0 : nextMovement.pose.velocity.x,
              y: nextMovement.pose.velocity.y,
              z: collision.blockedZ ? 0 : nextMovement.pose.velocity.z,
            },
          },
        };
      };

      const sendPlayerUpdate = (): void => {
        if (!isClientTransport || !transport || !transport.send) {
          return;
        }

        const inputSnapshot = toPlayerInputSnapshot(inputRef.current);

        transport.send(
          createPlayerUpdateMessage({
            senderId: localPlayerId,
            roomId: currentGameState.room.roomId,
            playerId: localPlayerId,
            input: {
              sequence: networkUpdateSequence += 1,
              moveForward: inputSnapshot.moveForward,
              moveStrafe: inputSnapshot.moveStrafe,
              lookYaw: viewAnglesRef.current.yaw,
              interact: inputSnapshot.interact,
            },
            pose: {
              position: poseRef.current.position,
              rotationY: viewAnglesRef.current.yaw,
              pitch: viewAnglesRef.current.pitch,
              velocity: poseRef.current.velocity,
            },
          }),
        );
        frameCadence.lastNetworkTickAtMs = nowMs();
        frameCadence.clientUpdatesThisWindow += 1;
      };

      const sendInteractionRequest = (): void => {
        if (!isClientTransport || !transport || !transport.send) {
          return;
        }

        const referenceState = getReferenceGameState();
        const endCell = mazeCellToWorld(maze.end.x, maze.end.y);
        const distanceToEnd = Math.hypot(
          poseRef.current.position.x - endCell.x,
          poseRef.current.position.z - endCell.z,
        );
        const hasCarriedCube = referenceState.cubes.some(
          (cube) => cube.heldByPlayerId === localPlayerId,
        );

        const action =
          distanceToEnd < 6
            ? hasCarriedCube
              ? "place-cube-at-anomaly"
              : "remove-cube-from-anomaly"
            : hasCarriedCube
              ? "drop-cube"
              : "pickup-cube";

        transport.send(
          createInteractionRequestMessage({
            senderId: localPlayerId,
            roomId: currentGameState.room.roomId,
            playerId: localPlayerId,
            action,
          }),
        );
      };

      const commitVictory = (): void => {
        setCompletion({
          status: "victory",
          message: "The corridor accepted the run.",
          atMs: nowMs(),
        });
        setScreen("COMPLETED");
        setPaused(false, "none");
        releasePointerLock();
      };

      let unsubscribeTransport: (() => void) | null = null;

      if (transport) {
        unsubscribeTransport = transport.onEvent((event) => {
          if (event.type !== "peer/message" || event.role !== "host") {
            return;
          }

          if (event.message.type === PROTOCOL_MESSAGE_TYPES.PLAYER_UPDATE) {
            recordRuntimeDebugEvent({
              kind: "network",
              message: "Received player update on host",
              payload: {
                playerId: event.message.payload.playerId,
                requestId: event.message.requestId ?? null,
              },
          });
            currentGameState = applyNetworkPlayerUpdate(currentGameState, {
              playerId: event.message.payload.playerId,
              position: event.message.payload.pose.position,
              rotationY: event.message.payload.pose.rotationY,
              pitch: event.message.payload.pose.pitch,
              velocity: event.message.payload.pose.velocity,
            });
            syncLocalCarryStateFromGameState(currentGameState);
            publishAuthoritativeState("resync");
            return;
          }

          if (event.message.type === PROTOCOL_MESSAGE_TYPES.TRY_INTERACT) {
            recordRuntimeDebugEvent({
              kind: "network",
              message: "Received interaction request on host",
              payload: {
                playerId: event.message.payload.playerId,
                action: event.message.payload.action,
              },
            });
            currentGameState = applyNetworkInteractionRequest(currentGameState, {
              playerId: event.message.payload.playerId,
              action: event.message.payload.action,
              cubeId: event.message.payload.cubeId,
              slotId: event.message.payload.slotId,
            });
            currentGameState = syncHeldCubesToPlayers(currentGameState);
            syncLocalCarryStateFromGameState(currentGameState);
            publishAuthoritativeState(event.message.payload.action === "request-sync" ? "recovery" : "resync");

            if (currentGameState.gameState === "victory") {
              commitVictory();
            }
          }
        });
      }

      const releasePointerLock = (): void => {
        if (document.pointerLockElement) {
          document.exitPointerLock();
        }
      };

      const applyInteraction = (): void => {
        if (currentGameState.gameState !== "playing") {
          return;
        }

        const referenceState = getReferenceGameState();
        const endCell = mazeCellToWorld(maze.end.x, maze.end.y);
        const distanceToEnd = Math.hypot(
          poseRef.current.position.x - endCell.x,
          poseRef.current.position.z - endCell.z,
        );
        const hasCarriedCube = referenceState.cubes.some(
          (cube) => cube.heldByPlayerId === localPlayerId,
        );

        const action =
          distanceToEnd < 6
            ? hasCarriedCube
              ? "place-cube-at-anomaly"
              : "remove-cube-from-anomaly"
            : hasCarriedCube
              ? "drop-cube"
              : "pickup-cube";

        recordRuntimeDebugEvent({
          kind: "interaction",
          message: "Local interaction requested",
          payload: {
            action,
            distanceToEnd: Number(distanceToEnd.toFixed(2)),
            host: isHostSession,
          },
        });

        if (isHostSession) {
          const nextState = applyNetworkInteractionRequest(currentGameState, {
            playerId: localPlayerId,
            action,
          });

          if (nextState === currentGameState) {
            return;
          }

          currentGameState = syncHeldCubesToPlayers(nextState);
          syncLocalCarryStateFromGameState(currentGameState);
          publishAuthoritativeState("resync");

          if (currentGameState.gameState === "victory") {
            commitVictory();
          }

          return;
        }

        sendInteractionRequest();
      };

      const syncPointerLockState = (): void => {
        const locked = document.pointerLockElement === pointerLockTarget;

        if (pointerLockedRef.current === locked) {
          return;
        }

        pointerLockedRef.current = locked;
        inputRef.current = setPlayerPointerLocked(inputRef.current, locked);
        setIsPointerLocked(locked);
        setInputFlags(toPlayerInputSnapshot(inputRef.current));
        recordRuntimeDebugEvent({
          kind: "pointer-lock",
          message: locked ? "Pointer lock engaged" : "Pointer lock released",
          payload: {
            locked,
            screen: useUiStore.getState().screen,
          },
        });

        if (!locked && useUiStore.getState().screen === "PLAYING") {
          setPaused(true, "system");
          setScreen("PAUSED");
        }
      };

      const onKeyDown = (event: KeyboardEvent): void => {
        if (event.code === "Backquote") {
          initializeRuntimeDebug();
          const debugStore = useRuntimeDebugStore.getState();
          const nextVisible = !debugStore.overlayVisible;

          debugStore.setEnabled(true);
          debugStore.setOverlayVisible(nextVisible);
          recordRuntimeDebugEvent({
            kind: "debug",
            message: nextVisible ? "Frame debug overlay shown" : "Frame debug overlay hidden",
            payload: {
              overlayVisible: nextVisible,
            },
          });
          return;
        }

        const button = keyboardCodeToPlayerInputButton(event.code);

        if (!button || event.repeat) {
          return;
        }

        if (button === "pause") {
          const uiState = useUiStore.getState();

          if (uiState.screen === "PLAYING") {
            setPaused(true, "manual");
            setScreen("PAUSED");
            releasePointerLock();
          } else if (uiState.screen === "PAUSED") {
            setPaused(false, "none");
            setScreen("PLAYING");
          }
        }

        if (button === "interact") {
          applyInteraction();
        }

        if (event.code === "KeyQ") {
          toggleSettingsOverlay();
          return;
        }

        inputRef.current = setPlayerInputButton(inputRef.current, button, true);
        syncRuntimeStores(nowMs(), true);
      };

      const onKeyUp = (event: KeyboardEvent): void => {
        const button = keyboardCodeToPlayerInputButton(event.code);

        if (!button) {
          return;
        }

        inputRef.current = setPlayerInputButton(inputRef.current, button, false);
        syncRuntimeStores(nowMs(), true);
      };

      const onMouseMove = (event: MouseEvent): void => {
        if (!pointerLockedRef.current) {
          return;
        }

        const movementX = event.movementX || 0;
        const movementY = event.movementY || 0;

        if (movementX === 0 && movementY === 0) {
          return;
        }

        inputRef.current = accumulatePlayerLookDelta(inputRef.current, movementX, movementY);
      };

      const onBlur = (): void => {
        if (pointerLockedRef.current) {
          releasePointerLock();
        }
      };

      const onPointerLockChange = (): void => {
        syncPointerLockState();
      };

      const resizeObserver =
        typeof ResizeObserver !== "undefined"
          ? new ResizeObserver(() => resizeRenderer(renderer, camera, mount))
          : null;

      const onResize = (): void => {
        resizeRenderer(renderer, camera, mount);
      };

      mount.appendChild(renderer.domElement);
      world.attach(scene);

      setLocalPlayerPose(poseRef.current);
      setViewAngles(viewAnglesRef.current);
      setInputFlags(toPlayerInputSnapshot(inputRef.current));
      setAuthoritativeSnapshot(latestHostSnapshot);
      patchReadiness({
        simulation: isHostSession || isClientTransport,
        rendering: true,
        networking: true,
        input: true,
      });
      setPaused(false, "none");

      resizeObserver?.observe(mount);
      window.addEventListener("resize", onResize);
      document.addEventListener("pointerlockchange", onPointerLockChange);
      window.addEventListener("keydown", onKeyDown);
      window.addEventListener("keyup", onKeyUp);
      document.addEventListener("mousemove", onMouseMove);
      window.addEventListener("blur", onBlur);
      onResize();

      const loop = createAnimationLoop((deltaMs, elapsedMs) => {
        const recordedAtMs = nowMs();
        const uiState = useUiStore.getState();
        const debugEnabled = useRuntimeDebugStore.getState().enabled;
        updateCadenceWindow(recordedAtMs);

        const captureFrame = (
          mode: RuntimeDebugFrameMode,
          snapshotForFrame: ReplicatedGameSnapshot | null,
        ): void => {
          if (!debugEnabled) {
            return;
          }

          debugFrameNumber += 1;
          recordRuntimeDebugFrame(
            createRuntimeDebugFrameRecord({
              frameNumber: debugFrameNumber,
              deltaMs,
              elapsedMs,
              recordedAtMs,
              mode,
              screen: uiState.screen,
              pointerLocked: pointerLockedRef.current,
              roomId: currentGameState.room.roomId,
              localPlayerId,
              snapshot: snapshotForFrame,
              pose: poseRef.current,
              viewAngles: viewAnglesRef.current,
              inputSnapshot: toPlayerInputSnapshot(inputRef.current),
              cadence: frameCadence,
            }),
          );
        };

        const renderFrame = (
          mode: RuntimeDebugFrameMode,
          snapshotForFrame: ReplicatedGameSnapshot | null,
        ): void => {
          syncCameraFromPlayer(camera, poseRef.current.position, viewAnglesRef.current);
          world.update(elapsedMs, {
            snapshot: snapshotForFrame,
            localPlayerId,
            localPlayerPosition: poseRef.current.position,
          });
          minimapCanvasRef.current ??= document.getElementById(MINIMAP_CANVAS_ID) as HTMLCanvasElement | null;
          drawMinimapFrame({
            canvas: minimapCanvasRef.current,
            snapshot: snapshotForFrame,
            localPlayerId,
            localPosition: poseRef.current.position,
            yaw: viewAnglesRef.current.yaw,
          });
          captureFrame(mode, snapshotForFrame);
          renderer.render(scene, camera);
        };

        if ((uiState.screen === "PAUSED" || uiState.screen === "COMPLETED") && pointerLockedRef.current) {
          releasePointerLock();
        }

        const latestSnapshot = isHostSession
          ? latestHostSnapshot
          : useRuntimeStore.getState().authoritativeSnapshot;
        const shouldAdvanceSimulation = uiState.screen === "PLAYING";

        if (shouldAdvanceSimulation && isHostSession) {
          const { nextViewAngles, resolvedPose } = stepLocalPose(deltaMs);

          poseRef.current = resolvedPose;
          viewAnglesRef.current = nextViewAngles;
          inputRef.current = clearPlayerLookDelta(inputRef.current);

          currentGameState = {
            ...currentGameState,
            appState: uiState.screen,
            gameState: "playing",
          };
          currentGameState = applyNetworkPlayerUpdate(currentGameState, {
            playerId: localPlayerId,
            position: resolvedPose.position,
            rotationY: viewAnglesRef.current.yaw,
            pitch: viewAnglesRef.current.pitch,
            velocity: resolvedPose.velocity,
          });
          currentGameState = syncHeldCubesToPlayers(currentGameState);
          syncLocalCarryStateFromGameState(currentGameState);

          if (recordedAtMs - frameCadence.lastNetworkTickAtMs >= NETWORK_TICK_RATE) {
            currentGameState = advanceOozeTrail(currentGameState, {
              nowMs: recordedAtMs,
              playerPositions: currentGameState.players.map((player) => player.position),
            });
            latestHostSnapshot = publishAuthoritativeState("resync", recordedAtMs);
          }

          syncRuntimeStores(recordedAtMs);
          renderFrame("host-sim", latestHostSnapshot);
          return;
        }

        if (shouldAdvanceSimulation && isClientTransport) {
          const { nextViewAngles, resolvedPose } = stepLocalPose(deltaMs);

          poseRef.current = resolvedPose;
          viewAnglesRef.current = nextViewAngles;
          inputRef.current = clearPlayerLookDelta(inputRef.current);

          if (recordedAtMs - frameCadence.lastNetworkTickAtMs >= NETWORK_TICK_RATE) {
            sendPlayerUpdate();
          }

          syncLocalCarryStateFromSnapshot(latestSnapshot);
          syncRuntimeStores(recordedAtMs);
          renderFrame("client-sim", latestSnapshot);
          return;
        }

        if (latestSnapshot) {
          const latestLocalPlayer = latestSnapshot.players.find((player) => player.id === localPlayerId);

          if (latestLocalPlayer) {
            poseRef.current = {
              ...poseRef.current,
              position: latestLocalPlayer.position,
              rotationY: latestLocalPlayer.rotationY,
            };
            viewAnglesRef.current = createPlayerViewAngles(
              latestLocalPlayer.rotationY,
              latestLocalPlayer.pitch,
              viewAnglesRef.current.lastPitchInputAtMs,
            );
          }

          syncLocalCarryStateFromSnapshot(latestSnapshot);
          syncRuntimeStores(recordedAtMs);
          renderFrame("snapshot-replay", latestSnapshot);
          return;
        }

        syncRuntimeStores(recordedAtMs);
        renderFrame("idle", null);
      });

      loop.start();

      cleanupRuntime = (): void => {
        loop.stop();
        unsubscribeTransport?.();
        resizeObserver?.disconnect();
        window.removeEventListener("resize", onResize);
        document.removeEventListener("pointerlockchange", onPointerLockChange);
        window.removeEventListener("keydown", onKeyDown);
        window.removeEventListener("keyup", onKeyUp);
        document.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("blur", onBlur);
        world.dispose();
        renderer.dispose();

        if (mount.contains(renderer.domElement)) {
          mount.removeChild(renderer.domElement);
        }

        patchReadiness({
          simulation: false,
          rendering: false,
          networking: true,
          input: false,
        });
      };
    };

    const currentSnapshot = useRuntimeStore.getState().authoritativeSnapshot;

    if (currentSnapshot) {
      initializeRuntime(currentSnapshot);
    }

    if (!initialized) {
      unsubscribe = useRuntimeStore.subscribe((state, previousState) => {
        if (
          !initialized &&
          state.authoritativeSnapshot !== null &&
          state.authoritativeSnapshot !== previousState.authoritativeSnapshot
        ) {
          initializeRuntime(state.authoritativeSnapshot);
        }
      });
    }

    return () => {
      unsubscribe?.();
      cleanupRuntime();
    };
  }, [patchReadiness, setAuthoritativeSnapshot, setCompletion, setInputFlags, setLocalPlayerPose, setPaused, setScreen, setViewAngles, toggleSettingsOverlay, transport]);

  return (
    <PointerLockGate
      title="Maze runtime"
      description="A real maze world is active here. Move with WASD or arrow keys immediately, or capture the mouse to look around."
      isLocked={isPointerLocked}
      onCapture={() => {
        mountRef.current?.requestPointerLock();
      }}
      onRelease={() => {
        document.exitPointerLock();
      }}
    >
      <div ref={mountRef} className="absolute inset-0 h-full w-full" />
    </PointerLockGate>
  );
}
