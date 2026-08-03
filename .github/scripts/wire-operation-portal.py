from pathlib import Path
import re


def main() -> None:
    details_path = Path('src/components/Details.tsx')
    details = details_path.read_text(encoding='utf-8')

    portal_import = "import OperationBusinessLinkSheet from './business/OperationBusinessLinkSheet';"
    if portal_import not in details:
        details = details.replace(
            "import OperationNote from './OperationNote';\n",
            "import OperationNote from './OperationNote';\n" + portal_import + "\n",
            1,
        )
    details = details.replace(', X, Store, Copy,', ', X, Copy,', 1)

    start_marker = '      {/* Business Linking Modal Overlay */}'
    end_marker = '    </div>\n  );\n}'
    start = details.find(start_marker)
    end = details.rfind(end_marker)
    if start == -1 or end == -1 or end <= start:
        raise RuntimeError('Could not locate legacy business-link modal block')

    sheet = '''      <OperationBusinessLinkSheet
        open={showLinkModal && linkableBusinesses.length > 0}
        businesses={linkableBusinesses}
        linking={linkingBusiness}
        success={linkSuccess}
        error={linkError}
        onLink={handleLinkToBusiness}
        onClose={() => {
          if (!linkingBusiness) setShowLinkModal(false);
        }}
      />
'''
    details_path.write_text(details[:start] + sheet + details[end:], encoding='utf-8')

    css_path = Path('src/index.css')
    css = css_path.read_text(encoding='utf-8')
    css = re.sub(
        r'\n/\* Operation-to-business link prompt: mobile-first, stable and easy to act on\. \*/.*?(?=\n@media \(max-width: 639px\) \{)',
        '\n',
        css,
        count=1,
        flags=re.S,
    )
    css = re.sub(
        r'\n  div\.fixed\.inset-0\.z-50\.flex\[class~="bg-slate-900/60"\]\.font-arabic\.animate-fade-in \{.*?\n  \}\n(?=\})',
        '\n',
        css,
        count=1,
        flags=re.S,
    )
    css_path.write_text(css, encoding='utf-8')

    quality_path = Path('.github/workflows/business-management-sections-quality.yml')
    quality = quality_path.read_text(encoding='utf-8')
    legacy = '''          grep -Fq "ربط العملية بنشاط تجاري" src/components/Details.tsx
          grep -Fq 'background: rgba(15, 23, 42, 0.46)' src/index.css
          grep -Fq 'align-items: flex-end !important' src/index.css
          grep -Fq 'padding-bottom: max(0.5rem, env(safe-area-inset-bottom))' src/index.css
          grep -Fq 'min-height: 3.25rem !important' src/index.css
          grep -Fq 'font-size: 0.95rem !important' src/index.css
          grep -Fq 'max-height: min(82dvh, 42rem)' src/index.css
          grep -Fq 'grid-template-columns: 1fr !important' src/index.css
'''
    portal = '''          grep -Fq 'OperationBusinessLinkSheet' src/components/Details.tsx
          grep -Fq 'createPortal(modal, document.body)' src/components/business/OperationBusinessLinkSheet.tsx
          grep -Fq 'data-operation-business-sheet-overlay' src/components/business/OperationBusinessLinkSheet.tsx
          grep -Fq 'z-[120]' src/components/business/OperationBusinessLinkSheet.tsx
          grep -Fq "document.body.style.overflow = 'hidden'" src/components/business/OperationBusinessLinkSheet.tsx
          grep -Fq 'overscroll-contain' src/components/business/OperationBusinessLinkSheet.tsx
          grep -Fq 'env(safe-area-inset-bottom)' src/components/business/OperationBusinessLinkSheet.tsx
          grep -Fq 'aria-modal="true"' src/components/business/OperationBusinessLinkSheet.tsx
'''
    if legacy not in quality:
        raise RuntimeError('Legacy portal quality checks not found')
    quality_path.write_text(quality.replace(legacy, portal, 1), encoding='utf-8')

    Path('.github/workflows/operation-business-link-portal-implementation.yml').unlink(missing_ok=True)
    Path('.github/scripts/wire-operation-portal.py').unlink(missing_ok=True)


if __name__ == '__main__':
    main()
