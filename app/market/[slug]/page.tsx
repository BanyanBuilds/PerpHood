import { Header } from "@/components/Header";
import { MarketScreen } from "@/components/MarketScreen";
import { MobileDock } from "@/components/MobileDock";

export default async function MarketPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <><Header /><MarketScreen slug={slug} /><MobileDock /></>;
}
