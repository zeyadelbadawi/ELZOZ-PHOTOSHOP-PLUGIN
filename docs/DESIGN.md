# Elzoz design system & screens

Implemented in `src/ui/theme.css`, `src/ui/components.jsx`, `src/app/**`. Screenshots in `docs/ui-preview/` come from the **browser harness** (Chromium with a fake Photoshop). They show layout and flow, **not** final UXP rendering.

## Principles
1. **One guided job:** Data → Template → Map → (Animate) → Check → Generate/Results. A step can be entered only when earlier steps are valid; the action bar says why "Next" is disabled.
2. **Honest state:** success only after verification on disk; every issue names the row, column or layer and links to the step that fixes it.
3. **Built for a docked panel:** 240 px minimum, 320 px default, comfortable up to 520 px+.
4. **Photoshop-native look:** host theme variables, Spectrum buttons, native selects and inputs; brand yellow only as an accent fill with dark text.

## Platform constraints honored
Flexbox only (no grid); no `gap`, `box-shadow`, `transform`, `transition`, `animation` or `filter`; width media queries only (single panel); custom elements wired through refs.

## Tokens

| Token | Value |
|---|---|
| Surfaces / text / borders | `--uxp-host-background-color`, `--uxp-host-text-color(-secondary)`, `--uxp-host-border-color` with fallbacks |
| Accent | `#fdb926` on `#1a1a1a` text |
| Status | success `#2d9d78`, warning `#e68619`, error `#d7373f`, info `#378ef0`, always with text |
| Type | host font size (12), smaller (11), larger (14), stat 18; weights 400/700 |
| Spacing | 4 / 8 / 12 / 16 / 24 |
| Radius | 4 (controls), 6 (cards), no shadows |

## Components
`Button` (sp-button: cta / primary / secondary / warning / quiet) · `Section` · `Card` · `Field` · `Select` · `NumberInput` · `TextInput` · `Checkbox` · `FileField` (picked file or folder with Change) · `KindIcon` (T/S/P/G) · `Badge` · `Alert` (info/success/warning/error + action) · `EmptyState` · `ProgressBar` · `Stat`.

## Screens

| Screen | Content | States |
|---|---|---|
| Sign in | Email, password, reset link, website link; language switch | not configured (dev mode in dev builds), error, reset sent |
| Header | Brand, Designs/Video switch (locked while running), credit chip → Account | low balance highlighted |
| Data | Spreadsheet picker, sheet and header-row selectors, issues, 5-row preview (scrolls sideways inside its card) | empty, parse errors, warnings |
| Template | PSD picker or "use open document", size and layer counts, duplicate-name warning, version notices | unsupported Photoshop, text fallback |
| Map | Text and image layers with group path, column picker, row-1 sample value, empty-cell policy; images: folder, fit, matching options; auto-map | no mappable layers |
| Animate (video) | Format, fps, duration, fade-out; per-layer preset, start, length, easing; Photoshop-rendered preview frame | invalid timeline |
| Check | Output folder, formats, JPEG quality, naming pattern, keep frames; blocking issues with Fix; warnings with row numbers; outputs, skipped rows, credits needed/available, first names | blocking / ready |
| Generate | Cost button (confirmation above 50 credits); live progress (rows, frames), cancel | running, cancelling |
| Results | Outcome, succeeded/failed/cancelled, credits charged, per-row list with step + reason, retry failed rows, CSV report, new job | completed, with errors, cancelled, failed |
| Account | Available and reserved credits, buy credits, ledger, recent jobs, language, sign out | dev mode |

## Responsive behavior
- < 280 px: stepper shows numbers only; layer pickers wrap under the name.
- < 400 px: stepper shows only the current step's label.
- ≥ 520 px: wider padding; pickers take 40%.
- Content scrolls between a fixed header/stepper and a fixed action bar; tables scroll sideways inside their card.

## RTL
`dir="rtl"` on the app root mirrors layout in browsers. UXP doesn't document `direction`, so RTL layout is on the Photoshop checklist.
