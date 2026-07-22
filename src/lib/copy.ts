export function isSecure(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.isSecureContext;
  } catch {
    return false;
  }
}

export async function safeCopyText(text: string): Promise<boolean> {
  // Prefer legacy path first for broader compatibility (esp. on mobile/HTTP)
  try {
    if (typeof document !== 'undefined') {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      // Place off-screen rather than invisible; some browsers ignore fully hidden elements for copy
      ta.style.position = 'fixed';
      ta.style.top = '-10000px';
      ta.style.left = '-10000px';
      ta.style.opacity = '1';
      ta.style.pointerEvents = 'none';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      try { ta.setSelectionRange(0, ta.value.length); } catch {}

      // Hook copy event to set clipboardData explicitly (helps on some Android browsers)
      let copied = false;
      const onCopy = (e: ClipboardEvent) => {
        try {
          e.clipboardData?.setData('text/plain', text);
          e.preventDefault();
          copied = true;
        } catch {}
      };
      document.addEventListener('copy', onCopy, { capture: true, once: true } as any);
      const ok = document.execCommand('copy');
      document.removeEventListener('copy', onCopy, { capture: true } as any);
      document.body.removeChild(ta);
      if (ok || copied) return true;
    }
  } catch {}

  // Fallback to modern async API if available (usually requires HTTPS)
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}

  return false;
}

export async function safeCopyBlob(blob: Blob, mime?: string): Promise<boolean> {
  if (!isSecure()) return false;
  try {
    const type = mime || (blob.type || 'application/octet-stream');
    // @ts-ignore ClipboardItem is available in modern browsers under secure contexts
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.write === 'function' && typeof ClipboardItem !== 'undefined') {
      try {
        // First try original type
        // @ts-ignore
        const item = new ClipboardItem({ [type]: blob });
        // @ts-ignore
        await navigator.clipboard.write([item]);
        return true;
      } catch {
        // Some browsers only allow image/png for image clipboard writes.
        // If original is image/* but not png, convert to PNG and retry.
        if (type.startsWith('image/') && type !== 'image/png') {
          try {
            const png = await convertImageBlobToPng(blob);
            if (png) {
              // @ts-ignore
              const fallbackItem = new ClipboardItem({ ['image/png']: png });
              // @ts-ignore
              await navigator.clipboard.write([fallbackItem]);
              return true;
            }
          } catch {}
        }
      }
    }
  } catch {}
  return false;
}

async function convertImageBlobToPng(src: Blob): Promise<Blob | null> {
  try {
    const url = URL.createObjectURL(src);
    try {
      const img: HTMLImageElement = await new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = url;
        // hint: avoid blocking decode when possible
        try { (i as any).decoding = 'async'; } catch {}
      });
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      if (!w || !h) return null;
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0, w, h);
      const png: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      return png;
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return null;
  }
}
