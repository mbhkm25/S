# Unified payment upload v1

This release consolidates camera capture, gallery images, shared images, POS receipts, and PDF payment notices into the existing payment-operation upload flow.

## Runtime behavior

- Images are resized client-side to a maximum dimension of 2200 pixels.
- Images are encoded as WebP at quality 0.84 when that produces a smaller file.
- The original file is used automatically when optimization fails or does not reduce size.
- PDFs are uploaded without image conversion.
- Original and processed file metadata are stored in `client_upload_metadata`.
- A successfully uploaded Storage object is removed if the matching `operations` row cannot be created.
- The details action checks operation readiness with bounded retries before navigation.

## Product wording

The upload experience is presented as **إضافة عملية دفع**. Verification remains a separate user action performed from operation details.
