import { MetadataRoute } from "next";
import { MIX_MATCH } from "@/config/modes";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://sortify.kr";

  const routes = [
    "",
    "/explore",
    "/tracks",
    "/worldcup",
    "/taste",
    "/explore-taste",
    "/archive",
    // 같이 소트하기는 정식 진입점이 생겼다. 참여 링크(/together/<code>)는 색인하지 않는다.
    "/together",
    // 믹스 매치를 내린 동안에는 새로 색인시키지 않는다(주소는 302 로 살아 있다).
    ...(MIX_MATCH ? ["/genres"] : []),
  ];

  return routes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: "daily",
    priority: route === "" ? 1.0 : 0.8,
  }));
}
