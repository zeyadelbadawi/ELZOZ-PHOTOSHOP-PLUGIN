// Google Sheets as a source (feature 6). A sheet shared as "Anyone with the
// link can view" (or published to the web) is downloaded as .xlsx, so every
// tab comes along and the normal spreadsheet reader is used. Pure helpers.

/** What kind of Google Sheets link this is; null if it isn't one. */
export function parseSheetLink(raw) {
    const s = String(raw ?? "").trim();
    let m = s.match(/^https?:\/\/docs\.google\.com\/spreadsheets\/d\/e\/([\w-]+)/i);
    if (m) return { kind: "published", id: m[1] };
    m = s.match(/^https?:\/\/docs\.google\.com\/spreadsheets\/(?:u\/\d+\/)?d\/([\w-]{20,})/i);
    if (m) return { kind: "doc", id: m[1] };
    return null;
}

export function exportUrl(link) {
    return link.kind === "published" ? `https://docs.google.com/spreadsheets/d/e/${link.id}/pub?output=xlsx` : `https://docs.google.com/spreadsheets/d/${link.id}/export?format=xlsx`;
}

/** The sheet's title from the download's Content-Disposition header ("Offers.xlsx" → "Offers"). */
export function titleFromDisposition(header) {
    const h = String(header || "");
    let m = h.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
    let name = null;
    if (m) {
        try {
            name = decodeURIComponent(m[1].trim());
        } catch (e) {
            name = null;
        }
    }
    if (!name) {
        m = h.match(/filename\s*=\s*"([^"]+)"/i) || h.match(/filename\s*=\s*([^;]+)/i);
        name = m ? m[1].trim() : null;
    }
    return name ? name.replace(/\.xlsx$/i, "") : null;
}

/** Why the download isn't a spreadsheet, in plain words. null if it is (a .xlsx is a ZIP: "PK"). */
export function sheetProblem({ status = null, bytes = null, timedOut = false, error = null }) {
    if (timedOut) return "Google Sheets didn't answer in time. Check the internet connection and try again.";
    if (error) return `Couldn't reach Google Sheets (${error}).`;
    if (status === 401 || status === 403) return 'This sheet is private. In Google Sheets: Share → General access → "Anyone with the link" → Viewer, then try again.';
    if (status === 404) return "No sheet at this link. Copy the link again from the browser's address bar.";
    if (status && (status < 200 || status >= 300)) return `Google Sheets answered ${status}. Try again in a minute.`;
    if (!bytes || bytes.length < 4) return "Google Sheets sent an empty file.";
    if (!(bytes[0] === 0x50 && bytes[1] === 0x4b)) return 'This sheet is private (Google asked for a login). In Google Sheets: Share → General access → "Anyone with the link" → Viewer, then try again.';
    return null;
}
