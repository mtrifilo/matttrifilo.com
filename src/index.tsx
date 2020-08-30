import * as React from "react";
import * as ReactDOM from "react-dom";

import App from "./App";
import "reset.css";
import "./styles.css";

var mountNode = document.getElementById("app");
ReactDOM.render(<App name="Matt" />, mountNode);
