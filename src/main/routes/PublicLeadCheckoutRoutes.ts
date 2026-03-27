import { Router } from 'express';
import { PublicLeadCheckoutController } from '@controller/PublicLeadCheckoutController';

const router = Router();
const controller = new PublicLeadCheckoutController();

router.get('/catalog', controller.getCatalog.bind(controller));
router.get('/quote', controller.getQuote.bind(controller));
router.post('/create-checkout', controller.createCheckout.bind(controller));
router.get('/payment-status', controller.getPaymentStatus.bind(controller));
router.post('/webhooks/asaas', controller.handleAsaasWebhook.bind(controller));
router.post('/admin/upload-staging', controller.uploadStagingCsv.bind(controller));
router.post('/admin/promote-staging', controller.promoteStaging.bind(controller));

export default router;

