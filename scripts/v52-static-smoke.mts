import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [component, route, page, adminHub, completion, scale, runtime, packageJson, workflow, env, css, schema] = await Promise.all([
  readFile(new URL("../components/V52CompletionConsole.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/api/v52/readiness/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/admin/completion/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../app/admin/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../lib/v52-product-completion.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/v52-scale-foundation.ts", import.meta.url), "utf8"),
  readFile(new URL("../lib/server/v52-readiness.ts", import.meta.url), "utf8"),
  readFile(new URL("../package.json", import.meta.url), "utf8"),
  readFile(new URL("../.github/workflows/vercel-build-check.yml", import.meta.url), "utf8"),
  readFile(new URL("../.env.example", import.meta.url), "utf8"),
  readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  readFile(new URL("../supabase/v52_scale_foundation.sql", import.meta.url), "utf8"),
]);

const checks: Array<[string, boolean]> = [
  ["V52 completion route is dynamic Node runtime", route.includes('runtime = "nodejs"') && route.includes('dynamic = "force-dynamic"')],
  ["V52 completion console is routed", page.includes("V52CompletionConsole") && component.includes("Product Completion &amp; Scale Foundation")],
  ["admin build center links the completion console", adminHub.includes("/admin/completion") && adminHub.includes("Development Operations")],
  ["console states that public funds are blocked", component.includes("No public funds") && completion.includes("productReadyForPublicFunds")],
  ["Markets and Movers rules remain in the audit", completion.includes("Quick Buy executes in place") && completion.includes("three non-trading utility")],
  ["one-million-user planning tier exists", scale.includes("registeredUsers: 1_000_000") && scale.includes("peakConnectedClients: 100_000")],
  ["market sequencer and durable event bus boundaries exist", scale.includes('id: "sequencer"') && scale.includes('id: "event-bus"')],
  ["runtime readiness masks secrets as booleans", runtime.includes("function configured") && !runtime.includes("SUPABASE_SERVICE_ROLE_KEY: process.env")],
  ["V52 package scripts exist", packageJson.includes('"test:v52-fast"') && packageJson.includes('"test:v52"')],
  ["CI runs V52 guards and production build", (workflow.includes("test:v52-fast") || workflow.includes("test:v53-fast")) && workflow.includes("npm run build")],
  ["V52 scale environment placeholders exist", env.includes("V52_RUNTIME_MODE") && env.includes("V52_EVENT_BUS_URL") && env.includes("V52_CACHE_URL")],
  ["V52 console styles exist", css.includes(".v52-completion-page") && css.includes(".v52-scale-tiers")],
  ["Supabase scale schema protects presets and three-sidecar workspaces", schema.includes("perphood_v52_trading_presets") && schema.includes("jsonb_array_length(left_sidecars) <= 3")],
  ["command and event foundations are partitioned and server-only", schema.includes("perphood_v52_command_outbox") && schema.includes("partition by hash(partition_key)") && schema.includes("No browser policies")],
];
for (const [label, pass] of checks) assert.ok(pass, `V52 static check failed: ${label}`);
console.log(`V52 product/scale integration passed ${checks.length}/${checks.length} checks.`);
