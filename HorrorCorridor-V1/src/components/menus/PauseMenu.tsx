"use client";

type PauseMenuProps = Readonly<{
  onResume: () => void;
  onReturnToLobby: () => void;
  onQuitToTitle: () => void;
}>;

export default function PauseMenu({
  onResume,
  onReturnToLobby,
  onQuitToTitle,
}: PauseMenuProps) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/72 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[1.85rem] border border-[#7aff86]/20 bg-[rgba(0,7,2,0.88)] p-6 shadow-[0_0_40px_rgba(122,255,134,0.08)]">
        <p className="font-mono text-[10px] uppercase tracking-[0.42em] text-[#b8ffbf]/70">
          Pause
        </p>
        <h2 className="mt-3 text-3xl font-semibold uppercase tracking-[0.2em] text-white">
          The corridor is holding.
        </h2>
        <p className="mt-4 font-mono text-sm leading-7 text-[#d6ffd8]">
          The run is paused. Resume to keep moving through the corridor, or return to the lobby.
        </p>

        <div className="mt-6 grid gap-3">
          <button
            type="button"
            onClick={onResume}
            className="rounded-[1.15rem] border border-[#7aff86]/22 bg-[rgba(122,255,134,0.08)] px-5 py-3 text-sm font-semibold uppercase tracking-[0.2em] text-white transition hover:border-[#9effac]/45 hover:bg-[rgba(122,255,134,0.14)]"
          >
            Resume
          </button>
          <button
            type="button"
            onClick={onReturnToLobby}
            className="rounded-[1.15rem] border border-[#7aff86]/20 bg-black/35 px-5 py-3 text-sm font-semibold uppercase tracking-[0.2em] text-[#d6ffd8] transition hover:border-[#9effac]/35 hover:bg-black/45"
          >
            Return to lobby
          </button>
          <button
            type="button"
            onClick={onQuitToTitle}
            className="rounded-[1.15rem] border border-[#7aff86]/18 bg-black/30 px-5 py-3 text-sm font-semibold uppercase tracking-[0.2em] text-[#b8ffbf] transition hover:border-[#9effac]/35 hover:bg-black/45"
          >
            Quit to title
          </button>
        </div>
      </div>
    </div>
  );
}
