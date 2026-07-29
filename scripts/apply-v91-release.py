from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text(encoding='utf-8')
    if old not in text:
        raise SystemExit(f'Expected source block not found in {path}: {old[:80]!r}')
    file_path.write_text(text.replace(old, new, 1), encoding='utf-8')


replace_once(
    'src/App.tsx',
    "import VerifyNotice from './components/VerifyNotice';",
    "import VerifyNotice from './components/VerifyNotice';\nimport DirectQrScanner from './components/DirectQrScanner';",
)
replace_once(
    'src/App.tsx',
    """            {currentPage === 'scan-qr' && (\n              <VerifyNotice\n                onNavigateToDetails={(token) => navigateTo('details', token, 'qr')}\n                directCameraOnly={true}\n                onCancelDirectCamera={() => navigateTo('home')}\n              />\n            )}""",
    """            {currentPage === 'scan-qr' && (\n              <DirectQrScanner\n                onNavigateToDetails={(token) => navigateTo('details', token, 'qr')}\n                onCancel={() => navigateTo('home')}\n              />\n            )}""",
)
replace_once('src/lib/appVersion.ts', "SANAD_APP_VERSION = '90'", "SANAD_APP_VERSION = '91'")
replace_once('index.html', 'content="90"', 'content="91"')
replace_once('android/app/build.gradle', 'versionCode 90', 'versionCode 91')
replace_once('android/app/build.gradle', 'versionName "0.90.0"', 'versionName "0.91.0"')

workflow = Path('.github/workflows/build-android-apk.yml')
workflow_text = workflow.read_text(encoding='utf-8')
workflow_text = workflow_text.replace('v90', 'v91').replace('V90', 'V91')
workflow.write_text(workflow_text, encoding='utf-8')

Path('docs/v91-camera-icon-plan.md').write_text(
    '# SANAD Android V91\n\n'
    '- Dedicated rear-camera-first QR scanner.\n'
    '- Fast 1080p-first acquisition with continuous autofocus when supported.\n'
    '- No front-camera switch in direct QR scanning.\n'
    '- Refreshed Android adaptive launcher icon.\n'
    '- Android versionCode 91 / versionName 0.91.0.\n',
    encoding='utf-8',
)

Path('scripts/apply-v91-release.py').unlink(missing_ok=True)
Path('.github/workflows/apply-v91-source-patch.yml').unlink(missing_ok=True)
