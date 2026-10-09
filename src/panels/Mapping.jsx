import React, { useState, useEffect } from "react";

export default function Mapping() {
    const [layers, setLayers] = useState([]);
    const [columns, setColumns] = useState([]);
    const [mapping, setMapping] = useState({});

    useEffect(() => {
        async function loadData() {
            try {
                const result = await window.getLayersAndColumns();
                setLayers(result.layers);
                setColumns(result.columns);
            } catch (e) {
                console.error("❌ Mapping load failed:", e);
            }
        }

        loadData();
    }, []);


    const setMatch = (layerName, columnName) => {
        setMapping(prev => ({
            ...prev,
            [layerName]: columnName
        }));
    };

    const saveMapping = () => {
        window.saveMapping(mapping);
        console.log("Saved mapping:", mapping);
    };

    return (
        <div style={{ display: "flex", gap: "20px", padding: "16px" }}>
            <div style={{ width: "50%" }}>
                <h3>Photoshop Layers</h3>
                {layers.map(l => (
                    <div key={l.id} style={{ marginBottom: "8px" }}>
                        <b>{l.name}</b>

                        <select
                            onChange={e => setMatch(l.name, e.target.value)}
                            style={{ display: "block", width: "100%" }}
                        >
                            <option value="">-- choose column --</option>
                            {columns.map(c => (
                                <option key={c} value={c}>{c}</option>
                            ))}
                        </select>
                    </div>
                ))}
            </div>

            <div style={{ width: "50%" }}>
                <h3>Excel Columns</h3>
                {columns.map(c => (
                    <div key={c}>{c}</div>
                ))}
            </div>

            <button onClick={saveMapping}>SAVE MAPPING</button>
        </div>
    );
}
