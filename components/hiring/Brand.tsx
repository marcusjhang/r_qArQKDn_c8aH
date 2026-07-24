// Shared top-left brand mark (icon + wordmark). Plain non-client component.

import { APP_NAME } from '@/lib/hiring/config';

export default function Brand({ subtitle }: { subtitle: string }) {
  return (
    <div className="flex items-center gap-2 text-[15px] font-bold">
      {/* Plain <img>: next/image doesn't optimize inline SVGs, only adds overhead. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="inline-block h-[22px] w-[22px] object-contain"
        src="/lightsprint-icon.svg"
        alt={APP_NAME}
        width={22}
        height={22}
      />
      Hiring{' '}
      <small className="text-[11px] font-medium text-muted-foreground">
        {subtitle}
      </small>
    </div>
  );
}
