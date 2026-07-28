import "server-only";

import { readV60CanaryReadiness } from "@/lib/server/v60-canary-readiness";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

type SupabaseProbe = {
  configured: boolean;
  bucketReady: boolean;
  registryReady: boolean;
  publicReadReady: boolean;
  launchCount: number | null;
  firstMarketRecordReady: boolean;
  error: string | null;
};

function configuredAddress(value: string | undefined) {
  return ADDRESS.test(value ?? "") ? String(value).toLowerCase() : null;
}

function supabaseSettings() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "") ?? "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  return { url, serviceRoleKey, anonKey };
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 8_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, cache: "no-store", signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function probeSupabase(firstToken: string | null): Promise<SupabaseProbe> {
  const { url, serviceRoleKey, anonKey } = supabaseSettings();
  const result: SupabaseProbe = {
    configured: Boolean(url && serviceRoleKey && anonKey),
    bucketReady: false,
    registryReady: false,
    publicReadReady: false,
    launchCount: null,
    firstMarketRecordReady: false,
    error: null,
  };
  if (!result.configured) {
    result.error = "Supabase URL, anon key, or service-role key is missing.";
    return result;
  }

  try {
    const serviceHeaders = {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
    };
    const tokenFilter = firstToken ? `&token_address=eq.${firstToken}` : "";
    const [bucketResponse, registryResponse, publicResponse, firstMarketResponse] = await Promise.all([
      fetchWithTimeout(`${url}/storage/v1/bucket/leveragex-token-media`, { headers: serviceHeaders }),
      fetchWithTimeout(`${url}/rest/v1/leveragex_v55_launches?select=id&limit=1`, {
        headers: { ...serviceHeaders, prefer: "count=exact" },
      }),
      fetchWithTimeout(`${url}/rest/v1/leveragex_v55_launches?select=id&status=in.(confirmed,paused,migrated)&limit=1`, {
        headers: { apikey: anonKey, authorization: `Bearer ${anonKey}`, prefer: "count=exact" },
      }),
      firstToken
        ? fetchWithTimeout(`${url}/rest/v1/leveragex_v55_launches?select=id,token_address,status&chain_id=eq.4663${tokenFilter}&status=in.(confirmed,paused,migrated)&limit=1`, { headers: serviceHeaders })
        : Promise.resolve(null),
    ]);

    result.bucketReady = bucketResponse.ok;
    result.registryReady = registryResponse.ok;
    result.publicReadReady = publicResponse.ok;
    const countHeader = registryResponse.headers.get("content-range")?.split("/")[1] ?? "";
    result.launchCount = /^\d+$/.test(countHeader) ? Number(countHeader) : registryResponse.ok ? 0 : null;
    if (firstMarketResponse) {
      const rows = firstMarketResponse.ok ? await firstMarketResponse.json() as Array<{ token_address?: string }> : [];
      result.firstMarketRecordReady = rows.some((row) => row.token_address?.toLowerCase() === firstToken);
    }
    if (!bucketResponse.ok || !registryResponse.ok || !publicResponse.ok) {
      result.error = [
        !bucketResponse.ok ? `token-media bucket ${bucketResponse.status}` : null,
        !registryResponse.ok ? `launch registry ${registryResponse.status}` : null,
        !publicResponse.ok ? `public launch feed ${publicResponse.status}` : null,
      ].filter(Boolean).join(" · ");
    }
  } catch (error) {
    result.error = error instanceof Error ? error.message : "Supabase readiness probe failed.";
  }
  return result;
}

