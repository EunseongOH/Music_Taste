# Sortify Design System v1.0 — UI Consistency Audit

> Baseline: `develop@cca50a183a70a9d034ec1d8cd704a6aea3f43172`  
> Audit date: 2026-09-26  
> Scope: current user-facing web + Apps-in-Toss routes and the dialogs/sheets they open. Production code is not changed by this audit.

## 1. Coverage

### Active user-facing routes
- `/` — Home
- `/explore` — artist selection
- `/tracks` — track selection
- `/worldcup` — sorting
- `/taste` — fresh result (`ResultScreen mode="fresh"`)
- `/my-taste` — saved result (`ResultScreen mode="saved"`)
- `/explore-taste` — My Taste Space
- `/archive` — taste archive / unreleased
- `/shared` / `/taste/[id]` — shared taste result
- `/together`
- `/together/new`
- `/together/[code]`
- `/together/[code]/result`

### Shared overlays/components reviewed
- `BackButton`
- `ProfileHeader` / `ProfileModal`
- `LoginModal`
- `FeedbackModal`
- `UnreleasedDialog`
- `DeleteAccountSheet`
- `NicknameDialog`
- `ParticipantSheet`
- `SpaceUI` primitives
- result save/share/overwrite/Instagram overlays

### Dormant / special
- `/genres`: currently hidden from the Toss route table. Keep in audit as dormant legacy, not a v1.1 migration blocker.
- `TasteTemplates`: export artwork with fixed pixel typography. Treat as an export surface, not ordinary app UI.
- social provider buttons and Spotify brand assets: external brand rules override Sortify styling where required.

---

## 2. Executive finding

The product already has a useful shared core in `SpaceUI.tsx`:
`primaryButton`, `secondaryButton`, `dangerButton`, `Input`, `Chip`, `UnderlineTabs`, `Sheet`, `ConfirmSheet`, `Toast`, `EmptyState`, `Cover`, `Avatar`, `Switch`, and `RankList`.

The consistency problem is not that there is no system. It is that **newer shared primitives and older screen-local implementations coexist**.

The largest gaps are:
1. no shared `Dialog` shell,
2. no shared `PageHeader`,
3. no shared `SearchInput`,
4. no actual shared bottom action dock container,
5. icon-only navigation controls do not share one size/hit-target rule,
6. inputs/forms still have several parallel visual families,
7. Toast exists but two major screens still use custom Toasts,
8. compact selection controls are being rebuilt locally,
9. list/action rows repeat without a shared anatomy.

---

## 3. Findings by component role

### DS-A01 — PageHeader is visually repeated but not componentized
**Status:** clear duplicate → merge candidate

A very similar top bar is repeated in Tracks, WorldCup, ResultScreen, My Taste Space, and Archive:
- cream/95 + backdrop blur
- bottom border
- left BackButton + `type-title-1`
- optional ProfileHeader on the right

Differences now:
- Explore uses its own sticky header and a hard-coded `text-[1.4rem]` title rather than `type-title-1`.
- Together screens use a standalone BackButton with no header shell.
- shared taste result creates its own 32×32 back button instead of BackButton.
- Together result uses a close X over the hero instead of the same navigation primitive.

**v1.1 target:** `PageHeader`
- mode: `standard | sticky | heroOverlay`
- leading: `back | close | none`
- trailing: profile/custom
- title + optional subtitle
- keep hero overlay as a real variant instead of a separate component.

---

### DS-A02 — Back / Close / Icon buttons are the same role but 5+ visual sizes
**Status:** clear duplicate + accessibility issue

Observed:
- `BackButton` default: 40×40, bordered cream surface.
- common page-header override: 32×32, transparent, no border.
- Explore / Together: 36×36 overrides.
- shared taste: custom 32×32 button.
- Sheet close: 36×36.
- Feedback / Unreleased close: roughly 36×36 via p-2 + 20px icon.
- Result exit: 40×40 with border.
- Together-result close: 40×40 translucent surface.
- Home carousel arrows: 28×28.
- Palette trigger: 40×40; palette swatches: 36×36.

The current component documentation says icon-only actions should have a minimum 44×44 tap target, but several production controls and even the v1.0 Figma Back component are smaller.

**v1.1 target:** `IconButton`
- hit target: 44×44 minimum
- visual size may be smaller inside the 44px target
- variants: `plain | surface | outline | overlay`
- icons: 20px default
- BackButton becomes a semantic wrapper around IconButton, not its own styling island.

---

### DS-A03 — SearchInput has 4 implementations
**Status:** clear duplicate → merge candidate

1. Explore and Tracks are almost identical:
   - white/50
   - border-2 navy/10
   - rounded-full
   - search icon 18
   - clear X
   - point focus
   - shadow-inner
2. Together/new uses the same pattern but omits shadow-inner and uses `type-body`.
3. Archive uses an underlined 44px search row with transparent input.
4. Search clear buttons vary in color behavior and right offset.

