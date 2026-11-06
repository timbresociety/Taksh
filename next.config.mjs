/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,
  // Prompts are read from disk at request time, so they must ship with the server bundle.
  outputFileTracingIncludes: { "/api/**": ["./prompts/**"] },
  // ponytail: Privy pulls in Solana modules on a path we never use. Install @solana-program/system if Solana login is ever added.
  turbopack: { resolveAlias: { "@solana-program/system": "./src/lib/og/empty.js" } },
};

export default nextConfig;
