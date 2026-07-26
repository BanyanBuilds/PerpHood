import assert from "node:assert/strict";
import { buildLaunchDraft, buildXSearchQuery, detectEvmAddresses, extractCashtags, suggestTickers, type XLaunchPost } from "../lib/x-launch-feed.ts";

const post: XLaunchPost = {
  id: "1900000000000000000",
  text: "Launching $FALCON from the Robinhood Chain trenches. CA 0x1111111111111111111111111111111111111111 https://falcon.example",
  createdAt: "2026-07-24T12:00:00.000Z",
  author: { id: "42", name: "Falcon Labs", username: "falcon_labs", verified: true },
  metrics: { likes: 12, reposts: 4, replies: 3, quotes: 1 },
  media: [],
  urls: ["https://falcon.example"],
};

assert.deepEqual(extractCashtags(post.text), ["FALCON"]);
assert.deepEqual(detectEvmAddresses(post.text), ["0x1111111111111111111111111111111111111111"]);
const suggestions = suggestTickers(post, 5);
assert.equal(suggestions.length, 5);
assert.equal(suggestions[0], "FALCON");
assert.equal(new Set(suggestions).size, suggestions.length);
const query = buildXSearchQuery(["@falcon_labs", "falcon_labs"], "$FALCON OR \"contract address\"");
assert.match(query, /from:falcon_labs/);
assert.match(query, /-is:retweet/);
const draft = buildLaunchDraft(post, suggestions[0]);
assert.equal(draft.ticker, "FALCON");
assert.equal(draft.xHandle, "@falcon_labs");
assert.equal(draft.website, "https://falcon.example");
assert.match(draft.sourceUrl, /falcon_labs\/status\/1900000000000000000/);
console.log("V33 X Launch Feed smoke: PASS", { suggestions, query });
