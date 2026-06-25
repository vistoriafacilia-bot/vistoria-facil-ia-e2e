export function getStorage() { return { __type: 'e2e-storage' }; }
export function ref(_storage: any, path: string) { return { path, fullPath: path }; }
export async function uploadBytes(ref: any, _data: any, _metadata?: any) { return { ref, metadata: _metadata || {} }; }
export async function getDownloadURL(ref: any) { return `https://e2e.local/storage/${encodeURIComponent(ref.path || ref.fullPath || 'file')}`; }
