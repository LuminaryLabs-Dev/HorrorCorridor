"use client";

import { useMemo } from "react";

import {
  useRuntimeDebugStore,
  type RuntimeDebugCubeRecord,
  type RuntimeDebugAnomalyRecord,
} from "@/features/debug/store/runtimeDebugStore";

const formatNumber = (value: number): string => value.toFixed(2);

const formatPosition = (value: Readonly<{ x: number; y: number; z: number }>): string =>
  `${formatNumber(value.x)}, ${formatNumber(value.y)}, ${formatNumber(value.z)}`;

const renderCubeRecord = (cube: RuntimeDebugCubeRecord): string =>
  `${cube.id} ${cube.color} ${cube.state} @ ${formatPosition(cube.position)}${cube.ownerId ? ` owner=${cube.ownerId}` : ""}`;

const renderAnomalyRecord = (anomaly: RuntimeDebugAnomalyRecord): readonly string[] =>
  anomaly.sequence.map(
    (color, index) =>
      `${index}:${color}${anomaly.slots[index] ? ` <- ${anomaly.slots[index]}` : ""}`,
  );

export default function FrameDebugPanel() {
  const overlayVisible = useRuntimeDebugStore((state) => state.overlayVisible);
  const enabled = useRuntimeDebugStore((state) => state.enabled);
  const latestFrame = useRuntimeDebugStore((state) => state.latestFrame);
  const frames = useRuntimeDebugStore((state) => state.frames);
  const events = useRuntimeDebugStore((state) => state.events);

  const recentEvents = useMemo(() => events.slice(-6).reverse(), [events]);

  if (!enabled || !overlayVisible) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute bottom-24 right-4 z-40 w-[min(30rem,calc(100vw-2rem))] border border-[#7aff86]/30 bg-[rgba(0,12,4,0.84)] p-3 font-mono text-[10px] uppercase tracking-[0.18em] text-[#c8ffd0] shadow-[0_0_24px_rgba(0,255,120,0.08)] backdrop-blur-md">
      <div className="flex items-start justify-between gap-3 border-b border-[#7aff86]/20 pb-2">
        <div>
          <p className="text-[9px] tracking-[0.4em] text-[#8dff9a]">Frame Logger</p>
          <p className="mt-1 text-[9px] normal-case tracking-[0.2em] text-[#89b68e]">
            window.__HORROR_CORRIDOR_DEBUG__.extractState()
          </p>
        </div>
        <div className="text-right text-[9px] tracking-[0.3em] text-[#9fffaa]">
          <p>{frames.length} FRAMES</p>
          <p className="mt-1">{events.length} EVENTS</p>
        </div>
      </div>

      {!latestFrame ? (
        <p className="mt-3 text-[10px] tracking-[0.24em] text-[#b2d8b6]">Waiting for runtime frames...</p>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[9px] tracking-[0.32em] text-[#8dff9a]">Frame</p>
              <p className="mt-1 text-[10px] text-white">
                #{latestFrame.frameNumber} / {latestFrame.mode}
              </p>
              <p className="mt-1 text-[9px] normal-case tracking-[0.18em] text-[#bde0c0]">
                dt {formatNumber(latestFrame.deltaMs)} ms | elapsed {formatNumber(latestFrame.elapsedMs)} ms
              </p>
            </div>
            <div>
              <p className="text-[9px] tracking-[0.32em] text-[#8dff9a]">Snapshot</p>
              <p className="mt-1 text-[10px] text-white">
                tick {latestFrame.snapshot.tick ?? "-"} / {latestFrame.snapshot.gameState ?? "none"}
              </p>
              <p className="mt-1 text-[9px] normal-case tracking-[0.18em] text-[#bde0c0]">
                players {latestFrame.snapshot.playerCount} | cubes {latestFrame.snapshot.cubeCount} | ooze{" "}
                {latestFrame.snapshot.oozeCount}
              </p>
            </div>
          </div>

          <div>
            <p className="text-[9px] tracking-[0.32em] text-[#8dff9a]">Local Pose</p>
            <p className="mt-1 text-[9px] normal-case tracking-[0.18em] text-[#e7ffe9]">
              pos {formatPosition(latestFrame.localPose.position)}
            </p>
            <p className="mt-1 text-[9px] normal-case tracking-[0.18em] text-[#bde0c0]">
              vel {formatPosition(latestFrame.localPose.velocity)} | yaw {formatNumber(latestFrame.localPose.rotationY)}
              {" | "}pitch {formatNumber(latestFrame.localPose.pitch)}
            </p>
            <p className="mt-1 text-[9px] normal-case tracking-[0.18em] text-[#bde0c0]">
              carry {latestFrame.localPose.carryingCubeId ?? "none"} | pointer{" "}
              {latestFrame.pointerLocked ? "locked" : "free"} | screen {latestFrame.screen}
            </p>
          </div>

          <div>
            <p className="text-[9px] tracking-[0.32em] text-[#8dff9a]">Input</p>
            <p className="mt-1 text-[9px] normal-case tracking-[0.18em] text-[#e7ffe9]">
              forward {latestFrame.input.moveForward} | strafe {latestFrame.input.moveStrafe} | interact{" "}
              {String(latestFrame.input.interact)} | pause {String(latestFrame.input.pause)}
            </p>
            <p className="mt-1 text-[9px] normal-case tracking-[0.18em] text-[#bde0c0]">
              lookΔ {formatNumber(latestFrame.input.lookDeltaX)}, {formatNumber(latestFrame.input.lookDeltaY)}
            </p>
          </div>

          <div>
            <p className="text-[9px] tracking-[0.32em] text-[#8dff9a]">Cadence</p>
            <p className="mt-1 text-[9px] normal-case tracking-[0.18em] text-[#e7ffe9]">
              net age {formatNumber(latestFrame.cadence.networkTickAgeMs)} ms
            </p>
            <p className="mt-1 text-[9px] normal-case tracking-[0.18em] text-[#bde0c0]">
              publishes {latestFrame.cadence.authoritativePublishesPerSecond}/s | client updates{" "}
              {latestFrame.cadence.clientUpdatesPerSecond}/s | UI syncs {latestFrame.cadence.uiSyncsPerSecond}/s
            </p>
          </div>

          <div>
            <p className="text-[9px] tracking-[0.32em] text-[#8dff9a]">Anomaly</p>
            <div className="mt-1 space-y-1 text-[9px] normal-case tracking-[0.16em] text-[#dfffe2]">
              {renderAnomalyRecord(latestFrame.anomaly).map((line, index) => (
                <p key={`${index}-${line}`}>{line}</p>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[9px] tracking-[0.32em] text-[#8dff9a]">Cubes</p>
            <div className="mt-1 space-y-1 text-[9px] normal-case tracking-[0.16em] text-[#dfffe2]">
              {latestFrame.cubes.map((cube) => (
                <p key={cube.id}>{renderCubeRecord(cube)}</p>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[9px] tracking-[0.32em] text-[#8dff9a]">Recent Events</p>
            <div className="mt-1 space-y-1 text-[9px] normal-case tracking-[0.16em] text-[#dfffe2]">
              {recentEvents.length === 0 ? (
                <p>No runtime events captured yet.</p>
              ) : (
                recentEvents.map((event) => (
                  <p key={event.id}>
                    {new Date(event.recordedAtMs).toLocaleTimeString()} {event.kind}: {event.message}
                  </p>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
