# @jalpp/mcp-adapter

Lightweight adapter utilities for registering tools on an [MCP](https://modelcontextprotocol.io) server with full TypeScript type safety. Supports manual tool registration and automatic HTTP endpoint-to-tool bridging with built-in auth.

## Installation

```bash
npm install @jalpp/mcp-adapter
```

**Peer dependencies** — install these in your project if not already present:

```bash
npm install @modelcontextprotocol/sdk zod axios
```

## Adapters

| Adapter | Description |
|---------|-------------|
| `toolAdapter` | Register a tool with a typed callback |
| `toolContentAdapter` | Normalize a result into a `CallToolResult` |
| `httpToolAdapter` | Register an HTTP endpoint directly as a tool |

---

## `toolAdapter`

Registers a typed tool on an `McpServer`. Input schema types flow through to the callback automatically — no manual type annotations needed.

**With input schema:**

```ts
import { toolAdapter, toolContentAdapter } from "@jalpp/mcp-adapter";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import z from "zod";

const server = new McpServer({ name: "my-server", version: "1.0.0" });

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
  config: {
    description: "Returns current server status",
  },
  cb: async () => {
    const { data, error } = await myService.getStatus();
    return toolContentAdapter(data ?? {}, error);
  },
});
```

---

## `toolContentAdapter`

Normalizes a service result into a `CallToolResult` text block. If `error` is defined it takes priority; otherwise `data` is serialized as pretty-printed JSON.

```ts
import { toolContentAdapter } from "@jalpp/mcp-adapter";

return toolContentAdapter(data ?? {}, error);
```

| Argument | Type | Description |
|----------|------|-------------|
| `data` | `object` | Successful result payload |
| `error` | `string \| undefined` | Error message — takes priority over `data` when present |

---

## `httpToolAdapter`

Registers an HTTP endpoint directly as an MCP tool. Handles the full request lifecycle — auth headers, query params vs request body, and error mapping — so you only need to declare the tool metadata and schema.

- **GET** requests map input args to **query parameters**
- **POST / PUT / PATCH / DELETE** map input args to the **JSON request body**

**With input schema:**

```ts
import { httpToolAdapter } from "@jalpp/mcp-adapter";
import z from "zod";

httpToolAdapter(server, {
  name: "get-analysis",
  description: "Fetch position analysis from external API",
  endpoint: "https://api.example.com/analyze",
  method: "POST",
  inputSchema: {
    fen: z.string().describe("FEN string"),
    depth: z.number().min(1).max(20),
  },
  auth: {
    type: "bearer",
    token: process.env.API_TOKEN!,
  },
});
```

**Without input schema:**

```ts
httpToolAdapter(server, {
  name: "get-server-status",
  description: "Fetch API health status",
  endpoint: "https://api.example.com/status",
  method: "GET",
});
```

### Authentication

Three auth strategies are supported, all passed via the `auth` field:

**Bearer token** — sends `Authorization: Bearer <token>`:

```ts
auth: {
  type: "bearer",
  token: process.env.API_TOKEN!,
}
```

**API key** — sends the key in a custom header:

```ts
auth: {
  type: "apikey",
  header: "X-API-Key",
  key: process.env.API_KEY!,
}
```

**Basic auth** — sends `Authorization: Basic <base64(username:password)>`:

```ts
auth: {
  type: "basic",
  username: "myuser",
  password: process.env.PASSWORD!,
}
```

### Extra axios config

Pass any additional [axios request config](https://axios-http.com/docs/req_config) via `axiosConfig`:

```ts
httpToolAdapter(server, {
  name: "get-data",
  description: "Fetch with custom timeout",
  endpoint: "https://api.example.com/data",
  method: "GET",
  axiosConfig: {
    timeout: 5000,
    headers: { "Accept-Language": "en" },
  },
});
```

---

## API Reference

### `toolAdapter(server, adapter)`

| Overload | When to use |
|----------|-------------|
| `toolAdapter<T>(server, ToolInputAdapterWithSchema<T>)` | Tool that receives typed input args |
| `toolAdapter(server, ToolInputAdapterWithoutSchema)` | Tool that takes no input |

### `toolContentAdapter(data, error)`

Returns a `CallToolResult` with a single `text` content block.

### `httpToolAdapter(server, adapter)`

| Overload | When to use |
|----------|-------------|
| `httpToolAdapter<T>(server, HttpToolAdapterWithSchema<T>)` | Endpoint that receives typed input args |
| `httpToolAdapter(server, HttpToolAdapterWithoutSchema)` | Endpoint that takes no input |

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