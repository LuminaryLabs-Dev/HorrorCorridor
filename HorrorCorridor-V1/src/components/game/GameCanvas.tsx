"use client";

import { useEffect, useRef, useState } from "react";
import type { PerspectiveCamera, WebGLRenderer } from "three";

import { CELL_SIZE, GRID_SIZE } from "@/lib/constants";
import { useRuntimeStore } from "@/features/game-state/store/runtimeStore";
import { useSessionStore } from "@/features/game-state/store/sessionStore";
import { useUiStore } from "@/features/game-state/store/uiStore";

import { advanceOozeTrail } from "@/features/game-state/domain/oozeRules";
import {
  dropCube,
  pickUpCube,
  placeCubeAtEndAnomaly,
  removeCubeFromEndAnomaly,
} from "@/features/game-state/domain/interactionRules";

import { cellKey } from "@/features/maze/domain/mazePathing";
import { generateMaze } from "@/features/maze/domain/generateMaze";
import { buildMazeWorld } from "@/features/render/three/worldBuilder";
import { buildReplicatedSnapshot } from "@/features/networking/protocol/syncSnapshot";

import {
  applyPlayerLookDelta,
  createPlayerViewAngles,
} from "@/features/player/domain/cameraLook";
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
  createPlayerPose,
  PLAYER_EYE_HEIGHT,
} from "@/features/player/domain/movement";

import { createAnimationLoop } from "@/features/render/three/animationLoop";
import { createCamera } from "@/features/render/three/createCamera";
import { createRenderer } from "@/features/render/three/createRenderer";
import { createScene } from "@/features/render/three/createScene";

import PointerLockGate from "./PointerLockGate";
import type { GameCellLookup, GameState } from "@/features/game-state/domain/gameTypes";
import type { MazeCellSnapshot, MazeCellType } from "@/types/shared";

const MAX_PIXEL_RATIO = 2;

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

const hashSeed = (value: string): number => {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
};

const mazeCellToWorld = (x: number, y: number): Readonly<{ x: number; y: number; z: number }> => ({
  x: x * CELL_SIZE + CELL_SIZE / 2,
  y: PLAYER_EYE_HEIGHT,
  z: y * CELL_SIZE + CELL_SIZE / 2,
});

const toMazeCellType = (value: number): MazeCellType =>
  value === 0 ? "wall" : value === 3 ? "spawn" : value === 4 ? "exit" : "corridor";

const createMazeCell = (x: number, y: number, value: number): MazeCellSnapshot => ({
  id: cellKey({ x, y }),
  grid: { x, y },
  type: toMazeCellType(value),
  walkable: value !== 0,
  occupiedBy: null,
});

