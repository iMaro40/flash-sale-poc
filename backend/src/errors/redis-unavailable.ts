export class RedisUnavailableError extends Error {
  public constructor(cause: unknown) {
    super("Redis is unavailable", { cause });
    this.name = "RedisUnavailableError";
  }
}
