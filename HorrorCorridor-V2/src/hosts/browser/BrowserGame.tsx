import { useEffect, useMemo, useRef, useState } from "react";
import type { HorrorCorridorV2Mode, HorrorCorridorV2Runtime, HorrorCorridorV2Snapshot } from "../../contracts";
import { createHorrorCorridorV2 } from "../../composition/createHorrorCorridorV2";
import { MONSTER_PROFILES } from "../../content/monsters";
import { createBrowserInputAdapter } from "../../adapters/browserInput";
import { createBrowserPersistenceAdapter } from "../../adapters/persistence";
import { createPeerNetworkAdapter } from "../../adapters/peerTransport";
import { createSpatialAudioAdapter, type SpatialAudioAdapter } from "../../adapters/spatialAudio";
import { installSemanticControl } from "../../proofs/semanticControl";
import { createThreeSceneAdapter } from "./threeScene";

const FIXED_STEP = 1 / 60;
const UI_STEP_MS = 100;

type LaunchConfig = Readonly<{
  mode: HorrorCorridorV2Mode;
  seed: string;
  roomCode: string;
}>;

function readLaunchConfig(): LaunchConfig {
  const params = new URLSearchParams(window.location.search);
  const modeValue = params.get("mode");
  const mode: HorrorCorridorV2Mode = modeValue === "host" || modeValue === "client" ? modeValue : "solo";
  return {
    mode,
    seed: params.get("seed") ?? "horror-corridor-v2-expedition",
    roomCode: (params.get("room") ?? "NIGHT7").toUpperCase(),
  };
}

function formatTime(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1_000);
  return `${Math.floor(totalSeconds / 60).toString().padStart(2, "0")}:${(totalSeconds % 60).toString().padStart(2, "0")}`;
}

