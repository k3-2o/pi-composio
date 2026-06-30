// ── Error classes ─────────────────────────────────────────────────────

export class ComposioSessionError extends Error {
  constructor(hint: string) {
    super(`composio: ${hint}`);
    this.name = "ComposioSessionError";
  }
}

export class ComposioApiError extends Error {
  constructor(
    public status: number,
    _slug: string,
    body: string,
  ) {
    const snippet = body.match(/"message":"([^"]+)/)?.[1]?.slice(0, 40) ?? "";
    super(`composio: ${status}${snippet ? ` - ${snippet}` : ""}`);
    this.name = "ComposioApiError";
  }
}
