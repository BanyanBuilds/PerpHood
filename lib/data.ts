import { DEMO_TOKEN } from "./demo-market";
import type { Token } from "./types";

/** V36 review build: one deliberate demo market so the chart workspace is immediately visible. */
export const TOKENS: Token[] = [DEMO_TOKEN];

export const getToken = (slug: string): Token => {
  const token = TOKENS.find((item) => item.slug === slug);
  if (!token) throw new Error(`Market ${slug} is not available from the live data source.`);
  return token;
};
