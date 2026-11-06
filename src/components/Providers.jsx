"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { OG_PRIVY_APP_ID } from "@/lib/og/account";

// Same login methods as pc.0g.ai, so a player lands on the 0G account that holds their iAI credits.
export default function Providers({ children }) {
  return (
    <PrivyProvider appId={OG_PRIVY_APP_ID} config={{ loginMethods: ["google", "twitter", "discord", "tiktok", "email", "wallet"], appearance: { theme: "dark" } }}>
      {children}
    </PrivyProvider>
  );
}
