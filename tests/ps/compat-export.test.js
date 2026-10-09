import { describe, expect, it } from "vitest";
import { detectCapabilities, parseVersion, versionAtLeast } from "../../src/ps/compat.js";
import { saveOptionsFor } from "../../src/ps/export.js";
import { fitScale } from "../../src/ps/images.js";
import { normalizeText } from "../../src/ps/text.js";

const ps = (version, extra = {}) => ({ app: { version }, ...extra });
const uxp = { versions: { uxp: "uxp-6.4.0" }, storage: {} };

describe("compat", () => {
    it("parses Photoshop and UXP version strings", () => {
        expect(parseVersion("26.11.2")).toEqual([26, 11, 2]);
        expect(parseVersion("uxp-7.2.0")).toEqual([7, 2, 0]);
        expect(versionAtLeast([24, 2, 0], [24, 2])).toBe(true);
        expect(versionAtLeast([24, 1, 9], [24, 2])).toBe(false);
    });
    it.each([
        ["23.2.0", { hostSupported: false, workingCopy: true, domText: false }],
        ["23.5.0", { hostSupported: true, workingCopy: true, domText: false }],
        ["24.2.0", { hostSupported: true, domText: true }],
        ["27.4.0", { hostSupported: true, domText: true }]
    ])("Photoshop %s", (version, expected) => {
        expect(detectCapabilities(ps(version), uxp, {})).toMatchObject(expected);
    });
    it("probes runtime features instead of trusting versions", () => {
        const caps = detectCapabilities(ps("26.0.0", { imaging: { getPixels() {} } }), uxp, { WebAssembly: {}, crypto: { getRandomValues() {} } });
        expect(caps).toMatchObject({ imaging: true, wasm: true, secureRandom: true, secureStorage: false });
    });
});

describe("adapters (pure parts)", () => {
    it("maps export options to Photoshop's documented ranges", () => {
        expect(saveOptionsFor("jpg", { jpgQuality: 20 })).toMatchObject({ quality: 12 });
        expect(saveOptionsFor("png", { pngCompression: -1 })).toEqual({ compression: 0 });
        expect(saveOptionsFor("psd")).toMatchObject({ layers: true, maximizeCompatibility: true });
        expect(() => saveOptionsFor("tiff")).toThrow(/Unsupported/);
    });
    it("computes fit and fill scales", () => {
        const frame = { width: 400, height: 300 };
        expect(fitScale({ width: 800, height: 400 }, frame, "fit")).toBe(0.5);
        expect(fitScale({ width: 800, height: 400 }, frame, "fill")).toBe(0.75);
        expect(fitScale({ width: 800, height: 400 }, frame, "none")).toBe(1);
        expect(() => fitScale({ width: 0, height: 10 }, frame, "fit")).toThrow();
    });
    it("converts line breaks to Photoshop paragraph breaks", () => {
        expect(normalizeText("a\r\nb\nc")).toBe("a\rb\rc");
        expect(normalizeText(null)).toBe("");
    });
});
