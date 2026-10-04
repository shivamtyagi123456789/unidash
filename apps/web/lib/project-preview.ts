export function projectAssetBase(requestUrl: string, projectId: string, fileId: string, projectPath: string) {
  const directory = projectPath.split("/").slice(0, -1).filter(Boolean);
  const encodedDirectory = directory.map((part) => encodeURIComponent(part)).join("/");
  return new URL(`/api/v1/projects/${encodeURIComponent(projectId)}/files/${encodeURIComponent(fileId)}/assets/${encodedDirectory ? `${encodedDirectory}/` : ""}`, requestUrl);
}

export function projectAssetsRoot(requestUrl: string, projectId: string, fileId: string) {
  return new URL(`/api/v1/projects/${encodeURIComponent(projectId)}/files/${encodeURIComponent(fileId)}/assets/`, requestUrl);
}

export function projectPreviewCsp(requestUrl: string, projectId: string, fileId: string) {
  const assetPath = `/api/v1/projects/${encodeURIComponent(projectId)}/files/${encodeURIComponent(fileId)}/assets/`;
  const assetSource = new URL(assetPath, requestUrl).origin + assetPath;
  return [
    "sandbox allow-scripts",
    "default-src 'none'",
    `script-src 'unsafe-inline' ${assetSource}`,
    `style-src 'unsafe-inline' ${assetSource}`,
    `img-src data: blob: ${assetSource}`,
    `font-src data: ${assetSource}`,
    `media-src data: blob: ${assetSource}`,
    "connect-src 'none'",
    "form-action 'none'",
    `base-uri ${assetSource}`,
    "object-src 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
}

export function addProjectAssetBase(html: string, baseUrl: string, rootUrl = baseUrl) {
  const tag = `<base href="${baseUrl.replaceAll("&", "&amp;").replaceAll('"', "&quot;")}">`;
  const withoutOldBase = html.replace(/<base\b[^>]*>/gi, "");
  const withBase = /<head\b[^>]*>/i.test(withoutOldBase)
    ? withoutOldBase.replace(/<head\b[^>]*>/i, (head) => `${head}${tag}`)
    : `<head>${tag}</head>${withoutOldBase}`;
  const encodedRoot = rootUrl.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
  // Root-relative references are relative to the static site root, not the
  // UniDash origin. Rebase local HTML resources to this project's asset API.
  return withBase.replace(/\b(src|href|poster|data|xlink:href)=(['"])\/(?!\/)([^'"]*)\2/gi, (_match, attribute: string, quote: string, path: string) => `${attribute}=${quote}${encodedRoot}${path}${quote}`);
}

export function rewriteProjectCss(css: string, rootUrl: string) {
  const encodedRoot = rootUrl.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  return css
    .replace(/url\(\s*(['"]?)\/(?!\/)([^)'"\s]+)\1\s*\)/gi, (_match, quote: string, path: string) => `url(${quote}${encodedRoot}${path}${quote})`)
    .replace(/@import\s+(['"])\/(?!\/)([^'"]+)\1/gi, (_match, quote: string, path: string) => `@import ${quote}${encodedRoot}${path}${quote}`);
}
