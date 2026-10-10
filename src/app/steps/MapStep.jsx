import React from "react";
import { useApp } from "../AppContext.jsx";
import { useI18n } from "../i18n.jsx";
import { Alert, Button, Card, Checkbox, Field, FileField, KindIcon, Section, Select } from "../../ui/components.jsx";
import { isImageLayer, isTextLayer } from "../../domain/layers.js";
import { autoMap, createMapping, mappedCount, setImageMapping, setTextMapping, setTextOptions, setVisibilityMapping } from "../../domain/mapping.js";
import { VISIBILITY_EMPTY } from "../../domain/visibility.js";
import { effectiveTable } from "../state.js";
import TextFormat from "./TextFormat.jsx";

function LayerRow({ layer, rule, columns, firstRow, onColumn, children }) {
    const { t } = useI18n();
    const parent = layer.path.slice(0, -1).join(" / ");
    const sample = rule && firstRow ? firstRow.values[rule.column] : null;
    return (
        <div className="ez-layer">
            <div className="ez-layer-main">
                <KindIcon kind={layer.kind} />
                <div className="ez-layer-name">
                    <div className="ez-ellipsis" title={layer.path.join(" / ")}>
                        {layer.name}
                    </div>
                    {parent && <div className="ez-small ez-muted ez-ellipsis">{parent}</div>}
                </div>
                <div className="ez-layer-picker">
                    <Select value={rule ? rule.column : ""} onChange={onColumn} placeholder={t("map.none")} options={columns} />
                </div>
            </div>
            {rule && (
                <div className="ez-layer-extra">
                    {sample !== null && sample !== undefined && (
                        <div className="ez-small ez-muted ez-ellipsis ez-mb2">{t("map.example", { value: String(sample) || "—" })}</div>
                    )}
                    {children}
                </div>
            )}
        </div>
    );
}

export default function MapStep() {
    const { state, dispatch, services } = useApp();
    const { t } = useI18n();
    const { data, template, mapping } = state;
    if (!data || !template) return <Alert tone="info">{t("data.empty")}</Alert>;

    const table = effectiveTable(state);
    const columns = table.headers.map((h) => ({ value: h.key, label: h.key }));
    const firstRow = table.rows.find((r) => !r.isEmpty);
    const textLayers = template.layers.filter(isTextLayer);
    const imageLayers = template.layers.filter(isImageLayer);
    const set = (m) => dispatch({ type: "mapping", mapping: m });
    const emptyOptions = ["blank", "keepTemplate", "skipRow"].map((v) => ({ value: v, label: t(`map.empty.${v}`) }));
    const imageEmptyOptions = ["keepTemplate", "skipRow"].map((v) => ({ value: v, label: t(`map.empty.${v}`) }));

    const pickFolder = async (layerId, rule) => {
        const folder = await services.pickImageFolder();
        if (!folder) return;
        const key = `f-${layerId}`;
        dispatch({ type: "folder", key, folder });
        set(setImageMapping(mapping, layerId, { ...rule, folderKey: key }));
    };

    return (
        <>
            <div className="ez-row">
                <div className="ez-grow">
                    <div className="ez-title">{t("map.title")}</div>
                </div>
                <Button quiet onClick={() => set(autoMap(mapping, table.headers, template.layers, table.rows))}>
                    {t("map.auto")}
                </Button>
            </div>
            <div className="ez-subtitle">
                {t("map.subtitle")} {mappedCount(mapping) > 0 && <span className="ez-strong">{t("map.count", { n: mappedCount(mapping) })}</span>}
            </div>
            {state.restoredMapping && (
                <Alert
                    tone="info"
                    action={
                        <Button quiet onClick={() => dispatch({ type: "mapping", mapping: createMapping(), clearRestored: true })}>
                            {t("map.startFresh")}
                        </Button>
                    }
                >
                    {t("map.restored")}
                </Alert>
            )}
            {textLayers.length + imageLayers.length === 0 && <Alert tone="warning">{t("map.noLayers")}</Alert>}

            {textLayers.length > 0 && (
                <Section title={t("map.text")}>
                    <Card>
                        {textLayers.map((layer) => {
                            const rule = mapping.text[layer.id];
                            return (
                                <LayerRow key={layer.id} layer={layer} rule={rule} columns={columns} firstRow={firstRow} onColumn={(c) => set(setTextMapping(mapping, layer.id, c, rule ? rule.emptyPolicy : "blank"))}>
                                    <Field label={t("map.empty")}>
                                        <Select value={rule && rule.emptyPolicy} options={emptyOptions} onChange={(v) => set(setTextMapping(mapping, layer.id, rule.column, v))} />
                                    </Field>
                                    <Checkbox checked={rule && rule.shrinkToFit} onChange={(v) => set(setTextOptions(mapping, layer.id, { shrinkToFit: v }))} label={t("map.shrink")} />
                                    <TextFormat format={rule && rule.format} sample={rule && firstRow ? firstRow.values[rule.column] : null} onChange={(f) => set(setTextOptions(mapping, layer.id, { format: f }))} />
                                </LayerRow>
                            );
                        })}
                    </Card>
                </Section>
            )}

            {imageLayers.length > 0 && (
                <Section title={t("map.images")}>
                    <Card>
                        {imageLayers.map((layer) => {
                            const rule = mapping.images[layer.id];
                            const folder = rule && rule.folderKey ? state.folders[rule.folderKey] : null;
                            const update = (patch) => set(setImageMapping(mapping, layer.id, { ...rule, ...patch }));
                            return (
                                <LayerRow key={layer.id} layer={layer} rule={rule} columns={columns} firstRow={firstRow} onColumn={(c) => set(setImageMapping(mapping, layer.id, c ? { ...(rule || {}), column: c } : null))}>
                                    <Field label={t("map.folder")}>
                                        <FileField
                                            name={folder && folder.name}
                                            meta={folder && t("map.folderMeta", { n: folder.index.count })}
                                            emptyLabel={t("map.folderEmpty")}
                                            actionLabel={t("map.folderPick")}
                                            onPick={() => pickFolder(layer.id, rule)}
                                        />
                                    </Field>
                                    <Field label={t("map.fit")}>
                                        <Select value={rule && rule.fit} onChange={(v) => update({ fit: v })} options={["fit", "fill", "none"].map((v) => ({ value: v, label: t(`map.fit.${v}`) }))} />
                                    </Field>
                                    <Field label={t("map.empty")}>
                                        <Select value={rule && rule.emptyPolicy} options={imageEmptyOptions} onChange={(v) => update({ emptyPolicy: v })} />
                                    </Field>
                                    <Checkbox checked={rule && rule.ignoreCase} onChange={(v) => update({ ignoreCase: v })} label={t("map.ignoreCase")} />
                                    <Checkbox checked={rule && rule.addExtension} onChange={(v) => update({ addExtension: v })} label={t("map.addExtension")} />
                                </LayerRow>
                            );
                        })}
                    </Card>
                </Section>
            )}

            <VisibilitySection layers={template.layers} mapping={mapping} columns={columns} set={set} />
        </>
    );
}

