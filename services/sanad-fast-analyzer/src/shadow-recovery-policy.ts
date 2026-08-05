export type ShadowRecoveryKind =
  | "none"
  | "entity_only"
  | "receiver_identifier_only"
  | "receiver_role_validation";

export interface ShadowRecoveryInput {
  financialEntity: string | null;
  financialEntityCode: string | null;
  templateCode: string | null;
  transactionType: string | null;
  receiverName: string | null;
  receiverIdentifierType: string | null;
  receiverIdentifierValue: string | null;
  modelReviewRequired: boolean;
  routingReasons: string[];
  receiverDisagreesWithReference?: boolean;
}

export interface ShadowRecoveryDecision {
  required: boolean;
  kind: ShadowRecoveryKind;
  reasons: string[];
  maxOutputTokens: number;
  useOriginalImage: boolean;
  useTargetedCrop: boolean;
}

export function decideShadowRecovery(
  input: ShadowRecoveryInput,
): ShadowRecoveryDecision {
  const reasons = new Set(input.routingReasons);
  const entityUnresolved =
    reasons.has("financial_entity_unresolved") ||
    isUnresolved(input.financialEntity, input.financialEntityCode);
  const identifierMissing =
    reasons.has("receiver_identifier_missing") ||
    reasons.has("receiver_identifier_type_missing") ||
    !input.receiverIdentifierValue ||
    !input.receiverIdentifierType;
  const receiverRoleConflict =
    input.receiverDisagreesWithReference === true ||
    reasons.has("receiver_identifier_matches_sender");

  if (receiverRoleConflict && isAmqiTemplate(input.templateCode)) {
    return {
      required: true,
      kind: "receiver_role_validation",
      reasons: ["template_receiver_role_conflict"],
      maxOutputTokens: 256,
      useOriginalImage: true,
      useTargetedCrop: true,
    };
  }

  if (entityUnresolved && identifierMissing) {
    return {
      required: true,
      kind: "entity_only",
      reasons: ["entity_unresolved_before_identifier_recovery"],
      maxOutputTokens: 128,
      useOriginalImage: true,
      useTargetedCrop: false,
    };
  }

  if (entityUnresolved) {
    return {
      required: true,
      kind: "entity_only",
      reasons: ["financial_entity_unresolved"],
      maxOutputTokens: 128,
      useOriginalImage: true,
      useTargetedCrop: false,
    };
  }

  if (identifierMissing) {
    return {
      required: true,
      kind: "receiver_identifier_only",
      reasons: ["receiver_identifier_missing"],
      maxOutputTokens: 256,
      useOriginalImage: true,
      useTargetedCrop: true,
    };
  }

  if (input.modelReviewRequired) {
    return {
      required: true,
      kind: "receiver_identifier_only",
      reasons: ["model_review_required"],
      maxOutputTokens: 256,
      useOriginalImage: true,
      useTargetedCrop: false,
    };
  }

  return {
    required: false,
    kind: "none",
    reasons: [],
    maxOutputTokens: 0,
    useOriginalImage: false,
    useTargetedCrop: false,
  };
}

function isAmqiTemplate(templateCode: string | null): boolean {
  const value = normalize(templateCode);
  return value.includes("alomqy") || value.includes("amqi");
}

function isUnresolved(entity: string | null, code: string | null): boolean {
  const entityValue = normalize(entity);
  const codeValue = normalize(code);
  return !entityValue ||
    entityValue === "unknown" ||
    entityValue.includes("غيرمعروف") ||
    codeValue === "other";
}

function normalize(value: string | null): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}
