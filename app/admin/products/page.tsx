import { db, products } from '@/lib/db';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ProductDeleteButton } from './client';

export const dynamic = 'force-dynamic';

export default async function AdminProductsPage() {
  const allProducts = await db.select().from(products).orderBy(products.id);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Products</h1>
        <p className="text-sm text-slate-400 mt-1">
          Manage your product catalog.
        </p>
      </div>

      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle className="text-base text-slate-100">
            All Products ({allProducts.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {allProducts.length === 0 ? (
            <p className="text-sm text-slate-500 py-4 text-center">
              No products yet. Run <code className="rounded bg-slate-800 px-1.5 py-0.5 text-xs font-mono">npm run db:seed</code> to add sample data.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-left">
                    <th className="pb-3 pr-4 font-medium text-slate-400">ID</th>
                    <th className="pb-3 pr-4 font-medium text-slate-400">Name</th>
                    <th className="pb-3 pr-4 font-medium text-slate-400">Status</th>
                    <th className="pb-3 pr-4 font-medium text-slate-400">Price</th>
                    <th className="pb-3 pr-4 font-medium text-slate-400">Stock</th>
                    <th className="pb-3 font-medium text-slate-400">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {allProducts.map((product) => (
                    <tr key={product.id} className="text-slate-300">
                      <td className="py-3 pr-4 tabular-nums">{product.id}</td>
                      <td className="py-3 pr-4">{product.name}</td>
                      <td className="py-3 pr-4">
                        <Badge
                          variant="secondary"
                          className={
                            product.status === 'active'
                              ? 'bg-emerald-900/50 text-emerald-300 border-emerald-800 hover:bg-emerald-900/70'
                              : product.status === 'archived'
                                ? 'bg-slate-800 text-slate-500 border-slate-700'
                                : 'bg-amber-900/50 text-amber-300 border-amber-800 hover:bg-amber-900/70'
                          }
                        >
                          {product.status}
                        </Badge>
                      </td>
                      <td className="py-3 pr-4 tabular-nums font-mono text-xs">
                        ${product.price}
                      </td>
                      <td className="py-3 pr-4 tabular-nums">{product.stock}</td>
                      <td className="py-3">
                        <ProductDeleteButton
                          id={product.id}
                          name={product.name}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
