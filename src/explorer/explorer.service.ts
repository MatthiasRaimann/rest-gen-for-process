import { Injectable } from '@nestjs/common';
import { DatabaseConnectorService } from 'src/database-connector/database-connector.service';
import { OperationsActive, OperationsInitiate, OperationsNotActive } from 'src/models/Operations';
import { ProcessEngineConnector } from 'src/services/processEngine.service';
import { Process, Resource } from 'src/util/util.service';

@Injectable()
export class ExplorerService {
  constructor(
    private peConnector: ProcessEngineConnector,
    private dbConnector: DatabaseConnectorService
  ) {}

  findParents(resourceTree: Resource[]): string[] {
    return resourceTree
      .filter((_, i) => i !== resourceTree.length - 1)
      .map((resource) => {
        let href = '';

        for (let i = 0; i < resourceTree.indexOf(resource) + 1; i++) {
          href +=
            resource.type === 'Process'
              ? `/${encodeURIComponent(resourceTree[i].name)}/pid:${(resourceTree[i] as Process).id}`
              : `/${encodeURIComponent(resourceTree[i].name)}`;
        }

        return href;
      });
  }

  async findChildren(leadResource: Resource, baseURI: string): Promise<{ children: string[]; type: string }> {
    let type = '';

    const children =
      leadResource.type === 'Task'
        ? await this.peConnector
            .findRunningProcesses(leadResource.name)
            .then((processes) => {
              type = 'Process Model';
              // this.dbConnector.
              return processes.map((process) => `/${baseURI}/pid:${process}`);
            })
            .catch(() => {
              type = 'User Task';
              return [] as string[]; // as user task you dont have children
            })
        : await Promise.all([
            this.peConnector.findChildProcesses((leadResource as Process).id),
            this.peConnector.findTasksOfProcess((leadResource as Process).id)
          ]).then(async ([processes, tasks]) => {
            type = 'Process Instance';
            await Promise.allSettled(
              processes.map((p) => this.dbConnector.linkProcessToParentProcess(leadResource, p))
            );

            const { key: definitionKey } = await this.peConnector.findProcessDefinition(leadResource.name);
            const availableTasks = await this.peConnector.findAllTasks(definitionKey);

            return Array.from(
              new Set(
                tasks
                  .map((t) => `/${baseURI}/${encodeURIComponent(t)}`)
                  .concat(processes.map((process) => `/${baseURI}/${process.name}/pid:${process.id}`))
                  .concat(availableTasks.map((task) => `/${baseURI}/${encodeURIComponent(task.name)}`))
              )
            );
          });

    return { type, children };
  }

  async findOperations(
    processInstanceID: string,
    rootPM: boolean, // rootProcessModel
    taskName: string,
    currentURI: string
  ): Promise<{ active: boolean; operations: OperationsActive | OperationsNotActive | OperationsInitiate }> {
    if (rootPM)
      return Promise.resolve({
        operations: {
          self: {
            href: currentURI
          },
          initiate: {
            href: currentURI,
            method: 'POST'
          }
        },
        active: false
      });

    return this.peConnector
      .findTaskByName(processInstanceID, taskName)
      .then(() => {
        return {
          operations: {
            self: {
              href: currentURI
            },
            create: {
              href: currentURI,
              method: 'POST'
            },
            update: {
              href: currentURI,
              method: 'PUT'
            },
            complete: {
              href: currentURI,
              method: 'PATCH'
            }
          },
          active: true
        };
      })
      .catch(() => {
        return {
          operations: {
            self: {
              href: currentURI
            }
          },
          active: false
        };
      });
  }
}
