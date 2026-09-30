import { useId, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type { JsonSchemaObject } from "@geektastic/shared";
import { api, ApiError } from "../api/client";
import { buildInput, exampleValue, formFields, initialValues, mcpCallJson, type FormField } from "../toolForm";

interface InvokeResponse {
  result: { content: Array<{ type: string; text: string }>; isError?: boolean };
}

const fieldClass = "w-full rounded-md border bg-slate-950 px-3 py-2 text-sm text-white";
const smallButton = "rounded-md bg-slate-800 px-2.5 py-1 text-xs text-slate-200 hover:bg-slate-700";

/**
 * Input form + Run button + result for one tool, via POST /api/playground/invoke —
 * the same handler path MCP clients hit, so the call is logged like theirs.
 * Shared by the Testing Playground and the tool side panel. Give it a `key`
 * per tool so the form resets when the tool changes.
 */
export function ToolRunner({
  connectionId,
  toolName,
  inputSchema,
  onRan,
}: {
  connectionId: string;
  toolName: string;
  inputSchema: JsonSchemaObject;
  onRan?: () => void;
}) {
  const fields = useMemo(() => formFields(inputSchema), [inputSchema]);
  const [values, setValues] = useState<Record<string, string>>(() => initialValues(fields));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showRequest, setShowRequest] = useState(false);
  const idPrefix = useId();

  const invokeMutation = useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      api.post<InvokeResponse>("/api/playground/invoke", { connectionId, toolName, input }),
    onSettled: () => onRan?.(),
  });

  const setValue = (field: string, value: string) => {
    setValues((v) => ({ ...v, [field]: value }));
    setErrors((e) => {
      const rest = { ...e };
      delete rest[field];
      return rest;
    });
  };

  function onRun() {
    const { input, errors: found } = buildInput(fields, values);
    setErrors(found);
    if (Object.keys(found).length === 0) invokeMutation.mutate(input);
  }

  const request = mcpCallJson(toolName, buildInput(fields, values).input);
  const resultText = invokeMutation.data?.result.content.map((c) => c.text).join("\n");

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {fields.length === 0 && <p className="text-sm text-slate-500">This tool takes no inputs.</p>}
        {fields.map((field) => (
          <Field
            key={field.name}
            id={`${idPrefix}-${field.name}`}
            field={field}
            value={values[field.name] ?? ""}
            error={errors[field.name]}
            onChange={(value) => setValue(field.name, value)}
          />
        ))}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onRun}
            disabled={invokeMutation.isPending}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            {invokeMutation.isPending ? "Running..." : "Run tool"}
          </button>
          <button
            type="button"
            onClick={() => setShowRequest((s) => !s)}
            aria-expanded={showRequest}
            className="rounded-md px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
          >
            {showRequest ? "Hide MCP request" : "Show MCP request"}
          </button>
        </div>
        {Object.keys(errors).length > 0 && (
          <p className="text-sm text-red-400">Fix the highlighted fields to run this tool.</p>
        )}
      </div>

      {showRequest && (
        <div>
          <div className="mb-2 flex items-center gap-2">
            <h3 className="text-sm font-medium text-white">MCP request</h3>
            <CopyButton text={request} label="Copy request" />
          </div>
          <p className="mb-2 text-xs text-slate-500">
            The <code>tools/call</code> an MCP client would send with these inputs.
          </p>
          <pre className="max-h-64 overflow-auto rounded-md border border-slate-800 bg-slate-900 p-3 text-xs text-slate-300">
            {request}
          </pre>
        </div>
      )}

      {invokeMutation.isError && (
        <div className="rounded-md bg-red-950 px-3 py-2 text-sm text-red-300">
          {invokeMutation.error instanceof ApiError ? invokeMutation.error.message : "Tool call failed"}
        </div>
      )}

      {invokeMutation.data && resultText !== undefined && (
        <div>
          <div className="mb-2 flex items-center gap-2">
            <h3 className="text-sm font-medium text-white">
              {invokeMutation.data.result.isError ? "Result (error)" : "Result"}
            </h3>
            <CopyButton text={resultText} label="Copy result" />
          </div>
          <pre
            className={`max-h-96 overflow-auto rounded-md border p-4 text-xs ${
              invokeMutation.data.result.isError
                ? "border-red-900 bg-red-950 text-red-300"
                : "border-slate-800 bg-slate-900 text-slate-200"
            }`}
          >
            {prettyJson(resultText)}
          </pre>
        </div>
      )}
    </div>
  );
}

