import "@fontsource-variable/nunito/index.css";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import "./theme.css";

const container = document.querySelector("#root");
if (container === null) throw new Error("Missing application root");

createRoot(container).render(<App />);
