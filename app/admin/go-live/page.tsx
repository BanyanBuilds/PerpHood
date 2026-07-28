import type { Metadata } from "next";
import { V62GoLiveConsole } from "@/components/V62GoLiveConsole";

export const metadata: Metadata = {
  title: "Mainnet Go-Live Control | leverage X",
  robots: { index: false, follow: false },
};

export default function GoLivePage() {
  return <V62GoLiveConsole />;
}
