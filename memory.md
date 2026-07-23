# Repository Memory

## Purpose

HorrorCorridor is an endless first-person horror expedition. Monsters are collected by experiencing and surviving their characteristic scares, not by defeating them.

## Active Shape

- `HorrorCorridor-V2` is active.
- `HorrorCorridor-V1` is a preserved runnable reference and must not become a V2 runtime dependency.
- V2 uses Vite as a game-authoring host, React for game UI, Three.js for presentation, and NexusEngine for explicit authoritative composition.
- NexusEngine is pinned to commit `06305727778d579ca18309221e60c3e41bd066c7`.

## Domain Ownership

- Expedition owns run progression, score, fate, Chronicle, and Monster Index.
- Corridor owns chambers, routes, offerings, illumination, beam contact, and acoustics.
- Party owns explorer identity, body, gaze, flashlight intent, and condition.
- Dread owns monsters, signs, pursuit, blackout, last chance, and capture.
- Shared Expedition owns authority, replication, presence, reconnect, and recovery.
- Root composition coordinates their order and owns no domain state.

Flashlight ownership stays split: Party intent and pose → Corridor beam/contact → Dread consequences. Adapters never decide outcomes.

## Runtime Conventions

- Simulation is fixed at 60 Hz; render follows display cadence; network publishes at 20 Hz; React UI snapshots at 10 Hz.
- Snapshots and saves use `horror-corridor-v2.snapshot/1`, `horror-corridor-v2.network/1`, and `horror-corridor-v2.save/1`.
- V2 mounts 36 shipping core kits or 38 development core kits with `coreKits: false`, plus four selected generation kits, five domain DSKs, local behavior kits, and one coordination root.
- `window.__HORROR_CORRIDOR_V2__` is the stable external semantic control surface and logs elapsed time between calls.
- The semantic control surface can unlock and inspect browser audio so live proof verifies a running AudioContext and its bounded cue trace instead of assuming sound from encounter state.
- Manual semantic-control mode owns input completely; the browser frame loop must not overwrite harness input samples.
- PeerJS uses binary serialization because authoritative snapshots exceed the JSON channel's 16,300-byte limit; binary transport chunks them safely.
- The V1 live-player harness is reused through V2 compatibility surfaces; V1 harness source remains unchanged.
- Live review uses two explicit authorities: the invariant agent harness proves required branches, while the heuristic timeline explores the live player surface and delegates stalled stages to a bounded recovery agent on the same page.
- Successful timeline reviews add 120 simulated seconds to the next scheduled duration. Review state, event history, decisions, screenshots, and video remain durable under `HorrorCorridor-V2/docs/proofs/timeline-review/`.
- Timeline reviews restart the same deterministic route and therefore replay earlier prefixes. Report recorded simulated time, unique contiguous horizon, replayed time, and new tail separately in `feed.json`; raw run videos remain separate rather than implying a concatenated unique feed.
- The invariant live proof refreshes generated captures and its report, but preserves `*-decision.json` records and explicit `*-before.png` visual baselines.
- Public snapshots retain the complete Monster Index; runtime digests use a compact semantic Index projection and Expedition caches immutable snapshots between mutations.
- The stdio HorrorCorridor Authoring MCP is the sole external content-authoring interface. It exposes resolved catalog metadata, bounded context packets, a private development preview, evidence reviews, and allowlisted proofs; it exposes no arbitrary shell or unrestricted filesystem operation.
- Runtime TypeScript remains content authority. `.agent/authoring/` stores the metadata overlay, packets, deltas, reviews, proof state, append-only events, and accepted focused evidence.
- Authoring contexts preserve global intent while limiting implementation to one target, its natural neighborhood and dependencies, up to three relevance-ranked accepted deltas, evidence, and one action plan. Broader discoveries remain risks or future suggestions.
- Lifecycle advances only through adjacent evidence gates: `mapped → specified → previewed → playable → integrated → promoted`. Three accepted deltas in one related slice, or any cross-domain risk, makes cohesion review due.
- The internal authoring preview never starts gameplay, persistence, or networking. It reuses runtime content descriptors and the Three.js presentation adapter; normal `BrowserGame` and the public runtime API remain unchanged.
- Corridor rendering retains segment groups that overlap the streamed window and disposes only segments that leave it. Read-only semantic queries do not trigger presentation redraws, and proof loops reuse snapshots returned by `step`.

## Product Rules

