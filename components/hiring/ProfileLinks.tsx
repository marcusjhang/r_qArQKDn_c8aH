'use client';

// LinkedIn / GitHub profile links, rendered as icon anchors. Shared by the
// candidate card (icon-only) and the drawer header (icons + labels) so the
// markup and a11y attributes live in one place. Clicks stopPropagation so a
// link on the clickable card doesn't also open the detail drawer.

import { Github, Linkedin } from 'lucide-react';

export default function ProfileLinks({
  linkedinUrl,
  githubUrl,
  withLabels = false
}: {
  linkedinUrl: string | null;
  githubUrl: string | null;
  withLabels?: boolean;
}) {
  if (!linkedinUrl && !githubUrl) return null;
  // In the card the links are compact icon-only chips (muted box); in the
  // drawer header (withLabels) they read as primary-coloured icon+label links.
  const linkClass = withLabels
    ? 'inline-flex items-center justify-center gap-1 text-[12.5px] font-semibold text-primary no-underline hover:underline'
    : 'inline-flex h-[22px] w-[22px] items-center justify-center gap-1 rounded-sm bg-surface-2 text-muted-foreground no-underline';
  return (
    <span
      className={`inline-flex items-center ${withLabels ? 'mt-1.5 gap-3' : 'gap-1'}`}
    >
      {linkedinUrl && (
        <a
          className={linkClass}
          href={linkedinUrl}
          target="_blank"
          rel="noopener noreferrer"
          title="LinkedIn profile"
          aria-label="LinkedIn profile"
          onClick={(e) => e.stopPropagation()}
        >
          <Linkedin size={14} aria-hidden />
          {withLabels && 'LinkedIn'}
        </a>
      )}
      {githubUrl && (
        <a
          className={linkClass}
          href={githubUrl}
          target="_blank"
          rel="noopener noreferrer"
          title="GitHub profile"
          aria-label="GitHub profile"
          onClick={(e) => e.stopPropagation()}
        >
          <Github size={14} aria-hidden />
          {withLabels && 'GitHub'}
        </a>
      )}
    </span>
  );
}
