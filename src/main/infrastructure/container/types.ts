export const TYPES = {
  Logger: Symbol.for('Logger'),
  DatabaseService: Symbol.for('DatabaseService'),
  AsaasService: Symbol.for('AsaasService'),
  EmailService: Symbol.for('EmailService'),
  CacheRefreshService: Symbol.for('CacheRefreshService'),
  PublicLeadCheckoutController: Symbol.for('PublicLeadCheckoutController'),
} as const;
