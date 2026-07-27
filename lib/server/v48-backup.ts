import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { openV48Database } from "./v48-database.ts";
import { v47DatabasePath } from "./v47-database.ts";

function sqlString(value: string) { return `'${value.replaceAll("'", "''")}'`; }

export function createV48DatabaseSnapshot(input: { sourcePath?: string; destinationPath?: string; metadata?: Record<string, unknown> } = {}) {
  const sourcePath = input.sourcePath ?? v47DatabasePath();
  const snapshotId = randomUUID();
  const filename = `v48-${new Date().toISOString().replaceAll(":", "-")}-${snapshotId}.sqlite`;
  const destinationPath = process.env.VERCEL
    ? join("/tmp/perphood/backups", input.destinationPath ? basename(input.destinationPath) : filename)
    : input.destinationPath
      ? resolve(/* turbopackIgnore: true */ input.destinationPath)
      : join(process.cwd(), ".perphood", "backups", filename);
  mkdirSync(dirname(destinationPath), { recursive: true });
  const db = openV48Database(sourcePath);
  let sourceBlock = 0;
  try {
    sourceBlock = Number((db.prepare("SELECT COALESCE(MAX(block_number),0) AS blockNumber FROM indexed_heads").get() as { blockNumber: number | bigint }).blockNumber);
    db.exec("PRAGMA wal_checkpoint(FULL)");
    db.exec(`VACUUM INTO ${sqlString(destinationPath)}`);
  } finally { db.close(); }
  const bytes = readFileSync(destinationPath);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const sizeBytes = statSync(destinationPath).size;
  const record = openV48Database(sourcePath);
  try {
    record.prepare("INSERT INTO database_snapshots(snapshot_id,path,source_block,size_bytes,sha256,created_at,metadata_json) VALUES(?,?,?,?,?,?,?)")
      .run(snapshotId,destinationPath,sourceBlock,sizeBytes,sha256,Date.now(),JSON.stringify(input.metadata ?? {}));
  } finally { record.close(); }
  return { snapshotId, path: destinationPath, sourceBlock, sizeBytes, sha256 };
}
