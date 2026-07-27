import "server-only";

import { createHash } from "node:crypto";
import { normalizeV53UserState, type V53UserStateDocument } from "@/lib/v53-user-state";

const KEY_PATTERN = /^ph53_[A-Za-z0-9_-]{43}$/;
const MAX_STATE_BYTES = 256 * 1024;

type SupabaseConfig = { url: string; serviceRoleKey: string };

export type V53RemoteState = {
  revision: number;
  state: V53UserStateDocument;
  updatedAt?: string;
};

function config(): SupabaseConfig | null {
  if (process.env.V53_USER_STATE_ENABLED?.trim().toLowerCase() === "false") return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "") || process.env.V48_SUPABASE_URL?.replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.V48_SUPABASE_SERVICE_ROLE_KEY;
  return url && serviceRoleKey ? { url, serviceRoleKey } : null;
}

export function isV53SupabaseConfigured() {
  return Boolean(config());
}

export function parseV53RecoveryKey(request: Request) {
  const value = request.headers.get("x-perphood-sync-key")?.trim() ?? "";
  if (!KEY_PATTERN.test(value)) throw new Error("A valid PERPHOOD V53 settings recovery key is required.");
  return value;
}

function hashRecoveryKey(recoveryKey: string) {
  return createHash("sha256").update(recoveryKey).digest("hex");
}

function uuidFromHash(hash: string) {
  const chars = hash.slice(0, 32).split("");
  chars[12] = "5";
  chars[16] = (["8", "9", "a", "b"] as const)[Number.parseInt(chars[16], 16) % 4];
  const value = chars.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20, 32)}`;
}

export function identityFromRecoveryKey(recoveryKey: string) {
  const hash = hashRecoveryKey(recoveryKey);
  return { profileId: uuidFromHash(hash), syncKeyHash: hash };
}

async function supabaseFetch(path: string, init: RequestInit = {}) {
  const settings = config();
  if (!settings) throw new Error("SUPABASE_NOT_CONFIGURED");
  const headers = new Headers(init.headers);
  headers.set("apikey", settings.serviceRoleKey);
  headers.set("authorization", `Bearer ${settings.serviceRoleKey}`);
  if (!headers.has("content-type")) headers.set("content-type", "application/json");
  return fetch(`${settings.url}${path}`, { ...init, cache: "no-store", headers });
}

async function ensureProfile(recoveryKey: string, deviceId?: string, deviceLabel?: string, userAgent?: string | null) {
  const { profileId, syncKeyHash } = identityFromRecoveryKey(recoveryKey);
  const profile = await supabaseFetch("/rest/v1/perphood_v53_profiles?on_conflict=profile_id", {
    method: "POST",
    headers: { prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ profile_id: profileId, sync_key_hash: syncKeyHash, last_seen_at: new Date().toISOString() }),
  });
  if (!profile.ok) throw new Error(`Profile registration failed: ${await profile.text()}`);
  if (deviceId) {
    const userAgentHash = userAgent ? createHash("sha256").update(userAgent).digest("hex") : null;
    const device = await supabaseFetch("/rest/v1/perphood_v53_devices?on_conflict=profile_id,device_id", {
      method: "POST",
      headers: { prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({
        profile_id: profileId,
        device_id: deviceId,
        label: String(deviceLabel || "Browser").slice(0, 120),
        user_agent_hash: userAgentHash,
        last_seen_at: new Date().toISOString(),
      }),
    });
    if (!device.ok) throw new Error(`Device registration failed: ${await device.text()}`);
  }
  return { profileId, syncKeyHash };
}

export async function readV53RemoteState(recoveryKey: string, device?: { id?: string; label?: string; userAgent?: string | null }): Promise<V53RemoteState> {
  const { profileId } = await ensureProfile(recoveryKey, device?.id, device?.label, device?.userAgent);
  const response = await supabaseFetch(`/rest/v1/perphood_v53_user_state?profile_id=eq.${profileId}&select=revision,state,updated_at&limit=1`);
  if (!response.ok) throw new Error(`User-state read failed: ${await response.text()}`);
  const rows = await response.json() as Array<{ revision: number | string; state: unknown; updated_at?: string }>;
  if (!rows.length) return { revision: 0, state: normalizeV53UserState(null) };
  return { revision: Number(rows[0].revision), state: normalizeV53UserState(rows[0].state), updatedAt: rows[0].updated_at };
}

export async function saveV53RemoteState(input: {
  recoveryKey: string;
  expectedRevision: number;
  state: unknown;
  deviceId: string;
  deviceLabel?: string;
  userAgent?: string | null;
}) {
  const normalized = normalizeV53UserState(input.state);
  const bytes = Buffer.byteLength(JSON.stringify(normalized), "utf8");
  if (bytes > MAX_STATE_BYTES) throw new Error(`User-state payload exceeds ${MAX_STATE_BYTES} bytes.`);
  const { profileId } = await ensureProfile(input.recoveryKey, input.deviceId, input.deviceLabel, input.userAgent);
  const response = await supabaseFetch("/rest/v1/rpc/perphood_v53_save_user_state", {
    method: "POST",
    body: JSON.stringify({
      p_profile_id: profileId,
      p_expected_revision: Math.max(0, Math.floor(input.expectedRevision)),
      p_state: normalized,
      p_device_id: input.deviceId,
    }),
  });
  if (!response.ok) throw new Error(`User-state save failed: ${await response.text()}`);
  const rows = await response.json() as Array<{ revision: number | string; state: unknown; updated_at: string; conflict: boolean }>;
  const row = rows[0];
  if (!row) throw new Error("User-state save returned no result.");
  return {
    revision: Number(row.revision),
    state: normalizeV53UserState(row.state),
    updatedAt: row.updated_at,
    conflict: Boolean(row.conflict),
  };
}
