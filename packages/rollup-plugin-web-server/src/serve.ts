import connect, { ErrorHandleFunction, NextHandleFunction, Server } from "connect";

const compression = new WeakSet();
const hashx = /\.[A-Fa-f0-9]{8,}\.[A-Za-z]+$/;

namespace serve {
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

    export function files(appPath: string, webPath: string): NextHandleFunction {
        const result = connect();
        result.use(compress());
        result.use(staticFiles(appPath, webPath));
        result.use(dynamicFiles(appPath, webPath));
        result.use(error());

        return result;
    }

    export function dynamicFiles(appPath: string, webPath: string): NextHandleFunction {
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
                        });

                        handler = connect();
                        handler.use(webPath, serve);
                    }
                }

                handler(req, res, next);
            } catch (ex) {
                next(ex);
            }
        };
    }

    export function staticFiles(appPath: string, webPath: string): NextHandleFunction {
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
                        });

                        handler = connect();
                        handler.use(webPath, serve);
                    }
                }

                if (isStatic(req.url || "")) {
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
