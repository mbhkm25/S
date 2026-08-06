import type {
  FinancialTemplateDefinition,
  NormalizedRegion,
  TemplateAnchor,
  TemplateFieldRule,
} from "./contracts.ts";

export interface TemplateRegistry {
  schemaVersion: number;
  registryVersion: string;
  notes: string[];
  templates: FinancialTemplateDefinition[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isUnitNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function assertRegion(value: unknown, path: string): asserts value is NormalizedRegion {
  if (!isRecord(value)) throw new Error(`${path} must be an object`);
  for (const key of ["x", "y", "width", "height"] as const) {
    if (!isUnitNumber(value[key])) throw new Error(`${path}.${key} must be between 0 and 1`);
  }
  if ((value.x as number) + (value.width as number) > 1.000001) {
    throw new Error(`${path} exceeds normalized width`);
  }
  if ((value.y as number) + (value.height as number) > 1.000001) {
    throw new Error(`${path} exceeds normalized height`);
  }
}

function assertAnchor(value: unknown, path: string): asserts value is TemplateAnchor {
  if (!isRecord(value)) throw new Error(`${path} must be an object`);
  if (!["text", "regex", "color", "geometry"].includes(String(value.kind))) {
    throw new Error(`${path}.kind is invalid`);
  }
  if (typeof value.value !== "string" || !value.value.trim()) {
    throw new Error(`${path}.value is required`);
  }
  if (!isUnitNumber(value.weight)) throw new Error(`${path}.weight must be between 0 and 1`);
  if (value.region !== undefined) assertRegion(value.region, `${path}.region`);
}

function assertField(value: unknown, path: string): asserts value is TemplateFieldRule {
  if (!isRecord(value)) throw new Error(`${path} must be an object`);
  if (typeof value.field !== "string" || !value.field.trim()) {
    throw new Error(`${path}.field is required`);
  }
  if (!Array.isArray(value.sources) || value.sources.length === 0) {
    throw new Error(`${path}.sources must not be empty`);
  }
  const validSources = new Set(["pdf_text", "ocr_region", "regex", "derived"]);
  if (value.sources.some((source) => !validSources.has(String(source)))) {
    throw new Error(`${path}.sources contains an invalid source`);
  }
  if (value.region !== undefined) assertRegion(value.region, `${path}.region`);
  if (value.patterns !== undefined && !Array.isArray(value.patterns)) {
    throw new Error(`${path}.patterns must be an array`);
  }
  if (Array.isArray(value.patterns)) {
    value.patterns.forEach((pattern, index) => {
      if (typeof pattern !== "string") throw new Error(`${path}.patterns[${index}] must be a string`);
      try {
        new RegExp(pattern, "u");
      } catch (error) {
        throw new Error(`${path}.patterns[${index}] is invalid: ${String(error)}`);
      }
    });
  }
}

function assertTemplate(value: unknown, path: string): asserts value is FinancialTemplateDefinition {
  if (!isRecord(value)) throw new Error(`${path} must be an object`);
  for (const key of ["code", "entity", "family"] as const) {
    if (typeof value[key] !== "string" || !String(value[key]).trim()) {
      throw new Error(`${path}.${key} is required`);
    }
  }
  if (!Number.isInteger(value.version) || Number(value.version) < 1) {
    throw new Error(`${path}.version must be a positive integer`);
  }
  if (!["single_operation", "multi_operation"].includes(String(value.documentMode))) {
    throw new Error(`${path}.documentMode is invalid`);
  }
  if (!Array.isArray(value.acceptedMimeTypes) || value.acceptedMimeTypes.length === 0) {
    throw new Error(`${path}.acceptedMimeTypes must not be empty`);
  }
  if (!Array.isArray(value.anchors) || value.anchors.length === 0) {
    throw new Error(`${path}.anchors must not be empty`);
  }
  value.anchors.forEach((anchor, index) => assertAnchor(anchor, `${path}.anchors[${index}]`));
  if (!Array.isArray(value.fields) || value.fields.length === 0) {
    throw new Error(`${path}.fields must not be empty`);
  }
  value.fields.forEach((field, index) => assertField(field, `${path}.fields[${index}]`));
  if (!Array.isArray(value.semanticGuards) || value.semanticGuards.length === 0) {
    throw new Error(`${path}.semanticGuards must not be empty`);
  }
  if (!isUnitNumber(value.minimumTemplateConfidence)) {
    throw new Error(`${path}.minimumTemplateConfidence must be between 0 and 1`);
  }
  if (!isUnitNumber(value.minimumCoreConfidence)) {
    throw new Error(`${path}.minimumCoreConfidence must be between 0 and 1`);
  }
  if (!["draft", "shadow", "active", "retired"].includes(String(value.status))) {
    throw new Error(`${path}.status is invalid`);
  }
}

export function parseTemplateRegistry(value: unknown): TemplateRegistry {
  if (!isRecord(value)) throw new Error("template registry must be an object");
  if (value.schemaVersion !== 1) throw new Error("unsupported template registry schemaVersion");
  if (typeof value.registryVersion !== "string" || !value.registryVersion.trim()) {
    throw new Error("registryVersion is required");
  }
  if (!Array.isArray(value.notes) || value.notes.some((note) => typeof note !== "string")) {
    throw new Error("notes must be a string array");
  }
  if (!Array.isArray(value.templates) || value.templates.length === 0) {
    throw new Error("templates must not be empty");
  }
  value.templates.forEach((template, index) => assertTemplate(template, `templates[${index}]`));

  const keys = new Set<string>();
  for (const template of value.templates as FinancialTemplateDefinition[]) {
    const key = `${template.code}@${template.version}`;
    if (keys.has(key)) throw new Error(`duplicate template ${key}`);
    keys.add(key);

    const totalWeight = template.anchors.reduce((sum, anchor) => sum + anchor.weight, 0);
    if (Math.abs(totalWeight - 1) > 0.001) {
      throw new Error(`${key} anchor weights must total 1; got ${totalWeight}`);
    }
  }

  return value as unknown as TemplateRegistry;
}

export function getTemplate(
  registry: TemplateRegistry,
  code: string,
  version?: number,
): FinancialTemplateDefinition | undefined {
  const matches = registry.templates.filter((template) => template.code === code);
  if (version !== undefined) return matches.find((template) => template.version === version);
  return matches.sort((left, right) => right.version - left.version)[0];
}
