# Sortify v1.1 — Full Flow Component Audit

> Audit date: 2026-09-26  
> Production migration: **not started**  
> Favorite Songs Sort baseline: `develop@cca50a183a70a9d034ec1d8cd704a6aea3f43172`  
> Sort Together baseline: `fix/together-result-consistency@9fe775d0758df4b66438e0a04032cecaffa56654`  
> Figma design system: https://www.figma.com/design/DYEYRL3PG29Xb4RJOyNXe8

This audit extends the v1.0 consistency audit beyond generic UI shells and inventories the **actual product flows** before any production migration.

The primary focus is:
1. Favorite Songs Sort — full flow
2. Sort Together — full flow
3. My Taste Space — detailed states
4. Our Taste Archive — detailed states and public taste-card detail

---

# 1. Classification model

Do not turn every repeated DOM fragment into a design-system component.

## A. Design-system component
Reusable across unrelated product areas. Owns interaction/accessibility/visual rules.

Examples:
- PageHeader
- IconButton
- SearchInput
- FormField
- Sheet
- Dialog
- Toast
- BottomActionDock
- RecordRow
- Select / SegmentedControl

## B. Product component
Reusable in Sortify because it expresses a music/taste-specific object or interaction.

Examples:
- AlbumCard
- RankList
- WorldCupCandidate
- TasteRelationGraph
- WinnerReveal
- RoomCodeCard

## C. Composition pattern
A documented assembly of multiple components. Keep it easy to reproduce, but do not necessarily publish one giant component.

Examples:
- Artist Picker
- Album Track Picker
- Tournament Stage
- Taste-card Detail Sheet
- Room Action Dock
- Public Taste Detail

## D. Screen-only
One-off editorial/art-direction content where extracting a component would add indirection without meaningful reuse.

Examples:
- VS lettering by itself
- page-specific explanatory copy
- offscreen export-card layout
- a single unique result sentence

---

# 2. Favorite Songs Sort — full flow

## Flow map

`Home`
→ `/explore?mode=single`
→ artist confirmation
→ `/tracks?mode=single`
→ track selection
→ `/worldcup?mode=single`
→ winner reveal
→ `/taste?mode=single`
→ save/share/export
→ `/my-taste?id=...` or My Taste Space

A saved/in-progress run can also resume from Home into Explore / Tracks / WorldCup.

---

## 2.1 Home / resume entry

### Existing product elements
- ModeCard
- continue/start-over decision
- progress restoration routing
- ProfileHeader
- language selector
- home carousel/controls

### Component decision
- **KEEP PRODUCT:** `ModeCard`
- **COMPOSITION:** `ResumePrompt` using Sheet/ConfirmSheet, not a new generic modal family
- **DS CANDIDATE:** language selector should eventually use `SegmentedControl`
- home carousel arrows should use `IconButton`

ModeCard should not be flattened into the same card family as list/content cards.

---

## 2.2 Artist selection — `/explore`

### States
- default recommendations
- active search
- search loading
- search results
- empty search
- selected artist
- confirm selected artist
- leave-with-changes confirmation
- Spotify/API error
- infinite/loading-more
- scroll-to-top

### Repeated elements
- search pill: leading Search/Loader + input + clear X
- circular artist image
- recommendation artist tile
- selectable artist result row
- selected state with point border
- loading/empty search state
- scroll-to-top icon action
- confirmation Sheet

### Candidates
- **DS:** `SearchInput`
- **PRODUCT:** `ArtistAvatar` only if artist-specific fallback/selection ring remains distinct from generic Avatar
- **PRODUCT:** `ArtistGridItem`
- **PRODUCT:** `SelectableArtistRow`
- **COMPOSITION:** `ArtistPicker` = SearchInput + recommendation grid + result rows
- **DS:** `ScrollTopButton` should be IconButton usage, not its own visual system
- **COMPOSITION:** selected-artist confirm Sheet
- **MIGRATE:** bespoke Spotify error overlay → Dialog/System

