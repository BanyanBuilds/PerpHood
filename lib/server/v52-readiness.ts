import { summarizeV52Completion, V52_COMPLETION_ITEMS } from "@/lib/v52-product-completion";
import { V52_SCALE_TIERS, V52_SERVICE_BOUNDARIES } from "@/lib/v52-scale-foundation";

function configured(name: string) {
  return Boolean(process.env[name]?.trim());
}

export function readV52RuntimeReadiness() {
  const summary = summarizeV52Completion();
  const vercel = Boolean(process.env.VERCEL);
  const production = process.env.NODE_ENV === "production";
  const capabilities = {
    frontendHost: vercel ? "vercel" : "local-node",
    production,
    supabasePublic: configured("NEXT_PUBLIC_SUPABASE_URL") && configured("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    supabaseServer: configured("V48_SUPABASE_URL") && configured("V48_SUPABASE_SERVICE_ROLE_KEY"),
    rpcPool: configured("V48_RPC_URLS") || configured("ROBINHOOD_CHAIN_RPC_URL"),
    marketStream: configured("NEXT_PUBLIC_MARKET_WS_URL") && configured("NEXT_PUBLIC_MARKET_HISTORY_URL"),
    accountRouter: configured("NEXT_PUBLIC_V45_ACCOUNT_ROUTER_ADDRESS"),
    launchpadFactory: configured("NEXT_PUBLIC_V45_LAUNCHPAD_FACTORY_ADDRESS") || configured("LAUNCHPAD_FACTORY_ADDRESS"),
    workerSecrets: configured("V47_INDEXER_SECRET") && configured("V47_RECONCILER_SECRET") && configured("V46_KEEPER_SECRET"),
    persistentLocalDisk: !vercel,
  };
  const configuredCapabilities = Object.entries(capabilities).filter(([, value]) => value === true).length;
  return {
    version: 52,
    release: "product-completion-and-scale-foundation",
    generatedAt: Date.now(),
    summary,
    capabilities,
    configuredCapabilities,
    items: V52_COMPLETION_ITEMS,
    scaleTiers: V52_SCALE_TIERS,
    serviceBoundaries: V52_SERVICE_BOUNDARIES,
    safety: {
      publicFundsApproved: false,
      testnetApproved: false,
      reason: "Compiled contract campaigns, production infrastructure, migration settlement and independent audits remain incomplete.",
    },
  };
}
