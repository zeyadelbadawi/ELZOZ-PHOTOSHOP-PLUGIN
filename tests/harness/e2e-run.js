// End-to-end scenarios A–E in Chromium against the SIMULATED Photoshop host
// and the REAL local credits backend. Produces screenshots, recordings,
// generated outputs and a JSON report under test-artifacts/.
//
//   npm run test-env start && npm run test:ui-e2e
//
// What this proves: the UI, engine, preflight, naming, output writing and
// server-side credits work together on realistic files. What it does NOT
// prove: anything about Adobe Photoshop or UXP rendering (see the banner on
// every screenshot and docs/PLAN.md §7 for the real-Photoshop checklist).
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "../..");
const ART = path.join(ROOT, "test-artifacts");
const SHOTS = path.join(ART, "screenshots");
const RECS = path.join(ART, "recordings");
const OUTS = path.join(ART, "outputs/e2e");
const REPORTS = path.join(ART, "reports");
const PORT = Number(process.env.ELZOZ_E2E_PORT || 54340);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const RUN = Date.now().toString(36);
const ONLY = (process.env.ELZOZ_E2E_ONLY || "").split(",").filter(Boolean);

const SECRET = process.env.ELZOZ_TEST_JWT_SECRET;
if (!SECRET) {
    console.error("Run `npm run test-env start` and `source /tmp/elzoz-test/env` first.");
    process.exit(2);
}
const b64url = (buf) => Buffer.from(buf).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
const now = Math.floor(Date.now() / 1000);
const head = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
const body = b64url(JSON.stringify({ role: "anon", iat: now, exp: now + 86400 }));
const ANON = `${head}.${body}.${b64url(crypto.createHmac("sha256", SECRET).update(`${head}.${body}`).digest())}`;

for (const d of [SHOTS, RECS, OUTS, REPORTS]) fs.mkdirSync(d, { recursive: true });

// ---------- build + server ----------
console.log("building e2e harness…");
execFileSync("npx", ["webpack", "--config", "tests/harness/webpack.e2e.js"], { cwd: ROOT, env: { ...process.env, ELZOZ_E2E_ANON_KEY: ANON, ELZOZ_E2E_ORIGIN: ORIGIN }, stdio: "ignore" });
console.log("building admin dashboard…");
execFileSync("npx", ["vite", "build", "--logLevel", "error"], {
    cwd: path.join(ROOT, "admin"),
    env: { ...process.env, VITE_SUPABASE_URL: ORIGIN, VITE_SUPABASE_ANON_KEY: ANON, ELZOZ_ADMIN_BASE: "/admin/", ELZOZ_ADMIN_OUT: "dist-e2e" },
    stdio: "ignore"
});
process.env.ELZOZ_E2E_PORT = String(PORT);
const { server } = require("./e2e-server.js");

// ---------- reporting ----------
const report = { generated: new Date().toISOString(), host: "SIMULATED Photoshop host in Chromium (not Adobe Photoshop, not UXP)", backend: "REAL local Postgres + PostgREST with the Elzoz migrations; Auth is a local stub", scenarios: [], screenshots: [], recordings: [], errors: [], expectedErrors: [], layout: [] };
let current = null;
const check = (name, ok, detail) => {
    current.checks.push({ name, ok: !!ok, detail: detail === undefined ? null : detail });
    console.log(`  ${ok ? "✓" : "✗"} ${name}${detail !== undefined ? ` — ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
};
const api = async (p, init) => (await fetch(ORIGIN + p, init)).json();
const post = (p, data) => {
    if (p === "/__e2e/fault") current.faultsInjected = true;
    return api(p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
};
const account = (email) => api(`/__e2e/account?email=${encodeURIComponent(email)}`);

// ---------- browser helpers ----------
let browser;
async function open({ width = 320, height = 720, theme = "dark", lang = "en", ps, record } = {}) {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, ...(record ? { recordVideo: { dir: path.join(RECS, ".raw"), size: { width, height } } } : {}) });
    const page = await ctx.newPage();
    if (current) current.page = page; // for the failure screenshot
    page.on("pageerror", (e) => report.errors.push({ scenario: current && current.id, width, kind: "pageerror", message: e.message }));
    page.on("console", (m) => {
        if (m.type() !== "error") return;
        const entry = { scenario: current && current.id, width, kind: "console", message: m.text() };
        // Network errors from faults this run injected on purpose (scenario D) are expected, not defects.
        if (current && current.faultsInjected && /Failed to load resource|net::ERR_/.test(entry.message)) report.expectedErrors.push(entry);
        else report.errors.push(entry);
    });
    await page.addInitScript((l) => localStorage.setItem("elzoz.lang", l), lang);
    const q = new URLSearchParams({ theme, ...(ps ? { ps } : {}) });
    await page.goto(`${ORIGIN}/?${q}`);
    await page.waitForSelector(".ez-content");
    page.meta = { width, height, theme, lang };
    page.ctx = ctx;
    return page;
}

async function shot(page, id, title, { scroll = 0, full = false } = {}) {
    if (scroll !== null) await page.evaluate((y) => { const c = document.querySelector(".ez-content"); if (c) c.scrollTo(0, y); }, scroll);
    await page.waitForTimeout(120);
    const file = `${id}.png`;
    await page.screenshot({ path: path.join(SHOTS, file), fullPage: full });
    const layout = await layoutProblems(page);
    report.screenshots.push({ file, title, scenario: current.id, ...page.meta, layoutProblems: layout });
    if (layout.length) report.layout.push({ file, problems: layout });
}

/** Elements that stick out of the panel horizontally or text that overflows its box unclipped. */
function layoutProblems(page) {
    return page.evaluate(() => {
        const W = document.documentElement.clientWidth;
        const out = [];
        if (document.documentElement.scrollWidth > W + 1) out.push(`page scrolls horizontally (${document.documentElement.scrollWidth} > ${W})`);
        for (const el of document.querySelectorAll("#root *")) {
            const r = el.getBoundingClientRect();
            if (!r.width || !r.height) continue;
            const st = getComputedStyle(el);
            if (st.visibility === "hidden" || st.display === "none") continue;
            let clipped = false;
            for (let p = el.parentElement; p && p.id !== "root"; p = p.parentElement) {
                const ps = getComputedStyle(p);
                if (ps.overflowX !== "visible" || ps.overflow === "hidden") {
                    const pr = p.getBoundingClientRect();
                    if (r.right > pr.right + 1 || r.left < pr.left - 1) clipped = true;
                    break;
                }
            }
            if (!clipped && (r.right > W + 1 || r.left < -1)) out.push(`${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]} "${(el.textContent || "").trim().slice(0, 30)}" spans ${Math.round(r.left)}..${Math.round(r.right)} of ${W}`);
        }
        return [...new Set(out)].slice(0, 10);
    });
}

const btn = (page, text) => page.locator(`sp-button:has-text("${text}")`).first();
/** The input of the form field with this label (robust to fields being added or reordered). */
const field = (page, label) => page.locator(".ez-field", { has: page.locator(".ez-label", { hasText: label }) }).locator("input").first();
async function click(page, text) {
    await btn(page, text).click();
    await page.waitForTimeout(150);
}
const queue = (page, ...items) => page.evaluate((it) => window.__harness.queue(...it), items);
const layerRow = (page, name) => page.locator(".ez-layer", { has: page.locator(".ez-layer-name > div:first-child", { hasText: new RegExp(`^${name}$`) }) }).first();
async function pickLayerFolder(page, layer, folder) {
    await queue(page, { folder });
    await layerRow(page, layer).locator('sp-button:has-text("Choose folder"), sp-button:has-text("اختيار مجلد")').first().click();
    await page.waitForTimeout(400);
}
async function signIn(page, email, password = "correct horse") {
    await page.locator("input[type=text]").first().fill(email);
    await page.locator("input[type=password]").fill(password);
    await click(page, page.meta.lang === "ar" ? "دخول" : "Sign in");
    await page.waitForSelector(".ez-stepper");
    await page.waitForTimeout(300);
}
async function setupDesign(page, { sheet, template = "templates/product-card-1080x1350.psd", folders = { Photo: "images/products", Logo: "images/logos" }, shots = null }) {
    await queue(page, { file: `spreadsheets/${sheet}` });
    await click(page, "Choose file");
    if (shots) await shot(page, ...shots.data);
    await click(page, "Next");
    await queue(page, { file: template });
    await click(page, "Choose PSD");
    await page.waitForSelector(".ez-stats, .ez-alert", { timeout: 10000 });
    if (shots) await shot(page, ...shots.template);
    await click(page, "Next");
    if (shots) await shot(page, ...shots.mapEmpty);
    await click(page, "Auto-map by name");
    for (const [layer, dir] of Object.entries(folders)) await pickLayerFolder(page, layer, dir);
}
async function chooseOutput(page, name) {
    await queue(page, { output: name });
    await page.locator('.ez-content sp-button:has-text("Choose folder")').first().click();
    await page.waitForTimeout(250);
}
async function waitForResults(page, timeout = 180000) {
    await page.waitForFunction(() => !!document.querySelector(".ez-result"), null, { timeout });
    await page.waitForTimeout(400);
}
async function saveOutputs(page, outName, dir) {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    const names = await page.evaluate((o) => window.__harness.outputNames(o), outName);
    for (const n of names) {
        fs.mkdirSync(path.dirname(path.join(dir, n)), { recursive: true });
        fs.writeFileSync(path.join(dir, n), Buffer.from(await page.evaluate(([o, f]) => window.__harness.outputBase64(o, f), [outName, n]), "base64"));
    }
    return names;
}
async function finishRecording(page, name, title) {
    const video = page.video();
    await page.ctx.close();
    if (!video) return;
    const raw = await video.path();
    const mp4 = path.join(RECS, `${name}.mp4`);
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", raw, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast", "-crf", "26", "-movflags", "+faststart", mp4]);
    const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", mp4]).toString());
    const decoded = (() => {
        try {
            execFileSync("ffmpeg", ["-v", "error", "-i", mp4, "-f", "null", "-"]);
            return true;
        } catch (e) {
            return false;
        }
    })();
    const v = probe.streams.find((s) => s.codec_type === "video");
    const rec = { file: `${name}.mp4`, title, codec: v.codec_name, width: v.width, height: v.height, durationSec: Number(probe.format.duration), bytes: Number(probe.format.size), decodesCleanly: decoded, label: "SIMULATION — simulated Photoshop host in Chromium" };
    report.recordings.push(rec);
    check(`recording ${rec.file} plays (ffprobe + full decode)`, decoded && rec.durationSec > 1, `${rec.codec} ${rec.width}x${rec.height} ${rec.durationSec.toFixed(1)} s`);
}

// ---------- independent verification ----------
function psdSummary(dir) {
    const script = "import json,sys,os\nfrom psd_tools import PSDImage\nout={}\nfor n in sorted(os.listdir(sys.argv[1])):\n  if not n.endswith('.psd'): continue\n  p=PSDImage.open(os.path.join(sys.argv[1],n))\n  out[n]={'size':list(p.size),'layers':{l.name+('@'+l.parent.name if l.parent is not None and l.parent.name else ''):(l.text if l.kind=='type' else (l.smart_object.filename if l.kind=='smartobject' else l.kind)) for l in p.descendants()}}\nprint(json.dumps(out,ensure_ascii=False))";
    return JSON.parse(execFileSync("python3", ["-c", script, dir]).toString());
}
function imageSummary(dir) {
    const script = "import json,sys,os\nfrom PIL import Image\nout={}\nfor n in sorted(os.listdir(sys.argv[1])):\n  if n.split('.')[-1].lower() not in ('jpg','png'): continue\n  try:\n    im=Image.open(os.path.join(sys.argv[1],n)); im.load(); out[n]=[im.format]+list(im.size)\n  except Exception as e: out[n]=str(e)\nprint(json.dumps(out,ensure_ascii=False))";
    return JSON.parse(execFileSync("python3", ["-c", script, dir]).toString());
}
function movSummary(file) {
    const p = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-count_frames", "-print_format", "json", "-show_format", "-show_streams", file]).toString());
    const v = p.streams.find((s) => s.codec_type === "video");
    return { container: p.format.format_name, codec: v.codec_name, width: v.width, height: v.height, fps: v.r_frame_rate, frames: Number(v.nb_read_frames), durationSec: Number(p.format.duration) };
}

