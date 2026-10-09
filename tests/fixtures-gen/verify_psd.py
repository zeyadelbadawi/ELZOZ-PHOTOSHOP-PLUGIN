"""Independent structural check of the generated PSD templates with psd-tools.

Confirms each file parses, has the expected canvas size, and that layer kinds
(type = text, smartobject, pixel, group) match the fixture manifest. This proves
the files are structurally valid PSDs for a second, unrelated parser. It does
NOT prove that Photoshop opens them without prompts (ag-psd text layers make
Photoshop ask to update text on open; see README of the fixtures).

Usage: python3 tests/fixtures-gen/verify_psd.py test-artifacts/fixtures/templates
"""
import json
import os
import sys

from psd_tools import PSDImage

folder = sys.argv[1]
expected = json.load(open(os.path.join(folder, "ag-psd-readback.json")))
KIND = {"type": "text", "smartobject": "smartObject", "pixel": "pixel", "group": "group"}
report, failures = {}, 0
for name, exp in expected.items():
    psd = PSDImage.open(os.path.join(folder, name))
    layers = []
    def walk(group, prefix):
        # psd-tools iterates bottom-to-top, like the file order
        for layer in group:
            path = "/".join(prefix + [layer.name])
            layers.append({"path": path, "kind": KIND.get(layer.kind, layer.kind), "bbox": list(layer.bbox), "smart_object": layer.kind == "smartobject" and layer.smart_object.filename or None, "text": layer.kind == "type" and layer.text or None})
            if layer.is_group():
                walk(layer, prefix + [layer.name])
    walk(psd, [])
    ok = (psd.width, psd.height) == (exp["width"], exp["height"]) and [(l["path"], l["kind"]) for l in layers] == [(l["path"], l["kind"]) for l in exp["layers"]]
    failures += 0 if ok else 1
    report[name] = {"ok": ok, "size": [psd.width, psd.height], "layers": layers}
    print(("PASS" if ok else "FAIL"), name, f"{psd.width}x{psd.height}", ", ".join(f"{l['path']}:{l['kind']}" for l in layers))
json.dump(report, open(os.path.join(folder, "psd-tools-verification.json"), "w"), indent=2, ensure_ascii=False)
sys.exit(1 if failures else 0)
