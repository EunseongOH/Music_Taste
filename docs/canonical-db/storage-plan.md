# Supabase 무료 한도 대응 — 돈 안 들이고 버티는 방법

작성 2026-09-19. 무료 플랜 데이터베이스 한도는 **500MB** 다.

## 지금 상태

| 항목 | 값 |
|---|---|
| 현재 DB | **193MB (한도의 39%)** |
| 인덱스 정리 전 | 216MB |
| 남은 수집분을 다 채웠을 때 예상 | 약 350MB |

무게가 나가는 표는 넷뿐이다. 나머지는 전부 합쳐도 10MB 미만이다.

| 표 | 행 | 데이터 | 인덱스 |
|---|---|---|---|
| `mb_release_track` | 474,115 | 46MB | 25MB |
| `mb_rg_release` | 85,271 | 15MB | 6MB |
| `deezer_track` | 180,384 | 16MB | 9MB |
| `mb_release_group` | 107,096 | 11MB | 9.6MB |

곡 한 행이 인덱스까지 193바이트다. 발매판 하나당 평균 11곡이므로 **발매그룹 1개 = 약 2KB** 로 계산하면 된다.

남은 대기열은 우선 아티스트 8,853건(약 19MB), 그 밖의 롱테일 54,050건(약 115MB)이다.
**롱테일을 안 받으면 350MB 가 아니라 215MB 에서 멈춘다.**

---

## 1단계 — 이미 했다 (0원, 23MB 확보)

쓰이지 않는 인덱스 3개를 뺐다. 데이터는 그대로다.

| 인덱스 | 크기 | 사용 |
|---|---|---|
| `idx_mb_release_track_recording` | 17MB | 5회 |
| `mb_rg_release_release` | 4.9MB | 0회 |
| `mb_rg_release_pending` | 1.5MB | 0회 |

되살리는 문장은 마이그레이션 `drop_unused_indexes` 주석에 적어 뒀다.

인덱스는 앞으로도 먼저 볼 곳이다. 쓰이는지 확인하는 법:

```sql
select relname, indexrelname, idx_scan, pg_size_pretty(pg_relation_size(indexrelid))
from pg_stat_user_indexes where schemaname='public'
order by pg_relation_size(indexrelid) desc;
```

## 2단계 — 이미 했다 (0원, 증가 자체를 막는다)

수집 스크립트가 용량을 보고 스스로 멈춘다. `db_size_mb()` 를 읽어 **420MB 에서 중단**한다.
`mb-rg-fill tracks` 는 기본적으로 **이용자가 열 아티스트(rank 0~2)까지만** 받는다.
롱테일까지 받으려면 `--all` 을 줘야 한다. `deezer-catalog albums` 도 같은 제동이 걸려 있다.

한도를 바꾸려면 `DB_LIMIT_MB` 환경변수를 준다.

이게 핵심이다. **한도가 문제가 되는 유일한 이유는 안 쓰는 데이터를 받기 때문**이고, 안 받으면 문제가 없다.

## 3단계 — 420MB 에 닿으면 (0원, 지우기)

지우기 전에 CSV 로 내린다. 매일 04:30 자동 백업이 돌고 있고 수동으로도 돌릴 수 있다.

```
npx tsx --env-file=.env.local scripts/backup-catalog.ts
```

지울 수 있는 것을 확보량이 큰 순서로 적는다. 전부 되돌릴 수 있다(다시 수집하거나 CSV 를 되넣는다).

| 대상 | 확보 | 위험 |
|---|---|---|
| **MusicBrainz 에 이미 있는 Deezer 앨범·트랙** (7,352장 / 47,431곡) | 약 7MB | 없음. 화면에서 이미 중복 제거돼 안 나가던 것들이다 |
| **수요 0 이면서 홍보 대상도 아닌 아티스트의 트랙** | 최대 115MB | 그 아티스트를 열면 Spotify 를 부르게 된다 |
| **신뢰 못 하는 연결(`confidence='name'`)의 발매그룹** (1,548건) | 약 0.3MB | 없음. 서비스에 안 쓴다 |
| `spotify_cache_*` 만료분 | 1~2MB | 없음. 21일 캐시다 |

수요 0 인 아티스트를 지우는 문장(예시, 실행 전 백업 확인):

```sql
-- 어떤 아티스트가 지워지는지 먼저 본다
select count(*) from artist_completeness
where coalesce(opens,0) = 0
  and spotify_id not in (select spotify_id from prelaunch_targets)
  and spotify_id not in (select spotify_id from explore_genre_picks);
```

지운 뒤 공간을 실제로 돌려받으려면 `vacuum full` 이 필요하다. 표를 잠그므로 새벽에 한다.

## 4단계 — 그래도 모자라면 (0원, 프로젝트 분리)

Supabase 무료 조직은 **프로젝트를 2개**까지 만들 수 있다. 두 번째 무료 프로젝트를 만들어
음악 카탈로그(`mb_*`, `discogs_*`, `deezer_*`)만 옮기면 **한도가 500MB + 500MB 가 된다.**

- 이용자 데이터(`profiles`, `tournament_*`, `unreleased_*`)는 지금 프로젝트에 그대로 둔다.
- 코드 변경은 카탈로그 전용 클라이언트 하나를 더 두는 것뿐이다. `src/utils/dbCatalog.ts` 는
  이미 애플리케이션에서 조합하고 DB 조인을 쓰지 않으므로 그대로 동작한다.
- 대가: 두 프로젝트를 오가는 조인이 불가능하고, 백업·마이그레이션을 두 번 해야 한다.

## 5단계 — 마지막 수단 (유료)

Supabase Pro 는 월 $25 이고 8GB 다. 위 네 단계로 버티는 한 필요 없다.
지금 증가 속도(홍보 전 216MB, 롱테일 제외 시 상한 215MB)면 **무료로 계속 갈 수 있다.**

---

## 같이 봐야 할 무료 한도

용량만 한도가 아니다.

| 항목 | 무료 한도 | 지금 |
|---|---|---|
| 데이터베이스 | 500MB | 193MB |
| 대역폭(egress) | 월 5GB | 대시보드에서 확인 |
| 월간 활성 사용자 | 50,000 | 여유 |
| 1주일 미사용 시 | 프로젝트 일시정지 | 해당 없음 |

홍보 트래픽에서는 **대역폭이 용량보다 먼저 닿을 수 있다.** 앨범 재킷을 우리 서버가 아니라
Cover Art Archive·Deezer 에서 직접 불러오도록 해 둔 것이 여기에도 도움이 된다.
대역폭이 문제가 되면 `artist_serve_coverage` 같은 무거운 뷰 조회를 줄이고, 앨범 목록 응답에서
안 쓰는 필드를 빼는 것이 먼저다.

## 점검 쿼리

```sql
-- 전체 사용량
select pg_size_pretty(pg_database_size(current_database())),
       round(100.0 * pg_database_size(current_database()) / (500*1048576), 1) as "한도대비_%";

-- 표별 무게
select c.relname, s.n_live_tup,
       pg_size_pretty(pg_table_size(c.oid)) as data,
       pg_size_pretty(pg_indexes_size(c.oid)) as idx
from pg_class c join pg_namespace n on n.oid=c.relnamespace
left join pg_stat_user_tables s on s.relid=c.oid
where n.nspname='public' and c.relkind='r'
order by pg_total_relation_size(c.oid) desc limit 10;
```