// ---------- scenarios ----------
const scenarios = [];
const scenario = (id, title, fn) => scenarios.push({ id, title, fn });

scenario("A", "Successful design batch (8 rows, JPG + PSD, real credits)", async () => {
    const email = `scenario-a-${RUN}@e2e.test`;
    await post("/__e2e/users", { email, password: "correct horse", credits: 100 });
    const p = await open({ width: 320, record: true });
    await shot(p, "A01-signin-320-dark", "Sign in (configured build)");
    await signIn(p, email);
    await shot(p, "A02-data-empty-320-dark", "Data step, empty state");
    await setupDesign(p, {
        sheet: "products-valid.xlsx",
        shots: {
            data: ["A03-data-loaded-320-dark", "Spreadsheet loaded with preview (incl. Arabic row)"],
            template: ["A04-template-320-dark", "Template inspected: size, layer counts, duplicate-name notice"],
            mapEmpty: ["A05-map-empty-320-dark", "Map before auto-map"]
        }
    });
    await shot(p, "A06-map-mapped-320-dark", "Map after auto-map and folder choice");
    await shot(p, "A07-map-images-320-dark", "Map: image layer options", { scroll: 900 });
    await click(p, "Next");
    await shot(p, "A08-check-no-output-320-dark", "Check: output folder missing (blocking)");
    await chooseOutput(p, "Elzoz output A");
    await p.locator('label:has-text("PSD") input').check();
    await field(p, "File names").fill("{row}_{Name}");
    await shot(p, "A09-check-ready-320-dark", "Check: ready, warnings and settings");
    await shot(p, "A10-check-summary-320-dark", "Check: summary with credits needed and available", { scroll: 2000 });
    await click(p, "Next");
    await shot(p, "A11-generate-320-dark", "Generate: start button shows the real price");
    await btn(p, "Generate 8").click();
    await p.waitForTimeout(250);
    await shot(p, "A12-generate-running-320-dark", "Generate: progress while running");
    await waitForResults(p);
    await shot(p, "A13-results-320-dark", "Results: all done, credits charged by the server");
    const names = await saveOutputs(p, "Elzoz output A", path.join(OUTS, "scenario-a"));
    check("16 files written (8 JPG + 8 PSD)", names.length === 16, names.length);
    const imgs = imageSummary(path.join(OUTS, "scenario-a"));
    check("every JPG decodes (Pillow) at 1080x1350", Object.values(imgs).length === 8 && Object.values(imgs).every((v) => Array.isArray(v) && v[1] === 1080 && v[2] === 1350), imgs);
    const psds = psdSummary(path.join(OUTS, "scenario-a"));
    check("PSD row 1: text and Smart Objects carry row data (psd-tools)", psds["1_Aurora Laptop 14.psd"] && psds["1_Aurora Laptop 14.psd"].layers["Name@Text"] === "Aurora Laptop 14" && psds["1_Aurora Laptop 14.psd"].layers["Photo@Media"] === "laptop.jpg" && psds["1_Aurora Laptop 14.psd"].layers["Logo@Media"] === "elzoz-logo.png", psds["1_Aurora Laptop 14.psd"]);
    check("PSD row 7 (Arabic) text intact", psds["7_سماعة لاسلكية.psd"] && psds["7_سماعة لاسلكية.psd"].layers["Name@Text"] === "سماعة لاسلكية");
    const acct = await account(email);
    check("server balance 100 → 92 (8 charged)", Number(acct.balance.balance) === 92 && Number(acct.balance.reserved) === 0, acct.balance);
    check("ledger: one grant + 8 charges", acct.ledger.filter((l) => l.kind === "charge").length === 8);
    check("job completed on the server", acct.jobs.length === 1 && acct.jobs[0].status === "completed", acct.jobs);
    const chip = await p.locator(".ez-chip").textContent();
    check("header chip shows the server balance", /92/.test(chip), chip);
    await p.locator(".ez-chip").click();
    await p.waitForTimeout(500);
    await shot(p, "A14-account-320-dark", "Account: server balance, ledger, recent jobs");
    await finishRecording(p, "SIMULATED-scenario-A-design-batch", "Scenario A: design batch (simulated host, real credits)");
});

scenario("B", "Missing asset found in Check, fixed before spending; corrupt file fails, retried", async () => {
    const email = `scenario-b-${RUN}@e2e.test`;
    await post("/__e2e/users", { email, password: "correct horse", credits: 50 });
    const p = await open({ width: 320, record: true });
    await signIn(p, email);
    await setupDesign(p, { sheet: "products-recovery.xlsx" });
    await click(p, "Next");
    await chooseOutput(p, "Elzoz output B");
    await shot(p, "B01-check-missing-image-320-dark", "Check: missing image warning with Fix", { scroll: 600 });
    const warn = await p.locator(".ez-alert-warning").filter({ hasText: "Image not found" }).first().textContent();
    check("preflight names the missing image row before any spend", /Rows 4/.test(warn), warn);
    // The user copies the missing file into the folder, then uses Fix -> Map -> Choose folder again.
    await p.evaluate(() => window.__harness.putFile("images/products", "speaker-missing.jpg", "images/products/camera.jpeg"));
    await p.locator(".ez-alert-warning").filter({ hasText: "Image not found" }).locator('sp-button:has-text("Fix")').click();
    await p.waitForTimeout(200);
    await pickLayerFolder(p, "Photo", "images/products");
    await shot(p, "B02-map-folder-refreshed-320-dark", "Map after re-choosing the image folder", { scroll: 900 });
    await click(p, "Next");
    const stillMissing = await p.locator(".ez-alert-warning").filter({ hasText: "Image not found" }).count();
    check("warning gone after the file was added", stillMissing === 0);
    await shot(p, "B03-check-fixed-320-dark", "Check: all 4 rows ready", { scroll: 2000 });
    await click(p, "Next");
    await btn(p, "Generate 4").click();
    await waitForResults(p);
    await shot(p, "B04-results-partial-320-dark", "Results: corrupt image failed, not charged");
    let acct = await account(email);
    check("3 of 4 charged; failed row not charged", acct.ledger.filter((l) => l.kind === "charge").length === 3 && Number(acct.balance.balance) === 47, acct.balance);
    check("failed row recorded as failed on the server", acct.items.some((i) => i.item_key === "row-5" && i.status === "failed"));
    // Fix the corrupt file and retry the failed row only.
    await p.evaluate(() => window.__harness.putFile("images/products", "broken.jpg", "images/products/mug.jpg"));
    await click(p, "Retry failed rows");
    await waitForResults(p);
    await shot(p, "B05-retry-success-320-dark", "Results after retrying only the failed row");
    acct = await account(email);
    check("retry charged exactly 1 more (total 4)", acct.ledger.filter((l) => l.kind === "charge").length === 4 && Number(acct.balance.balance) === 46, acct.balance);
    const names = await saveOutputs(p, "Elzoz output B", path.join(OUTS, "scenario-b"));
    check("4 JPGs, no partial file for the failed attempt", names.filter((n) => n.endsWith(".jpg")).length === 4 && names.length === 4, names);
    await finishRecording(p, "SIMULATED-scenario-B-missing-asset-recovery", "Scenario B: missing and corrupt asset recovery (simulated host)");
});

scenario("C", "Video: 3 reels, 2 s @ 24 fps, real MOV files", async () => {
    const email = `scenario-c-${RUN}@e2e.test`;
    await post("/__e2e/users", { email, password: "correct horse", credits: 30 });
    const p = await open({ width: 320, record: true });
    await signIn(p, email);
    await p.locator(".ez-segment", { hasText: "Video" }).click();
    await p.waitForTimeout(150);
    await shot(p, "C01-video-mode-320-dark", "Video mode, data step");
    await setupDesign(p, { sheet: "products.csv", template: "templates/reel-1080x1920.psd" });
    await click(p, "Next");
    await shot(p, "C02-animate-320-dark", "Animate: format, fps, duration");
    const sel = p.locator(".ez-card select");
    await sel.nth(1).selectOption("24");
    await p.locator(".ez-card .ez-input").first().fill("2");
    const preset = async (layer, v) => {
        await layerRow(p, layer).locator(".ez-layer-picker select").selectOption(v);
        await p.waitForTimeout(100);
    };
    await preset("Name", "slideUp");
    await preset("Price", "fadeIn");
    await preset("Photo", "kenBurns");
    await shot(p, "C03-animate-tracks-320-dark", "Animate: tracks with timing and easing", { scroll: 500 });
    await p.evaluate(() => document.querySelector(".ez-content").scrollTo(0, 5000));
    const at = p.locator('.ez-content input[type=number]').last();
    await at.fill("1");
    await at.press("Tab");
    check("preview time set to 1 s", (await at.inputValue()) === "1", await at.inputValue());
    await click(p, "Preview frame");
    await p.waitForSelector(".ez-preview-img", { timeout: 30000 });
    await shot(p, "C04-animate-preview-320-dark", "Animate: frame preview of row 1 at 1.0 s (simulated render)", { scroll: 5000 });
    const previewPng = Buffer.from((await p.locator(".ez-preview-img").getAttribute("src")).split(",")[1], "base64");
    fs.writeFileSync(path.join(OUTS, "scenario-c-preview-row1-1s.jpg"), previewPng);
    await click(p, "Next");
    await chooseOutput(p, "Elzoz output C");
    await shot(p, "C05-video-check-320-dark", "Video check: frames, disk use, credits", { scroll: 2000 });
    await click(p, "Next");
    await btn(p, "Render 3").click();
    await p.waitForTimeout(1500);
    await shot(p, "C06-video-rendering-320-dark", "Video rendering progress (frame counter)");
    await waitForResults(p, 600000);
    await shot(p, "C07-video-results-320-dark", "Video results");
    const names = await saveOutputs(p, "Elzoz output C", path.join(OUTS, "scenario-c"));
    const movs = names.filter((n) => n.endsWith(".mov"));
    check("3 MOV files", movs.length === 3, names);
    for (const m of movs) {
        const s = movSummary(path.join(OUTS, "scenario-c", m));
        check(`${m}: ffprobe mjpeg 1080x1920, 48 frames, 24 fps, 2.0 s`, s.codec === "mjpeg" && s.width === 1080 && s.height === 1920 && s.frames === 48 && s.fps === "24/1" && Math.abs(s.durationSec - 2) < 0.01, s);
    }
    // Contact sheet of one video (frames at 0, 0.5, 1, 1.5 s) for visual inspection.
    const first = path.join(OUTS, "scenario-c", movs[0]);
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", first, "-vf", "fps=2,scale=270:-1,tile=4x1", "-frames:v", "1", path.join(SHOTS, "C08-video-frames-contact-sheet.png")]);
    report.screenshots.push({ file: "C08-video-frames-contact-sheet.png", title: "Frames 0/0.5/1/1.5 s decoded from the rendered MOV by ffmpeg", scenario: "C", width: null, theme: null, lang: null, layoutProblems: [] });
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", first, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", path.join(RECS, "SIMULATED-scenario-C-rendered-video-row1.mp4")]);
    const acct = await account(email);
    check("3 videos x 1 unit charged", acct.ledger.filter((l) => l.kind === "charge").length === 3 && Number(acct.balance.balance) === 27, acct.balance);
    await finishRecording(p, "SIMULATED-scenario-C-video", "Scenario C: video mode (simulated host, real MOV output, real credits)");
});

