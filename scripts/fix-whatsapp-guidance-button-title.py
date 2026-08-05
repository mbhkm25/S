from pathlib import Path

path = Path('supabase/functions/sanad-v3-whatsapp-intake/index.ts')
text = path.read_text(encoding='utf-8')
old = 'title: "كيف يستخدم النشاط سند؟",'
new = 'title: "تشغيل سند للنشاط",'
if text.count(old) != 1:
    raise SystemExit(f'expected one button title, found {text.count(old)}')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
