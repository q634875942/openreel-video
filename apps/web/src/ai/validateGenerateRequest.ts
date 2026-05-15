// validateGenerateRequest — defensive runtime shape check before sending a
// request to a provider. Catches accidentally-malformed requests early so
// providers see a clear error from us instead of a confusing 400 from the
// upstream API.
//
// Returns an array of human-readable error strings; empty array == valid.
// Does NOT validate JSON Schemas inside tools — that's a separate concern.

import type { GenerateRequest, ChatMessage, ContentPart } from "./types";

export function validateGenerateRequest(
  request: GenerateRequest,
): readonly string[] {
  const errors: string[] = [];

  if (!isNonEmptyString(request.model)) {
    errors.push("model must be a non-empty string");
  }

  if (!Array.isArray(request.messages)) {
    errors.push("messages must be an array");
  } else if (request.messages.length === 0) {
    errors.push("messages must contain at least one message");
  } else {
    request.messages.forEach((msg, i) => {
      const msgErrors = validateMessage(msg, i);
      errors.push(...msgErrors);
    });
  }

  if (request.tools !== undefined) {
    if (!Array.isArray(request.tools)) {
      errors.push("tools must be an array when provided");
    } else {
      const seen = new Set<string>();
      request.tools.forEach((tool, i) => {
        if (!isNonEmptyString(tool.name)) {
          errors.push(`tools[${i}].name must be a non-empty string`);
        } else if (seen.has(tool.name)) {
          errors.push(`tools[${i}].name "${tool.name}" duplicates an earlier tool`);
        } else {
          seen.add(tool.name);
        }
        if (typeof tool.description !== "string") {
          errors.push(`tools[${i}].description must be a string`);
        }
        if (
          tool.inputSchema === null ||
          typeof tool.inputSchema !== "object"
        ) {
          errors.push(`tools[${i}].inputSchema must be a JSON Schema object`);
        }
      });
    }
  }

  if (request.forceTool !== undefined) {
    if (!isNonEmptyString(request.forceTool)) {
      errors.push("forceTool must be a non-empty string when provided");
    } else if (
      Array.isArray(request.tools) &&
      !request.tools.some((t) => t.name === request.forceTool)
    ) {
      errors.push(
        `forceTool "${request.forceTool}" is not present in tools[]`,
      );
    } else if (!Array.isArray(request.tools) || request.tools.length === 0) {
      errors.push("forceTool requires tools[] to be non-empty");
    }
  }

  if (request.temperature !== undefined) {
    if (
      typeof request.temperature !== "number" ||
      Number.isNaN(request.temperature) ||
      request.temperature < 0 ||
      request.temperature > 2
    ) {
      errors.push("temperature must be a number in [0, 2]");
    }
  }

  if (request.maxTokens !== undefined) {
    if (
      typeof request.maxTokens !== "number" ||
      !Number.isInteger(request.maxTokens) ||
      request.maxTokens <= 0
    ) {
      errors.push("maxTokens must be a positive integer");
    }
  }

  return errors;
}

function validateMessage(msg: ChatMessage, index: number): string[] {
  const errors: string[] = [];
  const valid: Array<ChatMessage["role"]> = [
    "system",
    "user",
    "assistant",
    "tool",
  ];
  if (!valid.includes(msg.role)) {
    errors.push(`messages[${index}].role must be one of ${valid.join(" | ")}`);
  }
  if (typeof msg.content === "string") {
    // String content is always allowed.
    return errors;
  }
  if (!Array.isArray(msg.content)) {
    errors.push(`messages[${index}].content must be a string or array of parts`);
    return errors;
  }
  if (msg.content.length === 0) {
    errors.push(`messages[${index}].content array must not be empty`);
    return errors;
  }
  msg.content.forEach((part, partIndex) => {
    const partErrors = validateContentPart(part, index, partIndex);
    errors.push(...partErrors);
  });
  return errors;
}

function validateContentPart(
  part: ContentPart,
  msgIndex: number,
  partIndex: number,
): string[] {
  const errors: string[] = [];
  const prefix = `messages[${msgIndex}].content[${partIndex}]`;
  switch (part.type) {
    case "text":
      if (typeof part.text !== "string") {
        errors.push(`${prefix}.text must be a string`);
      }
      break;
    case "tool_use":
      if (!isNonEmptyString(part.toolCallId)) {
        errors.push(`${prefix}.toolCallId must be a non-empty string`);
      }
      if (!isNonEmptyString(part.name)) {
        errors.push(`${prefix}.name must be a non-empty string`);
      }
      if (part.input === null || typeof part.input !== "object") {
        errors.push(`${prefix}.input must be an object`);
      }
      break;
    case "tool_result":
      if (!isNonEmptyString(part.toolCallId)) {
        errors.push(`${prefix}.toolCallId must be a non-empty string`);
      }
      if (typeof part.content !== "string") {
        errors.push(`${prefix}.content must be a string`);
      }
      break;
    default:
      errors.push(`${prefix} has unknown type`);
  }
  return errors;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
