import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  MethodNotAllowedException
} from '@nestjs/common';
import { DatabaseConnectorService } from 'src/database-connector/database-connector.service';
import { ExplorerService } from 'src/explorer/explorer.service';
import { DataResource, LinkageResources, LinkageService } from 'src/linkage/linkage.service';
import { ResourceEndpoint } from 'src/models/ResourceEndpoint';
import { ProcessEngineConnector } from 'src/services/processEngine.service';
import { ZodError, z } from 'zod';

@Injectable()
export class UtilService {
  constructor(
    private explorerService: ExplorerService,
    private linkageService: LinkageService,
    private peConnector: ProcessEngineConnector,
    private dbConnector: DatabaseConnectorService
  ) {}

  parseUrl(url: string): Resource[] {
    return url.split('/').reduce((agg, cur, i, arr): Resource[] => {
      if (cur.startsWith('pid:') || cur.length === 0) return agg;

      if (arr[i + 1] && arr[i + 1].startsWith('pid:')) {
        // is Process
        const p: Process = {
          type: 'Process',
          name: cur,
          id: arr[i + 1].replace('pid:', '')
        };

        agg.push(p);
      } else {
        // is Task
        const t: Task = {
          type: 'Task',
          name: cur
        };

        agg.push(t);
      }
      return agg;
    }, [] as Resource[]);
  }

  async whoAmI(baseURI: string): Promise<{
    tree: Resource[];
    leadResource: Resource;
    leadProcessInstanceID?: string;
    children: string[];
    type: 'Process Instance' | 'Process Model' | 'User Task';
    thisResourceURI: string;
  }> {
    const resources = this.parseUrl(baseURI);
    const leadResource = resources[resources.length - 1];
    const leadProcess =
      (
        resources
          .filter((r): r is Process => r.type === 'Process')
          .reverse()
          .at(0) as Process | undefined
      )?.id ?? undefined;

    const { children, type } = await this.explorerService.findChildren(leadResource, baseURI);
    const thisResourceURI = resources
      .map((resource) => {
        const name = `/${encodeURIComponent(resource.name)}`;
        const id = resource.type === 'Process' ? `/pid:${(resource as Process).id}` : '';
        return name + id;
      })
      .join('');

    const validateType = z.union([z.literal('Process Instance'), z.literal('Process Model'), z.literal('User Task')]);
    return {
      children,
      leadProcessInstanceID: leadProcess,
      leadResource,
      thisResourceURI,
      tree: resources,
      type: validateType.parse(type)
    };
  }

  async routeUri(baseURI: string): Promise<ResourceEndpoint> {
    const { type, leadProcessInstanceID, leadResource, tree, thisResourceURI, children } = await this.whoAmI(baseURI);

    const resourcePayload = await (async (): Promise<LinkageResources | DataResource> | undefined => {
      if (type === 'User Task') return this.linkageService.getLinkageOfTask(leadProcessInstanceID, leadResource.name);
      if (type === 'Process Instance') return this.linkageService.getLinkageOfProcessInstance(leadProcessInstanceID);
      return undefined;
    })();

    const { operations } = await this.explorerService.findOperations(
      leadProcessInstanceID,
      !!(tree.length === 1 && type === 'Process Model'),
      leadResource.name,
      thisResourceURI
    );
    const parents: string[] = this.explorerService.findParents(tree);

    // console.log('resourcePayload', resourcePayload, !!resourcePayload);

    return {
      name: leadResource.name,
      type,
      data:
        resourcePayload && type === 'User Task'
          ? Object.entries(resourcePayload).reduce((agg, [key, value]) => ({ ...agg, [key]: value.data }), {})
          : resourcePayload,
      _links: {
        operations,
        parents,
        children
      }
    };
  }

  async updater(request: Request, body: any, params: Record<string, string>): Promise<ResourceEndpoint> {
    const requestMethod = request.method;
    // console.log('requestMethod', requestMethod, 'body', body, 'params', params);

    const { type, leadProcessInstanceID, leadResource, tree, thisResourceURI } = await this.whoAmI(params['0']);
    if (type !== 'User Task') throw new MethodNotAllowedException();

    const { active } = await this.explorerService.findOperations(
      leadProcessInstanceID,
      Object.keys(tree).length === 1 && tree[0].type === 'Process',
      leadResource.name,
      thisResourceURI
    );
    if (!active) throw new MethodNotAllowedException();

    try {
      const linkage = await this.linkageService.getLinkageOfTask(leadProcessInstanceID, leadResource.name);

      const preParsed = z.record(z.string(), z.any()).parse(body);
      if (Object.entries(preParsed).length === 0) return this.routeUri(params['0']);

      const parsed = Object.entries(preParsed).reduce(
        (agg, [key, value]) => {
          const parser = linkage[key]?.parser;
          if (parser === undefined) throw new BadRequestException('Invalid key');
          return { ...agg, [key]: parser.parse(value) };
        },
        {} as Record<string, Record<string, any>>
      );

      console.log('processID', leadProcessInstanceID);
      await this.peConnector.updateVariables(leadProcessInstanceID, parsed);
      await Promise.all(
        Object.entries(parsed).map(([key, value]) =>
          requestMethod === 'PUT'
            ? this.dbConnector.updateResourceToProcessInstance(leadProcessInstanceID, key, value)
            : this.dbConnector.addResourceToProcessInstance(leadProcessInstanceID, key, value)
        )
      );

      return this.routeUri(params['0']);
    } catch (e) {
      if (e instanceof ZodError) throw new BadRequestException(e.errors);
      if (e instanceof BadRequestException) throw e;

      throw new InternalServerErrorException(e.message);
    }
  }
}

export interface Task {
  type: 'Task';
  name: string;
}

export type Process = {
  type: 'Process';
  name: string;
  id: string;
};

export type ProcessExtended = { type: 'Process'; name: string; id: string; superProcessInstanceId: string | null };
export type Resource = Task | Process;
