import axios, { AxiosRequestConfig } from "axios";
import { McpServer, ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ZodRawShapeCompat } from "@modelcontextprotocol/sdk/server/zod-compat.js";
import { toolAdapter, toolContentAdapter } from "./toolAdapter.js";

/**
 * Supported HTTP methods for the HTTP tool adapter.
 */
export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * API key authentication — sent as a request header.
 * @example { type: "apikey", header: "X-API-Key", key: process.env.API_KEY! }
 */
export interface ApiKeyAuth {
  type: "apikey";
  /** Header name to send the key in (e.g. `"X-API-Key"`) */
  header: string;
  key: string;
}

/**
 * Bearer token authentication — sends `Authorization: Bearer <token>`.
 * @example { type: "bearer", token: process.env.API_TOKEN! }
 */
export interface BearerAuth {
  type: "bearer";
  token: string;
}

/**
 * HTTP Basic authentication — sends `Authorization: Basic <base64>`.
 * @example { type: "basic", username: "user", password: process.env.PASSWORD! }
 */
export interface BasicAuth {
  type: "basic";
  username: string;
  password: string;
}

/** Union of all supported authentication strategies. */
export type HttpAuth = ApiKeyAuth | BearerAuth | BasicAuth;

/**
 * Configuration for registering an HTTP endpoint as an MCP tool with an input schema.
 * @template T - Zod raw shape inferred from `inputSchema`.
 */
export interface HttpToolAdapterWithSchema<T extends ZodRawShapeCompat> {
  /** Unique tool name in the MCP registry. */
  name: string;
  /** Description of the tool shown to the model. */
  description: string;
  /**
   * Full URL of the API endpoint. Supports path variable templates using `:paramName` syntax.
   * @example "https://api.example.com/users/:userId/posts"
   */
  endpoint: string;
  /** HTTP method to use. */
  method: HttpMethod;
  /** Zod shape defining the tool's input arguments. */
  inputSchema: T;
  /** Optional authentication strategy. */
  auth?: HttpAuth;
  /** Optional extra axios config (e.g. headers, timeout). */
  axiosConfig?: AxiosRequestConfig;
}

/**
 * Configuration for registering an HTTP endpoint as an MCP tool with no input arguments.
 */
export interface HttpToolAdapterWithoutSchema {
  /** Unique tool name in the MCP registry. */
  name: string;
  /** Description of the tool shown to the model. */
  description: string;
  /**
   * Full URL of the API endpoint. Supports path variable templates using `:paramName` syntax.
   * @example "https://api.example.com/status"
   */
  endpoint: string;
  /** HTTP method to use. */
  method: HttpMethod;
  inputSchema?: undefined;
  /** Optional authentication strategy. */
  auth?: HttpAuth;
  /** Optional extra axios config (e.g. headers, timeout). */
  axiosConfig?: AxiosRequestConfig;
}

/**
 * Configuration specific to GET tool adapters.
 * Input args are mapped to query parameters unless consumed by path variables.
 * @template T - Zod raw shape inferred from `inputSchema`.
 */
export type GetToolAdapterConfig<T extends ZodRawShapeCompat> = Omit<HttpToolAdapterWithSchema<T>, "method">;

/**
 * Configuration specific to GET tool adapters without input schema.
 */
export type GetToolAdapterConfigNoSchema = Omit<HttpToolAdapterWithoutSchema, "method">;

/**
 * Configuration specific to POST tool adapters.
 * Input args are sent as the JSON request body unless consumed by path variables.
 * @template T - Zod raw shape inferred from `inputSchema`.
 */
export type PostToolAdapterConfig<T extends ZodRawShapeCompat> = Omit<HttpToolAdapterWithSchema<T>, "method">;

/**
 * Configuration specific to POST tool adapters without input schema.
 */
export type PostToolAdapterConfigNoSchema = Omit<HttpToolAdapterWithoutSchema, "method">;

