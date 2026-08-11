import type { CoreFinancialExtraction } from "../contracts.ts";
import type { OcrExtractionResult } from "./contracts.ts";
import { blocksInRelativeRegion, detectGeometryProfile, type RecoverableField, type RelativeRegion } from "./template-geometry.ts";

export interface RecoveryAction {
  field: RecoverableField;
  reason: "missing" | "low_confidence" | "suspicious_identifier";
  priority: number;
  regions: RelativeRegion[];
  evidenceText: string;
}

export interface FieldRecoveryPlan {
  required: boolean;
  templateProfile?: string;
  actions: RecoveryAction[];
}

const fields: RecoverableField[] = ["documentReference", "transactionDatetime", "amount", "currency", "senderIdentifier", "receiverIdentifier"];

function partyIds(extraction: CoreFinancialExtraction, field: RecoverableField): string[] {
  const roles = field === "senderIdentifier"
    ? new Set(["sender", "debited_party"])
    : new Set(["receiver", "credited_party", "beneficiary"]);
  return extraction.parties
    .filter((p) => roles.has(p.role))
    .flatMap((p) => p.identifiers.map((id) => id.value).filter(Boolean));
}

function present(extraction: CoreFinancialExtraction, field: RecoverableField): boolean {
  if (field === "documentReference") return Boolean(extraction.documentReference?.trim());
  if (field === "transactionDatetime") return Boolean(extraction.transactionDatetime?.trim());
  if (field === "amount") return typeof extraction.amount === "number" && extraction.amount > 0;
  if (field === "currency") return Boolean(extraction.currency);
  return partyIds(extraction, field).length > 0;
}

function confidence(extraction: CoreFinancialExtraction, field: RecoverableField): number {
  if (field === "senderIdentifier") return extraction.fieldConfidence.senderIdentifier ?? extraction.fieldConfidence.sender ?? extraction.confidence;
  if (field === "receiverIdentifier") return extraction.fieldConfidence.receiverIdentifier ?? extraction.fieldConfidence.receiver ?? extraction.confidence;
  return extraction.fieldConfidence[field] ?? extraction.confidence;
}

function suspicious(extraction: CoreFinancialExtraction, field: RecoverableField): boolean {
  if (field !== "senderIdentifier" && field !== "receiverIdentifier") return false;
  return partyIds(extraction, field).some((value) => {
    const digits = value.replace(/\D/g, "");
    return digits.length > 0 && digits.length < 6;
  });
}

export function buildFieldRecoveryPlan(extraction: CoreFinancialExtraction, ocr: OcrExtractionResult, minConfidence = 0.92): FieldRecoveryPlan {
  const profile = detectGeometryProfile(ocr.rawText);
  const actions: RecoveryAction[] = [];
  for (const field of fields) {
    const isMissing = !present(extraction, field);
    const isSuspicious = suspicious(extraction, field);
    const score = confidence(extraction, field);
    if (!isMissing && !isSuspicious && score >= minConfidence) continue;
    const regions = profile?.regions[field] ?? [{ x: 0, y: 0, width: 1, height: 1 }];
    const evidence = regions.flatMap((r) => blocksInRelativeRegion(ocr.blocks, r));
    actions.push({
      field,
      reason: isMissing ? "missing" : isSuspicious ? "suspicious_identifier" : "low_confidence",
      priority: isMissing || isSuspicious ? 100 : Math.max(1, Math.round((1 - score) * 100)),
      regions,
      evidenceText: [...new Set(evidence.map((b) => b.text).filter(Boolean))].join("\n").slice(0, 1800),
    });
  }
  actions.sort((a, b) => b.priority - a.priority);
  return { required: actions.length > 0, templateProfile: profile?.id, actions };
}
