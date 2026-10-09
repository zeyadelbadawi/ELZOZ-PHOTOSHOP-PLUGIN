'use client';

import React from "react";
import { AuthProvider } from "../context/AuthContext";
import AppContainer from "../components/AppContainer";

export default function Demos() {
    const [layers, setLayers] = React.useState([]);

    const handleListLayers = async () => {
        try {
            const response = await fetch('/api/psd-layers');
            const data = await response.json();
            setLayers(data.layers);
            console.table(data.layers);   // 🔥 you'll see this in DevTools
            console.log(`Found ${data.layers.length} layers in PSD`);
        } catch (e) {
            console.error("❌ Failed to get layers:", e);
        }
    };

    return (
        <AuthProvider>
            <div>
                <AppContainer />
                <button onClick={handleListLayers}>
                    LIST ALL PSD LAYERS
                </button>
            </div>
        </AuthProvider>
    );
}
