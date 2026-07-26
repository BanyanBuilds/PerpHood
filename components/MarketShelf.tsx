import { ArrowRight, Gavel, Sparkles, Zap } from "lucide-react";
import type { Token } from "@/lib/types";
import { TokenCard } from "./TokenCard";

export function MarketShelf({ title, tokens, compact = false }: { title: string; tokens: Token[]; compact?: boolean }) {
  return (
    <section className={`market-shelf ${compact ? "compact-shelf" : ""}`}>
      <div className="shelf-heading">
        <span>{title.includes("Opening") ? <Gavel size={16} /> : title.includes("20") ? <Zap size={16} /> : <Sparkles size={16} />}</span>
        <h2>{title}</h2><button>View all <ArrowRight size={15} /></button>
      </div>
      <div className={compact ? "compact-token-grid" : "token-grid"}>{tokens.map((token) => <TokenCard key={token.slug} token={token} compactCard={compact} />)}</div>
    </section>
  );
}
