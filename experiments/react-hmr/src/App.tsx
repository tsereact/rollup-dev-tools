import logo from './logo.svg';
import { css, Global } from '@emotion/react';

const styles = css`
    .App {
        text-align: center;
    }
  
    .App-logo {
        height: 40vmin;
        pointer-events: none;
    }
  
    @media (prefers-reduced-motion: no-preference) {
        .App-logo {
            animation: App-logo-spin infinite 20s linear;
        }
    }
  
    .App-header {
        background-color: #282c34;
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        font-size: calc(10px + 2vmin);
        color: white;
    }
  
    .App-link {
        color: #61dafb;
    }
  
    @keyframes App-logo-spin {
        from {
          transform: rotate(0deg);
        }
        to {
          transform: rotate(360deg);
        }
    }
`;

function App() {
    const jsx =
    <div className="App">
        <Global styles={styles} />
        <header className="App-header">
            <img src={logo} className="App-logo" alt="logo" />
            <p>
                Edit <code>src/App.js</code> and save to reload.
            </p>
            <a className="App-link" href="https://reactjs.org" target="_blank" rel="noopener noreferrer">
                Learn React - HMR
            </a>
            <p>
                Modify this in your favorite code editor.
            </p>
        </header>
    </div>;
  
    return jsx;
}

export default App;