### Cross-flow reuse
`SelectableArtistRow` and the search composition are nearly the same in `/together/new`.

---

## 2.3 Track selection — `/tracks`

### States
- artist/releases loading
- default album grid
- one album expanded
- track search
- track selected/unselected
- album selected/partially selected/unselected
- unavailable album
- external API daily budget exhausted
- temporary album error
- unreleased-track registration
- data-error feedback
- leave/save confirmation
- not enough selected
- ready to start
- selection progress/loading

### Existing reusable elements
- AlbumCard
- album accordion hook
- UnreleasedDialog
- FeedbackModal
- SpotifyLink
- SectionTitle

### New candidates
- **DS:** `SearchInput`
- **DS:** `SelectionChip size=sm`
- **PRODUCT:** `SelectableTrackRow`
  - leading optional Cover
  - title/meta
  - selected/unselected action
  - disabled/unavailable state if needed
- **PRODUCT:** `AlbumSelectionHeader`
  - selected count
  - select/clear album action
- **PRODUCT:** `BulkSelectionActions`
  - select all
  - clear all
- **PRODUCT / PATTERN:** `TrackSelectionDock`
  - State=Loading
  - State=NeedMore
  - State=Ready
  - built on BottomActionDock rather than defining fixed-bottom behavior again
- **PRODUCT:** `InlineLoadProgress`
  - real task progress, not decorative time-based progress
  - can be shared with Together catalog loading
- **COMPOSITION:** `AlbumTrackPicker`
  - AlbumCard
  - AlbumSelectionHeader
  - SelectableTrackRow
  - paging/search/bulk actions

### Important
The current v1.1 `BottomActionDock/Selection` is only a foundation.  
The Favorite Songs track screen has a richer state machine and should become a product-level `TrackSelectionDock`, not add more generic Dock variants.

---

## 2.4 World Cup — `/worldcup`

The same tournament interaction is reused by Favorite Songs Sort and Sort Together.

### States
- loading
- active match
- drag active
- track dropped onto turntable
- unknown song dragged upward
- short undo state
- round transition
- exit confirmation
- guest login-to-save
- finished / winner reveal

### Current elements
- PageHeader-like shell
- match count pill
- progress bar
- round name
- drag/skip gesture hint
- two WorldCupCandidate components
- VS separator
- LPPlayer/turntable
- unknown-song undo panel
- bottom interaction instruction
- WinnerReveal
- exit Sheet

### Candidates
- **PRODUCT:** `TournamentProgress`
  - match x / total
  - progress
  - round label
- **PRODUCT:** `CandidatePair`
  - left WorldCupCandidate
  - VS separator
  - right WorldCupCandidate
- **PRODUCT:** `GestureHint`
  - idle instruction
  - drag-active instruction
  - unknown-song drag-up instruction
- **DS/PATTERN:** `UndoNotice`
  - transient feedback + Undo action
  - not a Toast because it contains an action and temporarily replaces the candidate area
- **KEEP PRODUCT:** `WorldCupCandidate`
- **KEEP PRODUCT:** `LPPlayer`
- **KEEP PRODUCT:** `WinnerReveal`
- **COMPOSITION:** `TournamentStage`
  - TournamentProgress
  - CandidatePair
  - GestureHint
  - LPPlayer
  - UndoNotice

### Do not componentize
- the literal “VS” glyph alone
- round-specific copy
- route-specific completion logic

The Favorite/Together distinction belongs to business state/routing, not a second tournament UI system.

---

## 2.5 Result — `/taste`, `/my-taste`

### States
- fresh result intro
- saved result loading
- saved result missing
- PyramidStage intro
- result template switch
- palette selection
- save menu
- share menu
- login before save
- existing-result overwrite choice
- custom save name
- first-share nickname confirmation
- multi-image export confirmation
- Instagram guidance
- unsaved-exit confirmation
- success/error feedback

### Existing product components
- PyramidStage
- TasteTemplates:
  - ListCard
  - RecordCard
  - MosaicCard
  - PosterCard
