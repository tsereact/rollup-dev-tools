import App from "./App";
import ReactDOM from "react-dom";

const div = document.createElement("div");
div.classList.add("root");
document.body.appendChild(div);

ReactDOM.render(<App />, div);
