"use client";

import { type ReactNode } from "react";

type PointerLockGateProps = Readonly<{
  title: string;
  description: string;
  isLocked: boolean;
  onCapture: () => void;
  onRelease: () => void;
  children: ReactNode;
}>;

export default function PointerLockGate({
  title,
  description,
  isLocked,
  onCapture,
  onRelease,
  children,
}: PointerLockGateProps) {
  return (
    <div className="relative h-full w-full overflow-hidden">
      <div className="absolute inset-0">{children}</div>

      <div className="pointer-events-none absolute inset-0 z-20 flex flex-col justify-between">
        <div className="flex items-start justify-between gap-3 p-4 sm:p-5">
          <div className="pointer-events-none rounded-full border border-[#7aff86]/20 bg-[rgba(0,7,2,0.55)] px-3 py-1 font-mono text-[10px] uppercase tracking-[0.34em] text-[#d6ffd8] backdrop-blur-sm">
            {isLocked ? "Pointer locked" : "Pointer unlocked"}
          </div>

          <button
            type="button"
            onClick={isLocked ? onRelease : onCapture}
            className="pointer-events-auto rounded-full border border-[#7aff86]/20 bg-[rgba(0,7,2,0.72)] px-4 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.24em] text-white backdrop-blur-sm transition hover:border-[#9effac]/45 hover:bg-[rgba(0,7,2,0.82)]"
          >
            {isLocked ? "Release" : "Capture"}
          </button>
        </div>

        {!isLocked ? (
          <div className="pointer-events-none mx-auto mb-6 w-full max-w-md px-4 sm:px-0">
            <div className="pointer-events-auto rounded-[1.35rem] border border-[#7aff86]/20 bg-[rgba(0,7,2,0.72)] p-5 text-[#d6ffd8] backdrop-blur-md">
              <p className="font-mono text-[10px] uppercase tracking-[0.42em] text-[#b8ffbf]/70">
                {title}
              </p>
              <p className="mt-2 font-mono text-sm leading-6 text-[#d6ffd8]">{description}</p>

              <div className="mt-4 flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[0.24em] text-[#a8ffb1]">
                <span className="rounded-full border border-[#7aff86]/18 bg-black/35 px-3 py-1">
                  Click to capture
                </span>
                <span className="rounded-full border border-[#7aff86]/18 bg-black/35 px-3 py-1">
                  WASD to move
                </span>
                <span className="rounded-full border border-[#7aff86]/18 bg-black/35 px-3 py-1">
                  Mouse to look
                </span>
                <span className="rounded-full border border-[#7aff86]/18 bg-black/35 px-3 py-1">
                  Esc to release
                </span>
              </div>

              <div className="mt-5">
                <button
                  type="button"
                  onClick={onCapture}
                  className="w-full rounded-[1.15rem] border border-[#7aff86]/22 bg-[rgba(122,255,134,0.08)] px-4 py-3 text-sm font-semibold uppercase tracking-[0.2em] text-white transition hover:border-[#9effac]/45 hover:bg-[rgba(122,255,134,0.14)]"
                >
                  Capture pointer
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="pointer-events-none px-4 pb-4 sm:px-5 sm:pb-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#7aff86]/20 bg-[rgba(0,7,2,0.72)] px-3 py-2 font-mono text-[10px] uppercase tracking-[0.28em] text-[#d6ffd8] backdrop-blur-sm">
              <span className="text-[#91ff9d]">Active</span>
              <span className="text-[#8cbf90]">Mouse input captured</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
