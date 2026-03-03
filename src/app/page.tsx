"use client";

import { useState } from "react";

export default function WebhookTester() {
    const [token, setToken] = useState("quackxel_rahasia_123");
    const [challenge, setChallenge] = useState("1158201444");

    // State untuk POST Request
    const [senderNumber, setSenderNumber] = useState("6281234567890");
    const [messageBody, setMessageBody] = useState("Tolong tutup kantin dong");

    const [loadingGet, setLoadingGet] = useState(false);
    const [loadingPost, setLoadingPost] = useState(false);
    const [result, setResult] = useState<{ type: string; status: number; body: string } | null>(null);

    const handleTestGet = async () => {
        setLoadingGet(true);
        setResult(null);

        try {
            const url = `/api/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(
                token
            )}&hub.challenge=${encodeURIComponent(challenge)}`;

            const response = await fetch(url, {
                method: "GET",
            });

            const text = await response.text();
            setResult({ type: "GET", status: response.status, body: text });
        } catch (error: any) {
            setResult({ type: "GET", status: 500, body: error.message || "Failed to fetch" });
        } finally {
            setLoadingGet(false);
        }
    };

    const handleTestPost = async () => {
        setLoadingPost(true);
        setResult(null);

        try {
            const url = `/api/webhook/whatsapp`;

            // Bungkus payload Mentah (Tamu 2) sesuai format Meta
            const payloadMeta = {
                "object": "whatsapp_business_account",
                "entry": [
                    {
                        "changes": [
                            {
                                "value": {
                                    "metadata": {
                                        "display_phone_number": "6281111111",
                                        "phone_number_id": "123456789"
                                    },
                                    "contacts": [{ "profile": { "name": "Pak Budi Kantin" } }],
                                    "messages": [
                                        {
                                            "from": senderNumber,
                                            "id": `wamid.HBg${Date.now()}`,
                                            "type": "text",
                                            "text": {
                                                "body": messageBody
                                            }
                                        }
                                    ]
                                }
                            }
                        ]
                    }
                ]
            };

            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payloadMeta)
            });

            const json = await response.json();
            // Print JSON ke text
            setResult({ type: "POST", status: response.status, body: JSON.stringify(json, null, 2) });
        } catch (error: any) {
            setResult({ type: "POST", status: 500, body: error.message || "Failed to fetch POST" });
        } finally {
            setLoadingPost(false);
        }
    };

    return (
        <main style={styles.container}>
            <header style={styles.header}>
                <h1 style={styles.title}>QuackXel Webhook Tester</h1>
                <p style={styles.subtitle}>Simulator API WhatsApp Meta</p>
            </header>

            <div style={styles.grid}>
                {/* Kolom 1: Simulasi GET */}
                <section style={styles.card}>
                    <h2 style={styles.cardTitle}>Tamu 1: Meta Verification (GET)</h2>
                    <p style={styles.description}>
                        Mensimulasikan saat awal Meta mengetuk server kamu pakai Token Rahasia.
                    </p>

                    <div style={styles.formGroup}>
                        <label style={styles.label}>Verify Token</label>
                        <input
                            type="text"
                            value={token}
                            onChange={(e) => setToken(e.target.value)}
                            style={styles.input}
                        />
                    </div>

                    <div style={styles.formGroup}>
                        <label style={styles.label}>Challenge</label>
                        <input
                            type="text"
                            value={challenge}
                            onChange={(e) => setChallenge(e.target.value)}
                            style={styles.input}
                        />
                    </div>

                    <button
                        onClick={handleTestGet}
                        disabled={loadingGet}
                        style={{
                            ...styles.button,
                            opacity: loadingGet ? 0.7 : 1,
                            backgroundColor: "#3182ce"
                        }}
                    >
                        {loadingGet ? "Loading..." : "Simulate GET Request"}
                    </button>
                </section>

                {/* Kolom 2: Simulasi POST */}
                <section style={styles.card}>
                    <h2 style={styles.cardTitle}>Tamu 2: Pesan WA Masuk (POST)</h2>
                    <p style={styles.description}>
                        Mensimulasikan pesan yang dilempar dari aplikasi WA client ke server kamu.
                    </p>

                    <div style={styles.formGroup}>
                        <label style={styles.label}>Nomor Pengirim (from)</label>
                        <input
                            type="text"
                            value={senderNumber}
                            onChange={(e) => setSenderNumber(e.target.value)}
                            style={styles.input}
                        />
                    </div>

                    <div style={styles.formGroup}>
                        <label style={styles.label}>Isi Teks Pesan (text.body)</label>
                        <input
                            type="text"
                            value={messageBody}
                            onChange={(e) => setMessageBody(e.target.value)}
                            style={styles.input}
                        />
                    </div>

                    <button
                        onClick={handleTestPost}
                        disabled={loadingPost}
                        style={{
                            ...styles.button,
                            opacity: loadingPost ? 0.7 : 1,
                            backgroundColor: "#38a169"
                        }}
                    >
                        {loadingPost ? "Loading..." : "Simulate POST Payload"}
                    </button>
                    <small style={styles.helpText}>Lihat log Terminal Next.js Anda (console.log) setelah di-klik</small>
                </section>
            </div>

            {result && (
                <div
                    style={{
                        ...styles.resultBox,
                        backgroundColor: result.status === 200 ? "#e6fffa" : "#fff5f5",
                        borderColor: result.status === 200 ? "#38b2ac" : "#fc8181",
                    }}
                >
                    <h3
                        style={{
                            ...styles.resultTitle,
                            color: result.status === 200 ? "#285e61" : "#9b2c2c",
                        }}
                    >
                        [{result.type}] Response Code: {result.status}
                    </h3>
                    <pre style={styles.preCode}>
                        {result.body || "<Empty Response>"}
                    </pre>
                </div>
            )}
        </main>
    );
}

