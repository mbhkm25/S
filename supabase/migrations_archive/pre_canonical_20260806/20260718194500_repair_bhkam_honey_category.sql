-- Keep the published Bahkam Honey profile aligned with the canonical category catalog.
-- This repair is idempotent and only fills a missing category.
update public.business_profiles as business
set
  category_id = category.id,
  updated_at = now()
from public.business_categories as category
where business.slug = 'bhkam-honey'
  and business.category_id is null
  and category.code = 'honey'
  and category.status = 'active';
