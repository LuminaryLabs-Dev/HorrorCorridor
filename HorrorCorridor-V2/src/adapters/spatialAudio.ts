import type { DreadPhase, HorrorCorridorV2Snapshot } from "../contracts";
import { MONSTERS_BY_ID, type MonsterProfile } from "../content/monsters";

type SensoryChannel = MonsterProfile["sensoryChannel"];
type CueChannel = SensoryChannel | "system";

type CuePulse = Readonly<{
  source: "tone" | "noise";
  offsetSeconds: number;
  durationSeconds: number;
  frequencyHz: number;
  endFrequencyHz: number;
  wave: OscillatorType;
  gain: number;
  attackSeconds: number;
  filterType?: BiquadFilterType;
  filterHz?: number;
}>;

export type SensoryCuePlan = Readonly<{
  motif: string;
  pulses: readonly CuePulse[];
}>;

export type SpatialAudioCueRecord = Readonly<{
  sequence: number;
  atSimulationMs: number;
  phase: DreadPhase;
  monsterId: string | null;
  sensoryChannel: CueChannel;
  motif: string;
  pan: number;
  threat: number;
  pulseCount: number;
  intervalMs: number;
}>;

export type SpatialAudioDiagnostics = Readonly<{
  ready: boolean;
  contextState: AudioContextState | "uninitialized";
  masterGain: number;
  currentMonsterId: string | null;
  recentCues: readonly SpatialAudioCueRecord[];
}>;

export type SpatialAudioAdapter = ReturnType<typeof createSpatialAudioAdapter>;

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));

function pulse(
  source: CuePulse["source"],
  offsetSeconds: number,
  durationSeconds: number,
  frequencyHz: number,
  endFrequencyHz: number,
  wave: OscillatorType,
  gain: number,
  filterType?: BiquadFilterType,
  filterHz?: number,
): CuePulse {
  return Object.freeze({
    source,
    offsetSeconds,
    durationSeconds,
    frequencyHz,
    endFrequencyHz,
    wave,
    gain,
    attackSeconds: Math.min(0.045, durationSeconds * 0.24),
    filterType,
    filterHz,
  });
}

export function createSensoryCuePlan(channel: SensoryChannel, intensity: number): SensoryCuePlan {
  const strength = clamp(intensity, 0.18, 1);
  const gain = 0.035 + strength * 0.052;
  const pitch = 0.9 + strength * 0.18;

  switch (channel) {
    case "footstep":
      return Object.freeze({
        motif: "paired-footfall",
        pulses: Object.freeze([
          pulse("tone", 0, 0.16, 62 * pitch, 34, "sine", gain * 1.08, "lowpass", 180),
          pulse("tone", 0.19, 0.14, 52 * pitch, 31, "sine", gain * 0.82, "lowpass", 150),
        ]),
      });
    case "metal":
      return Object.freeze({
        motif: "three-metal-knocks",
        pulses: Object.freeze([
          pulse("tone", 0, 0.09, 386 * pitch, 252, "triangle", gain * 0.82, "bandpass", 720),
          pulse("tone", 0.13, 0.08, 292 * pitch, 214, "triangle", gain * 0.68, "bandpass", 610),
          pulse("tone", 0.27, 0.11, 438 * pitch, 236, "triangle", gain, "bandpass", 780),
        ]),
      });
    case "breath":
      return Object.freeze({
        motif: "inhale-exhale",
        pulses: Object.freeze([
          pulse("noise", 0, 0.42, 0.74 + strength * 0.08, 0.58, "sine", gain * 0.7, "bandpass", 540),
          pulse("noise", 0.46, 0.54, 0.62, 0.48, "sine", gain * 0.92, "lowpass", 430),
        ]),
      });
    case "water":
      return Object.freeze({
        motif: "drain-bubbles",
        pulses: Object.freeze([
          pulse("tone", 0, 0.18, 112 * pitch, 64, "sine", gain * 0.68, "lowpass", 330),
          pulse("noise", 0.12, 0.24, 0.82, 0.64, "sine", gain * 0.34, "lowpass", 260),
          pulse("tone", 0.31, 0.21, 86 * pitch, 48, "sine", gain * 0.82, "lowpass", 280),
        ]),
      });
    case "electrical":
      return Object.freeze({
        motif: "broken-electrical-ring",
        pulses: Object.freeze([
          pulse("tone", 0, 0.12, 148 * pitch, 96, "square", gain * 0.52, "bandpass", 940),
          pulse("tone", 0.16, 0.18, 224 * pitch, 118, "sawtooth", gain * 0.62, "bandpass", 1_180),
          pulse("tone", 0.39, 0.08, 86 * pitch, 172, "square", gain * 0.48, "highpass", 120),
        ]),
      });
    case "voice":
      return Object.freeze({
        motif: "distant-formant",
        pulses: Object.freeze([
          pulse("tone", 0, 0.48, 116 * pitch, 108, "sine", gain * 0.54, "bandpass", 620),
          pulse("tone", 0.03, 0.45, 232 * pitch, 218, "triangle", gain * 0.3, "bandpass", 1_160),
          pulse("noise", 0.1, 0.34, 0.7, 0.62, "sine", gain * 0.18, "bandpass", 820),
        ]),
      });
  }
}

