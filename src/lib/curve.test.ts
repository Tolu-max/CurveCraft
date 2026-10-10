import { describe, expect, it } from "vitest";
import { Keypair } from "@solana/web3.js";
import {
  buildCurveDesign,
  DEFAULT_INPUT,
  serializeCurveConfiguration,
  validateRpcEndpoint,
} from "./curve";

describe("CurveCraft Meteora DBC modeling", () => {
  it("builds a single-segment curve and passes the SDK's full config validator with a receiver", async () => {
    const input = {
      ...DEFAULT_INPUT,
      segmentCount: 1,
      leftoverReceiver: Keypair.generate().publicKey.toBase58(),
    };
    const design = await buildCurveDesign(input);

    expect(design.sdkValidation).toBe("curve-and-config");
    expect(design.points).toHaveLength(2);
    expect(design.configuration.migrationOption).toBe(1);
    expect(BigInt(design.migrationQuoteThresholdRaw)).toBeGreaterThan(0n);
  });

  it("uses the SDK's custom sqrt-price builder for a weighted multi-segment curve", async () => {
    const design = await buildCurveDesign({
      ...DEFAULT_INPUT,
      segmentCount: 5,
      curveShape: "more-liquidity-late",
    });

    expect(design.points).toHaveLength(6);
    expect(design.sdkValidation).toBe("curve-only");
    expect(Number(design.points.at(-1)?.marketCap)).toBeCloseTo(DEFAULT_INPUT.graduationMarketCap, 0);
  });

  it("rejects reversed market-cap boundaries before invoking curve math", async () => {
    await expect(buildCurveDesign({
      ...DEFAULT_INPUT,
      initialMarketCap: 1_000_000,
      graduationMarketCap: 10_000,
    })).rejects.toThrow("must be higher");
  });

  it("rejects curve shapes outside Meteora's sixteen-segment limit", async () => {
    await expect(buildCurveDesign({ ...DEFAULT_INPUT, segmentCount: 17 })).rejects.toThrow("one to sixteen");
  });

  it("builds the documented sixteen-segment upper boundary", async () => {
    const design = await buildCurveDesign({ ...DEFAULT_INPUT, segmentCount: 16 });
    expect(design.points).toHaveLength(17);
  });

  it("enforces the documented minimum day-one locked liquidity", async () => {
    await expect(buildCurveDesign({ ...DEFAULT_INPUT, lockedLiquidityPercent: 9 })).rejects.toThrow("At least 10%");
  });

  it("rejects fractional fee and allocation percentages", async () => {
    await expect(buildCurveDesign({ ...DEFAULT_INPUT, startingFeeBps: 500.5 })).rejects.toThrow("whole basis points");
    await expect(buildCurveDesign({ ...DEFAULT_INPUT, partnerSharePercent: 50.5 })).rejects.toThrow("whole numbers");
  });

  it("serializes SDK big numbers as decimal strings and records incomplete validation", async () => {
    const design = await buildCurveDesign(DEFAULT_INPUT);
    const json = serializeCurveConfiguration(DEFAULT_INPUT, design);
    const report = JSON.parse(json) as {
      validation: string;
      configParameters: { migrationQuoteThreshold: string };
      warnings: string[];
    };

    expect(report.validation).toBe("curve-only");
    expect(report.configParameters.migrationQuoteThreshold).toBe(design.migrationQuoteThresholdRaw);
    expect(report.warnings.join(" ")).toContain("not a launch-ready config");
    expect(json).not.toContain("[object Object]");
  });

  it("permits HTTPS endpoints and local validators but blocks remote HTTP and embedded credentials", () => {
    expect(validateRpcEndpoint("https://api.mainnet-beta.solana.com").hostname).toBe("api.mainnet-beta.solana.com");
    expect(validateRpcEndpoint("http://127.0.0.1:8899").hostname).toBe("127.0.0.1");
    expect(() => validateRpcEndpoint("http://rpc.example.com")).toThrow("Use HTTPS");
    expect(() => validateRpcEndpoint("https://key:secret@rpc.example.com")).toThrow("Remove URL credentials");
  });
});
