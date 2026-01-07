#!/usr/bin/env node
import { GenOptions } from "../core/types";
import { buildOutput, toKebabCase, writeOutFile } from "../core/utils";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

type Mode = "type" | "interface" | "zod" | "all" | "json";

const completionBash = () => {
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

const completionZsh = () => {
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

const completionFish = () => {
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

function parseArgs(argv: string[]) {
  const args = argv.slice(2);
  const flags = new Map<string, string | boolean>();
  const positionals: string[] = [];

  const setFlag = (k: string, v: string | boolean = true) => flags.set(k, v);

  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;

    if (a.startsWith("--")) {
      const [k, v] = a.split("=", 2);
      if (v !== undefined) setFlag(k, v);
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
        if (s === "h") setFlag("--help", true);
        else if (s === "v") setFlag("--version", true);
        else setFlag(`-${s}`, true);
      }
      continue;
    }

    positionals.push(a);
  }

  return { flags, positionals };
}

const readStdin = async (): Promise<string> => {
  if (process.stdin.isTTY) return "";

  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8").trim();
};

const help = () => {
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

const readPackageVersion = async () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const pkgPath = resolve(here, "../package.json");
  const raw = await readFile(pkgPath, "utf8");
  const pkg = JSON.parse(raw) as { version?: string; name?: string };
  return pkg.version ?? "0.0.0";
};

const fail = (msg: string) => {
  console.error(msg);
  process.exit(1);
};

const pickMode = (out: any, mode: Mode) => {
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
};

const main = async () => {
  const { flags, positionals } = parseArgs(process.argv);

  if (positionals[0] === "completion") {
    const shell = positionals[1];
    if (shell === "bash") console.log(completionBash());
    else if (shell === "zsh") console.log(completionZsh());
    else if (shell === "fish") console.log(completionFish());
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

    const emitType = Boolean(flags.get("--type"));
    const emitZod = Boolean(flags.get("--zod"));
    const emitInterface = Boolean(flags.get("--interface"));

    const outdir = String(flags.get("--outdir") ?? "./core"); // allow override
    const dryRun = Boolean(flags.get("--dry-run"));

    const typeName = String((out as any).typeName ?? "");
    const base = toKebabCase(typeName || "type");

    const emitted: string[] = [];

    if (emitType) {
      const p = resolve(outdir, `${base}.type.ts`);
      const content = String((out as any).type);
      if (!dryRun)
        await writeOutFile(
          p,
          content.endsWith("\n") ? content : content + "\n"
        );
      emitted.push(p);
    }

    if (emitInterface) {
      const p = resolve(outdir, `${base}.interface.ts`);
      const content = String((out as any).interface ?? "");
      if (!content)
        throw new Error("No interface output (did you disable it?)");
      if (!dryRun)
        await writeOutFile(
          p,
          content.endsWith("\n") ? content : content + "\n"
        );
      emitted.push(p);
    }

    if (emitZod) {
      const p = resolve(outdir, `${base}.zod.ts`);
      const content = String((out as any).zod ?? "");
      if (!content) throw new Error("No zod output (did you disable it?)");
      if (!dryRun)
        await writeOutFile(
          p,
          content.endsWith("\n") ? content : content + "\n"
        );
      emitted.push(p);
    }

    // If we emitted files, print paths (and optionally skip stdout output)
    if (emitted.length > 0) {
      for (const p of emitted)
        console.log(dryRun ? `[dry-run] ${p}` : `Wrote ${p}`);
      // Optional: if user only wanted files, exit early unless they also requested a mode
      if (!flags.has("--mode")) return;
    }

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
};

main();
