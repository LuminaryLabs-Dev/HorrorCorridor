# HorrorCorridor Authoring MCP

The stdio MCP server is the external content-authoring interface. Runtime TypeScript remains authoritative; the catalog resolves it with lifecycle metadata instead of copying gameplay values.

## Connect

Install dependencies, then use [mcp-config.example.json](../tools/authoring-mcp/mcp-config.example.json) in an MCP host. The server command is:

```bash
npm run --silent authoring:mcp
```

Direct host configuration uses `node_modules/.bin/tsx` so npm banners cannot corrupt stdio. Diagnostics use stderr. No authoring HTTP endpoint is opened; Playwright privately owns a loopback Vite host only while preview or proof work needs it.

## Workflow

```text
catalog target
  -> context capsule
    -> bounded packet
      -> claimed implementation
        -> submitted delta
          -> evidence review
            -> adjacent lifecycle transition
```

Lifecycle: `mapped → specified → previewed → playable → integrated → promoted`.

- A context capsule contains global intent, the target, neighbors, direct dependencies, evidence, and at most three accepted deltas ranked by target, neighborhood/dependency overlap, then recency.
- A packet fixes the domain boundary, action plan, editable files, and acceptance criteria.
- Submission records work but never advances lifecycle.
- Review advances only one evidence gate. Focused, cohesion, and promotion gates require a passing proof.
- Three accepted deltas in one related slice, or one cross-domain risk, sets `cohesionDue`.
- Suggestions may be returned as future work but cannot widen the active packet.

## Surface

| Area | Tools |
|---|---|
| Observe | `horror_authoring_status`, `catalog_list`, `content_get`, `context_build` |
| Packets | `packet_create`, `packet_claim`, `packet_submit`, `review_record`, `content_transition` |
| Preview | `preview_open`, `preview_update`, `preview_capture`, `preview_close` |
| Proof | `proof_start`, `proof_status`, `proof_cancel`, `promotion_evaluate` |
| Worker | `worker_dispatch` (disabled until explicitly configured) |

Every tool returns `horror-corridor.authoring-tool-result/1` with `success`, `data` or `error`, artifact references, durable state revision, and elapsed milliseconds. The same timing and outcome are appended to `.agent/authoring/events.jsonl`.

Resources expose intent, the complete resolved catalog, individual content, packets, proof reports, live preview sessions, and preview PNGs. Prompts provide canonical implementation, focused-review, cohesion, and promotion instructions.

## Preview and proof

The development-only preview selects a set piece, district, monster, phase, and camera without starting gameplay, persistence, networking, or route traversal. `mortuary-bay`, `cold-delivery`, and `morgue-twin-hushed` are the golden slice.

Focused proof captures initial, approach, left, and right player views. Warm captures must finish within five seconds; the complete focused proof must finish within thirty. Cohesion proof limits review to changed content and immediate context. Promotion runs the static milestone command allowlist.

```bash
npm run proof:authoring-mcp
```

This command connects as a real stdio client, lists and exercises all tools, prompts, resources, and templates, validates structured failures and context relevance, captures the golden slice, cancels a queued promotion, and verifies clean shutdown.

## State and boundaries

- Mutable records: `.agent/authoring/`
- Accepted focused evidence: `.agent/authoring/evidence/`
- Transient browser output: `HorrorCorridor-V2/artifacts/authoring/`
- Editable packet paths: repository-relative V2 or `.agent` paths only
- Rejected: absolute paths, traversal, V1 paths, arbitrary shell, unrestricted filesystem access

Normal `BrowserGame` behavior and `createHorrorCorridorV2` remain unchanged. The preview exists only when Vite development mode and `?authoring=1` are both active.
