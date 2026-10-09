import crypto from "node:crypto";
import pg from "pg";

export const env = {
    db: process.env.ELZOZ_TEST_DATABASE_URL,
    rest: process.env.ELZOZ_TEST_POSTGREST_URL,
    secret: process.env.ELZOZ_TEST_JWT_SECRET
};
export const hasBackend = !!(env.db && env.rest && env.secret);

const b64url = (buf) => Buffer.from(buf).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

/** HS256 JWT like Supabase Auth issues (signed with the test PostgREST secret). */
export function signJwt(claims, secret = env.secret, ttlSeconds = 3600) {
    const now = Math.floor(Date.now() / 1000);
    const head = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const body = b64url(JSON.stringify({ iat: now, exp: now + ttlSeconds, ...claims }));
    const sig = b64url(crypto.createHmac("sha256", secret).update(`${head}.${body}`).digest());
    return `${head}.${body}.${sig}`;
}

export async function admin() {
    const c = new pg.Client({ connectionString: env.db });
    await c.connect();
    return c;
}

export async function createUser(c, credits = 0) {
    const id = crypto.randomUUID();
    await c.query("insert into auth.users (id, email) values ($1, $2)", [id, `${id}@e2e.test`]);
    if (credits) {
        await c.query("begin");
        await c.query("set local role service_role");
        await c.query("select public.grant_credits($1, $2, 'grant', null, 'e2e-setup')", [id, credits]);
        await c.query("commit");
    }
    return id;
}

/** Auth client stand-in: issues a user JWT (the real Supabase Auth flow is tested separately with mocked HTTP). */
export const tokenAuth = (userId) => ({
    async getAccessToken() {
        return signJwt({ sub: userId, role: "authenticated", aud: "authenticated" });
    }
});

export const anonKey = () => signJwt({ role: "anon" }, env.secret, 3600 * 24);
