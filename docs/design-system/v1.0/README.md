# Sortify Design System v1.0

> Current-product snapshot captured on 2026-09-26.

- Source repository: `EunseongOH/Music_Taste`
- Source baseline: `develop@cca50a183a70a9d034ec1d8cd704a6aea3f43172`
- Figma: https://www.figma.com/design/DYEYRL3PG29Xb4RJOyNXe8
- Default theme: `sky-tint`

## Purpose

v1.0 is a descriptive snapshot of the current Sortify UI system before a consistency cleanup.
Repeated production patterns are promoted to shared primitives, while screen-specific deviations remain documented as audit candidates for v1.1.

## Foundations

### Color
- Cream: #F3F8FF
- Fill: #E6F1FD
- Line: #DCE8F7
- Navy / Ink: #18213B
- Charcoal: #333D4B
- Brand: #385BF0
- Point: #FD7E3E
- Point Ink: #C2410C
- Danger: #D22030

Theme modes recorded in Figma Variables:
- Sky Tint
- Toss White
- Legacy

### Typography

Product font specification:
- UI: Pretendard
- Numeric emphasis: Wanted Sans
- Wordmark: Nunito ExtraBold

Figma Local Text Styles:
- `Typography/UI/Display` — 28 / 36 · 800 · -2%
- `Typography/UI/Title 1` — 22 / 31 · 700 · -2%
- `Typography/UI/Title 2` — 17 / 25.5 · 700 · -1%
- `Typography/UI/Body Strong` — 15 / 22.5 · 600
- `Typography/UI/Body` — 15 / 22.5 · 400
- `Typography/UI/Sub` — 13 / 19.5 · 400
- `Typography/UI/Caption` — 12 / 18 · 400 · +1%
- `Typography/Special/Wordmark`
- `Typography/Special/Numeric`

The connected Figma environment currently does not expose Pretendard or Wanted Sans, so the UI styles use Inter as a temporary visual fallback. Product-facing text in the Figma component page is bound to the local Text Styles. When Pretendard becomes available, update the seven `Typography/UI/*` styles to Pretendard weights 800 / 700 / 700 / 600 / 400 / 400 / 400; bound specimens and components will update together.

## Components recorded in v1.0
- Button: Primary / Secondary / Danger / Disabled
- Chip: selected / unselected
- Input: default / error
- Underline Tabs
- Back icon control
- Bottom Sheet
- Centered Dialog

## Known consistency candidates for v1.1
1. `LoginModal` controls do not fully match the newer shared Button/Input rules.
2. `NicknameDialog` still uses its own input styling.
3. Centered dialogs use multiple radius/shadow/padding combinations.
4. `navy` and `cream` names originated as palette names but now act as semantic roles.
5. Lucide icon size/stroke conventions are not centralized yet.

## Files
- `index.html`: visual HTML reference
- `styles.css`: CSS token/component snapshot

## Consistency audit
- [UI consistency audit](./consistency-audit.md) — full active-route review, duplicate-role findings, intentional exceptions, and proposed v1.1 migration order.
