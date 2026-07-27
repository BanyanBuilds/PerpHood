export type LeverageXReleaseStage = "build" | "factory-paused" | "canary" | "spot-live";

const rawStage = process.env.NEXT_PUBLIC_LEVERAGEX_RELEASE_STAGE ?? "build";

export const LEVERAGEX_RELEASE_STAGE: LeverageXReleaseStage = (
  ["build", "factory-paused", "canary", "spot-live"].includes(rawStage) ? rawStage : "build"
) as LeverageXReleaseStage;

export const LEVERAGEX_RELEASE_STATUS: Record<LeverageXReleaseStage, { label: string; detail: string; live: boolean }> = {
  build: { label: "Mainnet build", detail: "Factory not deployed", live: false },
  "factory-paused": { label: "Factory paused", detail: "Mainnet contract verified", live: false },
  canary: { label: "Canary live", detail: "Allowlisted Spot market", live: true },
  "spot-live": { label: "Spot live", detail: "Public Spot trading", live: true },
};

export const PERPS_PUBLICLY_ENABLED = false;
