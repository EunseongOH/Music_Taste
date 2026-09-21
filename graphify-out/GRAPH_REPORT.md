# Graph Report - Music_Taste  (2026-09-17)

## Corpus Check
- 149 files · ~499,400 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 875 nodes · 1556 edges · 63 communities (36 shown, 20 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 19 edges (avg confidence: 0.87)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `02e03a1d`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- createClient
- utils/spotify.ts
- session/route.ts
- package.json
- next
- /graphify Skill
- compilerOptions
- 홍보 전 사전 확보 계획 — 자주 호출될 아티스트의 정보와 전곡 트랙리스트
- Bootstrap.tsx
- Sortify Product Vision
- MemoryStorage
- SnakePathTimeline.tsx
- compilerOptions
- platform.ts
- Branch Usage Rule (develop-only)
- eslint.config.mjs
- postcss.config.mjs
- Auto Commit & Push Workflow with Prefixed Messages
- Confidence Score Rubric (EXTRACTED/INFERRED/AMBIGUOUS)
- BFS/DFS Traversal Modes
- Default Artist Placeholder Image
- Default Profile Placeholder Icon
- File Icon
- Globe Icon
- Next.js Logo
- OG Image: Sortify social-share preview showing Top 10 Tracks ranking and Music Tier List UI, used to brand link previews on social media
- Vercel Logo
- Window Icon
- warmup_artists.ts
- session-check.mjs
- index.ts
- bundle-check.mjs
- scripts
- capture.mjs
- capture-auth.mjs
- capture-screenshots.mjs
- prelaunch-warm.ts
- flow-check.mjs
- refs-auth/manifest.json
- playwright
- verify.mjs
- mtls-setup.mjs
- make-fixture-mix.mjs
- discogs-dump.ts
- explore-picks.ts
- share-check.mjs
- login.mjs
- web-regression.mjs
- next-image.tsx
- make-fixture.mjs
- refs/manifest.json
- shot-exit.mjs
- router-check.mjs
- shot.mjs
- make-logo.mjs
- vercel-env.sh

## God Nodes (most connected - your core abstractions)
1. `createClient()` - 56 edges
2. `getSafeLocale()` - 36 edges
3. `createAdminClient()` - 34 edges
4. `react` - 29 edges
5. `useAuth()` - 23 edges
6. `/graphify Skill` - 20 edges
7. `framer-motion` - 17 edges
8. `lucide-react` - 17 edges
9. `TracksPage()` - 17 edges
10. `scripts` - 16 edges

## Surprising Connections (you probably didn't know these)
- `Branch Usage Rule (develop-only)` --semantically_similar_to--> `Branch Strategy: develop-only, no direct main edits`  [INFERRED] [semantically similar]
  .agents/AGENTS.md → .antigravity/rules.md
- `Sortify Product Vision` --shares_data_with--> `Sortify Site Robots/Sitemap Config`  [INFERRED]
  .antigravity/prd.md → public/robots.txt
- `enqueue()` --calls--> `createAdminClient()`  [EXTRACTED]
  scripts/.festival-seed.tmp.ts → src/utils/supabase/admin.ts
- `saveToDb()` --calls--> `createAdminClient()`  [EXTRACTED]
  scripts/warmup_artists.ts → src/utils/supabase/admin.ts
- `main()` --calls--> `createAdminClient()`  [EXTRACTED]
  scripts/warmup_artists.ts → src/utils/supabase/admin.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **graphify Skill Reference Pipeline** — _claude_skills_graphify_skill_graphify_skill, _claude_skills_graphify_references_add_watch_graphify_add_command, _claude_skills_graphify_references_exports_wiki, _claude_skills_graphify_references_extraction_spec_node_id_format, _claude_skills_graphify_references_github_and_merge_clone_flow, _claude_skills_graphify_references_hooks_post_commit_hook, _claude_skills_graphify_references_query_vocab_expansion, _claude_skills_graphify_references_transcribe_whisper_transcription, _claude_skills_graphify_references_update_incremental_update [EXTRACTED 1.00]
- **Claude Code Project Configuration Loading Flow** — _claude_claude_graphify_rules, claude_graphify_rules, agents_nextjs_custom_version_warning, _claude_skills_graphify_skill_graphify_skill [INFERRED 0.85]
- **Spotify + Supabase Integration Stack** — _antigravity_prd_tech_stack, _antigravity_rules_tech_stack, _github_workflows_spotify_warmup_warmup_job [INFERRED 0.85]

## Communities (63 total, 20 thin omitted)

### Community 0 - "createClient"
Cohesion: 0.06
Nodes (105): framer-motion, lucide-react, react, react-dom, ArchivePage(), formatNickname(), TournamentResult, Track (+97 more)

### Community 1 - "utils/spotify.ts"
Cohesion: 0.06
Nodes (66): EN_TO_KO, enqueue(), mb(), norm(), OUT, resolve(), sleep(), spotifySearch() (+58 more)

### Community 2 - "session/route.ts"
Cohesion: 0.12
Nodes (24): cache, GET(), OPTIONS(), SpotifySearchResult, ALLOWED_ORIGINS, corsHeaders(), HOSTS, preflight() (+16 more)

### Community 3 - "package.json"
Cohesion: 0.05
Nodes (43): dependencies, @apps-in-toss/web-framework, framer-motion, html-to-image, lucide-react, next, @next/third-parties, react (+35 more)

### Community 4 - "next"
Cohesion: 0.06
Nodes (15): nextConfig, next, @supabase/ssr, metadata, GET(), metadata, metadata, metadata (+7 more)

### Community 5 - "/graphify Skill"
Cohesion: 0.12
Nodes (24): graphify Integration Rules (.claude/CLAUDE.md), /graphify add <url> Ingestion, --watch Folder Auto-Rebuild, MCP Stdio Server (graphify.serve), Neo4j/FalkorDB Export & Push, Wiki Export (--wiki), Node ID Format Rule ({stem}_{entity}), GitHub Clone & Cross-Repo Merge Flow (+16 more)

### Community 6 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 7 - "홍보 전 사전 확보 계획 — 자주 호출될 아티스트의 정보와 전곡 트랙리스트"
Cohesion: 0.04
Nodes (47): 0. 목표와 완료 기준, 1. 현재 수치 (2026-09-17), 2. 왜 Spotify로 미리 다 받는 방식은 안 되는가, 3.1 후보 출처, 3.2 등급, 3.3 저장 구조 (additive), 3. 대상 아티스트 선정, ★ 3일 압축판 (2026-09-17 결정: 홍보 약 3일 뒤 시작) (+39 more)

### Community 8 - "Bootstrap.tsx"
Cohesion: 0.05
Nodes (40): @apps-in-toss/web-framework, playfair, pretendard, AuthProvider(), LayoutWrapper(), generateUniqueNickname(), musicNouns, positiveAdjectives (+32 more)

### Community 9 - "Sortify Product Vision"
Cohesion: 0.20
Nodes (11): Warm Cream & Navy Design System, Onboarding & Entry Flow (FUNC-01), Taste Exploration via Spotify API (FUNC-02), LP World Cup Interaction (FUNC-03), Result Generation & Image Export (FUNC-04), Sortify Product Vision, Spotify Search API Chunking (max 10/request), PRD Technical Stack (Next.js, Supabase, Spotify API, Google OAuth) (+3 more)

### Community 11 - "SnakePathTimeline.tsx"
Cohesion: 0.43
Nodes (6): getBezierLength(), getNodeDimensions(), getRowSizes(), SnakePathTimeline(), SnakePathTimelineProps, Track

### Community 12 - "compilerOptions"
Cohesion: 0.07
Nodes (26): compilerOptions, allowImportingTsExtensions, baseUrl, esModuleInterop, isolatedModules, jsx, lib, module (+18 more)

### Community 13 - "platform.ts"
Cohesion: 0.10
Nodes (9): html-to-image, PlatformError, share(), ShareTarget, shareTargets, copyText(), PlatformError, ShareTarget (+1 more)

### Community 29 - "warmup_artists.ts"
Cohesion: 0.16
Nodes (19): ALL_ARTISTS, fetchSpotify(), getJitteredExpiresAt(), HIPHOP_RNB_ARTISTS, INDIE_ROCK_KBAND_ARTISTS, isMatchingArtist(), JPOP_ARTISTS, KPOP_ARTISTS (+11 more)

### Community 30 - "session-check.mjs"
Cohesion: 0.07
Nodes (21): @supabase/supabase-js, args, env, HERE, ids, ROOT, supabase, yes (+13 more)

### Community 31 - "index.ts"
Cohesion: 0.23
Nodes (18): byName(), byUrlRelationship(), failed(), fillArtist(), fillRelease(), hasHangul(), hasUnmappedRecentRelease(), Lookup (+10 more)

### Community 32 - "bundle-check.mjs"
Cohesion: 0.11
Nodes (16): ADMIN_ONLY, all, appName, corsName, covered, css, DIST, files (+8 more)

### Community 33 - "scripts"
Cohesion: 0.12
Nodes (16): scripts, baseline:capture, baseline:verify, build, build:toss, check:toss, check:web, db:warmup (+8 more)

### Community 34 - "capture.mjs"
Cohesion: 0.15
Nodes (13): argv, BASE, dialogs, drainCaptures(), FIXED_TIME, HERE, log(), manifest (+5 more)

### Community 35 - "capture-auth.mjs"
Cohesion: 0.16
Nodes (12): dismiss(), drain(), FIXED_TIME, HERE, log(), m, manifest, openSheet() (+4 more)

### Community 36 - "capture-screenshots.mjs"
Cohesion: 0.14
Nodes (11): FRAME_W, helper, HERE, LANDSCAPE, OUT, PHONE, phoneShots, PORTRAIT (+3 more)

### Community 37 - "prelaunch-warm.ts"
Cohesion: 0.26
Nodes (17): dbAlbumIds(), expiresAt(), getToken(), liveAlbumPages(), liveTrackAlbums(), loadTargets(), main(), plan() (+9 more)

### Community 39 - "refs-auth/manifest.json"
Cohesion: 0.20
Nodes (9): files, fixedTime, mode, savedId, shares, trackCount, user, id (+1 more)

### Community 40 - "playwright"
Cohesion: 0.22
Nodes (3): playwright, HERE, PROFILE

### Community 41 - "verify.mjs"
Cohesion: 0.22
Nodes (7): after, before, diffs, HERE, map, REFS, TMP

### Community 42 - "mtls-setup.mjs"
Cohesion: 0.25
Nodes (6): [certPath, keyPath, passphrase], certPem, daysLeft, encrypted, keyPem, now

### Community 43 - "make-fixture-mix.mjs"
Cohesion: 0.25
Nodes (5): ARTISTS, OUT, seenCovers, seenTitles, tracks

### Community 44 - "discogs-dump.ts"
Cohesion: 0.28
Nodes (13): all(), [cmd, arg], links(), match(), mb(), ndjsonFor(), normTitle(), parse() (+5 more)

### Community 45 - "explore-picks.ts"
Cohesion: 0.21
Nodes (9): Cand, curated(), EXCLUDE, EXTRA, KR, main(), norm(), sb (+1 more)

### Community 46 - "share-check.mjs"
Cohesion: 0.29
Nodes (4): HERE, RANKING, TOSS_LABELS, WEB_LABELS

### Community 47 - "login.mjs"
Cohesion: 0.40
Nodes (5): HERE, PROFILE, readSession(), readSessionInPage(), started

### Community 48 - "web-regression.mjs"
Cohesion: 0.33
Nodes (3): ARTIST, HERE, RANKING

### Community 50 - "make-fixture.mjs"
Cohesion: 0.40
Nodes (3): HERE, OUT, tracks

### Community 51 - "refs/manifest.json"
Cohesion: 0.40
Nodes (4): dialogs, files, fixedTime, trackCount

### Community 52 - "shot-exit.mjs"
Cohesion: 0.40
Nodes (4): before, HERE, leave, RANKING

### Community 54 - "shot.mjs"
Cohesion: 0.50
Nodes (3): errors, HERE, [url, outArg, w = '430', h = '932']

## Knowledge Gaps
- **406 isolated node(s):** `eslintConfig`, `nextConfig`, `name`, `version`, `private` (+401 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 495 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **20 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `playwright` connect `playwright` to `capture.mjs`, `capture-auth.mjs`, `package.json`, `capture-screenshots.mjs`, `flow-check.mjs`, `share-check.mjs`, `login.mjs`, `web-regression.mjs`, `shot-exit.mjs`, `router-check.mjs`, `shot.mjs`, `make-logo.mjs`, `session-check.mjs`?**
  _High betweenness centrality (0.152) - this node is a cross-community bridge._
- **Why does `@supabase/supabase-js` connect `session-check.mjs` to `createClient`, `utils/spotify.ts`, `session/route.ts`, `package.json`?**
  _High betweenness centrality (0.100) - this node is a cross-community bridge._
- **Why does `react` connect `createClient` to `Bootstrap.tsx`, `SnakePathTimeline.tsx`, `package.json`, `next-image.tsx`?**
  _High betweenness centrality (0.076) - this node is a cross-community bridge._
- **What connects `eslintConfig`, `nextConfig`, `name` to the rest of the system?**
  _406 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `createClient` be split into smaller, more focused modules?**
  _Cohesion score 0.05787195260879471 - nodes in this community are weakly interconnected._
- **Should `utils/spotify.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.061052631578947365 - nodes in this community are weakly interconnected._
- **Should `session/route.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.11822660098522167 - nodes in this community are weakly interconnected._