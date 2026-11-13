/**
 * Universal clipboard utility with fallback for insecure contexts (HTTP on LAN).
 * Standard navigator.clipboard is restricted to secure contexts (HTTPS or localhost).
 * In insecure contexts (e.g. http://10.20.100.117:3000), document.execCommand('copy')
 * via a hidden textarea ensures copying succeeds across all browser environments.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  // 1. Try modern Async Clipboard API if available
  if (navigator?.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to execCommand fallback if permission rejected or unsupported
    }
  }

  // 2. Legacy fallback for non-secure HTTP contexts or unsupported browsers
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.contain = 'strict';
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '-9999px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    const successful = document.execCommand('copy');
    document.body.removeChild(textarea);
    return Boolean(successful);
  } catch (err) {
    console.warn('Fallback clipboard copy failed:', err);
    return false;
  }
}
