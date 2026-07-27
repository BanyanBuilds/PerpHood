import Image from "next/image";
import { LEVERAGEX_BRAND } from "@/lib/brand";

export function BrandMark({ size = 34 }: { size?: number }) {
  return (
    <span className="brand-mark" style={{ width: size, height: size }} aria-hidden="true">
      <Image src={LEVERAGEX_BRAND.logoPath} alt="" width={size} height={size} priority draggable={false} />
    </span>
  );
}