scenario("D", "Billing failures: lost response, server outage at start, insufficient credits", async () => {
    const email = `scenario-d-${RUN}@e2e.test`;
    await post("/__e2e/users", { email, password: "correct horse", credits: 10 });
    const p = await open({ width: 320 });
    await signIn(p, email);
    await setupDesign(p, { sheet: "products.csv" });
    await click(p, "Next");
    await chooseOutput(p, "Elzoz output D");
    await click(p, "Next");

    // D1: the server records row-3's report but the response is lost; the client retries with the same key.
    await post("/__e2e/fault", { match: "report_item", mode: "drop-response", count: 1 });
    await btn(p, "Generate 3").click();
    await waitForResults(p);
    let acct = await account(email);
    check("D1 lost response: job completed, exactly 3 charged (no double charge)", acct.jobs[0].status === "completed" && acct.ledger.filter((l) => l.kind === "charge").length === 3 && Number(acct.balance.balance) === 7, { balance: acct.balance, job: acct.jobs[0].status });
    await shot(p, "D01-results-after-lost-response-320-dark", "D1: results after a lost billing response (retried safely)");

    // D2: the server is unavailable when the job starts (5 x 503 = first try + 4 retries).
    await click(p, "New job");
    await setupDesign(p, { sheet: "products.csv" });
    await click(p, "Next");
    await chooseOutput(p, "Elzoz output D2");
    await click(p, "Next");
    await post("/__e2e/fault", { match: "start_job", mode: "status", status: 503, count: 5 });
    await btn(p, "Generate 3").click();
    await waitForResults(p, 60000);
    await shot(p, "D02-billing-unavailable-320-dark", "D2: server unavailable at start, nothing rendered or charged");
    const names = await p.evaluate(() => window.__harness.outputNames("Elzoz output D2"));
    acct = await account(email);
    check("D2 nothing rendered and nothing charged while the server is down", names.length === 0 && Number(acct.balance.balance) === 7 && acct.jobs.length === 1, { files: names.length, balance: acct.balance });
    const again = await btn(p, "Try again").count();
    check("D2 results offer Try again (regression)", again === 1);
    await click(p, "Try again");
    await waitForResults(p);
    acct = await account(email);
    check("D2 Try again succeeds: 3 more charged", Number(acct.balance.balance) === 4 && acct.jobs.length === 2 && acct.jobs[1].status === "completed", acct.balance);
    await shot(p, "D03-try-again-success-320-dark", "D2: Try again after the outage");

    // D3: not enough credits for an 8-row job (4 available).
    await click(p, "New job");
    await setupDesign(p, { sheet: "products-valid.xlsx" });
    await click(p, "Next");
    await chooseOutput(p, "Elzoz output D3");
    await shot(p, "D04-insufficient-credits-320-dark", "D3: blocked before rendering: not enough credits", { scroll: 400 });
    const blocked = await p.locator(".ez-alert-error").filter({ hasText: "needs 8 credits; 4 available" }).count();
    check("D3 insufficient credits blocks the job with exact numbers", blocked === 1);
    const nextDisabled = await p.locator('.ez-actionbar sp-button[variant=cta]').getAttribute("disabled");
    check("D3 Next is disabled", nextDisabled !== null);
    await p.ctx.close();
});

scenario("E", "Responsive layout, themes, Arabic RTL, error and empty states", async () => {
    const email = `scenario-e-${RUN}@e2e.test`;
    await post("/__e2e/users", { email, password: "correct horse", credits: 500 });
    for (const width of [240, 260, 320, 400, 520]) {
        const p = await open({ width, height: 700 });
        await signIn(p, email);
        await setupDesign(p, { sheet: "products-valid.xlsx" });
        await shot(p, `E-map-${width}-dark`, `Map at ${width} px`);
        await click(p, "Next");
        await chooseOutput(p, `E out ${width}`);
        await shot(p, `E-check-${width}-dark`, `Check at ${width} px`, { scroll: 2000 });
        await p.ctx.close();
    }
    // Light theme
    {
        const p = await open({ width: 320, theme: "light" });
        await shot(p, "E-signin-320-light", "Sign in, light theme");
        await signIn(p, email);
        await setupDesign(p, { sheet: "products-valid.xlsx" });
        await shot(p, "E-map-320-light", "Map, light theme");
        await click(p, "Next");
        await chooseOutput(p, "E light");
        await shot(p, "E-check-320-light", "Check, light theme", { scroll: 600 });
        await p.ctx.close();
    }
    // Arabic RTL
    for (const width of [240, 320]) {
        const p = await open({ width, lang: "ar" });
        await shot(p, `E-signin-${width}-ar`, `Sign in, Arabic RTL, ${width} px`);
        await signIn(p, email);
        await queue(p, { file: "spreadsheets/products-valid.xlsx" });
        await click(p, "اختيار ملف");
        await shot(p, `E-data-${width}-ar`, `Data, Arabic RTL, ${width} px`);
        await click(p, "التالي");
        await queue(p, { file: "templates/product-card-1080x1350.psd" });
        await click(p, "اختيار PSD");
        await page_wait(p);
        await click(p, "التالي");
        await click(p, "ربط تلقائي بالاسم");
        await shot(p, `E-map-${width}-ar`, `Map, Arabic RTL, ${width} px`);
        const dir = await p.evaluate(() => document.querySelector("[dir]") && document.querySelector("[dir]").getAttribute("dir"));
        check(`Arabic UI sets dir=rtl at ${width} px`, dir === "rtl", dir);
        await p.ctx.close();
    }
    // Error and empty states
    {
        const p = await open({ width: 320 });
        await p.locator("input[type=text]").first().fill(email);
        await p.locator("input[type=password]").fill("wrong password");
        current.faultsInjected = true; // the 400 for the wrong password is expected
        await click(p, "Sign in");
        await p.waitForSelector(".ez-alert-error");
        await p.waitForTimeout(200);
        current.faultsInjected = false;
        await shot(p, "E-signin-error-320-dark", "Sign in error: wrong password");
        check("wrong password shows a clear error", /incorrect/.test(await p.locator(".ez-alert-error").textContent()));
        await signIn(p, email);
        await queue(p, { file: "spreadsheets/corrupt.xlsx" });
        await click(p, "Choose file");
        await shot(p, "E-data-corrupt-320-dark", "Data: corrupt workbook error");
        await queue(p, { file: "spreadsheets/headers-only.xlsx" });
        await click(p, btnText(await btn(p, "Change").count(), "Change", "Choose file"));
        await shot(p, "E-data-headers-only-320-dark", "Data: headers but no rows");
        await queue(p, { file: "spreadsheets/products-valid.xlsx" });
        await click(p, btnText(await btn(p, "Change").count(), "Change", "Choose file"));
        await click(p, "Next");
        await queue(p, { file: "templates/no-mappable-layers.psd" });
        await click(p, "Choose PSD");
        await page_wait(p);
        await click(p, "Next");
        await shot(p, "E-map-no-layers-320-dark", "Map: template without fillable layers");
        await p.ctx.close();
    }
    // Old Photoshop compatibility notice
    {
        const p = await open({ width: 320, ps: "23.5.0" });
        await signIn(p, email);
        await queue(p, { file: "spreadsheets/products-valid.xlsx" });
        await click(p, "Choose file");
        await click(p, "Next");
        await queue(p, { file: "templates/product-card-1080x1350.psd" });
        await click(p, "Choose PSD");
        await page_wait(p);
        await shot(p, "E-template-ps23-320-dark", "Template on simulated Photoshop 23.5 (compat notice)");
        await p.ctx.close();
    }
    // Responsive walkthrough recording: one session resized through every width.
    {
        const p = await open({ width: 520, height: 700, record: true });
        await signIn(p, email);
        await setupDesign(p, { sheet: "products-valid.xlsx" });
        for (const w of [520, 400, 320, 260, 240, 320]) {
            await p.setViewportSize({ width: w, height: 700 });
            await p.waitForTimeout(700);
            await p.evaluate(() => document.querySelector(".ez-content").scrollTo({ top: 600, behavior: "smooth" }));
            await p.waitForTimeout(700);
            await p.evaluate(() => document.querySelector(".ez-content").scrollTo({ top: 0, behavior: "smooth" }));
        }
        await finishRecording(p, "SIMULATED-scenario-E-responsive-walkthrough", "Scenario E: responsive resize 520 → 240 px (simulated host)");
    }
});

