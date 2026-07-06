# SANAD Stable Release Notes

## Stable checkpoint

This checkpoint confirms that the core SANAD Android/PWA flows are working after migrating critical triggers away from direct n8n calls.

## Verified flows

- In-app upload: working.
- Share Target PDF upload: working.
- Share Target screenshot/image upload: working after MIME normalization.
- Background AI analysis trigger: working through Supabase Edge Function app trigger.
- Reports: working through Supabase Edge Function + Gotenberg HTML-to-PDF + WhatsApp document delivery.

## Important backend notes

- Report PDF generation no longer uses pdf-lib StandardFonts/Helvetica for Arabic text.
- Reports now use HTML RTL rendered through Gotenberg.
- Gotenberg is exposed through a protected Nginx internal route.
- Supabase Edge Function secrets used:
  - SANAD_INTERNAL_API_KEY
  - GOTENBERG_URL
  - GOTENBERG_TOKEN
  - META_WA_ACCESS_TOKEN
  - META_WA_PHONE_NUMBER_ID

## Known issues / next tasks

- First app launch can remain in loading state for 1-2 minutes and needs performance investigation.
- Report PDF layout is functional but needs design refinement.
- Need to add Supabase Edge Function source files to GitHub for long-term maintainability.
- Need to keep Antigravity scoped to frontend/app changes only.
- Build/Android/Gradle commands should be executed manually by the user from PowerShell.
