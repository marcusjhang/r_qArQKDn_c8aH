// Shared top-left brand mark: the app icon + wordmark. Used by the board and
// settings top bars so they stay consistent. Plain (non-client) component —
// just markup — safe to render inside the client shells.

import { APP_NAME } from '@/lib/hiring/config';

export default function Brand({ subtitle }: { subtitle: string }) {
  return (
    <div className="brand">
      {/* A 22px static SVG brand mark. next/image doesn't optimize inline SVGs
          (it would only add overhead and require `unoptimized`), so a plain
          <img> is the correct choice — the no-img-element LCP/bandwidth
          heuristic targets large content images, not a fixed-size icon. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="logo"
        src="/lightsprint-icon.svg"
        alt={APP_NAME}
        width={22}
        height={22}
      />
      Hiring <small>{subtitle}</small>
    </div>
  );
}
