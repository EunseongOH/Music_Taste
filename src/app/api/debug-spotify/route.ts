import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const results: Record<string, any> = {};

  // 1. Check env vars
  results.env = {
    hasClientId: !!process.env.SPOTIFY_CLIENT_ID,
    clientIdLength: process.env.SPOTIFY_CLIENT_ID?.length ?? 0,
    hasClientSecret: !!process.env.SPOTIFY_CLIENT_SECRET,
    clientSecretLength: process.env.SPOTIFY_CLIENT_SECRET?.length ?? 0,
    nodeVersion: process.version,
  };

  // 2. Try to get Spotify token
  try {
    const clientId = process.env.SPOTIFY_CLIENT_ID!;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET!;
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

    const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
      cache: "no-store",
    });

    results.tokenRequest = {
      status: tokenRes.status,
      ok: tokenRes.ok,
    };

    if (tokenRes.ok) {
      const tokenData = await tokenRes.json();
      results.tokenRequest.hasAccessToken = !!tokenData.access_token;
      results.tokenRequest.expiresIn = tokenData.expires_in;

      // 3. Try a simple search
      const searchRes = await fetch(
        "https://api.spotify.com/v1/search?q=BTS&type=artist&limit=1",
        {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
          },
          cache: "no-store",
        }
      );

      results.searchRequest = {
        status: searchRes.status,
        ok: searchRes.ok,
      };

      if (searchRes.ok) {
        const searchData = await searchRes.json();
        results.searchRequest.firstArtist =
          searchData.artists?.items?.[0]?.name ?? "none";
      } else {
        results.searchRequest.errorBody = await searchRes.text();
      }
    } else {
      results.tokenRequest.errorBody = await tokenRes.text();
    }
  } catch (err: any) {
    results.error = err?.message ?? String(err);
    results.stack = err?.stack?.split("\n").slice(0, 5).join("\n");
  }

  return NextResponse.json(results, {
    headers: { "Cache-Control": "no-store" },
  });
}