**v1.1 target:** `SearchInput`
- variant `pill` = default selection-flow search
- optional `inline` variant for dense archive filter, only if the visual distinction is intentionally retained
- built-in leading search/loading icon and clear action
- one focus, placeholder, icon-size and clear-button rule.

---

### DS-A04 — General Input / FormField has at least 5 visual families
**Status:** clear duplicate → merge candidate

Current shared `SpaceUI.Input`:
- 48px
- rounded-2xl
- cream
- border navy/15
- point-ink focus outline
- helper/error slot

Parallel implementations:
- ProfileModal + Archive add-track: 48px, white, rounded-xl, navy focus.
- FeedbackModal + UnreleasedDialog + NicknameDialog: white/60, rounded-xl, border navy/10, point focus.
- ResultScreen save/share naming: rounded-xl, custom padding/weight; one is text-xs and another bold text-sm.
- LoginModal: border-2, white/50, rounded-xl, icon-leading inputs, separate error colors.
- Together room code: 56px numeric code field; this is a legitimate special field.

**v1.1 target:** `FormField`
- `Input` base: default/error/disabled/helper
- leading/trailing icon slots
- `Textarea`
- `CodeInput` as explicit special variant
- migrate profile, archive, feedback, unreleased, nickname and result naming to the same field anatomy.
- Login can keep provider-specific buttons, but email/password fields should use FormField.

---

### DS-A05 — Central Dialog already has an accidental shared shell, but no component
**Status:** strongest extraction candidate

FeedbackModal, UnreleasedDialog and NicknameDialog already independently converge on:
- fixed centered layout
- navy/40 backdrop + blur
- max-w-sm
- cream surface
- rounded-[2rem]
- border navy/10
- shadow-2xl
- 24px padding / header structure

Outliers:
- LoginModal still has border-[3px] and older heavy styling.
- Explore Spotify-error dialog uses black/45 backdrop and border-2.
- Result overwrite + Instagram guide use old rounded-[2.5rem] / border-[3px] shells.
- ProfileModal uses rounded-[1.75rem] with a separate shell and extreme z-index.

**v1.1 target:** `Dialog`
- common backdrop / surface / close / motion / layer
- variants: `form | system | profile`
- content determines height; shell does not fork.
- FeedbackModal should be the visual reference because it is already closest to the current system.

---

### DS-A06 — ResultScreen contains old Sheet implementations beside the new shared Sheet
**Status:** direct inconsistency

ResultScreen already imports shared primitives, but save/share option sheets still use:
- rounded-t-[2.5rem]
- 3px top/x border
- max-w-lg
- bespoke drag handle
- bespoke option buttons
- shadow-2xl

The same screen also uses shared `Sheet` for newer flows.

**v1.1 target:** migrate result save/share sheets to `SpaceUI.Sheet`.
Option items should become `ActionRow` rather than 52px mini-cards.

This is the clearest example of two design-system generations coexisting in one screen.

---

### DS-A07 — Toast exists, but three Toast systems are visible
**Status:** clear duplicate → merge candidate

- `SpaceUI.Toast`: documented standard, bottom-center, info/error.
- Tracks: custom top notification, ink surface.
- ResultScreen: custom top notification, old cream/2px-border surface with separate success/error icon bubbles.

**v1.1 target:** one `Toast`
- tone: `info | success | error`
- one placement rule (current docs specify bottom-center)
- system-safe top offset only if a real platform requirement is documented.

---

### DS-A08 — Bottom action dock layout is repeated across routes
**Status:** missing shared container

Repeated shell in Shared Taste and Together routes:
- fixed bottom-0
- left/right 0
- px-6 / pb-6 / pt-10
- gradient from app background
- max-w ~382
- vertical action stack
- DockSpacer needed above it

ResultScreen and Tracks implement related but different shells.
Explore and dormant Genres have a full-width selection/progress surface.

`BottomDock.tsx` currently only supplies clearance measurement/spacer; it is not the dock surface itself.

**v1.1 target:** extend `BottomDock` into a real component:
- `BottomActionDock variant="gradient"`
- `variant="surface"`
- `variant="selection"`
- safe-area handling owned by the component
- standard inner max width (choose 380 or 382 once).

This also removes brittle dependence on matching Tailwind class strings in `toss.css`.

---

### DS-A09 — Selection Chips are rebuilt locally
**Status:** variant missing

Shared `Chip`:
- min 36px
- selected = brand / cream
- default = navy/5 / navy70

Local versions:
- Together/new album/track selection: 32px high, type-caption, selected brand.
- DeleteAccount reason: min 36px but selected navy rather than brand.
- album select/clear controls use outline mini-buttons.
- Home language control is a micro segmented selector.

**v1.1 target:**
- `Chip size="md|sm"`
- consistent selected semantic color
- separate `SegmentedControl` for language / mutually exclusive inline switches.
- do not force action buttons into Chip just because they are small.

---

### DS-A10 — SelectableArtistRow is duplicated between Explore and Together/new
**Status:** clear duplicate → merge candidate

Both use:
- full-width row
- 56px circular artist image
- p-3 / p-3.5
- rounded-2xl
- white/50 default
- border-2 navy/5
- selected = point/10 + point border

