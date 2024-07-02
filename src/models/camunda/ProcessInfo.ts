export type ProcessInfo = {
  id: string;
  key: string;
  category: string;
  description: string | null;
  name: string;
  version: number;
  resource: string;
  deploymentId: string;
  diagram: string | null;
  suspended: boolean;
  tenantId: string | null;
  versionTag: string | null;
  historyTimeToLive: number;
  startableInTasklist: boolean;
};
