export function describeActivity(method: string, path: string, body: any = {}, result?: any, statusCode = 200, previous?: any): string {
  const parts = path.replace(/\/$/, '').split('/').filter(Boolean);
  const module = parts[1];
  const record = result?.data || result || {};
  const failed = statusCode >= 400;
  const finish = (text: string) => failed ? `Failed: ${text}` : text;
  if (module === 'auth') return finish('Password changed');
  if (module === 'settings') return finish('Invoice settings edited');
  if (module === 'inactive') return finish(`${parts[2] === 'cms' ? 'CMS records' : parts[2]} restored`);
  const label = ({ products: 'product', categories: 'category', brands: 'brand', orders: 'invoice' })[module]
    || (parts[2] === 'banners' ? 'CMS banner' : parts[2] === 'pages' ? 'CMS page' : 'CMS announcement');
  const name = module === 'orders' ? record.orderNumber || previous?.orderNumber
    : record.name || record.title || body.name || body.title || previous?.name || previous?.title;
  const subject = name ? `${String(name).slice(0, 200)} ${label}` : label[0].toUpperCase() + label.slice(1);
  const restoring = path.endsWith('/restore') || (body.isActive === true && previous?.isActive === false) || (body.isPublished === true && previous?.isPublished === false);
  const deleting = method === 'DELETE' || body.isActive === false || body.isPublished === false;
  const verb = deleting ? 'deleted' : method === 'POST' && !path.endsWith('/restore') ? 'added' : restoring ? 'restored' : 'edited';
  return finish(`${subject} ${verb}`);
}