/**
 * Configuration specific to PUT tool adapters.
 * Input args are sent as the JSON request body unless consumed by path variables.
 * @template T - Zod raw shape inferred from `inputSchema`.
 */
export type PutToolAdapterConfig<T extends ZodRawShapeCompat> = Omit<HttpToolAdapterWithSchema<T>, "method">;

/**
 * Configuration specific to PATCH tool adapters.
 * Input args are sent as the JSON request body unless consumed by path variables.
 * @template T - Zod raw shape inferred from `inputSchema`.
 */
export type PatchToolAdapterConfig<T extends ZodRawShapeCompat> = Omit<HttpToolAdapterWithSchema<T>, "method">;

/**
 * Configuration specific to DELETE tool adapters.
 * Input args are sent as query parameters unless consumed by path variables.
 * @template T - Zod raw shape inferred from `inputSchema`.
 */
export type DeleteToolAdapterConfig<T extends ZodRawShapeCompat> = Omit<HttpToolAdapterWithSchema<T>, "method">;

/**
 * Builds axios request headers from the provided auth strategy.
 */
function buildAuthHeaders(auth: HttpAuth): Record<string, string> {
  switch (auth.type) {
    case "apikey":
      return { [auth.header]: auth.key };
    case "bearer":
      return { Authorization: `Bearer ${auth.token}` };
    case "basic": {
      const encoded = Buffer.from(`${auth.username}:${auth.password}`).toString("base64");
      return { Authorization: `Basic ${encoded}` };
    }
  }
}

/**
 * Resolves path variables in an endpoint template, returning the interpolated URL
 * and the remaining args that were not consumed by path variables.
 *
 * @param endpoint - URL template with optional `:paramName` placeholders.
 * @param args     - Input args from the tool call.
 * @returns `{ url, remainingArgs }` — resolved URL and unconsumed args.
 *
 * @example
 * resolvePathParams("https://api.example.com/games/:gameId", { gameId: "abc123", depth: 10 })
 * // → { url: "https://api.example.com/games/abc123", remainingArgs: { depth: 10 } }
 */
function resolvePathParams(
  endpoint: string,
  args: Record<string, unknown>,
): { url: string; remainingArgs: Record<string, unknown> } {
  const remainingArgs = { ...args };
  const url = endpoint.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, key) => {
    if (key in remainingArgs) {
      const value = remainingArgs[key];
      delete remainingArgs[key];
      return encodeURIComponent(String(value));
    }
    return `:${key}`;
  });
  return { url, remainingArgs };
}

/**
 * Executes an HTTP request using axios.
 *
 * - Path variables (`:paramName`) are interpolated from args and removed from the remaining args.
 * - GET/DELETE: remaining args are sent as query parameters.
 * - POST/PUT/PATCH: remaining args are sent as the JSON request body.
 *
 * @param endpoint    - URL template (may contain `:paramName` placeholders).
 * @param method      - HTTP method.
 * @param args        - Parsed tool input args.
 * @param auth        - Optional auth strategy.
 * @param extraConfig - Optional extra axios config merged into the request.
 * @returns `{ data }` on success or `{ error }` on failure.
 */
async function executeRequest(
  endpoint: string,
  method: HttpMethod,
  args: Record<string, unknown>,
  auth?: HttpAuth,
  extraConfig?: AxiosRequestConfig,
): Promise<{ data?: object; error?: string }> {
  try {
    const authHeaders = auth ? buildAuthHeaders(auth) : {};
    const { url, remainingArgs } = resolvePathParams(endpoint, args);
    const isQueryMethod = method === "GET" || method === "DELETE";

    const config: AxiosRequestConfig = {
      url,
      method,
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
        ...extraConfig?.headers,
      },
      ...(isQueryMethod ? { params: remainingArgs } : { data: remainingArgs }),
      ...extraConfig,
    };

    const response = await axios(config);
    return { data: response.data };
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status ?? "unknown";
      const message = err.response?.data?.message ?? err.message;
      return { error: `HTTP ${status}: ${message}` };
    }
    return { error: `Unexpected error: ${String(err)}` };
  }
}

