// Independent check of exported PSDs: psd-tools (Python) reads every file in a
// folder and reports, per layer "Name@Parent", the text of type layers and
// the embedded file name of Smart Objects.
import { execFileSync } from "node:child_process";

const SCRIPT = `
import json,sys,os
from psd_tools import PSDImage
out={}
for n in sorted(os.listdir(sys.argv[1])):
    if not n.endswith('.psd'): continue
    p=PSDImage.open(os.path.join(sys.argv[1],n))
    out[n]={l.name+('@'+l.parent.name if l.parent is not None and l.parent.name else ''):(l.text if l.kind=='type' else (l.smart_object.filename if l.kind=='smartobject' else l.kind)) for l in p.descendants()}
print(json.dumps(out,ensure_ascii=False))`;

export const hasPsdTools = (() => {
    try {
        execFileSync("python3", ["-c", "import psd_tools"], { stdio: "ignore" });
        return true;
    } catch (e) {
        return false;
    }
})();

export const psdSummary = (dir) => JSON.parse(execFileSync("python3", ["-c", SCRIPT, dir]).toString());
