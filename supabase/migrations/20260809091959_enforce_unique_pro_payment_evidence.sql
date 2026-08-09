drop index if exists public.idx_pro_payment_requests_receipt_sha256;
create unique index if not exists uq_pro_payment_requests_receipt_sha256_active
on public.pro_payment_requests(receipt_sha256)
where receipt_sha256 is not null and status<>'cancelled';

drop index if exists public.idx_pro_payment_requests_payment_fingerprint;
create unique index if not exists uq_pro_payment_requests_payment_fingerprint_active
on public.pro_payment_requests(payment_fingerprint)
where payment_fingerprint is not null and status<>'cancelled';
