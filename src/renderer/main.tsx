import { createRoot } from "react-dom/client";
import { App } from "./App.js";

const container = document.querySelector("#root");
if (container === null) throw new Error("Missing application root");

createRoot(container).render(<App />);
