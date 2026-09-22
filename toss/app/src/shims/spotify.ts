import { API_BASE } from '../apiBase';

/**
 * `@/utils/spotify` 대체.
 *
 * 원본은 `"use server"` 모듈(Server Actions)이다. Server Action 은 다른 origin
 * 에서 호출할 수 없으므로, 토스 빌드는 같은 로직을 복제하는 대신 기존 서버의
 * `/api/toss/spotify` 디스패치를 통해 **원본 함수를 그대로 실행**시킨다.
 * (SPOTIFY_CLIENT_SECRET 이 서버에만 있어야 하므로 어차피 이 방향뿐이다)
 *
 * 타입은 원본 파일에서 그대로 가져온다. `import type` 은 빌드 시 지워지므로
 * `"use server"` 모듈이 번들에 들어가지 않는다. alias 를 우회해 상대 경로로
 * 가리키는 이유는, `@/utils/spotify` 가 바로 이 파일로 치환되기 때문이다.
 */
type Api = typeof import('../../../../src/utils/spotify');

async function call(fn: string, args: unknown[]): Promise<unknown> {
  const res = await fetch(`${API_BASE}/api/toss/spotify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ fn, args }),
  });

  if (!res.ok) {
    // 400 unknown_fn 은 아래 목록과 서버의 ALLOWED 가 어긋났다는 뜻이다.
    const detail = await res.text().catch(() => '');
    throw new Error(`spotify/${fn} 실패 (HTTP ${res.status}) ${detail}`);
  }

  const { data } = (await res.json()) as { data: unknown };
  return data;
}

/** 원본과 같은 시그니처로 노출한다. 호출부(`src/`)는 한 글자도 바뀌지 않는다. */
const proxy = <K extends keyof Api>(fn: K) =>
  ((...args: unknown[]) => call(fn, args)) as Api[K];

// 서버의 ALLOWED(src/app/api/toss/spotify/route.ts)와 같은 9개여야 한다.
export const searchSpotifyArtists = proxy('searchSpotifyArtists');
export const getInitialArtists = proxy('getInitialArtists');
export const getRelatedArtists = proxy('getRelatedArtists');
export const getSpotifyGenreQuery = proxy('getSpotifyGenreQuery');
export const searchArtistsByGenres = proxy('searchArtistsByGenres');
export const getLastSpotifyError = proxy('getLastSpotifyError');
export const getArtistAlbums = proxy('getArtistAlbums');
export const getAlbumTracks = proxy('getAlbumTracks');
export const getTrackBudgetLeft = proxy('getTrackBudgetLeft');
