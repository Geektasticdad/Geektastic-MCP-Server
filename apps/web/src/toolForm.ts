import type { JsonSchemaObject, JsonSchemaProperty } from "@geektastic/shared";

export type FieldKind = "string" | "number" | "integer" | "boolean" | "enum" | "json";

export interface FormField {
  name: string;
  kind: FieldKind;
  required: boolean;
  description?: string;
  /** Allowed values, for `enum` fields. */
  options?: string[];
  spec: JsonSchemaProperty;
}

/** The field's type, ignoring the `null` that marks it nullable. */
function baseSpec(spec: JsonSchemaProperty): JsonSchemaProperty {
  if (spec.anyOf) {
    const nonNull = spec.anyOf.find((s) => s.type !== "null");
    if (nonNull) return { ...nonNull, description: spec.description ?? nonNull.description, default: spec.default };
  }
  if (Array.isArray(spec.type)) return { ...spec, type: spec.type.find((t) => t !== "null") ?? "string" };
  return spec;
}

export function formFields(schema: JsonSchemaObject): FormField[] {
  const required = new Set(schema.required ?? []);
  return Object.entries(schema.properties ?? {}).map(([name, raw]) => {
    const spec = baseSpec(raw);
    const common = { name, required: required.has(name), description: raw.description ?? spec.description, spec };
    if (spec.enum) return { ...common, kind: "enum", options: spec.enum.map(String) };
    switch (spec.type) {
      case "string":
      case "number":
      case "integer":
      case "boolean":
        return { ...common, kind: spec.type };
      default:
        return { ...common, kind: "json" };
    }
  });
}

/** Starting values: each field's schema default, and "false" for required checkboxes. */
export function initialValues(fields: FormField[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (const f of fields) {
    if (f.spec.default !== undefined) {
      values[f.name] = f.kind === "json" ? JSON.stringify(f.spec.default, null, 2) : String(f.spec.default);
    } else if (f.kind === "boolean" && f.required) {
      values[f.name] = "false";
    }
  }
  return values;
}

/**
 * Turns the form's string values into the tool's input. Blank optional fields
 * are left out entirely rather than sent as "" — an empty string isn't "not
 * set" to most tools.
 */
export function buildInput(
  fields: FormField[],
  values: Record<string, string>,
): { input: Record<string, unknown>; errors: Record<string, string> } {
  const input: Record<string, unknown> = {};
  const errors: Record<string, string> = {};
  for (const f of fields) {
    const raw = (values[f.name] ?? "").trim() === "" ? "" : (values[f.name] ?? "");
    if (raw === "") {
      if (f.required) errors[f.name] = "Required";
      continue;
    }
    switch (f.kind) {
      case "json":
        try {
          input[f.name] = JSON.parse(raw);
        } catch {
          errors[f.name] = "Must be valid JSON";
        }
        break;
      case "number":
      case "integer": {
        const n = Number(raw);
        if (Number.isNaN(n)) errors[f.name] = "Must be a number";
        else if (f.kind === "integer" && !Number.isInteger(n)) errors[f.name] = "Must be a whole number";
        else input[f.name] = n;
        break;
      }
      case "boolean":
        input[f.name] = raw === "true";
        break;
      default:
        input[f.name] = raw;
    }
  }
  return { input, errors };
}

/**
 * A skeleton value for a JSON field, to show the shape it expects: enums as
 * their first value, one item for arrays, and for objects either only the
 * required fields (`"required"`, safe to send to an update tool) or every
 * field of the top-level object (`"all"`, a reference — sending blank values
 * to an update tool would overwrite real data). Nested objects always list
 * their required fields, or all of them when none are required.
 */
export function exampleValue(spec: JsonSchemaProperty, fields: "required" | "all" = "required", depth = 0): unknown {
  const s = baseSpec(spec);
  if (s.default !== undefined) return s.default;
  if (s.enum?.length) return s.enum[0];
  switch (s.type) {
    case "string":
      return "";
    case "number":
    case "integer":
      return 0;
    case "boolean":
      return false;
    case "array":
      return depth > 3 || !s.items ? [] : [exampleValue(s.items, "required", depth + 1)];
    case "object": {
      if (depth > 3 || !s.properties) return {};
      const required = new Set(s.required ?? []);
      const everything = required.size === 0 || (fields === "all" && depth === 0);
      const names = Object.keys(s.properties).filter((n) => everything || required.has(n));
      return Object.fromEntries(names.map((n) => [n, exampleValue(s.properties![n], "required", depth + 1)]));
    }
    default:
      return null;
  }
}

/** The JSON-RPC request an MCP client would send for this call. */
export function mcpCallJson(toolName: string, input: Record<string, unknown>): string {
  return JSON.stringify(
    { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: toolName, arguments: input } },
    null,
    2,
  );
}
