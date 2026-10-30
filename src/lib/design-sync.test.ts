import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The public site (public/site/index.html) is a separate static page with its
 * own copy of the brand. These checks fail if the two drift apart.
 */
const root = process.cwd();
const site = readFileSync(join(root, "public/site/index.html"), "utf8").toLowerCase();
const app = readFileSync(join(root, "src/app/globals.css"), "utf8").toLowerCase();

describe("brand stays in step between the app and the public site", () => {
  it.each(["#1e4c41", "#f4efe7", "#fffdf9"])("both use %s", (hex) => {
    expect(app).toContain(hex);
    expect(site).toContain(hex);
  });

  it("both use Plus Jakarta Sans", () => {
    expect(site).toContain("plus jakarta sans");
    expect(readFileSync(join(root, "src/app/layout.tsx"), "utf8")).toContain("Plus_Jakarta_Sans");
  });

  it("the editor glass and the app glass share the same blur recipe", () => {
    const recipe = "saturate(1.9) contrast(.62) brightness(1.5)";
    expect(site).toContain(recipe);
    expect(app).toContain("saturate(1.9) contrast(var(--lg-con, 0.7)) brightness(var(--lg-br, 1.3))");
  });
});
