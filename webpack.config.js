const fs = require("fs");
const path = require("path");
const webpack = require("webpack");
const CopyPlugin = require("copy-webpack-plugin");

// Minimal .env reader (no dependency). Real environment variables win.
function readEnvFile(file) {
    if (!fs.existsSync(file)) return {};
    const out = {};
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
    return out;
}

// Refuse to bundle anything that is not the public anon key.
function assertPublicKey(key) {
    if (!key) return;
    const payload = key.split(".")[1];
    if (!payload) return;
    let role;
    try {
        role = JSON.parse(Buffer.from(payload, "base64").toString("utf8")).role;
    } catch (e) {
        return;
    }
    if (role && role !== "anon") {
        throw new Error(`Refusing to build: ELZOZ_SUPABASE_ANON_KEY has role "${role}". Only the anon key may ship in the plugin.`);
    }
}

module.exports = (env, argv) => {
    const isProd = argv.mode === "production";
    const fileEnv = readEnvFile(path.resolve(__dirname, ".env"));
    const supabaseUrl = process.env.ELZOZ_SUPABASE_URL || fileEnv.ELZOZ_SUPABASE_URL || "";
    const supabaseAnonKey = process.env.ELZOZ_SUPABASE_ANON_KEY || fileEnv.ELZOZ_SUPABASE_ANON_KEY || "";
    const websiteUrl = process.env.ELZOZ_WEBSITE_URL || fileEnv.ELZOZ_WEBSITE_URL || "";
    assertPublicKey(supabaseAnonKey);

    return {
        entry: "./src/index.jsx",
        output: {
            path: path.resolve(__dirname, "dist"),
            filename: "index.js"
        },
        // eval-based source maps need allowCodeGenerationFromStrings; production uses none.
        devtool: isProd ? false : "eval-cheap-source-map",
        externals: {
            uxp: "commonjs2 uxp",
            photoshop: "commonjs2 photoshop",
            os: "commonjs2 os"
        },
        // Plugin bundles load from local disk; web download-size hints don't apply.
        performance: { hints: false },
        resolve: {
            extensions: [".js", ".jsx"]
        },
        module: {
            rules: [
                {
                    test: /\.jsx?$/,
                    exclude: /node_modules/,
                    loader: "babel-loader",
                    options: {
                        plugins: [
                            "@babel/transform-react-jsx",
                            "@babel/proposal-object-rest-spread",
                            "@babel/plugin-syntax-class-properties"
                        ]
                    }
                },
                {
                    test: /\.png$/,
                    exclude: /node_modules/,
                    loader: "file-loader"
                },
                {
                    test: /\.css$/,
                    use: ["style-loader", "css-loader"]
                }
            ]
        },
        plugins: [
            new webpack.DefinePlugin({
                __ELZOZ_SUPABASE_URL__: JSON.stringify(supabaseUrl),
                __ELZOZ_SUPABASE_ANON_KEY__: JSON.stringify(supabaseAnonKey),
                __ELZOZ_WEBSITE_URL__: JSON.stringify(websiteUrl),
                __ELZOZ_DEV__: JSON.stringify(!isProd)
            }),
            new CopyPlugin(
                [
                    {
                        from: "plugin",
                        // The manifest is a template: network domains and dev-only permissions are build-specific.
                        transform(content, file) {
                            if (!file.endsWith("manifest.json")) return content;
                            const manifest = JSON.parse(content.toString());
                            const perms = manifest.requiredPermissions;
                            perms.network.domains = supabaseUrl ? [new URL(supabaseUrl).origin] : [];
                            perms.allowCodeGenerationFromStrings = !isProd; // eval-based dev source maps only
                            return JSON.stringify(manifest, null, 2);
                        }
                    }
                ],
                { copyUnmodified: true }
            )
        ]
    };
};
