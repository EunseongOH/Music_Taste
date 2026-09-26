# Sortify Design System v1.1 — Wave A: Picking System

> Status: **Figma candidate validated / production migration not started**  
> Date: 2026-09-26  
> Figma: https://www.figma.com/design/DYEYRL3PG29Xb4RJOyNXe8  
> Component page: `30 Picking v1.1`  
> Validation page: `31 Picking Validation`

Wave A standardizes the selection experience shared by:

- Favorite Songs Sort `/explore`
- Favorite Songs Sort `/tracks`
- Sort Together creation Step 1
- Sort Together creation Step 2

The objective is not to make those flows visually identical in content.  
The objective is for **search, artist selection, and track selection to mean the same thing everywhere**.

---

## 1. Foundation change

One additional size token was necessary:

- `size/control-compact = 32px`
- Web syntax: `var(--control-compact-h)`

This is a **visual pill size**, not permission to create a 32px interactive target.

Interactive target rule remains:

- icon-only / independent action: minimum 44×44px
- compact Chip inside a selectable row: the **row** owns the interaction target
- compact action in AlbumSelectionHeader: a **44px wrapper** owns the interaction target

No new color, spacing, radius, or shadow system was added.

---

## 2. Chip / v1.1 extension

Existing Chip was extended rather than creating a parallel `SelectionChip`.

Axes:

- Size: `Regular | Compact`
- Selected: `False | True`

Current variants:

- Regular / False — 36px
- Regular / True — 36px
- Compact / False — 32px visual
- Compact / True — 32px visual

Compact copy:

- unselected: `선택`
- selected: `선택됨`

Selected state uses semantic `brand`, not `point`.

### Accessibility rule

Compact Chip itself must not become a standalone 32px tap target.

- `SelectableTrackRow`: entire row is interactive
- other future uses: provide a 44px interaction wrapper

---

## 3. SearchInput / v1.1

Figma variants: 5

- Default
- Filled
- Focus
- Loading
- Disabled

Specification:

- height: 44px
- pill radius
- neutral `fill` surface
- 1px semantic `line`
- focus boundary: `brand`
- leading Search/Loading icon
- clear icon only when value exists
- clear control has a 44×44px target within the field

### Replaces

The near-duplicate search inputs in:

- `/explore`
- `/tracks`
- `/together/new`

Archive's dense inline search remains a later validation case and is not forced into this variant yet.

---

## 4. ArtistGridItem / v1.1

Figma variants: 2

- Selected=False
- Selected=True

Use:

- recommendation / discovery grid
- typically 3-column mobile layout

Specification:

- artist media: 96px circle
- neutral default boundary
- selected: brand ring + check badge
- selected state never relies on color alone
- same label typography in both states to prevent layout shift

Validated in:

- Favorite `/explore`
- Together creation Step 1

---

## 5. SelectableArtistRow / v1.1

Figma variants: 2

- Selected=False
- Selected=True

Specification:

- 56px artist media
- 12px content inset
- 16px radius
- default = semantic fill + line
- selected = light surface + brand boundary + brand media ring + check
- title/meta anatomy is identical in both states

The previous heavy selected fill was rejected during Figma QA because it made selection read like a primary CTA.

Validated in:

- Favorite artist search
- Together creator artist search

---

## 6. SelectableTrackRow / v1.1

Axes:

- Media: `False | True`
- Selected: `False | True`

Figma variants: 4

Use:

- `Media=False`: album-expanded track list
- `Media=True`: imported previous taste list / source list

Specification:

- row itself is transparent
- list parent owns dividers/surface
- selected and unselected song information remain equally legible
- selection state is conveyed with Compact Chip
- row owns interaction target

### Important decision

Do **not** dim unselected track titles heavily.

The user is deciding between songs; an unselected song is not disabled content.

Validated in:

- Favorite `/tracks`
- Together creation Step 2

---

## 7. AlbumSelectionHeader / v1.1

Figma variants:

- State=None
- State=Partial
- State=All

Left side:

- no selection: guidance
- partial: selected count
- all: selected count

Right side:

- `전체 선택`
- `전체 해제`

### Important correction from QA

The right-side action is **not a Chip**.

It is a 44px text-action target because "select all" is an action, not a selected/unselected object state.

This avoids the false consistency of forcing every compact control into Chip.

---

## 8. Cross-flow validation

Figma page `31 Picking Validation` contains four compositions built with actual component instances.

### Favorite / Artist Picker — `/explore`

Uses:

- PageHeader
- SearchInput
- SelectableArtistRow
- ArtistGridItem
- Button

Result:

- PASS
- selection semantics stay consistent between recommendation and search result densities

### Favorite / Track Picker — `/tracks`

Uses:

- PageHeader
- SearchInput
- AlbumSelectionHeader
- SelectableTrackRow (Media=False)
- Compact Chip
- BottomActionDock / Selection

Result:

- PASS
- album action and per-track selected state remain semantically distinct

### Together / Artist Picker — Step 1

Uses the same:

- SearchInput
- SelectableArtistRow
- ArtistGridItem

Result:

- PASS
- mode difference is expressed by copy/source logic, not another artist-card system

### Together / Track Picker — Step 2

Uses:

- SelectableTrackRow (Media=True)
- Compact Chip
- BottomActionDock / Selection

Result:

- PASS
- imported source changes media density only; selection semantics remain identical

---

## 9. Decisions locked by Wave A

1. **Selected object state = brand.**
   Orange `point` is not the universal selected color.

2. **Selection meaning is shared across modes.**
   Favorite and Together do not get separate artist/track selection visual systems.

3. **Compact visual does not mean compact touch target.**
   32px visual controls require a 44px target or a clickable containing row.

4. **Actions are not Chips.**
   Album “전체 선택/해제” remains a text action.

5. **Unselected is not disabled.**
   Unselected tracks must remain readable.

6. **Composition differences stay outside primitive components.**
   Minimum track count, CTA copy, imported-source explanation, and routing do not belong inside SelectableTrackRow.

---

## 10. Not included in Wave A

These remain for later waves:

- `SourcePickerRow` — should be evaluated with RecordRow in Wave C
- `TrackSelectionDock` product state machine — built on BottomActionDock
- actual AlbumCard Figma documentation
- InlineLoadProgress
- FormField / room name
- unreleased registration flow
- archive dense search variant

---

## 11. Production migration status

**Not started.**

The next planned design work is Wave B — Tournament system:

- TournamentProgress
- GestureHint
- UndoNotice
- CandidatePair composition
- documentation/reconciliation of existing WorldCupCandidate
- LPPlayer
- WinnerReveal

Production migration should remain blocked until the planned design waves are completed and reviewed.
