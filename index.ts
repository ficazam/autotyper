import { Hono } from "hono";
import { buildOutput } from "./core/utils";
import { GenOptions } from "./core/types";

const app = new Hono();

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
      ...(body.options ?? {}),
    };

    return c.json(buildOutput(dsl, options));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.json({ error: message }, 400);
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
    const message = err instanceof Error ? err.message : "Unknown error";
    return c.text(`Error: ${message}`, 400, {
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
      "",
      "Also supports your old format:",
      "type:user-email:s/password:s/name:s/isAdmin:b:o",
    ].join("\n")
  )
);

export default {
  port: 3000,
  fetch: app.fetch,
};
