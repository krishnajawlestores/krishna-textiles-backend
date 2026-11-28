import { Prisma } from '@prisma/client';

const methods = ['POST', 'PUT', 'PATCH', 'DELETE'];
const modules = ['products', 'categories', 'brands', 'cms', 'orders'];
const exactPaths = [
  '/api/settings', '/api/auth/change-password',
  ...['products', 'categories', 'brands', 'cms'].map(type => `/api/inactive/${type}/activate`),
];

export function shouldLogActivity(method: string, path: string): boolean {
  if (!methods.includes(method)) return false;
  const normalized = path.replace(/\/$/, '');
  if (normalized === '/api/orders/razorpay' || normalized.startsWith('/api/orders/razorpay/')) return false;
  return exactPaths.includes(normalized) || modules.some(module =>
    normalized === `/api/${module}` || normalized.startsWith(`/api/${module}/`));
}

// Apply the same scope to historical entries without deleting audit records.
export const activityWhere: Prisma.AdminActivityWhereInput = {
  action: { in: methods },
  OR: [
    { path: { in: exactPaths.flatMap(path => [path, `${path}/`]) } },
    ...modules.flatMap(module => [
      { path: `/api/${module}` }, { path: { startsWith: `/api/${module}/` } },
    ]),
  ],
  NOT: { OR: [{ path: '/api/orders/razorpay' }, { path: { startsWith: '/api/orders/razorpay/' } }] },
};
