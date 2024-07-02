export type ProcessInstance = {
  links: Link[]; // Assuming links can be any array type
  id: string;
  definitionId: string;
  businessKey: string | null;
  caseInstanceId: string | null;
  ended: boolean;
  suspended: boolean;
  tenantId: string | null;
};

export type DoneProcessInstance = {
  id: string;
  businessKey: string;
  processDefinitionId: string;
  processDefinitionKey: string;
  processDefinitionName: string;
  processDefinitionVersion: number;
  startTime: string;
  endTime: string;
  removalTime: string;
  durationInMillis: number;
  startUserId: string | null;
  startActivityId: string;
  deleteReason: string | null;
  rootProcessInstanceId: string;
  superProcessInstanceId: string | null;
  superCaseInstanceId: string | null;
  caseInstanceId: string | null;
  tenantId: string | null;
  state: string;
};

export type Link = {
  method: string;
  href: string;
  rel: string;
};
