import type { NextConfig } from "next";

const config: NextConfig = {
  // Docker runner copies .next/standalone; Vercel ignores this.
  output: "standalone",
  // sharp resizes photos before they go to the model; it must not be bundled.
  serverExternalPackages: ["sharp"],
};

export default config;
