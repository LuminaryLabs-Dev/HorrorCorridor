"use client";

import type { SessionConnectionStatus, SessionMode } from "@/features/game-state/store/sessionStore";

type StartMenuProps = Readonly<{
  sessionMode: SessionMode;
  connectionStatus: SessionConnectionStatus;
  onHostGame: () => void;
  onJoinGame: () => void;
}>;

export default function StartMenu({
  sessionMode,
  connectionStatus,
  onHostGame,
  onJoinGame,
}: StartMenuProps) {
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-1 items-center justify-center px-4 py-8">
      <div className="w-full rounded-[1.85rem] border border-[#7aff86]/20 bg-[rgba(0,7,2,0.62)] p-6 shadow-[0_0_40px_rgba(122,255,134,0.06)] backdrop-blur-md sm:p-8">
        <p className="font-mono text-[10px] uppercase tracking-[0.42em] text-[#b8ffbf]/70">
          Start screen
        </p>
        <h2 className="mt-3 text-4xl font-semibold uppercase tracking-[0.22em] text-white sm:text-5xl">
          Enter the corridor.
        </h2>
        <p className="mt-4 max-w-2xl font-mono text-sm leading-7 text-[#d6ffd8] sm:text-base">
          This is the first visible slice: host, join, lobby, play, pause, and complete. The
          networking and renderer are still intentionally shallow.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-2 font-mono text-[10px] text-[#a8ffb1]">
          <span className="rounded-full border border-[#7aff86]/20 bg-black/35 px-3 py-1">
            Mode: {sessionMode}
          </span>
          <span className="rounded-full border border-[#7aff86]/20 bg-black/35 px-3 py-1">
            Status: {connectionStatus}
          </span>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={onHostGame}
            className="rounded-[1.35rem] border border-[#7aff86]/22 bg-[rgba(122,255,134,0.08)] px-5 py-4 text-left transition hover:border-[#9effac]/45 hover:bg-[rgba(122,255,134,0.14)]"
          >
            <span className="block font-mono text-[10px] uppercase tracking-[0.36em] text-[#b8ffbf]/70">
              Host
            </span>
            <span className="mt-2 block text-lg font-semibold uppercase tracking-[0.18em] text-white">
              Create a room
            </span>
            <span className="mt-1 block font-mono text-sm leading-6 text-[#d6ffd8]">
              Build the lobby locally and preview the host-first flow.
            </span>
          </button>

          <button
            type="button"
            onClick={onJoinGame}
            className="rounded-[1.35rem] border border-[#7aff86]/20 bg-black/35 px-5 py-4 text-left transition hover:border-[#9effac]/35 hover:bg-black/45"
          >
            <span className="block font-mono text-[10px] uppercase tracking-[0.36em] text-[#b8ffbf]/70">
              Client
            </span>
            <span className="mt-2 block text-lg font-semibold uppercase tracking-[0.18em] text-white">
              Join a room
            </span>
            <span className="mt-1 block font-mono text-sm leading-6 text-[#d6ffd8]">
              Step through the client lobby form and enter the same slice.
            </span>
          </button>
        </div>
      </div>
    </section>
  );
}
