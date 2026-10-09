// Browser preview harness (development tool, never shipped).
// Runs the real App and real services against the behavioral Photoshop fake,
// so layouts and flows can be exercised and screenshotted in Chromium.
// Chromium is NOT UXP: CSS support and native widgets differ. Use this for
// flow/layout checks only; final visual QA must happen in Photoshop.
import React from "react";
import ReactDOM from "react-dom";
import App from "../../src/app/App.jsx";
import { createServices } from "../../src/app/services.js";
import { createFakeHost, FakeFolder } from "../fakes/fakePhotoshop.js";
import { makeXlsx } from "../helpers/fixtures.js";

const TEMPLATE = "/fake/templates/product-card.psd";
const host = createFakeHost({
    version: new URLSearchParams(location.search).get("ps") || "26.11.0",
    templates: {
        [TEMPLATE]: {
            title: "product-card.psd",
            width: 2160,
            height: 3840,
            layers: [
                {
                    name: "Card",
                    kind: "group",
                    layers: [
                        { name: "Name", kind: "text", text: "Product name", bounds: { left: 200, top: 400, right: 1960, bottom: 700 } },
                        { name: "Price", kind: "text", text: "$0", bounds: { left: 200, top: 800, right: 900, bottom: 1000 } },
                        { name: "Photo", kind: "smartObject", bounds: { left: 300, top: 1200, right: 1860, bottom: 2900 } }
                    ]
                },
                { name: "Footer", kind: "group", layers: [{ name: "Name", kind: "text", text: "Brand" }] },
                { name: "Background", kind: "pixel", bounds: { left: 0, top: 0, right: 2160, bottom: 3840 } }
            ]
        }
    }
});

const xlsx = makeXlsx({
    Products: [
        ["Name", "Price", "Photo", "Category"],
        ["Laptop Pro 14", "$1,299", "laptop", "Computers"],
        ["Wireless Mouse", "$25", "mouse.png", "Accessories"],
        ["حاسوب محمول", "٤٥٠٠ ر.س", "laptop.jpg", "حواسيب"],
        ["Desk Lamp", "$40", "lamp.jpg", "Home"]
    ],
    Notes: [["x"], ["1"]]
});
const products = new FakeFolder("products", { "laptop.jpg": { image: { width: 1600, height: 1200 } }, "mouse.png": { image: { width: 800, height: 800 } } });
const output = new FakeFolder("Elzoz output");
const folderQueue = [];

Object.assign(host.uxp, {
    shell: { openExternal: (u) => console.log("openExternal", u) },
    versions: { ...host.uxp.versions, plugin: "0.2.0" }
});
Object.assign(host.uxp.storage.localFileSystem, {
    async getFileForOpening({ types }) {
        if (types.includes("psd")) return { name: "product-card.psd", nativePath: TEMPLATE };
        return { name: "products.xlsx", nativePath: "/fake/products.xlsx", read: async () => xlsx.buffer.slice(0) };
    },
    async getFolder() {
        return folderQueue.shift() || products;
    }
});
window.__harness = { host, products, output, queueFolder: (name) => folderQueue.push(name === "output" ? output : products) };

const root = document.getElementById("root");
ReactDOM.render(<App services={createServices({ photoshop: host.photoshop, uxp: host.uxp })} />, root);
