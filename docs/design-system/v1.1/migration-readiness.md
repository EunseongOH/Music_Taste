# Sortify Design System v1.1 — Migration Readiness Audit

> Audit date: 2026-09-26  
> Figma design waves: **A–D validated**  
> Production migration: **not started**  
> Current develop observed: `741949a5476bf91ec937b18d0a7d136b95b36617`  
> Together working branch: `fix/together-result-consistency`  
> Overall status: **DESIGN READY / CODE BASELINE NOT YET LOCKED**

## 1. Executive conclusion

The v1.1 design system is ready to be implemented **as a staged migration**, not as a one-shot visual rewrite.

Figma coverage is sufficient across:
- Favorite Songs picking
- Tournament
- My Taste Space / records
- Public Archive
- Together entry / invite / result

Component boundaries have also been validated against real screens rather than isolated specimens.

However, production migration should **not start on Together-related files yet** because the code baseline is split:

- `develop` is currently `741949a`
- `fix/together-result-consistency` is **8 commits ahead and 4 commits behind develop**
- the branches diverged from `cca50a1`

This is the only blocking migration gate found in this audit.

---

## 2. Readiness matrix

| Area | Status | Notes |
|---|---|---|
| Foundations / typography / color roles | READY | v1.1 semantic roles and hierarchy documented |
| Picking components | READY | Wave A validated across Favorite + Together/new |
| Tournament system | READY WITH GUARDRAIL | presentational additions ready; do not rewrite WorldCupCandidate/LPPlayer behavior |
| Records / archive | READY | shared RecordRow anatomy validated across five contexts |
| Together domain | DESIGN READY / BRANCH BLOCKED | Wave D validated, but implementation baseline must be reconciled first |
| Existing product components | READY | WorldCupCandidate, LPPlayer, RankList, RelationGraph etc. have explicit keep/reuse boundaries |
| Regression harness | READY | typecheck/build and multiple regression suites exist |
| Single production baseline | BLOCKED | develop and Together working branch currently diverge |
| Figma font-runtime parity | WARNING | plugin runtime cannot load Pretendard Variable; product typography remains specified as Pretendard |

### Start condition

Production migration may begin only after:

1. Together fixes are reconciled onto the chosen baseline branch.
2. That branch gets one immutable migration baseline SHA recorded in this document.
3. Full pre-migration checks pass on that baseline.

---

## 3. Baseline reconciliation gate — G0

Do **not** implement the design system independently on both `develop` and `fix/together-result-consistency`.

Choose one source of truth first.

Recommended operational sequence:

1. Finish/review the remaining Together work.
2. Reconcile it with current `develop@741949a`.
3. Run the complete regression set.
4. Record the resulting SHA as **DS migration baseline**.
5. Create the migration branch from that exact SHA.

Why this matters:

- `src/app/together/[code]/page.tsx`
- `src/app/together/[code]/result/page.tsx`
- `src/app/together/new/page.tsx`
- `src/app/worldcup/page.tsx`
- Together identity/completion/matching utilities

have meaningful branch differences. Migrating UI before reconciliation would mix structural refactoring with unresolved feature/state changes.

---

## 4. Migration principles

### 4.1 Presentational migration only

A design-system PR must not silently change:

- persistence
- Supabase writes/RPCs
- draft ownership
- completion/claim behavior
- routing
- ranking math
- Together match math
- authentication semantics
- export data

Business logic stays in route/product code unless a separate behavior refactor is explicitly scoped and tested.

### 4.2 Adopt by component family, not by screen rewrite

Avoid “redesign /explore”, “redesign /archive”, etc.

Instead:

- create/stabilize one component family
- adopt it in one low-risk screen
- verify
- expand to the remaining validated contexts

This is how the Figma system was designed.

### 4.3 Keep product components product-specific

Do not genericize:

- WorldCupCandidate
- LPPlayer
- WinnerReveal
- TasteRelationGraph
- ParticipantSheet
- TogetherPairDetail
- WinnerFeature
- UnreleasedTrackItem

