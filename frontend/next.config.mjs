import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  pageExtensions: ['js', 'jsx'],
  turbopack: { root: here },
  // Lets a verification build run without touching the dev server's cache.
  distDir: process.env.BUILD_DIR || '.next',
  // lucide-react ships thousands of modules; rewriting the barrel import
  // to direct paths keeps first compile from crawling.
  experimental: {
    optimizePackageImports: ['lucide-react', 'framer-motion'],
  },
  devIndicators:false,
};

export default nextConfig;
