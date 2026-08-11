from __future__ import annotations

import asyncio
import csv
import io
import os
import re
import subprocess
import tempfile
import time
from collections import OrderedDict
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

MAX_BODY_BYTES = int(os.getenv("SANAD_FAST_OCR_MAX_BODY_BYTES", str(12 * 1024 * 1024)))
CONCURRENCY = max(1, int(os.getenv("SANAD_FAST_OCR_CONCURRENCY", "2")))
TIMEOUT_SECONDS = max(1.0, float(os.getenv("SANAD_FAST_OCR_TIMEOUT_SECONDS", "8")))
LANG = os.getenv("SANAD_FAST_OCR_LANG", "ara+eng")
PRIMARY_PSM = os.getenv("SANAD_FAST_OCR_PSM", "6")
SECONDARY_PSM = os.getenv("SANAD_FAST_OCR_SECONDARY_PSM", "11")
MAX_IMAGE_LONG_SIDE = max(640, int(os.getenv("SANAD_FAST_OCR_MAX_IMAGE_LONG_SIDE", "1600")))
MIN_WORD_CONFIDENCE = max(0.0, min(100.0, float(os.getenv("SANAD_FAST_OCR_MIN_WORD_CONFIDENCE", "25"))))
PDF_DPI = max(72, min(300, int(os.getenv("SANAD_FAST_OCR_PDF_DPI", "150"))))
MAX_PDF_PAGES = max(1, min(3, int(os.getenv("SANAD_FAST_OCR_MAX_PDF_PAGES", "1"))))
NATIVE_PDF_MIN_CHARS = max(24, int(os.getenv("SANAD_FAST_OCR_NATIVE_PDF_MIN_CHARS", "60")))
ADAPTIVE_CONFIDENCE_THRESHOLD = min(0.95, max(0.50, float(os.getenv("SANAD_FAST_OCR_ADAPTIVE_CONFIDENCE_THRESHOLD", "0.80"))))
ADAPTIVE_SIGNAL_THRESHOLD = max(1, min(6, int(os.getenv("SANAD_FAST_OCR_ADAPTIVE_SIGNAL_THRESHOLD", "4"))))
BEARER_TOKEN = os.getenv("SANAD_FAST_OCR_TOKEN", "").strip()

SUPPORTED_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "application/pdf": ".pdf"}
app = FastAPI(title="SANAD Document OCR", version="0.4.0", docs_url=None, redoc_url=None)
_semaphore = asyncio.Semaphore(CONCURRENCY)


class BBox(BaseModel):
    x: float
    y: float
    width: float
    height: float


class OcrBlock(BaseModel):
    text: str
    confidence: float = Field(ge=0.0, le=1.0)
    page: int | None = None
    bbox: BBox | None = None


class EvidenceSignals(BaseModel):
    score: int = Field(ge=0, le=6)
    amount_anchor: bool
    currency_anchor: bool
    reference_anchor: bool
    date_anchor: bool
    identifier_anchor: bool
    entity_anchor: bool


class Candidate(BaseModel):
    value: str
    line: str
    kind: str
    score: float = Field(ge=0.0, le=1.0)


class FieldCandidates(BaseModel):
    amounts: list[Candidate]
    currencies: list[Candidate]
    references: list[Candidate]
    dates: list[Candidate]
    identifiers: list[Candidate]
    entity_hints: list[Candidate]


class OcrResponse(BaseModel):
    provider: str
    raw_text: str
    confidence: float = Field(ge=0.0, le=1.0)
    duration_ms: float
    blocks: list[OcrBlock]
    warnings: list[str]
    document_mode: str
    passes: list[str]
    evidence: EvidenceSignals
    field_candidates: FieldCandidates
    refinement_recommended: bool


def _authorize(authorization: str | None) -> None:
    if BEARER_TOKEN and authorization != f"Bearer {BEARER_TOKEN}":
        raise HTTPException(status_code=401, detail="unauthorized")


def _safe_run(args: list[str], timeout: float) -> subprocess.CompletedProcess[str]:
    return subprocess.run(args, check=True, capture_output=True, text=True, timeout=timeout)


