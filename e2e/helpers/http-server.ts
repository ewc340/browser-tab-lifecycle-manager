import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

export interface TestHttpServer {
  server: Server;
  baseUrl: string;
  pageUrl(slug: string): string;
}

export function startTestHttpServer(): Promise<TestHttpServer> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const slug = (req.url ?? "/").replace(/^\//, "") || "home";
      const title = slug
        .split("-")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        `<!DOCTYPE html><html><head><title>E2E ${title}</title></head><body><h1>E2E ${title}</h1></body></html>`,
      );
    });

    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as AddressInfo).port;
      const baseUrl = `http://127.0.0.1:${port}`;
      resolve({
        server,
        baseUrl,
        pageUrl: (slug: string) => `${baseUrl}/${slug}`,
      });
    });

    server.on("error", reject);
  });
}

export async function stopTestHttpServer(handle: TestHttpServer): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    handle.server.close((error) => (error ? reject(error) : resolve()));
  });
}
