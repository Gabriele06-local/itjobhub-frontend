import { describe, test, expect } from "bun:test";
import logger from "./logger";

describe("logger", () => {
  test("is a pino logger instance with expected methods", () => {
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.error).toBe("function");
    expect(typeof logger.debug).toBe("function");
  });

  test("has level set to info", () => {
    expect(logger.level).toBe("info");
  });

  test("info() does not throw", () => {
    expect(() => logger.info("test message")).not.toThrow();
  });

  test("warn() does not throw", () => {
    expect(() => logger.warn({ ctx: "test" }, "test warning")).not.toThrow();
  });

  test("error() does not throw", () => {
    expect(() =>
      logger.error({ error: new Error("e") }, "test error"),
    ).not.toThrow();
  });

  test("debug() does not throw", () => {
    expect(() => logger.debug("debug msg")).not.toThrow();
  });
});
