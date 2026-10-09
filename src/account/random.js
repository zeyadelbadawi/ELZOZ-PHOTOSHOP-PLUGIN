// Cryptographically secure identifiers (UXP exposes crypto.getRandomValues /
// crypto.randomUUID from UXP 6.2). There is deliberately no Math.random fallback.

export function secureUuid(cryptoImpl = globalThis.crypto) {
    if (cryptoImpl && typeof cryptoImpl.randomUUID === "function") return cryptoImpl.randomUUID();
    if (!cryptoImpl || typeof cryptoImpl.getRandomValues !== "function") {
        throw new Error("Secure random numbers are not available in this Photoshop version.");
    }
    const b = cryptoImpl.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
