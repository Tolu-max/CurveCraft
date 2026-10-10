import { useEffect, useState, type FormEvent } from "react";
import {
  buildCurveDesign,
  buildLaunchConstitution,
  DEFAULT_INPUT,
  DEFAULT_RPC,
  inspectDbcConfig,
  serializeCurveConfiguration,
  type CurveDesign,
  type CurveInput,
  type LiveConfigInspection,
} from "./lib/curve";

type BuildResult = { ok: true; design: CurveDesign } | { ok: false; message: string };
type SavedDesign = { input: CurveInput; design: CurveDesign };

function formatPrice(value: string): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return value;
  return new Intl.NumberFormat("en-US", { maximumSignificantDigits: 5 }).format(number);
}

function formatInteger(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function downloadFile(name: string, contents: string, type: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function CurveChart({ design }: { design: CurveDesign }) {
  const values = design.points.map((point) => Math.log10(Math.max(Number(point.price), Number.MIN_VALUE)));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const coords = values.map((value, index) => ({
    x: 42 + index * (476 / Math.max(1, values.length - 1)),
    y: 204 - ((value - min) / range) * 148,
  }));
  const line = coords.map(({ x, y }) => `${x},${y}`).join(" ");
  const area = `${coords[0]?.x ?? 42},228 ${line} ${coords.at(-1)?.x ?? 518},228`;

  return (
    <div className="curve-chart" role="img" aria-label={`SDK-generated curve with ${design.points.length - 1} segments from ${formatPrice(design.points[0]?.price ?? "0")} to ${formatPrice(design.points.at(-1)?.price ?? "0")} quote units per token`}>
      <svg viewBox="0 0 560 260" aria-hidden="true" focusable="false">
        <defs><linearGradient id="curve-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#c3ff52" stopOpacity=".23" /><stop offset="100%" stopColor="#c3ff52" stopOpacity="0" /></linearGradient></defs>
        <path d="M42 28V228H520" className="chart-axis" />
        <path d="M42 72H520M42 128H520M42 184H520" className="chart-grid" />
        <polygon points={area} fill="url(#curve-fill)" />
        <polyline points={line} className="chart-line" />
        {coords.map(({ x, y }) => <circle key={x} cx={x} cy={y} r="4" className="chart-point" />)}
        <text x="42" y="248" className="chart-label">START</text>
        <text x="520" y="248" textAnchor="end" className="chart-label">GRADUATION</text>
        <text x="42" y="20" className="chart-label">PRICE · LOG SCALE</text>
      </svg>
      <ol className="curve-point-list" aria-label="SDK curve checkpoint prices">
        {design.points.map((point, index) => <li key={point.price}><span>{index === 0 ? "Start" : index === design.points.length - 1 ? "Migration" : `Segment ${index}`}</span><code>{formatPrice(point.price)}</code></li>)}
      </ol>
    </div>
  );
}

function App() {
  const [input, setInput] = useState<CurveInput>(DEFAULT_INPUT);
  const [result, setResult] = useState<BuildResult | null>(null);
  const [baseline, setBaseline] = useState<SavedDesign | null>(null);
  const [rpc, setRpc] = useState(DEFAULT_RPC);
  const [configAddress, setConfigAddress] = useState("");
  const [inspection, setInspection] = useState<LiveConfigInspection | null>(null);
  const [inspectionError, setInspectionError] = useState("");
  const [inspecting, setInspecting] = useState(false);

  useEffect(() => {
    let active = true;
    setResult(null);
    buildCurveDesign(input).then((design) => {
      if (active) setResult({ ok: true, design });
    }).catch((error: unknown) => {
      if (active) setResult({ ok: false, message: error instanceof Error ? error.message : "Configuration could not be validated." });
    });
    return () => { active = false; };
  }, [input]);

  const update = <K extends keyof CurveInput>(key: K, value: CurveInput[K]) => {
    setInput((current) => ({ ...current, [key]: value }));
  };

  const choosePreset = (preset: "balanced" | "longer-discovery" | "faster-graduation") => {
    if (preset === "balanced") setInput({ ...DEFAULT_INPUT, leftoverReceiver: input.leftoverReceiver });
    if (preset === "longer-discovery") setInput({ ...DEFAULT_INPUT, graduationMarketCap: 5_000_000, segmentCount: 8, curveShape: "more-liquidity-late", lockedLiquidityPercent: 90, leftoverReceiver: input.leftoverReceiver });
    if (preset === "faster-graduation") setInput({ ...DEFAULT_INPUT, initialMarketCap: 20_000, graduationMarketCap: 250_000, segmentCount: 3, curveShape: "more-liquidity-early", startingFeeBps: 300, endingFeeBps: 100, leftoverReceiver: input.leftoverReceiver });
  };

  const saveBaseline = () => {
    if (result?.ok) setBaseline({ input: { ...input }, design: result.design });
  };

  const inspect = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setInspection(null);
    setInspectionError("");
    setInspecting(true);
    try {
      setInspection(await inspectDbcConfig(rpc, configAddress));
    } catch (error) {
      setInspectionError(error instanceof Error ? error.message : "Could not inspect this DBC account.");
    } finally {
      setInspecting(false);
    }
  };

  const onNumber = (key: keyof CurveInput) => (event: React.ChangeEvent<HTMLInputElement>) => {
    update(key, Number(event.target.value) as CurveInput[typeof key]);
  };

  const currentDesign = result?.ok ? result.design : null;
  const quoteLabel = input.quoteDecimals === 6 ? "quote units · 6 decimals" : "quote units · 9 decimals";

  return (
    <main className="studio-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="CurveCraft home"><span className="brand-mark"><i /><i /><i /></span><span>CURVE<span>CRAFT</span></span></a>
        <div className="topbar-center"><span className="online-dot" /> METEORA DBC STUDIO <span className="slash">/</span> SDK {currentDesign?.sdkVersion ?? "1.5.13"}</div>
        <a className="source-link" href="https://github.com/Tolu-max/SuperteamOpportunaity/tree/feat/solana-live/projects/curvecraft" target="_blank" rel="noreferrer">SOURCE ↗</a>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy"><p className="eyebrow"><span /> CONFIGURE · MODEL · VERIFY</p><h1>Design the curve<br /><em>before launch.</em></h1><p className="hero-description">Engineer a Meteora Dynamic Bonding Curve with SDK-backed economics, fees, and DAMM v2 graduation analysis.</p><div className="read-only"><span aria-hidden="true">◈</span> Read-only by design · No wallet · No transactions</div></div>
        <div className="hero-stamp"><span>DBC PROGRAM</span><code>dbcij3…SMaqN</code><a href="https://docs.meteora.ag/core-products/dbc/what-is-dbc" target="_blank" rel="noreferrer">Protocol documentation ↗</a></div>
      </section>

      <div className="studio-grid">
        <section className="builder-panel" aria-labelledby="builder-title">
          <div className="panel-heading"><div><span className="eyebrow">01 / CONFIGURATION</span><h2 id="builder-title">Build a launch model</h2></div><span className="mainnet-tag">MODEL ONLY</span></div>

          <fieldset className="preset-row"><legend className="sr-only">Configuration presets</legend><span>START FROM</span><button type="button" onClick={() => choosePreset("balanced")}>Balanced</button><button type="button" onClick={() => choosePreset("longer-discovery")}>Long discovery</button><button type="button" onClick={() => choosePreset("faster-graduation")}>Faster graduation</button></fieldset>

          <div className="form-section"><div className="form-section-heading"><span className="section-index">A</span><div><h3>Supply &amp; price path</h3><p>Market caps use quote-token units, not an external USD price.</p></div></div>
            <div className="field-grid">
              <label className="field"><span>Initial market cap</span><div className="number-input"><input aria-label="Initial market cap in quote units" type="number" min="1" step="100" value={input.initialMarketCap} onChange={onNumber("initialMarketCap")} /><b>QUOTE</b></div></label>
              <label className="field"><span>Graduation market cap</span><div className="number-input"><input aria-label="Graduation market cap in quote units" type="number" min="1" step="1000" value={input.graduationMarketCap} onChange={onNumber("graduationMarketCap")} /><b>QUOTE</b></div></label>
              <label className="field"><span>Total token supply</span><input aria-label="Total token supply" className="plain-input" type="number" min="1" step="1000000" value={input.totalTokenSupply} onChange={onNumber("totalTokenSupply")} /></label>
              <label className="field"><span>Leftover token amount</span><input aria-label="Leftover token amount" className="plain-input" type="number" min="1" step="100" value={input.leftoverTokens} onChange={onNumber("leftoverTokens")} /></label>
              <label className="field"><span>Token decimals</span><select aria-label="Token decimals" value={input.tokenDecimals} onChange={(event) => update("tokenDecimals", Number(event.target.value) as CurveInput["tokenDecimals"])}><option value="6">6</option><option value="7">7</option><option value="8">8</option><option value="9">9</option></select></label>
              <label className="field"><span>Quote decimals</span><select aria-label="Quote decimals" value={input.quoteDecimals} onChange={(event) => update("quoteDecimals", Number(event.target.value) as CurveInput["quoteDecimals"])}><option value="6">6 · stablecoin example</option><option value="9">9 · SOL example</option></select></label>
              <label className="field"><span>Curve segments <small>max 16</small></span><input aria-label="Curve segment count" className="plain-input" type="number" min="1" max="16" step="1" value={input.segmentCount} onChange={onNumber("segmentCount")} /></label>
              <label className="field"><span>Segment liquidity shape</span><select aria-label="Segment liquidity shape" value={input.curveShape} onChange={(event) => update("curveShape", event.target.value as CurveInput["curveShape"])}><option value="balanced">Balanced weights</option><option value="more-liquidity-early">More liquidity in early segments</option><option value="more-liquidity-late">More liquidity in later segments</option></select></label>
            </div>
          </div>

          <div className="form-section"><div className="form-section-heading"><span className="section-index">B</span><div><h3>Trading fees</h3><p>Fee endpoints are basis points; 100 bps equals 1%.</p></div></div>
            <div className="field-grid">
              <label className="field"><span>Starting fee</span><div className="number-input"><input aria-label="Starting fee in basis points" type="number" min="25" max="9900" step="25" value={input.startingFeeBps} onChange={onNumber("startingFeeBps")} /><b>BPS</b></div></label>
              <label className="field"><span>Ending fee</span><div className="number-input"><input aria-label="Ending fee in basis points" type="number" min="25" max="9900" step="25" value={input.endingFeeBps} onChange={onNumber("endingFeeBps")} /><b>BPS</b></div></label>
              <label className="field"><span>Schedule duration</span><div className="number-input"><input aria-label="Fee schedule duration in seconds" type="number" min="60" step="60" value={input.feeDurationSeconds} onChange={onNumber("feeDurationSeconds")} /><b>SECONDS</b></div></label>
              <label className="field"><span>Schedule type</span><select aria-label="Fee schedule type" value={input.feeSchedule} onChange={(event) => update("feeSchedule", event.target.value as CurveInput["feeSchedule"])}><option value="linear">Linear decrease</option><option value="exponential">Exponential decrease</option></select></label>
              <label className="toggle-field"><input aria-label="Enable dynamic fee" type="checkbox" checked={input.dynamicFeeEnabled} onChange={(event) => update("dynamicFeeEnabled", event.target.checked)} /><span><b>Dynamic fee</b><small>Volatility-based fee parameters from SDK defaults</small></span></label>
            </div>
          </div>

          <div className="form-section"><div className="form-section-heading"><span className="section-index">C</span><div><h3>Graduation &amp; allocation</h3><p>New DBC configurations migrate to DAMM v2.</p></div></div>
            <div className="field-grid">
              <label className="field"><span>Migration fee</span><div className="number-input"><input aria-label="Migration fee percent" type="number" min="0" max="99" step="1" value={input.migrationFeePercent} onChange={onNumber("migrationFeePercent")} /><b>%</b></div></label>
              <label className="field"><span>Creator share of migration fee</span><div className="number-input"><input aria-label="Creator migration fee share percent" type="number" min="0" max="100" step="1" value={input.creatorMigrationFeePercent} onChange={onNumber("creatorMigrationFeePercent")} /><b>%</b></div></label>
              <label className="field"><span>Liquidity permanently locked</span><div className="number-input"><input aria-label="Permanently locked liquidity percent" type="number" min="10" max="100" step="1" value={input.lockedLiquidityPercent} onChange={onNumber("lockedLiquidityPercent")} /><b>%</b></div></label>
              <label className="field"><span>Partner share of liquidity</span><div className="number-input"><input aria-label="Partner share of liquidity percent" type="number" min="0" max="100" step="1" value={input.partnerSharePercent} onChange={onNumber("partnerSharePercent")} /><b>%</b></div></label>
              <label className="field field--wide"><span>Leftover receiver public key <small>optional for full SDK validation</small></span><input aria-label="Leftover receiver public key" className="plain-input public-key-input" autoComplete="off" spellCheck={false} value={input.leftoverReceiver} onChange={(event) => update("leftoverReceiver", event.target.value)} placeholder="Add a real receiver address; no private key" /></label>
            </div>
          </div>
          {result?.ok ? <div className={`validation-banner validation-banner--${result.design.sdkValidation === "curve-and-config" ? "complete" : "partial"}`} role="status"><span className="validation-icon">{result.design.sdkValidation === "curve-and-config" ? "✓" : "!"}</span><div><b>{result.design.sdkValidation === "curve-and-config" ? "SDK configuration checks passed" : "Curve checks passed · config incomplete"}</b><p>{result.design.validationNote}</p></div></div> : result ? <div className="validation-banner validation-banner--error" role="alert"><span className="validation-icon">!</span><div><b>Review configuration inputs</b><p>{result.message}</p></div></div> : <div className="validation-banner validation-banner--partial" role="status"><span className="validation-icon">…</span><div><b>Loading Meteora SDK</b><p>Building the curve and running local validation.</p></div></div>}
        </section>

        <aside className="preview-column">
          <section className="preview-card" aria-labelledby="preview-title">
            <div className="panel-heading"><div><span className="eyebrow">02 / CURVE PREVIEW</span><h2 id="preview-title">Price discovery</h2></div><span className="mini-badge">SDK OUTPUT</span></div>
            {currentDesign ? <>
              <CurveChart design={currentDesign} />
              <div className="economics-grid"><div><span>QUOTE TO GRADUATION</span><strong>{currentDesign.migrationQuoteThreshold}</strong><small>{quoteLabel}</small></div><div><span>GRADUATION TARGET</span><strong>{formatInteger(input.graduationMarketCap)}</strong><small>{quoteLabel}</small></div></div>
              <p className="precision-note">Reserve threshold is derived from the SDK’s integer configuration. Market-cap labels use your quote-unit assumption; no oracle price is applied.</p>
              <div className="preview-actions"><button type="button" disabled={!result?.ok} onClick={() => result?.ok && downloadFile("curvecraft-config.json", serializeCurveConfiguration(input, result.design), "application/json")}>Export config JSON</button><button type="button" disabled={!result?.ok} onClick={() => result?.ok && downloadFile("curvecraft-launch-constitution.md", buildLaunchConstitution(input, result.design), "text/markdown")}>Export constitution</button></div>
              <button className="baseline-button" type="button" disabled={!result?.ok} onClick={saveBaseline}>{baseline ? "Replace comparison baseline" : "Save as comparison baseline"}</button>
            </> : <div className="empty-preview">Correct the highlighted values to rebuild this SDK preview.</div>}
          </section>

          {baseline && currentDesign && <section className="comparison-card" aria-labelledby="comparison-title"><div className="panel-heading"><div><span className="eyebrow">03 / DESIGN REVIEW</span><h2 id="comparison-title">Compared with baseline</h2></div><button type="button" className="text-button" onClick={() => setBaseline(null)}>Clear</button></div><div className="compare-stat"><span>Segments</span><b>{baseline.input.segmentCount} <i>→</i> {input.segmentCount}</b></div><div className="compare-stat"><span>Graduation market cap</span><b>{formatInteger(baseline.input.graduationMarketCap)} <i>→</i> {formatInteger(input.graduationMarketCap)}</b></div><div className="compare-stat"><span>SDK quote reserve</span><b>{baseline.design.migrationQuoteThreshold} <i>→</i> {currentDesign.migrationQuoteThreshold}</b></div><p>Both amounts use their own quote-decimal setting. This is a parameter comparison, not a forecast.</p></section>}
        </aside>
      </div>

      <section className="constitution-section" aria-labelledby="constitution-title">
        <div className="constitution-copy"><span className="eyebrow">04 / LAUNCH CONSTITUTION</span><h2 id="constitution-title">Make every assumption inspectable.</h2><p>Turn the model into a review document for your launch team. CurveCraft spells out the quote unit, migration path, fee split, locked allocation, and validation gaps.</p></div>
        <div className="constitution-preview">{currentDesign ? <pre>{buildLaunchConstitution(input, currentDesign)}</pre> : <p>Fix the configuration to generate the constitution.</p>}</div>
      </section>

      <section className="inspector-section" aria-labelledby="inspector-title">
        <div className="inspector-intro"><span className="eyebrow">05 / LIVE PROTOCOL READ</span><h2 id="inspector-title">Inspect a DBC config account.</h2><p>Reads account owner, context slot, and decoded config fields with Meteora’s SDK. Your browser sends read-only requests directly to the RPC URL you enter.</p></div>
        <form className="inspect-form" onSubmit={inspect}>
          <label className="field"><span>RPC endpoint</span><input className="plain-input public-key-input" type="password" autoComplete="off" spellCheck={false} value={rpc} onChange={(event) => setRpc(event.target.value)} /><small className="field-help">HTTPS endpoints only, except local validators. Provider URLs are not saved.</small></label>
          <label className="field"><span>DBC config account</span><input className="plain-input public-key-input" autoComplete="off" spellCheck={false} value={configAddress} onChange={(event) => setConfigAddress(event.target.value)} placeholder="Paste a public config account address" /></label>
          <button className="inspect-button" type="submit" disabled={inspecting}>{inspecting ? "Reading account…" : "Inspect config ↗"}</button>
        </form>
        {inspectionError && <p className="inspection-error" role="alert">{inspectionError}</p>}
        {inspection && <div className="inspection-result" role="status"><div><span>CLUSTER</span><b>{inspection.cluster}</b></div><div><span>CONTEXT SLOT</span><b>{formatInteger(inspection.contextSlot)}</b></div><div><span>OWNER</span><code title={inspection.owner}>{inspection.owner.slice(0, 8)}…{inspection.owner.slice(-6)}</code></div><div><span>DATA LENGTH</span><b>{formatInteger(inspection.dataLength)} bytes</b></div><div><span>MIGRATION PATH</span><b>{inspection.migrationOption === 1 ? "DAMM v2" : "Legacy / inspect"}</b></div><div><span>CURVE POINTS</span><b>{inspection.curvePoints}</b></div><div><span>QUOTE THRESHOLD</span><b>{inspection.migrationQuoteThreshold} base units</b></div><div><span>READ ADDRESS</span><code title={inspection.address}>{inspection.address.slice(0, 8)}…{inspection.address.slice(-6)}</code></div></div>}
        <p className="inspector-note">The SDK decodes the account bytes captured at the displayed confirmed slot. Cluster identity is a separate read. The inspector does not discover quote-mint support, verify receiver control, create instructions, or submit transactions; the account may change after the read.</p>
      </section>

      <footer className="footer"><span>CURVECRAFT · METEORA DBC ENGINEERING STUDIO</span><div><a href="https://docs.meteora.ag/core-products/dbc/launch-configurations" target="_blank" rel="noreferrer">Launch config docs ↗</a><a href="https://docs.meteora.ag/core-products/dbc/formulas" target="_blank" rel="noreferrer">Formula reference ↗</a></div></footer>
    </main>
  );
}

export default App;
