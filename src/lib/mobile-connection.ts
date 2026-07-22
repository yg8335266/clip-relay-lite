export type MobileConnectionBundle = {
  schemaVersion: 1;
  app: 'clip-relay';
  serverUrl: string;
  apiBase: string;
  accessToken: string;
  generatedAt: string;
};

export function buildMobileConnectionBundle(input: {
  serverUrl: string;
  apiBase: string;
  accessToken: string;
}): MobileConnectionBundle {
  return {
    schemaVersion: 1,
    app: 'clip-relay',
    serverUrl: input.serverUrl,
    apiBase: input.apiBase,
    accessToken: input.accessToken,
    generatedAt: new Date().toISOString(),
  };
}

export function isMobileConnectionBundle(value: unknown): value is MobileConnectionBundle {
  if (!value || typeof value !== 'object') return false;
  const bundle = value as Partial<MobileConnectionBundle>;
  return (
    bundle.schemaVersion === 1 &&
    bundle.app === 'clip-relay' &&
    typeof bundle.serverUrl === 'string' &&
    typeof bundle.apiBase === 'string' &&
    typeof bundle.accessToken === 'string' &&
    typeof bundle.generatedAt === 'string'
  );
}

export function parseMobileConnectionBundle(raw: string): MobileConnectionBundle | null {
  try {
    const parsed = JSON.parse(raw);
    return isMobileConnectionBundle(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
