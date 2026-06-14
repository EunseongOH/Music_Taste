import { MetadataRoute } from "next";

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
    "/genres",
  ];

  return routes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: "daily",
    priority: route === "" ? 1.0 : 0.8,
  }));
}
