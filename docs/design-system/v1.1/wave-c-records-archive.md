# Sortify Design System v1.1 — Wave C: Records & Archive

> Status: **Figma candidate validated / production migration not started**  
> Date: 2026-09-26  
> Figma pages: `50 Records & Archive v1.1`, `51 Records Validation`

## Scope

Wave C standardizes the record/list hierarchy shared by:

- My Taste Space
- Listen Later
- Taste Mates
- Public Taste Archive
- Public Taste Detail
- Unreleased Archive

The main decision is to **share the row anatomy where the information structure is the same, but keep domain-specific expanding content separate**.

---

## 1. RecordRow / v1.1

Shared anatomy:

`leading media → title → supporting/meta → trailing slot`

Media variants:

- Cover
- Avatar

Trailing slot options:

- None
- Metric
- Switch
- Icon

All trailing slot helpers use a **fixed 72px layout width** so swapping trailing content does not shift the title/meta column.

The visual content inside that slot remains compact:

- metric text
- switch visual
- icon target

### Valid use cases

- My taste result
- Sort Together room record
- Listen Later row
- High-sync Taste Mate row
- Public taste result row

### Do not create separate visual systems named

- TasteCardRow
- TogetherRoomCard
- ListenCard
- MateCard
- PublicTasteCard

Those are compositions/data roles on top of RecordRow, not different row systems.

---

## 2. SelectField / v1.1

States:

- Default
- Focus

Specification:

- 48px height
- fill surface
- semantic line
- focus = brand
- trailing chevron

The native `select` behavior remains owned by implementation code. Figma defines the visual hierarchy only.

Primary use:

- Taste Mate base-result selector

---

## 3. ActionRow / v1.1

Tones:

- Default
- Danger

Use:

- Sheet options
- save/share actions
- destructive settings/actions

Rules:

- 56px full-row target
- same anatomy across tones
- danger changes semantic color only

---

## 4. WinnerFeature / v1.1

Public taste detail product component.

Anatomy:

- rotating LP
- slightly tilted sleeve
- winner badge
- winner title / artist

This is intentionally **not** a generic Card or RecordRow.

It is an editorial/product feature surface for the public taste-detail hierarchy.

---

## 5. UnreleasedTrackItem / v1.1

States:

- Collapsed
- Media
- Lyrics

Contains:

- video thumbnail
- track title / artist / date
- Listen
- Lyrics
- Release report
- expandable embedded media
- expandable lyrics area

### Boundary decision

Do **not** force this into RecordRow.

The row owns multiple expanding content states and domain actions inside one item, so it remains a Sortify product component.

---

## 6. Existing shared primitives restored to Figma

Wave C exposed three components that already exist in `SpaceUI.tsx` but were missing from the Figma library.

### UnderlineTabs / Existing

Code behavior:

- flexible tab count
- bottom divider
- selected tab text emphasis
- point underline

Figma documents the current 2-tab and 3-tab usages.

### Switch / Existing

Current code:

- 40×24
- checked = point
- unchecked = navy/20
- 20px white knob

This is documented as current production behavior, not a new Wave C redesign.

### RankList / Existing

Current product primitive:

- 40px Cover
- ranking number
- title / artist
- 1–3 rank numbers = point-ink
- later ranks = secondary navy

It remains a core Sortify product primitive.

---

## 7. Cross-flow validation

Figma page `51 Records Validation`.

### My Space records — PASS

Validated:

- personal taste record
- Sort Together room
- Listen Later action

All use the RecordRow foundation with different trailing slots.

### Taste Mate — PASS

Validated:

- SelectField
- Avatar RecordRow
- Metric trailing

High-sync percentage stays row data, not a new card family.

### Public Archive — PASS

Public taste results use the same Cover RecordRow anatomy as My Space.

### Public Taste Detail — PASS

Uses a separate hierarchy:

- metadata
- WinnerFeature
- RankList
- three-action dock composition

This intentionally does not collapse into RecordRow.

### Unreleased — PASS

Uses UnreleasedTrackItem.

Media/lyrics/report states remain inside that product component.

---

## 8. Decisions locked by Wave C

1. **Record role does not define a new visual component.**
   Taste, Together, Listen Later, Mate and Public records share one row foundation.

2. **Trailing content is a slot.**
   Switch, metric and icon actions do not require separate row components.

3. **Stable trailing width prevents text-column jitter.**

4. **Expandable domain rows remain product components.**
   UnreleasedTrackItem is not RecordRow.

5. **Winner emphasis is not list anatomy.**
   WinnerFeature belongs to public detail hierarchy.

6. Existing SpaceUI primitives missing in Figma must be documented before migration.

---

## 9. Production migration

Not started.

Next planned design wave: **Wave D — Together domain**.

Scope:

- CodeInput
- RoomCodeCard
- ParticipantChip
- MediaHero
- relation-graph / pair-detail documentation
- Together-specific composition validation