scenario("F", "Selling cycle: admin dashboard creates a client, client works in the plugin, top-up, expiry, password reset, disable", async () => {
    const adminEmail = `owner-${RUN}@e2e.test`;
    const client = `client-${RUN}@e2e.test`;
    await post("/__e2e/users", { email: adminEmail, password: "owner pass 123", admin: true });

    // --- dashboard (desktop, Arabic by default)
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, recordVideo: { dir: path.join(RECS, ".raw"), size: { width: 1280, height: 800 } } });
    const adm = await ctx.newPage();
    adm.on("dialog", (d) => d.accept());
    adm.on("pageerror", (e) => report.errors.push({ scenario: "F", kind: "pageerror", message: e.message }));
    adm.on("console", (m) => m.type() === "error" && !current.faultsInjected && report.errors.push({ scenario: "F", kind: "console", message: m.text() }));
    adm.meta = { width: 1280, height: 800, theme: "system-light", lang: "ar" };
    adm.ctx = ctx;
    const ashot = async (id, title) => {
        await adm.waitForTimeout(250);
        await adm.screenshot({ path: path.join(SHOTS, `${id}.png`), fullPage: true });
        report.screenshots.push({ file: `${id}.png`, title, scenario: "F", ...adm.meta, layoutProblems: [] });
    };
    await adm.goto(`${ORIGIN}/admin/`);
    await adm.waitForSelector("form");
    await ashot("F01-admin-signin-ar", "Admin dashboard: sign in (Arabic, default)");
    await adm.fill("input[type=email]", adminEmail);
    await adm.fill("input[type=password]", "owner pass 123");
    await adm.click("button.btn-primary");
    await adm.waitForSelector("text=العملاء");
    await ashot("F02-admin-clients-ar", "Clients list");
    await adm.click("text=عميل جديد");
    await adm.fill("[data-testid=new-client-form] input[type=email]", client);
    await adm.fill("[data-testid=new-client-form] input[type=number] >> nth=0", "50");
    await adm.fill("[data-testid=new-client-form] input[type=number] >> nth=1", "30");
    await adm.fill("[data-testid=new-client-form] input:not([type]) >> nth=0", "فودافون كاش 1234");
    await ashot("F03-admin-new-client-ar", "New client: credits, validity, payment note, generated password");
    await adm.click("[data-testid=new-client-form] button.btn-primary");
    await adm.waitForSelector("[data-testid=credentials]");
    const password = (await adm.textContent("[data-testid=new-password]")).trim();
    check("dashboard shows a generated password once", /^\S{4}-\S{4}-\S{4}$/.test(password), password);
    await ashot("F04-admin-credentials-ar", "Credentials + ready-to-send WhatsApp message");
    await adm.click("[data-testid=credentials] button.btn:not(.btn-primary)");
    await adm.waitForSelector("[data-testid=client-detail]");
    check("client detail shows 50 available", (await adm.textContent("[data-testid=available]")).trim() === "50");
    await ashot("F05-admin-client-detail-ar", "Client detail: balance, packs with expiry, history");

    // --- the client in the plugin
    const p = await open({ width: 320 });
    await p.locator("input[type=text]").first().fill(client);
    await p.locator("input[type=password]").fill(password);
    await click(p, "Sign in");
    await p.waitForSelector(".ez-stepper");
    await p.waitForTimeout(400);
    check("plugin header shows 50 credits", /50/.test(await p.locator(".ez-chip").textContent()));
    await p.locator(".ez-chip").click();
    await p.waitForTimeout(500);
    await shot(p, "F06-plugin-account-expiry-320-dark", "Plugin account: credits and their expiry date");
    check("plugin shows the expiry of the 50 credits", /50 credits · expire/.test(await p.locator(".ez-content").textContent()));
    await click(p, "Close");
    await setupDesign(p, { sheet: "products.csv" });
    await click(p, "Next");
    await chooseOutput(p, "Elzoz output F");
    await click(p, "Next");
    await btn(p, "Generate 3").click();
    await waitForResults(p);
    let acct = await account(client);
    check("client job charged 3 of 50", Number(acct.balance.balance) === 47, acct.balance);

    // --- top-up from the dashboard
    await adm.reload(); // the page is in the URL, so a refresh stays on this client
    await adm.waitForSelector("[data-testid=client-detail]");
    check("refresh keeps the client page open (URL hash)", /#\/clients\/[0-9a-f-]{36}$/.test(adm.url()), adm.url());
    // Search from the list still finds the client.
    await adm.click("text=العملاء >> nth=0");
    await adm.fill("input[type=search]", client.slice(0, 12));
    await adm.waitForTimeout(600);
    await adm.click(`text=${client}`);
    await adm.waitForSelector("[data-testid=client-detail]");
    check("dashboard sees the 3 charges", (await adm.textContent("[data-testid=available]")).trim() === "47");
    const topUp = adm.locator("form.card").first();
    await topUp.locator("input").nth(0).fill("100");
    await topUp.locator("input").nth(1).fill("60");
    await topUp.locator("input").nth(2).fill("تجديد الاشتراك");
    await topUp.locator("button").click();
    await adm.waitForFunction(() => document.querySelector("[data-testid=available]").textContent.trim() === "147");
    await ashot("F07-admin-after-topup-ar", "After a 100-credit, 60-day top-up: two packs with different expiry");
    acct = await account(client);
    check("top-up recorded once as a 100-credit pack valid 60 days", acct.lots.length === 2 && Number(acct.lots[1].amount) === 100 && Math.round((new Date(acct.lots[1].expires_at) - Date.now()) / 86400000) === 60, acct.lots);

    // --- the first pack expires
    const exp = await post("/__e2e/expire-oldest-lot", { email: client });
    await p.locator(".ez-chip").click();
    await p.waitForTimeout(600);
    check("after expiry the plugin shows only the 100 valid credits", /100/.test(await p.locator(".ez-chip").textContent()) && !/47 credits/.test(await p.locator(".ez-content").textContent()), exp);
    await shot(p, "F08-plugin-after-expiry-320-dark", "Plugin after the first pack expired");
    await adm.reload();
    await adm.waitForSelector("[data-testid=client-detail]");
    const ledgerText = await adm.textContent("[data-testid=ledger]");
    check("dashboard history shows the expiry", /انتهاء صلاحية/.test(ledgerText));
    await ashot("F09-admin-expiry-history-ar", "History with charges, top-up and the expiry entry");

    // --- password reset and disable
    await adm.click("text=تغيير كلمة المرور");
    await adm.waitForSelector("[data-testid=credentials]");
    const newPassword = (await adm.textContent("[data-testid=new-password]")).trim();
    const oldLogin = await post("/auth/v1/token?grant_type=password", { email: client, password });
    const newLogin = await post("/auth/v1/token?grant_type=password", { email: client, password: newPassword });
    check("reset: old password refused, new password works", !oldLogin.access_token && !!newLogin.access_token);
    await adm.click("[data-testid=credentials] button.btn:not(.btn-primary)");
    await adm.click("text=إيقاف الحساب");
    await adm.waitForSelector("text=تفعيل الحساب");
    await ashot("F10-admin-disabled-ar", "Account disabled");
    const q = await open({ width: 320 });
    await q.locator("input[type=text]").first().fill(client);
    await q.locator("input[type=password]").fill(newPassword);
    current.faultsInjected = true; // the refused sign-in (400) is expected
    await click(q, "Sign in");
    await q.waitForSelector(".ez-alert-error");
    current.faultsInjected = false;
    check("disabled client sees a clear message in the plugin", /disabled/.test(await q.locator(".ez-alert-error").textContent()));
    await shot(q, "F11-plugin-disabled-320-dark", "Plugin: disabled account message with WhatsApp contact");
    await q.ctx.close();
    await adm.click("text=تفعيل الحساب");
    await adm.waitForSelector("text=إيقاف الحساب");

    // --- overview, English, mobile
    await adm.click("text=English");
    await adm.click("text=Overview");
    await adm.waitForSelector(".stat");
    await ashot("F12-admin-overview-en", "Overview (English)");
    await adm.click("text=Settings");
    await adm.waitForSelector("text=Prices");
    await ashot("F13-admin-settings-en", "Settings: prices per design and per 5 s of video");
    await finishRecording(adm, "SIMULATED-scenario-F-admin-dashboard", "Scenario F: admin dashboard selling cycle (real DB; Auth admin API stubbed)");
    await p.ctx.close();

    const m = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const mob = await m.newPage();
    await mob.goto(`${ORIGIN}/admin/`);
    await mob.fill("input[type=email]", adminEmail);
    await mob.fill("input[type=password]", "owner pass 123");
    await mob.click("button.btn-primary");
    await mob.waitForSelector("table");
    await mob.screenshot({ path: path.join(SHOTS, "F14-admin-clients-mobile-ar.png"), fullPage: true });
    report.screenshots.push({ file: "F14-admin-clients-mobile-ar.png", title: "Clients list on a phone (390 px, Arabic)", scenario: "F", width: 390, theme: "system-light", lang: "ar", layoutProblems: [] });
    const overflow = await mob.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    check("dashboard fits a 390 px phone without horizontal scrolling", !overflow);
    await mob.click(`text=${client}`);
    await mob.waitForSelector("[data-testid=client-detail]");
    await mob.screenshot({ path: path.join(SHOTS, "F15-admin-client-mobile-ar.png"), fullPage: true });
    report.screenshots.push({ file: "F15-admin-client-mobile-ar.png", title: "Client detail on a phone (390 px, Arabic)", scenario: "F", width: 390, theme: "system-light", lang: "ar", layoutProblems: [] });
    await m.close();

    // --- a non-admin can't use the dashboard
    const n = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const np = await n.newPage();
    await np.goto(`${ORIGIN}/admin/`);
    await np.fill("input[type=email]", client);
    await np.fill("input[type=password]", newPassword);
    await np.click("button.btn-primary");
    await np.waitForSelector(".alert-error");
    check("a client can't sign in to the dashboard", /ليس أدمن/.test(await np.textContent(".alert-error")));
    await n.close();
});

scenario("G", "Designer features: show/hide by column, shrink-to-fit, row selection, subfolders, output size, free preview, remembered mapping", async () => {
    const email = `scenario-g-${RUN}@e2e.test`;
    await post("/__e2e/users", { email, password: "correct horse", credits: 50 });
    const p = await open({ width: 320, height: 760, record: true });
    await signIn(p, email);
    await setupDesign(p, { sheet: "products-valid.xlsx" });
    // shrink-to-fit on Description, show/hide the Badge layer from the Badge column
    await layerRow(p, "Description").locator('label:has-text("Shrink long text") input').check();
    await p.evaluate(() => document.querySelector(".ez-content").scrollTo(0, 99999));
    const picker = p.locator(".ez-section").filter({ hasText: "Show / hide layers" }).locator("select").last();
    const badgeOption = await picker.locator("option", { hasText: /^Badge/ }).first().getAttribute("value");
    await picker.selectOption(badgeOption);
    await p.locator('sp-button:has-text("Add")').last().click();
    await p.waitForTimeout(200);
    await shot(p, "G01-map-show-hide-320-dark", "Map: show/hide a layer from a column + shrink-to-fit", { scroll: 99999 });
    await click(p, "Next");
    await chooseOutput(p, "Elzoz output G");
    await p.locator('label:has-text("PSD") input').check();
    await field(p, "File names").fill("{Badge}/{row}_{Name}");
    await field(p, "Rows to generate").fill("2-5");
    await field(p, "Output width").fill("540");
    await p.waitForTimeout(200);
    await shot(p, "G02-check-rows-folders-size-320-dark", "Check: subfolders, rows 2-5, 540 px output", { scroll: 200 });
    const info = await p.locator(".ez-alert").filter({ hasText: "Generating 4 of 8 rows" }).count();
    check("Check says only 4 of 8 rows will be generated (and charged)", info === 1);
    await p.evaluate(() => document.querySelector(".ez-content").scrollTo(0, 99999));
    await p.locator(".ez-section").filter({ hasText: "Preview a row" }).locator("select").selectOption("row-3");
    await click(p, "Preview");
    await p.waitForSelector(".ez-preview-img", { timeout: 30000 });
    const previewSize = await p.evaluate(() => {
        const img = document.querySelector(".ez-preview-img");
        return [img.naturalWidth, img.naturalHeight];
    });
    check("free preview is low resolution (≤ 640 px) and costs nothing", previewSize[0] <= 640 && previewSize[1] <= 640, previewSize);
    await shot(p, "G03-check-free-preview-320-dark", "Check: free low-resolution preview of row 3", { scroll: 99999 });
    let acct = await account(email);
    check("preview charged nothing", Number(acct.balance.balance) === 50);
    await click(p, "Next");
    await btn(p, "Generate 4").click();
    await waitForResults(p);
    await shot(p, "G04-results-subfolders-320-dark", "Results: files in subfolders per Badge value");
    const dir = path.join(OUTS, "scenario-g");
    const names = await saveOutputs(p, "Elzoz output G", dir);
    check("outputs sorted into subfolders by the Badge column", JSON.stringify(names.filter((n) => n.endsWith(".jpg")).sort()) === JSON.stringify(["4_Orbit Watch.jpg", "HOT/2_Pulse Phone X.jpg", "NEW/1_Aurora Laptop 14.jpg", "SALE/3_Echo Headphones.jpg"]), names);
    const imgs = {};
    for (const sub of ["", "HOT", "NEW", "SALE"]) Object.assign(imgs, ...Object.entries(imageSummary(path.join(dir, sub))).map(([k, v]) => ({ [`${sub}/${k}`]: v })));
    check("every JPG is 540×675", Object.values(imgs).length === 4 && Object.values(imgs).every((v) => v[1] === 540 && v[2] === 675), imgs);
    const vis = JSON.parse(execFileSync("python3", ["-c", "import json,sys,os\nfrom psd_tools import PSDImage\nout={}\nfor root,_,fs in os.walk(sys.argv[1]):\n  for n in fs:\n    if n.endswith('.psd'):\n      p=PSDImage.open(os.path.join(root,n))\n      out[os.path.relpath(os.path.join(root,n),sys.argv[1])]=[l.visible for l in p.descendants() if l.name=='Badge'][0]\nprint(json.dumps(out))", dir]).toString());
    check("Badge layer visible only where the sheet has a badge (psd-tools)", vis["NEW/1_Aurora Laptop 14.psd"] === true && vis["SALE/3_Echo Headphones.psd"] === true && vis["4_Orbit Watch.psd"] === false, vis);
    acct = await account(email);
    check("4 rows charged", Number(acct.balance.balance) === 46, acct.balance);
    // A new job with the same template restores the mapping.
    await click(p, "New job");
    await queue(p, { file: "spreadsheets/products-valid.xlsx" });
    await click(p, "Choose file");
    await click(p, "Next");
    await queue(p, { file: "templates/product-card-1080x1350.psd" });
    await click(p, "Choose PSD");
    await page_wait(p);
    await click(p, "Next");
    const restored = await p.locator(".ez-alert").filter({ hasText: "Restored the mapping" }).count();
    check("mapping restored for the same template", restored === 1);
    await shot(p, "G05-map-restored-320-dark", "Map: last mapping restored for this template");
    await finishRecording(p, "SIMULATED-scenario-G-designer-features", "Scenario G: designer features (simulated host)");
});

