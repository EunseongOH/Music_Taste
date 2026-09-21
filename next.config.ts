import type { NextConfig } from "next";
import { MIX_MATCH } from "./src/config/modes";

const nextConfig: NextConfig = {
  /*
   * 믹스 매치를 내린 동안 /genres 로 들어온 사람을 단일 모드로 보낸다.
   * 302(임시)인 이유: 언제든 되살릴 전제라 "영구 이동"은 사실이 아니고,
   * 301 을 쓰면 복원해도 검색 색인이 돌아오는 데 오래 걸린다. docs/mode-pivot.md §12.1
   */
  async redirects() {
    return MIX_MATCH
      ? []
      : [{ source: "/genres", destination: "/explore?mode=single", permanent: false }];
  },
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
