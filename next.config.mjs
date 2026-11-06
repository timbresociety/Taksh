/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,
  // Prompts are read from disk at request time, so they must ship with the server bundle.
  outputFileTracingIncludes: { "/api/**": ["./prompts/**"] },
};

export default nextConfig;