Their domain semantics are part of their design.

### 4.4 Do not duplicate component APIs by mode

No separate:

- FavoriteSearchInput / TogetherSearchInput
- FavoriteTrackRow / TogetherTrackRow
- TogetherTournamentProgress
- ArchiveRecordRow
- MateRecordRow

Mode differences belong to copy, data and composition unless Figma explicitly defines a visual variant.

---

## 5. Proposed implementation batches

## M0 — Baseline lock and golden QA

No UI migration yet.

Required:
- reconcile Together branch with develop
- record baseline SHA
- capture/verify current visual baselines where available
- run all automated checks

Exit criterion:
- one branch is the only implementation source of truth

---

## M1 — Build v1.1 component APIs without broad adoption

Create or stabilize the component contracts first.

Core/shared:
- PageHeader
- IconButton
- SearchInput
- FormField
- SelectField
- RecordRow
- ActionRow
- BottomActionDock

Product:
- SelectableArtistRow
- ArtistGridItem
- SelectableTrackRow
- AlbumSelectionHeader
- TournamentProgress
- GestureHint
- UndoNotice
- CodeInput
- RoomCodeCard
- ParticipantChip
- MediaHero
- WinnerFeature
- UnreleasedTrackItem

Important:
- keep current production usages unchanged until each component has a focused adoption PR
- do not simultaneously change copy/business state

---

## M2 — Picking adoption

Primary files:
- `src/app/explore/page.tsx`
- `src/app/tracks/page.tsx`
- `src/app/together/new/page.tsx`

Adopt:
- SearchInput
- ArtistGridItem
- SelectableArtistRow
- SelectionChip
- SelectableTrackRow
- AlbumSelectionHeader
- TrackSelectionDock composition

Recommended order:

1. `/explore` pilot
2. Together/new artist selection
3. `/tracks`
4. Together/new track selection

Why:
- Favorite and Together reuse becomes observable early
- selection-state logic remains route-owned
- visual divergence can be removed without touching Tournament/Result

---

## M3 — Records and archive adoption

Primary files:
- `src/components/space/SpaceUI.tsx`
- `src/app/explore-taste/page.tsx`
- `src/app/archive/page.tsx`
- `src/app/taste/[id]/page.tsx`

Adopt:
- RecordRow
- SelectField
- ActionRow
- WinnerFeature
- UnreleasedTrackItem

Existing primitives to preserve/consolidate:
- UnderlineTabs
- Switch
- RankList
- Cover
- Avatar
- Sheet
- ConfirmSheet

Key rule:
Taste result, Together room, Listen Later, Mate and Public Taste records become compositions of **one RecordRow**, not five new row components.

---

## M4 — Together domain adoption

Start only after G0 baseline reconciliation.

Primary files:
- `src/app/together/page.tsx`
- `src/app/together/new/page.tsx`
- `src/app/together/[code]/page.tsx`
- `src/app/together/[code]/result/page.tsx`

Adopt:
- CodeInput
- RoomCodeCard
- ParticipantChip
- MediaHero
- MatchMetric where prominent

Keep logic/structure:
- TasteRelationGraph
- ParticipantSheet
- TogetherPairDetail

Do not modify in the same PR:
- matching math
- identity normalization
- pending claim
- completion saving
- database security/migrations

---

## M5 — Tournament adoption

Primary files:
- `src/app/worldcup/page.tsx`
- `src/components/WorldCupCandidate.tsx`
- `src/components/LPPlayer.tsx`
- `src/components/result/WinnerReveal.tsx`

Adopt/add:
- TournamentProgress
- GestureHint
- UndoNotice
- CandidatePair composition

### Hard guardrail

`WorldCupCandidate` and `LPPlayer` are **KEEP PRODUCT** components.

The Figma work rebuilt their documentation to faithfully match production. It is not authorization to rewrite their interaction implementation.

Preserve:
- press/drag timing
- drag thresholds
- LP reveal behavior
- disc treatment
- picture-disc behavior
- tonearm geometry/animation
- reduced-motion logic
- persistence/routing

