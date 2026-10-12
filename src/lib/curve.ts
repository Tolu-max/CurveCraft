import type { ConfigParameters } from "@meteora-ag/dynamic-bonding-curve-sdk";
import { Buffer } from "buffer";

if (typeof globalThis.Buffer === "undefined") {
  Object.defineProperty(globalThis, "Buffer", { value: Buffer, configurable: true });
}

type MeteoraSdk = typeof import("@meteora-ag/dynamic-bonding-curve-sdk");
type TokenDecimalValue = import("@meteora-ag/dynamic-bonding-curve-sdk").TokenDecimal;

export const SDK_VERSION = "1.5.13";
export const DEFAULT_RPC = "https://solana-rpc.publicnode.com";

export interface CurveInput {
  initialMarketCap: number;
  graduationMarketCap: number;
  totalTokenSupply: number;
  leftoverTokens: number;
  tokenDecimals: 6 | 7 | 8 | 9;
  quoteDecimals: 6 | 9;
  segmentCount: number;
  curveShape: "balanced" | "more-liquidity-early" | "more-liquidity-late";
  startingFeeBps: number;
  endingFeeBps: number;
  feeDurationSeconds: number;
  feeSchedule: "linear" | "exponential";
  dynamicFeeEnabled: boolean;
  migrationFeePercent: number;
  creatorMigrationFeePercent: number;
  lockedLiquidityPercent: number;
  partnerSharePercent: number;
  leftoverReceiver: string;
}

export const DEFAULT_INPUT: CurveInput = {
  initialMarketCap: 10_000,
  graduationMarketCap: 1_000_000,
  totalTokenSupply: 1_000_000_000,
  leftoverTokens: 1_000,
  tokenDecimals: 9,
  quoteDecimals: 6,
  segmentCount: 4,
  curveShape: "balanced",
  startingFeeBps: 500,
  endingFeeBps: 100,
  feeDurationSeconds: 86_400,
  feeSchedule: "linear",
  dynamicFeeEnabled: false,
  migrationFeePercent: 1,
  creatorMigrationFeePercent: 50,
  lockedLiquidityPercent: 80,
  partnerSharePercent: 50,
  leftoverReceiver: "",
};

export interface CurvePoint {
  index: number;
  price: string;
  marketCap: string;
  liquidity: string;
}

export interface CurveDesign {
  configuration: ConfigParameters;
  points: CurvePoint[];
  migrationQuoteThresholdRaw: string;
  migrationQuoteThreshold: string;
  sdkValidation: "curve-and-config" | "curve-only";
  validationNote: string;
  sdkVersion: string;
}

