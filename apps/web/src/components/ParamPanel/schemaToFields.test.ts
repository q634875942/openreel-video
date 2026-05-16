import { describe, it, expect } from "vitest";
import { schemaToFields, type FieldDescriptor } from "./schemaToFields";

describe("schemaToFields", () => {
  it("returns [] for non-object schema", () => {
    expect(schemaToFields(null, {})).toEqual([]);
    expect(schemaToFields("not a schema", {})).toEqual([]);
    expect(schemaToFields(42, {})).toEqual([]);
  });

  it("returns [] when properties is missing or wrong type", () => {
    expect(schemaToFields({}, {})).toEqual([]);
    expect(schemaToFields({ properties: "nope" }, {})).toEqual([]);
  });

  it("maps {type: string, format: color} -> color, taking provided value", () => {
    const fields = schemaToFields(
      {
        type: "object",
        properties: {
          fill: { type: "string", format: "color", default: "#000" },
        },
      },
      { fill: "#ff0000" },
    );
    expect(fields).toEqual([
      { kind: "color", key: "fill", label: "fill", value: "#ff0000" },
    ]);
  });

  it("falls back to schema default then sensible blue for color", () => {
    const withDefault = schemaToFields(
      {
        type: "object",
        properties: { fill: { type: "string", format: "color", default: "#abc" } },
      },
      {},
    );
    expect(withDefault[0]).toMatchObject({
      kind: "color",
      key: "fill",
      value: "#abc",
    });

    const noDefault = schemaToFields(
      {
        type: "object",
        properties: { fill: { type: "string", format: "color" } },
      },
      {},
    );
    expect(noDefault[0]).toMatchObject({ kind: "color", value: "#3b82f6" });
  });

  it("maps {type: number} -> number, carrying min/max/step + provided", () => {
    const fields = schemaToFields(
      {
        type: "object",
        properties: {
          radius: {
            type: "number",
            minimum: 0,
            maximum: 1,
            multipleOf: 0.01,
            title: "Radius",
          },
        },
      },
      { radius: 0.42 },
    );
    expect(fields[0]).toEqual({
      kind: "number",
      key: "radius",
      label: "Radius",
      value: 0.42,
      min: 0,
      max: 1,
      step: 0.01,
    });
  });

  it("integer gets step=1 by default", () => {
    const fields = schemaToFields(
      {
        type: "object",
        properties: { count: { type: "integer", minimum: 1, maximum: 10 } },
      },
      {},
    );
    expect(fields[0]).toMatchObject({
      kind: "number",
      step: 1,
      min: 1,
      max: 10,
      value: 0,
    });
  });

  it("maps enum -> select with provided / default / first-option fallback", () => {
    const schema = {
      type: "object",
      properties: {
        style: { type: "string", enum: ["solid", "dashed", "dotted"] },
      },
    };
    expect(
      schemaToFields(schema, { style: "dashed" })[0],
    ).toMatchObject({ kind: "select", value: "dashed", options: ["solid", "dashed", "dotted"] });

    expect(
      schemaToFields(
        { ...schema, properties: { style: { ...schema.properties.style, default: "dotted" } } },
        {},
      )[0],
    ).toMatchObject({ kind: "select", value: "dotted" });

    expect(schemaToFields(schema, {})[0]).toMatchObject({
      kind: "select",
      value: "solid",
    });
  });

  it("ignores invalid (non-string) enum entries", () => {
    const fields = schemaToFields(
      {
        type: "object",
        properties: {
          style: { type: "string", enum: [42, true] },
        },
      },
      {},
    );
    // No valid string options -> falls back to plain text kind.
    expect(fields[0].kind).toBe("text");
  });

  it("maps {type: string} (no format/enum) -> text", () => {
    const fields = schemaToFields(
      {
        type: "object",
        properties: { caption: { type: "string", default: "Hello" } },
      },
      { caption: "Hi" },
    );
    expect(fields[0]).toEqual({
      kind: "text",
      key: "caption",
      label: "caption",
      value: "Hi",
    });
  });

  it("maps {type: boolean} -> boolean", () => {
    const fields = schemaToFields(
      {
        type: "object",
        properties: {
          loop: { type: "boolean", default: true },
        },
      },
      { loop: false },
    );
    expect(fields[0]).toEqual({
      kind: "boolean",
      key: "loop",
      label: "loop",
      value: false,
    });
  });

  it("maps a 2D vector object -> vector", () => {
    const fields = schemaToFields(
      {
        type: "object",
        properties: {
          offset: {
            type: "object",
            properties: {
              x: { type: "number" },
              y: { type: "number" },
            },
          },
        },
      },
      { offset: { x: 0.1, y: -0.2 } },
    );
    expect(fields[0]).toEqual({
      kind: "vector",
      key: "offset",
      label: "offset",
      value: { x: 0.1, y: -0.2 },
    });
  });

  it("falls back to default vector when params is missing the key", () => {
    const fields = schemaToFields(
      {
        type: "object",
        properties: {
          offset: {
            type: "object",
            default: { x: 0.5, y: 0.5 },
            properties: {
              x: { type: "number" },
              y: { type: "number" },
            },
          },
        },
      },
      {},
    );
    expect(fields[0]).toMatchObject({ kind: "vector", value: { x: 0.5, y: 0.5 } });
  });

  it("unknown shape -> kind: unknown carries the raw value", () => {
    const fields = schemaToFields(
      {
        type: "object",
        properties: { weird: { type: "array" } },
      },
      { weird: [1, 2, 3] },
    );
    const f = fields[0] as Extract<FieldDescriptor, { kind: "unknown" }>;
    expect(f.kind).toBe("unknown");
    expect(f.value).toEqual([1, 2, 3]);
  });

  it("preserves property order from the schema", () => {
    const fields = schemaToFields(
      {
        type: "object",
        properties: {
          a: { type: "number" },
          b: { type: "string" },
          c: { type: "boolean" },
        },
      },
      {},
    );
    expect(fields.map((f) => f.key)).toEqual(["a", "b", "c"]);
  });

  it("uses title as label when provided", () => {
    const fields = schemaToFields(
      {
        type: "object",
        properties: { spd: { type: "number", title: "Speed" } },
      },
      {},
    );
    expect(fields[0].label).toBe("Speed");
  });
});
