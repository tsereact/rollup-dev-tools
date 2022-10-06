import IpcSocket from "./IpcSocket";
import IpcStateHub from "./IpcStateHub";

function sleep(delay: number, signal: AbortSignal) {   
    return new Promise<void>(resolve => {
        let timer: any = setTimeout(() => {
            resolve();
            timer = undefined;
        }, delay);

        signal.addEventListener("abort", () => {
            resolve();

            if (timer !== undefined) {
                clearTimeout(timer);
                timer = undefined;
            }
        });
    });
}

export class IpcClient {
    private cancellation?: AbortController;

    port: string;
    hub: IpcStateHub;
    retryAfter: number;

    constructor(port = "", hub = new IpcStateHub(), retryAfter = 1500) {
        this.port = port;
        this.hub = hub;
        this.retryAfter = retryAfter;
    }

    connect() {
        return IpcSocket.connect(this.port);
    }

    filter(state: any) {
        return state;
    }

    async sync() {
        const { port, hub } = this;
        while (port && hub.any()) {
            if (this.cancellation) {
                return false;
            }
    
            const { signal } = this.cancellation = new AbortController();;
            const ipc = await this.connect();
            if (!signal.aborted) {
                signal.addEventListener("abort", () => ipc.close());    
                await hub.sync(ipc, x => this.filter(x));
                
                if (ipc.error !== undefined && this.retryAfter) {
                    await sleep(this.retryAfter, signal);
                }
        
                this.cancellation = undefined;
            }

            ipc.close();
        }
    
        if (this.cancellation) {
            this.cancellation.abort();
        }
    
        return true;
    }
}

export default IpcClient;
