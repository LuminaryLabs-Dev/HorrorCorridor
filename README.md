# HorrorCorridor

`HorrorCorridor-V2` is the active game. `HorrorCorridor-V1` remains a runnable visual, behavioral, and content reference; V2 does not import it at runtime.

```text
HorrorCorridor/
├── HorrorCorridor-V1/   preserved reference game and original harness
└── HorrorCorridor-V2/   active domain-first Vite game
```

Run V2:

```bash
cd HorrorCorridor-V2
npm install
npm run dev
```

Controls: `WASD` move · mouse look/listen · `F` flashlight · `E` interact · `I` Monster Index · `P` pause.

Validation:

```bash
cd HorrorCorridor-V2
npm run validate
npm run proof:authoring-mcp
npm run proof:live
npm run proof:legacy  # run while the V2 dev server is live
```

See [HorrorCorridor-V2/README.md](HorrorCorridor-V2/README.md) for architecture, runtime contracts, multiplayer URLs, authoring MCP setup, and proof details.
