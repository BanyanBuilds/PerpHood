import type { Token } from "./types";

export function normalizeMetadataText(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

export function stableHash(value: string) {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first ^= code;
    first = Math.imul(first, 0x01000193);
    second ^= code + index;
    second = Math.imul(second, 0x85ebca6b);
  }
  return `${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0).toString(16).padStart(8, "0")}`;
}

export function emojiImageHash(emoji: string) {
  return stableHash(`emoji:${emoji.normalize("NFKC")}`);
}

export function hammingSimilarity(left?: string, right?: string) {
  if (!left || !right || left.length !== right.length) return 0;
  let equal = 0;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] === right[index]) equal += 1;
  }
  return equal / left.length * 100;
}

export function tokenIdentityParts(token: Pick<Token, "name" | "symbol" | "emoji" | "imageExactHash" | "imagePerceptualHash">) {
  const normalizedName = normalizeMetadataText(token.name);
  const normalizedSymbol = normalizeMetadataText(token.symbol);
  const imageExactHash = token.imageExactHash || emojiImageHash(token.emoji);
  const imagePerceptualHash = token.imagePerceptualHash || imageExactHash;
  return {
    normalizedName,
    normalizedSymbol,
    imageExactHash,
    imagePerceptualHash,
    metadataFingerprint: stableHash(`${imagePerceptualHash}:${normalizedName}:${normalizedSymbol}`),
  };
}

export function applyOgRegistry(tokens: Token[]) {
  const firstSeenTime = (token: Token) => token.metadataLockedAt ?? Date.now() - token.launchedMinutesAgo * 60_000;
  const ordered = [...tokens].sort((a, b) => firstSeenTime(a) - firstSeenTime(b));
  const registered: Token[] = [];
  const result = new Map<string, Token>();

  for (const raw of ordered) {
    const parts = tokenIdentityParts(raw);
    const tickerOrigin = registered.find((token) => tokenIdentityParts(token).normalizedSymbol === parts.normalizedSymbol);
    const tickerArtworkOrigin = registered.find((token) => {
      const prior = tokenIdentityParts(token);
      return prior.normalizedSymbol === parts.normalizedSymbol
        && (prior.imageExactHash === parts.imageExactHash
          || hammingSimilarity(prior.imagePerceptualHash, parts.imagePerceptualHash) >= 87.5);
    });
    const sameName = registered.find((token) => tokenIdentityParts(token).normalizedName === parts.normalizedName);
    const sameSymbol = tickerOrigin;
    const imageMatches = registered
      .map((token) => ({ token, similarity: hammingSimilarity(tokenIdentityParts(token).imagePerceptualHash, parts.imagePerceptualHash) }))
      .filter((entry) => entry.similarity >= 87.5)
      .sort((a, b) => b.similarity - a.similarity);
    const bestImage = imageMatches[0];
    const enriched: Token = {
      ...raw,
      ...parts,
      // OG means the first observed use of this ticker + artwork pairing.
      // The absolute first use of the ticker is separately marked as ticker origin.
      ogStatus: tickerArtworkOrigin ? "copy" : "og",
      firstSeenSlug: tickerArtworkOrigin?.slug,
      tickerOriginSlug: tickerOrigin?.tickerOriginSlug ?? tickerOrigin?.slug ?? raw.slug,
      isTickerOrigin: !tickerOrigin,
      nearImageSimilarity: bestImage?.similarity,
      nameReused: Boolean(sameName),
      symbolReused: Boolean(sameSymbol),
      imageReused: Boolean(bestImage),
      metadataLockedAt: raw.metadataLockedAt ?? firstSeenTime(raw),
      creatorWallet: raw.creatorWallet ?? `0x${stableHash(`creator:${raw.slug}`).slice(0, 8)}…${stableHash(raw.slug).slice(-3)}`,
      launchBlock: raw.launchBlock ?? 10_000_000 - Math.round(raw.launchedMinutesAgo * 4),
    };
    result.set(raw.slug, enriched);
    registered.push(enriched);
  }

  return tokens.map((token) => result.get(token.slug) ?? token);
}

export async function fingerprintImageFile(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let byteSignature = "";
  for (let index = 0; index < bytes.length; index += Math.max(1, Math.floor(bytes.length / 4096))) {
    byteSignature += String.fromCharCode(bytes[index]);
  }
  const imageDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read artwork."));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
  const imagePerceptualHash = await new Promise<string>((resolve, reject) => {
    const image = new Image();
    image.onerror = () => reject(new Error("Could not inspect artwork."));
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 8;
      canvas.height = 8;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return reject(new Error("Artwork fingerprint unavailable."));
      context.drawImage(image, 0, 0, 8, 8);
      const pixels = context.getImageData(0, 0, 8, 8).data;
      const grayscale: number[] = [];
      for (let index = 0; index < pixels.length; index += 4) {
        grayscale.push(Math.round(pixels[index] * 0.299 + pixels[index + 1] * 0.587 + pixels[index + 2] * 0.114));
      }
      const average = grayscale.reduce((sum, value) => sum + value, 0) / grayscale.length;
      resolve(grayscale.map((value) => value >= average ? "1" : "0").join(""));
    };
    image.src = imageDataUrl;
  });
  return {
    imageDataUrl,
    imageExactHash: stableHash(`${file.name}:${file.size}:${file.type}:${byteSignature}`),
    imagePerceptualHash,
  };
}
