import { Anybody, Hanken_Grotesk } from "next/font/google";
import Providers from "@/components/Providers";
import "./globals.css";

const display = Anybody({ subsets: ["latin"], variable: "--font-display", axes: ["wdth"], weight: "variable" });
const body = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-body" });

export const metadata = {
  title: "Taksh",
  description: "Turn an idea into a short fitness game you play with your body.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
