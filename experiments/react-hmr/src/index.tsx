import { css, Global } from '@emotion/react';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

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

const root = ReactDOM.createRoot(document.getElementById("root")!);
root.render(jsx);
