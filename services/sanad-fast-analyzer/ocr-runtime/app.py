from __future__ import annotations

import asyncio
import json
import logging
import os
import statistics
import tempfile
import time
from pathlib import Path
from typing import Any, Mapping

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

MAX_BODY_BYTES = int(os.getenv("SANAD_OCR_MAX_BODY_BYTES", str(12 * 1024 * 1024)))
CONCURRENCY = max(1, int(os.getenv("SANAD_OCR_CONCURRENCY", "1")))
CPU_THREADS = max(1, int(os.getenv("SANAD_OCR_CPU_THREADS", "4")))
MAX_IMAGE_LONG_SIDE = max(768, int(os.getenv("SANAD_OCR_MAX_IMAGE_LONG_SIDE", "1800")))
LANG = os.getenv("SANAD_OCR_LANG", "ar")
OCR_VERSION = os.getenv("SANAD_OCR_VERSION", "PP-OCRv5")
ENGINE = os.getenv("SANAD_OCR_ENGINE", "paddle_dynamic")
TEXT_DETECTION_MODEL = os.getenv("SANAD_OCR_TEXT_DETECTION_MODEL", "PP-OCRv5_mobile_det")
TEXT_RECOGNITION_MODEL = os.getenv("SANAD_OCR_TEXT_RECOGNITION_MODEL", "arabic_PP-OCRv5_mobile_rec")
BEARER_TOKEN = os.getenv("SANAD_OCR_TOKEN", "").strip()
MIN_TEXT_SCORE = min(1.0, max(0.0, float(os.getenv("SANAD_OCR_MIN_TEXT_SCORE", "0.35"))))

SUPPORTED_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "application/pdf": ".pdf",
}

logging.basicConfig(level=os.getenv("SANAD_OCR_LOG_LEVEL", "INFO"))
logger = logging.getLogger("sanad-local-ocr")

app = FastAPI(title="SANAD Local OCR", version="0.3.2", docs_url=None, redoc_url=None)
_semaphore = asyncio.Semaphore(CONCURRENCY)
_ocr: Any | None = None
_model_error: str | None = None
_inference_ready = False
_inference_error: str | None = None


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


def _load_model() -> Any:
    global _ocr, _model_error
    if _ocr is not None:
        return _ocr
    try:
        from paddleocr import PaddleOCR

        kwargs: dict[str, Any] = {
            "lang": LANG,
            "ocr_version": OCR_VERSION,
            "text_detection_model_name": TEXT_DETECTION_MODEL,
            "text_recognition_model_name": TEXT_RECOGNITION_MODEL,
            "use_doc_orientation_classify": False,
            "use_doc_unwarping": False,
            "use_textline_orientation": False,
            "device": "cpu",
        }
        if ENGINE:
            kwargs["engine"] = ENGINE
            if ENGINE == "paddle_static":
                kwargs["engine_config"] = {
                    "device_type": "cpu",
                    "cpu_threads": CPU_THREADS,
                    "run_mode": "mkldnn",
                }
        try:
            _ocr = PaddleOCR(**kwargs)
        except TypeError:
            kwargs.pop("engine", None)
            kwargs.pop("engine_config", None)
            _ocr = PaddleOCR(**kwargs)
        _model_error = None
        return _ocr
    except Exception as exc:
        _model_error = _safe_error(exc)
        logger.exception("paddleocr_model_load_failed")
        raise


def _as_json(result: Any) -> dict[str, Any]:
    value = getattr(result, "json", None)
    if callable(value):
        value = value()
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            pass
    if isinstance(value, dict):
        return value
    if isinstance(result, Mapping):
        return dict(result)

    saver = getattr(result, "save_to_json", None)
    if callable(saver):
        with tempfile.TemporaryDirectory(prefix="sanad-ocr-json-") as directory:
            target = Path(directory) / "result.json"
            saver(str(target))
            if target.exists():
                parsed = json.loads(target.read_text(encoding="utf-8"))
                if isinstance(parsed, dict):
                    return parsed
            candidates = sorted(Path(directory).glob("*.json"))
            if candidates:
                parsed = json.loads(candidates[0].read_text(encoding="utf-8"))
                if isinstance(parsed, dict):
                    return parsed

    raise RuntimeError("paddleocr_result_has_no_supported_json_contract")


