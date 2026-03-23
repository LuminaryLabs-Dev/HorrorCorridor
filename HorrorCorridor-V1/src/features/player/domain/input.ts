export type PlayerInputButton =
  | "forward"
  | "back"
  | "left"
  | "right"
  | "turnLeft"
  | "turnRight"
  | "sprint"
  | "crouch"
  | "interact"
  | "pause"
  | "primaryAction"
  | "secondaryAction";

export type PlayerInputButtons = Readonly<{
  forward: boolean;
  back: boolean;
  left: boolean;
  right: boolean;
  turnLeft: boolean;
  turnRight: boolean;
  sprint: boolean;
  crouch: boolean;
  interact: boolean;
  pause: boolean;
  primaryAction: boolean;
  secondaryAction: boolean;
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
  turnAxis: number;
  sprint: boolean;
  crouch: boolean;
  interact: boolean;
  pause: boolean;
  primaryAction: boolean;
  secondaryAction: boolean;
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
    turnLeft: false,
    turnRight: false,
    sprint: false,
    crouch: false,
    interact: false,
    pause: false,
    primaryAction: false,
    secondaryAction: false,
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
      return "left";
    case "KeyD":
      return "right";
    case "ArrowLeft":
      return "turnLeft";
    case "ArrowRight":
      return "turnRight";
    case "ArrowUp":
      return "forward";
    case "ArrowDown":
      return "back";
    case "ShiftLeft":
    case "ShiftRight":
      return "sprint";
    case "ControlLeft":
    case "ControlRight":
      return "crouch";
    case "KeyE":
      return "interact";
    case "KeyP":
      return "pause";
    case "Space":
      return "primaryAction";
    case "KeyQ":
      return "secondaryAction";
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

export const readPlayerTurnAxis = (input: PlayerInputState): number =>
  (input.buttons.turnRight ? 1 : 0) - (input.buttons.turnLeft ? 1 : 0);

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
    turnAxis: readPlayerTurnAxis(input),
    sprint: input.buttons.sprint,
    crouch: input.buttons.crouch,
    interact: input.buttons.interact,
    pause: input.buttons.pause,
    primaryAction: input.buttons.primaryAction,
    secondaryAction: input.buttons.secondaryAction,
    lookDeltaX: input.lookDeltaX,
    lookDeltaY: input.lookDeltaY,
    pointerLocked: input.pointerLocked,
  };
};
