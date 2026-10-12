# CurveCraft

CurveCraft is a read-only workspace for designing and reviewing Meteora Dynamic Bonding Curve (DBC) parameters. It builds curve settings with the pinned Meteora SDK, validates selected fee and liquidity parameters, shows an SDK-derived quote-reserve threshold, and exports config JSON plus a Markdown launch-planning document. Its live inspector verifies the DBC program owner and decodes returned account bytes with the SDK.

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

1. Select a parameter preset or set supply, quote-decimal assumptions, market-cap inputs, and one to sixteen curve segments.
2. Adjust the base-fee schedule, migration fee allocation, and locked-liquidity share. The tool runs selected Meteora SDK builders and validators; with a parseable leftover-receiver address it also calls `validateConfigParameters`.
3. Review the log-scale SDK curve path, SDK-derived migration quote-reserve threshold, validation boundary, and DAMM v2 migration parameters. The resulting DAMM v2 pool is not modeled.
4. Export config JSON or a Markdown launch plan. These are review artifacts, not deployable transactions; the Markdown file is not legal advice or an on-chain instrument.
5. Optionally inspect a public DBC config account. The browser calls the entered HTTPS RPC directly, verifies the DBC program owner, then decodes the captured bytes with the SDK coder. It does not scan the chain.

## Accuracy and safety boundaries

- Market-cap and price inputs use quote-token units and decimals as assumptions. No quote mint is selected, no USD price is fetched, and no oracle conversion is applied.
- The builder uses Meteora SDK math and validation, not a price forecast. External token-price assumptions and market impact are not simulated.
- Curve-only mode checks selected curve and migration parameters, not the full config-parameter validator. Supplying a parseable receiver enables that validator, but does not prove receiver control, quote-mint support, token-extension compatibility, account creation, or launch readiness.
- New Meteora DBC configurations target DAMM v2. The documented 0.2% protocol liquidity migration fee is separate from the configurable partner/creator migration fee and reduces liquidity deposited at migration. See the [official formulas](https://docs.meteora.ag/core-products/dbc/formulas).
- Live account fields are decoded from the returned confirmed account snapshot. Cluster identity is a separate RPC read; the account can change after the displayed slot.
- The tool has no wallet connection and creates, signs, or sends no transaction. Never paste private keys or seed phrases.

## Deployment

The live static app is deployed at https://worlds-fair-curvecraft-production.up.railway.app/. To reproduce the build, run `npm run build --workspace @worlds-fair/curvecraft` at the repository root; the output is `projects/curvecraft/dist`. Railway serves it with the repository's production static server. The GitHub repository is private; public visitors cannot inspect the linked source without authorization.

## Live smoke evidence

Chromium verified a real mainnet DBC config read through `https://solana-rpc.publicnode.com`. The SDK decoded a config owned by Meteora's DBC program and rendered the confirmed context slot, account size, DAMM v2 migration option, curve points, and raw quote threshold. This is a read-only smoke test, not an exhaustive compatibility check for all DBC account variants.
