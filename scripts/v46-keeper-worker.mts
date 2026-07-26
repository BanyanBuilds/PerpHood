const baseUrl = (process.env.PERPHOOD_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const secret = process.env.V46_KEEPER_SECRET;
const mode = process.argv[2] ?? "watch";
const intervalMs = Math.max(1_000, Number(process.env.V46_KEEPER_INTERVAL_MS ?? 1_500));

async function cycle() {
  const response = await fetch(`${baseUrl}/api/v46/keeper/run`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(secret ? { authorization: `Bearer ${secret}` } : {}) },
    body: "{}",
  });
  const payload = await response.json() as { ok?: boolean; result?: unknown; error?: string };
  if (!response.ok || !payload.ok) throw new Error(payload.error ?? `Keeper HTTP ${response.status}`);
  console.log(new Date().toISOString(), JSON.stringify(payload.result));
}

if (mode === "once") {
  await cycle();
} else {
  console.log(`PERPHOOD V46 keeper watching ${baseUrl} every ${intervalMs}ms.`);
  for (;;) {
    const started = Date.now();
    try { await cycle(); } catch (error) { console.error(new Date().toISOString(), error instanceof Error ? error.message : error); }
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, intervalMs - (Date.now() - started))));
  }
}
