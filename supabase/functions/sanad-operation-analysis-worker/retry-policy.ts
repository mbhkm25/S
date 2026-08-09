export type AnalyzerFailureClassification = {
  retryable: boolean;
  code: string;
  category: "transient" | "contract" | "client" | "unknown";
};

const TRANSIENT_HTTP_STATUSES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);
const NON_RETRYABLE_HTTP_STATUSES = new Set([400, 401, 403, 404, 405, 406, 410, 415, 422]);

const DETERMINISTIC_POSTGRES_CODES = ["42883", "42P01", "42703", "42804", "42P13"];
const DETERMINISTIC_CONTRACT_PATTERNS = [
  /no function matches the given name and argument types/i,
  /function\s+[^\n]+\s+does not exist/i,
  /relation\s+[^\n]+\s+does not exist/i,
  /column\s+[^\n]+\s+does not exist/i,
  /undefined[_ ]function/i,
  /undefined[_ ]table/i,
  /undefined[_ ]column/i,
  /schema contract/i,
  /invalid rpc/i,
];

export function isDeterministicContractFailure(rawBody: string): boolean {
  const body = String(rawBody ?? "");
  if (DETERMINISTIC_POSTGRES_CODES.some((code) => body.includes(code))) return true;
  return DETERMINISTIC_CONTRACT_PATTERNS.some((pattern) => pattern.test(body));
}

export function classifyAnalyzerFailure(
  httpStatus: number,
  rawBody: string,
): AnalyzerFailureClassification {
  if (isDeterministicContractFailure(rawBody)) {
    return { retryable: false, code: "analyzer_contract_failure", category: "contract" };
  }
  if (NON_RETRYABLE_HTTP_STATUSES.has(httpStatus)) {
    return { retryable: false, code: `analyzer_http_${httpStatus}`, category: "client" };
  }
  if (TRANSIENT_HTTP_STATUSES.has(httpStatus) || httpStatus >= 500) {
    return { retryable: true, code: `analyzer_http_${httpStatus}`, category: "transient" };
  }
  return { retryable: false, code: `analyzer_http_${httpStatus}`, category: "unknown" };
}
