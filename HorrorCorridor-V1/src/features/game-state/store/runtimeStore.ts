import { create } from "zustand";

import type { ReplicatedGameSnapshot } from "@/types/shared";

import {
  createPlayerPose,
  type PlayerPose,
} from "@/features/player/domain/movement";
import {
  createPlayerViewAngles,
  type PlayerViewAngles,
} from "@/features/player/domain/cameraLook";
import {
  createPlayerInputState,
  toPlayerInputSnapshot,
  type PlayerInputSnapshot,
} from "@/features/player/domain/input";

export type LocalPlayerPose = PlayerPose;

export type RuntimeInputFlags = PlayerInputSnapshot;

export type RuntimeReadiness = Readonly<{
  simulation: boolean;
  rendering: boolean;
  networking: boolean;
  input: boolean;
}>;

export type RuntimeState = Readonly<{
  localPlayerPose: LocalPlayerPose;
  viewAngles: PlayerViewAngles;
  authoritativeSnapshot: ReplicatedGameSnapshot | null;
  inputFlags: RuntimeInputFlags;
  inputSequence: number;
  readiness: RuntimeReadiness;
}>;

export type RuntimeActions = Readonly<{
  setLocalPlayerPose: (pose: LocalPlayerPose) => void;
  patchLocalPlayerPose: (patch: Partial<LocalPlayerPose>) => void;
  setViewAngles: (viewAngles: PlayerViewAngles) => void;
  patchViewAngles: (patch: Partial<PlayerViewAngles>) => void;
  setAuthoritativeSnapshot: (snapshot: ReplicatedGameSnapshot | null) => void;
  setInputFlags: (flags: RuntimeInputFlags) => void;
  setInputFlag: <K extends keyof RuntimeInputFlags>(key: K, value: RuntimeInputFlags[K]) => void;
  bumpInputSequence: () => void;
  setReadiness: (readiness: RuntimeReadiness) => void;
  patchReadiness: (patch: Partial<RuntimeReadiness>) => void;
  resetRuntime: () => void;
}>;

export type RuntimeStore = RuntimeState & RuntimeActions;

const initialReadiness: RuntimeReadiness = {
  simulation: false,
  rendering: false,
  networking: false,
  input: false,
};

const initialState: RuntimeState = {
  localPlayerPose: createPlayerPose(),
  viewAngles: createPlayerViewAngles(),
  authoritativeSnapshot: null,
  inputFlags: createRuntimeInputFlags(),
  inputSequence: 0,
  readiness: initialReadiness,
};

function createRuntimeInputFlags(): RuntimeInputFlags {
  return toPlayerInputSnapshot(createPlayerInputState());
}

export const useRuntimeStore = create<RuntimeStore>((set) => ({
  ...initialState,
  setLocalPlayerPose: (pose) =>
    set(() => ({
      localPlayerPose: pose,
    })),
  patchLocalPlayerPose: (patch) =>
    set((state) => ({
      localPlayerPose: {
        ...state.localPlayerPose,
        ...patch,
      },
    })),
  setViewAngles: (viewAngles) =>
    set(() => ({
      viewAngles,
    })),
  patchViewAngles: (patch) =>
    set((state) => ({
      viewAngles: {
        ...state.viewAngles,
        ...patch,
      },
    })),
  setAuthoritativeSnapshot: (snapshot) =>
    set(() => ({
      authoritativeSnapshot: snapshot,
    })),
  setInputFlags: (flags) =>
    set(() => ({
      inputFlags: flags,
    })),
  setInputFlag: (key, value) =>
    set((state) => ({
      inputFlags: {
        ...state.inputFlags,
        [key]: value,
      },
    })),
  bumpInputSequence: () =>
    set((state) => ({
      inputSequence: state.inputSequence + 1,
    })),
  setReadiness: (readiness) =>
    set(() => ({
      readiness,
    })),
  patchReadiness: (patch) =>
    set((state) => ({
      readiness: {
        ...state.readiness,
        ...patch,
      },
    })),
  resetRuntime: () =>
    set(() => ({
      localPlayerPose: createPlayerPose(),
      viewAngles: createPlayerViewAngles(),
      authoritativeSnapshot: null,
      inputFlags: createRuntimeInputFlags(),
      inputSequence: 0,
      readiness: initialReadiness,
    })),
}));
