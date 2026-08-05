# SANAD Fast Financial Analyzer

A deterministic, template-aware fast path for Yemeni financial notices.

## Goal

Produce the operational core of a known financial notice within a P95 latency budget of 5 seconds from WhatsApp intake, while preserving the existing Gemini-backed queue as the deep-verification and unknown-template path.

## Design principles

1. Download each media object once.
2. Prefer a native PDF text layer before OCR.
3. Detect the document family before extracting fields.
4. Extract only the operational core on the critical path.
5. Keep semantically different identifiers separate.
6. Require deterministic validation before accepting a fast-path result.
7. Route low-confidence or unknown documents to deep verification.
8. Never store raw customer financial documents in the Git repository.

## Operational core

- financial entity
- template code and version
- amount and currency
- transaction direction and type
- document reference
- transfer/remittance reference when distinct
- sender and receiver names
- financial account identifiers
- phone/wallet identifiers
- merchant point when applicable
- transaction date and time
- per-field confidence and evidence source

## Initial template families

- Kuraimi Haseb transaction card
- Kuraimi Haseb balance transaction list
- Al-Amqi Mobile deposit notice
- Bin Dowal account transfer voucher
- Bin Dowal credit notice
- Bin Dowal Pay transfer notice

The first registry is in `templates/registry.v1.json`. Its regions are provisional calibration hints, not production truth. Raw examples remain in a restricted benchmark corpus outside GitHub.

## Planned execution order

1. Build corpus manifest and ground-truth contract.
2. Implement template detection using anchors, geometry and color/layout signals.
3. Implement PDF text-layer extraction.
4. Implement region OCR for raster documents.
5. Implement template parsers and semantic validators.
6. Run in shadow mode against the current Gemini result.
7. Promote only templates meeting accuracy and latency gates.
