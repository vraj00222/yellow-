import { useState } from 'react';
import { copyText } from '../share';

/** Copies a deep-link to the clipboard with a brief confirm state. */
export function ShareButton({ href, label = 'Share link' }: { href: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const onClick = async () => {
    const ok = await copyText(href);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }
  };

  return (
    <button
      type="button"
      className={`btn btn--link${copied ? ' btn--copied' : ''}`}
      onClick={onClick}
      aria-live="polite"
      data-tip={copied ? 'Link copied to clipboard' : 'Copy a shareable deep-link'}
    >
      {copied ? (
        <>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
            <path d="M20 6L9 17l-5-5" />
          </svg>
          Copied
        </>
      ) : (
        <>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5" />
            <path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1.5-1.5" />
          </svg>
          {label}
        </>
      )}
    </button>
  );
}
