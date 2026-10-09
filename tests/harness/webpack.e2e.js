// Builds the end-to-end harness -> .harness-e2e/ (served by e2e-server.js).
// The anon key is a disposable test JWT for the local test backend; it is not
// a production credential and this bundle is never shipped.
const path = require("path");
const fs = require("fs");
const webpack = require("webpack");

const out = path.resolve(__dirname, "../../.harness-e2e");
const origin = process.env.ELZOZ_E2E_ORIGIN || "http://127.0.0.1:54340";
if (!process.env.ELZOZ_E2E_ANON_KEY) throw new Error("ELZOZ_E2E_ANON_KEY is required (see tests/harness/e2e-run.js)");

const base = fs.readFileSync(path.join(__dirname, "webpack.harness.js"), "utf8").match(/<style>([\s\S]*?)<\/style>/)[1];

module.exports = {
    mode: "development",
    devtool: false,
    entry: path.resolve(__dirname, "e2e-main.jsx"),
    output: { path: out, filename: "e2e.js" },
    resolve: { extensions: [".js", ".jsx"] },
    module: {
        rules: [
            { test: /\.jsx?$/, exclude: /node_modules/, loader: "babel-loader", options: { plugins: ["@babel/transform-react-jsx", "@babel/proposal-object-rest-spread"] } },
            { test: /\.css$/, use: ["style-loader", "css-loader"] }
        ]
    },
    plugins: [
        new webpack.DefinePlugin({
            __ELZOZ_SUPABASE_URL__: JSON.stringify(origin),
            __ELZOZ_SUPABASE_ANON_KEY__: JSON.stringify(process.env.ELZOZ_E2E_ANON_KEY),
            __ELZOZ_WEBSITE_URL__: JSON.stringify("https://example.test/elzoz"),
            __ELZOZ_DEV__: "false"
        }),
        {
            apply(compiler) {
                compiler.hooks.afterEmit.tap("e2e-html", () => {
                    fs.writeFileSync(
                        path.join(out, "index.html"),
                        `<!doctype html><html><head><meta charset="utf-8"><title>Elzoz e2e (simulated host)</title><style>${base}
html,body{margin:0;height:100%;}
body{display:flex;flex-direction:column;}
body[data-theme=light] sp-button{color:#2c2c2c;}
body[data-theme=light] sp-button:not([quiet]){border-color:#8a8a8a;}
body[data-theme=light] sp-button[variant=cta]{color:#fff;}
body[data-theme=light] select,body[data-theme=light] input{background:#fff;color:#2c2c2c;border-color:#b0b0b0;}
#sim-banner{flex:none;background:#ffd75e;color:#000;font:600 10px/1.3 sans-serif;padding:3px 6px;text-align:center;}
#root{flex:1;height:auto;min-height:0;}
</style></head><body><div id="sim-banner">SIMULATED</div><div id="root"></div><script src="e2e.js"></script></body></html>`
                    );
                });
            }
        }
    ]
};
