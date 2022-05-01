
const observers = new Map<any, (lines: string[]) => any>();

class Screen extends Array<string> {

    attach(fn: (lines: string[]) => any) {
        const id = {} as any;
        observers.set(id, fn);

        return id;
    }

    detach(id: any) {
        return observers.delete(id);
    }
}

const screen = new Screen();
export default screen;
