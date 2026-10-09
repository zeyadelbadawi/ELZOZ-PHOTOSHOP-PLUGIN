import React from "react";
import * as XLSX from "xlsx"; // Import XLSX library

import "./styles.css";

// Panel imports
import PanelController from "./controllers/PanelController.jsx";
import { runElzoz } from "./controllers/CommandController.jsx";
import Mapping from "./panels/Mapping.jsx"; // Import Mapping component

// Phase 3 service imports
import { TextLayerUpdater } from "./services/TextLayerUpdater.js";
import { ImageInserter } from "./services/ImageInserter.js";
import { DesignExporter } from "./services/DesignExporter.js";
import { LayerAnalyzer } from "./services/LayerAnalyzer.js";
import { ImageDetector } from "./services/ImageDetector.js";

import { entrypoints, storage } from "uxp";
import * as photoshop from "photoshop";
import Demos from "./panels/Demos.jsx";


// Panel for main Elzoz screen (Demos = Setup)
const demosController = new PanelController(
    () => <Demos />,
    {
        id: "demos",
        menuItems: [
            {
                id: "reload1",
                label: "Reload Plugin",
                enabled: true,
                checked: false,
                oninvoke: () => location.reload()
            }
        ]
    }
);


// Second panel (still there but untouched)

const mappingController = new PanelController(
    () => <Mapping />,
    {
        id: "mapping",
        menuItems: []
    }
);


