"use client";

type SettingsOverlayProps = Readonly<{
  isOpen: boolean;
  onClose: () => void;
}>;

const controls = [
  { label: "Move", value: "WASD / Arrow Keys" },
  { label: "Look", value: "Capture mouse look" },
  { label: "Interact", value: "E to pick up / drop" },
  { label: "Place", value: "Space to place" },
  { label: "Pause", value: "P to pause" },
] as const;

export default function SettingsOverlay({ isOpen, onClose }: SettingsOverlayProps) {
  return (
    <div
      data-testid="settings-overlay"
      className={[
        "pointer-events-none absolute inset-y-0 right-0 z-40 flex items-center justify-end px-4 py-6 transition-transform duration-300 ease-out",
        isOpen ? "translate-x-0" : "translate-x-[calc(100%+1rem)]",
      ].join(" ")}
      aria-hidden={!isOpen}
    >
      <div className="pointer-events-auto w-full max-w-md border border-[#7aff86]/25 bg-[rgba(0,7,2,0.92)] p-5 font-mono text-[10px] uppercase tracking-[0.26em] text-[#d6ffd8] shadow-[0_0_48px_rgba(0,255,120,0.08)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[9px] tracking-[0.42em] text-[#8dff9a]">Settings</p>
            <h3 className="mt-2 text-base tracking-[0.34em] text-white">Control Map</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[#7aff86]/20 bg-black/35 px-3 py-1 text-[9px] tracking-[0.22em] text-[#d6ffd8] transition hover:border-[#9effac]/45 hover:bg-black/45"
          >
            Close
          </button>
        </div>

        <div className="mt-5 space-y-2">
          {controls.map((control) => (
            <div
              key={control.label}
              className="flex items-center justify-between gap-4 border border-[#7aff86]/15 bg-black/30 px-3 py-2"
            >
              <span className="text-[#8cbf90]">{control.label}</span>
              <span className="text-right text-white normal-case tracking-[0.12em]">{control.value}</span>
            </div>
          ))}
        </div>

        <div className="mt-5 border-t border-[#7aff86]/15 pt-4 text-[9px] tracking-[0.22em] text-[#9acaa0] normal-case">
          Pointer capture is only for mouse look. WASD movement works while PLAYING.
        </div>
      </div>
    </div>
  );
}
