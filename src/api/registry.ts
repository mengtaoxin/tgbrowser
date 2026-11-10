/** Single source of truth for progressive help + OpenAPI-ish catalog. */

export const SERVICE = {
  name: "tgbrowser",
  version: "0.1.0",
  description: "Self-hosted browser infrastructure (Browser Use–shaped).",
} as const;

export interface OperationResponseMeta {
  description: string;
  example?: unknown;
}

export interface OperationRequestBody {
  contentType: string;
  schema: Record<string, unknown>;
  example?: unknown;
}

export interface Operation {
  operationId: string;
  method: string;
  path: string;
  summary: string;
  description: string;
  requestBody?: OperationRequestBody;
  responses?: Record<string, OperationResponseMeta>;
  related?: string[];
}

export const OPERATIONS: Operation[] = [
  {
    operationId: "get_service",
    method: "GET",
    path: "/api/v1",
    summary: "Service metadata and docs entrypoints.",
    description:
      "Returns service name, version, and links to the help catalog and OpenAPI document.",
    responses: {
      "200": {
        description: "Service info",
        example: {
          name: "tgbrowser",
          version: "0.1.0",
          docs: { catalog: "/api/v1/help", openapi: "/api/v1/openapi.json" },
        },
      },
    },
    related: ["list_help"],
  },
  {
    operationId: "list_help",
    method: "GET",
    path: "/api/v1/help",
    summary: "List all operations (catalog).",
    description:
      "Progressive disclosure level 1: operation list with one-line summaries. Fetch detail via /api/v1/help/{operationId}.",
    responses: {
      "200": { description: "Catalog of operations" },
    },
    related: ["get_help_operation"],
  },
  {
    operationId: "get_help_operation",
    method: "GET",
    path: "/api/v1/help/{operationId}",
    summary: "Detailed docs for one operation.",
    description:
      "Progressive disclosure level 2: full description, request schema, examples, and errors for a single operationId.",
    responses: {
      "200": { description: "Operation detail" },
      "404": { description: "Unknown operationId" },
    },
    related: ["list_help"],
  },
  {
    operationId: "get_openapi",
    method: "GET",
    path: "/api/v1/openapi.json",
    summary: "Full OpenAPI document (escape hatch).",
    description:
      "Machine-complete schema for codegen. Prefer /help for human/agent discovery.",
    responses: { "200": { description: "OpenAPI 3.0 JSON" } },
    related: ["list_help"],
  },
  {
    operationId: "create_profile",
    method: "POST",
    path: "/api/v1/profiles",
    summary: "Create a durable browser profile directory.",
    description:
      "Creates /data/profiles/{id} used as Chrome user-data-dir. Id must match ^[a-z0-9][a-z0-9_-]{1,63}$.",
    requestBody: {
      contentType: "application/json",
      schema: {
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string", description: "Stable profile id (directory name)." },
          name: { type: ["string", "null"], description: "Optional display name." },
        },
      },
      example: { id: "device-a", name: "Device A" },
    },
    responses: {
      "201": { description: "Profile created" },
      "409": { description: "Profile already exists" },
      "422": { description: "Invalid id" },
    },
    related: ["list_profiles", "create_browser_session"],
  },
  {
    operationId: "list_profiles",
    method: "GET",
    path: "/api/v1/profiles",
    summary: "List saved profiles.",
    description: "Returns all profiles on disk.",
    responses: { "200": { description: "Profile list" } },
    related: ["get_profile", "create_profile"],
  },
  {
    operationId: "get_profile",
    method: "GET",
    path: "/api/v1/profiles/{profile_id}",
    summary: "Get one profile.",
    description: "Returns metadata for a single profile.",
    responses: {
      "200": { description: "Profile" },
      "404": { description: "Not found" },
    },
    related: ["list_profiles", "delete_profile"],
  },
  {
    operationId: "delete_profile",
    method: "DELETE",
    path: "/api/v1/profiles/{profile_id}",
    summary: "Delete profile data from disk.",
    description: "Destructive. Fails with 409 if a browser is still active for this profile.",
    responses: {
      "204": { description: "Deleted" },
      "404": { description: "Not found" },
      "409": { description: "Profile in use" },
    },
    related: ["get_profile"],
  },
  {
    operationId: "create_browser_session",
    method: "POST",
    path: "/api/v1/browsers",
    summary: "Start a browser; returns cdpUrl and liveUrl.",
    description:
      "Starts an isolated Chromium bound to an optional profileId. Connect with Patchright/Playwright connectOverCDP(cdpUrl). Closing CDP does not stop the browser; PATCH with action=stop.",
    requestBody: {
      contentType: "application/json",
      schema: {
        type: "object",
        properties: {
          profileId: { type: ["string", "null"], description: "Existing profile id." },
          timeout: { type: "integer", minimum: 1, maximum: 240, default: 60 },
          browserScreenWidth: { type: ["integer", "null"] },
          browserScreenHeight: { type: ["integer", "null"] },
          engine: { type: "string", default: "stock", enum: ["stock"] },
        },
      },
      example: { profileId: "device-a", timeout: 60 },
    },
    responses: {
      "201": { description: "Browser started" },
      "404": { description: "profileId not found" },
      "409": { description: "profile already has an active browser" },
      "422": { description: "Validation error" },
    },
    related: ["get_browser_session", "update_browser_session", "create_profile"],
  },
  {
    operationId: "list_browser_sessions",
    method: "GET",
    path: "/api/v1/browsers",
    summary: "List browser sessions.",
    description: "Optional filterBy=active|stopped. Supports pageNumber and pageSize.",
    responses: { "200": { description: "Paginated browser list" } },
    related: ["get_browser_session"],
  },
  {
    operationId: "get_browser_session",
    method: "GET",
    path: "/api/v1/browsers/{id}",
    summary: "Get session status and connection URLs.",
    description: "Includes cdpUrl and liveUrl while status is active.",
    responses: {
      "200": { description: "Browser session" },
      "404": { description: "Not found" },
    },
    related: ["update_browser_session"],
  },
  {
    operationId: "update_browser_session",
    method: "PATCH",
    path: "/api/v1/browsers/{id}",
    summary: "Stop (or later update) a browser session.",
    description:
      'v1 supports { "action": "stop" } only. CDP disconnect alone does not stop the browser.',
    requestBody: {
      contentType: "application/json",
      schema: {
        type: "object",
        required: ["action"],
        properties: {
          action: { type: "string", enum: ["stop"] },
        },
      },
      example: { action: "stop" },
    },
    responses: {
      "200": { description: "Updated session" },
      "404": { description: "Not found" },
      "422": { description: "Unsupported action" },
    },
    related: ["get_browser_session"],
  },
];

