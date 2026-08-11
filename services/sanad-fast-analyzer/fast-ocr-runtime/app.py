from __future__ import annotations

import asyncio
import csv
import io
import os
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

MAX_BODY_BYTES = int(os.getenv("SANAD_FAST_OCR_MAX_BODY_BYTES", str(12 * 1024 * 1024)))
CONCURRENCY = max(1, int(os.getenv("SANAD_FAST_OCR_CONCURRENCY", "2")))
TIMEOUT_SECONDS = max(1.0, float(os.getenv("SANAD_FAST_OCR_TIMEOUT_SECONDS", "8")))
LANG = os.getenv("SANAD_FAST_OCR_LANG", "ara+eng")
PSM = os.getenv("SANAD_FAST_OCR_PSM", "6")
MAX_IMAGE_LONG_SIDE = max(640, int(os.getenv("SANAD_FAST_OCR_MAX_IMAGE_LONG_SIDE", "1600")))
MIN_WORD_CONFIDENCE = max(0.0, min(100.0, float(os.getenv("SANAD_FAST_OCR_MIN_WORD_CONFIDENCE", "25"))))
PDF_DPI = max(72, min(300, int(os.getenv("SANAD_FAST_OCR_PDF_DPI", "150"))))
MAX_PDF_PAGES = max(1, min(3, int(os.getenv("SANAD_FAST_OCR_MAX_PDF_PAGES", "1"))))
BEARER_TOKEN = os.getenv("SANAD_FAST_OCR_TOKEN", "").strip()

SUPPORTED_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "application/pdf": ".pdf",
}

app = FastAPI(title="SANAD Fast OCR", version="0.1.0", docs_url=None, redoc_url=None)
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


class OcrResponse(BaseModel):
    provider: str
    raw_text: str
    confidence: float = Field(ge=0.0, le=1.0)
    duration_ms: float
    blocks: list[OcrBlock]
    warnings: list[str]


def _authorize(authorization: str | None) -> None:
    if BEARER_TOKEN and authorization != f"Bearer {BEARER_TOKEN}":
        raise HTTPException(status_code=401, detail="unauthorized")


def _safe_run(args: list[str], timeout: float) -> subprocess.CompletedProcess[str]:
    return subprocess.run(args, check=True, capture_output=True, text=True, timeout=timeout)


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


def _render_pdf(path: str) -> tuple[list[str], list[str]]:
    directory = tempfile.mkdtemp(prefix="sanad-fast-ocr-pdf-")
    prefix = str(Path(directory) / "page")
    warnings: list[str] = ["fast_ocr_pdf_rasterized"]
    try:
        _safe_run([
            "pdftoppm", "-f", "1", "-l", str(MAX_PDF_PAGES), "-r", str(PDF_DPI),
            "-png", "-singlefile" if MAX_PDF_PAGES == 1 else "-progress", path, prefix,
        ], TIMEOUT_SECONDS)
    except subprocess.CalledProcessError:
        # pdftoppm's -singlefile cannot be mixed with multi-page mode; use a clean retry.
        args = ["pdftoppm", "-f", "1", "-l", str(MAX_PDF_PAGES), "-r", str(PDF_DPI), "-png"]
        if MAX_PDF_PAGES == 1:
            args.append("-singlefile")
        args.extend([path, prefix])
        _safe_run(args, TIMEOUT_SECONDS)
    pages = sorted(str(p) for p in Path(directory).glob("page*.png"))
    if not pages:
        raise RuntimeError("fast_ocr_pdf_render_no_pages")
    return pages, warnings


def _tesseract_page(path: str, page: int) -> tuple[list[OcrBlock], list[str]]:
    proc = _safe_run([
        "tesseract", path, "stdout", "-l", LANG, "--oem", "1", "--psm", PSM, "tsv"
    ], TIMEOUT_SECONDS)
    reader = csv.DictReader(io.StringIO(proc.stdout), delimiter="\t")
    blocks: list[OcrBlock] = []
    warnings: list[str] = []
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
        try:
            left = float(row.get("left") or 0)
            top = float(row.get("top") or 0)
            width = float(row.get("width") or 0)
            height = float(row.get("height") or 0)
            bbox = BBox(x=left, y=top, width=max(0, width), height=max(0, height))
        except ValueError:
            bbox = None
        blocks.append(OcrBlock(text=text, confidence=max(0.0, min(1.0, conf / 100.0)), page=page, bbox=bbox))
    if not blocks:
        warnings.append("fast_ocr_returned_no_text")
    return blocks, warnings


def _infer_sync(path: str, content_type: str) -> OcrResponse:
    started = time.perf_counter()
    cleanup_files: list[str] = []
    cleanup_dirs: set[str] = set()
    warnings: list[str] = []
    try:
        if content_type == "application/pdf":
            pages, page_warnings = _render_pdf(path)
            warnings.extend(page_warnings)
            cleanup_files.extend(pages)
            cleanup_dirs.update(str(Path(p).parent) for p in pages)
        else:
            prepared, cleanup, image_warnings = _prepare_image(path)
            warnings.extend(image_warnings)
            pages = [prepared]
            if cleanup:
                cleanup_files.append(cleanup)

        blocks: list[OcrBlock] = []
        for index, page_path in enumerate(pages):
            page_blocks, page_warnings = _tesseract_page(page_path, index)
            blocks.extend(page_blocks)
            warnings.extend(page_warnings)

        raw_text = "\n".join(block.text for block in blocks)
        confidence = sum(block.confidence for block in blocks) / len(blocks) if blocks else 0.0
        return OcrResponse(
            provider=f"tesseract:{LANG}:psm{PSM}",
            raw_text=raw_text,
            confidence=max(0.0, min(1.0, confidence)),
            duration_ms=round((time.perf_counter() - started) * 1000, 3),
            blocks=blocks,
            warnings=sorted(set(warnings)),
        )
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
    return {"ok": True, "service": "sanad-fast-ocr"}


@app.get("/health/ready")
async def ready() -> JSONResponse:
    try:
        tesseract = _safe_run(["tesseract", "--version"], 3).stdout.splitlines()[0]
        langs = _safe_run(["tesseract", "--list-langs"], 3).stdout
        ok = "ara" in langs and "eng" in langs
        payload = {
            "ok": ok,
            "provider": "tesseract",
            "version": tesseract,
            "lang": LANG,
            "psm": PSM,
            "pdf_dpi": PDF_DPI,
            "max_image_long_side": MAX_IMAGE_LONG_SIDE,
            "concurrency": CONCURRENCY,
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
        with tempfile.NamedTemporaryFile(prefix="sanad-fast-ocr-", suffix=suffix, delete=False) as handle:
            handle.write(body)
            path = handle.name
        try:
            return await asyncio.to_thread(_infer_sync, path, content_type)
        except subprocess.TimeoutExpired as exc:
            raise HTTPException(status_code=504, detail="fast_ocr_timeout") from exc
        except Exception as exc:
            raise HTTPException(status_code=503, detail=f"fast_ocr_failed:{type(exc).__name__}") from exc
        finally:
            Path(path).unlink(missing_ok=True)
