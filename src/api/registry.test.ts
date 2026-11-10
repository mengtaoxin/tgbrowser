import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  catalogPayload,
  detailPayload,
  getOperation,
  openApiDocument,
} from "./registry.ts";

describe("registry", () => {
  it("lists every operation in the catalog", () => {
    const catalog = catalogPayload();
    assert.ok(catalog.operations.length >= 10);
    assert.ok(
      catalog.operations.every(
        (op) => op.operationId && op.method && op.path && op.detail.startsWith("/api/v1/help/"),
      ),
    );
  });

  it("returns detail for known operationIds and null for unknown", () => {
    const detail = detailPayload("create_browser_session");
    assert.ok(detail);
    assert.equal(detail?.operationId, "create_browser_session");
    assert.equal(detail?.method, "POST");
    assert.equal(detailPayload("does_not_exist"), null);
  });

  it("builds an OpenAPI document with paths", () => {
    const doc = openApiDocument();
    assert.equal(doc.openapi, "3.0.3");
    assert.ok(doc.paths["/api/v1/browsers"]);
    assert.ok(doc.paths["/api/v1/help/{operationId}"]);
    assert.equal(getOperation("list_help")?.path, "/api/v1/help");
  });
});
