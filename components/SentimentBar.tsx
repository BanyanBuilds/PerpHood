export function SentimentBar({ longs, compact = false }: { longs: number; compact?: boolean }) {
  return (
    <div className={`sentiment-wrap ${compact ? "sentiment-compact" : ""}`}>
      <div className="sentiment-copy"><span className="long-copy">Long {longs}%</span><span className="short-copy">Short {100 - longs}%</span></div>
      <div className="sentiment-track"><span style={{ width: `${longs}%` }} /><i style={{ width: `${100 - longs}%` }} /></div>
    </div>
  );
}
