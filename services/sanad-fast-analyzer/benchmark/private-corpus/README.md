# SANAD private benchmark corpus

Real financial documents must never be committed to Git.

On the SANAD server the private corpus lives outside the immutable release tree:

`/opt/sanad-local-extraction/shared/private-corpus/`

Each benchmark batch contains a `manifest.json` and the referenced documents. The server benchmark harness reads the files locally and sends them only to `127.0.0.1:8090`, so raw documents do not leave the SANAD server during local-engine benchmarking.

## Manifest contract

```json
{
  "cases": [
    {
      "id": "case-001",
      "operationId": "optional-production-operation-id",
      "file": "case-001.jpg",
      "mimeType": "image/jpeg",
      "expected": {
        "financialEntity": "العمقي",
        "amount": 10000,
        "currency": "YER",
        "documentReference": "123456789",
        "transactionDatetime": "2026-08-10T12:34:00+03:00"
      }
    }
  ]
}
```

Only fields present in `expected` are scored. The critical gate currently covers financial entity, amount, currency, and document reference. `transactionDatetime` can be included for diagnostic scoring while parsers are hardened.

## Promotion gates

A parser/template family is not eligible for production routing merely because OCR succeeds. Before promotion it needs at least 30 representative cases and must meet the benchmark policy, including >=99% mean critical-field accuracy, no known amount/currency/entity misrouting, acceptable P95 latency on the target CPU, and safe fallback for ambiguity.
