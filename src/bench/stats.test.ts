import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { percentile, summarize } from "./stats.ts";

describe("percentile", () => {
  it("returns null for empty samples", () => {
    assert.equal(percentile([], 50), null);
  });

  it("computes median and high percentiles on sorted values", () => {
    const samples = [10, 20, 30, 40, 50];
    assert.equal(percentile(samples, 0), 10);
    assert.equal(percentile(samples, 50), 30);
    assert.equal(percentile(samples, 100), 50);
  });
});

describe("summarize", () => {
  it("aggregates count, mean, and percentiles", () => {
    const summary = summarize([100, 200, 300, 400]);
    assert.equal(summary.count, 4);
    assert.equal(summary.mean, 250);
    assert.equal(summary.p50, 200);
    assert.equal(summary.p95, 400);
    assert.equal(summary.min, 100);
    assert.equal(summary.max, 400);
  });
});
