$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$TessDir = Join-Path $Root 'assets\tessdata'
$FontsDir = Join-Path $Root 'assets\fonts'
$TestDir = Join-Path $Root 'assets\test'
New-Item -ItemType Directory -Force -Path $TessDir, $FontsDir, $TestDir | Out-Null

function Download-File([string]$Url, [string]$Destination) {
    Write-Host "Downloading $Url"
    Invoke-WebRequest -Uri $Url -OutFile $Destination -UseBasicParsing
    if (-not (Test-Path $Destination) -or (Get-Item $Destination).Length -eq 0) {
        throw "Failed to download $Url"
    }
}

Download-File 'https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/ara.traineddata' (Join-Path $TessDir 'ara.traineddata')
Download-File 'https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/main/eng.traineddata' (Join-Path $TessDir 'eng.traineddata')
Download-File 'https://raw.githubusercontent.com/google/fonts/main/ofl/notosansarabic/NotoSansArabic%5Bwdth%2Cwght%5D.ttf' (Join-Path $FontsDir 'NotoSansArabic.ttf')

if (Get-Command py -ErrorAction SilentlyContinue) {
    $PythonExe = 'py'
    $PythonPrefix = @('-3')
} elseif (Get-Command python -ErrorAction SilentlyContinue) {
    $PythonExe = 'python'
    $PythonPrefix = @()
} elseif (Get-Command python3 -ErrorAction SilentlyContinue) {
    $PythonExe = 'python3'
    $PythonPrefix = @()
} else {
    throw 'Python 3 is not installed or not available in PATH.'
}

$Notice = Join-Path $TestDir 'notice.png'
$Code = @'
import sys
from PIL import Image, ImageDraw, ImageFont
out=sys.argv[1]
img=Image.new('RGB',(1200,900),'white')
d=ImageDraw.Draw(img)
try:
    font=ImageFont.truetype('arial.ttf',52)
except Exception:
    font=ImageFont.load_default()
lines=['SANAD OCR TEST','Amount 50000 YER','Reference 87542136','2026-08-11']
y=100
for line in lines:
    d.text((100,y),line,fill='black',font=font)
    y+=120
img.save(out)
'@

$TempPy = Join-Path $env:TEMP 'sanad-local-make-notice.py'
Set-Content -Path $TempPy -Value $Code -Encoding UTF8
try {
    $Args = @($PythonPrefix) + @($TempPy, $Notice)
    & $PythonExe @Args
    if ($LASTEXITCODE -ne 0) { throw 'Failed to create OCR test fixture.' }
} finally {
    Remove-Item $TempPy -Force -ErrorAction SilentlyContinue
}

Write-Host 'SANAD Local assets prepared for Windows.'
