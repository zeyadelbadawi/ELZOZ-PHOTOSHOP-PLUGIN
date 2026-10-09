// Supabase Edge Function: admin-users (create user + password, reset password,
// disable/enable). Logic in core.mjs (tested in Node: tests/admin/admin-users.test.js).
// Supabase provides SUPABASE_URL and the API keys to every Edge Function: the new
// SUPABASE_PUBLISHABLE_KEYS / SUPABASE_SECRET_KEYS (JSON dictionaries) and, on
// projects that still have them, the legacy SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY.
// Set ELZOZ_ADMIN_ORIGINS to the dashboard URL(s):
//   supabase secrets set ELZOZ_ADMIN_ORIGINS=https://admin.example.com
import { handleAdminRequest, pickKey } from "./core.mjs";

Deno.serve(async (req: Request) => {
    const headers: Record<string, string> = {};
    req.headers.forEach((v, k) => (headers[k.toLowerCase()] = v));
    const r = await handleAdminRequest(
        { method: req.method, headers, body: req.method === "POST" ? await req.text() : "" },
        {
            supabaseUrl: Deno.env.get("SUPABASE_URL"),
            anonKey: pickKey(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS"), Deno.env.get("SUPABASE_ANON_KEY")),
            serviceKey: pickKey(Deno.env.get("SUPABASE_SECRET_KEYS"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")),
            allowedOrigins: Deno.env.get("ELZOZ_ADMIN_ORIGINS") || ""
        }
    );
    return new Response(r.status === 204 ? null : r.body, { status: r.status, headers: r.headers as Record<string, string> });
});
