import { IncomingMessage, ServerResponse } from "http";
import indexHtml from "./index.html";

function script() {
    const reply = new BroadcastChannel("webdock-reply");
    const request = new BroadcastChannel("webdock-request");
    addEventListener("message", e => reply.postMessage(e.data));
    request.addEventListener("message", e => parent.postMessage(e.data));
    reply.postMessage({ channel: "hmr-discover" });
}

async function hmrRelay(req: IncomingMessage, res: ServerResponse, next: () => void) {
    try {
        if (req.method !== "GET") {
            return next();
        }

        const url = new URL("local:///", req.url!);
        if (!url.href.startsWith("local:///")) {
            return next();
        }

        if (!url.pathname.endsWith("/hmr-relay.html")) {
            return next();
        }
    } catch {
        return next();
    }

    const css = "data:text/css,";
    const data = indexHtml.split(",").pop()!;
    const html = Buffer.from(data, "base64").toString();
    const js = `${script}\nscript();`
    const content = html.replace("{CSS}", css).replace("{SCRIPT}", js);
    res.statusCode = 200;
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.write(content);
    res.end();
}

export default hmrRelay;
