# mcp-adapter

Lightweight adapter utilities for registering tools on an [MCP](https://modelcontextprotocol.io) server with full TypeScript type safety.

## Installation

```bash
npm install mcp-adapter
```

> **Peer dependency:** `@modelcontextprotocol/sdk >= 1.0.0` must be installed in your project.

## Usage

### `toolAdapter`

Registers a typed tool on an `McpServer`. Input schema types flow through to the callback automatically — no manual type annotations needed.

**With input schema:**

```ts
import { toolAdapter, toolContentAdapter } from "mcp-adapter";
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

### `toolContentAdapter`

Normalizes a service result into a `CallToolResult`. If `error` is defined it takes priority; otherwise `data` is pretty-printed as JSON.

```ts
import { toolContentAdapter } from "mcp-adapter";

return toolContentAdapter(data ?? {}, error);
```

| Argument | Type | Description |
|----------|------|-------------|
| `data` | `object` | Successful result payload |
| `error` | `string \| undefined` | Error message — takes priority over `data` |

## API

### `toolAdapter(server, adapter)`

| Overload | Description |
|----------|-------------|
| `toolAdapter<T>(server, ToolInputAdapterWithSchema<T>)` | Tool with typed input schema |
| `toolAdapter(server, ToolInputAdapterWithoutSchema)` | Tool with no input arguments |

### `toolContentAdapter(data, error)`

Returns a `CallToolResult` with a single `text` content block.

## License

MIT