entrypoints.setup({
    plugin: {
        create() {
            window.__ELZOZ_STORAGE = storage;

            // ---- EXPOSE PICKERS TO REACT ----
            window.pickExcelCommand = async () => {

                await new Promise(r => setTimeout(r, 0));

                const file = await storage.localFileSystem.getFileForOpening({
                    types: ["xlsx", "xls"],
                    allowMultiple: false
                });

                if (!file) {
                    console.warn("User canceled Excel picker");
                    return null;
                }

                const token =
                    await storage.localFileSystem.createSessionToken(file);


                // 🔥 IMPORTANT: return the FILE ITSELF
                return {
                    path: file.nativePath,
                    token,
                    file
                };
            };
            window.pickPSDCommand = async () => {

                await new Promise(r => setTimeout(r, 0));

                const file = await storage.localFileSystem.getFileForOpening({
                    types: ["psd"],
                    allowMultiple: false
                });

                if (!file) {
                    console.warn("User canceled PSD picker");
                    return null;
                }

                const token =
                    await storage.localFileSystem.createSessionToken(file);



                return {
                    path: file.nativePath,
                    token,
                    file   // 🔥 VERY IMPORTANT
                };
            };
            window.pickImagesFolder = async () => {

                await new Promise(r => setTimeout(r, 0));

                const folder = await storage.localFileSystem.getFolder();

                if (!folder) {
                    console.warn("User canceled folder picker");
                    return null;
                }

                const token =
                    await storage.localFileSystem.createSessionToken(folder);



                return {
                    path: folder.nativePath,
                    token,
                    folder   // 🔥 VERY IMPORTANT
                };
            };
            window.pickVideoPSDFolder = async () => {

                await new Promise(r => setTimeout(r, 0));

                const folder = await storage.localFileSystem.getFolder();

                if (!folder) {
                    console.warn("User canceled PSD folder picker");
                    return null;
                }

                const token =
                    await storage.localFileSystem.createSessionToken(folder);



                return {
                    path: folder.nativePath,
                    token,
                    folder   // 🔥 VERY IMPORTANT
                };
            };
            window.pickExportsFolder = async () => {

                await new Promise(r => setTimeout(r, 0));

                const folder = await storage.localFileSystem.getFolder();

                if (!folder) {
                    console.warn("User canceled exports folder picker");
                    return null;
                }

                const token =
                    await storage.localFileSystem.createSessionToken(folder);


                return {
                    path: folder.nativePath,
                    token,
                    folder   // 🔥 VERY IMPORTANT
                };
            };
            window.openPSDInPhotoshop = async (file) => {

                if (!file) {
                    throw new Error("No PSD file provided to open command");
                }


                // 🔥 CRITICAL FIX — wrap in executeAsModal
                const doc = await photoshop.core.executeAsModal(async () => {
                    return await photoshop.app.open(file);
                });


                return doc;
            };


            window.getAllLayersFromPSD = async () => {

                const doc = photoshop.app.activeDocument;
                if (!doc) {
                    throw new Error("No active document in Photoshop");
                }

                const layers = [];

                const walkLayers = (layerSet, prefix = "") => {
                    for (const layer of layerSet.layers) {
                        const name = prefix + layer.name;

                        layers.push({
                            name,
                            id: layer.id,
                            kind: layer.kind,
                            visible: layer.visible
                        });

                        if (layer.layers) {
                            walkLayers(layer, name + " / ");
                        }
                    }
                };

                await photoshop.core.executeAsModal(async () => {
                    walkLayers(doc);
                });

                return layers;
            };

            // ===== PHASE 3 GLOBAL SERVICES =====
            window.updateTextLayer = async (layerId, text) => {
                return await TextLayerUpdater.updateTextLayer(layerId, text);
            };

            window.saveDocument = async () => {
                return await TextLayerUpdater.saveDocument();
            };

            window.getAllTextLayers = async () => {
                return await TextLayerUpdater.getAllTextLayers();
            };

            window.getSmartObjectLayers = async () => {
                return await ImageInserter.getSmartObjectLayers();
            };

            window.getAllLayersDetailed = async () => {
                return await LayerAnalyzer.getAllLayersDetailed();
            };

            window.getDocumentStats = async () => {
                return await LayerAnalyzer.getDocumentStats();
            };

            window.detectImageLayers = async () => {
                return await ImageDetector.detectImageLayers();
            };

            window.getImageLayerCount = async () => {
                return await ImageDetector.getImageLayerCount();
            };

            window.getImageLayersByType = async () => {
                return await ImageDetector.getImageLayersByType();
            };

            window.exportAsPNG = async (outputFolder, fileName) => {
                return await DesignExporter.exportAsPNG(outputFolder, fileName);
            };

            window.exportAsJPG = async (outputFolder, fileName, quality) => {
                return await DesignExporter.exportAsJPG(outputFolder, fileName, quality);
            };

            window.exportAsPSD = async (outputFolder, fileName) => {
                return await DesignExporter.exportAsPSD(outputFolder, fileName);
            };

            window.getLayersAndColumns = async () => {

                const doc = photoshop.app.activeDocument;

                // ---- Get layers ----
                const layers = [];

                const walk = (ls) => {
                    for (const l of ls) {
                        layers.push({
                            name: l.name,
                            id: l.id,
                            kind: l.kind
                        });

                        if (l.layers) walk(l.layers);
                    }
                };

                walk(doc.layers);

                // ---- Get Excel columns ----
                const excelFile = await storage.localFileSystem.getFileForOpening({
                    types: ["xlsx"],
                    allowMultiple: false
                });

                const buffer = await excelFile.read({ format: storage.formats.binary });
                const data = new Uint8Array(buffer);
                const workbook = XLSX.read(data, { type: "array" });
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                const json = XLSX.utils.sheet_to_json(sheet);

                const columns = Object.keys(json[0]);

                return { layers, columns };
            };

            window.saveMapping = async (mapping) => {

                // Save in local storage
                localStorage.setItem("elzoz_layer_mapping", JSON.stringify(mapping));
            };

            setTimeout(() => {
                const panel = document.querySelector(
                    'uxp-panel[panelid="moreDemos"]'
                );

                if (!panel) {
                    console.error("❌ Could NOT find uxp-panel[moreDemos]");
                    return;
                }


                const container = document.createElement("div");
                container.style.width = "100%";
                container.style.height = "100%";
                panel.appendChild(container);

                import("react-dom").then(({ render }) => {
                    import("./panels/Demos").then(({ default: Demos }) => {
                        render(<Demos />, container);
                    });
                });

            }, 500);
        },

        destroy() {
            console.log("Elzoz plugin destroyed");
        }
    },

    panels: {
        moreDemos: () => ({
            id: "moreDemos",
            create() {
                return document.createElement("div");
            }
        }),

    }

});