Refactor only wrappers and duplicated presentation around them unless a separate behavior task is approved.

---

## M6 — Cleanup and de-duplication

Only after M2–M5 are stable.

Remove:
- obsolete per-screen equivalents
- duplicated utility-class bundles
- dead wrappers
- visual aliases that now point to the same v1.1 component

Do not delete old code until repository-wide search confirms all consumers migrated.

---

## 6. Code mapping by validated design wave

| Figma wave | Primary implementation areas |
|---|---|
| Wave A — Picking | `/explore`, `/tracks`, `/together/new` |
| Wave B — Tournament | `/worldcup`, WorldCupCandidate, LPPlayer, WinnerReveal |
| Wave C — Records & Archive | `/explore-taste`, `/archive`, `/taste/[id]`, SpaceUI |
| Wave D — Together | `/together`, `/together/new`, invite, result, Together product components |

---

## 7. Regression gates

At baseline lock and after every migration batch:

```bash
npm run typecheck
npm run lint
npm run build
npm run check:regression
```

Where the environment supports browser checks:

```bash
npm run check:regression:e2e
npm run check:web
npm run check:toss
```

Database/security verification when a batch touches any related contract or after Together baseline reconciliation:

```bash
npm run check:db
```

### Current script divergence to resolve at G0

The Together working branch contains additional regression coverage such as:

- pending-claim check
- completed-archive check

while current develop has a different regression bundle, including draft-stage / draft-ownership coverage.

The reconciled baseline must contain the intended union of checks before UI migration starts.

---

## 8. Visual QA gates

For each adopted component family:

1. compare against the approved Figma component specimen
2. compare against the matching Figma validation screen
3. test at least mobile 360/390 and desktop layouts where the route supports them
4. check default / selected / loading / disabled / error states relevant to that route
5. verify bottom fixed controls do not cover scroll content
6. verify keyboard focus and 44px interaction targets
7. verify legacy/business behavior is unchanged

For visually sensitive components:

### WorldCupCandidate
Check:
- sleeve/LP layering
- active reveal
- title visibility
- drag affordance

### LPPlayer
Check:
- plinth / platter / LP proportions
- soft/strong glass by context
- picture-disc state
- tonearm active position
- no unintended visual dominance

### MediaHero
Check:
- image remains visible
- fade reaches app background near content
- nav remains legible on bright/dark imagery
- no-image fallback uses ordinary page intro

---

## 9. Typography note

Figma text styles target **Pretendard Variable** for product typography.

The plugin runtime used during this documentation pass could not load the local Pretendard family, so a few validation-only labels were rendered with Inter overlays.

This is a documentation/runtime limitation, not a design change.

Before accepting pixel-level migration QA:
- use Pretendard in the actual app
- verify final screens in a Figma/Desktop environment where Pretendard is available
- do not migrate product typography to Inter to match the plugin screenshots

---

## 10. First implementation PR recommendation

After G0 is resolved, the first migration PR should be deliberately small:

**SearchInput + SelectableArtistRow on `/explore` only.**

It is a good pilot because:
- it has meaningful interaction states
- it is reused later by Together/new
- it does not touch persistence, Tournament or result logic
- visual before/after comparison is straightforward

Exit criteria for that PR:
- route behavior unchanged
- search, loading, clear, selected and empty states verified
- typecheck/lint/build/regression green
- Figma validation matched
- no new route-specific visual component created

Only then expand the same component API into Together/new.

---

## 11. Migration start decision

### Ready
- component taxonomy
- visual system
- cross-flow validation
- migration ordering
- regression strategy

### Blocking
- one reconciled production baseline SHA

Therefore:

> **Do not begin production component migration yet.**
>
> Once the Together branch is reconciled with develop and the combined regression suite is green, the project is ready for staged v1.1 code migration.


## Code migration structure

For the concrete **before → after code architecture, folder structure, route-by-route replacements, and Mermaid dependency diagrams**, see:

- [Code Migration Impact / Structure Map](./code-migration-impact.md)
