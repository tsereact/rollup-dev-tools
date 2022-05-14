import type { BigIntStats, Stats } from "fs";
import type { IncomingMessage, ServerResponse } from "http";

import { extname } from "path";
import connect, { ErrorHandleFunction, NextHandleFunction, Server } from "connect";

const compression = new WeakSet();
const requests = new WeakMap<any, IncomingMessage>();
const hashx = /\.[A-Fa-f0-9]{8,}\.[A-Za-z]+$/;

interface SetHeaders {
    (req: IncomingMessage, res: ServerResponse, path: string, stats: BigIntStats | Stats): void;
}

namespace serve {
    export let htmlHeaders: Record<string, string> = {

    };

    export function isStatic(url: string | URL) {
        try {
            url = new URL(url, "local:///");

            if (url.href.startsWith("local:///")) {
                return hashx.test(url.pathname);
            }
        } catch {
            // don't care
        }

        return false;
    }

    export function compress(): NextHandleFunction {
        let handler: NextHandleFunction | undefined;
        return async (req, res, next) => {
            try {
                if (!compression.has(req)) {
                    compression.add(req);

                    if (handler === undefined) {
                        const module = await import("compression");
                        if (handler === undefined) {
                            handler = module.default() as NextHandleFunction;
                        }
                    }

                    handler(req, res, next);
                } else {
                    next();
                }
            } catch (ex) {
                next(ex);
            }
        };
    }

    export function error(): ErrorHandleFunction {
        return (err: Error, req, res, _next) => {
            req.resume();
            res.statusCode = !_next || 500;
            res.end();
            
            console.error("Middleware error:", err.message);
        };
    }

    export function notFound(): NextHandleFunction {
        return (req, res) => {
            req.resume();
            res.statusCode = 404;
            res.end();
        };
    }

    export function files(appPath: string, webPath: string, setHeaders?: SetHeaders): NextHandleFunction {
        const result = connect();
        result.use(compress());
        result.use(staticFiles(appPath, webPath, setHeaders));
        result.use(dynamicFiles(appPath, webPath, setHeaders));
        result.use(error());

        return result;
    }

    export function dynamicFiles(appPath: string, webPath: string, setHeaders?: SetHeaders): NextHandleFunction {
        let handler: Server | undefined;
        return async (req, res, next) => {
            try {
                if (handler === undefined) {
                    const module = await import("serve-static");
                    if (handler === undefined) {
                        const serve = module.default(appPath, {
                            cacheControl: true,
                            etag: true,
                            lastModified: true,
                            maxAge: 0,
                            redirect: true,
                            setHeaders(res, path, stats) {
                                if (extname(path) === ".html") {
                                    for (const [name, value] of Object.entries(htmlHeaders)) {
                                        res.setHeader(name, value);
                                    }
                                }

                                if (setHeaders) {
                                    setHeaders(requests.get(res)!, res, path, stats);
                                }
                            }
                        });

                        handler = connect();
                        handler.use(webPath, serve);
                    }
                }

                requests.set(res, req);
                handler(req, res, next);
            } catch (ex) {
                next(ex);
            }
        };
    }

    export function staticFiles(appPath: string, webPath: string, setHeaders?: SetHeaders): NextHandleFunction {
        let handler: Server | undefined;
        return async (req, res, next) => {
            try {
                if (handler === undefined) {
                    const module = await import("serve-static");
                    if (handler === undefined) {
                        const serve = module.default(appPath, {
                            cacheControl: true,
                            etag: true,
                            immutable: true,
                            lastModified: true,
                            maxAge: 31536000000,
                            setHeaders(res, path, stats) {
                                if (extname(path) === ".html") {
                                    for (const [name, value] of Object.entries(htmlHeaders)) {
                                        res.setHeader(name, value);
                                    }
                                }

                                if (setHeaders) {
                                    setHeaders(requests.get(res)!, res, path, stats);
                                }
                            }
                        });

                        handler = connect();
                        handler.use(webPath, serve);
                    }
                }

                if (isStatic(req.url || "")) {
                    requests.set(res, req);
                    handler(req, res, next);
                } else {
                    next();
                }
            } catch (ex) {
                next(ex);
            }
        };
    }
}

export default serve;
