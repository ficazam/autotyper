import { Hono } from "hono";
import { buildOutput } from "../core/utils";
import { DSLError, GenOptions } from "../core/types";

const app = new Hono();

const errorToJson = (err: unknown) => {
  if (err instanceof DSLError) {
    return {
      error: err.message,
      index: err.index ?? null,
      token: err.token ?? null,
      hint: err.hint ?? null,
    };
  }
  const message = err instanceof Error ? err.message : "Unknown error";
  return { error: message };
};

app.use("*", async (c, next) => {
  c.header("Access-Control-Allow-Origin", "*");
  c.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  c.header("Access-Control-Allow-Headers", "Content-Type");
  if (c.req.method === "OPTIONS") return c.body(null, 204);
  await next();
});

app.post("/dsl", async (c) => {
  try {
    const body = await c.req.json<{
      dsl: string;
      options?: GenOptions;
    }>();

    const dsl = body.dsl ?? "";
    const options: GenOptions = {
      optionalByDefault: false,
      zod: true,
      interface: true,
      example: true,
      strictZod: false,
      ...(body.options ?? {}),
    };

    return c.json(buildOutput(dsl, options));
  } catch (err) {
    return c.json(errorToJson(err), 400);
  }
});

app.get("/t", (c) => {
  const dsl = c.req.query("dsl") ?? "";
  try {
    const out = buildOutput(dsl, { optionalByDefault: false });
    return c.text(String(out.type), 200, {
      "Content-Type": "text/plain; charset=utf-8",
    });
  } catch (err) {
    const e = errorToJson(err) as any;
    const msg = `Error: ${e.error}\n${e.hint ? `Hint: ${e.hint}\n` : ""}`;
    return c.text(msg, 400, {
      "Content-Type": "text/plain; charset=utf-8",
    });
  }
});

app.get("/all", (c) => {
  const dsl = c.req.query("dsl") ?? "";
  const strict = c.req.query("strict") === "true";

  try {
    const out = buildOutput(dsl, {
      optionalByDefault: false,
      interface: true,
      zod: true,
      example: true,
      strictZod: strict,
    }) as any;

    const parts: string[] = [];
    parts.push("// --- TYPE ---");
    parts.push(out.type.trimEnd(), "");
    parts.push("// --- INTERFACE ---");
    parts.push(out.interface.trimEnd(), "");
    parts.push("// --- ZOD ---");
    parts.push(out.zod.trimEnd(), "");
    parts.push("// --- EXAMPLE (required fields only) ---");
    parts.push(JSON.stringify(out.example, null, 2));

    return c.text(parts.join("\n"), 200, {
      "Content-Type": "text/plain; charset=utf-8",
    });
  } catch (err) {
    const e = errorToJson(err) as any;
    const msg = `Error: ${e.error}\n${e.hint ? `Hint: ${e.hint}\n` : ""}`;
    return c.text(msg, 400, {
      "Content-Type": "text/plain; charset=utf-8",
    });
  }
});

app.get("/", (c) =>
  c.text(
    [
      "Try:",
      'POST /dsl  {"dsl":"User email:s password:s name:s isAdmin?:b createdAt:d tags:s[]"}',
      "GET  /t?dsl=User%20email:s%20password:s%20isAdmin?:b%20createdAt:d%20tags:s[]",
      "GET  /all?dsl=User%20email:s%20password:s%20isAdmin?:b%20createdAt:d%20tags:s[]",
      "GET  /all?dsl=...&strict=true   (Zod strict mode)",
      "",
      "Also supports your old format:",
      "type:user-email:s/password:s/name:s/isAdmin:b:o",
      "",
      "Notes:",
      "- prop? optional, prop! required",
      "- Names are sanitized into valid TS identifiers",
    ].join("\n")
  )
);

export default {
  port: 3000,
  fetch: app.fetch,
};
