"""
Writes hiding slots / hint zones / ambient positions for a world into its scene.json.

    python scripts/place-slots.py <slug> <spec.json> [--activate]

spec.json:
{
  "targets": {
    "<targetId>": [
      {"x": 0.30, "y": 0.66, "scale": 0.06, "layer": "front", "flip": false,
       "hint": {"x": 0.30, "y": 0.64, "r": 0.09}, "hintText": {"en": "...", "he": "..."}},
      { ...variant B... }
    ]
  },
  "ambient": { "<ambientId>": {"x": 0.24, "y": 0.30, "w": 0.05, "h": 0.18} }
}
Coordinates are fractions of the art (x right, y down); slot x/y is the child's centre,
scale is the child's height as a fraction of the art height.
"""
import json, sys

args = [a for a in sys.argv[1:] if not a.startswith("--")]
if len(args) < 2:
    print(__doc__)
    sys.exit(1)
slug, spec_path = args[0], args[1]
activate = "--activate" in sys.argv
path = f"content/scenes/{slug}/scene.json"
scene = json.load(open(path, encoding="utf-8"))
spec = json.load(open(spec_path, encoding="utf-8"))

for target in scene["targets"]:
    variants = spec["targets"].get(target["id"])
    if not variants:
        continue
    new_slots = []
    for i, v in enumerate(variants):
        old = target["slots"][i] if i < len(target["slots"]) else target["slots"][0]
        slot = dict(old)
        slot["id"] = f"{slug}_{target['id']}_{'a' if i == 0 else 'b'}"
        slot["x"], slot["y"], slot["scale"] = v["x"], v["y"], v.get("scale", old.get("scale", 0.06))
        if v.get("layer") == "behindForeground":
            slot["layer"] = "behindForeground"
        else:
            slot.pop("layer", None)
        if v.get("flip"):
            slot["flip"] = True
        else:
            slot.pop("flip", None)
        if "rotation" in v:
            slot["rotation"] = v["rotation"]
        if "zIndex" in v:
            slot["zIndex"] = v["zIndex"]
        hint = v.get("hint") or {"x": v["x"], "y": v["y"], "r": 0.09}
        slot["hintZone"] = {"x": hint["x"], "y": hint["y"], "r": hint.get("r", 0.09)}
        if "hintText" in v:
            slot["hintText"] = v["hintText"]
        new_slots.append(slot)
    target["slots"] = new_slots

for amb in scene.get("ambient", []):
    pos = spec.get("ambient", {}).get(amb["id"])
    if pos:
        amb.update({k: pos[k] for k in ("x", "y", "w", "h") if k in pos})

if "bonus" in spec and scene.get("bonus"):
    b = spec["bonus"]
    scene["bonus"]["slots"] = [{"x": s["x"], "y": s["y"]} for s in b["slots"]]
    if "scale" in b:
        scene["bonus"]["scale"] = b["scale"]

if activate:
    scene["active"] = True

json.dump(scene, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
open(path, "a", encoding="utf-8").write("\n")
print(f"{slug}: slots written for {list(spec['targets'].keys())}; active={scene['active']}")