def _normalize_page(payload: dict[str, Any], page_index: int) -> tuple[list[OcrBlock], list[str]]:
    data = payload.get("res", payload)
    if not isinstance(data, dict):
        raise RuntimeError("paddleocr_result_res_is_not_object")
    texts = list(data.get("rec_texts") or [])
    scores = list(data.get("rec_scores") or [])
    boxes = list(data.get("rec_boxes") or [])
    blocks: list[OcrBlock] = []
    warnings: list[str] = []

    if len(scores) != len(texts):
        warnings.append("ocr_text_score_length_mismatch")
    if boxes and len(boxes) != len(texts):
        warnings.append("ocr_text_box_length_mismatch")

    for index, raw_text in enumerate(texts):
        text = str(raw_text or "").strip()
        if not text:
            continue
        score = _finite_float(scores[index] if index < len(scores) else 0.0)
        score = min(1.0, max(0.0, score))
        if score < MIN_TEXT_SCORE:
            continue
        bbox = _bbox_from_box(boxes[index]) if index < len(boxes) else None
        blocks.append(OcrBlock(text=text, confidence=score, page=page_index, bbox=bbox))
    return blocks, warnings


def _bbox_from_box(raw: Any) -> BBox | None:
    try:
        values = list(raw)
        if len(values) != 4:
            return None
        x1, y1, x2, y2 = (_finite_float(v) for v in values)
        if x2 < x1 or y2 < y1:
            return None
        return BBox(x=x1, y=y1, width=x2 - x1, height=y2 - y1)
    except Exception:
        return None


def _finite_float(value: Any) -> float:
    try:
        parsed = float(value)
        if parsed == parsed and parsed not in (float("inf"), float("-inf")):
            return parsed
    except Exception:
        pass
    return 0.0


def _prepare_image(path: str) -> tuple[str, str | None, str | None]:
    source = Path(path)
    if source.suffix.lower() == ".pdf":
        return path, None, None

    from PIL import Image, ImageOps

    with Image.open(path) as opened:
        image = ImageOps.exif_transpose(opened)
        original = image.size
        if max(original) <= MAX_IMAGE_LONG_SIDE:
            return path, None, f"{original[0]}x{original[1]}"

        copy = image.convert("RGB")
        copy.thumbnail((MAX_IMAGE_LONG_SIDE, MAX_IMAGE_LONG_SIDE), Image.Resampling.LANCZOS)
        resized = copy.size
        with tempfile.NamedTemporaryFile(prefix="sanad-ocr-scaled-", suffix=".jpg", delete=False) as handle:
            target = handle.name
        copy.save(target, format="JPEG", quality=92, optimize=False)
        logger.info(
            "ocr_image_downscaled original=%sx%s resized=%sx%s max_long_side=%s",
            original[0], original[1], resized[0], resized[1], MAX_IMAGE_LONG_SIDE,
        )
        return target, target, f"{original[0]}x{original[1]}->{resized[0]}x{resized[1]}"


def _infer_sync(path: str) -> OcrResponse:
    global _inference_ready, _inference_error
    started = time.perf_counter()
    model = _load_model()
    prepared_path = path
    cleanup_path: str | None = None
    resize_note: str | None = None
    try:
        prepared_path, cleanup_path, resize_note = _prepare_image(path)
        prediction = model.predict(input=prepared_path)
        all_blocks: list[OcrBlock] = []
        warnings: list[str] = []

        for page_index, result in enumerate(prediction):
            payload = _as_json(result)
            blocks, page_warnings = _normalize_page(payload, page_index)
            all_blocks.extend(blocks)
            warnings.extend(page_warnings)

        raw_text = "\n".join(block.text for block in all_blocks)
        scores = [block.confidence for block in all_blocks]
        confidence = statistics.fmean(scores) if scores else 0.0
        if not all_blocks:
            warnings.append("ocr_returned_no_text")
        if resize_note and "->" in resize_note:
            warnings.append("ocr_image_downscaled")

        _inference_ready = True
        _inference_error = None
        return OcrResponse(
            provider=f"paddleocr:{OCR_VERSION}:{LANG}:{TEXT_DETECTION_MODEL}:{TEXT_RECOGNITION_MODEL}:{ENGINE or 'default'}",
            raw_text=raw_text,
            confidence=min(1.0, max(0.0, confidence)),
            duration_ms=round((time.perf_counter() - started) * 1000, 3),
            blocks=all_blocks,
            warnings=sorted(set(warnings)),
        )
    except Exception as exc:
        _inference_ready = False
        _inference_error = _safe_error(exc)
        logger.exception("paddleocr_inference_failed resize=%s", resize_note)
        raise
    finally:
        if cleanup_path:
            Path(cleanup_path).unlink(missing_ok=True)


