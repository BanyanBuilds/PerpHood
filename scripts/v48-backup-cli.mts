import { createV48DatabaseSnapshot } from "../lib/server/v48-backup.ts";
console.log(JSON.stringify(createV48DatabaseSnapshot({ metadata: { source: "cli" } }), null, 2));
