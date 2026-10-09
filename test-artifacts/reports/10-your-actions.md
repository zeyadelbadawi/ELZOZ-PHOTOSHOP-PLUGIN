# 10. What I need from you (minimal)

Everything that can be built and tested without your accounts and your Photoshop is done. These remaining steps are yours, because they need your Photoshop licence or your Supabase/hosting accounts.

| # | Action | Time | Guide |
|---|---|---|---|
| 1 | **Photoshop self-test**: run `npm run qa:kit`, open the zip, follow the README. Send back `elzoz-selftest-report.json` and a panel screenshot for each Photoshop version you have | ~10 min per version | `docs/PHOTOSHOP_TESTING.md` |
| 2 | **Supabase project**: create it, enable pg_cron, `supabase db push`, deploy `admin-users`, turn sign-ups **off**, create your admin user and add it to `private.admins` | ~20 min | `docs/DEPLOYMENT.md` §1 |
| 3 | **Dashboard hosting**: build `admin/` with your project URL and publishable key, upload `admin/dist` to Netlify, Vercel or Cloudflare Pages, and set `ELZOZ_ADMIN_ORIGINS` | ~10 min | `docs/DEPLOYMENT.md` §2 |
| 4 | **Plugin build**: put the URL, publishable key and your WhatsApp link (`ELZOZ_CONTACT_URL`) in `.env`, run `npm run build:prod`, then package a `.ccx` with UDT | ~10 min | `docs/DEPLOYMENT.md` §3 |
| 5 | **One real cycle on staging**: create yourself a test client in the dashboard, sign in to the plugin with it, generate a few designs, top up, and disable/enable | ~15 min | `docs/ADMIN_GUIDE_AR.md` |

Optional: `npm install https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` swaps the provenance-signed SheetJS rebuild for the official tarball. Run it on a machine that can reach `cdn.sheetjs.com`, then run `npm test`.

Send me the self-test reports (item 1). If anything fails, the report names the step and the error, and I can fix it from that.
