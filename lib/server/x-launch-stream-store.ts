import type { XLaunchPost } from "@/lib/x-launch-feed";

type GlobalStreamStore = typeof globalThis & { __perphoodXLaunchPosts?: XLaunchPost[] };

const root = globalThis as GlobalStreamStore;

export function putXLaunchPosts(posts: XLaunchPost[]) {
  const current = root.__perphoodXLaunchPosts ?? [];
  const byId = new Map<string, XLaunchPost>();
  [...posts, ...current].forEach((post) => byId.set(post.id, post));
  root.__perphoodXLaunchPosts = [...byId.values()]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 500);
}

export function getXLaunchPosts() {
  return root.__perphoodXLaunchPosts ?? [];
}
