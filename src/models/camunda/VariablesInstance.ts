export type VariableInstance = {
  type: 'Date';
  value: string; // '2024-06-22T23:12:23.912+0200'
  valueInfo: Record<string, unknown>;
  id: string; // 'd7d4bdd3-320a-11ef-b70c-8e4c8728406e'
  name: string; // 'DatumBescheid'
  processDefinitionId: string; // 'pra1.mmd:2:811c34d0-0c79-11ef-acdc-766182395100'
  processInstanceId: string; // 'd7d4bdd2-320a-11ef-b70c-8e4c8728406e'
  executionId: string; // 'd7d4bdd2-320a-11ef-b70c-8e4c8728406e'
  caseInstanceId: string | null;
  caseExecutionId: string | null;
  taskId: string | null;
  batchId: string | null;
  activityInstanceId: string; // 'd7d4bdd2-320a-11ef-b70c-8e4c8728406e'
  errorMessage: string | null;
  tenantId: string | null;
};
