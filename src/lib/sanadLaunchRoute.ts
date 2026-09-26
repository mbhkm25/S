/**
 * Canonical entry for older SANAD installs/bookmarks which still open the
 * retired top-level assistant route. A real thread deep link must NEVER be
 * redirected: it is explicitly project-scoped and is authenticated by the
 * existing thread-detail RPC once opened.
 *
 * This function does not handle public links or non-assistant routes.
 */
export function unscopedAssistantHomeRedirect(
  pathname: string,
  search: string,
  basePath = '/',
): string | null {
  const normalizedBase = basePath.endsWith('/') ? basePath : `${basePath}/`;
  const assistantPath = `${normalizedBase}sanad-ai`;
  if (pathname !== assistantPath && pathname !== `${assistantPath}/`) return null;

  const params = new URLSearchParams(search);
  if (params.get('thread')?.trim()) return null;
  return `${normalizedBase}today`;
}
