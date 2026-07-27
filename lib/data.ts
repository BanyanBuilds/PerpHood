import type { Token } from "./types";

/** Production starts empty. Markets appear only after a confirmed indexed launch. */
export const TOKENS: Token[] = [];

export const getToken = (slug: string): Token => {
  const token = TOKENS.find((item) => item.slug === slug);
  if (!token) throw new Error(`Market ${slug} is not available from the live launch registry.`);
  return token;
};
