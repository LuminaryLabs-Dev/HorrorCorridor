"use client";

import type { SessionConnectionStatus, SessionMode } from "@/features/game-state/store/sessionStore";
import type { LobbyPlayer, RoomState } from "@/types/shared";

type LobbyScreenProps = Readonly<{
  mode: SessionMode;
  connectionStatus: SessionConnectionStatus;
  room: RoomState | null;
  players: readonly LobbyPlayer[];
  onPrimaryAction: () => void;
  onSecondaryAction: () => void;
  onBackToTitle: () => void;
}>;

const readinessLabel = (player: LobbyPlayer): string => (player.ready ? "ready" : "waiting");

export default function LobbyScreen({
  mode,
  connectionStatus,
  room,
  players,
  onPrimaryAction,
  onSecondaryAction,
  onBackToTitle,
}: LobbyScreenProps) {
  const secondaryLabel = mode === "host" ? "Add guest" : "Toggle ready";
  const roomCode = room?.joinCode ?? "----";

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-1 items-center justify-center px-4 py-8">
      <div className="grid w-full gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-[1.85rem] border border-[#7aff86]/20 bg-[rgba(0,7,2,0.62)] p-6 shadow-[0_0_40px_rgba(122,255,134,0.06)] backdrop-blur-md sm:p-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.42em] text-[#b8ffbf]/70">
            Lobby
          </p>
          <h2 className="mt-3 text-3xl font-semibold uppercase tracking-[0.22em] text-white sm:text-4xl">
            {mode === "host" ? "Host lobby" : "Client lobby"}
          </h2>
          <p className="mt-4 max-w-2xl font-mono text-sm leading-7 text-[#d6ffd8]">
            Share the room code, ready the players, and move into the run once everyone is in.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-2 font-mono text-[10px] text-[#a8ffb1]">
            <span className="rounded-full border border-[#7aff86]/20 bg-black/35 px-3 py-1">
              Room: {roomCode}
            </span>
            <span className="rounded-full border border-[#7aff86]/20 bg-black/35 px-3 py-1">
              Mode: {mode}
            </span>
            <span className="rounded-full border border-[#7aff86]/20 bg-black/35 px-3 py-1">
              Status: {connectionStatus}
            </span>
            <span className="rounded-full border border-[#7aff86]/20 bg-black/35 px-3 py-1">
              Players: {players.length}
            </span>
            <span className="rounded-full border border-[#7aff86]/20 bg-black/35 px-3 py-1">
              Phase: {room?.phase ?? "lobby"}
            </span>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={onPrimaryAction}
              className="rounded-[1.35rem] border border-[#7aff86]/22 bg-[rgba(122,255,134,0.08)] px-5 py-4 text-left transition hover:border-[#9effac]/45 hover:bg-[rgba(122,255,134,0.14)]"
            >
              <span className="block font-mono text-[10px] uppercase tracking-[0.36em] text-[#b8ffbf]/70">
                Primary
              </span>
              <span className="mt-2 block text-lg font-semibold uppercase tracking-[0.18em] text-white">
                {mode === "host" ? "Start run" : "Enter run"}
              </span>
              <span className="mt-1 block font-mono text-sm leading-6 text-[#d6ffd8]">
                Move from the lobby into the corridor once the room is ready.
              </span>
            </button>

            <button
              type="button"
              onClick={onSecondaryAction}
              className="rounded-[1.35rem] border border-[#7aff86]/20 bg-black/35 px-5 py-4 text-left transition hover:border-[#9effac]/35 hover:bg-black/45"
            >
              <span className="block font-mono text-[10px] uppercase tracking-[0.36em] text-[#b8ffbf]/70">
                Secondary
              </span>
              <span className="mt-2 block text-lg font-semibold uppercase tracking-[0.18em] text-white">
                {secondaryLabel}
              </span>
              <span className="mt-1 block font-mono text-sm leading-6 text-[#d6ffd8]">
                Host adds a guest slot. Client toggles ready state.
              </span>
            </button>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onBackToTitle}
              className="rounded-[1.15rem] border border-[#7aff86]/20 bg-black/35 px-5 py-3 text-sm font-semibold uppercase tracking-[0.2em] text-[#d6ffd8] transition hover:border-[#9effac]/35 hover:bg-black/45"
            >
              Back to title
            </button>
          </div>
        </div>

        <aside className="rounded-[1.85rem] border border-[#7aff86]/20 bg-[rgba(0,7,2,0.52)] p-5 text-sm text-[#d6ffd8] backdrop-blur-md">
          <p className="font-mono text-[10px] uppercase tracking-[0.42em] text-[#b8ffbf]/70">
            Players
          </p>
          <div className="mt-4 grid gap-3">
            {players.map((player) => (
              <div
                key={player.id}
                className="rounded-[1.1rem] border border-[#7aff86]/18 bg-black/35 px-4 py-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-white">{player.name}</p>
                    <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-[#7d9f80]">
                      {player.isHost ? "Host" : "Client"}
                    </p>
                  </div>
                  <span className="rounded-full border border-[#7aff86]/18 bg-black/40 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-[#d6ffd8]">
                    {readinessLabel(player)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </section>
  );
}