- PalettePicker
- RankList

### Candidates
- **PRODUCT:** `ResultTemplateSwitcher`
- **PRODUCT/PATTERN:** `ResultPreview`
- **PRODUCT/PATTERN:** `ResultActionDock` built on BottomActionDock
- **DS:** option actions become `ActionRow`
- **COMPOSITION:** Save Sheet
- **COMPOSITION:** Share Sheet
- **COMPOSITION:** Result naming Form Dialog
- **KEEP PRODUCT:** TasteTemplates family
- **KEEP PRODUCT:** PalettePicker

The export templates are not normal application surfaces and should not dictate ordinary card styles.

---

# 3. Sort Together — full flow

## Flow map

`/together`
→ join by code OR `/together/new`
→ source/artist selection
→ track selection
→ creator nickname
→ room created/code success
→ `/together/[code]`
→ participant nickname / re-sort guard
→ shared `/worldcup?mode=single&challenge=1`
→ `/together/[code]/result`
→ relationship detail / share / invite / account claim
→ My Taste Space

Public taste detail can also enter the creation flow:
`/taste/[id]` → `/together/new?from=<result-id>`

---

## 3.1 Together entry — `/together`

### Elements
- Back
- title + explanation
- large room-code input
- primary Join
- secondary Create
- error Toast

### Candidates
- **PRODUCT:** `CodeInput`
  - 56px
  - numeric typography
  - wide tracking
  - lower-case normalization behavior stays in code
- **COMPOSITION:** room-entry form

The code field is intentionally distinct from ordinary FormField.

---

## 3.2 Create room Step 1 — source / artist

The creator can start from:
1. catalog artist
2. a previous own sort
3. a public shared taste card via `?from=`

### Elements
- changing title/description
- SearchInput
- search result SelectableArtistRow
- weekly recommendation artist grid
- retry empty state
- “이미 한 소트에서 가져오기” rows
- bottom CTA after artist selection

### Candidates
- **SHARED PRODUCT:** ArtistGridItem
- **SHARED PRODUCT:** SelectableArtistRow
- **SHARED COMPOSITION:** ArtistPicker
- **DS/PRODUCT:** `SourcePickerRow`
  - leading Cover
  - title
  - track count/source metadata
  - trailing selected/unselected status
- **COMPOSITION:** creator step dock using BottomActionDock

SourcePickerRow may later collapse into a sufficiently flexible RecordRow if no source-specific behavior remains.

---

## 3.3 Create room Step 2 — choose tracks

### Elements
- artist/source title
- SpotifyLink
- real catalog-loading progress
- selected count
- select all / clear all
- AlbumCard grid
- AlbumPager
- album selection control
- SelectableTrackRows
- imported-list version with Cover
- add unreleased track
- data-error feedback
- optional room name
- minimum 4-track rule
- fixed create-link CTA
- creator NicknameDialog

### Reuse
This strongly overlaps Favorite Songs `/tracks`.

### Candidates
- **SHARED PRODUCT:** AlbumSelectionHeader
- **SHARED PRODUCT:** SelectableTrackRow
- **SHARED PRODUCT:** BulkSelectionActions
- **SHARED PRODUCT:** InlineLoadProgress
- **SHARED COMPOSITION:** AlbumTrackPicker
- **PRODUCT:** `RoomNameField` only if room naming gets richer; otherwise use FormField
- **COMPOSITION:** CreateRoomDock using BottomActionDock
- **MIGRATE:** NicknameDialog → Dialog/Form based `NamePromptDialog`

The selection logic differs by flow, but selection visuals should not.

---

## 3.4 Room-created success

### Elements
- completion title/description
- large room code panel
- send link
- copy link
- “나도 소트하러 가기”
- Toast

### Candidates
- **PRODUCT:** `RoomCodeCard`
  - label
  - large code
  - helper
- **COMPOSITION:** `ShareCodePanel`
  - RoomCodeCard + share/copy/start actions

