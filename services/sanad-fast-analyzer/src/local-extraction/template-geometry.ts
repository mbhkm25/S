import type { OcrTextBlock } from "./contracts.ts";

export type RelativeRegion = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type RecoverableField =
  | "documentReference"
  | "transactionDatetime"
  | "amount"
  | "currency"
  | "senderIdentifier"
  | "receiverIdentifier";

export interface TemplateGeometryProfile {
  id: string;
  entityHints: RegExp[];
  regions: Partial<Record<RecoverableField, RelativeRegion[]>>;
}

const TOP: RelativeRegion = { x: 0, y: 0.10, width: 1, height: 0.32 };
const MID: RelativeRegion = { x: 0, y: 0.26, width: 1, height: 0.40 };
const BODY: RelativeRegion = { x: 0, y: 0.18, width: 1, height: 0.62 };

export const TEMPLATE_GEOMETRY_PROFILES: TemplateGeometryProfile[] = [
  {
    id: "bin-dowal-formal-v1",
    entityHints: [/بن\s*دول/i, /bin\s*dowal/i],
    regions: {
      documentReference: [TOP],
      transactionDatetime: [TOP],
      amount: [MID],
      currency: [MID],
      senderIdentifier: [BODY],
      receiverIdentifier: [BODY],
    },
  },
  {
    id: "busairi-formal-v1",
    entityHints: [/البسيري/i, /busairi/i],
    regions: {
      documentReference: [TOP],
      transactionDatetime: [TOP],
      amount: [MID],
      currency: [MID],
      senderIdentifier: [BODY],
      receiverIdentifier: [BODY],
    },
  },
  {
    id: "amqi-formal-v1",
    entityHints: [/العمقي/i, /amqi/i],
    regions: {
      documentReference: [BODY],
      transactionDatetime: [BODY],
      amount: [MID],
      currency: [MID],
      senderIdentifier: [BODY],
      receiverIdentifier: [BODY],
    },
  },
  {
    id: "kuraimi-digital-v1",
    entityHints: [/الكريمي/i, /kuraimi/i, /fund\s*transfer/i],
    regions: {
      documentReference: [BODY],
      transactionDatetime: [BODY],
      amount: [MID],
      currency: [MID],
      senderIdentifier: [BODY],
      receiverIdentifier: [BODY],
    },
  },
];

export function detectGeometryProfile(rawText: string): TemplateGeometryProfile | undefined {
  return TEMPLATE_GEOMETRY_PROFILES.find((profile) =>
    profile.entityHints.some((hint) => hint.test(rawText))
  );
}

export function blocksInRelativeRegion(
  blocks: OcrTextBlock[],
  region: RelativeRegion,
): OcrTextBlock[] {
  const boxed = blocks.filter((b) => b.bbox);
  if (!boxed.length) return [];
  const maxX = Math.max(...boxed.map((b) => (b.bbox?.x ?? 0) + (b.bbox?.width ?? 0)), 1);
  const maxY = Math.max(...boxed.map((b) => (b.bbox?.y ?? 0) + (b.bbox?.height ?? 0)), 1);
  return boxed.filter((b) => {
    const bb = b.bbox!;
    const cx = (bb.x + bb.width / 2) / maxX;
    const cy = (bb.y + bb.height / 2) / maxY;
    return cx >= region.x && cx <= region.x + region.width &&
      cy >= region.y && cy <= region.y + region.height;
  });
}
