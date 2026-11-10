import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { matchPath } from "./http.ts";

describe("matchPath", () => {
  it("extracts path params", () => {
    assert.deepEqual(matchPath("/session/{id}", "/session/abc-123"), {
      id: "abc-123",
    });
  });

  it("decodes URI components", () => {
    assert.deepEqual(matchPath("/help/{operationId}", "/help/create%5Fsession"), {
      operationId: "create_session",
    });
  });

  it("returns null on segment mismatch", () => {
    assert.equal(matchPath("/profiles/{id}", "/session/x"), null);
  });

  it("returns null on length mismatch", () => {
    assert.equal(matchPath("/session/{id}", "/session/a/extra"), null);
  });
});
