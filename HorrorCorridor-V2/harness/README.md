# V2 Harness Types

Harnesses validate domain behavior; they never own gameplay outcomes.

| Type | Authority | Layers | Purpose | Entrypoint |
|---|---|---|---|---|
| Content routing | Agent | Chain | Prove deterministic generator/service-door coverage, placement boundaries, and catalog parity. | `npm run harness:content-routing` |
| Cumulative play review | Orchestrator | Workflow → Stage → Chain | Extend live player review and hand stalled gameplay to bounded recovery. | `npm run review:timeline` |

Contracts:

- [content-routing.contract.json](content-routing.contract.json)
- [play-review.contract.json](play-review.contract.json)

Content routing writes immutable run evidence under `artifacts/content-routing-harness/<runId>/`. The service under `src/content/` remains authoritative; the harness only calls and validates it.
