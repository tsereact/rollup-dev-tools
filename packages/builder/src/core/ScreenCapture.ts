import { Readable, Writable } from "stream";
const screens = new Set<ScreenCapture>();

const { stdout, stderr } = process;

function hook(io: Writable) {
    const { write } = io;
    io.write = function (data, ...args: any) {
        for (const screen of screens) {
            screen.push(data);
        }
    
        return (write as Function).call(this, data, ...args);
    };
}

hook(stdout);
hook(stderr);

class ScreenCapture extends Readable {
    constructor() {
        super({
            encoding: "utf-8",            
            read() {},
        });

        screens.add(this);
    }

    capture() {
        this.pause();

        let data: string;
        const list: string[] = [];
        while (data = this.read()) {
            list.push(data);
        }
    
        let value = list.join("");
        value = value.replace(/.*\x1b(c|\[2J)/us, "");
        value = value.replace(/\x1b\[.*?[D]/gs, "");

        return value;
    }

    drain() {
        this.pause();
        while (this.read());
    }

    _destroy(error: Error | null, callback: (error?: Error | null | undefined) => void): void {
        callback(error);
        screens.delete(this);
    }
}

export default ScreenCapture;