const btnText = (hasChange, a, b) => (hasChange ? a : b);
scenario("H", "WhatsApp sales bot in the dashboard: orders, approval, conversations, transfers, packages, bot settings", async () => {
    const pg = require("pg");
    const db = new pg.Client({ connectionString: process.env.ELZOZ_TEST_DATABASE_URL });
    await db.connect();
    const svc = async (sql, params = []) => {
        await db.query("begin");
        await db.query("set local role service_role");
        const r = await db.query(sql, params);
        await db.query("commit");
        return r.rows[0] && r.rows[0].r;
    };
    // Seed through the same SQL functions the bot uses.
    const phone = () => "2010" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0");
    const a = await svc("select public.bot_touch_contact($1, 'Mona', 'أهلاً [IG-BIO]') as r", [phone()]);
    await svc("select public.bot_log_in($1, $2, 'text', 'عايزة باقة المحترف') as r", [a.id, `wamid.${RUN}a`]);
    const oa = await svc("select public.bot_create_order($1, 'pro', $2) as r", [a.id, `mona-${RUN}@e2e.test`]);
    await db.query("update public.bot_orders set claimed_at = now(), claim = '{\"is_receipt\": true, \"amount\": 500}' where id = $1", [oa.id]);
    const b = await svc("select public.bot_touch_contact($1, 'Karim', 'السلام عليكم [FB-AD1]') as r", [phone()]);
    await svc("select public.bot_log_in($1, $2, 'text', 'عندي مشكلة في التثبيت') as r", [b.id, `wamid.${RUN}b`]);
    await db.query("update public.bot_contacts set human_until = now() + interval '3 hours' where id = $1", [b.id]);
    const ob = await svc("select public.bot_create_order($1, 'basic', $2) as r", [b.id, `karim-${RUN}@e2e.test`]);
    await svc("select public.bot_record_payment('vodafone_cash', 'VF-Cash', true, $1, '01012345678', $2, $3, $4) as r", [ob.amount_due, `T${RUN}`, `تم استلام مبلغ ${ob.amount_due} جنيه من رقم 01012345678`, `fp-${RUN}`]);
    await svc("select public.bot_record_payment('unknown', '+201000000000', false, 777, null, null, 'تم استلام مبلغ 777 جنيه', $1) as r", [`fp2-${RUN}`]);
    await db.end();

    const adminEmail = `sales-owner-${RUN}@e2e.test`;
    await post("/__e2e/users", { email: adminEmail, password: "owner pass 123", admin: true });
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    const adm = await ctx.newPage();
    adm.on("dialog", (d) => d.accept());
    adm.on("pageerror", (e) => report.errors.push({ scenario: "H", kind: "pageerror", message: e.message }));
    adm.on("console", (m) => m.type() === "error" && report.errors.push({ scenario: "H", kind: "console", message: m.text() }));
    const shot = async (page, id, title, width = 1280) => {
        await page.waitForTimeout(250);
        await page.screenshot({ path: path.join(SHOTS, `${id}.png`), fullPage: true });
        report.screenshots.push({ file: `${id}.png`, title, scenario: "H", width, theme: "system-light", lang: "ar", layoutProblems: [] });
    };
    await adm.goto(`${ORIGIN}/admin/`);
    await adm.fill("input[type=email]", adminEmail);
    await adm.fill("input[type=password]", "owner pass 123");
    await adm.click("button.btn-primary");
    await adm.waitForSelector("text=العملاء");
    await adm.click("text=المبيعات (واتساب)");
    await adm.waitForSelector(`text=${oa.code}`);
    check("orders list shows the open order with its unique amount", (await adm.textContent("table")).includes(String(Number(oa.amount_due))));
    check("auto-matched order is delivered or being delivered", /اتدفع|بيتجهز|اتسلم/.test(await adm.textContent(`tr:has-text("${ob.code}")`)));
    check("an order with a receipt is flagged", (await adm.textContent(`tr:has-text("${oa.code}")`)).includes("بعت إيصال"));
    await shot(adm, "H01-sales-orders-ar", "Sales: bot status + orders (receipt waiting, auto-paid)");
    await adm.click(`tr:has-text("${oa.code}") >> text=قبول`);
    await adm.waitForFunction((code) => [...document.querySelectorAll("tr")].some((tr) => tr.textContent.includes(code) && /اتدفع/.test(tr.textContent)), oa.code);
    check("owner approval from the dashboard marks the order paid", true);
    await adm.click("nav.tabs >> nth=1 >> text=المحادثات");
    await adm.waitForSelector("text=Karim");
    check("conversation with a person shows 'with support' and can go back to the bot", (await adm.textContent("table")).includes("مع الدعم"));
    await shot(adm, "H02-sales-contacts-ar", "Sales: conversations (source, last message, handed to support)");
    await adm.click(`tr:has-text("Karim") >> text=رجّعه للبوت`);
    await adm.waitForFunction(() => ![...document.querySelectorAll("tr")].some((tr) => tr.textContent.includes("Karim") && tr.textContent.includes("مع الدعم")));
    await adm.click("text=التحويلات");
    await adm.waitForSelector("text=مش موثوق");
    await shot(adm, "H03-sales-payments-ar", "Sales: payment notifications (matched, untrusted sender)");
    await adm.click("text=الباقات");
    await adm.waitForSelector("text=محترف - 300 تصميم");
    await adm.click(`tr:has-text("trial") >> text=تعديل`);
    await adm.fill("form input[type=number] >> nth=0", "60");
    await shot(adm, "H04-sales-package-edit-ar", "Sales: edit a package price");
    await adm.click("form >> text=حفظ");
    await adm.waitForSelector(`tr:has-text("trial") >> text=60`);
    check("package price saved", true);
    await adm.click("text=إعدادات البوت");
    await adm.waitForSelector("text=الأسئلة الشائعة");
    check("bot settings show the InstaPay address", (await adm.inputValue("form input[type=text] >> nth=0")) === "elbadawi@instapay");
    await shot(adm, "H05-sales-bot-settings-ar", "Sales: bot settings (payment details, hours, FAQ)");
    await adm.click("text=إيقاف البوت");
    await adm.waitForSelector("text=البوت واقف");
    check("pause toggles the bot", true);
    await adm.click("text=تشغيل البوت");
    await adm.waitForSelector("text=البوت شغال");
    await ctx.close();

    const m = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const mob = await m.newPage();
    await mob.goto(`${ORIGIN}/admin/#/sales/orders`);
    await mob.fill("input[type=email]", adminEmail);
    await mob.fill("input[type=password]", "owner pass 123");
    await mob.click("button.btn-primary");
    await mob.waitForSelector(`text=${oa.code}`);
    await shot(mob, "H06-sales-orders-mobile-ar", "Sales orders on a phone (390 px)", 390);
    const overflow = await mob.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    check("sales page fits a 390 px phone without horizontal scrolling", !overflow);
    await m.close();
});

// ---------- Scenario I: features 1-15 (added feature by feature) ----------
const sel = (page, sectionText) => page.locator(".ez-section").filter({ hasText: sectionText });
async function addSmartColumn(page, typeLabel) {
    const section = sel(page, "Smart columns");
    await section.locator("select").last().selectOption({ label: typeLabel });
    await section.locator('sp-button:has-text("Add")').last().click();
    await page.waitForTimeout(150);
    return section.locator(".ez-derived").last();
}
async function openFormat(page, layer) {
    const row = layerRow(page, layer);
    await row.locator('sp-button:has-text("Formatting")').click();
    await page.waitForTimeout(100);
    return row.locator(".ez-format-body");
}
async function fieldIn(scope, label) {
    return scope.locator(".ez-field", { has: scope.page().locator(".ez-label", { hasText: label }) }).locator("select, input").first();
}

