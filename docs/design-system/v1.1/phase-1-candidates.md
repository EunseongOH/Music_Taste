# Sortify Design System v1.1 — Phase 1 Candidate Components

> Design candidate recorded on 2026-09-26.  
> Source audit baseline: `develop@cca50a183a70a9d034ec1d8cd704a6aea3f43172`  
> Figma: https://www.figma.com/design/DYEYRL3PG29Xb4RJOyNXe8

This document records the **candidate design direction** before production migration.
No production UI code is changed by this phase.

## Design direction

The Phase 1 candidates use Toss/TDS-style reusable structural patterns and KRDS accessibility/predictability principles, while preserving Sortify's sky-tinted surface, music imagery, and restrained brand/point accents.

The goal is not to make Sortify look like a finance or government product.
The goal is to make navigation, overlays, feedback, and bottom actions behave as one coherent product.

## Foundation additions

### Size
- `size/touch-min` — 44px
- `size/control` — 48px
- `size/header-content` — 56px
- `size/action-max` — 382px
- `size/sheet-max` — 430px

### Elevation
- `Elevation/Overlay/Dialog`
- `Elevation/Floating/Soft`
- `Elevation/Dock/Top`

### Typography
All v1.1 candidates bind to the existing `Typography/UI/*` local text styles rather than setting their own font families.

The intended UI family is Pretendard. The connected Figma API currently cannot load Pretendard even though the existing Display style already stores `Pretendard Variable / ExtraBold`, so font migration remains centralized at the Text Style layer.

---

## 1. IconButton / v1.1

Figma page: `10 IconButton v1.1`

Axes:
- Style: Plain / Surface / Outline / Overlay
- State: Default / Hover / Pressed / Disabled
- 16 variants

Rules:
- every variant is 44×44px
- nested icon is 20×20px
- Back, Close, Exit, and media-overlay controls share this interaction primitive
- icon name is not a visual style axis
- page navigation uses Back semantics; modal dismissal uses Close semantics

### Replaces
- BackButton 32px / 36px overrides
- Result exit 40px custom button
- Together result custom overlay close
- small page-local icon actions where the same interaction role is intended

---

## 2. PageHeader / v1.1

Figma page: `11 PageHeader v1.1`

Axes:
- Style: Standard / Sticky / HeroOverlay
- Trailing: False / True
- 6 variants

Rules:
- content height 56px
- leading action uses the 44px IconButton rhythm
- ordinary screen title uses `Typography/UI/Title 1`
- safe-area belongs outside the 56px content block
- HeroOverlay exists for artwork/photo headers instead of introducing another custom navigation button

### Replaces
Repeated header shells in:
- Explore
- Tracks
- WorldCup
- ResultScreen
- My Taste Space
- Archive
- Shared Taste / Together hero navigation

---

## 3. Dialog / v1.1

Figma page: `12 Dialog v1.1`

Axes:
- Type: System / Form / Instruction
- 3 variants

Shared shell:
- width 360px
- 24px content padding
- 28px radius
- 1px semantic line
- soft dialog elevation
- 44px explicit Close control

Use:
- **System** — service interruption or a decision that must stop the current flow
- **Form** — short keyboard input
- **Instruction** — short read-and-follow guidance

Do not use Dialog for a long multi-step workflow.

Field validation belongs next to the field, not as a modal-level generic error.

### Visual reference
FeedbackModal / NicknameDialog are closer to this candidate than the older LoginModal and Result overwrite/Instagram dialogs.

### Replaces
- old 3px-border Login/Result dialog shells
- Explore Spotify-error bespoke shell
- separate Feedback / Unreleased / Nickname structural implementations

---

## 4. Toast / v1.1

Figma page: `13 Toast v1.1`

Axes:
- Tone: Info / Success / Error
- 3 variants

Rules:
- bottom-center
- one short sentence
- Info / Success: approximately 2–3 seconds
- Error: approximately 3–4 seconds
- non-blocking
- field validation stays inline
- implementation uses `role="status"` and `aria-live="polite"`

### Replaces
- Tracks top notification
- ResultScreen top cream/bordered toast
- current top-positioned SpaceUI.Toast placement

---

## 5. BottomActionDock / v1.1

Figma page: `14 BottomActionDock v1.1`

Axes:
- Style: Gradient / Surface / Selection
- 3 variants

Rules:
- Dock owns horizontal padding and platform safe-area behavior
- inner actions reuse Button hierarchy
- action content width follows the shared mobile action rhythm
- route components provide actions/status, not fixed-bottom CSS recipes

### Important implementation note
The Figma Gradient variant shows the current theme as a visual specimen.
Production **must derive the fade from semantic `--app-bg`** and must not copy Figma's current RGB gradient stops.

### Replaces
Repeated local fixed-bottom shells in:
- Shared Taste
- Together invite/result
- ResultScreen
- Tracks selection flow
- other selection/progress docks

This reduces the Apps-in-Toss safe-area dependency from arbitrary route class strings to one shared component boundary.

---

## 6. Sheet / v1.1

Figma page: `15 Sheet v1.1`

Axes:
- Type: Confirm / Options / Detail
- 3 variants

Shared shell:
- width 390px in the design specimen
- top radius 28px
- semantic 1px top boundary
- explicit 44px Close control
- 24px side/bottom spacing

Use:
- **Confirm** — short decision after a user action
- **Options** — short action list such as save/share/export
- **Detail** — contextual information that may scroll in the body

Rules:
- keep current-screen context visible
- never stack a second Sheet on top of a Sheet
- Option rows are rows, not 52px independent bordered mini-cards
- destructive action retains the Danger hierarchy

### Replaces
ResultScreen's legacy save/share sheet:
- `rounded-t-[2.5rem]`
- 3px top/x border
- custom option mini-cards
- bespoke close/cancel treatment

---

## Before → Standardized evidence

Figma page: `20 Before → Standardized`

The comparison page contains six side-by-side groups based on actual implementation differences found in the v1.0 audit:

1. IconButton — 28/32/36/40px local controls → one 44px interaction primitive
2. PageHeader — repeated screen-local headers → shared 56px header shell
3. Dialog — heavy legacy border/radius → semantic line + soft elevation
4. Toast — several top feedback systems → one bottom-center system
5. BottomActionDock — route-owned fixed/safe-area layouts → dock-owned platform behavior
6. Sheet — legacy Result option cards/shell → common Sheet + option rows

---

## Migration order for production

### 1. Shared primitives first
- IconButton
- PageHeader
- Dialog
- Toast
- BottomActionDock
- Sheet

### 2. Replace screen-local shells
Start with the clearest mixed-generation screen:
- `ResultScreen.tsx`

Then:
- Tracks / Explore
- Together routes
- Shared Taste
- Login / Feedback / Unreleased / Nickname / Profile overlays

### 3. Keep business logic unchanged
This migration should change component ownership and presentation only.
Auth, save/share behavior, sorting state, routing, and database behavior are out of scope.

## QA acceptance

A Phase 1 component is ready for code migration when:
- icon-only hit target is at least 44×44px
- typography uses a shared Text Style / `type-*` role
- surface colors use semantic tokens
- screen code does not define its own overlay radius/border/elevation
- explicit close/back semantics are present
- bottom safe-area ownership is centralized
- Web and Apps-in-Toss use the same component API, with platform-only behavior isolated inside the shared component