export function BrowserGame() {
  const launch = useMemo(readLaunchConfig, []);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const runtimeRef = useRef<HorrorCorridorV2Runtime | null>(null);
  const audioRef = useRef<SpatialAudioAdapter | null>(null);
  const renderRef = useRef<(() => void) | null>(null);
  const manualRef = useRef(false);
  const [snapshot, setSnapshot] = useState<HorrorCorridorV2Snapshot | null>(null);
  const [ready, setReady] = useState(false);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [indexOpen, setIndexOpen] = useState(false);
  const [joinCode, setJoinCode] = useState(launch.roomCode);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let frameId = 0;
    let disposed = false;
    let lastFrameAt = performance.now();
    let accumulator = 0;
    let uiAccumulatorMs = UI_STEP_MS;
    let saveAccumulatorMs = 0;
    let hostStopped = false;

    try {
      const input = createBrowserInputAdapter(canvas);
      const audio = createSpatialAudioAdapter();
      audioRef.current = audio;
      const persistence = createBrowserPersistenceAdapter();
      const network = launch.mode === "solo"
        ? undefined
        : createPeerNetworkAdapter({
            mode: launch.mode,
            roomCode: launch.roomCode,
            explorerId: `listener-${launch.seed.slice(0, 8)}`,
          });
      const runtime = createHorrorCorridorV2({
        seed: launch.seed,
        mode: launch.mode,
        roomCode: launch.roomCode,
        development: import.meta.env.DEV,
        adapters: { persistence, network },
      });
      const presentation = createThreeSceneAdapter(canvas);
      runtimeRef.current = runtime;
      const renderNow = () => {
        const next = runtime.snapshot();
        presentation.render(next);
        audio.update(next);
      };
      renderRef.current = renderNow;
      renderNow();
      setSnapshot(runtime.snapshot());
      setReady(input.ready && presentation.ready);

      const removeSemanticControl = installSemanticControl({
        runtime,
        setManual: (active) => {
          manualRef.current = active;
          accumulator = 0;
        },
        getManual: () => manualRef.current,
        renderNow: () => {
          renderNow();
          setSnapshot(runtime.snapshot());
        },
        readiness: () => ({
          assets: true,
          input: input.ready,
          scene: presentation.ready,
          authority: launch.mode === "solo" || runtime.snapshot().sharedExpedition.connection !== "recovering",
        }),
        audioStatus: audio.diagnostics,
        unlockAudio: audio.unlock,
        shutdownHost: () => {
          hostStopped = true;
          cancelAnimationFrame(frameId);
          runtime.dispose();
        },
      });

      const onVisibilityChange = () => {
        if (hostStopped) return;
        if (document.hidden && runtime.snapshot().expedition.phase === "delving") {
          runtime.dispatch({ type: "pause", paused: true });
          setSnapshot(runtime.snapshot());
        }
      };
      const onCanvasClick = () => {
        if (hostStopped) return;
        if (runtime.snapshot().expedition.phase === "delving") void input.requestPointerLock();
      };
      document.addEventListener("visibilitychange", onVisibilityChange);
      canvas.addEventListener("click", onCanvasClick);

      const frame = (now: number) => {
        if (disposed || hostStopped) return;
        const elapsedMs = Math.min(100, now - lastFrameAt);
        lastFrameAt = now;
        if (!manualRef.current) {
          const sample = input.sample();
          runtime.dispatch({ type: "set-input", input: sample.input });
          if (sample.look.yawDelta || sample.look.pitchDelta) {
            runtime.dispatch({ type: "look", ...sample.look });
          }
          for (const command of sample.commands) {
            if (command === "flashlight") runtime.dispatch({ type: "flashlight" });
            else if (command === "interact") runtime.dispatch({ type: "interact" });
            else if (command === "pause") runtime.dispatch({ type: "pause" });
            else if (command === "restart" && runtime.snapshot().expedition.phase === "caught") runtime.dispatch({ type: "restart" });
            else if (command === "monster-index") setIndexOpen((value) => !value);
          }
          accumulator += elapsedMs / 1_000;
          while (accumulator >= FIXED_STEP) {
            runtime.tick(FIXED_STEP);
            accumulator -= FIXED_STEP;
          }
        }
        renderNow();
        uiAccumulatorMs += elapsedMs;
        saveAccumulatorMs += elapsedMs;
        if (uiAccumulatorMs >= UI_STEP_MS) {
          uiAccumulatorMs %= UI_STEP_MS;
          setSnapshot(runtime.snapshot());
        }
        if (!manualRef.current && saveAccumulatorMs >= 5_000 && runtime.snapshot().expedition.phase !== "title") {
          saveAccumulatorMs = 0;
          void runtime.save();
        }
        frameId = requestAnimationFrame(frame);
      };
      frameId = requestAnimationFrame(frame);

      return () => {
        disposed = true;
        cancelAnimationFrame(frameId);
        document.removeEventListener("visibilitychange", onVisibilityChange);
        canvas.removeEventListener("click", onCanvasClick);
        removeSemanticControl();
        input.dispose();
        audio.dispose();
        presentation.dispose();
        runtime.dispose();
        runtimeRef.current = null;
        audioRef.current = null;
        renderRef.current = null;
      };
    } catch (error) {
      setFatalError(error instanceof Error ? error.message : String(error));
      return undefined;
    }
  }, [launch]);

  const begin = () => {
    const runtime = runtimeRef.current;
    const canvas = canvasRef.current;
    if (!runtime || !canvas || !ready) return;
    if (!navigator.webdriver) void canvas.requestPointerLock();
    void audioRef.current?.unlock();
    window.setTimeout(() => {
      runtime.start();
      renderRef.current?.();
      setSnapshot(runtime.snapshot());
    }, 0);
  };

  const launchShared = (mode: "host" | "client", roomCode: string) => {
    const next = new URL(window.location.href);
    next.searchParams.set("mode", mode);
    next.searchParams.set("room", roomCode.trim().toUpperCase() || "NIGHT7");
    next.searchParams.set("seed", launch.seed);
    window.location.assign(next);
  };

  const restart = () => {
    runtimeRef.current?.dispatch({ type: "restart" });
    renderRef.current?.();
    setSnapshot(runtimeRef.current?.snapshot() ?? null);
  };

  const claimOffering = () => {
    runtimeRef.current?.dispatch({ type: "claim-offering" });
    renderRef.current?.();
    setSnapshot(runtimeRef.current?.snapshot() ?? null);
  };

  const resume = () => {
    runtimeRef.current?.dispatch({ type: "pause", paused: false });
    setSnapshot(runtimeRef.current?.snapshot() ?? null);
    void canvasRef.current?.requestPointerLock();
  };

  const phase = snapshot?.expedition.phase ?? "title";
  const heardSide = snapshot?.dread.heardSide;

  return (
    <main className={`game-shell phase-${phase}`} data-testid="horror-corridor-v2">
      <canvas
        ref={canvasRef}
        className="game-canvas"
        data-testid="game-canvas"
        data-render-ready={ready ? "true" : "false"}
        aria-label="Horror Corridor expedition view"
      />

      {fatalError && (
        <section className="modal-card fatal-card" data-testid="startup-failure">
          <p className="eyebrow">Startup failure</p>
          <h1>The corridor did not open.</h1>
          <p>{fatalError}</p>
          <button onClick={() => window.location.reload()}>Retry startup</button>
        </section>
      )}

      {!fatalError && phase === "title" && (
        <section className="title-screen" data-testid="title-screen">
          <div className="title-mark" aria-hidden="true"><span /><span /><span /></div>
          <p className="eyebrow">Nexus expedition 02</p>
          <h1>Horror<br />Corridor</h1>
          <p className="title-promise">Listen for what follows. Face it. Let it finish the scare if you want to collect it.</p>
          {launch.mode !== "solo" && (
            <p className="session-line">
              {launch.mode === "host" ? "Hosting" : "Joining"} <strong>{launch.roomCode}</strong>
            </p>
          )}
          <button
            type="button"
            className="hero-button"
            onClick={begin}
            disabled={!ready}
            data-testid="begin-expedition"
            aria-label="Start solo corridor"
          >
            {ready ? (launch.mode === "client" ? "Enter Shared Expedition" : "Start Solo Corridor") : "Opening corridor…"}
          </button>
          <p className="controls-line">WASD move · mouse listen/look · F flashlight · E interact · I index</p>
          <details className="advanced-launch">
            <summary>Shared expedition</summary>
            <div className="advanced-launch-content">
              <button onClick={() => launchShared("host", joinCode)}>Host</button>
              <label>
                Room code
                <input value={joinCode} onChange={(event) => setJoinCode(event.target.value)} maxLength={12} />
              </label>
              <button onClick={() => launchShared("client", joinCode)}>Join</button>
            </div>
          </details>
        </section>
      )}

      {snapshot && phase !== "title" && (
        <>
          <header className="hud-top" data-testid="game-hud">
            <div><span>Building</span><strong>{String(snapshot.expedition.buildingNumber).padStart(2, "0")}</strong></div>
            <div><span>Depth</span><strong>{Math.floor(snapshot.expedition.distanceMeters)}m</strong></div>
            <div><span>Chronicle</span><strong>{Math.floor(snapshot.expedition.score)}</strong></div>
            <div><span>Time</span><strong>{formatTime(snapshot.expedition.elapsedMs)}</strong></div>
            {snapshot.sharedExpedition.roomCode && (
              <div className="network-state"><span>{snapshot.sharedExpedition.connection}</span><strong>{snapshot.sharedExpedition.roomCode}</strong></div>
            )}
          </header>

          <button className="index-button" onClick={() => setIndexOpen(true)} data-testid="open-monster-index">
            Index <kbd>I</kbd>
          </button>
          <button className="pause-button" onClick={() => runtimeRef.current?.dispatch({ type: "pause", paused: true })}>
            Pause
          </button>

          {phase === "delving" && (
            <div className="reticle" data-contact={snapshot.corridor.beam.contact ? "true" : "false"} aria-hidden="true"><span /><span /></div>
          )}
          {snapshot.dread.monsterId && ["approaching", "repelling", "last-chance"].includes(snapshot.dread.phase) && (
            <div className={`sound-compass sound-${heardSide}`} data-testid="sound-cue">
              <span className="sound-left">‹</span>
              <p>{heardSide === "ahead" ? "AHEAD" : `SOUND ${heardSide?.toUpperCase()}`}</p>
              <span className="sound-right">›</span>
            </div>
          )}
          <div className="dread-vignette" style={{ "--threat": snapshot.dread.threat } as React.CSSProperties} />
          <div className="encounter-message" data-testid="encounter-message">
            <p>{snapshot.dread.message}</p>
            {snapshot.dread.phase === "last-chance" && <strong>{(snapshot.dread.lastChanceRemainingMs / 1_000).toFixed(1)} seconds</strong>}
          </div>
          <div className={`flashlight-state ${snapshot.party.flashlight.effectiveOn ? "is-on" : "is-off"}`}>
            <span /> {snapshot.dread.phase === "blackout" ? "BLACKOUT" : snapshot.party.flashlight.effectiveOn ? "BEAM LIVE" : "BEAM OFF"}
          </div>
        </>
      )}

      {snapshot?.corridor.offering && phase === "offering" && (
        <section className="modal-card offering-card" data-testid="offering-screen">
          <p className="eyebrow">The building gives something back</p>
          <h2>{snapshot.corridor.offering.name}</h2>
          <p>{snapshot.corridor.offering.description}</p>
          <button className="hero-button" onClick={claimOffering} data-testid="claim-offering">
            Claim and cross the threshold
          </button>
        </section>
      )}

      {snapshot && phase === "caught" && (
        <section className="caught-screen" data-testid="caught-screen">
          <p className="eyebrow">Expedition ended</p>
          <h2>You stopped<br />listening.</h2>
          <p>{snapshot.dread.message}</p>
          <button className="hero-button" onClick={restart} data-testid="restart-expedition">Return to the lift</button>
        </section>
      )}

      {snapshot && phase === "paused" && (
        <section className="modal-card pause-card" data-testid="pause-screen">
          <p className="eyebrow">Expedition suspended</p>
          <h2>The corridor waits.</h2>
          <button className="hero-button" onClick={resume}>Keep moving</button>
        </section>
      )}

      {snapshot && indexOpen && (
        <section className="index-panel" data-testid="monster-index">
          <header>
            <div><p className="eyebrow">Field record · {MONSTER_PROFILES.length} manifestations</p><h2>Monster Index</h2></div>
            <button onClick={() => setIndexOpen(false)} aria-label="Close Monster Index">×</button>
          </header>
          <div className="index-grid">
            {MONSTER_PROFILES.map((monster, number) => {
              const entry = snapshot.expedition.monsterIndex[monster.id];
              return (
                <article key={monster.id} className={`index-entry status-${entry.status}`}>
                  <span className="index-number">{String(number + 1).padStart(2, "0")}</span>
                  <div>
                    <p>{entry.status}</p>
                    <h3>{entry.status === "unseen" ? "Unknown" : monster.name}</h3>
                    <small>{entry.status === "unseen" ? "No reliable field notes." : monster.indexDescription}</small>
                    {entry.status !== "unseen" && <small>{monster.responseInstruction}</small>}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}
