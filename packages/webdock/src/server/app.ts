import type http from "http";

import css from "xterm/css/xterm.css";
import indexHtml from "./index.html";
import serveStatic from "serve-static";

import { fileURLToPath } from "url";

const root = fileURLToPath(new URL("./", import.meta.url));
const serveFiles = serveStatic(root, {
    cacheControl: true,
    immutable: true,
    maxAge: 31536000000,
    etag: true,
    lastModified: true,
    fallthrough: false,
});

let page: string | undefined;

function infer(url: string, loader: () => any) {
    const rx = /["'](.*)["']/;
    const match = loader.toString().match(rx);
    if (match) {
        const [, value] = match;
        const result = new URL(JSON.parse(`\"${value}\"`), url);
        return result.toString();    
    }

    const result = new URL("./", url);
    return result.toString();
}

async function app(req: http.IncomingMessage, res: http.ServerResponse) {
    if (req.url === "/") {
        if (page === undefined) {
            const data = indexHtml.split(",").pop()!;
            const html = Buffer.from(data, "base64").toString();
            const fn = infer(import.meta.url, () => import("../app/main"))
            const js = `import(${JSON.stringify(fn)});`;
            page = html.replace("{CSS}", css).replace("{SCRIPT}", js);
        }

        res.statusCode = 200;
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.write(page);
        return void res.end();
    }

    return void serveFiles(req, res, () => {
        res.statusCode = 404;
        res.end();
    });
}

export default app;
