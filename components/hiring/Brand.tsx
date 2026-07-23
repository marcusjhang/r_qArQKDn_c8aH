// Shared top-left brand mark: the app icon + wordmark. Used by the board and
// settings top bars so they stay consistent. Plain (non-client) component —
// just markup — safe to render inside the client shells.

import { APP_NAME } from '@/lib/hiring/model/config';

export default function Brand({ subtitle }: { subtitle: string }) {
  return (
    <div className="brand">
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