def _norm_digits(text: str) -> str:
    return text.translate(str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789"))


def _clean_number(value: str) -> str:
    return _norm_digits(value).replace("٬", ",").replace("٫", ".").replace(" ", "").strip(".,:؛;")


def _add(items: list[Candidate], value: str, line: str, kind: str, score: float) -> None:
    value = value.strip()
    if not value:
        return
    key = re.sub(r"\s+", "", value.lower())
    if any(re.sub(r"\s+", "", x.value.lower()) == key for x in items):
        return
    items.append(Candidate(value=value, line=line[:240], kind=kind, score=score))


def _field_candidates(text: str) -> FieldCandidates:
    amounts: list[Candidate] = []
    currencies: list[Candidate] = []
    references: list[Candidate] = []
    dates: list[Candidate] = []
    identifiers: list[Candidate] = []
    entities: list[Candidate] = []
    lines = [x.strip() for x in (text or "").splitlines() if x.strip()]

    entity_rules = [
        (r"بن\s*دول|bin\s*dowal", "bin_dowal"),
        (r"البسيري|busairi", "al_busairi"),
        (r"العمقي|alomq[yi]|amqi", "alomqi"),
        (r"الكريمي|حاسب|kuraimi|haseb|fund\s*transfer", "kuraimi_haseb"),
    ]
    for line0 in lines:
        line = _norm_digits(line0)
        low = line.lower()
        for pat, value in entity_rules:
            if re.search(pat, low, re.I):
                _add(entities, value, line0, "entity", 0.98)

        for m in re.finditer(r"(?:المبلغ|مبلغ|amount|الإجمالي|اجمالي|القيمة|قيمة)\s*[:：-]?\s*([0-9][0-9,٬\.٫ ]{0,18})", line, re.I):
            v = _clean_number(m.group(1))
            if re.search(r"\d", v):
                _add(amounts, v, line0, "label_amount", 0.99)
        for m in re.finditer(r"([0-9][0-9,٬\.٫ ]{0,18})\s*(?:ريال\s*(?:يمني|سعودي)?|ر\.?\s*[يس]|SAR|YER|USD|دولار)", line, re.I):
            v = _clean_number(m.group(1))
            if re.search(r"\d", v):
                _add(amounts, v, line0, "currency_adjacent_amount", 0.98)

        currency_rules = [
            (r"ريال\s*سعودي|ر\.?\s*س|\bSAR\b", "SAR"),
            (r"ريال\s*يمني|ر\.?\s*ي|\bYER\b", "YER"),
            (r"دولار|\bUSD\b", "USD"),
        ]
        for pat, value in currency_rules:
            if re.search(pat, line, re.I):
                _add(currencies, value, line0, "currency", 0.99)

        for m in re.finditer(r"\bFT[A-Z0-9]{6,}\b", line, re.I):
            _add(references, m.group(0).upper(), line0, "transfer_reference", 0.995)
        for m in re.finditer(r"\b8-[0-9]{6,12}\b", line):
            _add(references, m.group(0), line0, "document_reference", 0.995)
        label_ref = re.search(r"(?:رقم\s*(?:السند|المرجع|العملية|الحركة)|مرجع|reference|ref)\s*[:：#-]?\s*([A-Z0-9][A-Z0-9\-/]{3,24})", line, re.I)
        if label_ref:
            _add(references, label_ref.group(1), line0, "label_reference", 0.99)

        for m in re.finditer(r"\b(20[0-9]{2}[-/][0-9]{1,2}[-/][0-9]{1,2})\b", line):
            _add(dates, m.group(1), line0, "date_ymd", 0.99)
        for m in re.finditer(r"\b([0-9]{1,2}[-/][0-9]{1,2}[-/]20[0-9]{2})\b", line):
            _add(dates, m.group(1), line0, "date_dmy", 0.99)

        id_match = re.search(r"(?:رقم\s*الحساب|الحساب|حساب|account|wallet|محفظة|بطاقة|بط|هاتف|جوال|iban)\s*[:：#-]?\s*([+A-Z0-9][A-Z0-9+\- ]{5,28})", line, re.I)
        if id_match:
            value = re.sub(r"\s+", "", id_match.group(1)).strip("-:؛;,. ")
            if len(value) >= 6:
                _add(identifiers, value, line0, "labeled_identifier", 0.98)

    return FieldCandidates(
        amounts=amounts[:8], currencies=currencies[:4], references=references[:10],
        dates=dates[:8], identifiers=identifiers[:12], entity_hints=entities[:6],
    )


def _evidence_signals(text: str) -> EvidenceSignals:
    c = _field_candidates(text)
    flags = [bool(c.amounts), bool(c.currencies), bool(c.references), bool(c.dates), bool(c.identifiers), bool(c.entity_hints)]
    return EvidenceSignals(
        score=sum(1 for x in flags if x), amount_anchor=flags[0], currency_anchor=flags[1],
        reference_anchor=flags[2], date_anchor=flags[3], identifier_anchor=flags[4], entity_anchor=flags[5],
    )


def _prepare_image(path: str) -> tuple[str, str | None, list[str]]:
    from PIL import Image, ImageOps
    warnings: list[str] = []
    with Image.open(path) as opened:
        image = ImageOps.exif_transpose(opened)
        if max(image.size) <= MAX_IMAGE_LONG_SIDE:
            return path, None, warnings
        copy = image.convert("RGB")
        copy.thumbnail((MAX_IMAGE_LONG_SIDE, MAX_IMAGE_LONG_SIDE), Image.Resampling.LANCZOS)
        with tempfile.NamedTemporaryFile(prefix="sanad-fast-ocr-scaled-", suffix=".png", delete=False) as handle:
            target = handle.name
        copy.save(target, format="PNG", optimize=False)
        warnings.append("fast_ocr_image_downscaled")
        return target, target, warnings


def _enhance_image(path: str) -> str:
    from PIL import Image, ImageEnhance, ImageFilter, ImageOps
    with Image.open(path) as opened:
        image = ImageOps.exif_transpose(opened).convert("L")
        image = ImageOps.autocontrast(image, cutoff=1)
        image = ImageEnhance.Contrast(image).enhance(1.25)
        image = image.filter(ImageFilter.UnsharpMask(radius=1.2, percent=145, threshold=3))
        if max(image.size) < 1800:
            scale = min(2.0, 1800 / max(image.size))
            if scale > 1.05:
                image = image.resize((int(image.width * scale), int(image.height * scale)), Image.Resampling.LANCZOS)
        with tempfile.NamedTemporaryFile(prefix="sanad-fast-ocr-enhanced-", suffix=".png", delete=False) as handle:
            target = handle.name
        image.save(target, format="PNG", optimize=False)
        return target


def _native_pdf_text(path: str) -> str | None:
    try:
        proc = _safe_run(["pdftotext", "-layout", "-f", "1", "-l", str(MAX_PDF_PAGES), path, "-"], min(TIMEOUT_SECONDS, 5.0))
        text = "\n".join(line.rstrip() for line in proc.stdout.splitlines() if line.strip()).strip()
        normalized = _norm_digits(text)
        if len(normalized) < NATIVE_PDF_MIN_CHARS or len(re.findall(r"\d", normalized)) < 4:
            return None
        return text
    except Exception:
        return None


def _render_pdf(path: str) -> tuple[list[str], list[str]]:
    directory = tempfile.mkdtemp(prefix="sanad-fast-ocr-pdf-")
    prefix = str(Path(directory) / "page")
    warnings = ["fast_ocr_pdf_rasterized"]
    args = ["pdftoppm", "-f", "1", "-l", str(MAX_PDF_PAGES), "-r", str(PDF_DPI), "-png"]
    if MAX_PDF_PAGES == 1:
        args.append("-singlefile")
    args.extend([path, prefix])
    _safe_run(args, TIMEOUT_SECONDS)
    pages = sorted(str(p) for p in Path(directory).glob("page*.png"))
    if not pages:
        raise RuntimeError("fast_ocr_pdf_render_no_pages")
    return pages, warnings


def _int_field(row: dict[str, str | None], name: str) -> int:
    try:
        return int(row.get(name) or 0)
    except (TypeError, ValueError):
        return 0


def _tesseract_page(path: str, page: int, psm: str) -> tuple[list[OcrBlock], list[str], list[str]]:
    proc = _safe_run(["tesseract", path, "stdout", "-l", LANG, "--oem", "1", "--psm", psm, "tsv"], TIMEOUT_SECONDS)
    reader = csv.DictReader(io.StringIO(proc.stdout), delimiter="\t")
    blocks: list[OcrBlock] = []
    warnings: list[str] = []
    line_words: OrderedDict[tuple[int, int, int, int], list[str]] = OrderedDict()
    for row in reader:
        text = str(row.get("text") or "").strip()
        if not text:
            continue
        try:
            conf = float(row.get("conf") or -1)
        except ValueError:
            conf = -1
        if conf < MIN_WORD_CONFIDENCE:
            continue
        key = (page, _int_field(row, "block_num"), _int_field(row, "par_num"), _int_field(row, "line_num"))
        line_words.setdefault(key, []).append(text)
        try:
            bbox = BBox(x=float(row.get("left") or 0), y=float(row.get("top") or 0), width=max(0, float(row.get("width") or 0)), height=max(0, float(row.get("height") or 0)))
        except ValueError:
            bbox = None
        blocks.append(OcrBlock(text=text, confidence=max(0.0, min(1.0, conf / 100.0)), page=page, bbox=bbox))
    lines = [" ".join(words).strip() for words in line_words.values() if words]
    if not blocks:
        warnings.append(f"fast_ocr_psm{psm}_returned_no_text")
    return blocks, lines, warnings


def _line_key(line: str) -> str:
    return re.sub(r"[^\w\u0600-\u06FF]+", "", _norm_digits(line).lower())


def _merge_lines(primary: list[str], secondary: list[str]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for line in [*primary, *secondary]:
        key = _line_key(line)
        if len(key) < 2 or key in seen:
            continue
        seen.add(key)
        out.append(line)
    return out


def _confidence(blocks: list[OcrBlock]) -> float:
    if not blocks:
        return 0.0
    values = sorted((b.confidence for b in blocks), reverse=True)
    keep = values[: max(1, int(len(values) * 0.9))]
    return max(0.0, min(1.0, sum(keep) / len(keep)))


def _needs_secondary(conf: float, e: EvidenceSignals) -> bool:
    # Missing a financial critical anchor is more important than average OCR confidence.
    critical_anchor_missing = not (e.amount_anchor and e.currency_anchor and e.reference_anchor and e.date_anchor)
    return conf < ADAPTIVE_CONFIDENCE_THRESHOLD or e.score < ADAPTIVE_SIGNAL_THRESHOLD or critical_anchor_missing


def _response(provider: str, text: str, conf: float, started: float, blocks: list[OcrBlock], warnings: list[str], mode: str, passes: list[str]) -> OcrResponse:
    evidence = _evidence_signals(text)
    candidates = _field_candidates(text)
    refine = conf < 0.72 or evidence.score < 3 or not (evidence.amount_anchor and evidence.currency_anchor and evidence.reference_anchor)
    if refine:
        warnings.append("document_evidence_still_weak")
    return OcrResponse(
        provider=provider, raw_text=text, confidence=conf, duration_ms=round((time.perf_counter() - started) * 1000, 3),
        blocks=blocks, warnings=sorted(set(warnings)), document_mode=mode, passes=passes,
        evidence=evidence, field_candidates=candidates, refinement_recommended=refine,
    )


def _infer_sync(path: str, content_type: str) -> OcrResponse:
    started = time.perf_counter()
    cleanup_files: list[str] = []
    cleanup_dirs: set[str] = set()
    warnings: list[str] = []
    passes: list[str] = []
    try:
        if content_type == "application/pdf":
            native = _native_pdf_text(path)
            if native:
                return _response("pdf-native-text:pdftotext-layout", native, 0.995, started, [], ["native_pdf_text_used"], "native_pdf_text", ["pdftotext-layout"])
            warnings.append("native_pdf_text_unavailable")
            pages, page_warnings = _render_pdf(path)
            warnings.extend(page_warnings)
            cleanup_files.extend(pages)
            cleanup_dirs.update(str(Path(p).parent) for p in pages)
            mode = "pdf_raster_ocr"
        else:
            prepared, cleanup, image_warnings = _prepare_image(path)
            warnings.extend(image_warnings)
            pages = [prepared]
            if cleanup:
                cleanup_files.append(cleanup)
            mode = "image_ocr"

        blocks: list[OcrBlock] = []
        primary_lines: list[str] = []
        for index, page_path in enumerate(pages):
            b, lines, w = _tesseract_page(page_path, index, PRIMARY_PSM)
            blocks.extend(b); primary_lines.extend(lines); warnings.extend(w)
        passes.append(f"tesseract-psm{PRIMARY_PSM}")
        primary_text = "\n".join(primary_lines)
        primary_conf = _confidence(blocks)
        primary_evidence = _evidence_signals(primary_text)

        secondary_lines: list[str] = []
        secondary_blocks: list[OcrBlock] = []
        if _needs_secondary(primary_conf, primary_evidence):
            warnings.append("adaptive_secondary_pass_triggered")
            for index, page_path in enumerate(pages):
                enhanced = _enhance_image(page_path)
                cleanup_files.append(enhanced)
                b, lines, w = _tesseract_page(enhanced, index, SECONDARY_PSM)
                secondary_blocks.extend(b); secondary_lines.extend(lines); warnings.extend(w)
            passes.append(f"enhanced-tesseract-psm{SECONDARY_PSM}")

        logical_lines = _merge_lines(primary_lines, secondary_lines)
        raw_text = "\n".join(logical_lines)
        conf = max(primary_conf, _confidence(secondary_blocks)) if secondary_blocks else primary_conf
        provider = f"document-ocr:tesseract:{LANG}:adaptive" if secondary_blocks else f"document-ocr:tesseract:{LANG}:primary"
        return _response(provider, raw_text, conf, started, [*blocks, *secondary_blocks], warnings, mode, passes)
    finally:
        for file in cleanup_files:
            Path(file).unlink(missing_ok=True)
        for directory in cleanup_dirs:
            try:
                Path(directory).rmdir()
            except OSError:
                pass


@app.get("/health/live")
async def live() -> dict[str, Any]:
    return {"ok": True, "service": "sanad-document-ocr"}


@app.get("/health/ready")
async def ready() -> JSONResponse:
    try:
        tesseract = _safe_run(["tesseract", "--version"], 3).stdout.splitlines()[0]
        langs = _safe_run(["tesseract", "--list-langs"], 3).stdout
        pdftotext = _safe_run(["pdftotext", "-v"], 3)
        ok = "ara" in langs and "eng" in langs and pdftotext.returncode == 0
        payload = {
            "ok": ok, "service": "sanad-document-ocr", "provider": "adaptive-tesseract-plus-native-pdf",
            "version": tesseract, "document_ocr_version": "0.4.0", "lang": LANG,
            "primary_psm": PRIMARY_PSM, "secondary_psm": SECONDARY_PSM, "pdf_dpi": PDF_DPI,
            "native_pdf_text": True, "field_candidates": True,
            "adaptive_confidence_threshold": ADAPTIVE_CONFIDENCE_THRESHOLD,
            "adaptive_signal_threshold": ADAPTIVE_SIGNAL_THRESHOLD,
            "max_image_long_side": MAX_IMAGE_LONG_SIDE, "concurrency": CONCURRENCY, "text_layout": "logical_lines",
        }
        return JSONResponse(status_code=200 if ok else 503, content=payload)
    except Exception as exc:
        return JSONResponse(status_code=503, content={"ok": False, "error": type(exc).__name__})


@app.post("/v1/ocr", response_model=OcrResponse)
async def ocr(request: Request, authorization: str | None = Header(default=None)) -> OcrResponse:
    _authorize(authorization)
    content_type = (request.headers.get("content-type") or "").split(";", 1)[0].strip().lower()
    suffix = SUPPORTED_TYPES.get(content_type)
    if suffix is None:
        raise HTTPException(status_code=415, detail="unsupported_media_type")
    body = await request.body()
    if not body:
        raise HTTPException(status_code=400, detail="empty_document")
    if len(body) > MAX_BODY_BYTES:
        raise HTTPException(status_code=413, detail="document_too_large")
    async with _semaphore:
        with tempfile.NamedTemporaryFile(prefix="sanad-document-ocr-", suffix=suffix, delete=False) as handle:
            handle.write(body); path = handle.name
        try:
            return await asyncio.to_thread(_infer_sync, path, content_type)
        except subprocess.TimeoutExpired as exc:
            raise HTTPException(status_code=504, detail="document_ocr_timeout") from exc
        except Exception as exc:
            raise HTTPException(status_code=503, detail=f"document_ocr_failed:{type(exc).__name__}") from exc
        finally:
            Path(path).unlink(missing_ok=True)
