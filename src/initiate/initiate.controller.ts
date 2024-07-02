import { Controller, Param, Post } from '@nestjs/common';
import { ProcessEngineConnector } from 'src/services/processEngine.service';
import { UtilService } from 'src/util/util.service';

@Controller()
export class InitiateController {
  constructor(
    private peController: ProcessEngineConnector,
    private utilService: UtilService
  ) {}

  @Post(':processName')
  async initiate(@Param('processName') processName: string) {
    console.log('initiating process', processName);
    return this.peController
      .startProcess(processName)
      .then((res) => this.utilService.routeUri(`${processName}/pid:${res.id}`));
  }
}
