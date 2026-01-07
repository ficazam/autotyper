#!/usr/bin/env node

// core/types.ts
class DSLError extends Error {
  token;
  index;
  hint;
  constructor(message, extra) {
    super(message);
    this.name = "DSLError";
    this.token = extra?.token;
    this.index = extra?.index;
    this.hint = extra?.hint;
  }
}
var TS_RESERVED = new Set([
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
  "of"
]);

// core/utils.ts
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
var toPascalCase = (x) => x.split(/[-_\s]+/).filter(Boolean).map((w) => w[0]?.toUpperCase() + w.slice(1)).join("");
var toCamel = (x) => {
  const p = toPascalCase(x);
  return p ? p[0].toLowerCase() + p.slice(1) : p;
};
var sanitizeTypeName = (raw) => {
  const base = toPascalCase(raw.trim());
  const cleaned = base.replace(/[^A-Za-z0-9_$]/g, "");
  const safe = cleaned || "Type";
  return TS_RESERVED.has(safe) ? `${safe}Type` : safe;
};
var toKebabCase = (x) => {
  return x.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/[_\s]+/g, "-").toLowerCase();
};
var writeOutFile = async (path, content) => {
  await mkdir(resolve(path, ".."), { recursive: true });
  await writeFile(path, content, "utf8");
};
var sanitizePropName = (raw) => {
  const camel = toCamel(raw.trim());
  let cleaned = camel.replace(/[^A-Za-z0-9_$]/g, "");
  if (!cleaned)
    cleaned = "prop";
  if (/^\d/.test(cleaned))
    cleaned = `_${cleaned}`;
  if (TS_RESERVED.has(cleaned))
    cleaned = `${cleaned}_`;
  return cleaned;
};
var normalizeTypeToken = (raw) => raw.trim();
var typeMapper = (raw) => {
  const t = normalizeTypeToken(raw);
  if (t.endsWith("[]"))
    return `${typeMapper(t.slice(0, -2))}[]`;
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
var isPluralish = (name) => name.length > 3 && name.endsWith("s");
var inferTypeFromName = (name) => {
  const n = name.trim();
  if (/(At|On)$/.test(n) || /^date/i.test(n) || /date/i.test(n))
    return "Date";
  if (/^(is|has|can|should|did|was)[A-Z_]/.test(n) || /^(is|has|can|should|did|was)[a-z]/.test(n))
    return "boolean";
  if (n === "id" || n.endsWith("_id") || n.endsWith("Id"))
    return "string";
  if (isPluralish(n))
    return "string[]";
  return "string";
};
var stripQuotes = (s) => {
  const t = s.trim();
  if (t.startsWith('"') && t.endsWith('"') || t.startsWith("'") && t.endsWith("'")) {
    return t.slice(1, -1);
  }
  return t;
};
var parsePropName = (raw, _opts) => {
  let s = raw.trim();
  const isReq = s.endsWith("!");
  const isOpt = s.endsWith("?") || s.includes("?:");
  if (isReq)
    s = s.slice(0, -1);
  if (s.endsWith("?"))
    s = s.slice(0, -1);
  const base = s.trim();
  if (!base)
    throw new DSLError("Empty property name");
  const name = sanitizePropName(base);
  if (isReq)
    return { name, requiredFromBangQuestion: true };
  if (isOpt)
    return { name, requiredFromBangQuestion: false };
  return { name, requiredFromBangQuestion: null };
};
var parseDSL = (dslRaw, opts) => {
  const dsl = dslRaw.trim();
  if (!dsl)
    throw new DSLError("Empty DSL", {
      hint: 'Example: "User email:s password:s isAdmin?:b createdAt:d tags:s[]"'
    });
  if (dsl.startsWith("type:")) {
    const [head, rest2] = dsl.split("-", 2);
    if (!rest2)
      throw new DSLError("Missing properties after '-' in old DSL", {
        hint: "type:user-email:s/password:s"
      });
    const rawName = head.slice("type:".length).trim();
    const typeName2 = sanitizeTypeName(rawName);
    if (!typeName2)
      throw new DSLError("Missing type name");
    const chunks = rest2.split("/").filter(Boolean);
    const props2 = chunks.map((chunk, index) => {
      const parts = chunk.split(":").filter(Boolean);
      const rawProp = stripQuotes(parts[0] ?? "");
      const rawType = parts[1] ?? "";
      const optionalOld = parts.includes("o");
      if (!rawProp || !rawType) {
        throw new DSLError("Bad property chunk", {
          index,
          token: chunk,
          hint: "Expected: name:type or name:type:o (optional). Example: isAdmin:b:o"
        });
      }
      const { name, requiredFromBangQuestion } = parsePropName(rawProp, opts);
      const isRequired = requiredFromBangQuestion ?? (!optionalOld && !opts.optionalByDefault);
      return { name, isRequired, tsType: typeMapper(rawType) };
    });
    return { typeName: typeName2, props: props2 };
  }
  const normalized = dsl.replace(/\r\n/g, `
`).replace(/[,\n]/g, " ").replace(/\s+/g, " ").trim();
  const firstSpace = normalized.indexOf(" ");
  const rawTypeName = firstSpace === -1 ? normalized : normalized.slice(0, firstSpace);
  const rest = firstSpace === -1 ? "" : normalized.slice(firstSpace + 1);
  const typeName = sanitizeTypeName(stripQuotes(rawTypeName));
  if (!typeName)
    throw new DSLError("Missing type name");
  if (!rest)
    throw new DSLError("No properties provided", {
      hint: 'Example: "User email:s password:s isAdmin?:b"'
    });
  const propTokens = rest.split(/(?:\s+|\/)+/).map((t) => t.trim()).filter(Boolean);
  const props = propTokens.map((token, index) => {
    const cleaned = token.replace(/;$/, "").trim();
    if (cleaned.endsWith(":")) {
      throw new DSLError("Bad token (dangling ':')", {
        index,
        token,
        hint: "Use email:s (not email:)"
      });
    }
    let rawPropPart = cleaned;
    let rawTypePart = null;
    const parts = cleaned.split(":").filter(Boolean);
    if (parts.length >= 2) {
      rawPropPart = stripQuotes(parts[0]);
      rawTypePart = parts[1];
      if (parts.slice(2).includes("o"))
        rawPropPart = rawPropPart.endsWith("?") ? rawPropPart : `${rawPropPart}?`;
    } else {
      rawPropPart = stripQuotes(cleaned);
    }
    if (!rawPropPart) {
      throw new DSLError("Empty token", {
        index,
        token,
        hint: "Example: email:s"
      });
    }
    const { name, requiredFromBangQuestion } = parsePropName(rawPropPart, opts);
    const inferred = inferTypeFromName(name);
    const tsType = rawTypePart ? typeMapper(rawTypePart) : inferred;
    let isRequired;
    if (requiredFromBangQuestion !== null)
      isRequired = requiredFromBangQuestion;
    else
      isRequired = !opts.optionalByDefault;
    return { name, isRequired, tsType };
  });
  return { typeName, props };
};
var generateType = (typeName, props) => {
  const lines = props.map((p) => `  ${p.name}${p.isRequired ? "" : "?"}: ${p.tsType};`);
  return `export type ${typeName} = {
${lines.join(`
`)}
};
`;
};
var generateInterface = (typeName, props) => {
  const lines = props.map((p) => `  ${p.name}${p.isRequired ? "" : "?"}: ${p.tsType};`);
  return `export interface ${typeName} {
${lines.join(`
`)}
}
`;
};
var tsTypeToZod = (tsType) => {
  if (tsType.endsWith("[]"))
    return `z.array(${tsTypeToZod(tsType.slice(0, -2))})`;
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
};
var generateZod = (typeName, props, strict) => {
  const lines = props.map((p) => {
    const base = tsTypeToZod(p.tsType);
    return `  ${p.name}: ${p.isRequired ? base : `${base}.optional()`},`;
  });
  const strictCall = strict ? ".strict()" : "";
  return `import { z } from "zod";

export const ${typeName}Schema = z.object({
${lines.join(`
`)}
})${strictCall};

export type ${typeName} = z.infer<typeof ${typeName}Schema>;
`;
};
var defaultValueFor = (tsType) => {
  if (tsType.endsWith("[]"))
    return [];
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
};
var generateExample = (props) => {
  const obj = {};
  for (const p of props) {
    if (!p.isRequired)
      continue;
    obj[p.name] = defaultValueFor(p.tsType);
  }
  return obj;
};
var buildOutput = (dsl, options) => {
  const { typeName, props } = parseDSL(dsl, options);
  const out = {
    typeName,
    normalized: {
      type: typeName,
      props: props.map((p) => ({
        name: p.name,
        type: p.tsType,
        required: p.isRequired
      }))
    },
    type: generateType(typeName, props)
  };
  if (options.interface)
    out.interface = generateInterface(typeName, props);
  if (options.zod)
    out.zod = generateZod(typeName, props, !!options.strictZod);
  if (options.example)
    out.example = generateExample(props);
  return out;
};

// src/autotyper.ts
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve as resolve2 } from "node:path";
var completionBash = () => {
  return `
_autotyper() {
  local cur prev opts
  COMPREPLY=()
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"

  opts="--help -h --version -v --mode --strict --optional-by-default --no-zod --no-interface --no-example --type --zod --interface --outdir --dry-run completion"

  if [[ "\${prev}" == "--mode" ]]; then
    COMPREPLY=( $(compgen -W "type interface zod all json" -- "\${cur}") )
    return 0
  fi

  if [[ "\${prev}" == "--outdir" ]]; then
    COMPREPLY=( $(compgen -d -- "\${cur}") )
    return 0
  fi

  COMPREPLY=( $(compgen -W "\${opts}" -- "\${cur}") )
  return 0
}
complete -F _autotyper autotyper
`.trimStart();
};
var completionZsh = () => {
  return `
#compdef autotyper
_arguments \\
  '--help[Show help]' \\
  '--version[Show version]' \\
  '--mode[Output mode]:mode:(type interface zod all json)' \\
  '--strict[Zod strict mode]' \\
  '--optional-by-default[Optional fields unless !]' \\
  '--no-zod[Disable zod output]' \\
  '--no-interface[Disable interface output]' \\
  '--no-example[Disable example output]' \\
  '--type[Write ./core/<name>.type.ts]' \\
  '--zod[Write ./core/<name>.zod.ts]' \\
  '--interface[Write ./core/<name>.interface.ts]' \\
  '--outdir[Output directory]:dir:_files -/' \\
  '--dry-run[Show what would be written]' \\
  '1: :_guard "^-*" "dsl or subcommand"' \\
  '*: :_files'
`.trimStart();
};
var completionFish = () => {
  return `
complete -c autotyper -l help -s h -d "Show help"
complete -c autotyper -l version -s v -d "Show version"
complete -c autotyper -l mode -d "Output mode" -xa "type interface zod all json"
complete -c autotyper -l strict -d "Zod strict mode"
complete -c autotyper -l optional-by-default -d "Optional fields unless !"
complete -c autotyper -l no-zod -d "Disable zod output"
complete -c autotyper -l no-interface -d "Disable interface output"
complete -c autotyper -l no-example -d "Disable example output"
complete -c autotyper -l type -d "Write ./core/<name>.type.ts"
complete -c autotyper -l zod -d "Write ./core/<name>.zod.ts"
complete -c autotyper -l interface -d "Write ./core/<name>.interface.ts"
complete -c autotyper -l outdir -d "Output directory" -r
complete -c autotyper -l dry-run -d "Show what would be written"
complete -c autotyper -f -a "completion" -d "Print shell completion"
`.trimStart();
};
function parseArgs(argv) {
  const args = argv.slice(2);
  const flags = new Map;
  const positionals = [];
  const setFlag = (k, v = true) => flags.set(k, v);
  for (let i = 0;i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--")) {
      const [k, v] = a.split("=", 2);
      if (v !== undefined)
        setFlag(k, v);
      else {
        const next = args[i + 1];
        if (next && !next.startsWith("-")) {
          setFlag(k, next);
          i++;
        } else {
          setFlag(k, true);
        }
      }
      continue;
    }
    if (a.startsWith("-") && a.length > 1) {
      const shorts = a.slice(1).split("");
      for (const s of shorts) {
        if (s === "h")
          setFlag("--help", true);
        else if (s === "v")
          setFlag("--version", true);
        else
          setFlag(`-${s}`, true);
      }
      continue;
    }
    positionals.push(a);
  }
  return { flags, positionals };
}
var readStdin = async () => {
  if (process.stdin.isTTY)
    return "";
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8").trim();
};
var help = () => {
  return `
autotyper — generate TS (and Zod) from a tiny DSL

Usage:
  autotyper "User email:s password:s isAdmin?:b createdAt:d tags:s[]"
  echo "User email:s isAdmin?:b" | autotyper
  autotyper completion <bash|zsh|fish>

Subcommands:
  completion <bash|zsh|fish>             Print shell completion script

Options:
  --mode <type|interface|zod|all|json>   (default: type)
  --strict                               Zod: add .strict()
  --optional-by-default                  Make fields optional unless you mark with !
  --no-zod                               Disable zod output (only affects json/all)
  --no-interface                         Disable interface output (only affects json/all)
  --no-example                           Disable example output (only affects json/all)
  --type                                 Write ./core/<type-name>.type.ts
  --interface                            Write ./core/<type-name>.interface.ts
  --zod                                  Write ./core/<type-name>.zod.ts
  --outdir <path>                        Output directory (default: ./core)
  --dry-run                              Print what would be written without writing
  --version, -v                          Print version
  --help, -h                             Show this help

Examples:
  autotyper --mode all "User email:s isAdmin?:b"
  autotyper --mode json --strict "User email:s createdAt:d"

Shell completion:
  autotyper completion bash > ~/.bash_completion.d/autotyper
  autotyper completion zsh  > ~/.zsh/completions/_autotyper
  autotyper completion fish > ~/.config/fish/completions/autotyper.fish
`.trim();
};
var readPackageVersion = async () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const pkgPath = resolve2(here, "../package.json");
  const raw = await readFile(pkgPath, "utf8");
  const pkg = JSON.parse(raw);
  return pkg.version ?? "0.0.0";
};
var fail = (msg) => {
  console.error(msg);
  process.exit(1);
};
var pickMode = (out, mode) => {
  switch (mode) {
    case "type":
      return String(out.type);
    case "interface":
      return String(out.interface ?? "");
    case "zod":
      return String(out.zod ?? "");
    case "json":
      return JSON.stringify(out, null, 2);
    case "all": {
      const parts = [];
      parts.push("// --- TYPE ---");
      parts.push(String(out.type).trimEnd(), "");
      if (out.interface) {
        parts.push("// --- INTERFACE ---");
        parts.push(String(out.interface).trimEnd(), "");
      }
      if (out.zod) {
        parts.push("// --- ZOD ---");
        parts.push(String(out.zod).trimEnd(), "");
      }
      if (out.example) {
        parts.push("// --- EXAMPLE (required fields only) ---");
        parts.push(JSON.stringify(out.example, null, 2));
      }
      return parts.join(`
`);
    }
  }
};
var main = async () => {
  const { flags, positionals } = parseArgs(process.argv);
  if (positionals[0] === "completion") {
    const shell = positionals[1];
    if (shell === "bash")
      console.log(completionBash());
    else if (shell === "zsh")
      console.log(completionZsh());
    else if (shell === "fish")
      console.log(completionFish());
    else {
      console.error("Usage: autotyper completion <bash|zsh|fish>");
      process.exit(1);
    }
    return;
  }
  if (flags.has("--help") || flags.has("-h")) {
    console.log(help());
    return;
  }
  if (flags.has("--version") || flags.has("-v")) {
    const version = await readPackageVersion();
    console.log(`autotyper v${version}`);
    return;
  }
  const mode = flags.get("--mode") ?? "type";
  const strict = Boolean(flags.get("--strict"));
  const optionalByDefault = Boolean(flags.get("--optional-by-default"));
  const wantZod = !Boolean(flags.get("--no-zod"));
  const wantInterface = !Boolean(flags.get("--no-interface"));
  const wantExample = !Boolean(flags.get("--no-example"));
  let dsl = positionals.join(" ").trim();
  if (!dsl) {
    dsl = await readStdin();
  }
  if (!dsl) {
    console.log(help());
    fail(`
Error: No DSL provided.`);
  }
  const options = {
    optionalByDefault,
    zod: wantZod,
    interface: wantInterface,
    example: wantExample,
    strictZod: strict
  };
  try {
    const out = buildOutput(dsl, options);
    const emitType = Boolean(flags.get("--type"));
    const emitZod = Boolean(flags.get("--zod"));
    const emitInterface = Boolean(flags.get("--interface"));
    const outdir = String(flags.get("--outdir") ?? "./core");
    const dryRun = Boolean(flags.get("--dry-run"));
    const typeName = String(out.typeName ?? "");
    const base = toKebabCase(typeName || "type");
    const emitted = [];
    if (emitType) {
      const p = resolve2(outdir, `${base}.type.ts`);
      const content = String(out.type);
      if (!dryRun)
        await writeOutFile(p, content.endsWith(`
`) ? content : content + `
`);
      emitted.push(p);
    }
    if (emitInterface) {
      const p = resolve2(outdir, `${base}.interface.ts`);
      const content = String(out.interface ?? "");
      if (!content)
        throw new Error("No interface output (did you disable it?)");
      if (!dryRun)
        await writeOutFile(p, content.endsWith(`
`) ? content : content + `
`);
      emitted.push(p);
    }
    if (emitZod) {
      const p = resolve2(outdir, `${base}.zod.ts`);
      const content = String(out.zod ?? "");
      if (!content)
        throw new Error("No zod output (did you disable it?)");
      if (!dryRun)
        await writeOutFile(p, content.endsWith(`
`) ? content : content + `
`);
      emitted.push(p);
    }
    if (emitted.length > 0) {
      for (const p of emitted)
        console.log(dryRun ? `[dry-run] ${p}` : `Wrote ${p}`);
      if (!flags.has("--mode"))
        return;
    }
    const text = pickMode(out, mode);
    if (!text) {
      fail(`Mode "${mode}" produced empty output. (Maybe disabled with --no-zod/--no-interface?)`);
    }
    process.stdout.write(text.endsWith(`
`) ? text : text + `
`);
  } catch (err) {
    const msg = err?.message ? `Error: ${err.message}` : "Error: Unknown error";
    console.error(msg);
    if (err?.hint)
      console.error(`Hint: ${err.hint}`);
    if (err?.index !== undefined && err?.token)
      console.error(`At token[${err.index}]: ${err.token}`);
    process.exit(1);
  }
};
main();
