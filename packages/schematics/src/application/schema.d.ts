export interface Schema {
  name: string | number;
  author?: string;
  description?: string;
  directory?: string;
  strict?: boolean;
  version?: string;
  type?: 'cjs' | 'esm';
  language?: string;
  packageManager?: string;
  dependencies?: string;
  devDependencies?: string;
  spec?: boolean;
  specFileSuffix?: string;
  format?: boolean;
}