function assertInput(input: CurveInput): void {
  const positiveValues: Array<[string, number]> = [
    ["Initial market cap", input.initialMarketCap],
    ["Graduation market cap", input.graduationMarketCap],
    ["Total token supply", input.totalTokenSupply],
    ["Leftover token amount", input.leftoverTokens],
    ["Fee duration", input.feeDurationSeconds],
  ];
  for (const [label, value] of positiveValues) {
    if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be a positive number.`);
  }
  if (input.initialMarketCap >= input.graduationMarketCap) {
    throw new Error("Graduation market cap must be higher than the initial market cap.");
  }
  if (!Number.isSafeInteger(input.totalTokenSupply) || !Number.isSafeInteger(input.leftoverTokens)) {
    throw new Error("Token supply and leftover amounts must be whole tokens within JavaScript's safe integer range.");
  }
  if (input.leftoverTokens >= input.totalTokenSupply) throw new Error("Leftover tokens must be lower than total supply.");
  if (!Number.isInteger(input.segmentCount) || input.segmentCount < 1 || input.segmentCount > 16) {
    throw new Error("DBC supports one to sixteen curve segments.");
  }
  if (input.startingFeeBps < 25 || input.startingFeeBps > 9_900 || input.endingFeeBps < 25 || input.endingFeeBps > 9_900) {
    throw new Error("Fee schedule endpoints must be between 25 and 9,900 bps (0.25%–99%).");
  }
  if (!Number.isInteger(input.startingFeeBps) || !Number.isInteger(input.endingFeeBps)) {
    throw new Error("Fee schedule endpoints must be whole basis points.");
  }
  if (input.startingFeeBps < input.endingFeeBps) {
    throw new Error("This fee scheduler models a fee that decreases over time; starting fee must be at least the ending fee.");
  }
  if (!Number.isInteger(input.feeDurationSeconds) || input.feeDurationSeconds < 60) {
    throw new Error("Fee duration must be at least 60 whole seconds.");
  }
  if (input.migrationFeePercent < 0 || input.migrationFeePercent > 99) {
    throw new Error("Migration fee must be between 0% and 99%.");
  }
  if (!Number.isInteger(input.migrationFeePercent) || !Number.isInteger(input.creatorMigrationFeePercent)) {
    throw new Error("Meteora migration fee percentage and creator split must be whole numbers.");
  }
  if (input.creatorMigrationFeePercent < 0 || input.creatorMigrationFeePercent > 100) {
    throw new Error("Creator share of the migration fee must be between 0% and 100%.");
  }
  if (input.lockedLiquidityPercent < 10 || input.lockedLiquidityPercent > 100) {
    throw new Error("At least 10% of migrated liquidity must remain locked after one day; this model uses permanent locks.");
  }
  if (!Number.isInteger(input.lockedLiquidityPercent) || !Number.isInteger(input.partnerSharePercent)) {
    throw new Error("Liquidity allocation percentages must be whole numbers.");
  }
  if (input.partnerSharePercent < 0 || input.partnerSharePercent > 100) {
    throw new Error("Partner liquidity share must be between 0% and 100%.");
  }
}

function quoteAmount(raw: string, decimals: number): string {
  const negative = raw.startsWith("-");
  const digits = negative ? raw.slice(1) : raw;
  const padded = digits.padStart(decimals + 1, "0");
  const whole = padded.slice(0, -decimals) || "0";
  const fraction = padded.slice(-decimals).replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

function weightsFor(input: CurveInput): number[] {
  return Array.from({ length: input.segmentCount }, (_, index) => {
    if (input.curveShape === "more-liquidity-early") return input.segmentCount - index;
    if (input.curveShape === "more-liquidity-late") return index + 1;
    return 1;
  });
}

function buildParameters(input: CurveInput, sdk: MeteoraSdk): ConfigParameters {
  const partnerShare = input.partnerSharePercent;
  const creatorShare = 100 - partnerShare;
  const locked = input.lockedLiquidityPercent / 100;
  const baseFeeMode: import("@meteora-ag/dynamic-bonding-curve-sdk").BaseFeeMode.FeeSchedulerLinear
    | import("@meteora-ag/dynamic-bonding-curve-sdk").BaseFeeMode.FeeSchedulerExponential = input.feeSchedule === "linear"
      ? sdk.BaseFeeMode.FeeSchedulerLinear
      : sdk.BaseFeeMode.FeeSchedulerExponential;
  const liquidityDistribution = {
    partnerPermanentLockedLiquidityPercentage: partnerShare * locked,
    partnerLiquidityPercentage: partnerShare * (1 - locked),
    creatorPermanentLockedLiquidityPercentage: creatorShare * locked,
    creatorLiquidityPercentage: creatorShare * (1 - locked),
  };
  const base = {
    token: {
      tokenType: sdk.TokenType.SPLToken,
      tokenBaseDecimal: input.tokenDecimals as TokenDecimalValue,
      tokenQuoteDecimal: input.quoteDecimals,
      tokenAuthorityOption: sdk.TokenAuthorityOption.Immutable,
      totalTokenSupply: input.totalTokenSupply,
      leftover: input.leftoverTokens,
    },
    fee: {
      baseFeeParams: {
        baseFeeMode,
        feeSchedulerParam: {
          startingFeeBps: input.startingFeeBps,
          endingFeeBps: input.endingFeeBps,
          numberOfPeriod: 60,
          totalDuration: input.feeDurationSeconds,
        },
      },
      dynamicFeeEnabled: input.dynamicFeeEnabled,
        collectFeeMode: sdk.CollectFeeMode.QuoteToken,
      creatorTradingFeePercentage: 0,
      poolCreationFee: 1,
      enableFirstSwapWithMinFee: false,
    },
    migration: {
      migrationOption: sdk.MigrationOption.MET_DAMM_V2,
      migrationFeeOption: sdk.MigrationFeeOption.Customizable,
      migrationFee: {
        feePercentage: input.migrationFeePercent,
        creatorFeePercentage: input.creatorMigrationFeePercent,
      },
    },
    liquidityDistribution,
    lockedVesting: {
      totalLockedVestingAmount: 0,
      numberOfVestingPeriod: 0,
      cliffUnlockAmount: 0,
      totalVestingDuration: 0,
      cliffDurationFromMigrationTime: 0,
    },
    activationType: sdk.ActivationType.Timestamp,
  };
  if (input.segmentCount === 1) {
    return sdk.buildCurveWithMarketCap({
      ...base,
      initialMarketCap: input.initialMarketCap,
      migrationMarketCap: input.graduationMarketCap,
    });
  }
  const startPrice = input.initialMarketCap / input.totalTokenSupply;
  const endPrice = input.graduationMarketCap / input.totalTokenSupply;
  const prices = Array.from({ length: input.segmentCount + 1 }, (_, index) => (
    startPrice * (endPrice / startPrice) ** (index / input.segmentCount)
  ));
  return sdk.buildCurveWithCustomSqrtPrices({
    ...base,
    sqrtPrices: sdk.createSqrtPrices(prices, input.tokenDecimals as TokenDecimalValue, input.quoteDecimals),
    liquidityWeights: weightsFor(input),
  });
}

export async function buildCurveDesign(input: CurveInput): Promise<CurveDesign> {
  assertInput(input);
  const sdk = await import("@meteora-ag/dynamic-bonding-curve-sdk");
  const configuration = buildParameters(input, sdk);
  if (!sdk.validateCurve(configuration.curve, configuration.sqrtStartPrice)) {
    throw new Error("The Meteora SDK rejected the generated curve points.");
  }
  if (!sdk.validateMigrationAndTokenType(configuration.migrationOption, configuration.tokenType)) {
    throw new Error("The selected token and migration path are incompatible.");
  }
  if (!sdk.validateMigrationFee(configuration.migrationFee)) {
    throw new Error("The Meteora SDK rejected the migration fee split.");
  }
  if (!sdk.validateLPPercentages(
    configuration.partnerLiquidityPercentage,
    configuration.partnerPermanentLockedLiquidityPercentage,
    configuration.creatorLiquidityPercentage,
    configuration.creatorPermanentLockedLiquidityPercentage,
    0,
    0,
  )) {
    throw new Error("Partner and creator liquidity allocations must total 100%.");
  }
  if (!sdk.validateMinimumLockedLiquidity(
    configuration.partnerPermanentLockedLiquidityPercentage,
    configuration.creatorPermanentLockedLiquidityPercentage,
    undefined,
    undefined,
  )) {
    throw new Error("Meteora requires at least 10% of migration liquidity to remain locked after one day.");
  }

  let sdkValidation: CurveDesign["sdkValidation"] = "curve-only";
  let validationNote = "Curve, migration, fee bounds, and liquidity allocation passed SDK checks. Enter a leftover receiver public key to run the SDK's config-parameter validator. Quote-mint support and recipient control still need separate checks.";
  if (input.leftoverReceiver.trim()) {
    let receiver: import("@solana/web3.js").PublicKey;
    try {
      const { PublicKey } = await import("@solana/web3.js");
      receiver = new PublicKey(input.leftoverReceiver.trim());
    } catch {
      throw new Error("Enter a valid leftover receiver public key, or leave it blank for curve-only validation.");
    }
    sdk.validateConfigParameters({ ...configuration, leftoverReceiver: receiver });
    sdkValidation = "curve-and-config";
    validationNote = "Curve and full config parameters passed the Meteora SDK validator. Quote-mint account support and recipient control still require separate verification.";
  }

  const startPrice = input.initialMarketCap / input.totalTokenSupply;
  const points: CurvePoint[] = [
    { index: 0, price: String(startPrice), marketCap: String(input.initialMarketCap), liquidity: "—" },
    ...configuration.curve
      .filter((point: { sqrtPrice: { eq(value: unknown): boolean } }) => !point.sqrtPrice.eq(sdk.MAX_SQRT_PRICE))
      .map((point: { sqrtPrice: { toString(radix?: number): string }; liquidity: { toString(radix?: number): string } }, index: number) => {
      const price = sdk.getPriceFromSqrtPrice(point.sqrtPrice, input.tokenDecimals as TokenDecimalValue, input.quoteDecimals);
      return {
        index: index + 1,
        price: price.toString(),
        marketCap: price.mul(input.totalTokenSupply).toDecimalPlaces(2).toString(),
        liquidity: point.liquidity.toString(10),
      };
    }),
  ];
  const migrationQuoteThresholdRaw = configuration.migrationQuoteThreshold.toString(10);
  return {
    configuration,
    points,
    migrationQuoteThresholdRaw,
    migrationQuoteThreshold: quoteAmount(migrationQuoteThresholdRaw, input.quoteDecimals),
    sdkValidation,
    validationNote,
    sdkVersion: SDK_VERSION,
  };
}

function plainValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(plainValue);
  if (!value || typeof value !== "object") return value;
  const candidate = value as { constructor?: { name?: string }; toString?: (radix?: number) => string };
  if (candidate.constructor?.name === "BN" && candidate.toString) return candidate.toString(10);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, plainValue(item)]));
}

export function serializeCurveConfiguration(input: CurveInput, design: CurveDesign): string {
  return JSON.stringify({
    product: "CurveCraft",
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sdk: { package: "@meteora-ag/dynamic-bonding-curve-sdk", version: design.sdkVersion },
    validation: design.sdkValidation,
    assumptions: [
      "Market caps are denominated in quote-token units; they are USD only when the selected quote mint is a supported USD stablecoin.",
      "The quote mint and leftover receiver are not included in SDK config parameters and must be verified separately before any launch.",
      "No transactions are created, signed, or sent by CurveCraft.",
    ],
    inputs: input,
    migration: {
      target: "DAMM v2",
      sdkQuoteThresholdRaw: design.migrationQuoteThresholdRaw,
      sdkQuoteThreshold: design.migrationQuoteThreshold,
      quoteDecimals: input.quoteDecimals,
      protocolMigrationFeePercent: 0.2,
    },
    configParameters: plainValue(design.configuration),
    curvePoints: design.points,
    warnings: input.leftoverReceiver.trim()
      ? [design.validationNote]
      : [design.validationNote, "Curve-only validation is not a launch-ready config."],
  }, null, 2);
}

export function buildLaunchConstitution(input: CurveInput, design: CurveDesign): string {
  const shape = input.curveShape.replaceAll("-", " ");
  const quoteName = input.quoteDecimals === 6 ? "6-decimal quote units" : "9-decimal quote units";
  return `# CurveCraft Launch Constitution\n\nGenerated with Meteora DBC SDK ${design.sdkVersion}. This is a planning document only, not legal advice, an on-chain instrument, or launch authorization. It cannot create or launch a pool.\n\n## Curve\n\n- Initial market cap: ${input.initialMarketCap.toLocaleString()} quote units.\n- Graduation market cap: ${input.graduationMarketCap.toLocaleString()} quote units.\n- Total token supply: ${input.totalTokenSupply.toLocaleString()} tokens with ${input.tokenDecimals} decimals.\n- Segments: ${input.segmentCount}; relative liquidity shape: ${shape}.\n- Quote precision: ${quoteName}. No quote-token USD price is assumed.\n- SDK-derived quote reserve threshold: ${design.migrationQuoteThreshold} quote units (${design.migrationQuoteThresholdRaw} base units).\n\n## Fees and graduation\n\n- Base fee schedule: ${input.feeSchedule}, ${input.startingFeeBps} bps to ${input.endingFeeBps} bps over ${input.feeDurationSeconds.toLocaleString()} seconds.\n- Dynamic fee: ${input.dynamicFeeEnabled ? "enabled" : "disabled"}.\n- Migration target: DAMM v2, the current path for new Meteora DBC configs.\n- Configured migration fee: ${input.migrationFeePercent}% with ${input.creatorMigrationFeePercent}% directed to the creator.\n- Meteora protocol migration fee: 0.2%, separate from the configurable partner/creator fee.\n\n## Liquidity and authority\n\n- Permanent locked liquidity at migration: ${input.lockedLiquidityPercent}%, split ${input.partnerSharePercent}% partner / ${100 - input.partnerSharePercent}% creator. Permanent locking exceeds Meteora's requirement that at least 10% remain locked after one day.\n- Token vesting: none modeled in this version.\n- Token authority: immutable in the SDK parameters.\n- Leftover receiver: ${input.leftoverReceiver.trim() || "not supplied; full config-parameter validation is incomplete"}.\n\n## Validation boundary\n\n${design.validationNote}\n\nThe selected quote mint, its on-chain extensions and transfer-fee behavior, actual recipient control, live config-account creation, market conditions, and launch economics outside this SDK model remain unverified. The displayed market-cap path is a deterministic configuration model, not a price forecast. No transaction is generated or sent.\n`;
}

export function validateRpcEndpoint(endpoint: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(endpoint.trim());
  } catch {
    throw new Error("Enter a complete RPC URL, including https://.");
  }
  const localHttp = parsed.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
  if (parsed.protocol !== "https:" && !localHttp) throw new Error("Use HTTPS for remote RPC endpoints.");
  if (parsed.username || parsed.password || parsed.hash) throw new Error("Remove URL credentials and fragments; the endpoint URL is sent directly to that provider.");
  return parsed;
}

