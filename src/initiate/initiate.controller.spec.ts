import { Test, TestingModule } from '@nestjs/testing';
import { InitiateController } from './initiate.controller';

describe('InitiateController', () => {
  let controller: InitiateController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InitiateController],
    }).compile();

    controller = module.get<InitiateController>(InitiateController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