This visual also belongs inside Invite Sheet in compact form; use size/density rather than create another code style.

---

## 3.5 Room / invite — `/together/[code]`

One URL serves creator and invitee.

### States
- loading
- invalid link
- creator view
- invitee hero view
- imported previous-sort notice
- zero participants
- participants present
- my existing ranking
- collapsed/expanded target tracks
- first-time nickname request
- re-sort confirmation
- action dock with 1–3 actions

### Elements
- full-bleed artist hero for invitee
- gradient into app background
- overlay back navigation
- invite title/description
- participant count
- participant name pills
- code + share text action
- my RankList preview
- target track list preview
- show all / collapse
- explicit Home link
- dynamic action dock

### Candidates
- **PRODUCT PATTERN:** `MediaHero`
  - image
  - semantic app-bg gradient
  - overlay navigation
  - bottom content slot
  - reusable by Together invite and Together result
- **PRODUCT:** `ParticipantChip`
- **PRODUCT:** `ParticipantSummary`
- **PRODUCT/PATTERN:** `CollapsibleRankList`
- **PRODUCT/PATTERN:** `CollapsibleTrackList`
- **COMPOSITION:** RoomActionDock using BottomActionDock
- **COMPOSITION:** NamePromptDialog
- **COMPOSITION:** re-sort ConfirmSheet
- **DS:** invalid-link screen should use common EmptyState / ErrorState treatment

---

## 3.6 Shared World Cup

Sort Together deliberately reuses the same `/worldcup`.

Therefore these must be **one component system**, not Together variants:
- TournamentProgress
- CandidatePair
- WorldCupCandidate
- GestureHint
- UndoNotice
- LPPlayer
- WinnerReveal

Only persistence/routing differs.

---

## 3.7 Together result — `/together/[code]/result`

### States
- loading
- invalid room
- viewer has not sorted yet
- only me has finished
- comparable participants exist
- selected participant changes
- 11+ participants → +N and ParticipantSheet
- logged-in result owned by account
- guest exit → account-save guidance
- share Sheet
- invite Sheet

### Hero / summary
Current page shows:
- artist / track count
- “같이 소트한 결과”
- group match percentage
- “종합 일치율”
- participant count
- persistent “내 계정에 저장됐어요” status
- link to My Taste Space
- optional artist image with gradient
- custom 40px close action

### Relationship area
- TasteRelationGraph
- GraphLegend
- node selection
- +N ParticipantSheet
- selected pair → TogetherPairDetail

### Pair detail
- pair heading + match %
- shared TOP-K songs
- biggest ranking gap
- full side-by-side ranking comparison
- “모르는 곡” / “기록 없음” stances
- expand/collapse

### Candidates
- **PRODUCT PATTERN:** MediaHero, shared with invite page
- **PRODUCT:** `MatchMetric`
  - numeric percentage + semantic label
  - can also inform Taste Mate rows, but do not force every percentage into this component
- **PRODUCT:** `PersistentSaveStatus`
- **KEEP PRODUCT:** TasteRelationGraph
- **KEEP PRODUCT:** ParticipantSheet
- **KEEP PRODUCT:** TogetherPairDetail
- **PRODUCT:** `PairComparisonRow` if PairDetail continues to grow
- **PRODUCT:** `TrackStance` is useful inside comparison surfaces but should remain private to comparison components
- **COMPOSITION:** ResultShareSheet
- **COMPOSITION:** InviteCodeSheet
- **COMPOSITION:** GuestClaimSheet
- **KEEP EXPORT-SPECIFIC:** TogetherResultShareCard

### Important
TasteRelationGraph is a visualization, not a generic design-system chart component.  
Its node size/accessibility and selected-state rules belong to the product component itself.

---

# 4. My Taste Space — detailed flow

Route: `/explore-taste`

Tabs:
- My records
- Listen Later
- Taste Mates

## 4.1 Guest / loading
- PageHeader
- loading state
- EmptyState with Login + public archive link

No new product component required.

