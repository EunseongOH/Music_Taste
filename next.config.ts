import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "picsum.photos",
      },
      {
        protocol: "https",
        hostname: "img.youtube.com",
      },
      {
        protocol: "https",
        hostname: "i.scdn.co",
      },
      {
        protocol: "https",
        hostname: "image-cdn.spotifycdn.com",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },
  // Increase HTTP header size limit to prevent HTTP 431 errors from large cookies
  experimental: {
    serverActions: {
      allowedOrigins: [
        "localhost:3000",
        "sortify.kr",
        "www.sortify.kr",
      ],
    },
  },
};

export default nextConfig;
