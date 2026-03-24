# HorrorCorridor V1 Prototype Feel Audit

## Summary

This pass targeted the "why does the prototype feel smoother?" question with direct runtime validation.

The root causes were not movement constants alone:

- V1 was publishing authoritative snapshots every render frame on the host path.
- V1 was sending client player updates every render frame instead of at the prototype `50ms` network tick.
- V1 was pushing local pose, view angles, and input flags through Zustand on the hot path.
- The minimap was redrawing through a React effect driven by snapshot and pose subscriptions instead of being owned by the runtime loop.
- The render surface was still heavier than the prototype because it used antialiasing and device pixel ratio scaling the prototype never requested.
- The ambient rig still pulsed decoratively, which added visual variance without helping parity.
- Camera feel still differed slightly because V1 used `fov=72` and `eyeHeight=1.45` instead of the prototype `75` / `2`.

## Changes Applied

- Host snapshot publish cadence was reduced from per-frame to the prototype-style `NETWORK_TICK_RATE = 50ms`.
- Client player update cadence was reduced from per-frame to the same `50ms` tick.
- Runtime store synchronization for local pose, view angles, and input flags is now capped to `100ms` instead of every frame.
- Minimap drawing moved into the runtime loop through an imperative canvas helper; the React component now only owns the canvas element.
- HUD held-item state now derives from the replicated snapshot instead of per-frame local pose subscriptions.
- Camera defaults now match the prototype more closely:
  - `FOV = 75`
  - `PLAYER_EYE_HEIGHT = 2`
- Renderer cost was reduced toward the prototype:
  - `antialias: false`
  - pixel ratio capped to `1`
- Decorative ambient/hemisphere pulsing was removed; the light rig now stays stable like the prototype's simpler scene lighting.

## Validation Evidence

### Static checks

- `npx tsc --noEmit` passed.
- `npm run lint` passed.

### Detached browser proof

Host path on `http://127.0.0.1:3006/?debug=frames`:

- `window.__HORROR_CORRIDOR_DEBUG__.getLatestFrame()` reported:
  - `mode: "host-sim"`
  - `cadence.authoritativePublishesPerSecond: 19-20`
  - `cadence.uiSyncsPerSecond: 10`
- Unlocked `W` movement changed local position from:
  - `x: 377.5, z: 377.5`
  - to `x: 379.8985000000001, z: 377.5`
- During unlocked movement:
  - `input.moveForward: 1`
  - `pointerLocked: false`
  - `yaw` remained `-1.5707963267948966`
  - `pitch` remained `0`
- Unlocked mouse movement did not change yaw or pitch.

Client path on the same room code:

- `window.__HORROR_CORRIDOR_DEBUG__.getLatestFrame()` reported:
  - `mode: "client-sim"`
  - `cadence.clientUpdatesPerSecond: 20`
  - `cadence.uiSyncsPerSecond: 10`
- Unlocked `W` movement changed local position from:
  - `x: 379.8985000000001, z: 377.5`
  - to `x: 382.44550000000004, z: 377.5`
- Unlocked mouse movement again left yaw/pitch unchanged.

### Validation limitation

- Detached Playwright still cannot acquire pointer lock in this environment. The browser emits `The root document of this element is not valid for pointer lock.` when capture is requested. That means locked-session mouse-look still needs a manual browser pass even though unlocked movement, host cadence, and client cadence are now validated.

## Outcome

V1 now behaves much closer to the prototype's runtime model:

- render loop stays continuous
- network sync runs at the prototype tick
- UI/store churn is capped
- minimap rendering is imperative again
- camera and renderer defaults are closer to the one-file prototype

This did not finish the broader ECS/MVVM migration. It deliberately tightened hot-path ownership first so later architectural extraction can happen without reintroducing frame churn.
