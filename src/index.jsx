// Plugin entry point: one panel ("main"), mounted by UXP into the root node it
// passes to create(). No window globals, no timers, no DOM queries.
import React from "react";
import ReactDOM from "react-dom";
import { entrypoints } from "uxp";
import * as photoshop from "photoshop";
import * as uxp from "uxp";
import App from "./app/App.jsx";
import { createServices } from "./app/services.js";

let root = null;

entrypoints.setup({
    panels: {
        main: {
            create(rootNode) {
                root = document.createElement("div");
                root.style.height = "100%";
                rootNode.appendChild(root);
                ReactDOM.render(<App services={createServices({ photoshop, uxp })} />, root);
            },
            destroy() {
                if (root) {
                    ReactDOM.unmountComponentAtNode(root);
                    root = null;
                }
            },
            invokeMenu(id) {
                if (id === "reload") window.location.reload();
            },
            menuItems: [{ id: "reload", label: "Reload Elzoz" }]
        }
    }
});
