import { css, Global } from '@emotion/react';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

import fs from "fs/promises";
import hmr from "@tsereact/rollup-dev-tools/builder/rollup-plugin-hmr/state";

const styles = css`
    body {
        margin: 0;
        font-family:
            -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
            'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
            sans-serif;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
    }

    code {
        font-family:
            source-code-pro, Menlo, Monaco, Consolas, 'Courier New',
            monospace;
    }
`;

const jsx = 
<React.StrictMode>    
    <Global styles={styles} />
    <App /> 
</React.StrictMode>;

async function list() {
    console.log("readdir():", await fs.readdir("."));
}

function init() {
    if (hmr) {
        const newState = new Date().toISOString();
        console.log("[HMR]: oldState = %s   newState = %s", hmr.state, newState);
        hmr.state = newState;

        hmr.onUpdate("import");
    }

    const root = ReactDOM.createRoot(document.getElementById("root")!);
    root.render(jsx);

    list();
}

hmr && hmr.ready && init();
hmr || init();
