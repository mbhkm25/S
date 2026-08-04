from pathlib import Path
p = Path('src/features/operations/OperationDetailsRuntimeV2.tsx')
s = p.read_text(encoding='utf-8')
s = s.replace("import { useCallback, useEffect, useMemo, useRef, useState } from 'react';", "import { useCallback, useEffect, useMemo, useRef, useState } from 'react';\nimport type { PointerEvent as ReactPointerEvent } from 'react';", 1)
s = s.replace('React.PointerEvent<HTMLDivElement>', 'ReactPointerEvent<HTMLDivElement>')
s = s.replace('const points = Array.from(previewPointersRef.current.values());', 'const points = Array.from(previewPointersRef.current.values()) as PreviewPoint[];')
p.write_text(s, encoding='utf-8')
