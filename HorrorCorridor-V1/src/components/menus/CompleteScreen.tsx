"use client";

type CompleteOutcome = "victory" | "failure";

type CompleteScreenProps = Readonly<{
  outcome: CompleteOutcome;
  message: string | null;
  onRestart: () => void;
  onQuitToTitle: () => void;
}>;

export default function CompleteScreen({
  outcome,
  message,
  onRestart,
  onQuitToTitle,
}: CompleteScreenProps) {
  const isVictory = outcome === "victory";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/78 px-4 backdrop-blur-sm">
      <div
        className={[
          "w-full max-w-md rounded-[1.85rem] border p-6 shadow-[0_0_40px_rgba(122,255,134,0.08)]",
          isVictory
            ? "border-[#7aff86]/30 bg-[rgba(0,7,2,0.88)]"
            : "border-[#7aff86]/20 bg-[rgba(0,7,2,0.9)]",
        ].join(" ")}
      >
        <p className="font-mono text-[10px] uppercase tracking-[0.42em] text-[#b8ffbf]/70">
          Complete
        </p>
        <h2 className="mt-3 text-3xl font-semibold uppercase tracking-[0.2em] text-white">
          {isVictory ? "Run complete" : "Run failed"}
        </h2>
        <p className="mt-4 font-mono text-sm leading-7 text-[#d6ffd8]">
          {message ?? "The end state is visible, but the final renderer is still a future pass."}
        </p>

        <div className="mt-6 grid gap-3">
          <button
            type="button"
            onClick={onRestart}
            className="rounded-[1.15rem] border border-[#7aff86]/22 bg-[rgba(122,255,134,0.08)] px-5 py-3 text-sm font-semibold uppercase tracking-[0.2em] text-white transition hover:border-[#9effac]/45 hover:bg-[rgba(122,255,134,0.14)]"
          >
            Return to lobby
          </button>
          <button
            type="button"
            onClick={onQuitToTitle}
            className="rounded-[1.15rem] border border-[#7aff86]/20 bg-black/35 px-5 py-3 text-sm font-semibold uppercase tracking-[0.2em] text-[#d6ffd8] transition hover:border-[#9effac]/35 hover:bg-black/45"
          >
            Quit to title
          </button>
        </div>
      </div>
    </div>
  );
}
