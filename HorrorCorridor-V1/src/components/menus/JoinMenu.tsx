"use client";

type JoinMenuProps = Readonly<{
  joinCode: string;
  playerName: string;
  connectionStatus: string;
  onJoinCodeChange: (value: string) => void;
  onPlayerNameChange: (value: string) => void;
  onSubmit: () => void;
  onBack: () => void;
}>;

export default function JoinMenu({
  joinCode,
  playerName,
  connectionStatus,
  onJoinCodeChange,
  onPlayerNameChange,
  onSubmit,
  onBack,
}: JoinMenuProps) {
  return (
    <section className="mx-auto flex w-full max-w-3xl flex-1 items-center justify-center px-4 py-8">
      <div className="w-full rounded-[1.85rem] border border-[#7aff86]/20 bg-[rgba(0,7,2,0.62)] p-6 shadow-[0_0_40px_rgba(122,255,134,0.06)] backdrop-blur-md sm:p-8">
        <p className="font-mono text-[10px] uppercase tracking-[0.42em] text-[#b8ffbf]/70">
          Client join
        </p>
        <h2 className="mt-3 text-3xl font-semibold uppercase tracking-[0.22em] text-white sm:text-4xl">
          Enter a room code.
        </h2>
        <p className="mt-4 max-w-2xl font-mono text-sm leading-7 text-[#d6ffd8]">
          Enter the room code, choose a name, and join the lobby.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-2 font-mono text-[10px] text-[#a8ffb1]">
          <span className="rounded-full border border-[#7aff86]/20 bg-black/35 px-3 py-1">
            Status: {connectionStatus}
          </span>
        </div>

        <div className="mt-8 grid gap-4">
          <label className="grid gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.36em] text-[#b8ffbf]/70">
              Join code
            </span>
            <input
              value={joinCode}
              onChange={(event) => onJoinCodeChange(event.target.value)}
              className="rounded-[1.2rem] border border-[#7aff86]/20 bg-black/50 px-4 py-3 text-base text-[#f0fff0] outline-none transition placeholder:text-[#5e8c64] focus:border-[#9effac]/50"
              placeholder="HRC-1"
            />
          </label>

          <label className="grid gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.36em] text-[#b8ffbf]/70">
              Display name
            </span>
            <input
              value={playerName}
              onChange={(event) => onPlayerNameChange(event.target.value)}
              className="rounded-[1.2rem] border border-[#7aff86]/20 bg-black/50 px-4 py-3 text-base text-[#f0fff0] outline-none transition placeholder:text-[#5e8c64] focus:border-[#9effac]/50"
              placeholder="Wanderer"
            />
          </label>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onSubmit}
            className="rounded-[1.15rem] border border-[#7aff86]/22 bg-[rgba(122,255,134,0.08)] px-5 py-3 text-sm font-semibold uppercase tracking-[0.2em] text-white transition hover:border-[#9effac]/45 hover:bg-[rgba(122,255,134,0.14)]"
          >
            Join lobby
          </button>
          <button
            type="button"
            onClick={onBack}
            className="rounded-[1.15rem] border border-[#7aff86]/20 bg-black/35 px-5 py-3 text-sm font-semibold uppercase tracking-[0.2em] text-[#d6ffd8] transition hover:border-[#9effac]/35 hover:bg-black/45"
          >
            Back
          </button>
        </div>
      </div>
    </section>
  );
}
