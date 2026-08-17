import type { NextConfig } from "next";

const config: NextConfig = {
  // sharp resizes photos before they go to the model; it must not be bundled.
  serverExternalPackages: ["sharp"],
};

export default config;
