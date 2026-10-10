// Downloads the images a job needs from links (feature 8), before the job starts
// (never inside Photoshop's modal state). 4 at a time, 30 s timeout, one retry
// for network errors and 5xx, size limit, and the real file type is checked
// from the bytes. Files are cached for the session in a temporary folder.
import { describeDownloadProblem, linkFileStem, MAX_IMAGE_BYTES, sniffImage } from "../domain/linkImages.js";

export const TIMEOUT_MS = 30000;
const CONCURRENCY = 4;

function withTimeout(promise, ms) {
    let timer;
    return Promise.race([promise, new Promise((_, reject) => (timer = setTimeout(() => reject(Object.assign(new Error("timeout"), { timedOut: true })), ms)))]).finally(() => clearTimeout(timer));
}

async function fetchOnce(fetchImpl, url, timeoutMs) {
    try {
        const res = await withTimeout(fetchImpl(url, { method: "GET", redirect: "follow", credentials: "omit" }), timeoutMs);
        const contentType = (res.headers && res.headers.get && res.headers.get("content-type")) || "";
        const declared = Number((res.headers && res.headers.get && res.headers.get("content-length")) || 0);
        if (!res.ok) return { status: res.status, contentType };
        if (declared > MAX_IMAGE_BYTES) return { status: res.status, contentType, bytes: { length: declared } };
        const bytes = new Uint8Array(await withTimeout(res.arrayBuffer(), timeoutMs));
        return { status: res.status, contentType, bytes };
    } catch (e) {
        return e.timedOut ? { timedOut: true } : { error: e.message || "network error" };
    }
}

/**
 * @param {object} p
 * @param {string[]} p.urls             direct links (see directLink)
 * @param {object} p.folder             UXP folder for the files (temporary)
 * @param {Function} p.fetch            fetch implementation
 * @param {object} [p.known]            earlier results { url: {file}|{error} }; files are reused
 * @param {Function} [p.onProgress]     ({done, total, failed}) after each link
 * @param {{cancelled: boolean}} [p.signal]
 * @returns {Promise<Object<string, {file?: string, error?: string}>>}
 */
export async function downloadLinks({ urls, folder, fetch: fetchImpl, known = {}, onProgress = () => {}, signal = {}, timeoutMs = TIMEOUT_MS }) {
    const results = {};
    const todo = urls.filter((u) => !(known[u] && known[u].file));
    for (const u of urls) if (known[u] && known[u].file) results[u] = known[u];
    let done = urls.length - todo.length;
    let failed = 0;
    onProgress({ done, total: urls.length, failed });
    let next = 0;
    const worker = async () => {
        while (next < todo.length && !signal.cancelled) {
            const url = todo[next++];
            let r = await fetchOnce(fetchImpl, url, timeoutMs);
            if (r.error || r.timedOut || (r.status >= 500 && r.status < 600)) r = await fetchOnce(fetchImpl, url, timeoutMs); // one retry
            const problem = describeDownloadProblem(r);
            if (problem) {
                results[url] = { error: problem };
                failed++;
            } else {
                const name = `${linkFileStem(url)}.${sniffImage(r.bytes)}`;
                try {
                    const file = await folder.createFile(name, { overwrite: true });
                    await file.write(r.bytes.buffer.slice(r.bytes.byteOffset, r.bytes.byteOffset + r.bytes.byteLength));
                    results[url] = { file: name };
                } catch (e) {
                    results[url] = { error: `Couldn't save the image (${e.message}).` };
                    failed++;
                }
            }
            done++;
            onProgress({ done, total: urls.length, failed });
        }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, todo.length) }, worker));
    return results;
}
