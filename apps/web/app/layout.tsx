import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PayChad",
  description: "Monad-native programmable stablecoin payroll and business payouts.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
