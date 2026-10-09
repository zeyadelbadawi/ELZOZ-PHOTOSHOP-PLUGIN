import React from "react";
import { useApp } from "../AppContext.jsx";
import { useI18n } from "../i18n.jsx";
import { Alert, Button, Card, Checkbox, Field, FileField, KindIcon, Section, Select } from "../../ui/components.jsx";
import { isImageLayer, isTextLayer } from "../../domain/layers.js";
import { autoMap, mappedCount, setImageMapping, setTextMapping } from "../../domain/mapping.js";

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

    const columns = data.table.headers.map((h) => ({ value: h.key, label: h.key }));
    const firstRow = data.table.rows.find((r) => !r.isEmpty);
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
                <Button quiet onClick={() => set(autoMap(mapping, data.table.headers, template.layers, data.table.rows))}>
                    {t("map.auto")}
                </Button>
            </div>
            <div className="ez-subtitle">
                {t("map.subtitle")} {mappedCount(mapping) > 0 && <span className="ez-strong">{t("map.count", { n: mappedCount(mapping) })}</span>}
            </div>
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
        </>
    );
}
