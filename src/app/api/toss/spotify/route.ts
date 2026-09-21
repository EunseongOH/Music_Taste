import { NextRequest, NextResponse } from 'next/server';
import * as spotify from '@/utils/spotify';
import { corsHeaders, preflight } from '../cors';

/**
 * 토스 미니앱용 Spotify REST 디스패치.
 *
 * 웹은 `@/utils/spotify`의 Server Action을 그대로 직접 호출한다. 하지만 Server
 * Action은 다른 origin에서 호출할 수 없어서, 미니앱(Vite SPA)은 이 라우트를
 * 절대 URL로 호출한다. Spotify 로직은 여기서 한 줄도 복제하지 않고 기존
 * 모듈을 그대로 재사용한다.
 *
 * ALLOWED가 신뢰 경계다. 네임스페이스 객체에 동적 프로퍼티 접근을 하지 않고
 * 명시적으로 나열한 함수만 노출한다.
 */
export const runtime = 'nodejs';

const ALLOWED = {
  searchSpotifyArtists: spotify.searchSpotifyArtists,
  getInitialArtists: spotify.getInitialArtists,
  getRelatedArtists: spotify.getRelatedArtists,
  getSpotifyGenreQuery: spotify.getSpotifyGenreQuery,
  searchArtistsByGenres: spotify.searchArtistsByGenres,
  getLastSpotifyError: spotify.getLastSpotifyError,
  getArtistAlbums: spotify.getArtistAlbums,
  getAlbumTracks: spotify.getAlbumTracks,
} as const;

type AllowedFn = keyof typeof ALLOWED;

const isAllowedFn = (v: unknown): v is AllowedFn =>
  typeof v === 'string' && Object.prototype.hasOwnProperty.call(ALLOWED, v);

export async function OPTIONS(request: NextRequest) {
  return preflight(request);
}

export async function POST(request: NextRequest) {
  const headers = corsHeaders(request.headers.get('origin'));

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400, headers });
  }

  const { fn, args } = (body ?? {}) as { fn?: unknown; args?: unknown };

  if (!isAllowedFn(fn)) {
    return NextResponse.json({ error: 'unknown_fn' }, { status: 400, headers });
  }
  if (args !== undefined && !Array.isArray(args)) {
    return NextResponse.json({ error: 'invalid_args' }, { status: 400, headers });
  }

  try {
    // 인자는 위치 기반으로 그대로 전달한다. 시그니처는 Server Action과 동일하므로
    // 미니앱 쪽 shim은 호출부를 수정하지 않고 그대로 쓸 수 있다.
    const call = ALLOWED[fn] as (...a: unknown[]) => Promise<unknown>;
    const data = await call(...((args ?? []) as unknown[]));
    return NextResponse.json({ data }, { headers });
  } catch (error) {
    console.error(`[api/toss/spotify] ${fn} 실패:`, error);
    return NextResponse.json({ error: 'upstream_failed' }, { status: 502, headers });
  }
}
