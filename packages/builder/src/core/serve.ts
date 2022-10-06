import type { BigIntStats, Stats } from "fs";

import { EventEmitter } from "events";
import { IncomingMessage, ServerResponse } from "http";

import connect, { after, skip, WebHandler } from "./connect";
import GlobSet, { GlobInit } from "./GlobSet";

const cleanx = /(^\/+|\/+$)/g;
const prefixx = /.*\/+/;
const slashx = /\/+/g;
const xhashx = /\.x[0-9a-z]{8,}\.[a-z]+$/i;

const compression = new WeakSet<IncomingMessage>();
const requests = new WeakMap<ServerResponse, IncomingMessage>();
const urls = new WeakMap<IncomingMessage, string | undefined>();

async function lazy<T>(fn: () => T | Promise<T>) {
    let init = true;
    let result: T;
    if (init) {
        result = await fn();
        init = false;
    }

    return result!;
}

function toPath(url?: string) {
    const parsed = new URL("http://localhost/" + url);
    return decodeURIComponent(parsed.pathname).replace(slashx, "/");
}

function toUrl(url: string, path: string) {
    const parsed = new URL("http://localhost/" + url);
    parsed.pathname = path.replace(slashx, "/");
    
    const { pathname, search, hash } = parsed;
    return `${pathname}${search}${hash}`;
}

export type Method = "GET" | "HEAD" | "GET HEAD" | "POST" | "PATCH" | "PUT" | "DELETE" | "TRACE" | "OPTIONS" | "*";

function isMethod(req: IncomingMessage, method?: Method, ) {
    if (method === "*") {
        return true;
    }

    if (method === "GET HEAD") {
        if (req.method === "GET") {
            return true;
        }

        if (req.method === "HEAD") {
            return true;
        }

        return false;
    }

    return req.method === method;
}

export function urlOrigin(req: IncomingMessage) {
    if (!urls.has(req)) {
        urls.set(req, req.url);
    }

    return urls.get(req);
}

export function xhash(): WebHandler {
    return (req, _, next) => {
        const { url } = req;
        return url && xhashx.test(url) ? false : skip(next);
    };
}

export function filter(...filters: GlobInit[]): WebHandler {
    const filter = GlobSet.create(...filters);
    return (req, _, next) => {
        const { url } = req;
        if (!url) {
            return skip(next);
        }

        const path = toPath(url).replace(cleanx, "");
        if (!filter.match(path)) {
            return skip(next);
        }

        return false;
    };
}

export function route(method: Method, root = "/", filter?: RegExp): WebHandler {
    root = `/${root}`;
    root = root.replace(slashx, "/");

    return (req, _, next) => {
        const { url } = req;
        if (!isMethod(req, method) || !url) {
            return skip(next);
        }

        const path = toPath(url);
        if (!path.startsWith(root)) {
            return skip(next);
        }

        const tail = path.substring(path.length)
        if (filter) {
            const match = tail.match(filter);
            if (!match) {
                return skip(next);
            }

            urlOrigin(req);
            req.url = toUrl(url, tail);

            return after(next, () => req.url = urlOrigin(req));
        }

        if (tail) {
            return skip(next);
        }

        return false;
    };
}

export function logError(): WebHandler {
    return (req, res, _, error) => {
        if (!events.emit("log-error", req, res, error)) {
            console.error("Middleware error:", error?.message);
        }

        req.resume();
        res.statusCode = 500;
        events.emit("serve-error", req, res, error);
        res.end();
    };
}

export function methodNotAllowed(): WebHandler {
    return (req, res) => {
        req.resume();
        res.statusCode = 405;
        events.emit("serve-error", req, res);
        res.end();
    };
}

export function notFound(): WebHandler {
    return (req, res) => {
        req.resume();
        res.statusCode = 404;
        events.emit("serve-error", req, res);
        res.end();
    };
}

export function compress(): WebHandler {
    return async (req, res, next) => {
        if (!compression.has(req)) {
            compression.add(req);

            const handler = await lazy(async () => {
                const { default: module } = await import("compression");
                return module();
            });

            handler(req as any, res as any, next);
        } else {
            next();
        }
    };
}

export interface SetHeaders {
    (req: IncomingMessage, res: ServerResponse, path: string, stats: BigIntStats | Stats): void;
}

export interface GlobalEvents extends EventEmitter {
    on(event: "serve-file", listener: (req: IncomingMessage, res: ServerResponse, path: string, stats: Stats | BigIntStats) => any): this;
    on(event: "serve-error", listener: (req: IncomingMessage, res: ServerResponse) => any): this;
    on(event: string, listener: (...args: any) => any): this;
}

export const events = new EventEmitter() as GlobalEvents;

export function addSlash(): WebHandler {
    return (req, res, next) => {
        const tail = toPath(urlOrigin(req)).replace(prefixx, "")
        if (req.url === "/" && tail) {
            req.resume();
            res.statusCode = 302;
            res.setHeader("cache-control", "no-cache");
            res.setHeader("location", encodeURIComponent(tail) + "/");
            res.end();
        } else {
            next();
        }
    };
}

export function dynamicFiles(appPath: string, setHeaders?: SetHeaders): WebHandler {
    return async (req, res, next) => {
        const handler = await lazy(async () => {
            const { default: serveStatic } = await import("serve-static");
            return serveStatic(appPath, {
                cacheControl: true,
                etag: true,
                lastModified: true,
                maxAge: 0,
                redirect: true,
                setHeaders(res, path, stats) {
                    const req = requests.get(res);
                    requests.delete(res);

                    if (req && setHeaders) {
                        events.emit("serve-file", req, res, path, stats);
                        setHeaders(req, res, path, stats);
                    }
                }
            });
        });

        requests.set(res, req);
        handler(req, res, () => {
            requests.delete(res);
            next();
        });
    };
}

export function staticFiles(appPath: string, setHeaders?: SetHeaders): WebHandler {
    return async (req, res, next) => {
        const handler = await lazy(async () => {
            const { default: serveStatic } = await import("serve-static");
            return serveStatic(appPath, {
                cacheControl: true,
                etag: true,
                immutable: true,
                index: false,
                lastModified: true,
                maxAge: 31536000000,
                setHeaders(res, path, stats) {
                    const req = requests.get(res);
                    requests.delete(res);

                    if (req && setHeaders) {
                        events.emit("serve-file", req, res, path, stats);
                        setHeaders(req, res, path, stats);
                    }
                }
            });
        });

        requests.set(res, req);
        handler(req, res, () => {
            requests.delete(res);
            next();
        });
    };
}

export function files(paths: string | string[] | [webPath: string, appPath: string][], setHeaders?: SetHeaders): WebHandler {
    if (typeof paths === "string") {
        paths = [paths];
    }

    paths = paths.map(x => {
        if (typeof x === "string") {
            return ["/", x] as [string, string];
        }

        return x;
    });

    const result = connect();
    result.use(compress());

    paths.forEach(entry => {
        if (typeof entry === "string") {
            entry = ["/", entry];
        }

        const [webPath, appPath] = entry;
        const host = connect();
        host.use(route("*", webPath, /(?:|\/.*)$/));
        host.use(addSlash());
        host.use(xhash(), staticFiles(appPath, setHeaders));
        host.use(dynamicFiles(appPath, setHeaders));

        result.use(host);
    });
    
    result.use(route("GET HEAD"), notFound());
    result.use(methodNotAllowed());
    result.catch(logError());

    return result;
}
