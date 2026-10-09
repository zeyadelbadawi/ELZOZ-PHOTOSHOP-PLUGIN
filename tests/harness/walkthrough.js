// Browser walkthrough of the full design and video flows (dev tool).
// Usage: npm run harness && node tests/harness/walkthrough.js
// Needs Playwright (set PLAYWRIGHT_MODULE to its path if it is installed globally).
// Fails on any page error or console error. Chromium is not UXP: layout only.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const path = require("path");
const fs = require("fs");

const HARNESS = "file://" + path.resolve(__dirname, "../../.harness/index.html");
const OUT = path.resolve(__dirname, "../../.harness/shots");
fs.mkdirSync(OUT, { recursive: true });

(async () => {
    const browser = await chromium.launch();
    const errors = [];
    const shot = async (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: false });
    const click = async (page, text) => {
        const el = page.locator(`sp-button:has-text("${text}")`).first();
        await el.click();
        await page.waitForTimeout(150);
    };
    const newPage = async (width, height = 720, query = "") => {
        const page = await browser.newPage({ viewport: { width, height } });
        page.on("pageerror", (e) => errors.push(`pageerror@${width}: ${e.message}`));
        page.on("console", (m) => m.type() === "error" && errors.push(`console@${width}: ${m.text()}`));
        await page.goto(HARNESS + query);
        await page.waitForTimeout(300);
        return page;
    };

    // ---- Design flow at 320 px
    let p = await newPage(320);
    await shot(p, "01-signin-320");
    await click(p, "Continue in developer mode");
    await shot(p, "02-data-empty-320");
    await click(p, "Choose file");
    await shot(p, "03-data-loaded-320");
    await click(p, "Next");
    await click(p, "Choose PSD");
    await shot(p, "04-template-320");
    await click(p, "Next");
    await shot(p, "05-map-empty-320");
    await click(p, "Auto-map by name");
    await shot(p, "06-map-auto-320");
    await click(p, "Choose folder"); // image folder for Photo
    await p.evaluate(() => document.querySelector(".ez-content").scrollTo(0, 400));
    await shot(p, "07-map-folder-320");
    await click(p, "Next");
    await shot(p, "08-check-no-output-320");
    await p.evaluate(() => window.__harness.queueFolder("output"));
    await click(p, "Choose folder");
    await p.locator('label:has-text("PSD") input').check();
    await shot(p, "09-check-ready-320");
    await p.evaluate(() => document.querySelector(".ez-content").scrollTo(0, 2000));
    await shot(p, "10-check-summary-320");
    await click(p, "Next");
    await shot(p, "11-generate-320");
    await click(p, "Generate");
    await p.waitForTimeout(800);
    await shot(p, "12-results-320");
    const outFiles = await p.evaluate(() => [...window.__harness.output.files.keys()]);
    console.log("design outputs:", outFiles.join(", "));

    // ---- Video flow (same page, switch mode)
    await click(p, "New job");
    await p.locator(".ez-segment:has-text('Video')").click();
    await p.waitForTimeout(150);
    await click(p, "Choose file");
    await click(p, "Next");
    await click(p, "Choose PSD");
    await click(p, "Next");
    await click(p, "Auto-map by name");
    await p.evaluate(() => window.__harness.queueFolder("products"));
    await click(p, "Choose folder");
    await click(p, "Next");
    await shot(p, "13-animate-320");
    // animate Name (first text layer) with slide up and Photo with Ken Burns
    const selects = p.locator(".ez-layer .ez-layer-picker select");
    await selects.nth(0).selectOption("slideUp");
    await selects.nth(2).selectOption("kenBurns");
    await p.waitForTimeout(150);
    await shot(p, "14-animate-tracks-320");
    await p.evaluate(() => document.querySelector(".ez-content").scrollTo(0, 3000));
    await click(p, "Preview frame");
    await p.waitForTimeout(400);
    await shot(p, "15-animate-preview-320");
    await click(p, "Next");
    await p.waitForTimeout(150);
    await shot(p, "16-video-check-320");
    await click(p, "Next");
    await click(p, "Render");
    await p.waitForTimeout(3000);
    await shot(p, "17-video-results-320");
    const outVideos = await p.evaluate(() => [...window.__harness.output.files.keys()].filter((n) => n.endsWith(".mov")));
    console.log("video outputs:", outVideos.join(", "));

    // ---- Narrow and wide panels
    for (const w of [260, 520]) {
        const q = await newPage(w, 640);
        await click(q, "Continue in developer mode");
        await click(q, "Choose file");
        await click(q, "Next");
        await click(q, "Choose PSD");
        await click(q, "Next");
        await click(q, "Auto-map by name");
        await shot(q, `20-map-${w}`);
        await click(q, "Next");
        await shot(q, `21-check-${w}`);
        await q.close();
    }

    // ---- Arabic (RTL) and old Photoshop compatibility notice
    const r = await newPage(320, 640, "?ps=23.5.0");
    await r.evaluate(() => localStorage.setItem("elzoz.lang", "ar"));
    await r.reload();
    await r.waitForTimeout(300);
    await shot(r, "30-signin-ar");
    await click(r, "المتابعة في وضع المطوّر");
    await click(r, "اختيار ملف");
    await shot(r, "31-data-ar");
    await click(r, "التالي");
    await click(r, "اختيار PSD");
    await shot(r, "32-template-ar-ps23");

    console.log("ERRORS:", errors.length ? "\n" + errors.join("\n") : "none");
    await browser.close();
    if (errors.length || outFiles.length !== 6 || outVideos.length !== 3) process.exit(1);
})().catch((e) => {
    console.error("WALK FAILED:", e);
    process.exit(1);
});
