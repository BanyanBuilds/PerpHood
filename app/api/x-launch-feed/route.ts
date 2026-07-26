import { NextRequest, NextResponse } from "next/server";
import { buildXSearchQuery, sanitizeXUsername, type XLaunchFeedResponse, type XLaunchPost } from "@/lib/x-launch-feed";
import { getXLaunchPosts } from "@/lib/server/x-launch-stream-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_MS = 15_000;
let cachedKey = "";
let cachedAt = 0;
let cachedResponse: XLaunchFeedResponse | null = null;

type XApiPost = {
  id: string;
  text: string;
  author_id?: string;
  created_at?: string;
  public_metrics?: {
    like_count?: number;
    retweet_count?: number;
    reply_count?: number;
    quote_count?: number;
  };
  entities?: { urls?: Array<{ expanded_url?: string; unwound_url?: string }> };
  attachments?: { media_keys?: string[] };
};

type XApiUser = {
  id: string;
  name?: string;
  username?: string;
  profile_image_url?: string;
  verified?: boolean;
};

type XApiMedia = {
  media_key: string;
  type?: "photo" | "video" | "animated_gif";
  url?: string;
  preview_image_url?: string;
};

type XApiResponse = {
  data?: XApiPost[];
  includes?: { users?: XApiUser[]; media?: XApiMedia[] };
  meta?: { newest_id?: string };
  errors?: Array<{ title?: string; detail?: string }>;
};

function normalizePosts(payload: XApiResponse): XLaunchPost[] {
  const users = new Map((payload.includes?.users ?? []).map((user) => [user.id, user]));
  const media = new Map((payload.includes?.media ?? []).map((item) => [item.media_key, item]));
  return (payload.data ?? []).map((post) => {
    const author = users.get(post.author_id ?? "");
    const urls = (post.entities?.urls ?? [])
      .map((entry) => entry.unwound_url || entry.expanded_url || "")
      .filter(Boolean);
    return {
      id: post.id,
      text: post.text,
      createdAt: post.created_at ?? new Date().toISOString(),
      author: {
        id: author?.id ?? post.author_id ?? "unknown",
        name: author?.name ?? author?.username ?? "X account",
        username: author?.username ?? "unknown",
        profileImageUrl: author?.profile_image_url,
        verified: author?.verified,
      },
      metrics: {
        likes: post.public_metrics?.like_count ?? 0,
        reposts: post.public_metrics?.retweet_count ?? 0,
        replies: post.public_metrics?.reply_count ?? 0,
        quotes: post.public_metrics?.quote_count ?? 0,
      },
      media: (post.attachments?.media_keys ?? []).map((key) => media.get(key)).filter((item): item is XApiMedia => Boolean(item)).map((item) => ({
        type: item.type ?? "photo",
        url: item.url,
        previewImageUrl: item.preview_image_url,
      })),
      urls,
    };
  });
}

export async function GET(request: NextRequest) {
  const bearerToken = process.env.X_BEARER_TOKEN?.trim();
  const accountValues = request.nextUrl.searchParams.get("accounts")?.split(",") ?? [];
  const accounts = accountValues.map(sanitizeXUsername).filter(Boolean).slice(0, 20);
  const keywords = request.nextUrl.searchParams.get("q")?.trim() ?? process.env.X_LAUNCH_DEFAULT_QUERY?.trim() ?? "";
  const query = buildXSearchQuery(accounts, keywords);
  const streamPosts = getXLaunchPosts().filter((post) => {
    if (accounts.length && !accounts.includes(sanitizeXUsername(post.author.username))) return false;
    if (!keywords.trim()) return true;
    const searchable = `${post.text} ${post.author.name} ${post.author.username}`.toLowerCase();
    const terms = keywords.toLowerCase().match(/[a-z0-9$#@_]{2,}/g) ?? [];
    return !terms.length || terms.some((term) => searchable.includes(term.replace(/^[$#@]/, "")));
  });
  if (streamPosts.length) {
    return NextResponse.json<XLaunchFeedResponse>({
      configured: true,
      mode: "stream-cache",
      posts: streamPosts.slice(0, 100),
      query,
      newestId: streamPosts[0]?.id,
      message: "Live posts supplied by the PerpHood filtered-stream worker.",
    }, { headers: { "Cache-Control": "no-store" } });
  }

  if (!bearerToken) {
    return NextResponse.json<XLaunchFeedResponse>({
      configured: false,
      mode: "unconfigured",
      posts: [],
      query,
      message: "Add X_BEARER_TOKEN to enable the native PerpHood X Launch Feed.",
    });
  }

  const cacheKey = `${accounts.join(",")}|${keywords}`;
  if (cachedResponse && cachedKey === cacheKey && Date.now() - cachedAt < CACHE_MS) {
    return NextResponse.json(cachedResponse, { headers: { "Cache-Control": "private, max-age=10" } });
  }

  const endpoint = new URL("https://api.x.com/2/tweets/search/recent");
  endpoint.searchParams.set("query", query);
  endpoint.searchParams.set("max_results", "50");
  endpoint.searchParams.set("tweet.fields", "created_at,public_metrics,entities,attachments,author_id");
  endpoint.searchParams.set("expansions", "author_id,attachments.media_keys");
  endpoint.searchParams.set("user.fields", "name,username,profile_image_url,verified");
  endpoint.searchParams.set("media.fields", "type,url,preview_image_url");

  try {
    const response = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${bearerToken}` },
      cache: "no-store",
    });
    const payload = await response.json() as XApiResponse;
    if (!response.ok) {
      const message = payload.errors?.map((error) => error.detail || error.title).filter(Boolean).join(" · ") || `X API returned ${response.status}.`;
      return NextResponse.json<XLaunchFeedResponse>({ configured: true, mode: "recent-search", posts: [], query, message }, { status: response.status });
    }

    const result: XLaunchFeedResponse = {
      configured: true,
      mode: "recent-search",
      posts: normalizePosts(payload),
      query,
      newestId: payload.meta?.newest_id,
      rateLimit: {
        remaining: Number(response.headers.get("x-rate-limit-remaining") ?? "") || undefined,
        resetAt: Number(response.headers.get("x-rate-limit-reset") ?? "") || undefined,
      },
    };
    cachedKey = cacheKey;
    cachedAt = Date.now();
    cachedResponse = result;
    return NextResponse.json(result, { headers: { "Cache-Control": "private, max-age=10" } });
  } catch (error) {
    return NextResponse.json<XLaunchFeedResponse>({
      configured: true,
      mode: "recent-search",
      posts: [],
      query,
      message: error instanceof Error ? error.message : "The X Launch Feed request failed.",
    }, { status: 502 });
  }
}