/**
 * Core HTTP tool adapter. Registers any HTTP endpoint as an MCP tool.
 *
 * Prefer the method-specific adapters (`getToolAdapter`, `postToolAdapter`, etc.)
 * for cleaner, self-documenting code.
 *
 * - Path variables (`:paramName`) are interpolated from input args.
 * - GET/DELETE: remaining args → query parameters.
 * - POST/PUT/PATCH: remaining args → JSON request body.
 *
 * @template T - Zod raw shape inferred from `inputSchema`.
 * @param server  - The `McpServer` instance to register the tool on.
 * @param adapter - HTTP tool configuration.
 */
export function httpToolAdapter<T extends ZodRawShapeCompat>(
  server: McpServer,
  adapter: HttpToolAdapterWithSchema<T>,
): void;
export function httpToolAdapter(
  server: McpServer,
  adapter: HttpToolAdapterWithoutSchema,
): void;
export function httpToolAdapter<T extends ZodRawShapeCompat>(
  server: McpServer,
  adapter: HttpToolAdapterWithSchema<T> | HttpToolAdapterWithoutSchema,
): void {
  if (adapter.inputSchema) {
    const { endpoint, method, auth, axiosConfig, inputSchema } = adapter as HttpToolAdapterWithSchema<T>;

    toolAdapter(server, {
      name: adapter.name,
      config: { description: adapter.description, inputSchema },
      cb: (async (args: Record<string, unknown>) => {
        const { data, error } = await executeRequest(endpoint, method, args, auth, axiosConfig);
        return toolContentAdapter(data ?? {}, error);
      }) as unknown as ToolCallback<T>,
    });
  } else {
    toolAdapter(server, {
      name: adapter.name,
      config: { description: adapter.description },
      cb: async () => {
        const { data, error } = await executeRequest(
          adapter.endpoint,
          adapter.method,
          {},
          adapter.auth,
          adapter.axiosConfig,
        );
        return toolContentAdapter(data ?? {}, error);
      },
    });
  }
}

/**
 * Registers a GET endpoint as an MCP tool.
 *
 * - Path variables (`:paramName`) are interpolated from input args.
 * - Remaining args are sent as **query parameters**.
 *
 * @template T - Zod raw shape inferred from `inputSchema`.
 * @param server - The `McpServer` instance to register the tool on.
 * @param config - Tool configuration without `method`.
 *
 * @example
 * getToolAdapter(server, {
 *   name: "get-user",
 *   description: "Fetch a user by ID",
 *   endpoint: "https://api.example.com/users/:userId",
 *   inputSchema: { userId: z.string(), expand: z.string().optional() },
 *   auth: { type: "bearer", token: process.env.API_TOKEN! },
 * });
 * // GET https://api.example.com/users/abc123?expand=profile
 */
export function getToolAdapter<T extends ZodRawShapeCompat>(
  server: McpServer,
  config: GetToolAdapterConfig<T>,
): void;
export function getToolAdapter(
  server: McpServer,
  config: GetToolAdapterConfigNoSchema,
): void;
export function getToolAdapter<T extends ZodRawShapeCompat>(
  server: McpServer,
  config: GetToolAdapterConfig<T> | GetToolAdapterConfigNoSchema,
): void {
  httpToolAdapter(server, { ...config, method: "GET" } as any);
}

/**
 * Registers a POST endpoint as an MCP tool.
 *
 * - Path variables (`:paramName`) are interpolated from input args.
 * - Remaining args are sent as the **JSON request body**.
 *
 * @template T - Zod raw shape inferred from `inputSchema`.
 * @param server - The `McpServer` instance to register the tool on.
 * @param config - Tool configuration without `method`.
 *
 * @example
 * postToolAdapter(server, {
 *   name: "create-post",
 *   description: "Create a new post for a user",
 *   endpoint: "https://api.example.com/users/:userId/posts",
 *   inputSchema: { userId: z.string(), title: z.string(), body: z.string() },
 *   auth: { type: "bearer", token: process.env.API_TOKEN! },
 * });
 * // POST https://api.example.com/users/abc123/posts  { title, body }
 */
