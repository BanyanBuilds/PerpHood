"use client";

import { ShieldAlert } from "lucide-react";
import type { Token } from "@/lib/types";

export function OgBadge({ token, compact = false }: { token: Token; compact?: boolean }) {
  const isOg = token.ogStatus !== "copy";
  if (!isOg && compact) return null;

  const detail = isOg
    ? token.isTickerOrigin
      ? "Original PERPHOOD listing for this ticker and the first observed use of this ticker + artwork pairing. This is not an endorsement."
      : "First observed use of this artwork with this ticker on PERPHOOD. This is not an endorsement."
    : `This ticker + artwork pairing was first observed on ${token.firstSeenSlug ?? "an earlier market"}.`;

  return (
    <span className={`og-badge ${isOg ? "is-og" : "is-copy"} ${compact ? "is-compact" : ""}`} title={detail}>
      {!isOg && <ShieldAlert size={compact ? 9 : 11} />}
      {isOg ? "OG" : "COPY"}
    </span>
  );
}
