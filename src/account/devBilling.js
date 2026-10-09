// Development-only billing: lets the engine run in Photoshop before a Supabase
// project exists. It charges nothing. It is referenced only behind
// `if (__ELZOZ_DEV__)`, so production builds drop it (checked by
// scripts/check-prod-bundle.js).
export const DEV_BILLING_MARKER = "elzoz-dev-billing";

export function createDevBilling() {
    let n = 0;
    return {
        marker: DEV_BILLING_MARKER,
        async startJob() {
            n += 1;
            return { jobId: `dev-${n}` };
        },
        async reportItem() {
            return { charged: 0 };
        },
        async finishJob({ status }) {
            return { status, charged: 0, dev: true };
        }
    };
}