/** Pretty-prints results that are JSON; leaves anything else as-is. */
function prettyJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

function Field({
  id,
  field,
  value,
  error,
  onChange,
}: {
  id: string;
  field: FormField;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  const border = error ? "border-red-600" : "border-slate-700";
  const describedBy = `${id}-help`;
  const typeHint = field.kind === "json" ? "JSON" : field.kind === "enum" ? "choice" : field.kind;

  let control;
  if (field.kind === "boolean" && field.required) {
    control = (
      <input
        id={id}
        type="checkbox"
        checked={value === "true"}
        onChange={(e) => onChange(e.target.checked ? "true" : "false")}
        aria-describedby={describedBy}
        className="h-4 w-4 cursor-pointer accent-indigo-500"
      />
    );
  } else if (field.kind === "boolean" || field.kind === "enum") {
    const options = field.kind === "boolean" ? ["true", "false"] : (field.options ?? []);
    control = (
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={describedBy}
        aria-invalid={!!error}
        className={`${fieldClass} ${border}`}
      >
        <option value="">{field.required ? "Choose..." : "(not set)"}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  } else if (field.kind === "json") {
    const reference = JSON.stringify(exampleValue(field.spec, "all"), null, 2);
    const example = JSON.stringify(exampleValue(field.spec, "required"), null, 2);
    control = (
      <>
        <textarea
          id={id}
          rows={Math.min(12, Math.max(4, (value || reference).split("\n").length))}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={reference}
          aria-describedby={describedBy}
          aria-invalid={!!error}
          spellCheck={false}
          className={`${fieldClass} ${border} font-mono text-xs placeholder:text-slate-600`}
        />
        {value.trim() === "" && example !== "null" && (
          <button
            type="button"
            onClick={() => onChange(example)}
            title="Fills in only the required fields. The grey text above shows every field you can add."
            className={`${smallButton} mt-1`}
          >
            Insert required fields
          </button>
        )}
      </>
    );
  } else {
    control = (
      <input
        id={id}
        type={field.kind === "string" ? "text" : "number"}
        step={field.kind === "integer" ? 1 : "any"}
        inputMode={field.kind === "integer" ? "numeric" : field.kind === "number" ? "decimal" : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={describedBy}
        aria-invalid={!!error}
        className={`${fieldClass} ${border}`}
      />
    );
  }

  return (
    <div>
      <label htmlFor={id} className="mb-1 flex flex-wrap items-baseline gap-x-2 text-sm text-slate-300">
        <span>{field.name}</span>
        {field.required && <span className="text-red-400">*</span>}
        <span className="text-xs text-slate-500">{typeHint}</span>
      </label>
      {control}
      <div id={describedBy}>
        {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
        {field.description && <p className="mt-1 text-xs text-slate-500">{field.description}</p>}
      </div>
    </div>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <button
      type="button"
      className={smallButton}
      onClick={() => {
        // navigator.clipboard is missing outside secure contexts (plain http on a LAN address).
        const copy = navigator.clipboard?.writeText(text) ?? Promise.reject(new Error("Clipboard unavailable"));
        copy
          .then(() => setState("copied"))
          .catch(() => setState("failed"))
          .finally(() => setTimeout(() => setState("idle"), 2500));
      }}
    >
      {state === "copied" ? "Copied" : state === "failed" ? "Couldn't copy — select the text instead" : label}
    </button>
  );
}