/** Show/hide any layer or group from a column ("Badge" column: NEW = show, empty = hide). */
function VisibilitySection({ layers, mapping, columns, set }) {
    const { t } = useI18n();
    const rules = Object.values(mapping.visibility || {});
    const usable = layers.filter((l) => !l.locked && !(mapping.visibility || {})[l.id]);
    const [adding, setAdding] = React.useState("");
    const label = (l) => (l.path.length > 1 ? `${l.name} (${l.path.slice(0, -1).join(" / ")})` : l.name);
    const emptyOptions = VISIBILITY_EMPTY.map((v) => ({ value: v, label: t(`map.vis.empty.${v}`) }));
    return (
        <Section title={t("map.vis.title")}>
            <div className="ez-small ez-muted ez-mb2">{t("map.vis.hint")}</div>
            {rules.length > 0 && (
                <Card>
                    {rules.map((rule) => {
                        const layer = layers.find((l) => l.id === rule.layerId);
                        return (
                            <div key={rule.layerId} className="ez-layer">
                                <div className="ez-layer-main">
                                    <KindIcon kind={layer ? layer.kind : "pixel"} />
                                    <div className="ez-layer-name">
                                        <div className="ez-ellipsis">{layer ? layer.name : "?"}</div>
                                        {layer && layer.path.length > 1 && <div className="ez-small ez-muted ez-ellipsis">{layer.path.slice(0, -1).join(" / ")}</div>}
                                    </div>
                                    <div className="ez-layer-picker">
                                        <Select value={rule.column} options={columns} onChange={(c) => set(setVisibilityMapping(mapping, rule.layerId, c, rule.emptyPolicy))} />
                                    </div>
                                </div>
                                <div className="ez-layer-extra ez-row">
                                    <div className="ez-grow ez-mr2">
                                        <Field label={t("map.empty")}>
                                            <Select value={rule.emptyPolicy} options={emptyOptions} onChange={(v) => set(setVisibilityMapping(mapping, rule.layerId, rule.column, v))} />
                                        </Field>
                                    </div>
                                    <Button quiet onClick={() => set(setVisibilityMapping(mapping, rule.layerId, null))}>
                                        {t("map.vis.remove")}
                                    </Button>
                                </div>
                            </div>
                        );
                    })}
                </Card>
            )}
            <div className="ez-row">
                <div className="ez-grow ez-mr2">
                    <Select value={adding} placeholder={t("map.vis.pick")} options={usable.map((l) => ({ value: String(l.id), label: label(l) }))} onChange={setAdding} />
                </div>
                <Button
                    disabled={!adding || !columns.length}
                    onClick={() => {
                        const layer = layers.find((l) => String(l.id) === adding);
                        const byName = columns.find((c) => c.value.toLowerCase() === layer.name.toLowerCase());
                        set(setVisibilityMapping(mapping, layer.id, (byName || columns[0]).value));
                        setAdding("");
                    }}
                >
                    {t("map.vis.add")}
                </Button>
            </div>
        </Section>
    );
}
