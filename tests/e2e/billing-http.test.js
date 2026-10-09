// End-to-end billing: real engine (simulated Photoshop host) + real credits
// client over HTTP + real PostgREST + real PostgreSQL with the migrations.
// Requires `bash scripts/test-env.sh start` and `source /tmp/elzoz-test/env`.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, anonKey, createUser, env, hasBackend, signJwt, tokenAuth } from "./helpers.js";
import { createBilling, createCreditsClient } from "../../src/account/credits.js";
import { createFakeHost, FakeFolder } from "../fakes/fakePhotoshop.js";
import { createPhotoshopPort } from "../../src/ps/port.js";
import { runDesignJob, ITEM } from "../../src/engine/designJob.js";
import { runPreflight } from "../../src/domain/preflight.js";
import { createMapping, setImageMapping, setTextMapping } from "../../src/domain/mapping.js";
import { buildFolderIndex } from "../../src/domain/imageFiles.js";
import { subsetPlan } from "../../src/app/state.js";

const d = hasBackend ? describe : describe.skip;

const TEMPLATE = "/sim/card.psd";
const spec = {
    title: "card.psd",
    layers: [
        { name: "Name", kind: "text", text: "Product" },
        { name: "Photo", kind: "smartObject", bounds: { left: 100, top: 100, right: 500, bottom: 400 } }
    ]
};

async function plannedJob(rows) {
    const host = createFakeHost({ templates: { [TEMPLATE]: spec } });
    const port = createPhotoshopPort(host);
    const template = { entry: { nativePath: TEMPLATE } };
    const { layers } = await port.inspectTemplate(template);
    const id = (n) => layers.find((l) => l.name === n).id;
    const images = new FakeFolder("img", { "a.jpg": { image: { width: 400, height: 300 } }, "b.jpg": { image: { width: 400, height: 300 } }, "broken.jpg": { image: { width: 1, height: 1 } } });
    let mapping = setTextMapping(createMapping(), id("Name"), "Name");
    mapping = setImageMapping(mapping, id("Photo"), { column: "Photo", folderKey: "i" });
    const out = new FakeFolder("out");
    const plan = runPreflight({
        table: { headers: [{ key: "Name", label: "Name" }, { key: "Photo", label: "Photo" }], issues: [], rows: rows.map((values, index) => ({ index, sourceRow: index + 2, values, isEmpty: false })) },
        layers,
        mapping,
        folders: { i: { name: "img", index: buildFolderIndex([...images.files.keys()]) } },
        output: { name: "out", existingFileNames: [] },
        formats: ["jpg", "psd"],
        namePattern: "{row}_{Name}",
        pricing: { unitPrice: 1 },
        balance: null
    });
    const run = (p, billing) => runDesignJob({ port, billing, template, templateLayers: layers, plan: p, folders: { i: { name: "img", entry: images } }, output: { entry: out } });
    return { host, plan, run, out };
}