scenario("I", "Features 1-15: smart prices, formatting (more added per feature)", async () => {
    const email = `scenario-i-${RUN}@e2e.test`;
    await post("/__e2e/users", { email, password: "correct horse", credits: 80 });
    const p = await open({ width: 320, height: 820, record: true });
    await signIn(p, email);

    // ---- F9: smart columns on the Data step
    await queue(p, { file: "spreadsheets/offers.xlsx" });
    await click(p, "Choose file");
    const disc = await addSmartColumn(p, "Discount %");
    await (await fieldIn(disc, "Style")).selectOption("minus");
    const has = await addSmartColumn(p, "Has a discount (for show/hide)");
    const price = await addSmartColumn(p, "Formatted price");
    await (await fieldIn(price, "After")).fill(" ج.م");
    await p.waitForTimeout(200);
    const samples = await p.locator('[data-testid="derived-sample"]').allTextContents();
    check("smart columns guess Old/New price and preview row 1", samples.join(" | ") === "Row 1: -13% | Row 1: yes | Row 1: 1,299 ج.م", samples);
    await shot(p, "I01-data-smart-columns-320-dark", "Data: smart columns (discount, has discount, formatted price) previewed on row 1", { scroll: 99999 });
    const previewHas = await p.locator(".ez-table-head .ez-cell").allTextContents();
    check("the data preview shows the smart columns", previewHas.includes("✦ Discount") && previewHas.includes("✦ Price"), previewHas);
    await click(p, "Next");
    await queue(p, { file: "templates/product-card-1080x1350.psd" });
    await click(p, "Choose PSD");
    await page_wait(p);
    await click(p, "Next");

    // ---- F10: formatting on the Map step
    await click(p, "Auto-map by name");
    await layerRow(p, "Price").locator("select").first().selectOption("✦ Discount");
    await pickLayerFolder(p, "Photo", "images/products");
    await pickLayerFolder(p, "Logo", "images/logos");
    // Footer/Name: phone formatted; Card Name: title case + trimmed
    const nameRows = p.locator(".ez-layer", { has: p.locator(".ez-layer-name > div:first-child", { hasText: /^Name$/ }) });
    // Template order: Footer/Name first, then Card/Text/Name.
    await nameRows.nth(0).locator("select").first().selectOption("Phone");
    let f = await openFormat(p, "Description");
    await nameRows.nth(1).locator('sp-button:has-text("Formatting")').click();
    const nameFmt = nameRows.nth(1).locator(".ez-format-body");
    await (await fieldIn(nameFmt, "Letters")).selectOption("title");
    await nameFmt.locator('label:has-text("Remove extra spaces") input').check();
    await nameRows.nth(0).locator('sp-button:has-text("Formatting")').click();
    const phoneFmt = nameRows.nth(0).locator(".ez-format-body");
    await (await fieldIn(phoneFmt, "The cell is")).selectOption("phone");
    await (await fieldIn(phoneFmt, "Phone style")).selectOption("international");
    await (await fieldIn(f, "Before")).fill("✓ ");
    await p.waitForTimeout(150);
    const previews = await p.locator('[data-testid="format-preview"]').allTextContents();
    check("formatting previews row 1 live", previews.some((t) => t.includes("→ Aurora Laptop 14")) && previews.some((t) => t.includes("→ +20 10 1234 5678")), previews);
    await shot(p, "I02-map-formatting-320-dark", "Map: title case + trim on Name, international phone, prefix on Description", { scroll: 0 });
    // Badge shows only when there is a discount
    await p.evaluate(() => document.querySelector(".ez-content").scrollTo(0, 99999));
    const picker = sel(p, "Show / hide layers").locator("select").last();
    await picker.selectOption(await picker.locator("option", { hasText: /^Badge/ }).first().getAttribute("value"));
    await p.locator('sp-button:has-text("Add")').last().click();
    await p.waitForTimeout(150);
    await sel(p, "Show / hide layers").locator(".ez-layer-picker select").last().selectOption("✦ Has discount");
    await shot(p, "I03-map-badge-has-discount-320-dark", "Map: Badge shown only when the row has a discount", { scroll: 99999 });

    await click(p, "Next");
    await chooseOutput(p, "Elzoz output I");
    await p.locator('label:has-text("PSD") input').check();
    await p.waitForTimeout(150);
    const warn = await p.locator(".ez-alert").allTextContents();
    check("Check reports nothing blocking for the smart columns", !(await p.locator(".ez-section").filter({ hasText: "Fix before generating" }).count()), warn);
    await click(p, "Next");
    await btn(p, "Generate 5").click();
    await waitForResults(p);
    await shot(p, "I04-results-offers-320-dark", "Results: 5 offer cards");
    const dir = path.join(OUTS, "scenario-i");
    await saveOutputs(p, "Elzoz output I", dir);
    const psd = psdSummary(dir);
    const one = psd["elzoz_1.psd"] && psd["elzoz_1.psd"].layers;
    check("row 1: name tidied, discount, phone, description prefix (psd-tools)",
        one && one["Name@Text"] === "Aurora Laptop 14" && one["Price@Text"] === "-13%" && one["Name@Footer"] === "+20 10 1234 5678" && String(one["Description@Text"]).startsWith("✓ "), one);
    const vis = JSON.parse(execFileSync("python3", ["-c", "import json,sys,os\nfrom psd_tools import PSDImage\nout={}\nfor n in sorted(os.listdir(sys.argv[1])):\n  if n.endswith('.psd'):\n    p=PSDImage.open(os.path.join(sys.argv[1],n))\n    out[n]=[l.visible for l in p.descendants() if l.name=='Badge'][0]\nprint(json.dumps(out))", dir]).toString());
    check("Badge hidden on the row without a discount (row 3), shown on the others", vis["elzoz_3.psd"] === false && vis["elzoz_1.psd"] === true && vis["elzoz_5.psd"] === true, vis);
    check("Arabic prices with Arabic digits are understood (row 5: -17%)", psd["elzoz_5.psd"] && psd["elzoz_5.psd"].layers["Price@Text"] === "-17%", psd["elzoz_5.psd"] && psd["elzoz_5.psd"].layers);
    let acct = await account(email);
    check("5 rows charged", Number(acct.balance.balance) === 75, acct.balance);

    // ---- F11: brand kit + colors from a column, on a template with a color fill layer
    await click(p, "New job");
    await queue(p, { file: "spreadsheets/offers.xlsx" });
    await click(p, "Choose file");
    const fixed = await addSmartColumn(p, "Fixed value");
    await (await fieldIn(fixed, "Column name")).fill("Primary");
    await (await fieldIn(fixed, "Value")).fill("#0B5FFF");
    await p.locator('sp-button:has-text("Save the fixed values as a brand kit")').click();
    await p.locator(".ez-kit input").fill("Nova Store");
    await p.locator('.ez-kit sp-button:has-text("Save")').click();
    await p.waitForTimeout(200);
    const kitNote = await p.locator(".ez-kit").textContent();
    check("brand kit saved with its value", /Saved “Nova Store” with 1 values/.test(kitNote), kitNote);
    await shot(p, "I05-data-brand-kit-320-dark", "Data: brand kit “Nova Store” applied (fixed Primary color)", { scroll: 99999 });
    await click(p, "Next");
    await queue(p, { file: "templates/offer-card-1080x1350.psd" });
    await click(p, "Choose PSD");
    await page_wait(p);
    await click(p, "Next");
    await click(p, "Auto-map by name");
    await pickLayerFolder(p, "Photo", "images/products");
    await pickLayerFolder(p, "Logo", "images/logos");
    await layerRow(p, "Discount").locator("select").first().selectOption("✦ Discount");
    await layerRow(p, "Price").locator("select").first().selectOption("✦ Price");
    await layerRow(p, "Old price").locator("select").first().selectOption("Old price");
    const colors = sel(p, "Colors from a column");
    const colorRow = (name) => colors.locator(".ez-layer", { has: p.locator(".ez-layer-name > div:first-child", { hasText: new RegExp(`^${name}$`) }) }).first();
    await colorRow("Accent").locator(".ez-layer-picker select").selectOption("Color");
    await colorRow("Badge Shape").locator(".ez-layer-picker select").selectOption("✦ Primary");
    await colorRow("Name").locator(".ez-layer-picker select").selectOption("Color");
    await p.waitForTimeout(150);
    const swatches = await colors.locator('[data-testid="color-sample"]').allTextContents();
    check("color samples show row 1 and the brand color", swatches.join(" | ").includes("#E30613 → #E30613") && swatches.join(" | ").includes("#0B5FFF → #0B5FFF"), swatches);
    await colors.scrollIntoViewIfNeeded();
    await shot(p, "I06-map-colors-320-dark", "Map: Accent and Name colored from the Color column, Badge Shape from the brand kit", { scroll: null });
    await click(p, "Next");
    await p.locator('label:has-text("PSD") input').check();
    await field(p, "File names").fill("{Key}_{Name}");
    await p.waitForTimeout(200);
    const colorWarn = await p.locator(".ez-alert").filter({ hasText: "isn't a color" }).allTextContents();
    check("Check warns once that row 5 has no valid color and will be skipped", colorWarn.length === 1 && colorWarn[0].includes("in 1 row(s)") && /Rows 5Fix$/.test(colorWarn[0]), colorWarn);
    await shot(p, "I07-check-invalid-color-320-dark", "Check: the row with “zzz” as a color is skipped (not charged)", { scroll: 0 });
    await click(p, "Next");
    await btn(p, "Generate 4").click();
    await waitForResults(p);
    const dir2 = path.join(OUTS, "scenario-i-colors");
    await saveOutputs(p, "Elzoz output I", dir2);
    const fills = JSON.parse(execFileSync("python3", ["-c", "import json,sys,os\nfrom psd_tools import PSDImage\nfrom psd_tools.constants import Tag\nout={}\nfor n in sorted(os.listdir(sys.argv[1])):\n  if not n.endswith('.psd'): continue\n  p=PSDImage.open(os.path.join(sys.argv[1],n)); r={}\n  for l in p.descendants():\n    if l.kind=='solidcolorfill':\n      c=l.tagged_blocks.get_data(Tag.SOLID_COLOR_SHEET_SETTING)[b'Clr ']; r[l.name]='#%02X%02X%02X'%tuple(int(round(float(c[k]))) for k in (b'Rd  ',b'Grn ',b'Bl  '))\n    if l.kind=='type' and l.name=='Name':\n      v=l.engine_dict['StyleRun']['RunArray'][0]['StyleSheet']['StyleSheetData']['FillColor']['Values']; r['Name']='#%02X%02X%02X'%tuple(int(round(x*255)) for x in v[1:])\n  out[n]=r\nprint(json.dumps(out))", dir2]).toString());
    check("row colors written: Accent and Name from Color, Badge Shape from the brand kit (psd-tools)",
        fills["A1_aurora laptop 14.psd"] && fills["A1_aurora laptop 14.psd"].Accent === "#E30613" && fills["A1_aurora laptop 14.psd"].Name === "#E30613" && fills["A1_aurora laptop 14.psd"]["Badge Shape"] === "#0B5FFF" && fills["A2_pulse phone x.psd"].Accent === "#0B5FFF", fills);
    check("the row with an invalid color was not generated", !Object.keys(fills).some((n) => n.startsWith("A4_")), Object.keys(fills));
    await shot(p, "I08-results-colors-320-dark", "Results: 4 recolored offer cards");
    acct = await account(email);
    check("4 more rows charged (75 → 71)", Number(acct.balance.balance) === 71, acct.balance);

    // ---- F15: save the job as a project; next week the client adds a row; only the new row is generated
    await p.locator('[data-testid="projects-chip"]').click();
    await p.waitForTimeout(150);
    const keySelect = await fieldIn(p.locator(".ez-content"), "Key column");
    check("the key column is guessed (SKU)", (await keySelect.inputValue()) === "SKU", await keySelect.inputValue());
    await field(p, "Project name").fill("Weekly offers – Nova");
    await click(p, "Save project");
    const savedNote = await p.locator(".ez-alert").first().textContent();
    check("project saved; the 4 rows just generated are marked done", /Saved "Weekly offers – Nova"/.test(savedNote) && /The 4 row\(s\) you just generated/.test(savedNote), savedNote);
    await shot(p, "I09-projects-saved-320-dark", "Projects: the job saved as “Weekly offers – Nova” (key column SKU, 4 rows remembered)");
    await click(p, "Close");
    const chipName = await p.locator('[data-testid="projects-chip"]').textContent();
    check("the header shows the open project", chipName.includes("Weekly offers"), chipName);

    // A week later: a new product row, a fresh job, then reopen the project.
    await p.evaluate(() => window.__harness.addRows("offers.xlsx", [["nova speaker mini", "450", "399", "Pocket size, big sound.", "speaker.webp", "nova.png", "05/11/2026", "01000000006", "#1DB954", "ELZ-0006", "", "A6"]]));
    await click(p, "New job");
    await p.locator('[data-testid="projects-chip"]').click();
    await p.waitForTimeout(150);
    await shot(p, "I10-projects-list-320-dark", "Projects: the saved project, ready to open in one click");
    await p.locator(".ez-project").first().locator('sp-button:has-text("Open")').click();
    await page_wait(p);
    const opened = await p.locator(".ez-content").textContent();
    check("the project opens on Check with everything in place (no file pickers)", /Project opened with everything in place/.test(opened) && (await p.locator(".ez-step-current").first().textContent()).includes("Check"), opened.slice(0, 200));
    const doneInfo = await p.locator(".ez-alert").filter({ hasText: "were generated before" }).first().textContent();
    check("only the new rows are planned: 4 skipped, 2 new of 6", /4 row\(s\) were generated before \(same SKU\).*2 new of 6/.test(doneInfo), doneInfo);
    await shot(p, "I11-check-only-new-rows-320-dark", "Check: project “Weekly offers – Nova”, only new rows (the invalid-color row is still skipped)", { scroll: 0 });
    await click(p, "Next");
    await btn(p, "Generate 1").click();
    await waitForResults(p);
    const names3 = await p.evaluate(() => window.__harness.outputNames("Elzoz output I"));
    check("only the new row was generated (A6), with the project's naming and PSD", names3.includes("A6_nova speaker mini.psd") && names3.filter((n) => n.startsWith("A1_")).length === 2, names3);
    acct = await account(email);
    check("1 more row charged (71 → 70)", Number(acct.balance.balance) === 70, acct.balance);

    // The moved template: the project still opens and asks for just that file.
    await p.evaluate(() => window.__harness.revokeTokens("offer-card"));
    await click(p, "New job");
    await p.locator('[data-testid="projects-chip"]').click();
    await p.waitForTimeout(150);
    const meta = await p.locator(".ez-project").first().textContent();
    check("the project keeps its name and remembers 5 generated rows", /^Weekly offers – Nova/.test(meta) && /5 row\(s\) generated/.test(meta), meta);
    await p.locator(".ez-project").first().locator('sp-button:has-text("Open")').click();
    await p.waitForTimeout(400);
    const moved = await p.locator(".ez-alert").first().textContent();
    check("a moved template is named and the user lands on the Template step", /Pick these again.*the template/.test(moved), moved);
    await shot(p, "I12-project-moved-template-320-dark", "Project opened: the template was moved, so only it has to be picked again");
    await queue(p, { file: "templates/offer-card-1080x1350.psd" });
    await click(p, "Choose PSD");
    await page_wait(p);
    await click(p, "Next");
    const kept = await layerRow(p, "Discount").locator("select").first().inputValue();
    check("after re-picking the template the project's mapping is kept", kept === "✦ Discount", kept);

    // ---- F14: free approval sheet for the client (all rows again: "only new rows" off)
    await click(p, "Next");
    await p.locator('label:has-text("Generate only new rows") input').uncheck();
    await p.waitForTimeout(150);
    const proofCard = sel(p, "Client approval sheet");
    await proofCard.locator("select").selectOption("4");
    await proofCard.scrollIntoViewIfNeeded();
    await shot(p, "I13-check-approval-sheet-320-dark", "Check: client approval sheet (free): 4 per page, proof JPGs for WhatsApp", { scroll: null });
    await proofCard.locator('sp-button:has-text("Make approval sheet")').click();
    await p.waitForFunction(() => /Approval sheet ready|couldn't be made/.test(document.querySelector(".ez-content").textContent), null, { timeout: 120000 });
    await p.waitForTimeout(300);
    const proofDone = await p.locator(".ez-alert").first().textContent();
    check("approval sheet made: 5 designs on 2 pages, no credits", /Approval sheet ready: Approval sheet .*\.pdf/.test(proofDone) && /5 design\(s\) on 2 page\(s\)\. No credits used/.test(proofDone), proofDone);
    await shot(p, "I14-results-approval-sheet-320-dark", "Results: approval sheet PDF + proof images, 0 credits");
    acct = await account(email);
    check("the approval sheet is free (balance still 70)", Number(acct.balance.balance) === 70, acct.balance);
    const dir4 = path.join(OUTS, "scenario-i-print");
    await saveOutputs(p, "Elzoz output I", dir4);
    const proofPdf = fs.readdirSync(dir4).find((n) => n.startsWith("Approval sheet"));
    const proofDir = fs.readdirSync(dir4).find((n) => n.startsWith("Proofs "));
    const pyPdf = (file) => JSON.parse(execFileSync("python3", ["-c", "import json,sys\nfrom pypdf import PdfReader\nr=PdfReader(sys.argv[1])\nprint(json.dumps([{'media':[round(float(x)) for x in p.mediabox],'images':len(p['/Resources'].get('/XObject',{})),'text':p.extract_text()} for p in r.pages]))", file]).toString());
    const proofPages = pyPdf(path.join(dir4, proofPdf));
    check("approval PDF: 2 A4 pages, 4 + 1 numbered designs (pypdf)", proofPages.length === 2 && proofPages[0].images === 4 && proofPages[1].images === 1 && proofPages[1].text.includes("#5") && proofPages[0].media.join() === "0,0,595,842", proofPages);
    const proofJpgs = fs.readdirSync(path.join(dir4, proofDir)).sort();
    const proofSize = JSON.parse(execFileSync("python3", ["-c", "import json,sys\nfrom PIL import Image\nprint(json.dumps(Image.open(sys.argv[1]).size))", path.join(dir4, proofDir, proofJpgs[0])]).toString());
    check("5 small proof JPGs (640 × 845: 800 px design + label strip)", proofJpgs.length === 5 && proofJpgs[0] === "01_A1_aurora laptop 14.jpg" && proofSize[0] === 640 && proofSize[1] === 845, { proofJpgs, proofSize });
    execFileSync("pdftoppm", ["-r", "60", "-f", "1", "-l", "1", "-png", path.join(dir4, proofPdf), path.join(SHOTS, "I15-approval-sheet-page1")]);
    report.screenshots.push({ file: "I15-approval-sheet-page1-1.png", title: "Approval sheet PDF page 1 (rendered by pdftoppm)", scenario: "I", width: 0, lang: "en", theme: "pdf", layoutProblems: [] });

    // ---- F13: print-ready PDF, 2 copies of each design imposed on A4
    await click(p, "Back to Check");
    await p.locator('label:has-text("Also make a print-ready PDF") input').check();
    await p.waitForTimeout(100);
    const printCard = sel(p, "Print (PDF)");
    await (await fieldIn(printCard, "Layout")).selectOption("sheet");
    await field(p, "Copies of each design").fill("2");
    await p.waitForTimeout(200);
    const sizeHint = await printCard.textContent();
    check("print size is explained (91.4 × 114.3 mm at 300 dpi)", sizeHint.includes("91.4 × 114.3 mm"), sizeHint.slice(0, 300));
    const summary = await p.locator('[data-testid="sheet-summary"]').textContent();
    check("imposition summary: 4 per A4 sheet, 3 sheets for 5 designs × 2", /4 per sheet \(2 × 2\)/.test(summary) && /3 sheet\(s\) for 5 design\(s\) × 2/.test(summary), summary);
    await printCard.scrollIntoViewIfNeeded();
    await shot(p, "I16-check-print-imposition-320-dark", "Check: print PDF, 4 per A4 sheet with crop marks, 2 copies each (diagram to scale)", { scroll: null });
    await field(p, "Copies of each design").fill("0");
    await p.waitForTimeout(150);
    check("invalid copies block the job with a clear message", (await p.locator(".ez-alert").filter({ hasText: "Copies of each design must be between 1 and 500" }).count()) === 1);
    await field(p, "Copies of each design").fill("2");
    await p.waitForTimeout(150);
    await click(p, "Next");
    await btn(p, "Generate 5").click();
    await waitForResults(p);
    const printDone = await p.locator(".ez-alert").filter({ hasText: "Print PDF ready" }).textContent();
    check("results show the print PDF: 3 pages, 5 designs", /Print PDF ready: Print .*\.pdf/.test(printDone) && /3 page\(s\), 5 design\(s\)/.test(printDone), printDone);
    await shot(p, "I17-results-print-pdf-320-dark", "Results: 5 designs + one print PDF (3 A4 sheets)");
    acct = await account(email);
    check("the print PDF costs nothing extra (5 designs: 70 → 65)", Number(acct.balance.balance) === 65, acct.balance);
    await saveOutputs(p, "Elzoz output I", dir4);
    const printPdf = fs.readdirSync(dir4).find((n) => n.startsWith("Print "));
    const printPages = pyPdf(path.join(dir4, printPdf));
    check("print PDF: 3 A4 sheets, cut-mark slug, images embedded at full size (pypdf)", printPages.length === 3 && printPages[0].media.join() === "0,0,595,842" && printPages[0].text.includes("sheet 1/3") && printPages[0].images === 2, printPages.map((x) => ({ ...x, text: x.text.slice(0, 60) })));
    execFileSync("pdftoppm", ["-r", "40", "-f", "1", "-l", "1", "-png", path.join(dir4, printPdf), path.join(SHOTS, "I18-print-sheet-page1")]);
    report.screenshots.push({ file: "I18-print-sheet-page1-1.png", title: "Print PDF sheet 1: 2 designs × 2 copies with crop marks (rendered by pdftoppm)", scenario: "I", width: 0, lang: "en", theme: "pdf", layoutProblems: [] });

    // ---- F8: a Shopify export with image links; images download by themselves
    await click(p, "New job");
    await queue(p, { file: "spreadsheets/shopify-products.csv" });
    await click(p, "Choose file");
    const dropped = await p.locator(".ez-alert").filter({ hasText: "Smart columns removed" }).textContent();
    check("smart columns from the old file that can't work here are removed and named", /Discount/.test(dropped) && !/Primary/.test(dropped), dropped);
    const storeCard = sel(p, "Shopify product export detected");
    check("the Shopify export is recognised", (await storeCard.count()) === 1);
    await storeCard.scrollIntoViewIfNeeded();
    await shot(p, "I19-data-shopify-detected-320-dark", "Data: Shopify export recognised, one click to prepare it", { scroll: null });
    await storeCard.locator('sp-button:has-text("Prepare for designs")').click();
    await p.waitForTimeout(200);
    const storeNote = await p.locator('[data-testid="store-note"]').textContent();
    check("prepared: 5 products, 1 extra row merged, 3 on sale", /5 product\(s\)/.test(storeNote) && /1 extra row\(s\) merged/.test(storeNote) && /3 on sale/.test(storeNote), storeNote);
    const storeHead = await p.locator(".ez-table-head .ez-cell").allTextContents();
    check("design-ready columns added (Name, Price, Old price, Photo, SKU, Description)", ["Name", "Price", "Old price", "Photo", "SKU", "Description"].every((k) => storeHead.includes(k)), storeHead);
    await click(p, "Next");
    await queue(p, { file: "templates/offer-card-1080x1350.psd" });
    await click(p, "Choose PSD");
    await page_wait(p);
    await click(p, "Next");
    await click(p, "Auto-map by name");
    const photoRow = layerRow(p, "Photo");
    if ((await photoRow.locator("select").first().inputValue()) !== "Photo") await photoRow.locator("select").first().selectOption("Photo");
    await p.waitForTimeout(150);
    const source = await (await fieldIn(photoRow, "Images come from")).inputValue();
    const linkInfo = await photoRow.locator('[data-testid="link-info"]').textContent();
    check("the Photo column of links switches the layer to 'links' (no folder to pick)", source === "link" && /5 image link\(s\) in 5 row\(s\)/.test(linkInfo), { source, linkInfo });
    await photoRow.scrollIntoViewIfNeeded();
    await shot(p, "I20-map-images-from-links-320-dark", "Map: Photo from links (downloaded automatically)", { scroll: null });
    await click(p, "Next");
    const printBox = p.locator('label:has-text("Also make a print-ready PDF") input');
    if (await printBox.isChecked()) await printBox.uncheck();
    await field(p, "File names").fill("{SKU}_{Name}");
    await p.waitForFunction(() => /of 5 image\(s\) downloaded/.test((document.querySelector('[data-testid="links-summary"]') || {}).textContent || ""), null, { timeout: 30000 });
    await p.waitForTimeout(200);
    const linkSummary = await p.locator('[data-testid="links-summary"]').textContent();
    check("links downloaded automatically: 3 of 5, 2 failed", /3 of 5 image\(s\) downloaded/.test(linkSummary) && /2 failed/.test(linkSummary), linkSummary);
    const linkWarn = (await p.locator(".ez-alert").allTextContents()).filter((x) => /image link/.test(x));
    check("each failed link says why (404, a web page instead of an image)", linkWarn.some((x) => /Nothing at this link \(404\)/.test(x)) && linkWarn.some((x) => /web page, not an image/.test(x)), linkWarn);
    await sel(p, "Images from links").scrollIntoViewIfNeeded();
    await shot(p, "I21-check-links-downloaded-320-dark", "Check: 3 of 5 images downloaded; the 404 and the web-page link are explained and skipped", { scroll: null });
    const requestsBefore = await p.evaluate(() => window.__harness.internet.requests.length);
    await sel(p, "Images from links").locator('sp-button:has-text("Try the failed links again")').click();
    await p.waitForFunction(() => /of 5 image\(s\) downloaded/.test((document.querySelector('[data-testid="links-summary"]') || {}).textContent || ""), null, { timeout: 30000 });
    const retried = (await p.evaluate(() => window.__harness.internet.requests.length)) - requestsBefore;
    check("retry asks only for the 2 failed links (downloaded images are reused)", retried === 2, retried);
    await click(p, "Next");
    await btn(p, "Generate 3").click();
    await waitForResults(p);
    const dir5 = path.join(OUTS, "scenario-i-links");
    await saveOutputs(p, "Elzoz output I", dir5);
    const shop = psdSummary(dir5);
    const aurora = shop["SH-001_Aurora Laptop 14.psd"];
    check("Shopify rows designed with downloaded photos, sale price and old price (psd-tools)",
        aurora && /^link-.*\.jpg$/.test(aurora.layers["Photo@Media"]) && aurora.layers["Price@Text"] === "1299.00" && aurora.layers["Old price@Text"] === "1500.00" && Object.keys(shop).some((n) => n.startsWith("SH-005_")) && !Object.keys(shop).some((n) => n.startsWith("SH-003_") || n.startsWith("SH-004_")),
        Object.fromEntries(Object.entries(shop).filter(([n]) => n.startsWith("SH-")).map(([n, v]) => [n, { photo: v.layers["Photo@Media"], price: v.layers["Price@Text"], old: v.layers["Old price@Text"] }])));
    await shot(p, "I22-results-links-320-dark", "Results: 3 designs from the Shopify export (2 rows skipped, not charged)");
    acct = await account(email);
    check("only the 3 designed rows charged (65 → 62)", Number(acct.balance.balance) === 62, acct.balance);

    // ---- F6: Google Sheets as the source; QR code and barcode from the SKU column
    await click(p, "New job");
    const gs = p.locator('[data-testid="gsheet"]');
    await gs.locator("input").fill("https://example.com/my-sheet");
    await p.waitForTimeout(100);
    check("a link that isn't Google Sheets is caught before loading", /isn't a Google Sheets link/.test(await gs.textContent()) && (await gs.locator("sp-button").getAttribute("disabled")) !== null);
    await gs.locator("input").fill("https://docs.google.com/spreadsheets/d/PRIVATE0123456789abcdefghij/edit#gid=0");
    await gs.locator('sp-button:has-text("Load")').click();
    await p.waitForSelector(".ez-alert", { timeout: 10000 });
    const privateMsg = await p.locator(".ez-alert").first().textContent();
    check("a private sheet says exactly how to share it", /private.*Anyone with the link.*Viewer/.test(privateMsg), privateMsg);
    await shot(p, "I23-data-google-sheets-private-320-dark", "Data: a private Google Sheet: what to change in Sharing");
    await gs.locator("input").fill("https://docs.google.com/spreadsheets/d/OFFERS0123456789abcdefghij/edit#gid=0");
    await gs.locator('sp-button:has-text("Load")').click();
    await p.waitForFunction(() => /Google Sheets · 5 rows/.test(document.querySelector(".ez-content").textContent), null, { timeout: 10000 });
    const gsName = await p.locator(".ez-content").textContent();
    check("the shared sheet loads with its title, rows and a Reload button", gsName.includes("عروض الأسبوع") && /Google Sheets · 5 rows · 12 columns/.test(gsName) && (await btn(p, "Reload from Google Sheets").count()) === 1, gsName.slice(0, 160));
    await shot(p, "I24-data-google-sheets-320-dark", "Data: loaded from a Google Sheets link (all tabs), with Reload");
    await click(p, "Next");
    await queue(p, { file: "templates/offer-card-1080x1350.psd" });
    await click(p, "Choose PSD");
    await page_wait(p);
    await click(p, "Next");
    await click(p, "Auto-map by name");
    await pickLayerFolder(p, "Photo", "images/products");
    await pickLayerFolder(p, "Logo", "images/logos");
    for (const [layer, kind] of [["QR", "qr"], ["Barcode", "code128"]]) {
        const r = layerRow(p, layer);
        await r.locator("select").first().selectOption("SKU");
        await p.waitForTimeout(100);
        await (await fieldIn(r, "Images come from")).selectOption(kind);
        await p.waitForTimeout(150);
    }
    const qrInfo = await layerRow(p, "QR").locator('[data-testid="code-info"]').textContent();
    check("the QR layer previews row 1's code", /Row 1: ELZ-0001/.test(qrInfo) && (await layerRow(p, "QR").locator("img.ez-code-preview").count()) === 1, qrInfo);
    await layerRow(p, "QR").scrollIntoViewIfNeeded();
    await shot(p, "I25-map-qr-barcode-320-dark", "Map: QR code and Code 128 barcode made from the SKU column (live preview)", { scroll: null });
    await click(p, "Next");
    await field(p, "File names").fill("{SKU}");
    await p.waitForFunction(() => /5 code\(s\) ready|code\(s\) ready/.test((document.querySelector('[data-testid="codes-summary"]') || {}).textContent || ""), null, { timeout: 15000 });
    const codesReady = await p.locator('[data-testid="codes-summary"]').textContent();
    check("codes are made by themselves in Check (10: 5 QR + 5 barcodes)", /10 code\(s\) ready/.test(codesReady), codesReady);
    await click(p, "Next");
    await btn(p, "Generate 5").click();
    await waitForResults(p);
    const dir6 = path.join(OUTS, "scenario-i-codes");
    await saveOutputs(p, "Elzoz output I", dir6);
    const scanned = JSON.parse(execFileSync("python3", ["-c", "import zxingcpp,sys,json\nfrom PIL import Image\nim=Image.open(sys.argv[1]).convert('L')\nprint(json.dumps(sorted([(r.format.name, r.text) for r in zxingcpp.read_barcodes(im)])))", path.join(dir6, "ELZ-0001.jpg")]).toString());
    check("the final design's QR code and barcode both scan to the row's SKU (zxing-cpp on the JPG)", JSON.stringify(scanned) === JSON.stringify([["Code128", "ELZ-0001"], ["QRCode", "ELZ-0001"]]), scanned);
    await shot(p, "I26-results-codes-320-dark", "Results: 5 offer cards from Google Sheets with QR + barcode");
    acct = await account(email);
    check("5 rows charged (62 → 57)", Number(acct.balance.balance) === 57, acct.balance);

    // ---- F7 + F12: smart crop on the subject + remove background (Photoshop's Select Subject / Remove Background, simulated)
    await click(p, "New job");
    await queue(p, { file: "spreadsheets/offers.xlsx" });
    await click(p, "Choose file");
    await click(p, "Next");
    await queue(p, { file: "templates/offer-card-1080x1350.psd" });
    await click(p, "Choose PSD");
    await page_wait(p);
    await click(p, "Next");
    await click(p, "Auto-map by name");
    await pickLayerFolder(p, "Photo", "images/products");
    await pickLayerFolder(p, "Logo", "images/logos");
    const photo = layerRow(p, "Photo");
    await (await fieldIn(photo, "Fit")).selectOption("subject");
    await photo.locator('label:has-text("Remove the background") input').check();
    await p.waitForTimeout(150);
    const photoText = await photo.textContent();
    check("smart crop and remove background explain themselves (and the failure choice)", /Select Subject finds the product or person/.test(photoText) && /If the background can't be removed/.test(photoText), photoText.slice(0, 200));
    await photo.scrollIntoViewIfNeeded();
    await shot(p, "I27-map-smart-crop-remove-bg-320-dark", "Map: Photo fills the frame centred on the subject, background removed", { scroll: null });
    await click(p, "Next");
    await field(p, "File names").fill("subject_{SKU}");
    await field(p, "Rows to generate").fill("2, 6");
    await p.waitForTimeout(200);
    await click(p, "Next");
    await btn(p, "Generate 2").click();
    await waitForResults(p);
    const dir7 = path.join(OUTS, "scenario-i-subject");
    await saveOutputs(p, "Elzoz output I", dir7);
    const bbox = JSON.parse(execFileSync("python3", ["-c", "import json,sys,os\nfrom psd_tools import PSDImage\nout={}\nfor n in ('subject_ELZ-0001.psd','subject_ELZ-0005.psd'):\n  p=PSDImage.open(os.path.join(sys.argv[1],n))\n  out[n]=[list(l.bbox) for l in p.descendants() if l.name=='Photo'][0]\nprint(json.dumps(out))", dir7]).toString());
    // Frame 140..940 × 150..770. The laptop (subject right of centre) moves left as far as the frame allows (-96 px);
    // the speaker's subject is centred, so it stays centred.
    check("smart crop moves the photo towards its subject without uncovering the frame (psd-tools)", bbox["subject_ELZ-0001.psd"][0] === -52 && bbox["subject_ELZ-0005.psd"][0] === 75, bbox); // left edges: laptop pulled left, speaker centred (540 − 930/2)
    const psCalls = await p.evaluate(() => window.__harness.host.env.calls.filter((c) => c.op === "batchPlay" && ["autoCutout", "removeBackground"].includes(c._obj)).map((c) => c._obj));
    check("Select Subject and Remove Background ran once per row", psCalls.filter((c) => c === "autoCutout").length >= 2 && psCalls.filter((c) => c === "removeBackground").length >= 2, psCalls);
    await shot(p, "I28-results-subject-320-dark", "Results: 2 designs with smart crop + background removed (simulated)");
    acct = await account(email);
    check("2 rows charged (57 → 55)", Number(acct.balance.balance) === 55, acct.balance);
    await finishRecording(p, "SIMULATED-scenario-I-features", "Scenario I: new features 1-15 (simulated host)");
});

async function page_wait(p) {
    await p.waitForSelector(".ez-stats, .ez-alert", { timeout: 10000 });
    await p.waitForTimeout(150);
}

(async () => {
    browser = await chromium.launch();
    let failed = 0;
    for (const s of scenarios) {
        if (ONLY.length && !ONLY.includes(s.id)) continue;
        current = { id: s.id, title: s.title, checks: [], error: null, ms: 0 };
        report.scenarios.push(current);
        console.log(`\nScenario ${s.id}: ${s.title}`);
        const t0 = Date.now();
        try {
            await s.fn();
        } catch (e) {
            current.error = e.stack || String(e);
            console.log(`  ✗ ERROR ${e.message}`);
            if (current.page) {
                const file = path.join(ART, `FAILED-scenario-${s.id}.png`);
                await current.page.screenshot({ path: file }).catch(() => {});
                console.log(`    screenshot: ${path.relative(process.cwd(), file)}`);
            }
        }
        current.ms = Date.now() - t0;
        delete current.page;
        if (current.error || current.checks.some((c) => !c.ok)) failed++;
    }
    await browser.close();
    fs.rmSync(path.join(RECS, ".raw"), { recursive: true, force: true });
    report.summary = {
        scenarios: report.scenarios.length,
        failedScenarios: failed,
        checks: report.scenarios.reduce((n, s) => n + s.checks.length, 0),
        failedChecks: report.scenarios.reduce((n, s) => n + s.checks.filter((c) => !c.ok).length, 0),
        consoleOrPageErrors: report.errors.length,
        screenshotsWithLayoutProblems: report.layout.length
    };
    fs.writeFileSync(path.join(REPORTS, ONLY.length ? `e2e-results-${ONLY.join("")}.json` : "e2e-results.json"), JSON.stringify(report, null, 2));
    console.log("\nSUMMARY", JSON.stringify(report.summary));
    if (report.errors.length) console.log("ERRORS", JSON.stringify(report.errors.slice(0, 10), null, 1));
    if (report.layout.length) console.log("LAYOUT", JSON.stringify(report.layout, null, 1));
    server.close();
    process.exit(failed || report.errors.length ? 1 : 0);
})();
