@AGENTS.md

## UI/UX design

Use the **UI UX Pro Max** skill (`.claude/skills/ui-ux-pro-max`, MIT licence, from
`nextlevelbuilder/ui-ux-pro-max-skill` at commit `28b3b8d`) as the primary design guide for every
UI change, now and later. Read its `SKILL.md`, follow the priority order there (accessibility,
touch and interaction, performance, layout and responsive, typography and colour, motion, forms,
navigation, charts) and run its pre-delivery checklist before calling a design change done.

Search tool (plain Python, no packages; works from the project root):

```bash
CLAUDE_PLUGIN_ROOT="$PWD" python3 "$PWD/.claude/skills/ui-ux-pro-max/scripts/search.py" "<query>" --domain ux
```

Rules for design work:

- **Change the existing design only.** Never build a separate app. Do not touch the backend, API
  routes, database, auth or existing behaviour for a design change.
- **Inspect before changing.** Read the existing components, pages and tokens (`src/app/globals.css`,
  `src/components/ui`, the shells in `src/components/layout` and `src/components/admin`) first.
- **Keep the AutoShift brand.** Green `#1E4C41` primary, warm cream surfaces, Plus Jakarta Sans.
  Take the skill's rules (accessibility, spacing, interaction, responsive) but not its generic
  palette or font suggestions.
- Use semantic colour tokens, not raw hex; keep text at 4.5:1 contrast or better; touch targets 44px
  on phones; visible focus; respect `prefers-reduced-motion`; add every new string in all four
  languages (en, pt, es, ko).
