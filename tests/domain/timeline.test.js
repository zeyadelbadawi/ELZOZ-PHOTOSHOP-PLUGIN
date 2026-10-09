import { describe, expect, it } from "vitest";
import { aspectMatches, buildTimeline, EASINGS, FORMATS, frameState, PRESETS, videoUnits } from "../../src/domain/video/timeline.js";

const spec = (o = {}) => ({ format: "reel", fps: 30, durationMs: 6000, tracks: [{ layerId: 1, preset: "fadeIn", startMs: 0, lengthMs: 1000 }], ...o });

describe("buildTimeline", () => {
    it("computes frame count and exact duration", () => {
        const { ok, timeline } = buildTimeline(spec());
        expect(ok).toBe(true);
        expect(timeline).toMatchObject({ width: 1080, height: 1920, fps: 30, frameCount: 180, durationMs: 6000 });
        expect(buildTimeline(spec({ fps: 24, durationMs: 3010 })).timeline.frameCount).toBe(72);
    });

    it.each([
        [{ format: "8k" }, "bad_format"],
        [{ fps: 60 }, "bad_fps"],
        [{ durationMs: 500 }, "bad_duration"],
        [{ durationMs: 61000 }, "bad_duration"],
        [{ fadeOutMs: 4000 }, "bad_fade"],
        [{ tracks: [{ layerId: 1, preset: "spin" }] }, "bad_preset"],
        [{ tracks: [{ layerId: 1, preset: "fadeIn", startMs: 5500, lengthMs: 1000 }] }, "track_overflow"],
        [{ tracks: [{ layerId: 1, preset: "fadeIn" }, { layerId: 1, preset: "zoomIn" }] }, "duplicate_track"],
        [{ tracks: [{ layerId: 1, preset: "fadeIn", easing: "bounce" }] }, "bad_easing"]
    ])("rejects invalid config %j", (o, code) => {
        const r = buildTimeline(spec(o));
        expect(r.ok).toBe(false);
        expect(r.errors.map((e) => e.code)).toContain(code);
    });
});

describe("easing and presets", () => {
    it("every easing starts at 0 and ends at 1", () => {
        for (const [name, f] of Object.entries(EASINGS)) {
            expect(f(0), name).toBeCloseTo(0, 6);
            expect(f(1), name).toBeCloseTo(1, 6);
        }
    });
    it("every preset ends at the designed state (opacity 1, no offset, 100%) except Ken Burns", () => {
        for (const [name, p] of Object.entries(PRESETS)) {
            if (name === "kenBurns") continue;
            const s = p.at(1, 0.2);
            expect(s, name).toEqual({ opacity: 1, dx: 0, dy: 0, scale: 1 });
        }
    });
});

describe("frameState", () => {
    it("animates a slide-up with easing and holds after it ends", () => {
        const { timeline } = buildTimeline(spec({ tracks: [{ layerId: 7, preset: "slideUp", startMs: 1000, lengthMs: 1000, easing: "linear", distance: 0.1 }] }));
        expect(frameState(timeline, 0)).toEqual([{ layerId: 7, opacity: 0, dx: 0, dy: 192, scale: 1 }]);
        expect(frameState(timeline, 45)[0]).toMatchObject({ opacity: 0.5, dy: 96 }); // t = 1.5 s
        expect(frameState(timeline, 60)[0]).toMatchObject({ opacity: 1, dy: 0 });
        expect(frameState(timeline, 179)[0]).toMatchObject({ opacity: 1, dy: 0 });
    });
    it("applies the global fade-out on the last frames", () => {
        const { timeline } = buildTimeline(spec({ fadeOutMs: 1000 }));
        expect(frameState(timeline, 150)[0].opacity).toBe(1); // t = 5.0 s, fade starts
        expect(frameState(timeline, 165)[0].opacity).toBeCloseTo(0.5, 5);
    });
    it("Ken Burns spans the whole clip regardless of start/length", () => {
        const { timeline } = buildTimeline(spec({ tracks: [{ layerId: 2, preset: "kenBurns", startMs: 3000, lengthMs: 100, easing: "linear" }] }));
        expect(frameState(timeline, 0)[0].scale).toBe(1);
        expect(frameState(timeline, 90)[0].scale).toBeCloseTo(1.06, 5);
    });
});

describe("helpers", () => {
    it("matches template aspect ratios", () => {
        expect(aspectMatches(2160, 3840, FORMATS.reel)).toBe(true);
        expect(aspectMatches(1000, 1000, FORMATS.reel)).toBe(false);
    });
    it("mirrors server pricing units", () => {
        expect(videoUnits(6000, 1080, 1920)).toBe(2);
        expect(videoUnits(5000, 1080, 1080)).toBe(1);
        expect(videoUnits(6000, 3840, 2160)).toBe(4);
    });
});
