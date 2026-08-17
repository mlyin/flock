import type { NextConfig } from "next";

const config: NextConfig = {
  // node:sqlite is a Node builtin; keep it out of the bundler's hands.
  serverExternalPackages: ["node:sqlite"],
};

export default config;
