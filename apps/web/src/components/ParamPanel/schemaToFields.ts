// Pure schema -> field descriptor mapper used by ParamPanel (feat-007).
//
// Reads a JSON-Schema-like object produced by the AI's
// DEFINE_GENERATED_OBJECT_TOOL call, and projects each property into a
// discriminated union of render-ready field descriptors. The UI layer
// then maps each descriptor.kind to an input component.
//
// Intentionally small: we only handle the shapes the existing
// objectPrompt.ts encourages the AI to emit. Unknown shapes fall through
// to `kind: "unknown"` so the UI shows a read-only JSON dump rather than
// crashing.

export type FieldDescriptor =
  | {
      kind: "color";
      key: string;
      label: string;
      value: string;
    }
  | {
      kind: "number";
      key: string;
      label: string;
      value: number;
      min?: number;
      max?: number;
      step?: number;
    }
  | {
      kind: "select";
      key: string;
      label: string;
      value: string;
      options: readonly string[];
    }
  | {
      kind: "boolean";
      key: string;
      label: string;
      value: boolean;
    }
  | {
      kind: "text";
      key: string;
      label: string;
      value: string;
    }
  | {
      kind: "vector";
      key: string;
      label: string;
      value: { x: number; y: number };
    }
  | {
      kind: "unknown";
      key: string;
      label: string;
      value: unknown;
    };

interface RawProperty {
  type?: unknown;
  format?: unknown;
  enum?: unknown;
  minimum?: unknown;
  maximum?: unknown;
  multipleOf?: unknown;
  title?: unknown;
  description?: unknown;
  default?: unknown;
  properties?: unknown;
}

export function schemaToFields(
  schema: unknown,
  params: Record<string, unknown> | null | undefined,
): readonly FieldDescriptor[] {
  if (!isPlainObject(schema)) return [];
  const propertiesRaw = (schema as { properties?: unknown }).properties;
  if (!isPlainObject(propertiesRaw)) return [];

  const properties = propertiesRaw as Record<string, unknown>;
  const out: FieldDescriptor[] = [];
  for (const [key, propUnknown] of Object.entries(properties)) {
    if (!isPlainObject(propUnknown)) continue;
    const prop = propUnknown as RawProperty;
    const label =
      typeof prop.title === "string" && prop.title.length > 0
        ? prop.title
        : key;
    const provided =
      params && Object.prototype.hasOwnProperty.call(params, key)
        ? (params as Record<string, unknown>)[key]
        : undefined;
    out.push(buildField(key, label, prop, provided));
  }
  return out;
}

function buildField(
  key: string,
  label: string,
  prop: RawProperty,
  provided: unknown,
): FieldDescriptor {
  // enum -> select. The first option wins as the default.
  if (Array.isArray(prop.enum) && prop.enum.length > 0) {
    const options = prop.enum
      .filter((v): v is string => typeof v === "string");
    if (options.length > 0) {
      const value =
        typeof provided === "string" && options.includes(provided)
          ? provided
          : typeof prop.default === "string" && options.includes(prop.default)
            ? prop.default
            : options[0];
      return { kind: "select", key, label, value, options };
    }
  }

  if (prop.type === "string") {
    if (prop.format === "color") {
      const value =
        typeof provided === "string"
          ? provided
          : typeof prop.default === "string"
            ? prop.default
            : "#3b82f6";
      return { kind: "color", key, label, value };
    }
    const value =
      typeof provided === "string"
        ? provided
        : typeof prop.default === "string"
          ? prop.default
          : "";
    return { kind: "text", key, label, value };
  }

  if (prop.type === "number" || prop.type === "integer") {
    const value =
      typeof provided === "number" && Number.isFinite(provided)
        ? provided
        : typeof prop.default === "number" && Number.isFinite(prop.default)
          ? prop.default
          : 0;
    const min = typeof prop.minimum === "number" ? prop.minimum : undefined;
    const max = typeof prop.maximum === "number" ? prop.maximum : undefined;
    const step =
      typeof prop.multipleOf === "number"
        ? prop.multipleOf
        : prop.type === "integer"
          ? 1
          : undefined;
    return { kind: "number", key, label, value, min, max, step };
  }

  if (prop.type === "boolean") {
    const value =
      typeof provided === "boolean"
        ? provided
        : typeof prop.default === "boolean"
          ? prop.default
          : false;
    return { kind: "boolean", key, label, value };
  }

  if (prop.type === "object" && isVectorShape(prop)) {
    const vec =
      isVectorValue(provided)
        ? provided
        : isVectorValue(prop.default)
          ? prop.default
          : { x: 0, y: 0 };
    return { kind: "vector", key, label, value: vec };
  }

  return { kind: "unknown", key, label, value: provided ?? prop.default ?? null };
}

function isVectorShape(prop: RawProperty): boolean {
  if (!isPlainObject(prop.properties)) return false;
  const subs = prop.properties as Record<string, unknown>;
  const xt = isPlainObject(subs.x) ? (subs.x as RawProperty).type : undefined;
  const yt = isPlainObject(subs.y) ? (subs.y as RawProperty).type : undefined;
  return (
    (xt === "number" || xt === "integer") &&
    (yt === "number" || yt === "integer")
  );
}

function isVectorValue(v: unknown): v is { x: number; y: number } {
  return (
    isPlainObject(v) &&
    typeof (v as { x?: unknown }).x === "number" &&
    typeof (v as { y?: unknown }).y === "number"
  );
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
