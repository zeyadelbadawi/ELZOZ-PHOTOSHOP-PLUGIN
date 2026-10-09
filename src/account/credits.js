// Credits client: calls the SECURITY DEFINER RPCs through PostgREST with the
// user's access token. The plugin never computes or stores a balance it trusts;
// every number shown comes from the server.
import { secureUuid } from "./random.js";

export class CreditsError extends Error {
    constructor(code, message, details) {
        super(message);
        this.code = code;
        this.details = details;
    }
}

const USER_MESSAGES = {
    insufficient_credits: "Not enough credits for this job.",
    rate_limited: "Too many requests. Wait a minute and try again.",
    too_many_active_jobs: "You already have 3 jobs running. Finish or cancel one first.",
    job_expired: "This job's credit reservation expired. Start the job again.",
    job_not_active: "This job is already finished.",
    not_authenticated: "Please sign in again.",
    account_disabled: "This account is disabled. Contact us to reactivate it."
};

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createCreditsClient({ url, anonKey, auth, fetchImpl = globalThis.fetch, retries = 4, backoffMs = 500, newKey = () => secureUuid() }) {
    async function request(method, path, body) {
        let attempt = 0;
        let refreshed = false;
        for (;;) {
            const token = await auth.getAccessToken({ forceRefresh: refreshed });
            let res;
            try {
                res = await fetchImpl(`${url}/rest/v1${path}`, {
                    method,
                    headers: { apikey: anonKey, Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
                    body: body === undefined ? undefined : JSON.stringify(body)
                });
            } catch (e) {
                if (attempt++ < retries) {
                    await sleep(backoffMs * 2 ** (attempt - 1));
                    continue;
                }
                throw new CreditsError("network", "Can't reach the Elzoz server.");
            }
            if (res.status === 401 && !refreshed) {
                refreshed = true;
                continue;
            }
            if (RETRYABLE_STATUS.has(res.status) && attempt++ < retries) {
                await sleep(backoffMs * 2 ** (attempt - 1));
                continue;
            }
            const text = await res.text();
            const data = text ? JSON.parse(text) : null;
            if (!res.ok) {
                const code = (data && data.message) || `http_${res.status}`;
                let details = data && data.details;
                try {
                    details = details ? JSON.parse(details) : details;
                } catch (e) {
                    /* plain text */
                }
                throw new CreditsError(code, USER_MESSAGES[code] || `Server error: ${code}`, details);
            }
            return data;
        }
    }

    // One idempotency key per logical operation, reused by every retry above.
    const rpc = (fn, args) => request("POST", `/rpc/${fn}`, { ...args, p_idempotency_key: newKey() });

    return {
        /** Balance with expired credits already removed, plus each pack's expiry (soonest first). */
        async getAccount() {
            const a = await request("POST", "/rpc/my_credits", {});
            if (!a) return null;
            const lots = (a.lots || []).map((l) => ({ remaining: Number(l.remaining), expiresAt: l.expires_at }));
            return { balance: Number(a.balance), reserved: Number(a.reserved), available: Number(a.available), disabled: !!a.disabled, lots, nextExpiry: lots[0] || null };
        },
        async getPricing() {
            const rows = await request("GET", "/pricing_rules?select=unit,price,hd_long_edge,hd_multiplier");
            return Object.fromEntries((rows || []).map((r) => [r.unit, r]));
        },
        async getLedger(limit = 50) {
            return request("GET", `/credit_ledger?select=id,kind,amount,balance_after,job_id,item_key,note,created_at&order=created_at.desc&limit=${Number(limit)}`);
        },
        async getJobs(limit = 20) {
            return request("GET", `/jobs?select=id,kind,status,planned_items,reserved_total,charged_total,created_at,finished_at&order=created_at.desc&limit=${Number(limit)}`);
        },
        startJob: ({ kind, items, clientInfo = {} }) => rpc("start_job", { p_kind: kind, p_items: items, p_client_info: clientInfo }),
        reportItem: ({ jobId, itemKey, status, evidence }) => rpc("report_item", { p_job_id: jobId, p_item_key: itemKey, p_status: status, p_evidence: evidence || null }),
        finishJob: ({ jobId, status }) => rpc("finish_job", { p_job_id: jobId, p_status: status })
    };
}

/** Adapter used by the job runners (src/engine/*). */
export function createBilling(credits, { clientInfo = {} } = {}) {
    return {
        async startJob({ kind, itemKeys, items }) {
            const payload = items || itemKeys.map((key) => ({ key }));
            const r = await credits.startJob({ kind, items: payload, clientInfo });
            return { jobId: r.job_id, reserved: r.reserved, availableAfter: r.available_after };
        },
        async reportItem({ jobId, itemKey, status, evidence }) {
            const serverStatus = status === "succeeded" ? "succeeded" : "failed";
            return credits.reportItem({ jobId, itemKey, status: serverStatus, evidence });
        },
        async finishJob({ jobId, status }) {
            return credits.finishJob({ jobId, status });
        }
    };
}
