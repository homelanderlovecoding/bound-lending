/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Exclude test files from production build
  webpack: (config) => {
    config.module.rules.push({
      test: /\.(spec|test)\.(ts|tsx)$/,
      loader: 'ignore-loader',
    });
    return config;
  },
};

module.exports = nextConfig;
