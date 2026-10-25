import { describe, expect, it } from "vitest";
import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";
import nextConfig from "../next.config";

async function cacheControlFor(pathname: string) {
  const rules = (await nextConfig.headers?.()) ?? [];
  const values = rules
    .filter((rule) => getPathMatch(rule.source, { strict: true })(pathname))
    .flatMap((rule) => rule.headers)
    .filter((header) => header.key.toLowerCase() === "cache-control")
    .map((header) => header.value);
  return values.at(-1);
}

describe("next.config Cache-Control", () => {
  it.each(["/", "/login", "/signup", "/dashboard", "/inbox/123", "/settings/team", "/join/abc"])(
    "keeps %s out of shared caches",
    async (pathname) => {
      const value = await cacheControlFor(pathname);
      expect(value).toBe("private, no-store");
      expect(value).not.toMatch(/public|s-maxage|stale-while-revalidate/);
    },
  );

  it("sends no-store on API routes", async () => {
    expect(await cacheControlFor("/api/whatsapp/templates")).toBe("no-store");
  });

  it.each(["/_next/static/chunks/app.js", "/_next/image"])(
    "leaves %s to Next's own caching",
    async (pathname) => {
      expect(await cacheControlFor(pathname)).toBeUndefined();
    },
  );
});

async function headerFor(pathname: string, key: string) {
  const rules = (await nextConfig.headers?.()) ?? [];
  return rules
    .filter((rule) => getPathMatch(rule.source, { strict: true })(pathname))
    .flatMap((rule) => rule.headers)
    .filter((header) => header.key.toLowerCase() === key.toLowerCase())
    .map((header) => header.value)
    .at(-1);
}

describe("next.config framing", () => {
  it("lets only our own pages frame the website editor", async () => {
    expect(await headerFor("/site/index.html", "X-Frame-Options")).toBe("SAMEORIGIN");
  });

  it.each(["/dashboard", "/admin", "/login", "/inbox/123"])("keeps %s unframeable", async (pathname) => {
    expect(await headerFor(pathname, "X-Frame-Options")).toBe("DENY");
  });
});
