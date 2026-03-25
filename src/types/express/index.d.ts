import 'express';
import { UserPayload } from '../dto/UserPayload';

declare module 'express-serve-static-core' {
  interface Request {
    user?: UserPayload;
  }
}
