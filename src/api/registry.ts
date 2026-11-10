/** Single source of truth for progressive help + OpenAPI-ish catalog. */

export const SERVICE = {
  name: "tgbrowser",
  version: "0.1.0",
  description: "Self-hosted browser infrastructure (Browserless Session–shaped).",
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
    path: "/",
    summary: "Service metadata and docs entrypoints.",
    description:
      "Returns service name, version, and links to the help catalog and OpenAPI document.",
    responses: {
      "200": {
        description: "Service info",
        example: {
          name: "tgbrowser",
          version: "0.1.0",
          docs: { catalog: "/help", openapi: "/openapi.json" },
        },
      },
    },
    related: ["list_help"],
  },
  {
    operationId: "list_help",
    method: "GET",
    path: "/help",
    summary: "List all operations (catalog).",
    description:
      "Progressive disclosure level 1: operation list with one-line summaries. Fetch detail via /help/{operationId}.",
    responses: {
      "200": { description: "Catalog of operations" },
    },
    related: ["get_help_operation"],
  },
  {
    operationId: "get_help_operation",
    method: "GET",
    path: "/help/{operationId}",
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
    path: "/openapi.json",
    summary: "Full OpenAPI document (escape hatch).",
    description:
      "Machine-complete schema for codegen. Prefer /help for human/agent discovery.",
    responses: { "200": { description: "OpenAPI 3.0 JSON" } },
    related: ["list_help"],
  },
  {
    operationId: "create_profile",
    method: "POST",
    path: "/profiles",
    summary: "Create a durable browser profile directory.",
    description:
      "Creates /data/profiles/{id} used as Chrome user-data-dir. Id must match ^[a-z0-9][a-z0-9_-]{1,63}$. tgbrowser extension beyond core Browserless Session.",
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
    related: ["list_profiles", "create_session"],
  },
  {
    operationId: "list_profiles",
    method: "GET",
    path: "/profiles",
    summary: "List saved profiles.",
    description: "Returns all profiles on disk.",
    responses: { "200": { description: "Profile list" } },
    related: ["get_profile", "create_profile"],
  },
  {
    operationId: "get_profile",
    method: "GET",
    path: "/profiles/{profile_id}",
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
    path: "/profiles/{profile_id}",
    summary: "Delete profile data from disk.",
    description: "Destructive. Fails with 409 if a session is still active for this profile.",
    responses: {
      "204": { description: "Deleted" },
      "404": { description: "Not found" },
      "409": { description: "Profile in use" },
    },
    related: ["get_profile"],
  },
  {
    operationId: "create_session",
    method: "POST",
    path: "/session",
    summary: "Create a browser session; returns connect and stop URLs.",
    description:
      "Starts an isolated Chromium. Connect with Patchright/Playwright connectOverCDP(connect) or Puppeteer browserWSEndpoint. Closing CDP does not stop the session; DELETE the stop URL. Optional profileId is a tgbrowser extension.",
    requestBody: {
      contentType: "application/json",
      schema: {
        type: "object",
        required: ["ttl"],
        properties: {
          ttl: {
            type: "integer",
            minimum: 1000,
            maximum: 14_400_000,
            description: "Session lifetime in milliseconds.",
          },
          profileId: { type: ["string", "null"], description: "Existing profile id." },
          browserScreenWidth: { type: ["integer", "null"] },
          browserScreenHeight: { type: ["integer", "null"] },
          engine: { type: "string", default: "stock", enum: ["stock"] },
        },
      },
      example: { ttl: 3_600_000, profileId: "device-a" },
    },
    responses: {
      "201": { description: "Session started" },
      "404": { description: "profileId not found" },
      "409": { description: "profile already has an active session" },
      "422": { description: "Validation error" },
    },
    related: ["get_session", "stop_session", "create_profile"],
  },
  {
    operationId: "list_sessions",
    method: "GET",
    path: "/session",
    summary: "List browser sessions.",
    description: "Optional filterBy=active|stopped. Supports pageNumber and pageSize.",
    responses: { "200": { description: "Paginated session list" } },
    related: ["get_session"],
  },
  {
    operationId: "get_session",
    method: "GET",
    path: "/session/{id}",
    summary: "Get session status and connection URLs.",
    description: "Includes connect, stop, and live while status is active.",
    responses: {
      "200": { description: "Session" },
      "404": { description: "Not found" },
    },
    related: ["stop_session"],
  },
  {
    operationId: "stop_session",
    method: "DELETE",
    path: "/session/{id}",
    summary: "Stop a browser session.",
    description:
      "Terminates the browser container. CDP disconnect alone does not stop the session. Prefer the absolute stop URL from create when a token is required.",
    responses: {
      "200": { description: "Stopped session" },
      "404": { description: "Not found" },
    },
    related: ["get_session"],
  },
];

export function getOperation(operationId: string): Operation | null {
  return OPERATIONS.find((op) => op.operationId === operationId) ?? null;
}

export function catalogPayload() {
  return {
    description: "Operation catalog. Fetch detail via /help/{operationId}.",
    operations: OPERATIONS.map((op) => ({
      operationId: op.operationId,
      method: op.method,
      path: op.path,
      summary: op.summary,
      detail: `/help/${op.operationId}`,
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

function tagForPath(path: string): string {
  if (path.startsWith("/profiles")) return "Profiles";
  if (path.startsWith("/session")) return "Sessions";
  return "Meta";
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
      tags: [tagForPath(op.path)],
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

  paths["/help/{operationId}"] = {
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
