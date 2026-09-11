/** @type {import("next").NextConfig} */
const nextConfig = {
  agentRules: false,
  output: "standalone",
  serverExternalPackages: ["puppeteer-core"],
};

export default nextConfig;
