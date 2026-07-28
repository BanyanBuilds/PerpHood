import type { Metadata } from "next";
import { V64FirstLaunchConsole } from "@/components/V64FirstLaunchConsole";

export const metadata: Metadata = {
  title: "First Mainnet Launch | leverage X",
  robots: { index: false, follow: false },
};

export default function V64FirstLaunchPage() {
  return <V64FirstLaunchConsole />;
}
