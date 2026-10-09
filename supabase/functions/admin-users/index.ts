// Supabase Edge Function: admin-users (create user + password, reset password,
// disable/enable). Logic in core.mjs (tested in Node: tests/admin/admin-users.test.js).
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided by
// Supabase to every Edge Function. Set ELZOZ_ADMIN_ORIGINS to the dashboard URL(s):
//   supabase secrets set ELZOZ_ADMIN_ORIGINS=https://admin.example.com
import { handleAdminRequest } from "./core.mjs";

Deno.serve(async (req: Request) => {
    const headers: Record<string, string> = {};
    req.headers.forEach((v, k) => (headers[k.toLowerCase()] = v));
    const r = await handleAdminRequest(
        { method: req.method, headers, body: req.method === "POST" ? await req.text() : "" },
        {
            supabaseUrl: Deno.env.get("SUPABASE_URL"),
            anonKey: Deno.env.get("SUPABASE_ANON_KEY"),
            serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
            allowedOrigins: Deno.env.get("ELZOZ_ADMIN_ORIGINS") || ""
        }
    );
    return new Response(r.status === 204 ? null : r.body, { status: r.status, headers: r.headers as Record<string, string> });
});
