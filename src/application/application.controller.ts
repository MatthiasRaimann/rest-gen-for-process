import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  MethodNotAllowedException,
  Param,
  Patch,
  Post,
  Put,
  Request
} from '@nestjs/common';
import { DatabaseConnectorService } from 'src/database-connector/database-connector.service';
import { ExplorerService } from 'src/explorer/explorer.service';
import { LinkageService } from 'src/linkage/linkage.service';
import { ResourceEndpoint } from 'src/models/ResourceEndpoint';
import { ProcessEngineConnector } from 'src/services/processEngine.service';
import { StorageService } from 'src/services/storage.service';
import { UtilService } from 'src/util/util.service';

@Controller()
export class ApplicationController {
  constructor(
    private storageService: StorageService,
    private peConnector: ProcessEngineConnector,
    private util: UtilService,
    private explorerService: ExplorerService,
    private linkageService: LinkageService,
    private dbConnector: DatabaseConnectorService
  ) {}

  @Get('favicon.ico')
  async favicon() {
    return '';
  }

  @Get('/test')
  async test() {
    throw new BadRequestException('test not implemented');
    // return this.dbConnector.test();
    // return await this.dbConnector.linkResourceToProcessInstance('ba485d81-3499-11ef-8d2c-42b39f275913', 'Case', {
    //   description: 'test-changed-v2'
    // });
  }

  @Get('/deleteAll')
  async deleteAll() {
    const allInstances = await this.peConnector.findRunningProcesses('ParentProcess');
    await Promise.all(allInstances.map((instance) => this.peConnector.deleteInstance(instance)));
  }

  @Get('*')
  async dynamicRouter(@Param() params: Record<string, string>): Promise<ResourceEndpoint> {
    return this.util.routeUri(params['0']);
  }

  @Patch('*')
  async dynamicRouterPost(@Param() params: Record<string, string>): Promise<ResourceEndpoint> {
    const {
      type,
      leadResource: { name },
      leadProcessInstanceID,
      tree,
      thisResourceURI
    } = await this.util.whoAmI(params['0']);
    if (type !== 'User Task') throw new MethodNotAllowedException();

    const { active } = await this.explorerService.findOperations(
      leadProcessInstanceID,
      Object.keys(tree).length === 1 && tree[0].type === 'Process',
      name,
      thisResourceURI
    );
    if (!active) throw new MethodNotAllowedException();

    return this.peConnector.completeTask(name, leadProcessInstanceID).then(() => {
      return this.util.routeUri(params['0']);
    });
  }

  @Put('*')
  @HttpCode(201)
  async daynamicRouterPut(
    @Param() params: Record<string, string>,
    @Body() body: any,
    @Request() request: Request
  ): Promise<ResourceEndpoint> {
    return this.util.updater(request, body, params);
  }

  @Post('*')
  @HttpCode(201)
  async daynamicRouterPost(
    @Param() params: Record<string, string>,
    @Body() body: any,
    @Request() request: Request
  ): Promise<ResourceEndpoint> {
    return this.util.updater(request, body, params);
  }
}
