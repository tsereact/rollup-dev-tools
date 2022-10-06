import type { IncomingMessage, ServerResponse } from "http";

export interface ConnectHandler {
    (req: IncomingMessage, res: ServerResponse, next?: (err?: any) => void, error?: any): Promise<void>;
    handlers: WebHandler[];
    
    catch(handler: WebHandler): this;
    use(handler: WebHandler, ...compose: WebHandler[]): this;    
}

export interface WebHandler {
    (req: IncomingMessage, res: ServerResponse, next: (err?: any) => void, error: any): void | boolean | Promise<void | boolean>;
}

const cmd = Symbol();

export function after(next: (err?: any) => void, cb: () => void) {
    next([cmd, cb]);
}

export function skip(next: (err?: any) => void) {
    next([cmd, false]);
}

function connect(): ConnectHandler {
    const handlers: WebHandler[] = [];
    const handler = async (req: IncomingMessage, res: ServerResponse, next?: (error?: any) => void, error?: any) => {
        if (!next) {
            next = () => {
                if (error) {
                    res.on("close", () => Promise.reject(error));
                }
    
                req.resume();
                res.statusCode = error ? 500 : 404;
                res.setHeader("cache-control", "no-cache");
                res.end();
            };
        }

        let final = () => {};
        for (const handler of handlers) {
            if (res.destroyed) {
                break;
            }

            let push = true;
            let result = error;
            let resolve: (() => void) | undefined;
            const next = (error?: any) => {
                if (push) {
                    push = false;
                    result = error;
                    resolve?.();                    
                }
            };

            try {
                if (await handler(req, res, next, error) === false) {
                    next(error);
                }
            } catch (ex: any) {
                next(ex);                
            }

            if (push) {
                await new Promise<void>(x => resolve = x);
            }

            if (Array.isArray(result) && result[0] === cmd) {
                const value = result[1];
                if (value === false) {
                    break;
                }

                if (typeof value === "function") {
                    final();
                    final = value;
                }
            } else {
                error = result;
            }
        }

        final();
        next(error);
    };

    return Object.assign(handler, {
        handlers, 

        catch(this: ConnectHandler, handler: WebHandler) {
            handlers.push(async (req, res, next, error) => {
                if (error) {
                    return await handler(req, res, next, error);
                }

                return false;
            });
            
            return this;
        },

        use(this: ConnectHandler, handler: WebHandler, ...compose: WebHandler[]) {
            if (compose.length) {
                const fork = connect();
                fork.use(handler);

                for (const handler of compose) {
                    fork.use(handler);
                }

                handler = fork;
            }

            handlers.push(async (req, res, next, error) => {
                if (!error) {
                    return await handler(req, res, next, undefined);
                }

                return false;
            });

            return this;
        }
    });
}

export default connect;