## 4.2 My records
A single date-sorted list contains:
- individual taste results
- Sort Together rooms

### Taste result row
- Cover 56
- title
- #1 track + artist
- date + mode
- visibility Switch + label

### Together room row
- Cover 56
- room title
- track count + participant count + creator marker
- date + “같이 소트하기”
- opens Together result directly

### Candidates
- **DS:** `RecordRow`
  - leading media slot
  - title
  - supporting text
  - metadata
  - trailing slot
  - density
- **COMPOSITION:** `TasteResultRow` = RecordRow + VisibilityControl
- **COMPOSITION:** `TogetherRoomRow` = RecordRow
- **DS/PATTERN:** `VisibilityControl` = Switch + visible label, probably composition rather than a new primitive

Do not create two unrelated card systems. The product itself already treats both as “my sort records”.

## 4.3 Taste-result detail Sheet
- date + mode
- title
- RankList
- load/share CTA
- visibility
- delete
- delete ConfirmSheet

### Decision
- **COMPOSITION:** TasteRecordDetailSheet
- based on generic Sheet + RankList + controls
- no need for a new shell

## 4.4 Listen Later
- Cover 48
- title
- artist
- unreleased marker
- remove icon button

### Decision
- **COMPOSITION:** ListenLaterRow using RecordRow + IconButton
- do not make a separate card family

## 4.5 Taste Mates

### Base selector
- bottom-border native `select`
- selected result preview
- explanatory caption

### Same winner/song & same artist
- horizontal avatar strip
- Avatar 56
- nickname
- date

### High-sync list
- Avatar 44
- nickname
- #1 song/artist
- sync % trailing

### Mate detail Sheet
- Avatar
- nickname
- date + sync %
- RankList

### Candidates
- **DS:** `SelectField`
- **PRODUCT:** `PersonAvatarItem` / `MateAvatarItem`
- **DS/PRODUCT:** high-sync row can use RecordRow with numeric trailing slot
- **COMPOSITION:** MateDetailSheet
- **PRODUCT:** MatchMetric may be reused for prominently displayed percentages, but not required for list-row trailing numbers

---

# 5. Our Taste Archive — detailed flow

Route: `/archive`

Two primary tabs:
- public Taste Cards
- Unreleased

---

## 5.1 Public taste cards

### Row
- winner Cover 56
- title
- #1 track + artist
- creator mini Avatar 16
- nickname + date + mode
- opens `/taste/[id]`

### Candidate
- **DS:** RecordRow
- **COMPOSITION:** PublicTasteRow

The anatomy overlaps strongly with My Taste Space rows.

---

## 5.2 Public taste detail — `/taste/[id]`

### States
- loading
- missing/private
- ready

### Ready screen
- PageHeader
- date + mode
- result title
- creator Avatar/name
- winner LP/sleeve hero
- winner title/artist
- RankList
- bottom actions:
  - make my own taste card
  - sort these songs together
  - browse archive

### Candidates
- **PRODUCT:** `WinnerFeature`
  - LP/sleeve visual + winner metadata
  - can be shared with result/read-only surfaces if visual language remains consistent
- **COMPOSITION:** PublicTasteDetail
- **COMPOSITION:** PublicTasteActionDock using BottomActionDock
- RankList remains shared

This route is also an important cross-flow bridge:
`Public Taste Detail → Sort Together New (?from=result-id)`.

---

## 5.3 Unreleased archive

### States
- unreleased / released history toggle
- search
- empty result
- track collapsed
- YouTube expanded
- lyrics expanded
- plain/fanchant lyrics
- release-report confirmation
- lyrics contribution
- add unreleased track
- login required

### Track row
- YouTube thumbnail
- title
- artist
- performance date
- text actions:
  - listen / close
  - lyrics / collapse
  - report release
- expandable embedded player
- expandable lyrics area

### Candidates
- **PRODUCT:** `UnreleasedTrackItem`
  - collapsed / media-expanded / lyrics-expanded
  - media and lyrics are content states, not generic Accordion variants
