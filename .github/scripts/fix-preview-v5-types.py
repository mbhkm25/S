from pathlib import Path

path = Path('supabase/functions/sanad-operation-preview-worker/index.ts')
source = path.read_text(encoding='utf-8')

replacements = [
    ('type ServiceClient = ReturnType<typeof createClient>;', 'type ServiceClient = any;'),
    ('new Blob([png], { type: "image/png" })', 'new Blob([png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) as ArrayBuffer], { type: "image/png" })'),
    ('function hasContent(bitmap: Uint8Array, canvasWidth: number, x: number, y: number)', 'function hasContent(bitmap: Uint8Array | Uint8ClampedArray, canvasWidth: number, x: number, y: number)'),
    ('  await service.rpc("fail_operation_media_preview_job", { p_worker_token: token, p_job_id: job.job_id, p_error: message.slice(0, 500) }).catch(() => null);', '  try {\n    await service.rpc("fail_operation_media_preview_job", { p_worker_token: token, p_job_id: job.job_id, p_error: message.slice(0, 500) });\n  } catch {\n    // Failure telemetry must not hide the original preview error.\n  }'),
]

for old, new in replacements:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f'expected one match, found {count}: {old}')
    source = source.replace(old, new, 1)

path.write_text(source, encoding='utf-8')
print('Preview v5 type corrections applied.')
