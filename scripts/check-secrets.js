// Fails if a built bundle or the source tree contains a privileged Supabase key
// or other obvious secrets. Run after `npm run build:prod` and in CI.
const fs = require("fs");
const path = require("path");

const roots = process.argv.slice(2).length ? process.argv.slice(2) : ["src", "dist", "plugin"];
const jwtPattern = /eyJ[A-Za-z0-9_-]{10,}\.([A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}/g;
const otherPatterns = [
    { name: "Stripe secret key", re: /sk_(live|test)_[A-Za-z0-9]{10,}/ },
    { name: "Supabase service role reference", re: /SUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*['"][^'"]+['"]/ }
];

function* walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) yield* walk(full);
        else if (/\.(js|jsx|json|html|css|map)$/.test(entry.name)) yield full;
    }
}

const problems = [];
for (const root of roots) {
    for (const file of walk(root)) {
        const text = fs.readFileSync(file, "utf8");
        for (const m of text.matchAll(jwtPattern)) {
            let role = "unknown";
            try {
                role = JSON.parse(Buffer.from(m[1], "base64").toString("utf8")).role || "unknown";
            } catch (e) { /* not a JWT */ }
            if (role !== "anon") problems.push(`${file}: JWT with role "${role}"`);
        }
        for (const p of otherPatterns) if (p.re.test(text)) problems.push(`${file}: ${p.name}`);
    }
}

// Production builds must not contain the development billing stub.
const manifestPath = path.join("dist", "manifest.json");
if (fs.existsSync(manifestPath) && fs.existsSync(path.join("dist", "index.js"))) {
    const isProd = JSON.parse(fs.readFileSync(manifestPath, "utf8")).requiredPermissions.allowCodeGenerationFromStrings === false;
    const bundle = fs.readFileSync(path.join("dist", "index.js"), "utf8");
    if (isProd && bundle.includes("elzoz-dev-billing")) problems.push("dist/index.js: development billing stub present in a production build");
    if (isProd && bundle.includes("elzoz-dev-selftest")) problems.push("dist/index.js: developer self-test present in a production build");
}

if (problems.length) {
    console.error("Secret check FAILED:\n" + problems.join("\n"));
    process.exit(1);
}
console.log(`Secret check passed (${roots.join(", ")}).`);
