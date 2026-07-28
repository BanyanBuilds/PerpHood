import type { Metadata } from "next";
import { V63GmgnConsole } from "@/components/V63GmgnConsole";

export const metadata: Metadata = {
  title: "GMGN Compatibility | leverage X",
  robots: { index: false, follow: false },
};

export default function V63GmgnPage() {
  return <V63GmgnConsole />;
}
