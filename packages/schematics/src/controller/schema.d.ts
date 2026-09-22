export interface Schema {
  name: string;
  path?: string;
  language?: string;
  sourceRoot?: string;
  skipImport?: boolean;
  module?: string;
  flat?: boolean;
  spec?: boolean;
  specFileSuffix?: string;
  format?: boolean;
}
