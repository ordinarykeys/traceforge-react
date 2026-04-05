import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";

export const packageDir = path.resolve(process.cwd(), "public", "package");

let fetchInstalled = false;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const normalize = (value: string): string => value.replace(/\r\n/g, "\n").trim();

export const sanitizeName = (value: string): string =>
  value.replace(/[^a-z0-9_-]+/gi, "_").toLowerCase();

export const installLocalPackageFetch = () => {
  if (fetchInstalled) {
    return;
  }

  const originalFetch = globalThis.fetch.bind(globalThis);

  globalThis.fetch = async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    if (typeof input === "string" && input.startsWith("/package/")) {
      const filePath = path.join(packageDir, input.slice("/package/".length));
      const source = await readFile(filePath, "utf8");
      return new Response(source, {
        status: 200,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }

    return originalFetch(input, init);
  };

  fetchInstalled = true;
};

export async function ensureEmptyDir(dir: string) {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await rm(dir, { recursive: true, force: true });
      lastError = null;
      break;
    } catch (error) {
      lastError = error;
      await sleep(100 * (attempt + 1));
    }
  }

  if (lastError) {
    throw lastError;
  }

  await mkdir(dir, { recursive: true });
}
