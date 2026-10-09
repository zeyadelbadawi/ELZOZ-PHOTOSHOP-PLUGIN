// Developer-only panel for the Photoshop self-test (English only; never in
// production builds: Account renders it behind the __ELZOZ_DEV__ constant).
import React, { useState } from "react";
import { Alert, Button, Card, Section } from "../ui/components.jsx";

export default function SelfTestPanel({ run }) {
    const [steps, setSteps] = useState([]);
    const [state, setState] = useState({ busy: false, report: null, error: null });

    const start = async () => {
        setSteps([]);
        setState({ busy: true, report: null, error: null });
        try {
            const report = await run((s) => setSteps((prev) => [...prev, s]));
            setState({ busy: false, report, error: null });
        } catch (e) {
            setState({ busy: false, report: null, error: e.message });
        }
    };

    const { busy, report, error } = state;
    return (
        <Section title="Developer: Photoshop self-test">
            <Card>
                <div className="ez-small ez-muted ez-mb2">
                    Choose the QA kit folder (templates, spreadsheets, images). Generates 3 designs and 1 video with the real engine, checks the files, and saves elzoz-selftest-report.json next to them. No credits are used.
                </div>
                <Button variant="primary" onClick={start} disabled={busy}>
                    {busy ? "Running…" : "Run self-test"}
                </Button>
                {steps.map((s) => (
                    <div key={s.id} className="ez-result">
                        <div className={`ez-dot ez-dot-${s.status === "pass" ? "succeeded" : "failed"}`} />
                        <div className="ez-grow">
                            <div className="ez-ellipsis">{s.title}</div>
                            {s.status !== "pass" && s.detail && <div className="ez-small ez-muted">{s.detail.message}</div>}
                        </div>
                        <div className="ez-small ez-muted">{(s.ms / 1000).toFixed(1)} s</div>
                    </div>
                ))}
            </Card>
            {error && <Alert tone="error">{error}</Alert>}
            {report && (
                <Alert tone={report.passed ? "success" : "error"} title={report.passed ? "Self-test passed" : "Self-test failed"}>
                    {report.savedTo ? `Report: ${report.savedTo}` : report.saveError}
                </Alert>
            )}
        </Section>
    );
}
