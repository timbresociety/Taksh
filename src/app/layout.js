import { Anybody, Hanken_Grotesk } from "next/font/google";
import Providers from "@/components/Providers";
import "./globals.css";

const display = Anybody({ subsets: ["latin"], variable: "--font-display", axes: ["wdth"], weight: "variable" });
const body = Hanken_Grotesk({ subsets: ["latin"], variable: "--font-body" });

const description = "Turn the wait between prompts into a quick game you play with your whole body. Just a webcam, no controller.";

// The share images in this folder need an absolute address, which Vercel gives each build.
const site = process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000";

export const metadata = {
  metadataBase: new URL(site),
  title: "Taksh",
  description,
  openGraph: { title: "Taksh: Your prompt is running. So are you.", description, siteName: "Taksh", type: "website" },
  twitter: { card: "summary_large_image", title: "Taksh: Your prompt is running. So are you.", description },
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
