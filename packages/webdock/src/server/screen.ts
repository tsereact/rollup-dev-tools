const erase = "\x1b[2J";
const reset = "\x1bc";

class Screen extends Array<string> {
    head = 0;
    limit = 512;

    append(lines: string[]) {
        for (const line of lines) {
            const i = line.indexOf(erase);
            const j = line.indexOf(reset);
            if (i >= 0 || j >= 0) {
                this.head = 0;
                this.push(line);
            }
        }

        return this.head < 1;
    }

    reset() {
        this.head = 0;
        this.length = 0;
    }

    take() {
        const result = this.slice(this.head, this.length);
        if (this.length >= this.limit) {
            const half = this.limit >> 1;
            this.splice(0, this.length - half);
        }

        this.head = this.length;
        return result;
    }
}

export default Screen;