import * as webdock from "./dist/index.mjs";

console.log("--- http://localhost:9180/");
webdock.httpListen("test", 9180);
