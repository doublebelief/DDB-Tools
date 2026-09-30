import LoadBoundary from "./LoadBoundary.jsx";
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./style.css";
createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <LoadBoundary>
      <App />
    </LoadBoundary>
  </React.StrictMode>,
);