const styles: { [key: string]: React.CSSProperties } = {
    container: {
        minHeight: "100vh",
        backgroundColor: "#f7fafc",
        fontFamily: "system-ui, -apple-system, sans-serif",
        padding: "2rem",
        color: "#2d3748",
    },
    header: {
        textAlign: "center" as const,
        marginBottom: "2rem",
    },
    title: {
        fontSize: "2.5rem",
        fontWeight: "bold",
        margin: "0 0 0.5rem 0",
        color: "#2b6cb0",
    },
    subtitle: {
        fontSize: "1.25rem",
        color: "#4a5568",
        margin: 0,
    },
    grid: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
        gap: "2rem",
        maxWidth: "1000px",
        margin: "0 auto",
    },
    card: {
        backgroundColor: "#ffffff",
        borderRadius: "12px",
        boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
        padding: "2rem",
    },
    cardTitle: {
        fontSize: "1.25rem",
        fontWeight: "600",
        marginTop: 0,
        marginBottom: "0.5rem",
    },
    description: {
        color: "#718096",
        marginBottom: "1.5rem",
        lineHeight: 1.5,
        fontSize: "0.9rem",
    },
    formGroup: {
        marginBottom: "1.5rem",
    },
    label: {
        display: "block",
        fontWeight: "600",
        marginBottom: "0.5rem",
        color: "#4a5568",
    },
    input: {
        width: "100%",
        padding: "0.75rem",
        borderRadius: "6px",
        border: "1px solid #e2e8f0",
        fontSize: "1rem",
        boxSizing: "border-box" as const,
        outline: "none",
    },
    helpText: {
        display: "block",
        marginTop: "0.5rem",
        color: "#a0aec0",
        fontSize: "0.875rem",
        textAlign: "center" as const
    },
    button: {
        width: "100%",
        color: "white",
        fontWeight: "bold",
        padding: "0.75rem",
        borderRadius: "6px",
        border: "none",
        fontSize: "1rem",
        transition: "background-color 0.2s",
        cursor: "pointer",
    },
    resultBox: {
        marginTop: "2rem",
        padding: "1rem",
        borderRadius: "6px",
        borderWidth: "1px",
        borderStyle: "solid",
        maxWidth: "1000px",
        margin: "2rem auto 0 auto",
    },
    resultTitle: {
        margin: "0 0 0.5rem 0",
        fontSize: "1.125rem",
    },
    preCode: {
        backgroundColor: "rgba(0,0,0,0.05)",
        padding: "0.5rem",
        borderRadius: "4px",
        margin: 0,
        overflowX: "auto" as const,
        fontSize: "0.875rem",
    },
};
