import React, { useMemo, useState } from "react";
import { useApp } from "../AppContext.jsx";
import { useI18n } from "../i18n.jsx";
import { Alert, Button, Card, Field, KindIcon, NumberInput, Section, Select } from "../../ui/components.jsx";
import { buildTimeline, EASINGS, FORMATS, FPS_OPTIONS, PRESETS } from "../../domain/video/timeline.js";
import { previewPlan, timelineSpec } from "../state.js";

const secs = (ms) => Math.round(ms / 100) / 10;

export default function AnimateStep() {
    const { state, dispatch, services } = useApp();
    const { t } = useI18n();
    const [preview, setPreview] = useState({ at: 0, url: null, busy: false, error: null });
    const { video, template } = state;
    const tl = useMemo(() => buildTimeline(timelineSpec(state)), [state.video]); // eslint-disable-line react-hooks/exhaustive-deps
    if (!template) return <Alert tone="info">{t("template.empty")}</Alert>;

    const setVideo = (patch) => dispatch({ type: "video", patch });
    const animatable = template.layers.filter((l) => l.kind !== "group" && !l.locked);

    const renderPreview = async () => {
        if (!tl.ok) return;
        setPreview((p) => ({ ...p, busy: true, error: null }));
        try {
            const plan = previewPlan(state);
            const frame = Math.min(tl.timeline.frameCount - 1, Math.round((preview.at * tl.timeline.fps)));
            const url = await services.previewFrame({
                template: template.entry ? { entry: template.entry } : { documentId: template.documentId },
                layers: template.layers,
                item: plan.items && plan.items[0],
                folders: Object.fromEntries(Object.entries(state.folders).map(([k, f]) => [k, { name: f.name, entry: f.entry }])),
                timeline: tl.timeline,
                frame
            });
            setPreview((p) => ({ ...p, url, busy: false }));
        } catch (e) {
            setPreview((p) => ({ ...p, busy: false, error: e.message }));
        }
    };

    return (
        <>
            <div className="ez-title">{t("animate.title")}</div>
            <div className="ez-subtitle">{t("animate.subtitle")}</div>
            {!services.caps.layerTransforms && <Alert tone="error">{t("compat.unsupported", { v: services.caps.photoshopVersion })}</Alert>}
            <Card>
                <Field label={t("animate.format")}>
                    <Select value={video.format} onChange={(v) => setVideo({ format: v })} options={Object.values(FORMATS).map((f) => ({ value: f.id, label: `${f.label} · ${f.width}×${f.height}` }))} />
                </Field>
                <div className="ez-row">
                    <div className="ez-grow ez-mr2">
                        <Field label={t("animate.fps")}>
                            <Select value={String(video.fps)} onChange={(v) => setVideo({ fps: Number(v) })} options={FPS_OPTIONS.map((f) => ({ value: String(f), label: `${f} fps` }))} />
                        </Field>
                    </div>
                    <div className="ez-grow ez-mr2">
                        <Field label={t("animate.duration")}>
                            <NumberInput value={secs(video.durationMs)} min={1} max={60} step={0.5} suffix="s" onChange={(n) => setVideo({ durationMs: Math.round(n * 1000) })} />
                        </Field>
                    </div>
                    <div className="ez-grow">
                        <Field label={t("animate.fadeOut")}>
                            <NumberInput value={secs(video.fadeOutMs)} min={0} max={10} step={0.1} suffix="s" onChange={(n) => setVideo({ fadeOutMs: Math.round(n * 1000) })} />
                        </Field>
                    </div>
                </div>
            </Card>
            <Alert tone="info">{t("animate.output")}</Alert>

            <Section title={t("animate.layers")}>
                <Card>
                    {animatable.map((layer) => {
                        const track = video.tracks[layer.id];
                        const preset = track ? track.preset : "none";
                        const setTrack = (patch) => dispatch({ type: "track", layerId: layer.id, track: { preset, startMs: 0, lengthMs: 800, easing: "easeOut", ...(track || {}), ...patch } });
                        return (
                            <div key={layer.id} className="ez-layer">
                                <div className="ez-layer-main">
                                    <KindIcon kind={layer.kind} />
                                    <div className="ez-layer-name">
                                        <div className="ez-ellipsis" title={layer.path.join(" / ")}>
                                            {layer.name}
                                        </div>
                                    </div>
                                    <div className="ez-layer-picker">
                                        <Select
                                            value={preset}
                                            onChange={(v) => (v === "none" ? dispatch({ type: "track", layerId: layer.id, track: null }) : setTrack({ preset: v, easing: PRESETS[v].defaultEasing || (track && track.easing) || "easeOut" }))}
                                            options={Object.entries(PRESETS).map(([k, p]) => ({ value: k, label: p.label }))}
                                        />
                                    </div>
                                </div>
                                {track && !PRESETS[preset].wholeClip && (
                                    <div className="ez-layer-extra ez-row">
                                        <div className="ez-grow ez-mr2">
                                            <Field label={t("animate.start")}>
                                                <NumberInput value={secs(track.startMs)} min={0} max={60} step={0.1} suffix="s" onChange={(n) => setTrack({ startMs: Math.round(n * 1000) })} />
                                            </Field>
                                        </div>
                                        <div className="ez-grow ez-mr2">
                                            <Field label={t("animate.length")}>
                                                <NumberInput value={secs(track.lengthMs)} min={0.1} max={60} step={0.1} suffix="s" onChange={(n) => setTrack({ lengthMs: Math.round(n * 1000) })} />
                                            </Field>
                                        </div>
                                        <div className="ez-grow">
                                            <Field label={t("animate.easing")}>
                                                <Select value={track.easing} onChange={(v) => setTrack({ easing: v })} options={Object.keys(EASINGS).map((k) => ({ value: k, label: t(`easing.${k}`) }))} />
                                            </Field>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </Card>
            </Section>

            {!tl.ok && tl.errors.map((e, i) => <Alert key={i} tone="error">{e.message}</Alert>)}

            {tl.ok && (
                <Section title={t("animate.preview")}>
                    <div className="ez-row ez-mb2">
                        <div className="ez-grow ez-mr2">
                            <NumberInput value={preview.at} min={0} max={secs(tl.timeline.durationMs)} step={0.1} suffix="s" onChange={(n) => setPreview((p) => ({ ...p, at: n }))} />
                        </div>
                        <Button onClick={renderPreview} disabled={preview.busy}>
                            {preview.busy ? "…" : t("animate.preview")}
                        </Button>
                    </div>
                    {preview.error && <Alert tone="error">{preview.error}</Alert>}
                    {preview.url && <img className="ez-preview-img" src={preview.url} alt="" />}
                    <div className="ez-small ez-muted ez-mt1">{t("animate.previewNote")}</div>
                </Section>
            )}
        </>
    );
}
