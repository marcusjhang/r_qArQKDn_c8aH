import { db, users } from '@/lib/db';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DeleteButton, RoleToggle } from './client';

export const dynamic = 'force-dynamic';

export default async function AdminUsersPage() {
  const allUsers = await db.select().from(users).orderBy(users.id);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Users</h1>
        <p className="text-sm text-slate-400 mt-1">
          Manage registered users.
        </p>
      </div>

      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle className="text-base text-slate-100">
            All Users ({allUsers.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left">
                  <th className="pb-3 pr-4 font-medium text-slate-400">ID</th>
                  <th className="pb-3 pr-4 font-medium text-slate-400">Name</th>
                  <th className="pb-3 pr-4 font-medium text-slate-400">Email</th>
                  <th className="pb-3 pr-4 font-medium text-slate-400">Role</th>
                  <th className="pb-3 pr-4 font-medium text-slate-400">Created</th>
                  <th className="pb-3 font-medium text-slate-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {allUsers.map((user) => (
                  <tr key={user.id} className="text-slate-300">
                    <td className="py-3 pr-4 tabular-nums">{user.id}</td>
                    <td className="py-3 pr-4">{user.name || '—'}</td>
                    <td className="py-3 pr-4 font-mono text-xs">{user.email}</td>
                    <td className="py-3 pr-4">
                      <Badge
                        variant={user.role === 'admin' ? 'default' : 'secondary'}
                        className={
                          user.role === 'admin'
                            ? 'bg-red-900/50 text-red-300 border-red-800 hover:bg-red-900/70'
                            : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700'
                        }
                      >
                        {user.role}
                      </Badge>
                    </td>
                    <td className="py-3 pr-4 text-xs text-slate-500">
                      {user.createdAt.toLocaleDateString()}
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <RoleToggle
                          userId={user.id}
                          currentRole={user.role}
                        />
                        <DeleteButton
                          type="user"
                          id={user.id}
                          label={user.email}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
