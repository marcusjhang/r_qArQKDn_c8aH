# Project conventions

This is a starter template. Edit anything freely as per the user requests.

## Package manager

Use **bun**, not npm.

```bash
bun install          # install deps
bun run dev          # start dev server
bun run build        # production build
bun run db:setup     # migrate + seed
bun run db:migrate   # apply migrations
bun run db:seed      # seed data
bun run db:generate  # generate migration after schema change
```

## Admin panel

- Route: `/admin`
- Credentials: `admin@admin.com` / `password`
- Protected by role check in `app/admin/layout.tsx`

## Stack

- Next.js 15 (Turbopack)
- React 19, TypeScript, Tailwind CSS
- Auth.js (next-auth v5 beta) with credentials provider
- Drizzle ORM + Neon Postgres
- Shadcn UI components in `components/ui/`
