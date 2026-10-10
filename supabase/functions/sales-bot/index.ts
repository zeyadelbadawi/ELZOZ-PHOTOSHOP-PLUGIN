// Supabase Edge Function: sales-bot. Deploy with verify_jwt = false: Meta, Telegram, the
// payment forwarder and pg_cron cannot send a Supabase JWT, so every route checks its own secret:
//   POST/GET /sales-bot/wa   WhatsApp Cloud API webhook   (X-Hub-Signature-256 with WA_APP_SECRET)
//   POST     /sales-bot/tg   Telegram bot webhook          (X-Telegram-Bot-Api-Secret-Token = TG_WEBHOOK_SECRET, owner chat only)
//   POST     /sales-bot/pay  payment notifications         (x-elzoz-key header or ?key= = PAY_WEBHOOK_KEY)
//   POST     /sales-bot/cron every 5 minutes from pg_cron  (x-cron-key checked against Supabase Vault)
// Logic: lib/bot.mjs (tested in Node: tests/bot/sales-bot.test.js). Setup: docs/SALES_BOT_SETUP_AR.md.
import { createBot } from "./lib/bot.mjs";
import { geminiClient, supabaseClient, telegramClient, whatsappClient } from "./lib/clients.mjs";
import { parseAllowedSenders } from "./lib/payments.mjs";

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

const env = (k: string) => Deno.env.get(k) || "";

// New Supabase API keys come as a JSON dictionary; older projects have the single legacy key.
function pickKey(dictJson: string, legacy: string) {
    if (dictJson) {
        try {
            const d = JSON.parse(dictJson);
            const v = d && (d.default || Object.values(d)[0]);
            if (v) return String(v);
        } catch {
            /* not JSON */
        }
    }
    return legacy;
}

function build() {
    const db = supabaseClient({ url: env("SUPABASE_URL"), key: pickKey(env("SUPABASE_SECRET_KEYS"), env("SUPABASE_SERVICE_ROLE_KEY")) });
    const wa = env("WA_TOKEN") && env("WA_PHONE_NUMBER_ID")
        ? whatsappClient({ token: env("WA_TOKEN"), phoneNumberId: env("WA_PHONE_NUMBER_ID"), version: env("WA_GRAPH_VERSION") || "v23.0" })
        : null;
    const tg = env("TG_BOT_TOKEN") ? telegramClient({ token: env("TG_BOT_TOKEN"), chatId: env("TG_OWNER_CHAT_ID") }) : null;
    const ai = geminiClient({ apiKey: env("GEMINI_API_KEY"), model: env("GEMINI_MODEL") || undefined });
    return createBot({
        db,
        wa,
        tg,
        ai,
        config: {
            waAppSecret: env("WA_APP_SECRET"),
            waVerifyToken: env("WA_VERIFY_TOKEN"),
            waPhoneNumberId: env("WA_PHONE_NUMBER_ID"),
            tgSecret: env("TG_WEBHOOK_SECRET"),
            tgOwner: env("TG_OWNER_CHAT_ID"),
            payKey: env("PAY_WEBHOOK_KEY"),
            allowedSenders: parseAllowedSenders(env("PAY_ALLOWED_SENDERS"))
        },
        log: (level: string, msg: string, extra?: unknown) => console.log(JSON.stringify({ level, msg, ...(extra as object) }))
    });
}

Deno.serve(async (req: Request) => {
    const url = new URL(req.url);
    const route = url.pathname.split("/").filter(Boolean).pop();
    const headers: Record<string, string> = {};
    req.headers.forEach((v, k) => (headers[k.toLowerCase()] = v));
    const rawBody = req.method === "POST" ? await req.text() : "";
    if (rawBody.length > 256 * 1024) return new Response("too large", { status: 413 });
    const input = { method: req.method, query: Object.fromEntries(url.searchParams), headers, rawBody };
    const bot = build();
    let r: { status: number; body: unknown; text?: boolean; background?: Promise<unknown> };
    try {
        if (route === "wa") r = await bot.handleWhatsApp(input);
        else if (route === "tg") r = await bot.handleTelegram(input);
        else if (route === "pay") r = await bot.handlePayment(input);
        else if (route === "cron") r = await bot.handleCron(input);
        else return new Response("not found", { status: 404 });
    } catch (e) {
        console.log(JSON.stringify({ level: "error", msg: "request failed", route, error: (e as Error).message }));
        return new Response(JSON.stringify({ error: "internal_error" }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
    if (r.background) {
        const p = r.background.catch((e) => console.log(JSON.stringify({ level: "error", msg: "background failed", error: (e as Error).message })));
        if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(p);
        else await p;
    }
    return r.text
        ? new Response(String(r.body), { status: r.status, headers: { "Content-Type": "text/plain" } })
        : new Response(JSON.stringify(r.body), { status: r.status, headers: { "Content-Type": "application/json" } });
});
