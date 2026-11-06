import { withWorkflow } from "workflow/next";

/** @type {import('next').NextConfig} */
const nextConfig = {
  devIndicators: false,
  // Prompts and skills are read from disk at request time, so they must ship with the server bundle.
  // Request workflows run their steps under /.well-known/workflow, so those routes need them too.
  outputFileTracingIncludes: { "/api/**": ["./prompts/**", "./skills/**"], "/.well-known/**": ["./prompts/**", "./skills/**"] },
};

export default withWorkflow(nextConfig);
