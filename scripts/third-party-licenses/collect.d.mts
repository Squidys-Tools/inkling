export type ThirdPartyLicense = {
  name: string;
  version: string | null;
  license: string;
  sourceUrl: string | null;
  description?: string;
  noticeText: string;
};

export function collectThirdPartyLicenses(rootDir: string): {
  entries: ThirdPartyLicense[];
  warnings: string[];
};

export function sourceUrlOf(pkg: Record<string, unknown>): string | null;
