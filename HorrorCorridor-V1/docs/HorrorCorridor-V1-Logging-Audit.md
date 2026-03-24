# HorrorCorridor V1 Logging Audit

## Audit Date

- 2026-03-23 21:29 EDT
- Supplemental validation: 2026-03-23 23:26 EDT
- Supplemental validation: 2026-03-23 23:50 EDT

## Scope

- Audit the runtime logging layer.
- Confirm the logger can be enabled.
- Confirm frame state can be extracted over time.
- Confirm the on-screen logging surface works.
- Record any confirmed issues or validation limits.

## Files Inspected

- `src/features/debug/store/runtimeDebugStore.ts`
- `src/components/hud/FrameDebugPanel.tsx`
- `src/components/hud/HUDOverlay.tsx`
- `src/components/game/GameCanvas.tsx`
- `docs/HorrorCorridor-V1-Parity-Audit.md`

## Validation Performed

### 1. Static Code Audit

- Confirmed `runtimeDebugStore.ts` owns:
  - bounded frame ring buffer
  - bounded event ring buffer
  - localStorage-backed enable / overlay preferences
  - `window.__HORROR_CORRIDOR_DEBUG__` extraction API
- Confirmed `GameCanvas.tsx` records:
  - runtime init events
  - sync events
  - interaction events
  - pointer-lock events
  - per-frame pose/input/snapshot state
  - runtime cadence counters for:
    - network tick age
    - authoritative publish rate
    - client update rate
    - UI sync rate
- Confirmed `FrameDebugPanel.tsx` is gated by:
  - `enabled`
  - `overlayVisible`
- Confirmed `HUDOverlay.tsx` mounts the frame panel only during runtime HUD display.

### 2. Build Validation

- `npx tsc --noEmit` passed
- `npm run lint` passed

### 3. Direct Store Harness

- Enabled the store directly and recorded one synthetic frame and one synthetic event.
- Confirmed extracted state contained:
  - `enabled: true`
  - `frameCount: 1`
  - `eventCount: 1`
  - `latestMode: "idle"`
  - `latestCubeState: "ground"`

### 4. Detached Browser Validation

Server used:

- `http://127.0.0.1:3006`

Checks performed:

1. Normal route `/`
- Confirmed no logging overlay is visible on the start screen.
- Confirmed `window.__HORROR_CORRIDOR_DEBUG__` is not present before runtime initialization.

2. Debug route `/?debug=frames`
- Entered `START -> LOBBY_HOST -> PLAYING`
- Confirmed the `Frame Logger` overlay is visible during `PLAYING`
- Confirmed the overlay shows:
  - frame count
  - event count
  - latest frame mode
  - local pose
  - input snapshot
  - sequence slot state
  - cube state

3. Window extraction API
- Confirmed `window.__HORROR_CORRIDOR_DEBUG__.extractState()` returned live runtime state
- Confirmed extracted fields included:
  - `enabled`
  - `overlayVisible`
  - `latestFrame`
  - `frames`
  - `events`
  - `latestFrame.cadence`

4. Bounded buffer behavior
- Confirmed the frame buffer capped at `180` entries during runtime
- Confirmed later extracted state still reported `frameCount: 180` while `latestFrame` kept advancing

5. Overlay toggles
- Confirmed backquote key hides the overlay
- Confirmed `window.__HORROR_CORRIDOR_DEBUG__.showOverlay()` restores it

6. Console audit
- No app console errors were produced during the validated flow
- Only normal dev/HMR messages were present

## Confirmed Active Logging Paths

### Query-string activation

- `?debug=frames` enables the logging store and overlay automatically after runtime initialization.

### Runtime extraction API

- `window.__HORROR_CORRIDOR_DEBUG__.extractState()`
- `window.__HORROR_CORRIDOR_DEBUG__.getLatestFrame()`
- `window.__HORROR_CORRIDOR_DEBUG__.getFrames()`
- `window.__HORROR_CORRIDOR_DEBUG__.getEvents()`
- `window.__HORROR_CORRIDOR_DEBUG__.showOverlay()`
- `window.__HORROR_CORRIDOR_DEBUG__.hideOverlay()`
- `window.__HORROR_CORRIDOR_DEBUG__.enable()`
- `window.__HORROR_CORRIDOR_DEBUG__.disable()`
- `window.__HORROR_CORRIDOR_DEBUG__.clear()`

### On-screen runtime overlay

- The overlay is active during `PLAYING` when logging is enabled and overlay visibility is on.

## Evidence Snapshot

From detached browser validation in `PLAYING`:

- `frameCount: 180`
- `latestFrameNumber: 342` and later `805`
- `latestMode: "snapshot-replay"` in the earlier pre-fix audit
- `latestMode: "host-sim"` in the post-fix unlocked movement audit
- `latestTick: 0`
- `cubeStates: { ground: 3, held: 0, placed: 0 }`

Visible overlay sample confirmed:

- `Frame Logger`
- `180 FRAMES`
- `2 EVENTS`
- `#805 / snapshot-replay`
- local pose, input, sequence, cubes, and recent events

Supplemental unlocked movement proof:

- Detached Playwright held `W` with `pointerLocked: false`
- Baseline pose: `x: 383.35, y: 1.45, z: 377.5`
- Moved pose: `x: 383.80, y: 1.45, z: 377.5`
- `mode: "host-sim"`
- `input.moveForward: 1`
- Additional detached mouse movement left yaw/pitch unchanged while `pointerLocked: false`

Supplemental cadence proof after the prototype-feel pass:

- Host runtime reported:
  - `authoritativePublishesPerSecond: 19-20`
  - `uiSyncsPerSecond: 10`
- Client runtime reported:
  - `clientUpdatesPerSecond: 20`
  - `uiSyncsPerSecond: 10`
- Detached browser validation still showed unlocked movement working while these counters remained capped, which confirms the logger can now validate hot-path churn directly rather than only pose/snapshot state.

## Issues Found

### No confirmed blocking app-side issues

- The logging layer is active and extractable.
- The bounded frame buffer works.
- The overlay toggle paths work.

### Validation Limitation LOG-LIMIT-001

- Severity: Low
- Type: Validation limitation, not confirmed app bug
- Description:
  - Detached Playwright cannot acquire pointer lock in this environment.
  - That means pointer-lock-specific mouse-look validation and locked-session movement remain partially unverified in the detached browser surface.
- Evidence:
  - Detached pointer-capture attempts previously produced browser-surface pointer-lock rejection.
  - The supplemental pass now validates unlocked `host-sim` movement frames, but locked mouse-look and locked-session movement still lack detached-browser proof.
- Recommended follow-up:
  - Validate locked mouse-look and locked-session movement in a manual browser session or a browser environment that supports pointer lock during automation.

### Informational Note LOG-INFO-001

- The window debug API is attached during runtime initialization, not on the title screen.
- This is consistent with current ownership in `GameCanvas.tsx`.
- It is not treated as a bug in this audit.

## Conclusion

- The runtime logging layer is active.
- The extraction API works.
- The visible overlay works.
- No blocking logger defects were found in this audit.
- One validation limitation remains for pointer-lock-specific look/movement branches.

## Recommended Next Validation Step

- Run one manual pointer-lock session with logging enabled and confirm locked mouse-look and locked-session movement, then append that evidence to this document.
