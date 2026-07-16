import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_API_BASE: process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:4001",
  },
  experimental: {
    // The @devdigest/shared barrel (src/vendor/shared) uses explicit `.js`
    // specifiers on `.ts` sources (NodeNext style). tsc resolves these via
    // moduleResolution: bundler, but Next's webpack only maps `.js`→`.ts` when
    // resolve.extensionAlias is set — and Next 15.5 no longer derives it from
    // tsconfig. Without this, every `export * from './contracts/*.js'` fails
    // with "Module not found". See client/next.config: keep in sync with the
    // barrel's import style.
    extensionAlias: {
      ".js": [".ts", ".tsx", ".js"],
      ".jsx": [".tsx", ".jsx"],
      ".mjs": [".mts", ".mjs"],
      ".cjs": [".cts", ".cjs"],
    },
  },
};

export default withNextIntl(nextConfig);
