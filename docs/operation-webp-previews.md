# Operation document WebP previews

## Purpose

Provide a fast visual preview for single-page payment notices while preserving the original PDF or image as the authoritative source file.

## Runtime flow

1. The original file is stored and the operation is created normally.
2. QR and user responses are not blocked by preview generation.
3. A database queue records a pending preview job.
4. `sanad-operation-preview-worker` generates a 1240×1754 WebP preview through Gotenberg.
5. Preview metadata is committed to the operation only after upload succeeds.
6. `sanad-operation-preview-access` validates authenticated operation access and returns a short-lived signed URL.
7. The React operation details screen displays the preview with fullscreen zoom while retaining original open and download actions.

## Safety and resilience

- Original files are never modified or deleted.
- Queue jobs have bounded retries and stale-processing recovery.
- Preview failures do not block operation access.
- Preview storage paths are not exposed through the public operation payload.
- Signed preview URLs are short-lived and require authenticated access.
- The current document contract assumes a single-page notice.

## Production validation

A real PDF operation generated a valid WebP preview at 1240×1754 with a size of 46,960 bytes. Final visual acceptance is performed after deploying the web interface from `main`.
