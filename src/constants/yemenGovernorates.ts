export const YEMEN_GOVERNORATES = [
  'أمانة العاصمة', 'عدن', 'أبين', 'الضالع', 'البيضاء', 'الحديدة',
  'الجوف', 'المحويت', 'المهرة', 'ذمار', 'حضرموت', 'حجة', 'إب',
  'لحج', 'مأرب', 'ريمة', 'صعدة', 'صنعاء', 'شبوة', 'تعز', 'عمران',
  'سقطرى'
] as const;

export type YemenGovernorate = (typeof YEMEN_GOVERNORATES)[number];

export function isYemenGovernorate(value: string): value is YemenGovernorate {
  return (YEMEN_GOVERNORATES as readonly string[]).includes(value);
}
