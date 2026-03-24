import { create } from "zustand";

import type { AppScreenState, GameScreenState } from "@/types/shared";

export type UiHintLevel = "info" | "objective" | "warning" | "success";

export type UiHint = Readonly<{
  id: string;
  text: string;
  level: UiHintLevel;
  expiresAtMs: number | null;
}>;

export type UiOverlayKind =
  | "none"
  | "boot"
  | "loading"
  | "lobby"
  | "settings"
  | "pause"
  | "objective"
  | "victory"
  | "failure"
  | "error";

export type UiOverlayState = Readonly<{
  kind: UiOverlayKind;
  message: string | null;
  visible: boolean;
}>;

export type UiPauseState = Readonly<{
  isPaused: boolean;
  reason: "none" | "manual" | "system" | "connection";
}>;

export type UiCompletionState = Readonly<{
  status: "none" | "victory" | "failure";
  message: string | null;
  atMs: number | null;
  acknowledged: boolean;
}>;

export type UiState = Readonly<{
  screen: AppScreenState;
  gameScreen: GameScreenState;
  overlay: UiOverlayState;
  hints: readonly UiHint[];
  pause: UiPauseState;
  completion: UiCompletionState;
}>;

export type UiActions = Readonly<{
  setScreen: (screen: AppScreenState) => void;
  setGameScreen: (gameScreen: GameScreenState) => void;
  setOverlay: (overlay: UiOverlayState) => void;
  pushHint: (hint: UiHint) => void;
  removeHint: (hintId: string) => void;
  clearHints: () => void;
  setPaused: (isPaused: boolean, reason?: UiPauseState["reason"]) => void;
  setCompletion: (completion: Omit<UiCompletionState, "acknowledged">) => void;
  acknowledgeCompletion: () => void;
  toggleSettingsOverlay: (visible?: boolean) => void;
  resetUi: () => void;
}>;

export type UiStore = UiState & UiActions;

const initialState: UiState = {
  screen: "START",
  gameScreen: "loading",
  overlay: {
    kind: "none",
    message: null,
    visible: false,
  },
  hints: [],
  pause: {
    isPaused: false,
    reason: "none",
  },
  completion: {
    status: "none",
    message: null,
    atMs: null,
    acknowledged: false,
  },
};

export const useUiStore = create<UiStore>((set) => ({
  ...initialState,
  setScreen: (screen) =>
    set(() => ({
      screen,
    })),
  setGameScreen: (gameScreen) =>
    set(() => ({
      gameScreen,
    })),
  setOverlay: (overlay) =>
    set(() => ({
      overlay,
    })),
  pushHint: (hint) =>
    set((state) => ({
      hints: [...state.hints, hint],
    })),
  removeHint: (hintId) =>
    set((state) => ({
      hints: state.hints.filter((hint) => hint.id !== hintId),
    })),
  clearHints: () =>
    set(() => ({
      hints: [],
    })),
  setPaused: (isPaused, reason = isPaused ? "manual" : "none") =>
    set((state) => ({
      pause: {
        isPaused,
        reason,
      },
      overlay: {
        kind: isPaused ? "pause" : "none",
        message: isPaused ? "Paused" : null,
        visible: isPaused,
      },
      screen: isPaused && state.screen === "PLAYING" ? "PAUSED" : !isPaused && state.screen === "PAUSED" ? "PLAYING" : state.screen,
    })),
  setCompletion: (completion) =>
    set(() => ({
      completion: {
        ...completion,
        acknowledged: false,
      },
      overlay: {
        kind: completion.status === "victory" ? "victory" : "failure",
        message: completion.message,
        visible: true,
      },
      screen: "COMPLETED",
      gameScreen: completion.status === "victory" ? "victory" : completion.status === "failure" ? "failure" : "playing",
    })),
  acknowledgeCompletion: () =>
    set((state) => ({
      completion: {
        ...state.completion,
        acknowledged: true,
      },
    })),
  toggleSettingsOverlay: (visible) =>
    set((state) => {
      const nextVisible = visible ?? !state.overlay.visible;

      return {
        overlay: {
          kind: nextVisible ? "settings" : "none",
          message: nextVisible ? "Settings" : null,
          visible: nextVisible,
        },
      };
    }),
  resetUi: () =>
    set(() => ({
      ...initialState,
    })),
}));
