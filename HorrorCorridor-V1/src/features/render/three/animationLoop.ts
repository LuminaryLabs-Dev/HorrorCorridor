export type AnimationLoopFrame = (deltaMs: number, elapsedMs: number) => void;

export type AnimationLoopController = Readonly<{
  start: () => void;
  stop: () => void;
  isRunning: () => boolean;
}>;

export const createAnimationLoop = (onFrame: AnimationLoopFrame): AnimationLoopController => {
  let animationFrameId: number | null = null;
  let running = false;
  let previousTimeMs = 0;

  const step = (timeMs: number): void => {
    if (!running) {
      return;
    }

    if (previousTimeMs === 0) {
      previousTimeMs = timeMs;
    }

    const deltaMs = timeMs - previousTimeMs;
    previousTimeMs = timeMs;

    onFrame(deltaMs, timeMs);
    animationFrameId = window.requestAnimationFrame(step);
  };

  return {
    start: () => {
      if (running) {
        return;
      }

      running = true;
      previousTimeMs = 0;
      animationFrameId = window.requestAnimationFrame(step);
    },
    stop: () => {
      running = false;
      previousTimeMs = 0;

      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
    },
    isRunning: () => running,
  };
};
