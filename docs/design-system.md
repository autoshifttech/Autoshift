# Design system

This is an original system, defined in `frontend/src/styles/index.css` (Tailwind 4 `@theme`). It was not measured from the reference site; see `reference-audit.md`.

## Tokens
| Token | Value | Use |
|---|---|---|
| `ink` | `#0b1b17` | Text, dark surfaces, footer |
| `ink-soft` / `muted` | `#3d4f4a` / `#66766f` | Body and secondary text |
| `line` / `surface` | `#dfe8e4` / `#f6f9f8` | Borders, alternating section background |
| `brand-50…900` | `#ecfdf7` → `#0b3f33` (primary `brand-600` `#0a936e`) | Buttons, accents, eyebrows |
| `accent` | `#f5a524` | Small highlights |
| `wa`, `wa-chat`, `wa-bubble` | `#25d366`, `#efeae2`, `#d9fdd3` | WhatsApp-style mocks |
| `radius-card` | `1.25rem` | Cards |
| `shadow-card` / `shadow-lift` | soft two-layer shadows | Cards / raised elements |

## Type
- Font: **Plus Jakarta Sans** (Google Fonts), with the system stack as fallback. Weights 400–800.
- Headings: H1 `text-4xl → 6xl`, extrabold, tight tracking, `text-balance`. H2 `text-3xl → 4xl`, bold.
- Body: `text-base`/`text-lg` with relaxed leading. Eyebrows are 12px uppercase pills.

## Layout
- Container `max-w-7xl` with 16/24/32px side padding.
- Sections use `py-16` (mobile) and `py-24` (≥640px).
- Header is sticky, 64px tall (72px on desktop), translucent white with a blur.
- Breakpoints are Tailwind defaults (640 / 768 / 1024 / 1280). The nav collapses to a drawer below 1024px.

## Components
- **Button / ButtonLink:** primary, secondary, ghost, dark and danger variants in sm, md and lg sizes. Pill shape.
- **Form fields:** `Field` handles the label, hint and error with aria wiring; `.field-input` styles the control.
- **Choice controls:** `Segmented` (radio group), `Accordion`.
- **Effects and mocks:** `Reveal` (scroll fade-in), `ChatMock` (phone frame), `CopyButton`.

## Motion
- Scroll reveals: 600ms fade and rise.
- Chat bubble-in: 350ms, plus a typing indicator.
- Hover lift on cards.
- `prefers-reduced-motion` turns off reveals and animations, and the chat demo shows all messages at once.
