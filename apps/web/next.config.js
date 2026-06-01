/** @type {import('next').NextConfig} */
const path = require('path')

const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@skove/sdk'],
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      react: path.dirname(require.resolve('react/package.json')),
      'react-dom': path.dirname(require.resolve('react-dom/package.json')),
    }
    return config
  },
}

module.exports = nextConfig
