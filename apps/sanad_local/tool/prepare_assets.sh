#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mkdir -p "$ROOT/assets/tessdata" "$ROOT/assets/fonts" "$ROOT/assets/test"

curl -fL --retry 3 --retry-delay 2 \
  https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/ara.traineddata \
  -o "$ROOT/assets/tessdata/ara.traineddata"
curl -fL --retry 3 --retry-delay 2 \
  https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/eng.traineddata \
  -o "$ROOT/assets/tessdata/eng.traineddata"

curl -fL --retry 3 --retry-delay 2 \
  'https://raw.githubusercontent.com/google/fonts/main/ofl/notosansarabic/NotoSansArabic%5Bwdth%2Cwght%5D.ttf' \
  -o "$ROOT/assets/fonts/NotoSansArabic.ttf"

python3 - "$ROOT/assets/test/notice.png" <<'PY'
import sys
from PIL import Image, ImageDraw, ImageFont
out=sys.argv[1]
img=Image.new('RGB',(1200,900),'white')
d=ImageDraw.Draw(img)
try:
    font=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',52)
except Exception:
    font=ImageFont.load_default()
lines=['SANAD OCR TEST','Amount 50000 YER','Reference 87542136','2026-08-11']
y=100
for line in lines:
    d.text((100,y),line,fill='black',font=font)
    y+=120
img.save(out)
PY

echo "SANAD Local assets prepared"
