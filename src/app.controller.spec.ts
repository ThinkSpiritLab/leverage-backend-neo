import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  const mockAppService = {
    getStat: jest.fn().mockResolvedValue({
      problem: 10,
      user: 5,
      submission: 100,
      notification: 0,
      message: 0,
      course: 2,
      contest: 1,
    }),
  };

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [{ provide: AppService, useValue: mockAppService }],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('index', () => {
    it('should return "OK"', () => {
      expect(appController.index()).toBe('OK');
    });
  });

  describe('getTime', () => {
    it('should return a Date', () => {
      const result = appController.getTime();
      expect(result).toBeInstanceOf(Date);
    });
  });

  describe('getStat', () => {
    it('should return stat object', async () => {
      const result = await appController.getStat();
      expect(result).toHaveProperty('problem');
      expect(result).toHaveProperty('user');
    });
  });
});
