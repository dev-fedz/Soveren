export const IMAGE_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'svg',
  'ico',
  'bmp',
  'tiff',
  'tif',
  'avif',
]);

export const DOC_EXTENSIONS = new Set([
  'pdf',
  'csv',
  'tsv',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'word',
  'ppt',
  'pptx',
  'odt',
  'ods',
  'odp',
  'rtf',
]);

export function getFileExtension(filePath: string): string {
  if (!filePath) return '';
  const clean = filePath.split('?')[0].split('#')[0].trim();
  const parts = clean.split('.');
  if (parts.length <= 1) return '';
  return parts.pop()?.toLowerCase() || '';
}

export function isImageFile(filePath: string): boolean {
  const ext = getFileExtension(filePath);
  return IMAGE_EXTENSIONS.has(ext);
}

export function isDocFile(filePath: string): boolean {
  const ext = getFileExtension(filePath);
  return DOC_EXTENSIONS.has(ext);
}

export function getFileViewer(filePath: string): 'code' | 'images' | 'docs' {
  if (isImageFile(filePath)) return 'images';
  if (isDocFile(filePath)) return 'docs';
  return 'code';
}
