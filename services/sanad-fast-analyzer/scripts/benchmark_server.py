#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import mimetypes
import statistics
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any

CRITICAL_FIELDS = (
    "financialEntity",
    "amount",
    "currency",
    "documentReference",
)


def normalize_text(value: Any) -> str:
    if value is None:
        return ""
    return " ".join(str(value).strip().lower().split())


def normalize_amount(value: Any) -> str:
    if value is None:
        return ""
    try:
        number = float(str(value).replace(",", "").strip())
        return f"{number:.6f}".rstrip("0").rstrip(".")
    except Exception:
        return normalize_text(value)


def field_equal(field: str, expected: Any, actual: Any) -> bool:
    if expected is None:
        return True
    if field == "amount":
        return normalize_amount(expected) == normalize_amount(actual)
    return normalize_text(expected) == normalize_text(actual)


def percentile(values: list[float], q: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = max(0, min(len(ordered) - 1, int((len(ordered) * q + 0.999999) // 1) - 1))
    return ordered[index]


def infer_mime(path: Path, declared: str | None) -> str:
    if declared:
        return declared
    guessed, _ = mimetypes.guess_type(path.name)
    return guessed or "application/octet-stream"


def post_document(url: str, path: Path, mime: str, operation_id: str | None, timeout: float) -> tuple[int, dict[str, Any], float]:
    body = path.read_bytes()
    headers = {
        "Content-Type": mime,
        "X-SANAD-Filename": path.name,
    }
    if operation_id:
        headers["X-SANAD-Operation-ID"] = operation_id
    request = urllib.request.Request(url, data=body, headers=headers, method="POST")
    started = time.perf_counter()
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            payload = json.loads(response.read().decode("utf-8"))
            return int(response.status), payload, (time.perf_counter() - started) * 1000
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        try:
            payload = json.loads(raw)
        except Exception:
            payload = {"ok": False, "error": raw}
        return int(exc.code), payload, (time.perf_counter() - started) * 1000


def extraction_field(extraction: dict[str, Any], field: str) -> Any:
    aliases = {
        "financialEntity": ("financialEntity", "financial_entity"),
        "amount": ("amount",),
        "currency": ("currency",),
        "documentReference": ("documentReference", "document_reference", "transferReference", "transfer_reference"),
        "transactionDatetime": ("transactionDatetime", "transaction_datetime"),
    }
    for key in aliases.get(field, (field,)):
        if key in extraction:
            return extraction.get(key)
    return None


def run_case(case: dict[str, Any], corpus_dir: Path, analyzer_url: str, timeout: float) -> dict[str, Any]:
    case_id = str(case.get("id") or case.get("operationId") or case.get("file"))
    relative = Path(str(case["file"]))
    path = (corpus_dir / relative).resolve()
    if corpus_dir.resolve() not in path.parents and path != corpus_dir.resolve():
        raise ValueError(f"case {case_id}: file escapes corpus directory")
    if not path.is_file():
        return {"id": case_id, "file": str(relative), "error": "file_not_found"}

    mime = infer_mime(path, case.get("mimeType"))
    status_code, payload, wall_ms = post_document(
        analyzer_url,
        path,
        mime,
        str(case.get("operationId")) if case.get("operationId") else None,
        timeout,
    )
    result = payload.get("result") if isinstance(payload, dict) else None
    extraction = (result or {}).get("extraction") or {}
    expected = case.get("expected") or {}
    field_results: dict[str, bool] = {}
    for field, expected_value in expected.items():
        field_results[field] = field_equal(field, expected_value, extraction_field(extraction, field))

    critical_considered = [f for f in CRITICAL_FIELDS if f in expected]
    critical_correct = sum(1 for f in critical_considered if field_results.get(f) is True)
    critical_accuracy = critical_correct / len(critical_considered) if critical_considered else 0.0
    all_accuracy = sum(1 for ok in field_results.values() if ok) / len(field_results) if field_results else 0.0

    return {
        "id": case_id,
        "file": str(relative),
        "mimeType": mime,
        "httpStatus": status_code,
        "wallMs": round(wall_ms, 3),
        "ok": bool(payload.get("ok")) if isinstance(payload, dict) else False,
        "status": (result or {}).get("status"),
        "confidence": (result or {}).get("confidence"),
        "fallbackRecommended": (result or {}).get("fallbackRecommended"),
        "fallbackReason": (result or {}).get("fallbackReason"),
        "timings": (result or {}).get("timings"),
        "parser": ((result or {}).get("diagnostics") or {}).get("parser"),
        "extraction": extraction,
        "expected": expected,
        "fieldResults": field_results,
        "accuracy": round(all_accuracy, 6),
        "criticalAccuracy": round(critical_accuracy, 6),
    }


def summarize(results: list[dict[str, Any]]) -> dict[str, Any]:
    completed = [r for r in results if not r.get("error") and r.get("httpStatus") == 200]
    latencies = [float(r.get("wallMs") or 0) for r in completed]
    critical = [float(r.get("criticalAccuracy") or 0) for r in completed]
    accuracy = [float(r.get("accuracy") or 0) for r in completed]
    fallback = [r for r in completed if r.get("fallbackRecommended")]
    statuses: dict[str, int] = {}
    parsers: dict[str, int] = {}
    for r in completed:
        status = str(r.get("status") or "unknown")
        statuses[status] = statuses.get(status, 0) + 1
        parser = str(r.get("parser") or "unknown")
        parsers[parser] = parsers.get(parser, 0) + 1
    return {
        "cases": len(results),
        "successfulHttpCases": len(completed),
        "failedCases": len(results) - len(completed),
        "meanAccuracy": round(statistics.fmean(accuracy), 6) if accuracy else 0,
        "meanCriticalAccuracy": round(statistics.fmean(critical), 6) if critical else 0,
        "p50WallMs": round(percentile(latencies, 0.50), 3),
        "p95WallMs": round(percentile(latencies, 0.95), 3),
        "meanWallMs": round(statistics.fmean(latencies), 3) if latencies else 0,
        "fallbackRate": round(len(fallback) / len(completed), 6) if completed else 1,
        "statuses": statuses,
        "parsers": parsers,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Benchmark SANAD Local Extraction against a private on-server corpus.")
    parser.add_argument("--manifest", required=True, help="Path to private benchmark manifest JSON")
    parser.add_argument("--url", default="http://127.0.0.1:8090/v1/analyze")
    parser.add_argument("--timeout", type=float, default=30.0)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    manifest_path = Path(args.manifest).resolve()
    payload = json.loads(manifest_path.read_text(encoding="utf-8"))
    cases = payload.get("cases") if isinstance(payload, dict) else None
    if not isinstance(cases, list) or not cases:
        raise ValueError("manifest must contain non-empty cases[]")
    corpus_dir = manifest_path.parent

    results: list[dict[str, Any]] = []
    for index, case in enumerate(cases, start=1):
        try:
            result = run_case(case, corpus_dir, args.url, args.timeout)
        except Exception as exc:
            result = {
                "id": str(case.get("id") or index),
                "file": str(case.get("file") or ""),
                "error": f"{type(exc).__name__}:{exc}",
            }
        results.append(result)
        print(json.dumps({
            "progress": f"{index}/{len(cases)}",
            "id": result.get("id"),
            "status": result.get("status"),
            "criticalAccuracy": result.get("criticalAccuracy"),
            "wallMs": result.get("wallMs"),
            "fallbackRecommended": result.get("fallbackRecommended"),
            "error": result.get("error"),
        }, ensure_ascii=False), flush=True)

    report = {
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "engine": "sanad-local-extraction",
        "manifest": manifest_path.name,
        "summary": summarize(results),
        "results": results,
    }
    output = Path(args.output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"summary": report["summary"], "report": str(output)}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
