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

/**
 * Union of all supported authentication strategies.
 */
export type HttpAuth = ApiKeyAuth | BearerAuth | BasicAuth;

/**
 * Configuration for registering an HTTP endpoint as an MCP tool with an input schema.
 *
 * @template T - Zod raw shape inferred from `inputSchema`, typed through to the request.
 */
export interface HttpToolAdapterWithSchema<T extends ZodRawShapeCompat> {
  /** Unique tool name in the MCP registry. */
  name: string;
  /** Description of the tool shown to the model. */
  description: string;
  /** Full URL of the API endpoint. */
  endpoint: string;
  /** HTTP method to use. GET maps args to query params; others map to request body. */
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
  /** Full URL of the API endpoint. */
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
 * Builds axios request headers from the provided auth strategy.
 *
 * @param auth - The authentication config to apply.
 * @returns A headers object to merge into the axios request.
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
 * Executes an HTTP request using axios, mapping tool args to query params (GET)
 * or request body (POST/PUT/PATCH/DELETE).
 *
 * @param endpoint    - The API URL to call.
 * @param method      - HTTP method.
 * @param args        - Parsed tool input args to send with the request.
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

    const config: AxiosRequestConfig = {
      url: endpoint,
      method,
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
        ...extraConfig?.headers,
      },
      ...(method === "GET" ? { params: args } : { data: args }),
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
 * Registers an HTTP endpoint as an MCP tool with a typed input schema.
 *
 * GET requests map input args to query parameters.
 * All other methods map input args to the JSON request body.
 *
 * @template T - Zod raw shape inferred from `inputSchema`.
 * @param server  - The `McpServer` instance to register the tool on.
 * @param adapter - HTTP tool configuration including endpoint, method, schema, and auth.
 *
 * @example
 * httpToolAdapter(server, {
 *   name: "get-analysis",
 *   description: "Fetch position analysis",
 *   endpoint: "https://api.example.com/analyze",
 *   method: "POST",
 *   inputSchema: { fen: z.string(), depth: z.number() },
 *   auth: { type: "bearer", token: process.env.API_TOKEN! },
 * });
 */
export function httpToolAdapter<T extends ZodRawShapeCompat>(
  server: McpServer,
  adapter: HttpToolAdapterWithSchema<T>,
): void;

/**
 * Registers an HTTP endpoint as an MCP tool with no input arguments.
 *
 * @param server  - The `McpServer` instance to register the tool on.
 * @param adapter - HTTP tool configuration including endpoint, method, and auth.
 *
 * @example
 * httpToolAdapter(server, {
 *   name: "get-status",
 *   description: "Fetch API status",
 *   endpoint: "https://api.example.com/status",
 *   method: "GET",
 *   auth: { type: "apikey", header: "X-API-Key", key: process.env.API_KEY! },
 * });
 */
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
      config: {
        description: adapter.description,
        inputSchema,
      },
      cb: (async (args: Record<string, unknown>) => {
        const { data, error } = await executeRequest(endpoint, method, args, auth, axiosConfig);
        return toolContentAdapter(data ?? {}, error);
      }) as unknown as ToolCallback<T>,
    });
  } else {
    toolAdapter(server, {
      name: adapter.name,
      config: {
        description: adapter.description,
      },
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