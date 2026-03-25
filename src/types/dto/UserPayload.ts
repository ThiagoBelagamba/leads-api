export interface UserPayload {
  id: string;
  email?: string;
  role?: string;
  user_metadata?: {
    empresa_id?: string;
    role?: string;
  };
  app_metadata?: {
    role?: string;
  };
}
