<!-- Badges -->
![npm](https://img.shields.io/npm/v/@ficazam31/autotyper)
![downloads](https://img.shields.io/npm/dm/@ficazam31/autotyper)
![license](https://img.shields.io/npm/l/@ficazam31/autotyper)
![node](https://img.shields.io/node/v/@ficazam31/autotyper)

# autotyper

**autotyper** is a tiny CLI that turns a fast, human-friendly DSL into clean TypeScript types — with optional `interface`, `zod` schema, and example object generation.

If you’re tired of repeatedly typing:

```ts
export type User = {
  id: string;
  email: string;
  createdAt: Date;
};
```

…this tool is for you.

---

## Installation

### npm (global)
```bash
npm i -g @ficazam31/autotyper
```

### bun (global)
```bash
bun add -g @ficazam31/autotyper
```

If the binary is not picked up on your system:
```bash
bunx @ficazam31/autotyper --help
```

---

## Quick start

Generate a TypeScript type:

```bash
autotyper "User email:s password:s name:s isAdmin?:b createdAt:d tags:s[]"
```

Generate everything at once (type + interface + zod + example):

```bash
autotyper --mode all "User email:s password:s isAdmin?:b createdAt:d tags:s[]"
```

Pipe input from stdin:

```bash
echo "User email:s createdAt:d" | autotyper --mode all
```

---

## DSL format (recommended)

The **first token** is the type name.  
All following tokens are properties.

```text
User email:s password:s name:s isAdmin?:b createdAt:d tags:s[]
```

### Property syntax

- `prop:type` → explicit type
- `prop` → type is inferred
- `prop?` → optional
- `prop!` → required

### Type shorthands

| Shorthand | Type |
|---------|------|
| `s` | `string` |
| `n` | `number` |
| `b` | `boolean` |
| `d` | `Date` |
| `u` | `unknown` |
| `a` | `any` |

Arrays are written as:

```text
tags:s[]
scores:n[]
dates:d[]
```

Passthrough types also work:

```text
User id:UUID metadata:Record<string, string>
```

---

## Type inference rules

If you don’t provide a type, **autotyper infers one**:

- `createdAt`, `updatedOn`, anything ending in `At` / `On` or containing `date` → `Date`
- `isAdmin`, `hasPets`, `canEdit`, `shouldRetry` → `boolean`
- `id`, `user_id`, `orderId` → `string`
- plural names like `tags`, `items`, `users` → `string[]`
- otherwise → `string`

Example:

```bash
autotyper "User id email password isAdmin? createdAt tags"
```

---

## Output modes

```bash
autotyper --mode type "User email:s"
autotyper --mode interface "User email:s"
autotyper --mode zod "User email:s createdAt:d"
autotyper --mode all "User email:s createdAt:d"
autotyper --mode json "User email:s createdAt:d"
```

### Zod strict mode

```bash
autotyper --mode zod --strict "User email:s createdAt:d"
```

---

## Backwards compatibility (old format supported)

```bash
autotyper "type:user-email:s/password:s/name:s/isAdmin:b:o"
```

---

## Examples

**Auth DTO**
```bash
autotyper --mode all "LoginRequest email:s password:s"
```

**User model**
```bash
autotyper --mode all "User id email name isAdmin?:b createdAt:d tags:s[]"
```

**Name sanitization**
```bash
autotyper --mode type "user-profile first-name:s default:s 2faEnabled?:b"
```

---

## License

MIT