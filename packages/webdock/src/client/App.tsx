import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import { WebLinksAddon } from "xterm-addon-web-links";

import { css, Global } from "@emotion/react";
import { useEffect, useMemo, useRef } from "react";

const styles = css`
    html, body, .root {
        position: absolute;
        margin: 0;
        padding: 0;
        bottom: 0;
        left: 0;
        right: 0;
        top: 0;
    }

    .root {
        display: flex;
        flex-direction: column;
    }

    .screen {
        position: relative;
        flex-grow: 1;
        overflow: hidden;
    }
`;

function createTerminal() {
    const term = new Terminal({
        cols: 120
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());

    return [term, fit] as [typeof term, typeof fit];
}

function App() {
    const ref = useRef<HTMLDivElement>(null);
    const [term, fit] = useMemo(createTerminal, []);
    useEffect(() => {
        const div = ref.current!;
        term.open(div);
        fit.fit();

        const ro = new ResizeObserver(() => fit.fit());
        ro.observe(div);

        return () => {
            term.dispose();
            ro.disconnect();
        };
    }, [fit, term]);

    const jsx = <>
        <Global styles={styles} />
        <div>
            header
        </div>
        <div className="screen" ref={ref} />
    </>;

    return jsx;
}

export default App;
