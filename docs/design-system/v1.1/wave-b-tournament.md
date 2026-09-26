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


## Figma fidelity rebuild — 2026-09-26

The first documentation-only specimens for `WorldCupCandidate / Existing` and `LPPlayer / Existing` were too schematic and did not preserve the visual character of the production UI. They were rebuilt by re-reading the production component code and the approved turntable design decisions.

### WorldCupCandidate / Existing

The main component itself was rebuilt while preserving its component-set identity, so every CandidatePair and Tournament Validation instance continues to reference the same main component.

Documented production geometry:
- mobile visual wrapper: 112px
- idle: full album sleeve
- active/dragging: LP revealed behind the sleeve
- LP base: 90% of wrapper, with while-drag emphasis represented in the Figma active state
- sleeve: approximately 85% scale, upward translation, 0.5 opacity and -5° rotation
- dark new-tone LP with grooves
- album-image label and spindle hole
- title/artist label disappears while active

### LPPlayer / Existing

The main component itself was rebuilt and all existing Figma instances remain linked to it.

Documented new-tone World Cup state:
- surface-based plinth, not line art
- recessed screws
- platter: 136px
- LP: 124px
- World Cup disc treatment: soft neutral glass
- idle label: point, 30% of LP
- playing state: full picture-disc jacket
- subtle picture-disc grooves and spindle
- neutral metallic pivot/body/headshell
- playing tonearm angle: 43°
- tonearm head reaches over the rotating LP
- the player remains visually quieter than the candidate covers

The rebuild updates the same main component IDs, so existing uses in `CandidatePair / Composition` and `41 Tournament Validation` update automatically rather than becoming detached copies.
