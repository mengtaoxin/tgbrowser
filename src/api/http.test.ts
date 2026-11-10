import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { matchPath } from "./http.ts";

describe("matchPath", () => {
  it("extracts path params", () => {
    assert.deepEqual(matchPath("/api/v1/browsers/{id}", "/api/v1/browsers/abc-123"), {
      id: "abc-123",
    });
  });

  it("decodes URI components", () => {
    assert.deepEqual(
      matchPath("/api/v1/help/{operationId}", "/api/v1/help/create%5Fbrowser"),
      { operationId: "create_browser" },
    );
  });

  it("returns null on segment mismatch", () => {
    assert.equal(matchPath("/api/v1/profiles/{id}", "/api/v1/browsers/x"), null);
  });

  it("returns null on length mismatch", () => {
    assert.equal(matchPath("/api/v1/browsers/{id}", "/api/v1/browsers/a/extra"), null);
  });
});
