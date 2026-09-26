# Sortify Design System v1.1 — Wave B: Tournament System

> Status: **Figma candidate validated / production migration not started**  
> Date: 2026-09-26  
> Figma pages: `40 Tournament v1.1`, `41 Tournament Validation`

## Scope

Shared by Favorite Songs Sort and Sort Together:
- TournamentProgress
- GestureHint
- UndoNotice
- WorldCupCandidate documentation
- CandidatePair composition
- LPPlayer documentation
- WinnerReveal documentation

No Together-specific tournament UI is introduced.

## Color-role decision

- `brand` = action / selected object
- `point` = progress / short-lived interaction emphasis

This keeps Wave A selection semantics intact while allowing the tournament to retain a light sense of momentum.

## TournamentProgress

One product component:
- match index / total
- point progress bar
- round title

Final is copy, not a visual variant.

## GestureHint

Variants:
- Idle
- TurntableActive
- SkipActive

Rules:
- Idle = neutral fill
- TurntableActive = cream + point-ink boundary/text
- SkipActive = dashed neutral boundary
- never use white text on the orange point surface

The dragging screen may show:
- skip guidance above the candidate pair
- turntable guidance below the pair

These are spatially directional and remain visually lightweight.

## UndoNotice

Actionable transient feedback.

It is **not a Toast** because:
- it temporarily replaces the candidate area
- it contains an Undo action
- it changes the immediate match outcome

## WorldCupCandidate / Existing

Current product component is retained.

Documented states:
- Idle
- Dragging

Implementation behavior remains in code:
- press/drag reveal
- drag down → choose
- drag up → unknown/skip

No Favorite/Together variants.

## CandidatePair

Composition pattern only:

`WorldCupCandidate + VS + WorldCupCandidate`

Do not publish VS or the pair as a second business-logic component unless a real reuse case appears outside Tournament.

## LPPlayer / Existing

No redesign.

Figma documents the already-approved product direction:
- new tone uses surface look
- Tournament uses soft disc treatment
- platter remains inside plinth
- jacket becomes picture disc
- tonearm rests over the spinning LP when active
- turntable remains visually quiet

## WinnerReveal / Existing

Current two-phase product component is retained:
- FinalPair
- Revealed

Rules:
- reduced-motion skips directly to Revealed
- revealed image fades into app background
- image/fade grammar aligns with Together hero surfaces
- next route differs by mode; visual component does not

## Validation

Figma `41 Tournament Validation`:
- Active match — PASS
- Dragging guidance — PASS
- Skip + Undo — PASS
- Winner reveal — PASS

Favorite/Together difference is persistence and routing only.

## Production migration

Not started.

Next design wave: Records & Archive.