function cueIntervalMs(phase: DreadPhase, threat: number): number {
  if (phase === "sign") {
    const progress = clamp((threat - 0.08) / 0.08, 0, 1);
    return Math.round(1_450 - progress * 500);
  }
  if (phase === "last-chance") return 460;
  if (phase === "repelling") return 720;
  return Math.round(940 - clamp(threat, 0, 1) * 480);
}

export function createSpatialAudioAdapter() {
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  let compressor: DynamicsCompressorNode | null = null;
  let hum: OscillatorNode | null = null;
  let humGain: GainNode | null = null;
  let noiseBuffer: AudioBuffer | null = null;
  let lastPhase: DreadPhase = "dormant";
  let lastMonsterId: string | null = null;
  let lastCueSimulationMs = Number.NEGATIVE_INFINITY;
  let lastSimulationMs = 0;
  let cueSequence = 0;
  const recentCues: SpatialAudioCueRecord[] = [];

  const diagnostics = (): SpatialAudioDiagnostics => Object.freeze({
    ready: Boolean(context && context.state === "running"),
    contextState: context?.state ?? "uninitialized",
    masterGain: master?.gain.value ?? 0,
    currentMonsterId: lastMonsterId,
    recentCues: Object.freeze([...recentCues]),
  });

  const ensureNoiseBuffer = (): AudioBuffer | null => {
    if (!context) return null;
    if (noiseBuffer) return noiseBuffer;
    noiseBuffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const samples = noiseBuffer.getChannelData(0);
    let randomState = 0x71c8e39d;
    for (let index = 0; index < samples.length; index += 1) {
      randomState = (Math.imul(randomState, 1_664_525) + 1_013_904_223) >>> 0;
      samples[index] = ((randomState >>> 8) / 0x00ffffff) * 2 - 1;
    }
    return noiseBuffer;
  };

  const schedulePulse = (entry: CuePulse, pan: number) => {
    if (!context || !master) return;
    const startsAt = context.currentTime + entry.offsetSeconds;
    const endsAt = startsAt + entry.durationSeconds;
    const gainNode = context.createGain();
    const panner = context.createStereoPanner();
    const filter = context.createBiquadFilter();
    filter.type = entry.filterType ?? "lowpass";
    filter.frequency.setValueAtTime(entry.filterHz ?? 1_200, startsAt);
    panner.pan.setValueAtTime(clamp(pan, -1, 1), startsAt);
    gainNode.gain.setValueAtTime(0.0001, startsAt);
    gainNode.gain.linearRampToValueAtTime(entry.gain, startsAt + entry.attackSeconds);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, endsAt);

    if (entry.source === "noise") {
      const source = context.createBufferSource();
      source.buffer = ensureNoiseBuffer();
      source.playbackRate.setValueAtTime(entry.frequencyHz, startsAt);
      source.playbackRate.exponentialRampToValueAtTime(Math.max(0.05, entry.endFrequencyHz), endsAt);
      source.connect(filter).connect(gainNode).connect(panner).connect(master);
      source.start(startsAt, (entry.offsetSeconds * 0.37) % 1);
      source.stop(endsAt + 0.02);
      return;
    }

    const oscillator = context.createOscillator();
    oscillator.type = entry.wave;
    oscillator.frequency.setValueAtTime(Math.max(1, entry.frequencyHz), startsAt);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, entry.endFrequencyHz), endsAt);
    oscillator.connect(filter).connect(gainNode).connect(panner).connect(master);
    oscillator.start(startsAt);
    oscillator.stop(endsAt + 0.02);
  };

  const recordCue = (
    snapshot: HorrorCorridorV2Snapshot,
    sensoryChannel: CueChannel,
    motif: string,
    pulseCount: number,
    intervalMs: number,
    pan: number,
  ) => {
    cueSequence += 1;
    recentCues.push(Object.freeze({
      sequence: cueSequence,
      atSimulationMs: snapshot.expedition.elapsedMs,
      phase: snapshot.dread.phase,
      monsterId: snapshot.dread.monsterId,
      sensoryChannel,
      motif,
      pan,
      threat: snapshot.dread.threat,
      pulseCount,
      intervalMs,
    }));
    if (recentCues.length > 64) recentCues.splice(0, recentCues.length - 64);
  };

  const emitSensoryCue = (snapshot: HorrorCorridorV2Snapshot, monster: MonsterProfile) => {
    const phase = snapshot.dread.phase;
    const intervalMs = cueIntervalMs(phase, snapshot.dread.threat);
    const phaseStrength = phase === "sign" ? 0.34 + snapshot.dread.threat * 1.8 : phase === "last-chance" ? 1 : 0.46 + snapshot.dread.threat * 0.54;
    const plan = createSensoryCuePlan(monster.sensoryChannel, phaseStrength);
    const pan = clamp(snapshot.corridor.acoustics.cuePan, -1, 1);
    for (const entry of plan.pulses) schedulePulse(entry, pan);
    recordCue(snapshot, monster.sensoryChannel, plan.motif, plan.pulses.length, intervalMs, pan);
    lastCueSimulationMs = snapshot.expedition.elapsedMs;
  };

  const emitSystemCue = (
    snapshot: HorrorCorridorV2Snapshot,
    motif: string,
    pulses: readonly CuePulse[],
    pan = 0,
  ) => {
    for (const entry of pulses) schedulePulse(entry, pan);
    recordCue(snapshot, "system", motif, pulses.length, 0, pan);
    lastCueSimulationMs = snapshot.expedition.elapsedMs;
  };

  return Object.freeze({
    get ready() {
      return diagnostics().ready;
    },
    diagnostics,
    async unlock() {
      if (!context) {
        context = new AudioContext({ latencyHint: "interactive" });
        master = context.createGain();
        compressor = context.createDynamicsCompressor();
        compressor.threshold.value = -22;
        compressor.knee.value = 18;
        compressor.ratio.value = 7;
        compressor.attack.value = 0.006;
        compressor.release.value = 0.22;
        master.gain.value = 0.38;
        master.connect(compressor).connect(context.destination);

        hum = context.createOscillator();
        humGain = context.createGain();
        hum.type = "sine";
        hum.frequency.value = 43;
        humGain.gain.value = 0.018;
        hum.connect(humGain).connect(master);
        hum.start();
      }
      await context.resume();
      return diagnostics();
    },
    update(snapshot: HorrorCorridorV2Snapshot) {
      if (!context || !hum || !humGain || context.state !== "running") return;
      const simulationMs = snapshot.expedition.elapsedMs;
      if (simulationMs < lastSimulationMs) {
        lastPhase = "dormant";
        lastMonsterId = null;
        lastCueSimulationMs = Number.NEGATIVE_INFINITY;
      }
      lastSimulationMs = simulationMs;

      const roomBase = snapshot.corridor.acoustics.roomTone === "flooded"
        ? 39
        : snapshot.corridor.acoustics.roomTone === "service-tunnel"
          ? 46
          : 43;
      hum.frequency.setTargetAtTime(roomBase + snapshot.dread.threat * 14, context.currentTime, 0.1);
      humGain.gain.setTargetAtTime(0.016 + snapshot.dread.threat * 0.028, context.currentTime, 0.14);

      const phase = snapshot.dread.phase;
      const monster = snapshot.dread.monsterId ? MONSTERS_BY_ID[snapshot.dread.monsterId] : null;
      const encounterChanged = snapshot.dread.monsterId !== lastMonsterId;
      const phaseChanged = phase !== lastPhase || encounterChanged;
      const sensoryPhase = phase === "sign" || phase === "approaching" || phase === "repelling" || phase === "last-chance";

      if (phaseChanged) {
        if (sensoryPhase && monster) emitSensoryCue(snapshot, monster);
        else if (phase === "blackout") {
          emitSystemCue(snapshot, "blackout-drop", [pulse("tone", 0, 0.9, 42, 24, "sine", 0.16, "lowpass", 150)]);
        } else if (phase === "resolved") {
          emitSystemCue(snapshot, "release-chime", [
            pulse("tone", 0, 0.24, 248, 316, "sine", 0.055, "bandpass", 620),
            pulse("tone", 0.12, 0.28, 372, 426, "triangle", 0.035, "bandpass", 920),
          ]);
        } else if (phase === "jumpscare") {
          emitSystemCue(snapshot, "capture-impact", [
            pulse("noise", 0, 0.72, 0.82, 0.36, "sine", 0.18, "lowpass", 260),
            pulse("tone", 0, 1.05, 38, 21, "sawtooth", 0.2, "lowpass", 120),
          ]);
        }
        lastPhase = phase;
        lastMonsterId = snapshot.dread.monsterId;
      } else if (sensoryPhase && monster) {
        const intervalMs = cueIntervalMs(phase, snapshot.dread.threat);
        if (simulationMs - lastCueSimulationMs >= intervalMs) emitSensoryCue(snapshot, monster);
      }
    },
    dispose() {
      try {
        hum?.stop();
      } catch {
        // The context may already have stopped during host shutdown.
      }
      void context?.close();
      context = null;
      master = null;
      compressor = null;
      hum = null;
      humGain = null;
      noiseBuffer = null;
      recentCues.length = 0;
    },
  });
}
