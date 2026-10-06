export interface AppEntry {
  id: string;
  name: string;
  description: string;
  url?: string;
}

export const apps: AppEntry[] = [];

export function getPublicAppUrl(entry: AppEntry): string | null {
  if (!entry.url?.trim()) return null;
  try {
    const url = new URL(entry.url);
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}
