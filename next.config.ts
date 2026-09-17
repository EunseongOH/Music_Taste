import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
    remotePatterns: [
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
      {
        // 자체 DB 앨범 커버 (Cover Art Archive, CC0). archive.org 로 리다이렉트된다
        protocol: "https",
        hostname: "coverartarchive.org",
      },
      {
        protocol: "https",
        hostname: "**.archive.org",
      },
      {
        // 자체 DB 앨범 커버 2순위 (Deezer). 앨범 ID 로 URL 이 정해지고 CDN 으로 리다이렉트된다
        protocol: "https",
        hostname: "api.deezer.com",
      },
      {
        protocol: "https",
        hostname: "**.dzcdn.net",
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
