import { Test, TestingModule } from '@nestjs/testing';
import { DatabaseConnectorService } from './database-connector.service';

describe('DatabaseConnectorService', () => {
  let service: DatabaseConnectorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DatabaseConnectorService],
    }).compile();

    service = module.get<DatabaseConnectorService>(DatabaseConnectorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
