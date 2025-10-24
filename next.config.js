// next.config.js
const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: {
    unoptimized: true,
  },
  // 👇 Add this eslint block 👇
  eslint: {
    // Warning: This allows production builds to successfully complete even if
    // your project has ESLint errors. It does NOT fix the errors.
    // It's highly recommended to fix the 'Rules of Hooks' errors instead of ignoring them.
    ignoreDuringBuilds: true,
  },
  // 👆 End of eslint block 👆
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        'bufferutil': false,
        'utf-8-validate': false,
      };
    }
    return config;
  },
};

module.exports = withPWA(nextConfig);
