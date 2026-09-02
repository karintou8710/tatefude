import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import "./global.css";
import { App } from "./App";

const place = document.getElementById("root");
if (!place) throw new Error("#root がない");

createRoot(place).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
