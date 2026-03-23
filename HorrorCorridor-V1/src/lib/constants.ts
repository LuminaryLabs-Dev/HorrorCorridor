export const GRID_SIZE = 150 as const;

export const CELL_SIZE = 5 as const;

export const WALL_HEIGHT = 4 as const;

export const MOVE_SPEED = 0.15 as const;

export const TURN_SPEED = 0.04 as const;

export const MOUSE_SENSITIVITY = 0.003 as const;

export const PLAYER_RADIUS = 1.2 as const;

export const INTERACT_DIST = 3.0 as const;

export const MAX_PITCH = 15 * (Math.PI / 180);

export const MAX_OOZE = 800 as const;

export const OOZE_SPACING = 2.0 as const;

export const NETWORK_TICK_RATE = 50 as const;

export const MOVEMENT_TUNING = {
  walkSpeed: MOVE_SPEED,
  sprintSpeed: MOVE_SPEED * 1.5,
  acceleration: MOVE_SPEED * 0.75,
  deceleration: MOVE_SPEED * 0.75,
  turnSpeed: TURN_SPEED,
  crouchSpeedMultiplier: 0.55,
} as const;

export const INTERACTION_DISTANCE = INTERACT_DIST;

export const OOZE_TUNING = {
  maxLevel: MAX_OOZE,
  tickIntervalMs: 10000,
  risePerTick: 1,
  decayPerSecond: 0.1,
} as const;

export const ROOM_CAPACITY = 4 as const;
