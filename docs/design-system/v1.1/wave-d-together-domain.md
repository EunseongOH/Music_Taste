# Sortify Design System v1.1 — Wave D: Together Domain

> Status: **Figma candidate validated / production migration not started**  
> Date: 2026-09-26  
> Figma pages: `60 Together v1.1`, `61 Together Validation`

## Scope

Together-only domain objects and compositions:

- CodeInput
- RoomCodeCard
- ParticipantChip
- MediaHero
- MatchMetric
- TasteRelationGraph / Existing
- ParticipantSheet / Existing
- TogetherPairDetail / Existing

The goal is not to create a separate visual system for Together. Shared actions, rows, sheets, ranking and tournament UI continue to use the common Sortify system.

---

## 1. CodeInput / v1.1

States:
- Default
- Filled
- Focus

Specification:
- 56px height
- 16px radius
- white/light surface
- semantic boundary
- focus = brand
- 22px numeric/code typography
- wide tracking matching current implementation

Invalid room code remains Toast feedback. A separate field-error visual state is not introduced without a real product need.

---

## 2. RoomCodeCard / v1.1

Densities:
- Full
- Compact

Full:
- room-created success screen

Compact:
- invite/share sheet compositions

The same room code object is reused rather than designing a second code panel.

---

## 3. ParticipantChip / v1.1

28px compact participant label used on the invite/room screen.

Purpose:
- quickly show who has finished sorting

It does **not** borrow TasteRelationGraph node styling.

A graph node means relationship/selection; ParticipantChip only communicates participation.

---

## 4. MediaHero / v1.1

Contexts:
- Invite
- Result

Shared grammar:

`image → app-background fade → overlay navigation/content`

Invite:
- Back action
- invitation headline
- invitation description

Result:
- Close action
- artist / track count
- Together-result context
- prominent group match value

If there is no image, the screen should fall back to an ordinary page intro rather than rendering an empty hero.

---

## 5. MatchMetric / v1.1

Together product primitive for a **prominent result metric**, such as overall group match rate.

Do not use this component for every percentage in:
- list rows
- participant sheet
- graph nodes

Those percentages remain local data within their existing components.

---

## 6. Persistent save status

Composition, not a primitive:

- check
- “내 계정에 저장됐어요”
- My Taste Space text link

The status is persistent because a short Toast is insufficient to answer “was this result actually saved?” after reload.

---

## 7. TasteRelationGraph / Existing

Keep as a Together-specific visualization.

Current documented rules:
- participant node minimum 44px interaction area
- my node = navy / cream
- selected other = cream + point-ink ring
- default other = cream + neutral boundary
- optional match-rate second line
- +N node opens ParticipantSheet

Do not promote this into a generic chart component.

---

## 8. ParticipantSheet / Existing

Current information order:

1. match %
2. participant name
3. common-track count / comparable state
4. current-selection indicator

The sheet is sorted around the viewer’s relationship to participants, not as a generic people picker.

---

## 9. TogetherPairDetail / Existing

Keep the current hierarchy principle:

- pair heading + match %
- shared TOP K
- biggest rank gap
- full side-by-side rank comparison
- unknown/no-record stances

Do not nest cards inside cards. Hierarchy comes from spacing, typography and a very small number of semantic surfaces.

---

## 10. Cross-flow validation

Figma `61 Together Validation`.

### Together entry — PASS

Uses:
- CodeInput
- existing Button hierarchy

### Room created — PASS

Uses:
- RoomCodeCard / Full
- existing Button hierarchy

### Invite room — PASS

Uses:
- MediaHero / Invite
- ParticipantChip
- RankList / Existing
- shared music-row anatomy
- existing Button hierarchy

### Group result — PASS

Uses:
- MediaHero / Result
- persistent save-status composition
- TasteRelationGraph / Existing
- TogetherPairDetail / Existing
- existing Button hierarchy

The result screen remains Together-specific at the visualization/detail layer while continuing to reuse shared shells and actions.

---

## 11. Decisions locked by Wave D

1. Input and display versions of a room code are separate components with the same domain object.
2. Invite and Result share one MediaHero grammar.
3. Participant completion labels and graph nodes are different roles.
4. TasteRelationGraph stays product-specific.
5. Pair comparison stays product-specific.
6. Shared buttons, Sheets, RankList, Tournament and picking UI do not get Together variants.
7. TogetherResultShareCard remains export-specific and does not define app-surface card styling.

---

## 12. Production migration

Not started.

All planned design waves A–D are now Figma-validated.  
The next step is a migration-readiness audit and a code-mapping plan before production component migration begins.
