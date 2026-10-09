# 10. What I need from you (minimal)

Ordered by how much they unblock. Nothing else needs your involvement.

| # | Action | Time | Why only you can do it |
|---|---|---|---|
| 1 | Run the self-test in Photoshop: `npm run qa:kit`, then follow `dist-qa/elzoz-photoshop-qa-kit/README.md`. Send back `elzoz-selftest-report.json` plus one panel screenshot per Photoshop version | About 10 min per version | Needs licensed Photoshop on macOS or Windows |
| 2 | Upgrade SheetJS, either by running `npm install https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` (check sheetjs.com for the current version first) or by letting me do it in a session with access to `cdn.sheetjs.com`. Then run `npm test` | 2 min | Fixes the 2 high advisories in `xlsx` 0.18.5. The CDN is blocked from this environment |
| 3 | Create a **staging** Supabase project; put its URL and **anon** key in `.env` (never the service_role key); apply `supabase/migrations/` with the Supabase CLI; enable `pg_cron` | 15 min | Needs your Supabase account |
| 4 | With item 3 done: run the paid-flow checklist in `docs/PLAN.md` §7 once on your main Photoshop version | 30 min | Needs Photoshop and the staging backend |

After items 1 and 4, update the Results log in `docs/COMPATIBILITY.md` (or send me the reports and I will).
