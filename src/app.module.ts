import { Module } from '@nestjs/common';
import { ApplicationController } from './application/application.controller';
import { ExplorerService } from './explorer/explorer.service';
import { InitiateController } from './initiate/initiate.controller';
import { StorageService } from './services/storage.service';
import { UtilService } from './util/util.service';
import { ProcessEngineConnector } from './services/processEngine.service';
import { LinkageService } from './linkage/linkage.service';
import { DatabaseConnectorService } from './database-connector/database-connector.service';

@Module({
  imports: [],
  controllers: [InitiateController, ApplicationController],
  providers: [StorageService, UtilService, ExplorerService, ProcessEngineConnector, LinkageService, DatabaseConnectorService]
})
export class AppModule {}
