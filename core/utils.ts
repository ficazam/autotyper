import { GenOptions, Prop } from "./types";

export const toPascalCase = (x: string): string =>
  x
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join("");

export const typeMapper = (raw: string): string => {
  const t = normalizeTypeToken(raw);

  if (t.endsWith("[]")) return `${typeMapper(t.slice(0, -2))}[]`;

  switch (t) {
    case "s":
      return "string";
    case "n":
      return "number";
    case "b":
      return "boolean";
    case "d":
      return "Date";
    case "u":
      return "unknown";
    case "a":
      return "any";
    default:
      return t;
  }
};

export const normalizeTypeToken = (raw: string): string => raw.trim();

export const isPluralish = (name: string): boolean =>
  name.length > 3 && name.endsWith("s");

export const inferTypeFromName = (name: string): string => {
  const n = name.trim();

  if (/(At|On)$/.test(n) || /^date/i.test(n) || /date/i.test(n)) return "Date";

  if (
    /^(is|has|can|should|did|was)[A-Z_]/.test(n) ||
    /^(is|has|can|should|did|was)[a-z]/.test(n)
  )
    return "boolean";

  if (n === "id" || n.endsWith("_id") || n.endsWith("Id")) return "string";

  if (isPluralish(n)) return "string[]";

  return "string";
};

export const stripQuotes = (s: string) => {
  const t = s.trim();
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    return t.slice(1, -1);
  }
  return t;
};

export const parseDSL = (dslRaw: string, opts: GenOptions): { typeName: string; props: Prop[] } => {
  const dsl = dslRaw.trim();
  if (!dsl) throw new Error("Empty DSL");

  if (dsl.startsWith("type:")) {
    const [head, rest] = dsl.split("-", 2);
    if (!rest) throw new Error("Missing properties after '-' in old DSL");

    const rawName = head.slice("type:".length).trim();
    const typeName = toPascalCase(rawName);
    if (!typeName) throw new Error("Missing type name");

    const chunks = rest.split("/").filter(Boolean);
    const props: Prop[] = chunks.map((chunk) => {
      const parts = chunk.split(":").filter(Boolean);
      const rawProp = stripQuotes(parts[0] ?? "");
      const rawType = parts[1] ?? "";
      const optionalOld = parts.includes("o");

      if (!rawProp || !rawType) throw new Error(`Bad prop chunk: ${chunk}`);

      const { name, requiredFromBangQuestion } = parsePropName(rawProp, opts);
      const required = requiredFromBangQuestion ?? (!optionalOld && !opts.optionalByDefault);

      return { name, isRequired: required, tsType: typeMapper(rawType) };
    });

    return { typeName, props };
  }

  const normalized = dsl
    .replace(/\r\n/g, "\n")
    .replace(/[,\n]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const firstSpace = normalized.indexOf(" ");
  const rawTypeName = firstSpace === -1 ? normalized : normalized.slice(0, firstSpace);
  const rest = firstSpace === -1 ? "" : normalized.slice(firstSpace + 1);

  const typeName = toPascalCase(stripQuotes(rawTypeName));
  if (!typeName) throw new Error("Missing type name");

  const propTokens = rest
    .split(/(?:\s+|\/)+/)
    .map((t) => t.trim())
    .filter(Boolean);

  const props: Prop[] = propTokens.map((token) => {
    const cleaned = token.replace(/;$/, "").trim();

    if (cleaned.endsWith(":")) throw new Error(`Bad token: ${token}`);

    let rawPropPart = cleaned;
    let rawTypePart: string | null = null;

    const parts = cleaned.split(":").filter(Boolean);
    if (parts.length >= 2) {
      rawPropPart = stripQuotes(parts[0]!);
      rawTypePart = parts[1]!;
      if (parts.slice(2).includes("o")) rawPropPart = rawPropPart.endsWith("?") ? rawPropPart : `${rawPropPart}?`;
    } else {
      rawPropPart = stripQuotes(cleaned);
    }

    const { name, requiredFromBangQuestion } = parsePropName(rawPropPart, opts);

    const inferred = inferTypeFromName(name);
    const tsType = rawTypePart ? typeMapper(rawTypePart) : inferred;

    let isRequired: boolean;
    if (requiredFromBangQuestion !== null) isRequired = requiredFromBangQuestion;
    else isRequired = !opts.optionalByDefault;

    return { name, isRequired, tsType };
  });

  return { typeName, props };
}

export const parsePropName = (raw: string, opts: GenOptions): { name: string; requiredFromBangQuestion: boolean | null } => {
  let s = raw.trim();

  const isReq = s.endsWith("!");
  const isOpt = s.endsWith("?") || s.includes("?:");

  if (isReq) s = s.slice(0, -1);
  if (s.endsWith("?")) s = s.slice(0, -1);

  const name = s.trim();
  if (!name) throw new Error("Empty property name");

  if (isReq) return { name, requiredFromBangQuestion: true };
  if (isOpt) return { name, requiredFromBangQuestion: false };
  return { name, requiredFromBangQuestion: null };
}

export const generateType = (typeName: string, props: Prop[]) => {
  const lines = props.map((p) => `  ${p.name}${p.isRequired ? "" : "?"}: ${p.tsType};`);
  return `export type ${typeName} = {\n${lines.join("\n")}\n};\n`;
}

export const generateInterface = (typeName: string, props: Prop[]) => {
  const lines = props.map((p) => `  ${p.name}${p.isRequired ? "" : "?"}: ${p.tsType};`);
  return `export interface ${typeName} {\n${lines.join("\n")}\n}\n`;
}

export const tsTypeToZod = (tsType: string): string => {
  if (tsType.endsWith("[]")) return `z.array(${tsTypeToZod(tsType.slice(0, -2))})`;

  switch (tsType) {
    case "string":
      return "z.string()";
    case "number":
      return "z.number()";
    case "boolean":
      return "z.boolean()";
    case "Date":
      return "z.coerce.date()";
    case "unknown":
      return "z.unknown()";
    case "any":
      return "z.any()";
    default:
      return "z.unknown()";
  }
}

export const generateZod = (typeName: string, props: Prop[]) => {
  const lines = props.map((p) => {
    const base = tsTypeToZod(p.tsType);
    return `  ${p.name}: ${p.isRequired ? base : `${base}.optional()`},`;
  });

  return `import { z } from "zod";\n\nexport const ${typeName}Schema = z.object({\n${lines.join(
    "\n"
  )}\n});\n\nexport type ${typeName} = z.infer<typeof ${typeName}Schema>;\n`;
}

export const defaultValueFor = (tsType: string) => {
  if (tsType.endsWith("[]")) return [];
  switch (tsType) {
    case "string":
      return "";
    case "number":
      return 0;
    case "boolean":
      return false;
    case "Date":
      return new Date().toISOString();
    default:
      return null;
  }
}

export const generateExample = (props: Prop[]) => {
  const obj: Record<string, unknown> = {};
  for (const p of props) {
    if (!p.isRequired) continue;
    obj[p.name] = defaultValueFor(p.tsType);
  }
  return obj;
}

export const buildOutput = (dsl: string, options: GenOptions) => {
  const { typeName, props } = parseDSL(dsl, options);

  const out: Record<string, unknown> = {
    typeName,
    normalized: {
      type: typeName,
      props: props.map((p) => ({ name: p.name, type: p.tsType, required: p.isRequired })),
    },
    type: generateType(typeName, props),
  };

  if (options.interface) out.interface = generateInterface(typeName, props);
  if (options.zod) out.zod = generateZod(typeName, props);
  if (options.example) out.example = generateExample(props);

  return out;
}