d("billing over HTTP (PostgREST + PostgreSQL)", () => {
    let c;
    beforeAll(async () => {
        c = await admin();
    });
    afterAll(async () => c?.end());

    const clientFor = (userId, fetchImpl) => createCreditsClient({ url: env.rest.replace(/\/$/, "").replace(/\/rest\/v1$/, ""), anonKey: anonKey(), auth: tokenAuth(userId), fetchImpl: fetchImpl || ((u, init) => fetch(u.replace("/rest/v1", ""), init)), backoffMs: 5 });
    const ledger = async (userId) => (await c.query("select kind, amount::int, item_key from public.credit_ledger where user_id = $1 order by id", [userId])).rows;
    const balance = async (userId) => (await c.query("select balance::int, reserved::int from public.credit_accounts where user_id = $1", [userId])).rows[0];

    it("anonymous and forged requests are rejected by the real HTTP layer", async () => {
        const u = await createUser(c, 5);
        const patch = await fetch(`${env.rest}/credit_accounts?user_id=eq.${u}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ balance: 999999 }) });
        expect([401, 403]).toContain(patch.status);
        const forged = signJwt({ sub: u, role: "authenticated" }, "not-the-server-secret-xxxxxxxxxxxxxxxxxx");
        const res = await fetch(`${env.rest}/credit_accounts`, { headers: { Authorization: `Bearer ${forged}` } });
        expect(res.status).toBe(401);
        // Even a valid user token cannot write balances directly.
        const own = signJwt({ sub: u, role: "authenticated" });
        const w = await fetch(`${env.rest}/credit_accounts?user_id=eq.${u}`, { method: "PATCH", headers: { Authorization: `Bearer ${own}`, "Content-Type": "application/json" }, body: JSON.stringify({ balance: 999999 }) });
        expect([401, 403]).toContain(w.status);
        expect(await balance(u)).toEqual({ balance: 5, reserved: 0 });
    });

    it("Scenario D: a failed row is not charged; retrying it charges exactly that row", async () => {
        const u = await createUser(c, 10);
        const credits = clientFor(u);
        const job = await plannedJob([
            { Name: "Alpha", Photo: "a.jpg" },
            { Name: "Broken", Photo: "broken.jpg" },
            { Name: "Gamma", Photo: "b.jpg" }
        ]);
        job.host.env.failReplace.add("broken.jpg"); // Photoshop rejects this file at run time
        const first = await job.run(job.plan, createBilling(credits));
        expect(first.items.map((i) => i.status)).toEqual([ITEM.succeeded, ITEM.failed, ITEM.succeeded]);
        expect(first.billing).toMatchObject({ status: "completed_with_errors", charged: 2 });
        expect(await balance(u)).toEqual({ balance: 8, reserved: 0 });

        job.host.env.failReplace.delete("broken.jpg"); // user fixes the file
        const retry = await job.run(subsetPlan(job.plan, ["row-3"]), createBilling(credits));
        expect(retry.items.map((i) => i.status)).toEqual([ITEM.succeeded]);
        expect(await balance(u)).toEqual({ balance: 7, reserved: 0 });
        expect(await ledger(u)).toEqual([
            { kind: "grant", amount: 10, item_key: null },
            { kind: "charge", amount: -1, item_key: "row-2" },
            { kind: "charge", amount: -1, item_key: "row-4" },
            { kind: "charge", amount: -1, item_key: "row-3" }
        ]);
        expect([...job.out.files.keys()].sort()).toEqual(["1_Alpha.jpg", "1_Alpha.psd", "2_Broken.jpg", "2_Broken.psd", "3_Gamma.jpg", "3_Gamma.psd"]);
    });

    it("a response lost after the server committed is retried without a double charge", async () => {
        const u = await createUser(c, 10);
        let dropped = 0;
        const flaky = async (url, init) => {
            const res = await fetch(url.replace("/rest/v1", ""), init);
            if (url.includes("/rpc/report_item") && dropped === 0) {
                dropped++;
                throw new Error("connection reset after server processed the request");
            }
            return res;
        };
        const job = await plannedJob([{ Name: "Alpha", Photo: "a.jpg" }]);
        const r = await job.run(job.plan, createBilling(clientFor(u, flaky)));
        expect(dropped).toBe(1);
        // The retry must be answered from the idempotency record, so the job completes normally.
        expect(r).toMatchObject({ status: "completed", fatal: null });
        expect(r.items[0].status).toBe(ITEM.succeeded);
        expect(await balance(u)).toEqual({ balance: 9, reserved: 0 });
        expect((await ledger(u)).filter((l) => l.kind === "charge")).toHaveLength(1);
    });

    it("insufficient credits stop the job before anything is rendered", async () => {
        const u = await createUser(c, 1);
        const job = await plannedJob([
            { Name: "A", Photo: "a.jpg" },
            { Name: "B", Photo: "b.jpg" }
        ]);
        const r = await job.run(job.plan, createBilling(clientFor(u)));
        expect(r).toMatchObject({ status: "failed", fatal: { step: "billing", message: "Not enough credits for this job." } });
        expect(job.out.files.size).toBe(0);
        expect(job.host.env.calls.some((x) => x.op === "duplicate")).toBe(false);
        expect(await balance(u)).toEqual({ balance: 1, reserved: 0 });
    });

    it("concurrent jobs over HTTP can't spend the same credits", async () => {
        const u = await createUser(c, 3);
        const credits = clientFor(u);
        const items = [{ key: "a" }, { key: "b" }];
        const results = await Promise.allSettled([credits.startJob({ kind: "design", items }), credits.startJob({ kind: "design", items })]);
        expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
        expect(results.find((x) => x.status === "rejected").reason.code).toBe("insufficient_credits");
    });

    it("another user's job can't be reported or read through the API", async () => {
        const a = await createUser(c, 5);
        const b = await createUser(c, 5);
        const job = await clientFor(a).startJob({ kind: "design", items: [{ key: "x" }] });
        await expect(clientFor(b).reportItem({ jobId: job.job_id, itemKey: "x", status: "succeeded" })).rejects.toMatchObject({ code: "job_not_found" });
        expect(await clientFor(b).getJobs()).toEqual([]);
        expect(await clientFor(b).getAccount()).toMatchObject({ balance: 5 });
    });
});
