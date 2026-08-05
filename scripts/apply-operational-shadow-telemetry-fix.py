from pathlib import Path

path = Path("supabase/functions/sanad-v3-analyze-operation/index.ts")
source = path.read_text(encoding="utf-8")
old = 'pipeline: "operational_shadow",\n      stage: "orchestrate",'
new = 'pipeline: "analysis",\n      stage: "operational_shadow_orchestrate",'
count = source.count(old)
if count != 2:
    raise RuntimeError(f"expected 2 telemetry anchors, found {count}")
source = source.replace(old, new)
path.write_text(source, encoding="utf-8")
print("Applied operational shadow telemetry fix")
