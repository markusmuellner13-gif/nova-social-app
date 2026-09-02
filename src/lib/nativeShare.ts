'use client';

import { isNative, loadPlugin } from './native';

// Sharing, one call for both runtimes.
//
// `navigator.share` exists in a Capacitor WebView but is unreliable there: on
// iOS it can throw NotAllowedError because the gesture doesn't survive the
// bridge, and on Android it opens the WebView's own chooser rather than the
// system sheet. @capacitor/share calls UIActivityViewController / Intent.ACTION_SEND
// directly — the sheet users expect, with their real share targets.
//
// Sharing is Nova's main free growth loop, so a share sheet that silently fails
// is a growth bug, not a cosmetic one.
export interface ShareRequest {
  title?: string;
  text?: string;
  url?: string;
  dialogTitle?: string;
}

export type ShareOutcome = 'shared' | 'cancelled' | 'unsupported';

export async function share(req: ShareRequest): Promise<ShareOutcome> {
  if (isNative()) {
    const plugin = await loadPlugin(() => import('@capacitor/share'));
    if (plugin) {
      try {
        const { value } = await plugin.Share.canShare();
        if (value) {
          await plugin.Share.share({
            title: req.title,
            text: req.text,
            url: req.url,
            dialogTitle: req.dialogTitle ?? req.title,
          });
          return 'shared';
        }
      } catch {
        // The plugin rejects on cancel as well as on failure and gives no way
        // to tell them apart, so report the harmless one: callers only use this
        // to decide whether to fall back to the clipboard, and copying a link
        // the user just chose not to share would be the wrong thing to do.
        return 'cancelled';
      }
    }
  }

  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ title: req.title, text: req.text, url: req.url });
      return 'shared';
    } catch {
      return 'cancelled';
    }
  }

  return 'unsupported';
}
