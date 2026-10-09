import pg from "pg";
import { randomUUID } from "node:crypto";

export const DB_URL = process.env.ELZOZ_TEST_DATABASE_URL;

export async function connect() {
    const client = new pg.Client({ connectionString: DB_URL });
    await client.connect();
    return client;
}

/** Run one statement the way PostgREST would for a signed-in user. */
export async function asUser(client, userId, sql, params = []) {
    return asRole(client, "authenticated", { sub: userId, role: "authenticated" }, sql, params);
}

export async function asAnon(client, sql, params = []) {
    return asRole(client, "anon", { role: "anon" }, sql, params);
}

export async function asService(client, sql, params = []) {
    return asRole(client, "service_role", { role: "service_role" }, sql, params);
}

async function asRole(client, role, claims, sql, params) {
    await client.query("begin");
    try {
        await client.query(`set local role ${role}`);
        await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
        const res = await client.query(sql, params);
        await client.query("commit");
        return res;
    } catch (e) {
        await client.query("rollback");
        throw e;
    }
}

export async function createUser(client, { balance = 0 } = {}) {
    const id = randomUUID();
    await client.query("insert into auth.users (id, email) values ($1, $2)", [id, `${id}@test.local`]);
    if (balance) {
        await asService(client, "select public.grant_credits($1, $2, 'grant', null, 'test-setup')", [id, balance]);
    }
    return id;
}

export const key = () => `k-${randomUUID()}`;

export async function account(client, userId) {
    const { rows } = await client.query("select balance, reserved from public.credit_accounts where user_id = $1", [userId]);
    return rows[0] && { balance: Number(rows[0].balance), reserved: Number(rows[0].reserved) };
}

export async function rpc(client, userId, fn, args) {
    const placeholders = args.map((_, i) => `$${i + 1}`).join(", ");
    const { rows } = await asUser(client, userId, `select public.${fn}(${placeholders}) as r`, args);
    return rows[0].r;
}

export const designItems = (n) => JSON.stringify(Array.from({ length: n }, (_, i) => ({ key: `row-${i + 2}` })));
