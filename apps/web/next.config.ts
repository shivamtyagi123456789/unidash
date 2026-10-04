import type { NextConfig } from "next";
import { loadEnvConfig } from "@next/env";
import { resolve } from "node:path";

// The app is in a workspace subfolder; keep one private root .env for web, DB and worker.
loadEnvConfig(resolve(process.cwd(), "../.."));

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
