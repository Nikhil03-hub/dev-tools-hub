export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to legacy path
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

// When this app is running as a published Artifact, the page is sandboxed
// and a plain <a download> click is silently ignored by the viewer — file
// saves there go through the host's `downloads` capability instead. When
// deployed normally (Cloudflare Pages, Vercel, or just opened as a file),
// `window.claude` doesn't exist at all, so this always falls back to the
// standard browser download, which is the only path that real deployment
// ever needs.
type DownloadsCapability = { save: (req: { filename: string; data: string }) => Promise<unknown> };
declare global {
  interface Window {
    claude?: { use: (name: string) => Promise<unknown> };
  }
}

let cachedCapability: Promise<DownloadsCapability | null> | undefined;

function getDownloadsCapability(): Promise<DownloadsCapability | null> {
  if (typeof window === "undefined" || typeof window.claude?.use !== "function") {
    return Promise.resolve(null);
  }
  if (!cachedCapability) {
    cachedCapability = window.claude
      .use("downloads")
      .then((cap) => (cap as DownloadsCapability) ?? null)
      .catch(() => null);
  }
  return cachedCapability;
}

function browserDownload(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function downloadText(filename: string, text: string, mime = "application/json") {
  const downloads = await getDownloadsCapability();
  if (downloads) {
    try {
      await downloads.save({ filename, data: text });
      return;
    } catch {
      // Viewer declined, or the call failed — nothing more to do here
      // (a raw <a download> click would be a silent no-op in this same
      // sandboxed context, so there's no useful fallback to attempt).
      return;
    }
  }
  browserDownload(filename, text, mime);
}