- The corridor is an unbounded forward route rendered as a streamed window of deterministic eight-meter segments; crossing an offering/building boundary never teleports the party or places a blocking door.
- The authored traversal horizon is 240 streamed segments (1,920 meters): twelve natural districts with twelve grounded set-piece identities. At the standard 3.05 m/s pace it exceeds ten minutes, while the route remains unbounded beyond it.
- The Monster Index contains 124 manifestations across 34 families. Every profile owns a stable cue, sensory channel, movement rule, flashlight response, failure consequence, timing, tuning, color, and family silhouette.
- The opening encounter waits for 90 meters of safe traversal; later encounters wait for 55 meters. Dread then holds a 3.9–6.2 second audible sign phase before pursuit or monster rendering begins.
- Hidden warning audio uses six sensory-channel motifs—footstep, metal, breath, water, electrical, and voice—panned from Corridor acoustics and paced from authoritative expedition time. Its cadence tightens before pursuit; audio remains presentation-only and cannot decide outcomes.
- A monster can be studied by repelling it early or collected by surviving blackout and the last-chance response.
- During last chance, continued movement prevents capture; stopping allows the response timer to expire.
- A successful encounter opens one offering and the next building.
- Restart preserves the Monster Index; full reset does not.
- Promote local behavior into NexusEngine only after it proves reusable outside HorrorCorridor.
- Encounter presentation should prioritize a readable full silhouette, eyes, response distance, and threat-local lighting before adding more unrelated visual effects.
- District material names remain domain-owned descriptors; the Three.js adapter realizes them as cached deterministic wall, floor, and metal maps. Beam and ambient balance should retain those surface cues instead of clipping nearby walls to white.
- Natural set-piece identity remains content-owned. The Three.js adapter may compose a named descriptor into a grounded facade and detailed prop silhouette, but it must keep the central route open and must not invent gameplay outcomes.
- The opening `service-nook` remains content-owned; its Three.js realization is a recessed maintenance bay. Fan motion and local indicator lighting are presentation only.
- `empty-pantry` remains content-owned; its Three.js realization is a recessed, partially shuttered ration bay. The sign, shelf contents, sacks, and local amber pool communicate scarcity without owning interaction or progression.
- `sealed-nursery` remains content-owned; its Three.js realization is a recessed Charity Ward vignette with a crib, mobile, blocks, height marks, sealed sign, and paired cold/red light. These are presentation details only.
- `abandoned-clinic` remains content-owned; its Three.js realization is a recessed Charity Ward triage bay with a wheeled gurney, medicine cabinet, IV stand, examination lamp, warning sign, and contained cold light. These are presentation details only.
- `flooded-laundry` remains content-owned; its Three.js realization is a recessed Flood Line washroom with a washer bank, wet-linen cart, raised hanging linen, standing water, floor drain, warning sign, and paired cyan/red light. These are presentation details only, and the central route stays open.
- `pilgrim-alcove` remains content-owned; its Three.js realization is a recessed Pilgrim Mile shrine with a faceless haloed effigy, votives, kneeler, prayer strips, explicit keep-moving warning, and contained amber/sickly light. These are presentation details only, and the central route stays open.
- `boiler-shrine` remains content-owned; its Three.js realization is a recessed pressure-vessel chapel with a furnace hatch, gauge, valve, ritual pressure offerings, chain reliquary, doctrine plate, chalk traces, and contained furnace/warning light. These are presentation details only, and the central route stays open.
- `night-archive` remains content-owned; its Three.js realization is a recessed Records Below filing bay with labeled drawers, one disturbed open file, chained cabinet, sorting cart, accession cards, explicit records doctrine, and contained cold/red light. These are presentation details only, and the central route stays open.
- `ticket-hall` remains content-owned; its Three.js realization is a wall-aligned Records Below concourse with distinct service wickets, shutter and grilles, transaction tools, stopped clock, queue rail, explicit one-way doctrine, and contained cold/red light. These are presentation details only, and the central route stays open.
- `workers-dormitory` remains content-owned; its Three.js realization is a recessed Last Platform shift barracks with stacked bunks, layered bedding, ladder and rails, worker storage and clothing, personal effects, explicit sleep doctrine, and contained violet/red light. These are presentation details only, and the central route stays open.
- `mortuary-bay` remains content-owned; its Three.js realization is a recessed Provision Tombs cold-intake bay with numbered body drawers, one attached open tray, a wheeled autopsy slab, instrument stand, floor drain, refrigeration lines, explicit counting doctrine, and contained cold/red light. These are presentation details only, and the central route stays open.
