"use client";

import { useRuntimeStore } from "@/features/game-state/store/runtimeStore";
import { useSessionStore } from "@/features/game-state/store/sessionStore";
import { useUiStore } from "@/features/game-state/store/uiStore";
import type { AppScreenState, CubeState } from "@/types/shared";

import Minimap from "./Minimap";

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

const cubeColorById = (cube: CubeState | null | undefined): string | null => cube?.color ?? null;

export default function HUDOverlay() {
  const screen = useUiStore((state) => state.screen);
  const pauseState = useUiStore((state) => state.pause);
  const room = useSessionStore((state) => state.room);
  const peerIdentity = useSessionStore((state) => state.peerIdentity);
  const sessionMode = useSessionStore((state) => state.sessionMode);
  const authoritativeSnapshot = useRuntimeStore((state) => state.authoritativeSnapshot);
  const localPlayerPose = useRuntimeStore((state) => state.localPlayerPose);
  const viewAngles = useRuntimeStore((state) => state.viewAngles);

  if (screen !== "PLAYING" && screen !== "PAUSED" && screen !== "COMPLETED") {
    return null;
  }

  const snapshot = authoritativeSnapshot;
  const localPlayerId = peerIdentity.playerId;
  const heldCube = snapshot?.cubes.find((cube) => cube.id === localPlayerPose.carryingCubeId) ?? null;
  const heldLabel = toColorLabel(cubeColorById(heldCube));
  const objective = objectiveByScreen[screen];
  const screenLabel = screen.replaceAll("_", " ");
  const hint =
    screen === "PLAYING"
      ? "WASD / ARROWS MOVE. MOUSE LOOK. E INTERACT. SPACE PLACE. P PAUSE."
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
            {(snapshot?.sequenceSlots ?? []).map((slot) => (
              <span
                key={slot.id}
                className={[
                  "rounded-full border px-3 py-1 text-[10px] tracking-[0.28em]",
                  slot.isSolved
                    ? "border-[#91ff9e]/40 bg-[#63ff7a]/18 text-white"
                    : slot.isUnlocked
                      ? "border-[#91ff9e]/25 bg-[#91ff9e]/8 text-[#d8ffd9]"
                      : "border-[#91ff9e]/12 bg-black/35 text-[#7d9f80]",
                ].join(" ")}
              >
                {slot.requiredColor ?? "EMPTY"}
              </span>
            ))}
          </div>
        </div>
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
        <Minimap
          snapshot={snapshot}
          localPlayerId={localPlayerId}
          localPosition={localPlayerPose.position}
          viewAngles={viewAngles}
        />
      </div>

      <div className="absolute bottom-4 left-1/2 w-[min(54rem,calc(100vw-2rem))] -translate-x-1/2">
        <div className="border border-[#7aff86]/25 bg-[rgba(0,7,2,0.58)] px-4 py-3 text-center backdrop-blur-md">
          <p className="text-[9px] leading-6 tracking-[0.42em] text-[#d6ffd8]">
            WASD / ARROWS TO MOVE
            <span className="px-2 text-[#7aff86]">•</span>
            MOUSE TO LOOK
            <span className="px-2 text-[#7aff86]">•</span>
            E TO PICK UP / DROP
            <span className="px-2 text-[#7aff86]">•</span>
            SPACE TO PLACE
            <span className="px-2 text-[#7aff86]">•</span>
            P TO PAUSE
          </p>
          <p className="mt-1 text-[9px] tracking-[0.34em] text-[#8cbf90]">
            END ANOMALY / SEQUENCE {snapshot?.sequenceSlots.length ?? 0} / CUBES{" "}
            {snapshot?.cubes.length ?? 0}
          </p>
        </div>
      </div>
    </div>
  );
}
