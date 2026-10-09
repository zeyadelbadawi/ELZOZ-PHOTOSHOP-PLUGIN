// Builds the browser preview harness: `npm run harness` -> .harness/index.html
const path = require("path");
const fs = require("fs");
const webpack = require("webpack");

const out = path.resolve(__dirname, "../../.harness");

module.exports = {
    mode: "development",
    devtool: false,
    entry: path.resolve(__dirname, "main.jsx"),
    output: { path: out, filename: "harness.js" },
    resolve: { extensions: [".js", ".jsx"] },
    module: {
        rules: [
            { test: /\.jsx?$/, exclude: /node_modules/, loader: "babel-loader", options: { plugins: ["@babel/transform-react-jsx", "@babel/proposal-object-rest-spread"] } },
            { test: /\.css$/, use: ["style-loader", "css-loader"] }
        ]
    },
    plugins: [
        new webpack.DefinePlugin({
            __ELZOZ_SUPABASE_URL__: JSON.stringify(""),
            __ELZOZ_SUPABASE_ANON_KEY__: JSON.stringify(""),
            __ELZOZ_CONTACT_URL__: JSON.stringify(""),
            __ELZOZ_DEV__: "true"
        }),
        {
            apply(compiler) {
                compiler.hooks.afterEmit.tap("harness-html", () => {
                    fs.writeFileSync(
                        path.join(out, "index.html"),
                        `<!doctype html><html><head><meta charset="utf-8"><style>
/* Approximation of UXP widgets for the browser preview only */
body{font-family:-apple-system,"Segoe UI",Roboto,sans-serif;}
sp-button{display:inline-block;padding:3px 12px;border-radius:14px;border:1px solid #8a8a8a;color:#e6e6e6;cursor:pointer;font-weight:600;font-size:12px;white-space:nowrap;}
sp-button[variant=cta]{background:#1473e6;border-color:#1473e6;color:#fff;}
sp-button[variant=primary]{border-color:#e6e6e6;}
sp-button[variant=warning]{border-color:#d7373f;color:#ff8b8b;}
sp-button[quiet]{border-color:transparent;}
sp-button[disabled]{opacity:.35;cursor:default;}
select,input{background:#1f1f1f;color:#e6e6e6;border:1px solid #555;border-radius:4px;padding:3px;font-size:12px;box-sizing:border-box;}
input[type=checkbox]{width:auto;}
#root{height:100vh;}
</style></head><body><div id="root"></div><script src="harness.js"></script></body></html>`
                    );
                });
            }
        }
    ]
};
