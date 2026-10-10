# CurveCraft

CurveCraft is a read-only Meteora Dynamic Bonding Curve (DBC) design studio. It builds curve parameters with the pinned Meteora SDK, validates fees and liquidity, presents SDK-derived quote reserves, and exports config parameters plus a launch constitution. Its live inspector decodes a DBC pool config from the same account bytes and confirmed slot returned by the RPC.

## Run and verify

From the repository root:

```sh
npm ci
npm run dev:curvecraft
npm run typecheck --workspace @worlds-fair/curvecraft
npm run lint --workspace @worlds-fair/curvecraft
npm run test --workspace @worlds-fair/curvecraft
npm run build --workspace @worlds-fair/curvecraft
```

The Vite server prints a local URL (5174 by default). There are no required environment variables; see [.env.example](.env.example). The project builds to `projects/curvecraft/dist`.

## Workflow

1. Select a preset or set supply, quote-token precision, target market caps, and one to sixteen curve segments.
2. Adjust fee schedule, migration fee allocation, and locked-liquidity share. CurveCraft runs the Meteora SDK curve builder and its relevant validators; when a valid leftover-receiver public key is supplied it also runs `validateConfigParameters`.
3. Review the log-scale price path, SDK-derived migration quote threshold, validation boundary, and DAMM v2 migration target.
4. Export config JSON or a launch constitution. These are planning artifacts, not deployable transactions.
5. Optionally inspect a public DBC config account. The browser calls the entered HTTPS RPC directly, verifies the DBC program owner, then decodes the captured bytes with the SDK coder. It does not scan the chain.

## Accuracy and safety boundaries

- Market caps are denominated in quote-token units. They are USD only if a supported USD stablecoin is selected; the app does not fetch a quote-mint price.
- The builder uses Meteora SDK math and validation, not a price forecast. External token-price assumptions and market impact are not simulated.
- Curve-only mode is explicitly incomplete for launch. Supplying a public receiver enables the SDK's full config-parameter validator, but does not prove receiver control, selected quote-mint support, token-extension compatibility, account creation, or launch readiness.
- New Meteora DBC configurations target DAMM v2. The displayed 0.2% protocol migration fee is separate from the configurable partner/creator migration fee.
- Live account fields are decoded from the returned confirmed account snapshot. Cluster identity is a separate RPC read; the account can change after the displayed slot.
- The tool has no wallet connection and creates, signs, or sends no transaction. Never paste private keys or seed phrases.

## Deployment

Build the static site with `npm run build --workspace @worlds-fair/curvecraft` from the repository root and publish `projects/curvecraft/dist` using a static host configured for this monorepo. No hosting provider, public URL, or deployment credential is configured or verified. The repository is private; obtain the user's approval before changing repository visibility or publishing its code.

## Live smoke evidence

Chromium verified a real mainnet DBC config read through `https://solana-rpc.publicnode.com`. The SDK decoded a config owned by Meteora's DBC program and rendered the confirmed context slot, account size, DAMM v2 migration option, curve points, and raw quote threshold. This is a read-only smoke test, not an exhaustive compatibility check for all DBC account variants.
