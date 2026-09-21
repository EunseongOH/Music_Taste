# Graph Report - Music_Taste  (2026-09-12)

## Corpus Check
- 83 files · ~139,746 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 369 nodes · 826 edges · 29 communities (12 shown, 16 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 9 edges (avg confidence: 0.89)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Frontend Pages & UI Components
- Spotify Search & Artist Warmup
- Admin & Unreleased Tracks Management
- Package Dependencies & Scripts
- Next.js Layouts & Metadata
- Graphify Skill Documentation
- TypeScript Config
- Supabase Auth & Session
- Root Layout & Nickname Generation
- Product Requirements & Workflow Docs
- Safe Storage Fallback
- Snake Path Timeline Component
- Shared Taste Result Page
- Spotify Debug Route
- Branch Strategy Rules
- ESLint Config
- PostCSS Config
- Auto-Commit Workflow Rule
- Confidence Rubric Doc
- Query Traversal Modes Doc
- Default Artist Placeholder
- Default Profile Placeholder
- File Icon Asset
- Globe Icon Asset
- Next.js Logo Asset
- OG Image Asset
- Vercel Logo Asset
- Window Icon Asset

## God Nodes (most connected - your core abstractions)
1. `createClient()` - 54 edges
2. `getSafeLocale()` - 36 edges
3. `react` - 24 edges
4. `useAuth()` - 23 edges
5. `/graphify Skill` - 20 edges
6. `framer-motion` - 17 edges
7. `lucide-react` - 17 edges
8. `compilerOptions` - 16 edges
9. `trackEvent()` - 15 edges
10. `TracksPage()` - 14 edges

## Surprising Connections (you probably didn't know these)
- `Branch Usage Rule (develop-only)` --semantically_similar_to--> `Branch Strategy: develop-only, no direct main edits`  [INFERRED] [semantically similar]
  .agents/AGENTS.md → .antigravity/rules.md
- `Sortify Product Vision` --shares_data_with--> `Sortify Site Robots/Sitemap Config`  [INFERRED]
  .antigravity/prd.md → public/robots.txt
- `Spotify API Cache Warm-up Workflow (warmup job)` --shares_data_with--> `PRD Technical Stack (Next.js, Supabase, Spotify API, Google OAuth)`  [INFERRED]
  .github/workflows/spotify-warmup.yml → .antigravity/prd.md
- `Spotify API Cache Warm-up Workflow (warmup job)` --shares_data_with--> `Rules Technology Stack (TS, Next.js, Tailwind, Lucide, Supabase, Capacitor)`  [INFERRED]
  .github/workflows/spotify-warmup.yml → .antigravity/rules.md
- `graphify Integration Rules (root CLAUDE.md)` --shares_data_with--> `graphify Integration Rules (.claude/CLAUDE.md)`  [INFERRED]
  CLAUDE.md → .claude/CLAUDE.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Claude Code Project Configuration Loading Flow** — _claude_claude_graphify_rules, claude_graphify_rules, agents_nextjs_custom_version_warning, _claude_skills_graphify_skill_graphify_skill [INFERRED 0.85]
- **graphify Skill Reference Pipeline** — _claude_skills_graphify_skill_graphify_skill, _claude_skills_graphify_references_add_watch_graphify_add_command, _claude_skills_graphify_references_exports_wiki, _claude_skills_graphify_references_extraction_spec_node_id_format, _claude_skills_graphify_references_github_and_merge_clone_flow, _claude_skills_graphify_references_hooks_post_commit_hook, _claude_skills_graphify_references_query_vocab_expansion, _claude_skills_graphify_references_transcribe_whisper_transcription, _claude_skills_graphify_references_update_incremental_update [EXTRACTED 1.00]
- **Spotify + Supabase Integration Stack** — _antigravity_prd_tech_stack, _antigravity_rules_tech_stack, _github_workflows_spotify_warmup_warmup_job [INFERRED 0.85]

## Communities (29 total, 16 thin omitted)

### Community 0 - "Frontend Pages & UI Components"
Cohesion: 0.11
Nodes (46): framer-motion, lucide-react, react, react-dom, PopupCallback(), PopupLogin(), Provider, ExploreTastePage() (+38 more)

### Community 1 - "Spotify Search & Artist Warmup"
Cohesion: 0.07
Nodes (52): ALL_ARTISTS, fetchSpotify(), getJitteredExpiresAt(), HIPHOP_RNB_ARTISTS, INDIE_ROCK_KBAND_ARTISTS, isMatchingArtist(), JPOP_ARTISTS, KPOP_ARTISTS (+44 more)

### Community 2 - "Admin & Unreleased Tracks Management"
Cohesion: 0.10
Nodes (46): ArchivePage(), formatNickname(), TournamentResult, Track, translations, UnreleasedTrack, AdminPage(), NavSection (+38 more)

### Community 3 - "Package Dependencies & Scripts"
Cohesion: 0.04
Nodes (45): dependencies, @apps-in-toss/web-framework, framer-motion, html-to-image, lucide-react, next, @next/third-parties, react (+37 more)

### Community 4 - "Next.js Layouts & Metadata"
Cohesion: 0.08
Nodes (9): nextConfig, next, metadata, metadata, metadata, metadata, metadata, metadata (+1 more)

### Community 5 - "Graphify Skill Documentation"
Cohesion: 0.12
Nodes (24): graphify Integration Rules (.claude/CLAUDE.md), /graphify add <url> Ingestion, --watch Folder Auto-Rebuild, MCP Stdio Server (graphify.serve), Neo4j/FalkorDB Export & Push, Wiki Export (--wiki), Node ID Format Rule ({stem}_{entity}), GitHub Clone & Cross-Repo Merge Flow (+16 more)

### Community 6 - "TypeScript Config"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 7 - "Supabase Auth & Session"
Cohesion: 0.23
Nodes (6): @supabase/ssr, GET(), generateMetadata(), LayoutProps, IMPORTANT: Avoid writing any logic between createServerClient and, createClient()

### Community 8 - "Root Layout & Nickname Generation"
Cohesion: 0.18
Nodes (7): playfair, pretendard, AuthProvider(), LayoutWrapper(), generateUniqueNickname(), musicNouns, positiveAdjectives

### Community 9 - "Product Requirements & Workflow Docs"
Cohesion: 0.20
Nodes (11): Warm Cream & Navy Design System, Onboarding & Entry Flow (FUNC-01), Taste Exploration via Spotify API (FUNC-02), LP World Cup Interaction (FUNC-03), Result Generation & Image Export (FUNC-04), Sortify Product Vision, Spotify Search API Chunking (max 10/request), PRD Technical Stack (Next.js, Supabase, Spotify API, Google OAuth) (+3 more)

### Community 11 - "Snake Path Timeline Component"
Cohesion: 0.43
Nodes (6): getBezierLength(), getNodeDimensions(), getRowSizes(), SnakePathTimeline(), SnakePathTimelineProps, Track

### Community 12 - "Shared Taste Result Page"
Cohesion: 0.40
Nodes (5): formatNickname(), TasteSharedPage(), TournamentResult, Track, translations

## Knowledge Gaps
- **163 isolated node(s):** `eslintConfig`, `nextConfig`, `name`, `version`, `private` (+158 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 190 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **16 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `next` connect `Next.js Layouts & Metadata` to `Root Layout & Nickname Generation`, `Package Dependencies & Scripts`, `Supabase Auth & Session`?**
  _High betweenness centrality (0.121) - this node is a cross-community bridge._
- **Why does `react` connect `Frontend Pages & UI Components` to `Spotify Search & Artist Warmup`, `Admin & Unreleased Tracks Management`, `Package Dependencies & Scripts`, `Root Layout & Nickname Generation`, `Snake Path Timeline Component`, `Shared Taste Result Page`?**
  _High betweenness centrality (0.088) - this node is a cross-community bridge._
- **Why does `framer-motion` connect `Frontend Pages & UI Components` to `Spotify Search & Artist Warmup`, `Admin & Unreleased Tracks Management`, `Package Dependencies & Scripts`, `Snake Path Timeline Component`, `Shared Taste Result Page`?**
  _High betweenness centrality (0.062) - this node is a cross-community bridge._
- **What connects `eslintConfig`, `nextConfig`, `name` to the rest of the system?**
  _163 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Frontend Pages & UI Components` be split into smaller, more focused modules?**
  _Cohesion score 0.10664682539682539 - nodes in this community are weakly interconnected._
- **Should `Spotify Search & Artist Warmup` be split into smaller, more focused modules?**
  _Cohesion score 0.07305669199298656 - nodes in this community are weakly interconnected._
- **Should `Admin & Unreleased Tracks Management` be split into smaller, more focused modules?**
  _Cohesion score 0.09724238026124818 - nodes in this community are weakly interconnected._