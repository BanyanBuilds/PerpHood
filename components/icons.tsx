export function BrandMark({ size = 34 }: { size?: number }) {
  return (
    <span className="brand-mark" style={{ width: size, height: size }} aria-hidden="true">
      <img src="/perphood-logo.png" alt="" draggable={false} />
    </span>
  );
}
