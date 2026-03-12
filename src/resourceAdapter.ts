import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Supported MIME types for resource content.
 * Extend with additional types as needed.
 */
export type ResourceMimeType =
  | "text/plain"
  | "text/html"
  | "text/markdown"
  | "application/json"
  | "application/xml"
  | (string & {});

/**
 * Configuration for registering a static MCP resource.
 *
 * A static resource has a fixed URI with no variable parameters.
 * Use this for resources whose content may change but whose identity does not
 * (e.g. a config file, a status page, a knowledge base).
 *
 * @example
 * staticResourceAdapter(server, {
 *   name: "server-config",
 *   uri: "config://server",
 *   title: "Server Configuration",
 *   description: "Current server configuration and environment settings",
 *   mimeType: "application/json",
 *   load: async () => JSON.stringify(await configService.get()),
 * });
 */
export interface StaticResourceConfig {
  /** Unique resource name used to identify the resource in the MCP registry. */
  name: string;
  /**
   * The fixed URI that clients use to request this resource.
   * @example "config://server"
   * @example "docs://readme"
   */
  uri: string;
  /** Human-readable display title shown in client UIs. */
  title: string;
  /** Description of what the resource contains, shown to the model. */
  description: string;
  /** MIME type of the resource content. Defaults to `"text/plain"`. */
  mimeType?: ResourceMimeType;
  /**
   * Async function that returns the resource content as a string.
   * Called each time a client requests the resource.
   *
   * @returns The resource content string.
   *
   * @example
   * load: async () => JSON.stringify(await configService.get())
   */
  load: () => Promise<string> | string;
}

/**
 * Configuration for registering a dynamic MCP resource with URI template parameters.
 *
 * A dynamic resource uses a URI template with `{paramName}` placeholders.
 * The matched parameter values are passed to the `load` callback.
 * Use this for resources identified by an ID or other variable (e.g. a user profile, an order record).
 *
 * @example
 * dynamicResourceAdapter(server, {
 *   name: "user-profile",
 *   uriTemplate: "users://{userId}/profile",
 *   title: "User Profile",
 *   description: "Profile data for a given user",
 *   mimeType: "application/json",
 *   load: async (uri, { userId }) => JSON.stringify(await userService.getProfile(userId)),
 * });
 */
export interface DynamicResourceConfig {
  /** Unique resource name used to identify the resource in the MCP registry. */
  name: string;
  /**
   * URI template string with `{paramName}` placeholders.
   * @example "users://{userId}/profile"
   * @example "orders://{orderId}/invoice"
   */
  uriTemplate: string;
  /** human-readable display title shown in client UIs. */
  title: string;
  /** Description of what the resource contains, shown to the model. */
  description: string;
  /** MIME type of the resource content. Defaults to `"text/plain"`. */
  mimeType?: ResourceMimeType;
  /**
   * Async function that returns the resource content as a string.
   * Called each time a client requests the resource with a matching URI.
   *
   * @param uri    - The full resolved URI of the request (as a `URL` object).
   * @param params - Key-value map of extracted URI template parameters.
   * @returns The resource content string.
   *
   * @example
   * load: async (uri, { orderId }) => JSON.stringify(await orderService.getInvoice(orderId))
   */
  load: (uri: URL, params: Record<string, string>) => Promise<string> | string;
}

/**
 * Registers a static MCP resource on an `McpServer`.
 *
 * Static resources have a fixed URI. The `load` callback is invoked on every
 * client request and may return fresh data each time.
 *
 * @param server - The `McpServer` instance to register the resource on.
 * @param config - Static resource configuration.
 *
 * @example
 * // Expose a live system health report
 * staticResourceAdapter(server, {
 *   name: "system-health",
 *   uri: "status://health",
 *   title: "System Health",
 *   description: "Live health status of all services",
 *   mimeType: "application/json",
 *   load: async () => JSON.stringify(await healthService.getReport()),
 * });
 *
 * @example
 * // Expose a static markdown documentation page
 * staticResourceAdapter(server, {
 *   name: "api-docs",
 *   uri: "docs://api",
 *   title: "API Documentation",
 *   description: "REST API reference documentation",
 *   mimeType: "text/markdown",
 *   load: () => fs.readFileSync("./docs/api.md", "utf-8"),
 * });
 */
export function staticResourceAdapter(
  server: McpServer,
  config: StaticResourceConfig,
): void {
  server.registerResource(
    config.name,
    config.uri,
    {
      title: config.title,
      description: config.description,
      mimeType: config.mimeType ?? "text/plain",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          text: await config.load(),
          mimeType: config.mimeType ?? "text/plain",
        },
      ],
    }),
  );
}

/**
 * Registers a dynamic MCP resource with a URI template on an `McpServer`.
 *
 * Dynamic resources use `{paramName}` placeholders in the URI template.
 * Matched parameter values are extracted and passed to the `load` callback.
 *
 * @param server - The `McpServer` instance to register the resource on.
 * @param config - Dynamic resource configuration.
 *
 * @example
 * // Expose a user profile by ID
 * dynamicResourceAdapter(server, {
 *   name: "user-profile",
 *   uriTemplate: "users://{userId}/profile",
 *   title: "User Profile",
 *   description: "Profile data for a specific user",
 *   mimeType: "application/json",
 *   load: async (uri, { userId }) => JSON.stringify(await userService.getProfile(userId)),
 * });
 *
 * @example
 * // Expose an order invoice by order ID
 * dynamicResourceAdapter(server, {
 *   name: "order-invoice",
 *   uriTemplate: "orders://{orderId}/invoice",
 *   title: "Order Invoice",
 *   description: "Invoice details for a specific order",
 *   mimeType: "application/json",
 *   load: async (uri, { orderId }) => JSON.stringify(await orderService.getInvoice(orderId)),
 * });
 *
 * @example
 * // Expose a blog post by slug
 * dynamicResourceAdapter(server, {
 *   name: "blog-post",
 *   uriTemplate: "blog://{slug}",
 *   title: "Blog Post",
 *   description: "Markdown content for a blog post",
 *   mimeType: "text/markdown",
 *   load: async (uri, { slug }) => await blogService.getPostMarkdown(slug),
 * });
 */
export function dynamicResourceAdapter(
  server: McpServer,
  config: DynamicResourceConfig,
): void {
  server.registerResource(
    config.name,
    new ResourceTemplate(config.uriTemplate, { list: undefined }),
    {
      title: config.title,
      description: config.description,
      mimeType: config.mimeType ?? "text/plain",
    },
    async (uri, params) => ({
      contents: [
        {
          uri: uri.href,
          text: await config.load(uri, params as Record<string, string>),
          mimeType: config.mimeType ?? "text/plain",
        },
      ],
    }),
  );
}