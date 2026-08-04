from pathlib import Path


def main() -> None:
    path = Path('src/components/Details.tsx')
    text = path.read_text(encoding='utf-8')

    import_line = "import OperationBusinessLinkSheet from './business/OperationBusinessLinkSheet';\n"
    anchor = "import OperationNote from './OperationNote';\n"
    if import_line not in text:
        if anchor not in text:
            raise SystemExit('OperationNote import anchor not found')
        text = text.replace(anchor, anchor + import_line, 1)

    start_marker = '      {/* Business Linking Modal Overlay */}'
    end_marker = '    </div>\n  );\n}'
    start = text.find(start_marker)
    end = text.rfind(end_marker)
    if start == -1 or end == -1 or end <= start:
        raise SystemExit('Business linking modal markers not found')

    replacement = '''      <OperationBusinessLinkSheet
        open={showLinkModal && linkableBusinesses.length > 0}
        businesses={linkableBusinesses}
        linking={linkingBusiness}
        success={linkSuccess}
        error={linkError}
        onLink={handleLinkToBusiness}
        onClose={() => {
          if (!linkingBusiness) {
            setShowLinkModal(false);
            setLinkError(null);
          }
        }}
      />

'''
    text = text[:start] + replacement + text[end:]

    old_success = "      setLinkSuccess(true);\n      setTimeout(() => {\n        if (mountedRef.current) {\n          setShowLinkModal(false);\n          setLinkSuccess(false);\n        }\n      }, 2000);"
    if old_success in text:
        text = text.replace(old_success, "      setLinkSuccess(true);\n      await loadDetails();", 1)

    path.write_text(text, encoding='utf-8')

    workflow = Path('.github/workflows/operation-business-approval-portal.yml')
    script = Path('.github/scripts/wire-operation-business-approval-portal.py')
    workflow.unlink(missing_ok=True)
    script.unlink(missing_ok=True)


if __name__ == '__main__':
    main()