export function postToolAdapter<T extends ZodRawShapeCompat>(
  server: McpServer,
  config: PostToolAdapterConfig<T>,
): void;
export function postToolAdapter(
  server: McpServer,
  config: PostToolAdapterConfigNoSchema,
): void;
export function postToolAdapter<T extends ZodRawShapeCompat>(
  server: McpServer,
  config: PostToolAdapterConfig<T> | PostToolAdapterConfigNoSchema,
): void {
  httpToolAdapter(server, { ...config, method: "POST" } as any);
}

/**
 * Registers a PUT endpoint as an MCP tool.
 *
 * - Path variables (`:paramName`) are interpolated from input args.
 * - Remaining args are sent as the **JSON request body**.
 *
 * @template T - Zod raw shape inferred from `inputSchema`.
 * @param server - The `McpServer` instance to register the tool on.
 * @param config - Tool configuration without `method`.
 *
 * @example
 * putToolAdapter(server, {
 *   name: "update-user",
 *   description: "Replace a user record",
 *   endpoint: "https://api.example.com/users/:userId",
 *   inputSchema: { userId: z.string(), name: z.string(), email: z.string() },
 *   auth: { type: "bearer", token: process.env.API_TOKEN! },
 * });
 * // PUT https://api.example.com/users/abc123  { name, email }
 */
export function putToolAdapter<T extends ZodRawShapeCompat>(
  server: McpServer,
  config: PutToolAdapterConfig<T>,
): void {
  httpToolAdapter(server, { ...config, method: "PUT" });
}

/**
 * Registers a PATCH endpoint as an MCP tool.
 *
 * - Path variables (`:paramName`) are interpolated from input args.
 * - Remaining args are sent as the **JSON request body**.
 *
 * @template T - Zod raw shape inferred from `inputSchema`.
 * @param server - The `McpServer` instance to register the tool on.
 * @param config - Tool configuration without `method`.
 *
 * @example
 * patchToolAdapter(server, {
 *   name: "update-post-title",
 *   description: "Partially update a post",
 *   endpoint: "https://api.example.com/posts/:postId",
 *   inputSchema: { postId: z.string(), title: z.string() },
 *   auth: { type: "bearer", token: process.env.API_TOKEN! },
 * });
 * // PATCH https://api.example.com/posts/xyz789  { title }
 */
export function patchToolAdapter<T extends ZodRawShapeCompat>(
  server: McpServer,
  config: PatchToolAdapterConfig<T>,
): void {
  httpToolAdapter(server, { ...config, method: "PATCH" });
}

/**
 * Registers a DELETE endpoint as an MCP tool.
 *
 * - Path variables (`:paramName`) are interpolated from input args.
 * - Remaining args are sent as **query parameters**.
 *
 * @template T - Zod raw shape inferred from `inputSchema`.
 * @param server - The `McpServer` instance to register the tool on.
 * @param config - Tool configuration without `method`.
 *
 * @example
 * deleteToolAdapter(server, {
 *   name: "delete-post",
 *   description: "Delete a post by ID",
 *   endpoint: "https://api.example.com/posts/:postId",
 *   inputSchema: { postId: z.string() },
 *   auth: { type: "bearer", token: process.env.API_TOKEN! },
 * });
 * // DELETE https://api.example.com/posts/xyz789
 */
export function deleteToolAdapter<T extends ZodRawShapeCompat>(
  server: McpServer,
  config: DeleteToolAdapterConfig<T>,
): void {
  httpToolAdapter(server, { ...config, method: "DELETE" });
}