- **DS:** compact text-tab / SegmentedControl family for:
  - unreleased / released
  - plain lyrics / fanchant
- **PRODUCT:** `LyricsPanel`
- **COMPOSITION:** LyricsContributionSheet
- **COMPOSITION:** UnreleasedTrackRequestSheet
- **DS:** forms inside those Sheets should later use FormField / Textarea / Checkbox
- **DS/PRODUCT:** artist search results should reuse compact SelectableArtistRow where possible
- **COMPOSITION:** release Report ConfirmSheet

The YouTube player itself should not become a global design-system component unless another product area begins embedding media.

---

# 6. Component overlap map

## Already present and should remain shared
- Button hierarchy
- Chip
- Switch
- UnderlineTabs
- SectionTitle
- EmptyState
- Cover
- Avatar
- RankList
- AlbumCard
- AlbumPager
- WorldCupCandidate
- LPPlayer
- WinnerReveal
- PalettePicker
- TasteRelationGraph
- ParticipantSheet
- TogetherPairDetail

## Phase 1 candidates already designed
- IconButton
- PageHeader
- Dialog
- Toast
- BottomActionDock
- Sheet

## Highest-value next design-system components
1. **SearchInput**
2. **FormField / Textarea / SelectField**
3. **RecordRow**
4. **SelectionChip / SegmentedControl**
5. **ActionRow**

## Highest-value next Sortify product components
1. **SelectableArtistRow**
2. **ArtistGridItem**
3. **SelectableTrackRow**
4. **AlbumSelectionHeader**
5. **TournamentProgress**
6. **GestureHint**
7. **UndoNotice**
8. **CodeInput**
9. **RoomCodeCard**
10. **ParticipantChip**
11. **MediaHero**
12. **WinnerFeature**
13. **UnreleasedTrackItem**

## Highest-value composition patterns
1. ArtistPicker
2. AlbumTrackPicker
3. TrackSelectionDock
4. TournamentStage
5. ResultActionDock
6. TasteRecordDetailSheet
7. RoomActionDock
8. ShareCodePanel
9. PublicTasteActionDock
10. LyricsContributionSheet

---

# 7. Shared anatomy that should drive v1.1

## A. Picking
The Favorite and Together creation flows both repeatedly need:

`SearchInput → Artist option → Track source → Album → Track selection → Bottom CTA`

Do not maintain separate visual systems for “혼자 소트할 곡” and “같이 소트할 곡”.

## B. Ranking
The same ranking anatomy appears in:
- Favorite result
- saved taste detail
- public taste detail
- Together invite “내가 매긴 순위”
- Together result
- Taste Mate detail

`RankList` is therefore a core product primitive.  
Expansion, comparison and metadata should wrap it rather than fork its row style.

## C. Records
The same record-row anatomy appears in:
- My taste result
- My together room
- public taste archive
- high-sync mate
- Listen Later

This strongly supports a shared `RecordRow` foundation with slots rather than more page-specific row CSS.

## D. Media hero
Together invite and Together result both use:
- full-bleed artist/cover image
- app-background gradient fade
- overlay navigation
- content anchored near the faded lower region

This is enough evidence for a product-level `MediaHero` pattern.

## E. Bottom decisions
The following are the same structural family:
- artist selected → choose songs
- track selection → start World Cup
- create Together link
- room invite actions
- Together result share/invite
- public taste detail actions
- result save/share actions

Use one `BottomActionDock` shell and product compositions inside it.

---

# 8. Do NOT over-componentize

Keep these local unless a second meaningful use appears:
- literal “VS” separator
- individual explanatory sentences
- exact graph edge legend wording
- biggest-gap prose
- one-off imported-sort notice
- result export-card dimensions
- YouTube iframe wrapper, for now
- a separate component for each CTA copy combination

Do not create components named after screens such as:
- `ExploreHeader`
- `TogetherResultButton`
- `ArchiveTasteRowCard`

Prefer role/object names:
- PageHeader
- RecordRow
- SelectableArtistRow
- RoomCodeCard
- TournamentProgress

