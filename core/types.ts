export type GenOptions = {
  optionalByDefault?: boolean;
  zod?: boolean;
  interface?: boolean;
  example?: boolean;
  strictZod?: boolean;
};

export type Prop = {
  name: string;
  isRequired: boolean;
  tsType: string;
};

export class DSLError extends Error {
  token?: string;
  index?: number;
  hint?: string;

  constructor(
    message: string,
    extra?: { token?: string; index?: number; hint?: string }
  ) {
    super(message);
    this.name = "DSLError";
    this.token = extra?.token;
    this.index = extra?.index;
    this.hint = extra?.hint;
  }
}

export const TS_RESERVED = new Set([
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "enum",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "function",
  "if",
  "import",
  "in",
  "instanceof",
  "new",
  "null",
  "return",
  "super",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "as",
  "implements",
  "interface",
  "let",
  "package",
  "private",
  "protected",
  "public",
  "static",
  "yield",
  "any",
  "boolean",
  "constructor",
  "declare",
  "get",
  "module",
  "require",
  "number",
  "set",
  "string",
  "symbol",
  "type",
  "from",
  "of",
]);
