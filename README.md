# @jalpp/mcp-adapter

Lightweight adapter utilities for registering tools and resources on an [MCP](https://modelcontextprotocol.io) server with full TypeScript type safety. Supports manual tool registration, automatic HTTP endpoint-to-tool bridging with built-in auth, path variables, method-specific adapters, and MCP resource registration.

## Installation

```bash
npm install @jalpp/mcp-adapter
```

**Peer dependencies** — install these in your project if not already present:

```bash
npm install @modelcontextprotocol/sdk zod axios
```

---

## Adapters

### Tool adapters

| Adapter | Description |
|---------|-------------|
| `toolAdapter` | Registers a tool with a typed callback |
| `toolContentAdapter` | Normalizes a result into a `CallToolResult` |
| `httpToolAdapter` | Registers any HTTP endpoint as a tool |
| `getToolAdapter` | Registers a GET endpoint as a tool — args → query params |
| `postToolAdapter` | Registers a POST endpoint as a tool — args → request body |
| `putToolAdapter` | Registers a PUT endpoint as a tool — args → request body |
| `patchToolAdapter` | Registers a PATCH endpoint as a tool — args → request body |
| `deleteToolAdapter` | Registers a DELETE endpoint as a tool — args → query params |

### Resource adapters

| Adapter | Description |
|---------|-------------|
| `staticResourceAdapter` | Registers a static MCP resource with a fixed URI |
| `dynamicResourceAdapter` | Registers a dynamic MCP resource with a URI template |

---

## Path Variables

All HTTP tool adapters support `:paramName` path variable syntax. Any input arg whose name matches a path variable is interpolated into the URL and removed from query params / request body.

```ts
getToolAdapter(server, {
  name: "get-user",
  description: "Fetch a user by ID",
  endpoint: "https://api.example.com/users/:userId",
  inputSchema: {
    userId: z.string().describe("User ID"),
    expand: z.string().optional().describe("Optional fields to expand"),
  },
  auth: { type: "bearer", token: process.env.API_TOKEN! },
});
// Registers get-user tool which calls GET https://api.example.com/users/abc123?expand=profile
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
// Registers get-user tool which calls GET https://api.example.com/users/abc123?expand=profile
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
// Registers create-post tool which calls POST https://api.example.com/users/abc123/posts  { title, body }
```

---

## `putToolAdapter`

Registers a PUT endpoint as an MCP tool. Remaining args are sent as the **JSON request body**.

```ts
import { putToolAdapter } from "@jalpp/mcp-adapter";

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
// Registers update-user tool which calls PUT https://api.example.com/users/abc123  { name, email }
```

---

## `patchToolAdapter`

Registers a PATCH endpoint as an MCP tool. Remaining args are sent as the **JSON request body**.

```ts
import { patchToolAdapter } from "@jalpp/mcp-adapter";

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
// Registers update-post-title tool which calls PATCH https://api.example.com/posts/xyz789  { title }
```

---

## `deleteToolAdapter`

Registers a DELETE endpoint as an MCP tool. Remaining args (after path variable interpolation) are sent as **query parameters**.

```ts
import { deleteToolAdapter } from "@jalpp/mcp-adapter";

deleteToolAdapter(server, {
  name: "delete-post",
  description: "Delete a post by ID",
  endpoint: "https://api.example.com/posts/:postId",
  inputSchema: { postId: z.string() },
  auth: { type: "bearer", token: process.env.API_TOKEN! },
});
// Registers delete-post tool which calls DELETE https://api.example.com/posts/xyz789
```

---

## `httpToolAdapter`

Lower-level adapter that accepts an explicit `method` field. Use this when you prefer a single unified call style or need to pass the method dynamically.

```ts
import { httpToolAdapter } from "@jalpp/mcp-adapter";

httpToolAdapter(server, {
  name: "search-products",
  description: "Search the product catalogue",
  endpoint: "https://api.example.com/products/search",
  method: "POST",
  inputSchema: { query: z.string(), limit: z.number().optional() },
  auth: { type: "apikey", header: "X-API-Key", key: process.env.API_KEY! },
});
// Registers search-products tool which calls POST https://api.example.com/products/search  { query, limit }
```

---

## `toolAdapter`

Registers a tool with a fully custom typed callback. Use when you need data transformation, custom error handling, or logic that goes beyond a single HTTP call.

**With input schema:**

```ts
import { toolAdapter, toolContentAdapter } from "@jalpp/mcp-adapter";
import z from "zod";

toolAdapter(server, {
  name: "summarize-report",
  config: {
    description: "Fetch and summarize a sales report",
    inputSchema: {
      reportId: z.string().describe("Report ID"),
      format: z.enum(["short", "detailed"]).default("short"),
    },
  },
  cb: async ({ reportId, format }) => {
    const { data, error } = await reportService.get(reportId, format);
    return toolContentAdapter(data ?? {}, error);
  },
});
```

**Without input schema:**

```ts
toolAdapter(server, {
  name: "get-server-status",
  config: { description: "Returns current server status" },
  cb: async () => {
    const { data, error } = await statusService.get();
    return toolContentAdapter(data ?? {}, error);
  },
});
```

---

## `toolContentAdapter`

Normalizes a service result into a `CallToolResult` text block. If `error` is defined it takes priority; otherwise `data` is serialized as pretty-printed JSON.

```ts
return toolContentAdapter(data ?? {}, error);
```

| Argument | Type | Description |
|----------|------|-------------|
| `data` | `object` | Successful result payload |
| `error` | `string \| undefined` | Error message — takes priority over `data` |

---

## `staticResourceAdapter`

Registers a static MCP resource with a fixed URI. The `load` callback is called on every client request and may return fresh content each time. Use this for resources whose identity is fixed but content may change (e.g. a config file, a status page, a knowledge base).

```ts
import { staticResourceAdapter } from "@jalpp/mcp-adapter";

// Expose a live system health report
staticResourceAdapter(server, {
  name: "system-health",
  uri: "status://health",
  title: "System Health",
  description: "Live health status of all services",
  mimeType: "application/json",
  load: async () => JSON.stringify(await healthService.getReport()),
});

// Expose a markdown documentation page
staticResourceAdapter(server, {
  name: "api-docs",
  uri: "docs://api",
  title: "API Documentation",
  description: "REST API reference documentation",
  mimeType: "text/markdown",
  load: () => fs.readFileSync("./docs/api.md", "utf-8"),
});
```

---

## `dynamicResourceAdapter`

Registers a dynamic MCP resource with a URI template. Use `{paramName}` placeholders — matched values are extracted and passed to the `load` callback. Use this for resources identified by an ID or other variable.

```ts
import { dynamicResourceAdapter } from "@jalpp/mcp-adapter";

// Expose a user profile by ID
dynamicResourceAdapter(server, {
  name: "user-profile",
  uriTemplate: "users://{userId}/profile",
  title: "User Profile",
  description: "Profile data for a specific user",
  mimeType: "application/json",
  load: async (uri, { userId }) => JSON.stringify(await userService.getProfile(userId)),
});

// Expose an order invoice by order ID
dynamicResourceAdapter(server, {
  name: "order-invoice",
  uriTemplate: "orders://{orderId}/invoice",
  title: "Order Invoice",
  description: "Invoice details for a specific order",
  mimeType: "application/json",
  load: async (uri, { orderId }) => JSON.stringify(await orderService.getInvoice(orderId)),
});

// Expose a blog post by slug
dynamicResourceAdapter(server, {
  name: "blog-post",
  uriTemplate: "blog://{slug}",
  title: "Blog Post",
  description: "Markdown content for a blog post",
  mimeType: "text/markdown",
  load: async (uri, { slug }) => await blogService.getPostMarkdown(slug),
});
```

---

## Authentication

All HTTP tool adapters accept an optional `auth` field. Three strategies are supported:

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

### Tool adapters

| Function | Registers | Args mapping |
|----------|-----------|--------------|
| `getToolAdapter` | GET tool | remaining args → query params |
| `postToolAdapter` | POST tool | remaining args → request body |
| `putToolAdapter` | PUT tool | remaining args → request body |
| `patchToolAdapter` | PATCH tool | remaining args → request body |
| `deleteToolAdapter` | DELETE tool | remaining args → query params |
| `httpToolAdapter` | any method tool | depends on method |
| `toolAdapter` | custom callback tool | fully custom |

All HTTP adapters support optional `inputSchema` and `:paramName` path variables.

### Resource adapters

| Function | Registers | URI style |
|----------|-----------|-----------|
| `staticResourceAdapter` | fixed-URI resource | `"scheme://path"` |
| `dynamicResourceAdapter` | templated resource | `"scheme://{param}/path"` |

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