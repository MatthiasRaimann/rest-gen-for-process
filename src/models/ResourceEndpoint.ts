import { OperationsActive, OperationsInitiate, OperationsNotActive } from './Operations';

export type ResourceEndpoint = {
  name: string;
  data?: unknown;
  type: string;
  _links: {
    parents: string[];
    children: string[];
    operations: OperationsActive | OperationsNotActive | OperationsInitiate;
  };
};

export interface Link {
  href: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
}
