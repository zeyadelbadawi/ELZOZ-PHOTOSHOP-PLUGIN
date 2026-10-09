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
    for (const n of names) fs.writeFileSync(path.join(dir, n), Buffer.from(await page.evaluate(([o, f]) => window.__harness.outputBase64(o, f), [outName, n]), "base64"));
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
    await p.locator(".ez-input").last().fill("{row}_{Name}");
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

const btnText = (hasChange, a, b) => (hasChange ? a : b);
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
        }
        current.ms = Date.now() - t0;
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
