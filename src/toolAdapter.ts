import { McpServer, ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ZodRawShapeCompat } from "@modelcontextprotocol/sdk/server/zod-compat.js";
import { CallToolResult, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";

/**
 * Adapter input for registering a tool that declares an input schema.
 * The generic parameter `T` is inferred from the `inputSchema` shape and
 * flows through to `cb`, ensuring the callback receives correctly-typed args.
 *
 * @template T - A Zod raw shape (e.g. `{ fen: z.ZodString }`) that defines the tool's input.
 */
interface ToolInputAdapterWithSchema<T extends ZodRawShapeCompat> {
  /** Unique tool name used to identify the tool in the MCP registry. */
  name: string;
  config: {
    /** Optional human-readable display title. */
    title?: string;
    /** Description of what the tool does, shown to the model. */
    description?: string;
    /** Zod shape defining the tool's input arguments. */
    inputSchema: T;
    /** Optional Zod shape defining the tool's structured output. */
    outputSchema?: ZodRawShapeCompat;
    /** Behavioural hints for the model (e.g. `openWorldHint`, `readOnlyHint`). */
    annotations?: ToolAnnotations;
    /** Arbitrary metadata attached to the tool registration. */
    _meta?: Record<string, unknown>;
  };
  /**
   * Tool handler callback. Receives parsed, type-safe args derived from `inputSchema`
   * plus a `RequestHandlerExtra` context object.
   */
  cb: ToolCallback<T>;
}

/**
 * Adapter input for registering a tool that takes no input arguments.
 * The callback receives only the `RequestHandlerExtra` context object.
 */
interface ToolInputAdapterWithoutSchema {
  /** Unique tool name used to identify the tool in the MCP registry. */
  name: string;
  config: {
    /** Optional human-readable display title. */
    title?: string;
    /** Description of what the tool does, shown to the model. */
    description?: string;
    inputSchema?: undefined;
    /** Optional Zod shape defining the tool's structured output. */
    outputSchema?: ZodRawShapeCompat;
    /** Behavioural hints for the model (e.g. `openWorldHint`, `readOnlyHint`). */
    annotations?: ToolAnnotations;
    /** Arbitrary metadata attached to the tool registration. */
    _meta?: Record<string, unknown>;
  };
  /**
   * Tool handler callback. Receives only a `RequestHandlerExtra` context object
   * since no input schema is defined.
   */
  cb: ToolCallback<undefined>;
}

/**
 * Normalizes a tool result into a standard `CallToolResult` text content block.
 *
 * If `error` is provided it is used as the text content; otherwise `data` is
 * serialized to a pretty-printed JSON string.
 *
 * @param data  - The successful result payload. Used when `error` is absent.
 * @param error - An error message string. Takes priority over `data` when present.
 * @returns A `CallToolResult` with a single `text` content block.
 *
 * @example
 * const { data, error } = await service.getData();
 * return toolContentAdapter(data ?? {}, error);
 */
export function toolContentAdapter(data: object, error: string | undefined): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text: error || JSON.stringify(data, null, 2),
      },
    ],
  };
}

/**
 * Registers a tool that declares an input schema on an MCP server.
 *
 * The generic `T` is inferred from `toolInputAdapter.config.inputSchema`, making
 * the callback args fully type-safe without manual annotation.
 *
 * @template T - Zod raw shape inferred from the provided `inputSchema`.
 * @param server           - The `McpServer` instance to register the tool on.
 * @param toolInputAdapter - Adapter object containing the tool name, config, and typed callback.
 */
export function toolAdapter<T extends ZodRawShapeCompat>(
  server: McpServer,
  toolInputAdapter: ToolInputAdapterWithSchema<T>,
): void;

/**
 * Registers a tool that takes no input arguments on an MCP server.
 *
 * @param server           - The `McpServer` instance to register the tool on.
 * @param toolInputAdapter - Adapter object containing the tool name, config, and no-arg callback.
 */
export function toolAdapter(
  server: McpServer,
  toolInputAdapter: ToolInputAdapterWithoutSchema,
): void;

export function toolAdapter<T extends ZodRawShapeCompat>(
  server: McpServer,
  toolInputAdapter: ToolInputAdapterWithSchema<T> | ToolInputAdapterWithoutSchema,
): void {
  if (toolInputAdapter.config.inputSchema) {
    server.registerTool(
      toolInputAdapter.name,
      toolInputAdapter.config as ToolInputAdapterWithSchema<T>["config"],
      toolInputAdapter.cb as ToolCallback<T>,
    );
  } else {
    server.registerTool(
      toolInputAdapter.name,
      toolInputAdapter.config as ToolInputAdapterWithoutSchema["config"],
      toolInputAdapter.cb as unknown as ToolCallback<ZodRawShapeCompat>,
    );
  }
}