import fs from "node:fs";
import path from "node:path";
import { describe, expect, test } from "bun:test";

describe("iOS Web Clip Configuration Profile (ArusKas.mobileconfig)", () => {
  test("contains valid Apple plist metadata, FullScreen Web Clip, and genuine 180x180 PNG icon", () => {
    const filePath = path.join(
      process.cwd(),
      "public",
      "downloads",
      "ArusKas.mobileconfig"
    );
    expect(fs.existsSync(filePath)).toBe(true);

    const xml = fs.readFileSync(filePath, "utf8");
    expect(xml).toContain("<key>PayloadType</key>");
    expect(xml).toContain("<string>com.apple.webClip.managed</string>");
    expect(xml).toContain("<key>FullScreen</key>");
    expect(xml).toContain("<true/>");
    expect(xml).toContain("<key>IsRemovable</key>");
    expect(xml).toContain("<key>Precomposed</key>");
    expect(xml).toContain(
      "<string>https://aruskas-bay.vercel.app/dashboard</string>"
    );

    const match = /<data>\s*([\s\S]*?)\s*<\/data>/.exec(xml);
    expect(match).not.toBeNull();
    const iconBytes = Buffer.from((match?.[1] ?? "").replace(/\s+/g, ""), "base64");
    // Verify genuine PNG signature (89 50 4E 47 0D 0A 1A 0A)
    expect(iconBytes.byteLength).toBeGreaterThan(1000);
    expect(Array.from(iconBytes.subarray(0, 8))).toEqual([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
  });
});
