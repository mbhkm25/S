# SANAD dual-channel release readiness — PWA + APK

Status: release candidate preparation. No production deployment is performed by this document.

## Release channels

SANAD is shipped through two production channels:

1. **PWA** at `https://app.sanadflow.com`.
2. **Android APK** using the Capacitor package `com.sanadflow.verify` and the stable download path `/downloads/sanad-latest.apk`.

The APK remains the recommended cashier/field-installation channel because native Android capabilities are used for camera/file/push flows, while the PWA remains fully available for browser installation and general access.

## Candidate version

- Android version code: **109**
- Android version name: **0.99.6**
- Update policy: **recommended**
- Minimum supported version code: **107**

## Release scope

The release candidate contains the four SANAD product domains:

- SANAD Financial
- SANAD Commercial
- My Account
- SANAD AI

It also contains the new financial correction controls:

- obligation settlement against compatible posted personal transactions;
- server-side candidate calculation with available/outstanding amounts;
- audited transaction reversal;
- prohibition on reversing a transaction while it has an active obligation settlement.

The shop-machine ERP Bridge remains outside this release closure and must not be used as a reason to merge Bridge runtime work into this product release.

## Backend release gate

Before the frontend is published, the financial/commercial migrations must be promoted from Supabase `develop` to production in their recorded order.

Required evidence:

- migration-history integrity green;
- canonical migration layout green;
- authenticated rollback fixture green;
- no fixture rows retained;
- production migration application succeeds;
- post-migration smoke queries confirm the financial RPCs exist and grants/RLS match the reviewed contracts.

## PWA gate

The PWA candidate must pass:

- TypeScript;
- route/contract checks;
- production Vite build;
- PWA artifact validation;
- Android web-asset build (same web source);
- push-worker type-check/tests.

Production deployment uses the guarded `deploy-production.yml` workflow and publishes a commit that is already on `main`.

## APK gate

The APK candidate must pass:

- Android release metadata validation;
- same TypeScript and route checks as the PWA;
- `npm run build:android`;
- Capacitor sync;
- Gradle APK build;
- Firebase Android configuration restoration;
- signed release build;
- `apksigner` validation;
- signing-certificate continuity against the currently published production APK;
- generated SHA-256/JSON manifest validation;
- publication to both versioned and stable APK paths;
- public re-download and checksum verification.

The release workflow intentionally refuses to publish when signing continuity, Firebase configuration, release secrets, or the currently published APK verification is unavailable.

## Deployment order

1. Produce a clean release branch based directly on `main`; do not release the stacked Bridge branch.
2. Run all PR quality gates.
3. Promote the approved Supabase migrations to production.
4. Merge the clean release PR into `main`.
5. Deploy the PWA through the guarded production workflow.
6. Build/publish the signed APK version 109.
7. Smoke-test PWA authentication and the four workspaces.
8. Install/update the APK and smoke-test authentication, financial/commercial routes, camera/file flows, and native push registration.
9. Verify `/downloads/sanad-latest.json`, APK SHA-256 and version code 109.

## Rollback principle

PWA rollback uses a prior commit from `main` through the guarded deploy workflow.

APK releases are immutable by version code. If an Android defect is discovered after publication, publish a higher version code; never replace an already distributed version with a differently signed package.

Database changes in this release are additive/hardening changes and migration history must not be rewritten. Any corrective database change is a new forward migration.
