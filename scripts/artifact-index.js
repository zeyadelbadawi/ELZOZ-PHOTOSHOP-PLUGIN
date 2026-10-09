// Writes test-artifacts/screenshots/INDEX.md and test-artifacts/recordings/INDEX.md
// from the last e2e run (test-artifacts/reports/e2e-results.json).
const fs = require("fs");
const path = require("path");
const ART = path.resolve(__dirname, "../test-artifacts");
const r = JSON.parse(fs.readFileSync(path.join(ART, "reports/e2e-results.json"), "utf8"));
const note = "All images and recordings come from the **SIMULATED Photoshop host in Chromium** (banner at the top of each). They show Elzoz's UI and flow, not Adobe Photoshop or UXP rendering.";

const shots = [`# Screenshots (${r.screenshots.length})`, "", note, "", `Run: ${r.generated}. Layout check = automatic test for elements overflowing the panel.`, "", "| File | Scenario | Width | Theme | Lang | What it shows | Layout check |", "|---|---|---|---|---|---|---|"];
for (const s of r.screenshots) shots.push(`| [${s.file}](${encodeURI(s.file)}) | ${s.scenario} | ${s.width || "–"} | ${s.theme || "–"} | ${s.lang || "–"} | ${s.title} | ${s.layoutProblems.length ? s.layoutProblems.join("; ") : "ok"} |`);
fs.writeFileSync(path.join(ART, "screenshots/INDEX.md"), shots.join("\n") + "\n");

const recs = ["# Recordings", "", note, "", "| File | What it shows | Codec | Size | Duration | Full decode (ffmpeg) |", "|---|---|---|---|---|---|"];
for (const v of r.recordings) recs.push(`| [${v.file}](${encodeURI(v.file)}) | ${v.title} | ${v.codec} | ${v.width}×${v.height} | ${v.durationSec.toFixed(1)} s | ${v.decodesCleanly ? "ok" : "FAILED"} |`);
recs.push("| [SIMULATED-scenario-C-rendered-video-row1.mp4](SIMULATED-scenario-C-rendered-video-row1.mp4) | The MOV Elzoz rendered for row 1 (frames drawn by the simulator's canvas renderer), converted to H.264 for easy viewing. The original MOV is in `outputs/e2e/scenario-c/` | h264 | 1080×1920 | 2.0 s | ok |");
fs.writeFileSync(path.join(ART, "recordings/INDEX.md"), recs.join("\n") + "\n");
console.log(`index: ${r.screenshots.length} screenshots, ${r.recordings.length + 1} recordings`);
