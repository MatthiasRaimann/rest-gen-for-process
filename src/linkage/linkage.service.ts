import { Injectable, NotFoundException } from '@nestjs/common';
import { ProcessInstance } from '@prisma/client';
import { readFileSync } from 'fs';
import { load } from 'js-yaml';
import { resolve } from 'path';
import { DatabaseConnectorService } from 'src/database-connector/database-connector.service';
import { ProcessEngineConnector } from 'src/services/processEngine.service';
import { z } from 'zod';

@Injectable()
export class LinkageService {
  data = Z_LINKAGE.parse(load(readFileSync(resolve(__dirname, '../../', 'linkage.yaml'), 'utf8')));

  constructor(
    private peConnector: ProcessEngineConnector,
    private dbConnector: DatabaseConnectorService
  ) {}

  async getLinkageOfTask(processInstanceID: string, taskName: string): Promise<LinkageResources> {
    const resources = this.data.tasks[taskName];
    if (resources === undefined) throw new NotFoundException();
    // const dataFromDB = await this.dbConnector.getResourcesOfTask(processInstanceID, taskName);

    return Promise.all(
      resources.map(async (r) => {
        const data: Record<string, object> = await this.dbConnector.getResourcesOfTask(
          processInstanceID,
          r,
          this.data.resources[r]
        );
        return {
          data,
          parser: this.createParser(this.data.resources[r])
        };
      })
    ).then((r) => r.reduce((agg, cur, i) => ({ ...agg, [resources[i]]: cur }), {}));
  }

  async getLinkageOfProcessInstance(processInstanceID: string, root = true): Promise<DataResource> {
    root;

    return this.dbConnector.getProcessVariables(processInstanceID).then(async ({ childProcesses, resources }) => {
      const groupedChildren = childProcesses.reduce(
        (agg, p) => {
          if (agg[p.name]) {
            agg[p.name].push(p);
            return agg;
          } else {
            return { ...agg, [p.name]: [p] };
          }
        },
        {} as { [key: string]: ProcessInstance[] }
      );

      const subResources: DataResource = (
        await Promise.all(
          Object.entries(groupedChildren).map(async ([key, instances]) => {
            // console.log(key, instances);
            const y = await Promise.all(instances.map((i) => this.getLinkageOfProcessInstance(i.id, false)));

            return { [key]: y.map((x) => ({ instanceID: x.instanceID, ...x })) };
          })
        )
      ).reduce((agg, cur) => ({ ...agg, ...cur }), {});

      const resourceLinkage = Array.from(new Set(resources.map((r) => r.name))).reduce((agg, cur): DataResource => {
        return {
          ...agg,
          instanceID: processInstanceID,
          [cur]: resources.filter((r) => r.name === cur).map((r) => JSON.parse(r.payload))
        };
      }, {} as DataResource);

      // if (root) console.log('resources', resourceLinkage, 'subResources', subResources);

      return { ...resourceLinkage, ...subResources };
    });
  }

  private createParser(resourceStructure: {
    [key: string]: 'String' | 'Number' | 'Boolean';
  }): z.ZodObject<Record<string, any>> {
    const root = Object.entries(resourceStructure)
      .map(([key, type]): { [key: string]: z.ZodType<any> } => {
        const Z_Type = ((): z.ZodType => {
          if (type === 'Number') return z.number();
          if (type === 'Boolean') return z.boolean();
          if (type === 'String') return z.string();
          else throw new NotFoundException();
        })();

        return { [key]: Z_Type };
      })
      .reduce((agg, cur) => ({ ...agg, ...cur }), {});

    return z.object(root);
  }

  /** @deprecated */
  private async queryDataFromProcessEngine(
    processInstanceID: string,
    resourceName: string,
    resourceStructure: Record<string, 'String' | 'Number' | 'Boolean'>
  ): Promise<Record<string, object>> {
    return this.peConnector.findVariablesOfProcessInstance(processInstanceID).then((vars) => {
      return Object.entries(vars)
        .filter(([key]) => key === resourceName)
        .reduce(
          (agg, [, { value }]) => ({ ...agg, ...JSON.parse(value) }),
          Object.keys(resourceStructure).reduce((agg, key) => ({ ...agg, [key]: null }), {})
        );
    });
  }
}

export type LinkageResources = Record<string, { data: unknown; parser?: z.ZodObject<Record<string, any>> }>;
// export type DataResource = { instanceID?: string; [key: string]: object[] };
export type DataResource = { instanceID?: string } & Record<string, object[] | string>; //; [key: string]: object[] };

export const Z_LINKAGE = z.object({
  resources: z.record(
    z.string(),
    z.record(z.string(), z.union([z.literal('String'), z.literal('Number'), z.literal('Boolean')]))
  ),
  tasks: z.record(z.string(), z.array(z.string()))
});
