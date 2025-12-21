type JsonLike = Record<string, unknown> | unknown[];

function safeParse<T>(value: string): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return {} as T;
  }
}

export function parseBody<T extends JsonLike | null = Record<string, unknown>>(
  input: unknown,
): T {
  if (input == null) {
    return {} as T;
  }
  if (typeof input === "string") {
    return safeParse<T>(input);
  }
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(input)) {
    return safeParse<T>(input.toString("utf8"));
  }
  if (typeof input === "object") {
    return input as T;
  }
  return {} as T;
}
