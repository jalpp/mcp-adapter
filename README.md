# @jalpp/mcp-adapter

Lightweight adapter utilities for registering tools on an [MCP](https://modelcontextprotocol.io) server with full TypeScript type safety. Supports manual tool registration and automatic HTTP endpoint-to-tool bridging with built-in auth, path variables, and method-specific adapters.

## Installation

```bash
npm install @jalpp/mcp-adapter
```

**Peer dependencies** — install these in your project if not already present:

```bash
npm install @modelcontextprotocol/sdk zod axios
```

## Adapters

| Adapter | Method | Description |
|---------|--------|-------------|
| `toolAdapter` | any | Register a tool with a typed callback |
| `toolContentAdapter` | — | Normalize a result into a `CallToolResult` |
| `httpToolAdapter` | any | Register any HTTP endpoint as a tool |
| `getToolAdapter` | GET | Register a GET endpoint — args → query params |
| `postToolAdapter` | POST | Register a POST endpoint — args → request body |
| `putToolAdapter` | PUT | Register a PUT endpoint — args → request body |
| `patchToolAdapter` | PATCH | Register a PATCH endpoint — args → request body |
| `deleteToolAdapter` | DELETE | Register a DELETE endpoint — args → query params |

---

## Path Variables

All HTTP adapters support `:paramName` path variable syntax. Any input arg whose name matches a path variable is interpolated into the URL and removed from query params / request body.

```ts
getToolAdapter(server, {
  name: "get-game-details",
  description: "Fetch a game by ID",
  endpoint: "https://api.example.com/games/:gameId",
  inputSchema: {
    gameId: z.string().describe("Game ID"),
    expand: z.string().optional().describe("Optional fields to expand"),
  },
  auth: { type: "bearer", token: process.env.API_TOKEN! },
});
// GET https://api.example.com/games/abc123?expand=moves
```

---

## `getToolAdapter`

Registers a GET endpoint as an MCP tool. Remaining args (after path variable interpolation) are sent as **query parameters**.

```ts
import { getToolAdapter } from "@jalpp/mcp-adapter";
import z from "zod";

getToolAdapter(server, {
  name: "get-user",
  description: "Fetch a user by ID",
  endpoint: "https://api.example.com/users/:userId",
  inputSchema: {
    userId: z.string().describe("User ID"),
    expand: z.string().optional().describe("Comma-separated fields to expand"),
  },
  auth: { type: "bearer", token: process.env.API_TOKEN! },
});
// → GET https://api.example.com/users/abc123?expand=profile
```

---

## `postToolAdapter`

Registers a POST endpoint as an MCP tool. Remaining args (after path variable interpolation) are sent as the **JSON request body**.

```ts
import { postToolAdapter } from "@jalpp/mcp-adapter";

postToolAdapter(server, {
  name: "create-post",
  description: "Create a new post for a user",
  endpoint: "https://api.example.com/users/:userId/posts",
  inputSchema: {
    userId: z.string().describe("User ID"),
    title: z.string().describe("Post title"),
    body: z.string().describe("Post body"),
  },
  auth: { type: "bearer", token: process.env.API_TOKEN! },
});
// → POST https://api.example.com/users/abc123/posts  { title, body }
```

---

## `putToolAdapter`

Registers a PUT endpoint as an MCP tool. Remaining args are sent as the **JSON request body**.

```ts
putToolAdapter(server, {
  name: "update-user",
  description: "Replace a user record",
  endpoint: "https://api.example.com/users/:userId",
  inputSchema: {
    userId: z.string(),
    name: z.string(),
    email: z.string(),
  },
  auth: { type: "bearer", token: process.env.API_TOKEN! },
});
// → PUT https://api.example.com/users/abc123  { name, email }
```

---

## `patchToolAdapter`

Registers a PATCH endpoint as an MCP tool. Remaining args are sent as the **JSON request body**.

```ts
patchToolAdapter(server, {
  name: "update-post-title",
  description: "Partially update a post",
  endpoint: "https://api.example.com/posts/:postId",
  inputSchema: {
    postId: z.string(),
    title: z.string(),
  },
  auth: { type: "bearer", token: process.env.API_TOKEN! },
});
// → PATCH https://api.example.com/posts/xyz789  { title }
```

---

## `deleteToolAdapter`

Registers a DELETE endpoint as an MCP tool. Remaining args (after path variable interpolation) are sent as **query parameters**.

```ts
deleteToolAdapter(server, {
  name: "delete-post",
  description: "Delete a post by ID",
  endpoint: "https://api.example.com/posts/:postId",
  inputSchema: { postId: z.string() },
  auth: { type: "bearer", token: process.env.API_TOKEN! },
});
// → DELETE https://api.example.com/posts/xyz789
```

---

## `httpToolAdapter`

Lower-level adapter that accepts an explicit `method` field. Use this when the method needs to be dynamic or you prefer a single unified call style.

```ts
import { httpToolAdapter } from "@jalpp/mcp-adapter";

httpToolAdapter(server, {
  name: "get-analysis",
  description: "Fetch position analysis",
  endpoint: "https://api.example.com/analyze",
  method: "POST",
  inputSchema: { fen: z.string(), depth: z.number() },
  auth: { type: "bearer", token: process.env.API_TOKEN! },
});
```

---

## `toolAdapter`

Registers a tool with a fully custom typed callback. Use when you need data transformation, custom error handling, or logic that goes beyond a single HTTP call.

**With input schema:**

```ts
import { toolAdapter, toolContentAdapter } from "@jalpp/mcp-adapter";

toolAdapter(server, {
  name: "get-analysis",
  config: {
    description: "Analyze a chess position",
    inputSchema: {
      fen: z.string().describe("FEN string"),
      depth: z.number().min(1).max(20),
    },
    annotations: { openWorldHint: true },
  },
  cb: async ({ fen, depth }) => {
    const { data, error } = await myService.analyze(fen, depth);
    return toolContentAdapter(data ?? {}, error);
  },
});
```

**Without input schema:**

```ts
toolAdapter(server, {
  name: "get-status",
  config: { description: "Returns current server status" },
  cb: async () => {
    const { data, error } = await myService.getStatus();
    return toolContentAdapter(data ?? {}, error);
  },
});
```

---

## `toolContentAdapter`

Normalizes a result into a `CallToolResult` text block. If `error` is defined it takes priority; otherwise `data` is serialized as pretty-printed JSON.

```ts
return toolContentAdapter(data ?? {}, error);
```

| Argument | Type | Description |
|----------|------|-------------|
| `data` | `object` | Successful result payload |
| `error` | `string \| undefined` | Error message — takes priority over `data` |

---

## Authentication

All HTTP adapters accept an optional `auth` field. Three strategies are supported:

**Bearer token** — `Authorization: Bearer <token>`:
```ts
auth: { type: "bearer", token: process.env.API_TOKEN! }
```

**API key** — custom header:
```ts
auth: { type: "apikey", header: "X-API-Key", key: process.env.API_KEY! }
```

**Basic auth** — `Authorization: Basic <base64>`:
```ts
auth: { type: "basic", username: "user", password: process.env.PASSWORD! }
```

---

## Extra axios config

Pass any [axios request config](https://axios-http.com/docs/req_config) via `axiosConfig`:

```ts
getToolAdapter(server, {
  name: "get-data",
  description: "Fetch with custom timeout",
  endpoint: "https://api.example.com/data",
  axiosConfig: { timeout: 5000 },
});
```

---

## API Reference

### Method-specific adapters

| Function | Method | Args mapping |
|----------|--------|--------------|
| `getToolAdapter` | GET | remaining args → query params |
| `postToolAdapter` | POST | remaining args → request body |
| `putToolAdapter` | PUT | remaining args → request body |
| `patchToolAdapter` | PATCH | remaining args → request body |
| `deleteToolAdapter` | DELETE | remaining args → query params |

All support optional `inputSchema` and `:paramName` path variables.

### Auth types

| Type | Interface | Fields |
|------|-----------|--------|
| Bearer | `BearerAuth` | `token` |
| API Key | `ApiKeyAuth` | `header`, `key` |
| Basic | `BasicAuth` | `username`, `password` |

---

## Repository

[github.com/jalpp/mcp-adapter](https://github.com/jalpp/mcp-adapter)

## License

MIT