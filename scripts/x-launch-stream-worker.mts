import type { XLaunchPost } from "../lib/x-launch-feed.ts";

const bearer = process.env.X_BEARER_TOKEN?.trim();
const ingestUrl = process.env.PERPHOOD_X_INGEST_URL?.trim();
const ingestSecret = process.env.X_STREAM_INGEST_SECRET?.trim();
if (!bearer || !ingestUrl || !ingestSecret) {
  throw new Error("Set X_BEARER_TOKEN, PERPHOOD_X_INGEST_URL, and X_STREAM_INGEST_SECRET.");
}

type Rule = { value: string; tag?: string };
const defaultRules: Rule[] = [{ value: '(launch OR launching OR memecoin OR "contract address") -is:retweet', tag: "perphood-launch-radar" }];
let configuredRules = defaultRules;
try {
  if (process.env.X_STREAM_RULES) configuredRules = JSON.parse(process.env.X_STREAM_RULES) as Rule[];
} catch {
  throw new Error("X_STREAM_RULES must be valid JSON.");
}

async function ensureRules() {
  const currentResponse = await fetch("https://api.x.com/2/tweets/search/stream/rules", { headers: { Authorization: `Bearer ${bearer}` } });
  const current = await currentResponse.json() as { data?: Array<{ id: string; value: string; tag?: string }> };
  if (!currentResponse.ok) throw new Error(`Could not read X stream rules: ${JSON.stringify(current)}`);
  const existing = new Set((current.data ?? []).map((rule) => `${rule.value}|${rule.tag ?? ""}`));
  const add = configuredRules.filter((rule) => !existing.has(`${rule.value}|${rule.tag ?? ""}`));
  if (!add.length) return;
  const response = await fetch("https://api.x.com/2/tweets/search/stream/rules", {
    method: "POST",
    headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
    body: JSON.stringify({ add }),
  });
  if (!response.ok) throw new Error(`Could not add X stream rules: ${await response.text()}`);
}

function normalize(payload: any): XLaunchPost | null {
  const data = payload?.data;
  if (!data?.id || !data?.text) return null;
  const author = (payload.includes?.users ?? []).find((user: any) => user.id === data.author_id);
  const mediaMap = new Map((payload.includes?.media ?? []).map((item: any) => [item.media_key, item]));
  return {
    id: data.id,
    text: data.text,
    createdAt: data.created_at ?? new Date().toISOString(),
    author: {
      id: author?.id ?? data.author_id ?? "unknown",
      name: author?.name ?? author?.username ?? "X account",
      username: author?.username ?? "unknown",
      profileImageUrl: author?.profile_image_url,
      verified: author?.verified,
    },
    metrics: {
      likes: data.public_metrics?.like_count ?? 0,
      reposts: data.public_metrics?.retweet_count ?? 0,
      replies: data.public_metrics?.reply_count ?? 0,
      quotes: data.public_metrics?.quote_count ?? 0,
    },
    media: (data.attachments?.media_keys ?? []).map((key: string) => mediaMap.get(key)).filter(Boolean).map((item: any) => ({
      type: item.type ?? "photo",
      url: item.url,
      previewImageUrl: item.preview_image_url,
    })),
    urls: (data.entities?.urls ?? []).map((entry: any) => entry.unwound_url || entry.expanded_url || "").filter(Boolean),
    matchedRule: payload.matching_rules?.[0]?.tag,
  };
}

async function ingest(post: XLaunchPost) {
  const response = await fetch(ingestUrl!, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-perphood-ingest-secret": ingestSecret! },
    body: JSON.stringify({ posts: [post] }),
  });
  if (!response.ok) throw new Error(`Ingest failed: ${response.status} ${await response.text()}`);
}

async function connect() {
  const endpoint = new URL("https://api.x.com/2/tweets/search/stream");
  endpoint.searchParams.set("tweet.fields", "created_at,public_metrics,entities,attachments,author_id");
  endpoint.searchParams.set("expansions", "author_id,attachments.media_keys");
  endpoint.searchParams.set("user.fields", "name,username,profile_image_url,verified");
  endpoint.searchParams.set("media.fields", "type,url,preview_image_url");
  const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${bearer}` } });
  if (!response.ok || !response.body) throw new Error(`X stream failed: ${response.status} ${await response.text()}`);
  console.log("PerpHood X Launch Feed connected.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) throw new Error("X stream closed.");
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) {
        const post = normalize(JSON.parse(line));
        if (post) {
          await ingest(post);
          console.log(new Date().toISOString(), `@${post.author.username}`, post.text.slice(0, 90));
        }
      }
      newline = buffer.indexOf("\n");
    }
  }
}

await ensureRules();
let wait = 1_000;
while (true) {
  try {
    await connect();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    await new Promise((resolve) => setTimeout(resolve, wait));
    wait = Math.min(wait * 2, 60_000);
  }
}
