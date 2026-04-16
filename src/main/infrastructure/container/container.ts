import { Container } from 'inversify';
import { TYPES } from './types';
import { Logger } from '../logging/Logger';
import { DatabaseService } from '../database/DatabaseService';
import { AsaasService } from '../services/AsaasService';
import { EmailService } from '../services/EmailService';
import { CacheRefreshService } from '../services/CacheRefreshService';
import { PublicLeadCheckoutController } from '../../controller/PublicLeadCheckoutController';

let appContainer: Container | null = null;

function buildContainer(): Container {
  const container = new Container();

  container.bind<Logger>(TYPES.Logger).to(Logger).inSingletonScope();
  container.bind<DatabaseService>(TYPES.DatabaseService).to(DatabaseService).inSingletonScope();
  container.bind<AsaasService>(TYPES.AsaasService).to(AsaasService).inSingletonScope();
  container.bind<EmailService>(TYPES.EmailService).to(EmailService).inSingletonScope();
  container.bind<CacheRefreshService>(TYPES.CacheRefreshService).to(CacheRefreshService).inSingletonScope();
  container
    .bind<PublicLeadCheckoutController>(TYPES.PublicLeadCheckoutController)
    .to(PublicLeadCheckoutController)
    .inSingletonScope();

  return container;
}

export function getAppContainer(): Container {
  if (!appContainer) {
    appContainer = buildContainer();
  }
  return appContainer;
}

export function getPublicLeadCheckoutController(): PublicLeadCheckoutController {
  return getAppContainer().get<PublicLeadCheckoutController>(TYPES.PublicLeadCheckoutController);
}

export function getCacheRefreshService(): CacheRefreshService {
  return getAppContainer().get<CacheRefreshService>(TYPES.CacheRefreshService);
}

export function getDatabaseService(): DatabaseService {
  return getAppContainer().get<DatabaseService>(TYPES.DatabaseService);
}