export async function readV62GoLiveReadiness() {
  const canary = await readV60CanaryReadiness();
  const storage = await probeSupabase(canary.market.token);

  const serverFactory = configuredAddress(process.env.LEVERAGEX_FACTORY_ADDRESS);
  const publicFactory = configuredAddress(process.env.NEXT_PUBLIC_LEVERAGEX_FACTORY_ADDRESS);
  const expectedCreator = configuredAddress(
    process.env.NEXT_PUBLIC_LEVERAGEX_CANARY_CREATOR_ADDRESS
      ?? process.env.V60_CANARY_CREATOR_ADDRESS,
  );
  const publicFactoryMatchesServer = Boolean(serverFactory && publicFactory && serverFactory === publicFactory);
  const creatorMatches = Boolean(
    expectedCreator
      && expectedCreator === canary.accounts.canaryCreator.toLowerCase()
      && (!canary.factory.activeCanaryCreator || expectedCreator === canary.factory.activeCanaryCreator),
  );
  const applicationConfigured = publicFactoryMatchesServer
    && canary.release.mainnetUiEnabled
    && canary.release.canaryCreatorRestricted;
  const metadataReady = storage.bucketReady && storage.registryReady && storage.publicReadReady;
  const firstLaunchReady = applicationConfigured
    && metadataReady
    && canary.gates.canaryConfigurationReady
    && !canary.gates.firstMarketCreated;
  const firstLaunchConfirmed = canary.gates.firstMarketCreated && metadataReady && storage.firstMarketRecordReady;

  let next = {
    stage: "compile-and-estimate",
    label: "Compile contracts and estimate deployment",
    command: "npm run chain:v59:preflight",
    detail: "No transaction is signed or broadcast.",
  };
  if (canary.factory.codePresent && !canary.gates.canaryConfigurationReady) {
    next = {
      stage: "configure-canary",
      label: "Configure the one-wallet canary",
      command: "npm run chain:v60:canary:preflight",
      detail: "Then run the deliberately confirmed configure command locally.",
    };
  } else if (canary.gates.canaryConfigurationReady && !applicationConfigured) {
    next = {
      stage: "sync-vercel",
      label: "Import the generated canary environment block",
      command: "deployments/v60-vercel-canary.env",
      detail: "Import into Vercel and redeploy before opening Launch Token.",
    };
  } else if (applicationConfigured && !metadataReady) {
    next = {
      stage: "apply-supabase",
      label: "Apply the launch storage migration",
      command: "supabase/v55_production_launch.sql",
      detail: "The media bucket and confirmed-launch registry must both be reachable.",
    };
  } else if (firstLaunchReady) {
    next = {
      stage: "launch-first-token",
      label: "Launch the first paused token",
      command: "Open Launch Token with the allowlisted creator wallet",
      detail: "The market is born paused and cannot Spot trade until the proof gate passes.",
    };
  } else if (canary.gates.firstMarketCreated && !firstLaunchConfirmed) {
    next = {
      stage: "prove-first-launch",
      label: "Prove and register the first launch",
      command: "npm run chain:v62:first-launch-proof",
      detail: "Set V62_FIRST_LAUNCH_TX_HASH locally; the command does not sign or broadcast.",
    };
  } else if (firstLaunchConfirmed && !canary.gates.spotCanaryOpen) {
    next = {
      stage: "open-capped-spot",
      label: "Open the capped first Spot market",
      command: "npm run chain:v60:canary:open",
      detail: "Owner signing stays local and public launching remains disabled.",
    };
  } else if (canary.gates.spotCanaryOpen) {
    next = {
      stage: "trade-and-observe",
      label: "Run the controlled trader buy/sell proof",
      command: "Use the configured first-trader wallet",
      detail: "Public launching and perps remain locked until reconciliation is complete.",
    };
  }

  return {
    product: "leverage X",
    version: "V62",
    checkedAt: new Date().toISOString(),
    chain: canary.chain,
    accounts: canary.accounts,
    factory: canary.factory,
    market: canary.market,
    release: canary.release,
    storage,
    environment: {
      serverFactory,
      publicFactory,
      publicFactoryMatchesServer,
      expectedCreator,
      creatorMatches,
      mainnetUiEnabled: canary.release.mainnetUiEnabled,
    },
    gates: {
      rpcReady: canary.gates.rpcReady,
      productionStorageReady: metadataReady,
      closedFactoryReady: canary.gates.factoryClosedAndPaused,
      canaryConfigured: canary.gates.canaryConfigurationReady,
      applicationConfigured,
      firstLaunchReady,
      firstMarketCreated: canary.gates.firstMarketCreated,
      firstLaunchConfirmed,
      cappedSpotOpen: canary.gates.spotCanaryOpen,
      publicLaunchesAllowed: false,
      perpsAllowed: false,
    },
    next,
    error: canary.error ?? storage.error,
  };
}
