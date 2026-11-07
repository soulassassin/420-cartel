import type { NextConfig } from 'next';

const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined;

const isStaticExport =
  process.env.NODE_ENV === 'production' && !process.env.NEXT_PUBLIC_SUPABASE_URL;

const nextConfig: NextConfig = {
  output: isStaticExport ? 'export' : undefined,
  reactStrictMode: true,
  transpilePackages: ['three'],
  images: {
    unoptimized: !process.env.NEXT_PUBLIC_SUPABASE_URL,
    remotePatterns: [
      ...(supabaseHost
        ? ([{ protocol: 'https', hostname: supabaseHost, pathname: '/storage/v1/object/public/**' }] as const)
        : []),
      { protocol: 'https', hostname: 'cdn.higgsfield.ai', pathname: '/**' },
    ],
  },
  experimental: {
    serverActions: { bodySizeLimit: '8mb' },
  },
  webpack: (config, { dev }) => {
    if (dev) {
      config.cache = false;
    }
    return config;
  },
};

export default nextConfig;
