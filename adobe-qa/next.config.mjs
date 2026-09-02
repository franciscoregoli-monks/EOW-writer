/** @type {import("next").NextConfig} */
const nextConfig = {
  output: "standalone",
  serverExternalPackages: ["puppeteer-core"],
};

export default nextConfig;