export default function GameCanvas() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [isPointerLocked, setIsPointerLocked] = useState(false);

  const setScreen = useUiStore((state) => state.setScreen);
  const setPaused = useUiStore((state) => state.setPaused);
  const setCompletion = useUiStore((state) => state.setCompletion);

  const roomId = useSessionStore((state) => state.room?.roomId ?? null);
  const roomJoinCode = useSessionStore((state) => state.room?.joinCode ?? null);
  const roomHostId = useSessionStore((state) => state.room?.hostId ?? null);
  const sessionMode = useSessionStore((state) => state.sessionMode);
  const lobbyPlayers = useSessionStore((state) => state.lobbyPlayers);
  const peerIdentity = useSessionStore((state) => state.peerIdentity);

  const setLocalPlayerPose = useRuntimeStore((state) => state.setLocalPlayerPose);
  const setViewAngles = useRuntimeStore((state) => state.setViewAngles);
  const setInputFlags = useRuntimeStore((state) => state.setInputFlags);
  const bumpInputSequence = useRuntimeStore((state) => state.bumpInputSequence);
  const patchReadiness = useRuntimeStore((state) => state.patchReadiness);
  const setAuthoritativeSnapshot = useRuntimeStore((state) => state.setAuthoritativeSnapshot);

  useEffect(() => {
    const mount = mountRef.current;

    if (!mount) {
      return undefined;
    }

    const roomSeedSource = roomId ?? roomJoinCode ?? "horror-corridor";
    const maze = generateMaze({
      size: GRID_SIZE,
      seed: hashSeed(roomSeedSource),
    });

    const startPosition = mazeCellToWorld(maze.start.x, maze.start.y);
    const endPosition = mazeCellToWorld(maze.end.x, maze.end.y);
    const startPlayerPose = createPlayerPose({
      x: startPosition.x,
      y: PLAYER_EYE_HEIGHT,
      z: startPosition.z,
    });
    const startYaw = Math.atan2(
      endPosition.x - startPosition.x,
      endPosition.z - startPosition.z,
    );
    const startViewAngles = createPlayerViewAngles(startYaw, 0);
    const startInput = createPlayerInputState();

    const renderer = createRenderer({
      pixelRatio: Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO),
    });
    const scene = createScene();
    const camera = createCamera({
      aspect: mount.clientWidth > 0 && mount.clientHeight > 0 ? mount.clientWidth / mount.clientHeight : 1,
    });
    const world = buildMazeWorld(maze);
    const pointerLockTarget = mount;

    const mazeCells: readonly MazeCellSnapshot[] = maze.grid.flatMap((row, y) =>
      row.map((value, x) => createMazeCell(x, y, value)),
    );
    const mazeLookup = Object.fromEntries(
      mazeCells.map((cell) => [cell.id, cell] as const),
    ) as GameCellLookup;

    const cubeCellIds = new Set(
      maze.cubes.map((cube) => cellKey({
        x: Math.floor(cube.x / CELL_SIZE),
        y: Math.floor(cube.z / CELL_SIZE),
      })),
    );

    const mazeCellsWithOccupancy = mazeCells.map((cell) =>
      cubeCellIds.has(cell.id)
        ? {
            ...cell,
            occupiedBy: "cube" as const,
          }
        : cell,
    );

    const cubeSnapshots = maze.cubes.map((cube) => ({
      id: cube.id,
      color: cube.colorName,
      cell: {
        x: Math.floor(cube.x / CELL_SIZE),
        y: Math.floor(cube.z / CELL_SIZE),
      },
      position: {
        x: cube.x,
        y: 0.12,
        z: cube.z,
      },
      visible: true,
      active: true,
      locked: false,
      highlighted: false,
      heldByPlayerId: null,
      assignedSlotId: null,
    }));

    const sequenceSlots = maze.targetSequence.map((color, index) => ({
      id: `slot-${index}`,
      index,
      requiredColor: color,
      occupiedCubeId: null,
      isUnlocked: index === 0,
      isSolved: false,
    }));

    const roomSnapshot = {
      roomId: roomId ?? roomSeedSource,
      joinCode: roomJoinCode,
      hostId: roomHostId ?? peerIdentity.playerId,
      phase: "active" as const,
      maxPlayers: 4,
      players: lobbyPlayers,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const localPlayerId = peerIdentity.playerId ?? `${sessionMode}-player`;
    const localPlayerName = peerIdentity.displayName || (sessionMode === "host" ? "Host" : "Client");
    const sourcePlayers =
      lobbyPlayers.length > 0
        ? lobbyPlayers
        : [
            {
              id: localPlayerId,
              name: localPlayerName,
              isHost: sessionMode === "host",
              ready: true,
              connectionState: "connected" as const,
            },
          ];

    const buildPlayers = () => {
      const remoteOffsets = [1.4, -1.4, 2.2, -2.2];
      let remoteIndex = 0;

      return sourcePlayers.map((player) => {
        if (player.id === localPlayerId) {
          return {
            id: player.id,
            name: localPlayerName,
            position: startPlayerPose.position,
            rotationY: startViewAngles.yaw,
            velocity: startPlayerPose.velocity,
            health: 100,
            stamina: 100,
            isHost: player.isHost,
            isAlive: true,
            crouching: startPlayerPose.crouching,
            connectionState: player.connectionState,
          };
        }

        const offset = remoteOffsets[remoteIndex % remoteOffsets.length];
        remoteIndex += 1;

        return {
          id: player.id,
          name: player.name,
          position: {
            x: startPlayerPose.position.x + offset,
            y: PLAYER_EYE_HEIGHT,
            z: startPlayerPose.position.z + 1.2 + remoteIndex * 0.6,
          },
          rotationY: 0,
          velocity: {
            x: 0,
            y: 0,
            z: 0,
          },
          health: 100,
          stamina: 100,
          isHost: player.isHost,
          isAlive: true,
          crouching: false,
          connectionState: player.connectionState,
        };
      });
    };

    const syncLocalCarryState = (): void => {
      const carriedCubeId = gameState.cubes.find(
        (cube) => cube.heldByPlayerId === localPlayerId,
      )?.id ?? null;

      poseRef.current = {
        ...poseRef.current,
        carryingCubeId: carriedCubeId,
      };
      setLocalPlayerPose(poseRef.current);
    };

    const applyInteraction = (): void => {
      if (gameState.gameState !== "playing") {
        return;
      }

      const distanceToEnd = Math.hypot(
        poseRef.current.position.x - endPosition.x,
        poseRef.current.position.z - endPosition.z,
      );
      const hasCarriedCube = gameState.cubes.some(
        (cube) => cube.heldByPlayerId === localPlayerId,
      );

      const nextState =
        distanceToEnd < 6
          ? hasCarriedCube
            ? placeCubeAtEndAnomaly(gameState, { playerId: localPlayerId })
            : removeCubeFromEndAnomaly(gameState, { playerId: localPlayerId })
          : hasCarriedCube
            ? dropCube(gameState, { playerId: localPlayerId })
            : pickUpCube(gameState, { playerId: localPlayerId });

      if (nextState === gameState) {
        return;
      }

      gameState = nextState;
      syncLocalCarryState();
      setAuthoritativeSnapshot(buildReplicatedSnapshot(gameState));

      if (nextState.gameState === "victory") {
        setCompletion({
          status: "victory",
          message: "The corridor accepted the run.",
          atMs: nowMs(),
        });
        setScreen("COMPLETED");
        setPaused(false, "none");
        releasePointerLock();
      }
    };

    let currentTick = 0;
    const nowMs = () => Date.now();

    let gameState: GameState = {
      gameId: roomSnapshot.roomId,
      seed: hashSeed(roomSeedSource),
      room: {
        ...roomSnapshot,
        phase: "active",
        players: lobbyPlayers,
      },
      appState: "PLAYING",
      gameState: "playing",
      tick: currentTick,
      timestampMs: nowMs(),
      maze: mazeCellsWithOccupancy,
      players: buildPlayers(),
      cubes: cubeSnapshots,
      sequenceSlots,
      oozeTrail: [],
      oozeLevel: 0,
      mazeLookup,
      endAnomalyCellId: cellKey(maze.end),
      lastOozeDecayTime: nowMs(),
    };

    const poseRef = { current: startPlayerPose };
    const viewAnglesRef = { current: startViewAngles };
    const inputRef = { current: startInput };
    const pointerLockedRef = { current: false };

    mount.appendChild(renderer.domElement);
    world.attach(scene);

    setLocalPlayerPose(startPlayerPose);
    setViewAngles(startViewAngles);
    setInputFlags(toPlayerInputSnapshot(startInput));
    setAuthoritativeSnapshot(buildReplicatedSnapshot(gameState));

    const syncPointerLockState = (): void => {
      const locked = document.pointerLockElement === pointerLockTarget;

      if (pointerLockedRef.current === locked) {
        return;
      }

      pointerLockedRef.current = locked;
      inputRef.current = setPlayerPointerLocked(inputRef.current, locked);
      setIsPointerLocked(locked);
      setInputFlags(toPlayerInputSnapshot(inputRef.current));

      if (!locked && useUiStore.getState().screen === "PLAYING") {
        setPaused(true, "system");
        setScreen("PAUSED");
      }
    };

    const releasePointerLock = (): void => {
      if (document.pointerLockElement) {
        document.exitPointerLock();
      }
    };

    const onKeyDown = (event: KeyboardEvent): void => {
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

      inputRef.current = setPlayerInputButton(inputRef.current, button, true);
      setInputFlags(toPlayerInputSnapshot(inputRef.current));
      bumpInputSequence();
    };

    const onKeyUp = (event: KeyboardEvent): void => {
      const button = keyboardCodeToPlayerInputButton(event.code);

      if (!button) {
        return;
      }

      inputRef.current = setPlayerInputButton(inputRef.current, button, false);
      setInputFlags(toPlayerInputSnapshot(inputRef.current));
      bumpInputSequence();
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

    resizeObserver?.observe(mount);
    window.addEventListener("resize", onResize);
    document.addEventListener("pointerlockchange", onPointerLockChange);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    document.addEventListener("mousemove", onMouseMove);
    window.addEventListener("blur", onBlur);
    onResize();
    patchReadiness({ input: false });
    setPaused(false, "none");

    const loop = createAnimationLoop((deltaMs, elapsedMs) => {
      const runtimeUi = useUiStore.getState();

      if ((runtimeUi.screen === "PAUSED" || runtimeUi.screen === "COMPLETED") && pointerLockedRef.current) {
        releasePointerLock();
      }

      if (gameState.gameState === "victory" && runtimeUi.screen !== "COMPLETED") {
        setCompletion({
          status: "victory",
          message: "The corridor accepted the run.",
          atMs: nowMs(),
        });
        setScreen("COMPLETED");
        setPaused(false, "none");
      }

      const playing = runtimeUi.screen === "PLAYING";
      if (pointerLockedRef.current && playing) {
        const nextViewAngles = applyPlayerLookDelta(
          viewAnglesRef.current,
          inputRef.current.lookDeltaX,
          inputRef.current.lookDeltaY,
          deltaMs,
        );
        const nextPoseResult = advancePlayerMovement(
          poseRef.current,
          inputRef.current,
          nextViewAngles,
          deltaMs,
        );
        const collision = resolveMazeCollision(
          poseRef.current.position,
          nextPoseResult.pose.position,
          maze.grid,
        );
        const resolvedPose = {
          ...nextPoseResult.pose,
          position: collision.position,
          velocity: {
            x: collision.blockedX ? 0 : nextPoseResult.pose.velocity.x,
            y: nextPoseResult.pose.velocity.y,
            z: collision.blockedZ ? 0 : nextPoseResult.pose.velocity.z,
          },
        };

        poseRef.current = resolvedPose;
        viewAnglesRef.current = {
          yaw: resolvedPose.rotationY,
          pitch: nextViewAngles.pitch,
        };
        inputRef.current = clearPlayerLookDelta(inputRef.current);

        setLocalPlayerPose(resolvedPose);
        setViewAngles(viewAnglesRef.current);
      } else {
        setInputFlags(toPlayerInputSnapshot(inputRef.current));
      }

      currentTick += playing ? 1 : 0;
      const playerSnapshots = buildPlayers().map((player) =>
        player.id === localPlayerId
          ? {
              ...player,
              position: poseRef.current.position,
              rotationY: viewAnglesRef.current.yaw,
              velocity: poseRef.current.velocity,
              crouching: poseRef.current.crouching,
            }
          : player,
      );

      gameState = {
        ...gameState,
        room: {
          ...gameState.room,
          phase: playing ? "active" : runtimeUi.screen === "COMPLETED" ? "ending" : "lobby",
          updatedAt: nowMs(),
        },
        appState: runtimeUi.screen,
        gameState:
          runtimeUi.screen === "PAUSED"
            ? "paused"
            : runtimeUi.screen === "COMPLETED"
              ? "victory"
              : "playing",
        tick: currentTick,
        timestampMs: nowMs(),
        players: playerSnapshots,
      };

      if (playing) {
        gameState = advanceOozeTrail(gameState, {
          nowMs: nowMs(),
          playerPositions: playerSnapshots.map((player) => player.position),
        });
      }

      const snapshot = buildReplicatedSnapshot(gameState);
      setAuthoritativeSnapshot(snapshot);
      setInputFlags(toPlayerInputSnapshot(inputRef.current));

      syncCameraFromPlayer(camera, poseRef.current.position, viewAnglesRef.current);
      world.update(elapsedMs, { snapshot, localPlayerId });
      renderer.render(scene, camera);
    });

    loop.start();
    patchReadiness({ rendering: true });

    return () => {
      loop.stop();
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

      patchReadiness({ rendering: false });
      setAuthoritativeSnapshot(null);
    };
  }, [
    roomId,
    roomJoinCode,
    roomHostId,
    lobbyPlayers,
    peerIdentity.displayName,
    peerIdentity.playerId,
    sessionMode,
    setAuthoritativeSnapshot,
    setInputFlags,
    setLocalPlayerPose,
    setPaused,
    setScreen,
    setViewAngles,
    bumpInputSequence,
    patchReadiness,
  ]);

  return (
    <PointerLockGate
      title="Maze runtime"
      description="A real maze world is active here. Click capture, move with WASD or arrow keys, and look around with the mouse."
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
