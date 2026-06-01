/** @type {import('next').NextConfig} */
const path = require('path')

const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@skove/sdk'],
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      // Force single React instance across the monorepo to prevent
      // "Cannot read properties of null (reading 'useContext')" during build
      react: path.resolve(__dirname, '../../node_modules/react'),
      'react-dom': path.resolve(__dirname, '../../node_modules/react-dom'),
    }
    return config
  },
}

module.exports = nextConfig
