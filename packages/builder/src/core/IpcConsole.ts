import type IpcStateHub from "./IpcStateHub";

import { css } from "xterm/css/xterm.css";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import { WebLinksAddon } from "xterm-addon-web-links";

const innerHTML = `
<style>${css}</style>
<style>
    .root {
        position: fixed;
        left: 2em;
        right: 2em;
        top: 2em;
        bottom: 2em;
        border: 4px solid black;
        background-color: midnightblue;
        font-family: Arial;
        font-size: smaller;
        color: white;
    }

    #term {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
    }

    .stats {

    }

    .help {
        position: absolute;
        padding: 4px;
        right: 0;
        bottom: 0;
    }

    * {
        scrollbar-width: thin;
        scrollbar-color: midnightblue aliceblue;
    }
    
    *::-webkit-scrollbar {
        width: 12px;
    }
    
    *::-webkit-scrollbar-track {
        background: midnightblue;
    }
    
    *::-webkit-scrollbar-thumb {
        background-color: aliceblue;
        border-radius: 20px;
    }
</style>
<div id="term" />
<div class="help">Toggle - CTRL+F11</div>
`;

function safe() {
    if (typeof HTMLElement === "function") {
        return HTMLElement;
    }

    class Stub {
        constructor() {
            throw new Error("HTMLElement not defined.");
        }
    }

    return Stub as never;
}

export class IpcConsole extends safe() {
    private term = new Terminal({
        allowProposedApi: true,
        convertEol: true,
        cursorBlink: false,
        cursorStyle: "underline",
        disableStdin: true,
        overviewRulerWidth: 20,
    });

    private cleanup = () => {};
    private container = document.createElement("div");
    private fitAddon = new FitAddon();
    private weblinksAddon = new WebLinksAddon();

    private handleKey(event: KeyboardEvent) {
        if (event.key === "F11" && event.ctrlKey) {
            this.toggle();
            event.preventDefault();
            event.stopPropagation();
            return false;
        }
    
        return undefined;
    }

    fit() {
        const { fitAddon, term } = this;
        const { cols, rows } = fitAddon.proposeDimensions() || {};
        if (cols && rows) {
            term.resize(cols, rows - 1);
        }        
    }

    show() {
        const { container, term } = this;
        container.style.display = "block";

        if (!term.element) {
            term.open(container.querySelector("#term")!);
            this.fit();
        }
    }

    hide() {
        const { container } = this;
        container.style.display = "none";
    }

    isShown() {
        const { container } = this;
        return container.style.display !== "none";
    }

    toggle() {
        this.isShown() ? this.hide() : this.show();
    }

    clear() {
        this.term.clear();
    }

    write(text: string) {
        this.term.write(text);
    }
   
    constructor() {
        super();
    
        const { container, fitAddon, handleKey, weblinksAddon, term } = this;
        term.loadAddon(fitAddon);
        term.loadAddon(weblinksAddon);
    
        term.attachCustomKeyEventHandler(() => {
            return false;
        });

        const root = this.attachShadow({ mode: "closed" });
        root.append(container);

        container.classList.add("root");
        container.innerHTML = innerHTML;

        this.handleKey = handleKey.bind(this);
        this.hide();
    }

    protected connectedCallback() {
        const { container, handleKey } = this;
        const resizer = new ResizeObserver(() => this.fit());
        resizer.observe(container, { box: "border-box" });
        document.addEventListener("keydown", handleKey);
        
        this.cleanup = () => {
            document.removeEventListener("keydown", handleKey);
            resizer.disconnect();
        };

        if (this.isShown()) {
            this.show();
        }
    }

    protected disconnectedCallback() {
        this.cleanup();
        this.cleanup = () => {};
    }

    private owner: any;
    private leave = () => {};

    attach(owner: any, hub: IpcStateHub) {
        if (owner === this.owner) {
            return false;
        }

        this.leave();
        this.leave = () => hub.off(this);
        this.owner = owner;

        hub.on(this, (_, { log, logInit, logShow }) => {
            if (logInit) {
                this.clear();
            }

            if (logShow) {
                this.show()
            }

            if (Array.isArray(log)) {
                for (const text of log) {
                    if (typeof text === "string") {
                        this.write(text);
                    }
                }
            }
        });

        return true;
    }

    detach(owner: any) {
        if (this.owner === owner) {
            this.leave();
            this.owner = undefined;

            return true;
        }

        return false;
    }

    static create(tagName: string, ns: string) {
        const sym = Symbol.for(ns);
        const global = self as any;
        const cls: typeof IpcConsole = global[sym] || (global[sym] = this);
        for (const node of document.body.querySelectorAll(tagName)) {
            if (node instanceof cls) {
                return node;
            }
        }

        customElements.define(tagName, this);

        const node = document.createElement(tagName);
        document.body.append(node);

        return node as IpcConsole;
    }

    static isSupported() {
        if (typeof customElements !== "object") {
            return false;
        }

        if (typeof HTMLElement !== "function") {
            return false;
        }

        if (this.prototype instanceof HTMLElement) {
            return true;
        }

        return false;
    }
}

export default IpcConsole;
