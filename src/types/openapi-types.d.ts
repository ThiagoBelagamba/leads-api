declare module 'openapi-types' {
  export namespace OpenAPIV3 {
    export interface Document {
      openapi?: string;
      info?: {
        title?: string;
        description?: string;
        [key: string]: unknown;
      };
      paths?: Record<string, PathItemObject>;
      [key: string]: unknown;
    }

    // Minimal placeholder for PathItemObject and OperationObject
    export interface PathItemObject {
      [method: string]: unknown;
    }

    export interface OperationObject {
      tags?: string[];
      operationId?: string;
      summary?: string;
      [key: string]: unknown;
    }
  }
}