def _run_canary_sync() -> None:
    from PIL import Image, ImageDraw

    with tempfile.NamedTemporaryFile(prefix="sanad-ocr-canary-", suffix=".png", delete=False) as handle:
        path = handle.name
    try:
        image = Image.new("RGB", (320, 96), "white")
        draw = ImageDraw.Draw(image)
        draw.text((16, 28), "SANAD 12345", fill="black")
        image.save(path, format="PNG")
        _infer_sync(path)
    finally:
        Path(path).unlink(missing_ok=True)


def _safe_error(exc: BaseException) -> str:
    message = " ".join(str(exc).replace("\n", " ").split())
    return f"{type(exc).__name__}: {message[:240]}"


def _authorize(authorization: str | None) -> None:
    if not BEARER_TOKEN:
        return
    if authorization != f"Bearer {BEARER_TOKEN}":
        raise HTTPException(status_code=401, detail="unauthorized")


@app.on_event("startup")
async def warm_model() -> None:
    global _inference_ready, _inference_error
    try:
        await asyncio.to_thread(_load_model)
        await asyncio.to_thread(_run_canary_sync)
        logger.info("paddleocr_startup_canary_ok")
    except Exception as exc:
        _inference_ready = False
        _inference_error = _safe_error(exc)
        logger.exception("paddleocr_startup_canary_failed")


@app.get("/health/live")
async def live() -> dict[str, Any]:
    return {"ok": True, "service": "sanad-local-ocr"}


@app.get("/health/ready")
async def ready() -> JSONResponse:
    ready_state = _ocr is not None and _model_error is None and _inference_ready and _inference_error is None
    payload = {
        "ok": ready_state,
        "model_loaded": _ocr is not None,
        "model_error": _model_error,
        "inference_ready": _inference_ready,
        "inference_error": _inference_error,
        "ocr_version": OCR_VERSION,
        "lang": LANG,
        "engine": ENGINE,
        "text_detection_model": TEXT_DETECTION_MODEL,
        "text_recognition_model": TEXT_RECOGNITION_MODEL,
        "max_image_long_side": MAX_IMAGE_LONG_SIDE,
        "cpu_threads": CPU_THREADS,
        "concurrency": CONCURRENCY,
    }
    return JSONResponse(status_code=200 if ready_state else 503, content=payload)


@app.post("/v1/ocr", response_model=OcrResponse)
async def ocr(request: Request, authorization: str | None = Header(default=None)) -> OcrResponse:
    _authorize(authorization)
    content_type = (request.headers.get("content-type") or "").split(";", 1)[0].strip().lower()
    suffix = SUPPORTED_TYPES.get(content_type)
    if suffix is None:
        raise HTTPException(status_code=415, detail="unsupported_media_type")

    content_length = request.headers.get("content-length")
    if content_length and content_length.isdigit() and int(content_length) > MAX_BODY_BYTES:
        raise HTTPException(status_code=413, detail="document_too_large")

    body = await request.body()
    if not body:
        raise HTTPException(status_code=400, detail="empty_document")
    if len(body) > MAX_BODY_BYTES:
        raise HTTPException(status_code=413, detail="document_too_large")

    async with _semaphore:
        with tempfile.NamedTemporaryFile(prefix="sanad-ocr-", suffix=suffix, delete=False) as handle:
            handle.write(body)
            path = handle.name
        try:
            return await asyncio.to_thread(_infer_sync, path)
        except Exception as exc:
            detail = _safe_error(exc)
            raise HTTPException(status_code=503, detail=f"ocr_inference_failed:{detail}") from exc
        finally:
            Path(path).unlink(missing_ok=True)
