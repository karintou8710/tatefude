import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import "./global.css";
import { App } from "./App";

const place = document.getElementById("root");
if (!place) throw new Error("#root がない");

createRoot(place).render(
  <StrictMode>
    {/* Pages では /<リポジトリ名>/ の下に置かれるので、vite の base をそのまま渡す */}
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
