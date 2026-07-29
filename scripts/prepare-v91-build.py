from pathlib import Path

APP_PATH = Path('src/App.tsx')


def replace_once(text: str, old: str, new: str) -> str:
    if old in text:
        return text.replace(old, new, 1)
    if new in text:
        return text
    raise SystemExit(f'Expected App.tsx source block not found: {old[:80]!r}')


text = APP_PATH.read_text(encoding='utf-8')
text = replace_once(
    text,
    "import VerifyNotice from './components/VerifyNotice';",
    "import VerifyNotice from './components/VerifyNotice';\nimport DirectQrScanner from './components/DirectQrScanner';",
)
text = replace_once(
    text,
    """            {currentPage === 'scan-qr' && (\n              <VerifyNotice\n                onNavigateToDetails={(token) => navigateTo('details', token, 'qr')}\n                directCameraOnly={true}\n                onCancelDirectCamera={() => navigateTo('home')}\n              />\n            )}""",
    """            {currentPage === 'scan-qr' && (\n              <DirectQrScanner\n                onNavigateToDetails={(token) => navigateTo('details', token, 'qr')}\n                onCancel={() => navigateTo('home')}\n              />\n            )}""",
)
APP_PATH.write_text(text, encoding='utf-8')
