# Contributing

1. Branch from `main` and keep each pull request focused on one change.
2. Before pushing, run `npm run typecheck`, `npm run lint`, `npm test` and `npm run build`.
3. Schema changes go in a new numbered file in `supabase/migrations/`; never edit an applied migration.
4. Keep UI text in `messages/*.json` (all four locales; `src/i18n/messages.test.ts` checks parity).
5. The public website lives in `public/site/index.html` and is edited with its built-in editor; keep
   app changes out of that file.
6. Keep the MIT [`LICENSE`](LICENSE): AutoShift's CRM is based on wacrm.
