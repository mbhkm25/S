from pathlib import Path

path = Path('src/features/operations/OperationDetailsRuntimeV2.tsx')
source = path.read_text(encoding='utf-8')

replacements = [
    (
        "  const previewDragRef = useRef<{ point: PreviewPoint; pan: PreviewPoint } | null>(null);",
        "  const previewDragRef = useRef<{ point: PreviewPoint; pan: PreviewPoint } | null>(null);\n  const previewHistoryRef = useRef(false);"
    ),
    (
        "  const updatePreviewZoom = useCallback((nextZoom: number) => {",
        "  const openDocumentPreview = useCallback(() => {\n    if (fullscreen) return;\n    window.history.pushState({ ...window.history.state, sanadDocumentPreview: true }, '', window.location.href);\n    previewHistoryRef.current = true;\n    setFullscreen(true);\n  }, [fullscreen]);\n\n  const closeDocumentPreview = useCallback(() => {\n    if (previewHistoryRef.current && window.history.state?.sanadDocumentPreview) {\n      window.history.back();\n      return;\n    }\n    previewHistoryRef.current = false;\n    setFullscreen(false);\n  }, []);\n\n  useEffect(() => {\n    if (!fullscreen) return;\n    const handlePopState = () => {\n      previewHistoryRef.current = false;\n      setFullscreen(false);\n    };\n    const handleKeyDown = (event: KeyboardEvent) => {\n      if (event.key === 'Escape') closeDocumentPreview();\n    };\n    window.addEventListener('popstate', handlePopState);\n    window.addEventListener('keydown', handleKeyDown);\n    return () => {\n      window.removeEventListener('popstate', handlePopState);\n      window.removeEventListener('keydown', handleKeyDown);\n    };\n  }, [closeDocumentPreview, fullscreen]);\n\n  const updatePreviewZoom = useCallback((nextZoom: number) => {"
    ),
]

for old, new in replacements:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f'expected one match, found {count}: {old[:120]!r}')
    source = source.replace(old, new, 1)

open_count = source.count("onClick={() => setFullscreen(true)}")
if open_count != 2:
    raise SystemExit(f'expected two preview open handlers, found {open_count}')
source = source.replace("onClick={() => setFullscreen(true)}", "onClick={openDocumentPreview}")

close_count = source.count("onClick={() => setFullscreen(false)}")
if close_count != 1:
    raise SystemExit(f'expected one preview close handler, found {close_count}')
source = source.replace("onClick={() => setFullscreen(false)}", "onClick={closeDocumentPreview}", 1)

path.write_text(source, encoding='utf-8')
print('Document preview history navigation fixed.')
