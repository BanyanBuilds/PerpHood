import { NextRequest, NextResponse } from "next/server";
import { putXLaunchPosts } from "@/lib/server/x-launch-stream-store";
import type { XLaunchPost } from "@/lib/x-launch-feed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function validPost(value: unknown): value is XLaunchPost {
  if (!value || typeof value !== "object") return false;
  const post = value as Partial<XLaunchPost>;
  return typeof post.id === "string"
    && typeof post.text === "string"
    && typeof post.createdAt === "string"
    && Boolean(post.author && typeof post.author.username === "string");
}

export async function POST(request: NextRequest) {
  const secret = process.env.X_STREAM_INGEST_SECRET;
  if (!secret || request.headers.get("x-perphood-ingest-secret") !== secret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const payload = await request.json() as { posts?: unknown[] };
  const posts = (payload.posts ?? []).filter(validPost).slice(0, 100);
  putXLaunchPosts(posts);
  return NextResponse.json({ ok: true, accepted: posts.length });
}
