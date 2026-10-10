// Smart crop on the subject (feature 12). Pure geometry: after an image fills
// its frame, move it so the subject Photoshop found (Select Subject) sits in
// the frame, without ever uncovering part of the frame.

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * @param {{left, top, right, bottom}} frame    the layer's frame
 * @param {{left, top, right, bottom}} image    the placed image (covers the frame)
 * @param {{left, top, right, bottom}} subject  Select Subject's bounds
 * @returns {{dx: number, dy: number, keptTop: boolean}}
 *   keptTop: the subject is taller than the frame, so its top (faces, heads) is kept in view
 */
export function subjectShift(frame, image, subject) {
    const fw = frame.right - frame.left;
    const fh = frame.bottom - frame.top;
    const sw = subject.right - subject.left;
    const sh = subject.bottom - subject.top;
    // Allowed moves keep the image covering the frame.
    const minDx = frame.right - image.right;
    const maxDx = frame.left - image.left;
    const minDy = frame.bottom - image.bottom;
    const maxDy = frame.top - image.top;
    let dx;
    let dy;
    let keptTop = false;
    if (sw <= fw) dx = (frame.left + frame.right) / 2 - (subject.left + subject.right) / 2;
    else dx = (frame.left + frame.right) / 2 - (subject.left + subject.right) / 2; // wider than the frame: centre it anyway
    if (sh <= fh) dy = (frame.top + frame.bottom) / 2 - (subject.top + subject.bottom) / 2;
    else {
        // Taller than the frame: keep the top of the subject, with a little headroom.
        dy = frame.top + fh * 0.05 - subject.top;
        keptTop = true;
    }
    return { dx: Math.round(clamp(dx, Math.min(minDx, maxDx), Math.max(minDx, maxDx))), dy: Math.round(clamp(dy, Math.min(minDy, maxDy), Math.max(minDy, maxDy))), keptTop };
}

/** True when Select Subject's result is usable (not empty, not the whole image by accident). */
export function usableSubject(subject, image) {
    if (!subject) return false;
    const sw = subject.right - subject.left;
    const sh = subject.bottom - subject.top;
    if (!(sw > 2 && sh > 2)) return false;
    const iw = image.right - image.left;
    const ih = image.bottom - image.top;
    return !(sw >= iw * 0.98 && sh >= ih * 0.98);
}
