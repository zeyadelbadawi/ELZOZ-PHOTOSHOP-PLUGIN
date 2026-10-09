import React from "react";
import ReactDOM from "react-dom";

export default class PanelController {
    constructor(render, options) {
        this.render = render;
        this.options = options;
    }

    create() {
        console.log("🟩 PanelController.create()", this.options.id);

        // IMPORTANT: We must target the actual <uxp-panel> element
        const panel = document.querySelector(`uxp-panel[panelid="${this.options.id}"]`);

        if (!panel) {
            console.error("🔴 Could NOT find uxp-panel for:", this.options.id);
            return document.createElement("div"); // fallback
        }

        // Create a container INSIDE the uxp-panel
        const container = document.createElement("div");
        container.style.width = "100%";
        container.style.height = "100%";
        container.style.background = "#1e1e1e";
        container.style.color = "white";

        panel.appendChild(container);

        try {
            ReactDOM.render(this.render(), container);
            console.log("🟩 React mounted inside uxp-panel");
        } catch (err) {
            console.error("🔴 React mount error:", err);
        }

        return container;
    }

    destroy() {
        console.log("🟨 PanelController.destroy()", this.options.id);
    }

    get id() {
        return this.options.id;
    }

    get menuItems() {
        return this.options.menuItems || [];
    }
}
