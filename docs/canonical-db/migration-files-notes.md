# 마이그레이션 파일 — 그냥 돌리면 안 되는 것들

작성 2026-09-22. 커밋 4efb484 로 운영에만 있던 마이그레이션 19건을 파일로 복원하면서 같이 남긴다.

저장소의 `supabase/migrations/` 는 이제 운영 DB 이력을 거의 그대로 담고 있다.
다만 **파일이 있다고 다 돌려도 되는 것은 아니다.** 아래 셋만 조심하면 된다.

## 1. 일부러 미적용 — `20260921100200_worldcup_draft_mode_ttl.sql`

**누락이 아니라 대기다. 선의로 적용하면 운영이 깨진다.**

운영은 `main` 코드로 도는데, main 의 옛 코드가 `onConflict: 'user_id'` 로 초안을 upsert 한다.

- 유니크 인덱스(`unique_active_user_draft`)를 **먼저 지우면** → 운영 사용자의 초안 저장이 즉시 실패한다.
- cron(`worldcup-draft-ttl`)을 **먼저 켜면** → 옛 코드는 `saved_at` 을 안 찍으므로 자동저장 초안이 1시간 뒤 지워진다.

**적용 시점: develop → main 병합·배포 직후.** 코드가 올라간 뒤에 넣는다.
그 전까지 develop 에서 같은 사용자의 두 모드 초안 동시 생성이 실패하는 것은 알려진 절충이다.

되돌리기:

```sql
select cron.unschedule('worldcup-draft-ttl');
create unique index unique_active_user_draft on public.tournament_drafts (user_id);
```

1/2 인 `20260921100100_worldcup_draft_v2.sql` (progress/saved_at/picks 컬럼) 은 이미 적용돼 있다.
원 출처는 develop 커밋 49ac755, 계획 문서는 `docs/worldcup-draft-plan.md` (develop).

## 2. 재실행하면 데이터가 비는 것

복원한 파일은 **적용 당시 원문 그대로**라, 그때 필요했던 정리 문장이 그대로 들어 있다.
이미 적용된 DB 에는 다시 돌지 않으니(`schema_migrations` 가 막는다) 평소에는 문제가 없다.
손으로 다시 돌릴 때만 주의한다.

| 파일 | 들어 있는 문장 | 다시 돌리면 |
|---|---|---|
| `20260921052755_release_digest_prefix.sql` | `truncate mb_release_digest`, `truncate deezer_album_digest` | 요약이 비워진다 → `scripts/build-digest.ts` 로 재생성 |
| `20260918190824_drop_unused_indexes.sql` | `drop index` 3개 | 인덱스가 사라진다 (되살리는 문장이 파일 주석에 있다) |
| `20260917062344_explore_genre_picks_delete_where.sql` | 함수 안의 `DELETE … WHERE TRUE` | 함수 정의일 뿐이라 안전. 함수를 **부르면** 목록이 갈린다 |

## 3. 스키마만 복원하면 빈 결과가 나오는 것

뷰·표만 만들어서는 화면에 아무것도 안 나온다. 데이터를 채우는 스크립트가 따로 있다.

| 객체 | 채우는 것 |
|---|---|
| `artist_genre_feed` | `mb_artist.genres` 가 있어야 한다. `scripts/wikidata-genres.ts` (커밋 257fe85, 1,423명, `genre_src='wikidata'`) |
| `discogs_release_digest` | `scripts/build-digest.ts discogs` |
| `mb_release_digest`, `deezer_album_digest` | `scripts/build-digest.ts` |
| `artist_serve_snapshot` | `select public.refresh_artist_serve_snapshot();` |

## 파일은 있는데 DB 이력에 없는 것

`20260713000000_spotify_cache.sql`, `20260713000001_spotify_cache_keywords.sql` 2개는
`supabase_migrations.schema_migrations` 에 없다. 이력이 생기기 전에 적용된 것으로 보이고,
객체(`spotify_cache_artists` 등)는 실재하므로 조치하지 않는다.

## 만들지 않은 파일

`mb_worker_invoke_fn` (DB version 20260915043007) 은 기존
`20260915000300_mb_worker_cron.sql` 과 같은 내용이라 중복 생성하지 않았다.