---

# 9. Proposed design-system structure after this audit

## Foundations
- Color
- Typography
- Spacing
- Radius
- Size
- Elevation
- Layer
- Motion

## Core UI
- Button
- IconButton
- ActionRow
- SearchInput
- FormField
- Textarea
- SelectField
- CodeInput
- Chip
- SelectionChip
- SegmentedControl
- Switch
- UnderlineTabs

## Navigation / feedback
- PageHeader
- Toast
- Dialog
- Sheet
- BottomActionDock
- EmptyState

## Content primitives
- Cover
- Avatar
- RecordRow
- SectionTitle

## Music / selection
- ArtistGridItem
- SelectableArtistRow
- AlbumCard
- AlbumPager
- AlbumSelectionHeader
- SelectableTrackRow
- RankList

## Tournament
- TournamentProgress
- WorldCupCandidate
- GestureHint
- UndoNotice
- LPPlayer
- WinnerReveal

## Together
- RoomCodeCard
- ParticipantChip
- MediaHero
- TasteRelationGraph
- ParticipantSheet
- TogetherPairDetail
- TogetherResultShareCard

## Archive / editorial
- WinnerFeature
- UnreleasedTrackItem
- LyricsPanel
- TasteTemplates

---

# 10. Recommended next design work before production migration

Do **not** migrate Phase 1 to code yet.

First design and validate the next cross-flow layer in Figma:

### Wave A — Picking foundation
- SearchInput
- SelectableArtistRow
- ArtistGridItem
- SelectableTrackRow
- SelectionChip
- AlbumSelectionHeader

Validate these simultaneously against:
- Favorite `/explore`
- Favorite `/tracks`
- Together/new Step 1
- Together/new Step 2

### Wave B — Tournament product system
- TournamentProgress
- GestureHint
- UndoNotice
- CandidatePair composition
- document existing WorldCupCandidate / LPPlayer / WinnerReveal

Validate against both Favorite and Together.

### Wave C — Records & archive
- RecordRow
- SelectField
- ActionRow
- WinnerFeature
- UnreleasedTrackItem

Validate against My Taste Space, public Archive and public Taste Detail.

### Wave D — Together-specific
- CodeInput
- RoomCodeCard
- ParticipantChip
- MediaHero
- document RelationGraph / PairDetail rules

Only after Waves A–D are resolved should production component migration begin.


# 11. Wave progress

- **Wave A — Picking: Figma candidate validated.** See [wave-a-picking.md](./wave-a-picking.md). Production migration remains not started.
- **Wave B — Tournament: Figma candidate validated.** See [wave-b-tournament.md](./wave-b-tournament.md).
- **Wave C — Records & Archive: Figma candidate validated.** See [wave-c-records-archive.md](./wave-c-records-archive.md).
- **Wave D — Together domain: Figma candidate validated.** See [wave-d-together-domain.md](./wave-d-together-domain.md).


# 12. Migration readiness

Design Waves A–D are validated, but production migration is **not yet cleared to start**.

Repository status checked on 2026-09-26:
- current `develop`: `741949a5476bf91ec937b18d0a7d136b95b36617`
- `fix/together-result-consistency` is currently **8 commits ahead / 4 commits behind** develop
- common merge base: `cca50a183a70a9d034ec1d8cd704a6aea3f43172`

The design system is therefore:

- **DESIGN READY**
- **CODE BASELINE NOT YET LOCKED**

Before implementation, reconcile the Together branch with develop and run the intended combined regression suite. Do not migrate the design system independently onto both divergent branches.

See [migration-readiness.md](./migration-readiness.md) for:
- migration gates
- batch order
- code mapping
- regression requirements
- Tournament behavior guardrails
- first pilot PR recommendation


## Code migration structure

For the concrete **before → after code architecture, folder structure, route-by-route replacements, and Mermaid dependency diagrams**, see:

- [Code Migration Impact / Structure Map](./code-migration-impact.md)
