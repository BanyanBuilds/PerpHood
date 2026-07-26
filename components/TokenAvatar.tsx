/* eslint-disable @next/next/no-img-element -- token media may be animated GIF/WebP supplied by creators. */
import type { Token } from "@/lib/types";

export function TokenAvatar({ token, size = "md", priority = false }: { token: Token; size?: "sm" | "md" | "lg" | "xl"; priority?: boolean }) {
  return (
    <span className={`token-avatar avatar-${size} ${token.imageDataUrl ? "has-image animated-token-media" : ""}`} style={{ "--token-hue": token.hue } as React.CSSProperties}>
      {token.imageDataUrl ? (
        <img
          src={token.imageDataUrl}
          alt={`${token.name} token artwork`}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          draggable={false}
        />
      ) : <span>{token.emoji}</span>}
    </span>
  );
}
