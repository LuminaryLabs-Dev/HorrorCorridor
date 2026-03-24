"use client";

import { useRuntimeStore } from "@/features/game-state/store/runtimeStore";
import { useSessionStore } from "@/features/game-state/store/sessionStore";
import { useUiStore } from "@/features/game-state/store/uiStore";
import type { AppScreenState, ReplicatedCubeSnapshot } from "@/types/shared";
import { CUBE_COLORS } from "@/lib/colors";

import FrameDebugPanel from "./FrameDebugPanel";
import Minimap from "./Minimap";
import SettingsOverlay from "./SettingsOverlay";

const objectiveByScreen: Record<AppScreenState, string> = {
  START: "AWAITING ENTRY",
  JOIN_MENU: "ENTER ROOM CODE",
  LOBBY_HOST: "HOST THE ROOM",
  LOBBY_CLIENT: "READY THE CLIENT",
  PLAYING: "FIND THE END AND PLACE THE COLORS",
  PAUSED: "THE CORRIDOR IS HOLDING",
  COMPLETED: "THE CORRIDOR HAS ENDED",
};

const toColorLabel = (color: string | null): string => {
  if (!color) {
    return "EMPTY HANDS";
  }

  return color.replaceAll("_", " ");
};

const cubeColorById = (cube: ReplicatedCubeSnapshot | null | undefined): string | null => cube?.color ?? null;
const cubeColorCss = new Map(
  CUBE_COLORS.map((color) => [color.name, `#${color.hex.toString(16).padStart(6, "0")}`] as const),
);

export default function HUDOverlay() {
  const screen = useUiStore((state) => state.screen);
  const pauseState = useUiStore((state) => state.pause);
  const room = useSessionStore((state) => state.room);
  const peerIdentity = useSessionStore((state) => state.peerIdentity);
  const sessionMode = useSessionStore((state) => state.sessionMode);
  const authoritativeSnapshot = useRuntimeStore((state) => state.authoritativeSnapshot);
  const overlay = useUiStore((state) => state.overlay);
  const toggleSettingsOverlay = useUiStore((state) => state.toggleSettingsOverlay);

  if (screen !== "PLAYING" && screen !== "PAUSED" && screen !== "COMPLETED") {
    return null;
  }

  const snapshot = authoritativeSnapshot;
  const localPlayerId = peerIdentity.playerId;
  const heldCube =
    snapshot?.cubes.find((cube) => cube.state === "held" && cube.ownerId === localPlayerId) ?? null;
  const heldLabel = toColorLabel(cubeColorById(heldCube));
  const objective = objectiveByScreen[screen];
  const screenLabel = screen.replaceAll("_", " ");
  const hint =
    screen === "PLAYING"
      ? "WASD / ARROWS MOVE. CAPTURE FOR MOUSE LOOK. E INTERACT. SPACE PLACE. P PAUSE."
      : screen === "PAUSED"
        ? "PAUSED. PRESS P TO RESUME OR ESC TO RELEASE POINTER."
        : "RUN COMPLETE. USE THE OVERLAY TO RETURN TO THE LOBBY OR TITLE.";

  return (
    <div className="pointer-events-none absolute inset-0 z-30 font-mono text-[11px] uppercase tracking-[0.26em] text-[#9dff9d] [text-shadow:0_0_8px_rgba(120,255,140,0.16)]">
      <div className="absolute left-4 top-4 w-[min(28rem,calc(100vw-2rem))]">
        <div className="border border-[#7aff86]/25 bg-[rgba(0,7,2,0.58)] p-3 backdrop-blur-md">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[9px] tracking-[0.48em] text-[#b8ffbf]/70">HORROR CORRIDOR</p>
              <h2 className="mt-2 text-lg font-semibold tracking-[0.34em] text-white">
                PROTOTYPE PORT
              </h2>
            </div>
            <div className="text-right">
              <p className="text-[9px] tracking-[0.42em] text-[#b8ffbf]/70">{screenLabel}</p>
              <p className="mt-2 text-[10px] tracking-[0.3em] text-[#86ff96]">
                {room?.joinCode ? `ROOM ${room.joinCode}` : "SOLO SHELL"}
              </p>
            </div>
          </div>

          <p className="mt-3 text-[10px] tracking-[0.32em] text-[#b8ffbf]/75">{objective}</p>

          <div className="mt-3 flex flex-wrap gap-2">
            {(snapshot?.anomaly.sequence ?? []).map((color, index) => {
              const isFilled = (snapshot?.anomaly.slots[index] ?? null) !== null;

              return (
                <span
                  key={`${color}-${index}`}
                  className={[
                    "rounded-full border px-3 py-1 text-[10px] tracking-[0.28em]",
                    isFilled
                      ? "border-[#91ff9e]/28 bg-[#91ff9e]/10 text-white"
                      : "border-[#91ff9e]/16 bg-black/35",
                  ].join(" ")}
                  style={{ color: isFilled ? "#ffffff" : cubeColorCss.get(color) ?? "#d8ffd9" }}
                >
                  [{isFilled ? "X" : color}]
                </span>
              );
            })}
          </div>
        </div>
      </div>

      <div className="absolute right-4 bottom-28 z-30">
        <button
          type="button"
          onClick={() => toggleSettingsOverlay(true)}
          className="pointer-events-auto rounded-full border border-[#7aff86]/25 bg-[rgba(0,7,2,0.68)] px-4 py-2 font-mono text-[10px] uppercase tracking-[0.26em] text-[#d6ffd8] backdrop-blur-md transition hover:border-[#9effac]/45 hover:bg-[rgba(0,7,2,0.8)]"
        >
          Settings
        </button>
      </div>

      <div className="absolute right-4 top-4 w-[min(18rem,calc(100vw-2rem))] text-right">
        <div className="border border-[#7aff86]/25 bg-[rgba(0,7,2,0.58)] p-3 backdrop-blur-md">
          <p className="text-[9px] tracking-[0.46em] text-[#b8ffbf]/70">STATUS</p>
          <p className="mt-2 text-sm tracking-[0.2em] text-white">
            {pauseState.isPaused ? "PAUSED" : "ACTIVE"}
          </p>
          <p className="mt-3 text-[9px] tracking-[0.46em] text-[#b8ffbf]/70">HINT</p>
          <p className="mt-2 text-[10px] leading-6 tracking-[0.22em] text-[#d6ffd8] normal-case">
            {hint}
          </p>
          <p className="mt-3 text-[9px] tracking-[0.46em] text-[#b8ffbf]/70">HELD ITEM</p>
          <p className="mt-2 text-[10px] tracking-[0.32em] text-[#91ff9d]">{heldLabel}</p>
          <p className="mt-3 text-[9px] tracking-[0.46em] text-[#b8ffbf]/70">PLAYER</p>
          <p className="mt-2 text-[10px] tracking-[0.28em] text-[#dfffe0] normal-case">
            {peerIdentity.displayName || "Unnamed"} / {sessionMode.toUpperCase()}
          </p>
        </div>
      </div>

      <div className="absolute bottom-4 left-4">
        <Minimap />
      </div>

      <SettingsOverlay
        isOpen={overlay.visible && overlay.kind === "settings"}
        onClose={() => toggleSettingsOverlay(false)}
      />

      <FrameDebugPanel />
    </div>
  );
}
