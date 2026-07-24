# HorrorCorridor V2

V2 is a standalone domain-first game. V1 is a reference, never a runtime dependency.

## Run

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:4173/`.

Shared modes:

```text
Host   http://127.0.0.1:4173/?mode=host&room=NIGHT7&seed=my-run
Join   http://127.0.0.1:4173/?mode=client&room=NIGHT7&seed=my-run
```

PeerJS supplies transport. The host publishes authoritative snapshots; clients mirror them and reconnect through the same room code.
The adapter uses binary chunking because the 124-entry Index makes authoritative snapshots larger than PeerJS JSON channels permit.

## Architecture

```text
src/
├── composition/          deterministic root temporal ensemble
├── expedition/           progress, fate, Chronicle, Monster Index
├── corridor/             chamber, route, content routing, light, acoustics, offerings
├── party/                explorer body, gaze, intent, condition
├── dread/                signs, pursuit, blackout, response, capture
├── shared-expedition/    authority, replication, reconnect, recovery
├── nexus/                explicit manifest, DSKs, behavior/root kits
├── adapters/             input, IndexedDB, WebAudio, PeerJS
├── hosts/browser/        fixed-step host, React UI, Three.js realization
├── content/              monsters, offerings, chamber descriptors
├── authoring/            catalog contracts and development preview fixture
├── presentation/         shared set-piece prefab registry
└── proofs/               semantic control and legacy-harness bridge
```

Temporal order:

```text
browser input
  -> Party body, gaze, flashlight intent
    -> Corridor collision, route, beam contact
      -> Dread signs, approach, blackout, response
        -> Expedition progress, fate, Monster Index
          -> Corridor offering and next building
            -> Shared Expedition authoritative snapshot
              -> Three.js, WebAudio, React consumers
```

Only root composition coordinates this order. Domain snapshots contain no React, Three.js, PeerJS, WebAudio, or browser objects.

Corridor content overlap stays additive: `routeGenerator` and `routeServiceDoor` deterministically select immutable profiles from route context. The Three.js adapter renders the selected descriptor but does not choose content.

## NexusEngine Composition

- Public commit: `06305727778d579ca18309221e60c3e41bd066c7`.
- 36 explicit shipping core kits; development adds Debug and Capture for 38.
- Selected generation: Procedural, NavMesh, Pathfinding, RouteField.
- Five V2 DSKs plus flashlight-response, Monster Index, and building-threshold behavior kits.
- `createRealtimeGame({ composer, coreKits: false })` prevents hidden duplicate cores.
- Compute, MLNN, agent, speech, policy, utility, headless-editor, weather, articulated, reflection, and render-layer-graph kits are not mounted.

## Public Runtime

```ts
createHorrorCorridorV2({ seed, mode, adapters }) => {
  start,
  tick,
  dispatch,
  snapshot,
  reset,
  save,
  load,
  dispose,
  diagnostics
}
```

Contracts: `horror-corridor-v2.snapshot/1`, `horror-corridor-v2.network/1`, `horror-corridor-v2.save/1`.

## External Tool Surface

`window.__HORROR_CORRIDOR_V2__` exposes atomic actions: status, start, manual stepping, semantic input, look, aim, flashlight, interact, claim, restart, save, load, and shutdown. `calls()` returns recent call timestamps and elapsed time since the preceding call.

The bridge also exposes the V1 live-player debug/control vocabulary so the existing repository harness can validate the V2 URL without modifying V1.

Content authoring uses a separate stdio-only MCP surface. It resolves the runtime TypeScript catalog, creates bounded context packets, controls a development-only focused preview, records evidence-gated lifecycle transitions, and runs allowlisted proofs. It cannot open an authoring HTTP endpoint, run arbitrary shell, edit unrestricted paths, or decide gameplay outcomes.

```bash
npm run --silent authoring:mcp
npm run proof:authoring-mcp
```

Setup, tools, lifecycle, and durable-state contracts: [docs/authoring-mcp.md](docs/authoring-mcp.md).

## Proofs

```bash
npm run lint
npm run build
npm run proof:runtime
npm run proof:authoring-mcp
npm run proof:live
npm run proof:legacy  # requires the V2 dev server
npm run review:timeline
```

- `proof:runtime` verifies 36/38 kit manifests, deterministic reset/replay, studied and collected outcomes, caught/restart, offering/building progression, save/load, and browser-free snapshots.
- `proof:runtime` also walks the real Party/Corridor motion path for 600 simulated seconds and validates 1,920 authored meters, 12 districts, 12 set-piece identities, and 124 monster manifestations.
- `proof:live` drives the game from outside, captures title/spawn/movement/left/right/first service-nook/first closed-tavern/first empty-pantry/first sealed-nursery/blackout/Index/caught views, checks lighting, and proves chunked PeerJS replication plus disconnect/recovery. Visual decision records and explicit `*-before.png` baselines survive proof cleanup. Add `-- --network-only` for a focused transport proof or `-- --url http://127.0.0.1:4174/` to use another port.
- `proof:legacy` runs the preserved V1 live-player harness against V2.
- `review:timeline` plays a durable deterministic timeline through the live game, records video/screenshots/decisions, and increases the next horizon from 180 seconds by 120 seconds after every pass. Six seconds without meaningful progress hands the same page to the bounded recovery agent; `-- --force-handoff` proves that route on demand.

The two harnesses have separate authority: `proof:live` owns invariant branch coverage, while `review:timeline` owns a growing deterministic horizon and stall recovery. Each review currently replays the prior prefix, so recorded time is not the same as unique coverage. [feed.json](docs/proofs/timeline-review/feed.json) records both figures and links the separate raw videos; they are not concatenated. Timeline state is durable at [state.json](docs/proofs/timeline-review/state.json).

Evidence: [docs/proofs/v2-live/report.json](docs/proofs/v2-live/report.json), [docs/proofs/legacy-live-player/report.json](docs/proofs/legacy-live-player/report.json), and [docs/proofs/timeline-review](docs/proofs/timeline-review).