Explore additionally has the “similar artist” dashed state and slightly stronger typography/shadow.

**v1.1 target:** `SelectableArtistRow`
- states: default / selected / related
- same avatar, typography and trailing check anatomy.

---

### DS-A11 — ListRow anatomy repeats without a shared primitive
**Status:** repeated pattern → medium-value extraction

Archive, My Taste Space, Together participant/detail lists repeatedly use:
- full width clickable row
- Cover or Avatar leading
- text stack: Body Strong + Sub/Caption
- optional trailing number/action
- divider provided by list parent

Padding currently ranges py-2.5 / py-3 / py-4.

**v1.1 target:** `ListRow`
- leading media slot
- title / subtitle / meta
- trailing slot
- density `compact | default`.

---

### DS-A12 — Typography tokens are adopted unevenly
**Status:** token migration

Good:
- Tracks, WorldCup, Result, Archive, My Taste Space, Together mostly use `type-*`.

Stragglers:
- Explore screen title = `text-[1.4rem]`.
- Explore loading title = `text-2xl`.
- UnreleasedDialog title = `text-xl`.
- LoginModal has many `text-lg`, `text-sm`, `text-xs` local rules.
- ModeCard uses hard-coded 22/13/12/11px values even though most map directly to the type ramp.
- dormant Genres remains mostly pre-token.
- WorldCupCandidate contains small local display text.
- SnakePathTimeline and TasteTemplates use many fixed sizes, but they are visualization/export surfaces and may remain explicit exceptions.

**v1.1 target:** ordinary app UI must reference Local Text Style / `type-*`; explicit pixel typography requires an exception note.

---

### DS-A13 — Layer / z-index values are not tokenized
**Status:** infrastructure consistency gap

Observed overlay layers include:
- z-40 / z-50
- z-[100]
- z-[999]
- z-[1000]
- z-[1010]
- z-[1100]
- z-[9999]
- z-[10000]

The ProfileModal/DeleteAccountSheet interaction already needed special logic because layer values competed.

**v1.1 target:** semantic layers:
- header
- dock
- backdrop
- sheet/dialog
- toast
- critical overlay

Components should own the layer instead of screens choosing raw z-index.

---

## 4. Valid differences that should NOT be flattened blindly

These should be documented as intentional variants or exceptions rather than “made identical”:

- **Home ModeCard** — primary navigation/art direction, not a generic content card.
- **AlbumCard** — album disclosure component already centralized.
- **TasteTemplates** — exported image layout with fixed scale.
- **Together result hero** — hero image needs an overlay navigation variant.
- **CodeInput** — room code needs larger numeric typography and tracking.
- **Social login buttons** — Google/Kakao brand treatments.
- **SpotifyLink** — official Spotify asset/treatment.
- **PalettePicker** — color-selection control; may share IconButton hit-target rules but is not a normal Chip.
- **selection/progress docks** — can remain distinct variants of one dock foundation.

---

## 5. Suggested v1.1 component map

### Foundations
- Color semantic roles
- Typography Local Text Styles
- Spacing
- Radius
- **Layer**
- **Motion**
- **Control size / hit target**

### Navigation
- **PageHeader**
- **IconButton**
- BackButton wrapper
- Profile trigger

### Actions
- Button
- **ActionRow**
- textLink

### Inputs & selection
- FormField / Input
- **Textarea**
- **SearchInput**
- **CodeInput**
- Chip
- **SegmentedControl**
- Switch
- UnderlineTabs

### Content
- Cover / Avatar
- **ListRow**
- **SelectableArtistRow**
- AlbumCard
- EmptyState
- RankList

### Overlay & feedback
- Sheet
- ConfirmSheet
- **Dialog**
- Toast

### Layout
- **BottomActionDock**
- DockSpacer

---

## 6. Migration sequence

### Phase 1 — shell-level consistency
No business-logic changes.
- Dialog
- IconButton + 44px hit target
- PageHeader
- Toast
- BottomActionDock
- migrate ResultScreen legacy sheets

### Phase 2 — forms & search
- SearchInput
- FormField + Textarea
- migrate Login / Feedback / Unreleased / Nickname / Profile / Archive / Result naming

### Phase 3 — repeated content controls
- Chip size variants
- SegmentedControl
- SelectableArtistRow
- ListRow
- ActionRow

### Phase 4 — typography + cleanup
- replace hard-coded ordinary UI type with `type-*`
- document visualization/export exceptions
- remove dormant legacy visual branches only after feature decisions, not as part of component migration

---

## 7. Definition of “consistent” for the next pass

A role is considered standardized when:
1. its visual shell is owned by one shared component or token,
2. screens provide content/state, not raw border/radius/color recipes,
3. platform differences are exposed as named variants rather than local class overrides,
4. icon-only actions meet the hit-target rule,
5. the same state uses the same semantic color,
6. the component has one Figma counterpart with matching variant names,
7. Web and Toss use the same source component; Toss CSS only handles platform safe-area behavior.

