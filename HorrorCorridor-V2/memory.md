# V2 Memory

## Lasting Decisions

- This is a game hosted with web tooling, not a website and not a Next.js application.
- Natural gameplay domains own state; composition only orders them; adapters only translate.
- V1 assets and behavior may be clean-room ported selectively, but V1 modules are never imported.
- The active world is a continuous service corridor streamed in deterministic eight-meter segments around the party. It has no forward-axis clamp, blocking threshold door, or building-transition teleport.
- Grounded wall-side set-piece descriptors form recognizable local places such as closed tavern fronts, service nooks, and pilgrim alcoves while keeping the central route open.
- Corridor owns immutable additive object profiles and exposes `routeGenerator` and `routeServiceDoor`; route seed, segment, district, and set piece select the profile deterministically. Three.js only realizes the returned descriptor.
- Content routing is validated by a first-class deterministic Agent/Chain harness with immutable run artifacts. It does not own or mutate runtime content; cumulative live play review remains the separate Orchestrator harness.
- Dread remains dormant for the first 42 meters after an encounter/building transition so Corridor can establish a safe exploration rhythm.
- Fixed simulation and deterministic random state are part of the snapshot contract.
- Movement keeps the player safe during the last-chance darkness window; a stopped player can be caught.
- Early beam success records `studied`; surviving blackout and then holding the beam records `collected`.
- Keep player-view darkness high, but require central route separation, grounded set-piece silhouettes, and readable flashlight side views.
- Browser audio realizes monster sensory channels as six distinct multi-pulse motifs. Hidden sign cues repeat directionally and tighten from authoritative expedition time before pursuit; the adapter keeps only a bounded diagnostic trace and never owns gameplay outcomes.
- The `abandoned-clinic` presentation is a recessed triage bay built around one wheeled gurney, medicine storage, IV stand, examination lamp, warning sign, and cold local light; it may not block the central route or own gameplay outcomes.
- The `flooded-laundry` presentation is a recessed industrial washroom built around three front-load washers, a wet-linen cart, raised hanging linen, standing water, a floor drain, warning sign, and paired cyan/red light; it may not block the central route or own gameplay outcomes.
- The `pilgrim-alcove` presentation is a recessed roadside shrine built around a faceless haloed effigy, votives, kneeler, prayer strips, a keep-moving warning, and contained amber/sickly light; it may not block the central route or own gameplay outcomes.
- The `boiler-shrine` presentation is a recessed pressure-vessel chapel built around a glowing furnace, gauge, valve, pressure offerings, chain reliquary, doctrine plate, chalk traces, and contained furnace/warning light; it may not block the central route or own gameplay outcomes.
- The `night-archive` presentation is a recessed records bay built around labeled filing drawers, one disturbed open file, a chained cabinet, sorting cart, accession cards, explicit records doctrine, and contained cold/red light; it may not block the central route or own gameplay outcomes.
- The `ticket-hall` presentation is a wall-aligned concourse built around distinct service wickets, one shutter, teller grilles and speaking rings, transaction trays and tools, a stopped clock, queue rail, explicit one-way doctrine, and contained cold/red light; it may not block the central route or own gameplay outcomes.
- The `workers-dormitory` presentation is a recessed shift barracks built around stacked bunks, layered bedding, ladder and rails, worker storage and clothing, boots and personal effects, explicit sleep doctrine, and contained violet/red light; it may not block the central route or own gameplay outcomes.
- The `mortuary-bay` presentation is a recessed cold-intake bay built around numbered body drawers, one attached open tray, a wheeled autopsy slab, instrument stand, floor drain, refrigeration lines, explicit counting doctrine, and contained cold/red light; it may not block the central route or own gameplay outcomes.
- Runtime TypeScript is the content authority; the authoring catalog is a metadata overlay resolved through the stdio HorrorCorridor Authoring MCP.
- External authoring work is packet-bound to one content target, natural neighbors, direct dependencies, three relevance-ranked accepted deltas, explicit evidence, an action plan, and an editable-file allowlist.
- Authoring lifecycle advances only through adjacent evidence gates. Focused preview, cohesion, and milestone promotion retain separate authority.
- The internal preview is Vite-development-only, starts no gameplay/network/persistence services, and uses the shared prefab registry with four clean player-view cameras.
- Streamed Three.js segments are retained by index across overlapping windows; only departing segments and the small active overlay are rebuilt.
- Read-only semantic queries log timing without rendering. Step-driven proofs use the snapshot returned by the step call instead of polling and rendering again.

## Proof Baseline

- Shipping/development core counts: 36/38.
- Reused live-player harness and V2 semantic live proof both pass.
- PeerJS host/client replication and disconnect/recovery pass.
- Full V2 evidence is stored in `docs/proofs/v2-live/`; legacy-harness evidence is in `docs/proofs/legacy-live-player/`.
