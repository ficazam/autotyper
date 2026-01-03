#!/usr/bin/env node
import { GenOptions } from "../core/types";
import { buildOutput } from "../core/utils";

type Mode = "type" | "interface" | "zod" | "all" | "json";

function parseArgs(argv: string[]) {
  const args = argv.slice(2);
  const flags = new Map<string, string | boolean>();
  const positionals: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a.startsWith("--")) {
      const [k, v] = a.split("=", 2);
      if (v !== undefined) flags.set(k, v);
      else {
        const next = args[i + 1];
        if (next && !next.startsWith("--")) {
          flags.set(k, next);
          i++;
        } else {
          flags.set(k, true);
        }
      }
    } else {
      positionals.push(a);
    }
  }

  return { flags, positionals };
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";

  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8").trim();
}

function help() {
  return `
autotyper — generate TS (and Zod) from a tiny DSL

Usage:
  autotyper "User email:s password:s isAdmin?:b createdAt:d tags:s[]"
  echo "User email:s isAdmin?:b" | autotyper

Options:
  --mode <type|interface|zod|all|json>   (default: type)
  --strict                               Zod: add .strict()
  --optional-by-default                  Make fields optional unless you mark with !
  --no-zod                               Disable zod output (only affects json/all)
  --no-interface                         Disable interface output (only affects json/all)
  --no-example                           Disable example output (only affects json/all)

Examples:
  autotyper --mode all "User email:s isAdmin?:b"
  autotyper --mode json --strict "User email:s createdAt:d"
`.trim();
}

function fail(msg: string) {
  console.error(msg);
  process.exit(1);
}

function pickMode(out: any, mode: Mode) {
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
      const parts: string[] = [];
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
      return parts.join("\n");
    }
  }
}

async function main() {
  const { flags, positionals } = parseArgs(process.argv);

  if (flags.has("--help") || flags.has("-h")) {
    console.log(help());
    return;
  }

  const mode = (flags.get("--mode") ?? "type") as Mode;
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
    fail("\nError: No DSL provided.");
  }

  const options: GenOptions = {
    optionalByDefault,
    zod: wantZod,
    interface: wantInterface,
    example: wantExample,
    strictZod: strict,
  };

  try {
    const out = buildOutput(dsl, options);
    const text = pickMode(out as any, mode);
    if (!text) {
      fail(
        `Mode "${mode}" produced empty output. (Maybe disabled with --no-zod/--no-interface?)`
      );
    }
    process.stdout.write(text.endsWith("\n") ? text : text + "\n");
  } catch (err: any) {
    const msg = err?.message ? `Error: ${err.message}` : "Error: Unknown error";
    console.error(msg);
    if (err?.hint) console.error(`Hint: ${err.hint}`);
    if (err?.index !== undefined && err?.token)
      console.error(`At token[${err.index}]: ${err.token}`);
    process.exit(1);
  }
}

main();