export interface LiveConfigInspection {
  address: string;
  cluster: string;
  contextSlot: number;
  owner: string;
  lamports: string;
  dataLength: number;
  tokenType: number;
  tokenDecimals: number;
  migrationOption: number;
  migrationQuoteThreshold: string;
  curvePoints: number;
}

export async function inspectDbcConfig(endpoint: string, address: string): Promise<LiveConfigInspection> {
  const url = validateRpcEndpoint(endpoint);
  const [{ Connection, PublicKey }, sdk] = await Promise.all([
    import("@solana/web3.js"),
    import("@meteora-ag/dynamic-bonding-curve-sdk"),
  ]);
  let publicKey: import("@solana/web3.js").PublicKey;
  try {
    publicKey = new PublicKey(address.trim());
  } catch {
    throw new Error("Enter a valid Solana account public key.");
  }
  const timedFetch: typeof fetch = async (resource, init) => {
    const timeout = AbortSignal.timeout(15_000);
    const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    return fetch(resource, { ...init, signal });
  };
  const connection = new Connection(url.href, { commitment: "confirmed", fetch: timedFetch });
  try {
    const [{ context, value }, genesisHash] = await Promise.all([
      connection.getAccountInfoAndContext(publicKey, "confirmed"),
      connection.getGenesisHash(),
    ]);
    if (!value) throw new Error("No account exists at that address on this cluster.");
    if (!value.owner.equals(sdk.DYNAMIC_BONDING_CURVE_PROGRAM_ID)) {
      throw new Error("This account is not owned by Meteora's DBC program.");
    }
    const client = sdk.DynamicBondingCurveClient.create(connection, "confirmed");
    const coder = client.state.getProgram().coder.accounts;
    let config: Awaited<ReturnType<typeof client.state.getPoolConfig>>;
    try {
      config = coder.decode("poolConfig", value.data) as NonNullable<typeof config>;
    } catch {
      try {
        const wrapped = coder.decode("configWithTransferHook", value.data) as { config?: NonNullable<typeof config> };
        config = wrapped.config ?? null;
      } catch {
        config = null;
      }
    }
    if (!config) throw new Error("The DBC SDK could not decode this account as a standard pool config.");
    return {
      address: publicKey.toBase58(),
      cluster: genesisHash === "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d" ? "Mainnet Beta" : genesisHash === "EtWTRABZaYq6iMfeYKouRu166VU2xqa1" ? "Devnet" : "Unrecognized Solana cluster",
      contextSlot: context.slot,
      owner: value.owner.toBase58(),
      lamports: value.lamports.toString(),
      dataLength: value.data.length,
      tokenType: config.tokenType,
      tokenDecimals: config.tokenDecimal,
      migrationOption: config.migrationOption,
      migrationQuoteThreshold: config.migrationQuoteThreshold.toString(10),
      curvePoints: config.curve.filter((point) => !point.sqrtPrice.eq(sdk.MAX_SQRT_PRICE)).length,
    };
  } catch (error) {
    if (error instanceof Error && /No account|not owned|could not decode/.test(error.message)) throw error;
    if (error instanceof Error && /AbortError|TimeoutError/.test(error.name)) {
      throw new Error("The DBC RPC read timed out after 15 seconds. Check the endpoint and try again.");
    }
    throw new Error("Could not inspect this DBC config. Check endpoint availability, browser CORS support, and whether the account uses the SDK's standard config layout.");
  }
}
