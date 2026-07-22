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
  return (
    <span className="profile-links">
      {linkedinUrl && (
        <a
          className="profile-link"
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
          className="profile-link"
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
