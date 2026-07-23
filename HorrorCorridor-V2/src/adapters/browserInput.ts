import type { SemanticInput } from "../contracts";

export type BrowserInputCommand = "flashlight" | "interact" | "pause" | "restart" | "monster-index";

export type BrowserInputSample = Readonly<{
  input: SemanticInput;
  look: Readonly<{ yawDelta: number; pitchDelta: number }>;
  commands: readonly BrowserInputCommand[];
}>;

export type BrowserInputAdapter = ReturnType<typeof createBrowserInputAdapter>;

export function createBrowserInputAdapter(canvas: HTMLCanvasElement) {
  const held = new Set<string>();
  const commands: BrowserInputCommand[] = [];
  let yawDelta = 0;
  let pitchDelta = 0;
  let disposed = false;

  const onKeyDown = (event: KeyboardEvent) => {
    held.add(event.code);
    if (event.repeat) return;
    const mapped: Partial<Record<string, BrowserInputCommand>> = {
      KeyF: "flashlight",
      KeyE: "interact",
      KeyP: "pause",
      KeyR: "restart",
      KeyI: "monster-index",
      Tab: "monster-index",
    };
    const command = mapped[event.code];
    if (command) {
      commands.push(command);
      event.preventDefault();
    }
  };
  const onKeyUp = (event: KeyboardEvent) => held.delete(event.code);
  const onMouseMove = (event: MouseEvent) => {
    if (document.pointerLockElement !== canvas) return;
    yawDelta -= event.movementX * 0.00215;
    pitchDelta -= event.movementY * 0.00185;
  };
  const onBlur = () => held.clear();

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("blur", onBlur);

  return Object.freeze({
    ready: true,
    requestPointerLock: () => canvas.requestPointerLock(),
    sample(): BrowserInputSample {
      const forward = Number(held.has("KeyW") || held.has("ArrowUp")) - Number(held.has("KeyS") || held.has("ArrowDown"));
      const strafe = Number(held.has("KeyD")) - Number(held.has("KeyA"));
      const turn = Number(held.has("ArrowLeft")) - Number(held.has("ArrowRight"));
      const sample = {
        input: {
          forward,
          strafe,
          turn,
          sprint: held.has("ShiftLeft") || held.has("ShiftRight"),
        },
        look: { yawDelta, pitchDelta },
        commands: [...commands],
      } satisfies BrowserInputSample;
      yawDelta = 0;
      pitchDelta = 0;
      commands.length = 0;
      return sample;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("blur", onBlur);
      held.clear();
    },
  });
}
