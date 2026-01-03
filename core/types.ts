export type GenOptions = {
  optionalByDefault?: boolean;
  zod?: boolean;
  interface?: boolean;
  example?: boolean;
};

export type Prop = {
  name: string;
  isRequired: boolean;
  tsType: string;
};