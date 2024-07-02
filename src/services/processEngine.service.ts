import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import axios, { isAxiosError } from 'axios';
import { DatabaseConnectorService } from 'src/database-connector/database-connector.service';
import { ProcessInfo } from 'src/models/camunda/ProcessInfo';
import { DoneProcessInstance, ProcessInstance } from 'src/models/camunda/ProcessInstance';
import { ProcessVariables } from 'src/models/camunda/ProcessVariables';
import { Task } from 'src/models/camunda/Task';
import { TaskSlim } from 'src/models/camunda/TaskSlim';
import { VariableInstance } from 'src/models/camunda/VariablesInstance';
import { Process } from 'src/util/util.service';

@Injectable()
export class ProcessEngineConnector {
  constructor(private dbConnector: DatabaseConnectorService) {}

  async deleteInstance(instance: string): Promise<void> {
    return axios.delete(`http://localhost:8080/engine-rest/process-instance/${instance}`).then((res) => void res.data);
  }

  async findProcessDefinition(processName: string): Promise<ProcessInfo> {
    return axios
      .get<ProcessInfo[]>(`http://localhost:8080/engine-rest/process-definition?name=${processName}`)
      .then(({ data }) => {
        const maxVersion = Math.max(...data.map((process) => process.version));
        return data.filter((process) => process.version === maxVersion)[0];
      });
  }

  async findRunningProcesses(processName: string): Promise<string[]> {
    return this.findProcessDefinition(processName).then(async (processDefinition) => {
      return axios
        .get<
          ProcessInstance[]
        >(`http://localhost:8080/engine-rest/process-instance?processDefinitionKey=${processDefinition.key}`)
        .then((res) => res.data.map((process) => process.id));
    });
  }

  async findProcessNameById(definitionKey: string): Promise<string> {
    return axios
      .get<ProcessInfo>(`http://localhost:8080/engine-rest/process-definition/${definitionKey}`)
      .catch(() =>
        axios.get<ProcessInfo>(`http://localhost:8080/engine-rest/history/process-definition/${definitionKey}`)
      )
      .then((res) => res.data.name);
  }

  async findChildProcesses(processInstanceID: string): Promise<Process[]> {
    const runningInstances = await axios
      .get<
        ProcessInstance[]
      >(`http://localhost:8080/engine-rest/process-instance?superProcessInstance=${processInstanceID}`)
      .then(async (res): Promise<Process[]> => {
        return Promise.all(
          res.data.map((process) =>
            this.findProcessNameById(process.definitionId).then(
              (name): Process => ({
                type: 'Process',
                name,
                id: process.id
              })
            )
          )
        );
      });

    const doneInstances = await axios
      .get<DoneProcessInstance[]>(`http://localhost:8080/engine-rest/history/process-instance`)
      .then(async (res): Promise<Process[]> => {
        return Promise.all(
          res.data
            .filter((p) => p.superProcessInstanceId === processInstanceID)
            .map((process) =>
              this.findProcessNameById(process.processDefinitionId).then(
                (name): Process => ({
                  type: 'Process',
                  name,
                  id: process.id
                })
              )
            )
        );
      });

    return runningInstances.concat(doneInstances.filter((p) => !runningInstances.some((r) => r.id === p.id)));
  }

  async findTasksOfProcess(processInstanceID: string): Promise<string[]> {
    return axios
      .get<Task[]>(`http://localhost:8080/engine-rest/task?processInstanceId=${processInstanceID}`)
      .then((res) => res.data.map((task) => task.name));
  }

  async findAllTasks(definitionKey: string): Promise<TaskSlim[]> {
    const xml = await axios
      .get<camundaXML>(`http://localhost:8080/engine-rest/process-definition/key/${definitionKey}/xml`)
      .then((res) => res.data.bpmn20Xml);

    const tasks = xml.matchAll(/<bpmn:userTask(?:[\s\S]*?)>/g);
    return Array.from(tasks).map((task) => {
      const id = task[0].match(/id="([^"]*)"/)[1];
      const name = task[0].match(/name="([^"]*)"/)[1];
      return { id, name };
    });
  }

  async findTaskByName(processInstanceID: string, taskName: string): Promise<Task> {
    return axios
      .get<Task[]>(`http://localhost:8080/engine-rest/task?processInstanceId=${processInstanceID}&name=${taskName}`)
      .then((res) => {
        if (res.data.length === 0) throw new NotFoundException();
        else return res.data[0];
      });
  }

  async startProcess(processName: string): Promise<ProcessInstance> {
    const { id } = await this.findProcessDefinition(processName);

    return axios
      .post<ProcessInstance>(`http://localhost:8080/engine-rest/process-definition/${id}/start`, {
        withVariablesInReturn: false
      })
      .then((res) => res.data)
      .then(async (p) => {
        await this.dbConnector.saveProcessInstance(processName, p.id);
        return p;
      });
  }

  async getProcessVariables(processInstanceID: string) {
    return axios
      .get(`http://localhost:8080/engine-rest/process-instance/${processInstanceID}/variables`)
      .then((res) => res.data);
  }

  async findVariablesOfProcessInstance(processInstanceID: string): Promise<ProcessVariables> {
    return await axios
      .get<ProcessVariables>(`http://localhost:8080/engine-rest/process-instance/${processInstanceID}/variables`)
      .then((res) => res.data)
      .catch(async () => {
        return axios
          .get<
            VariableInstance[]
          >(`http://localhost:8080/engine-rest/variable-instance?processInstanceId=${processInstanceID}`)
          .then((res) => {
            console.log(
              'old variables',
              res.data.filter((v) => v.processInstanceId === processInstanceID)
            );

            return res.data
              .filter((v) => v.processInstanceId === processInstanceID)
              .reduce(
                (agg, cur) => ({ ...agg, [cur.name]: { type: cur.type, value: cur.value, valueInfo: cur.valueInfo } }),
                {} as Record<string, VariableInstance>
              );
          });
      });
  }

  async completeTask(taskName: string, processInstanceID: string): Promise<void> {
    //query all tasks of process instance
    return axios
      .get<Task[]>(`http://localhost:8080/engine-rest/task?processInstanceId=${processInstanceID}&name=${taskName}`)
      .then((res) => {
        return Promise.all(
          res.data.map((t) =>
            axios
              .post(`http://localhost:8080/engine-rest/task/${t.id}/complete`, {
                variables: {},
                withVariablesInReturn: true
              })
              .catch((e) => {
                if (isAxiosError(e)) {
                  console.log('completion failed', e.response.status);
                  throw new InternalServerErrorException(e.response.data.message);
                } else throw e;
              })
          )
        );
      })
      .then(() => void 0);
  }

  updateVariables(leadProcessInstanceID: string, parsed: Record<string, Record<string, any>>) {
    return axios.post(`http://localhost:8080/engine-rest/process-instance/${leadProcessInstanceID}/variables`, {
      // sowohl als string als auch als json speichern -> dann kann ich über expression drauf zugreifen und über rest api
      modifications: Object.entries(parsed).reduce(
        (agg, [key, value]) => ({
          ...agg,
          [`JSON${key}`]: { value: JSON.stringify(value), type: 'Json' },
          [key]: { value: JSON.stringify(value), type: 'String' }
        }),
        {} as Record<string, { value: string; type: 'Json' }>
      )
    });
  }
}

type camundaXML = {
  id: string;
  bpmn20Xml: string;
};