export function getOperation(operationId: string): Operation | null {
  return OPERATIONS.find((op) => op.operationId === operationId) ?? null;
}

export function catalogPayload() {
  return {
    description: "Operation catalog. Fetch detail via /api/v1/help/{operationId}.",
    operations: OPERATIONS.map((op) => ({
      operationId: op.operationId,
      method: op.method,
      path: op.path,
      summary: op.summary,
      detail: `/api/v1/help/${op.operationId}`,
    })),
  };
}

export function detailPayload(operationId: string) {
  const op = getOperation(operationId);
  if (!op) return null;
  return {
    operationId: op.operationId,
    method: op.method,
    path: op.path,
    summary: op.summary,
    description: op.description,
    requestBody: op.requestBody ?? null,
    responses: op.responses ?? {},
    related: op.related ?? [],
  };
}

export function openApiDocument() {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const op of OPERATIONS) {
    if (op.path.includes("{operationId}")) continue;
    const pathKey = op.path.replace(/\{([^}]+)\}/g, "{$1}");
    paths[pathKey] ??= {};
    paths[pathKey][op.method.toLowerCase()] = {
      operationId: op.operationId,
      summary: op.summary,
      description: op.description,
      tags: [
        op.path.startsWith("/api/v1/profiles")
          ? "Profiles"
          : op.path.includes("/browsers")
            ? "Browsers"
            : "Meta",
      ],
      ...(op.requestBody
        ? {
            requestBody: {
              required: true,
              content: {
                [op.requestBody.contentType]: {
                  schema: op.requestBody.schema,
                  example: op.requestBody.example,
                },
              },
            },
          }
        : {}),
      responses: Object.fromEntries(
        Object.entries(op.responses ?? {}).map(([code, meta]) => [
          code,
          { description: meta.description ?? String(code) },
        ]),
      ),
    };
  }

  paths["/api/v1/help/{operationId}"] = {
    get: {
      operationId: "get_help_operation",
      summary: "Detailed docs for one operation.",
      description: getOperation("get_help_operation")?.description,
      parameters: [
        {
          name: "operationId",
          in: "path",
          required: true,
          schema: { type: "string" },
        },
      ],
      responses: {
        "200": { description: "Operation detail" },
        "404": { description: "Unknown operationId" },
      },
    },
  };

  return {
    openapi: "3.0.3",
    info: {
      title: SERVICE.name,
      version: SERVICE.version,
      description: SERVICE.description,
    },
    servers: [{ url: "http://127.0.0.1:7800" }],
    paths,
  };
}
