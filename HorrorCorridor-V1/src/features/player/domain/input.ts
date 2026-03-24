export type PlayerInputButton =
  | "forward"
  | "back"
  | "left"
  | "right"
  | "interact"
  | "pause";

export type PlayerInputButtons = Readonly<{
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  interact: boolean;
  pause: boolean;
}>;

export type PlayerInputState = Readonly<{
  buttons: PlayerInputButtons;
  lookDeltaX: number;
  lookDeltaY: number;
  pointerLocked: boolean;
}>;

export type PlayerInputSnapshot = Readonly<{
  moveForward: number;
  moveStrafe: number;
  interact: boolean;
  pause: boolean;
  lookDeltaX: number;
  lookDeltaY: number;
  pointerLocked: boolean;
}>;

export const createPlayerInputState = (): PlayerInputState => ({
  buttons: {
    forward: false,
    back: false,
    left: false,
    right: false,
    interact: false,
    pause: false,
  },
  lookDeltaX: 0,
  lookDeltaY: 0,
  pointerLocked: false,
});

export const keyboardCodeToPlayerInputButton = (code: string): PlayerInputButton | null => {
  switch (code) {
    case "KeyW":
      return "forward";
    case "KeyS":
      return "back";
    case "KeyA":
    case "ArrowLeft":
      return "left";
    case "KeyD":
    case "ArrowRight":
      return "right";
    case "ArrowUp":
      return "forward";
    case "ArrowDown":
      return "back";
    case "KeyE":
      return "interact";
    case "KeyP":
      return "pause";
    default:
      return null;
  }
};

export const setPlayerInputButton = (
  input: PlayerInputState,
  button: PlayerInputButton,
  pressed: boolean,
): PlayerInputState => ({
  ...input,
  buttons: {
    ...input.buttons,
    [button]: pressed,
  },
});

export const readPlayerMovementAxes = (
  input: PlayerInputState,
): Readonly<{
  forward: number;
  strafe: number;
}> => ({
  forward: (input.buttons.forward ? 1 : 0) - (input.buttons.back ? 1 : 0),
  strafe: (input.buttons.right ? 1 : 0) - (input.buttons.left ? 1 : 0),
});

export const accumulatePlayerLookDelta = (
  input: PlayerInputState,
  deltaX: number,
  deltaY: number,
): PlayerInputState => ({
  ...input,
  lookDeltaX: input.lookDeltaX + deltaX,
  lookDeltaY: input.lookDeltaY + deltaY,
});

export const clearPlayerLookDelta = (input: PlayerInputState): PlayerInputState => ({
  ...input,
  lookDeltaX: 0,
  lookDeltaY: 0,
});

export const setPlayerPointerLocked = (
  input: PlayerInputState,
  pointerLocked: boolean,
): PlayerInputState =>
  pointerLocked
    ? {
        ...input,
        pointerLocked: true,
      }
    : {
        ...createPlayerInputState(),
        pointerLocked: false,
      };

export const resetPlayerInputState = (): PlayerInputState => createPlayerInputState();

export const toPlayerInputSnapshot = (input: PlayerInputState): PlayerInputSnapshot => {
  const axes = readPlayerMovementAxes(input);

  return {
    moveForward: axes.forward,
    moveStrafe: axes.strafe,
    interact: input.buttons.interact,
    pause: input.buttons.pause,
    lookDeltaX: input.lookDeltaX,
    lookDeltaY: input.lookDeltaY,
    pointerLocked: input.pointerLocked,
  };
};
