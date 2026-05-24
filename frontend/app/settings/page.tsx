"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_API_URL,
  getApiUrl,
  saveApiUrl,
  testConnection,
} from "@/lib/api";

type TestStatus = "idle" | "testing" | "ok" | "error";

const STATUS_UI: Record<TestStatus, { label: string; className: string }> = {
  idle:    { label: "",              className: "" },
  testing: { label: "Testing…",     className: "text-zinc-400 animate-pulse" },
  ok:      { label: "Connected",    className: "text-emerald-400" },
  error:   { label: "Unreachable",  className: "text-red-400" },
};

export default function SettingsPage() {
  const [url, setUrl] = useState("");
  const [saved, setSaved] = useState(false);
  const [testStatus, setTestStatus] = useState<TestStatus>("idle");

  useEffect(() => {
    setUrl(getApiUrl());
  }, []);

  const handleSave = () => {
    saveApiUrl(url.trim());
    setSaved(true);
    setTestStatus("idle");
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    saveApiUrl("");
    setUrl(DEFAULT_API_URL);
    setTestStatus("idle");
  };

  const handleTest = async () => {
    saveApiUrl(url.trim());
    setTestStatus("testing");
    const ok = await testConnection();
    setTestStatus(ok ? "ok" : "error");
  };

  const isDirty = url.trim().replace(/\/$/, "") !== getApiUrl();

  return (
    <div className="p-8 max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-white">Settings</h1>
        <p className="text-sm text-zinc-500 mt-1">Configure Voyager for your environment.</p>
      </div>

      {/* Connection section */}
      <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-6">
        <h2 className="text-white font-medium mb-1">Backend Connection</h2>
        <p className="text-xs text-zinc-500 mb-5">
          The URL of your FastAPI backend. Stored in the browser — overrides{" "}
          <code className="text-zinc-400">NEXT_PUBLIC_API_URL</code>.
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-zinc-400 mb-1.5" htmlFor="api-url">
              API Base URL
            </label>
            <input
              id="api-url"
              type="url"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setTestStatus("idle");
              }}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
              placeholder={DEFAULT_API_URL}
              className="w-full bg-zinc-950 border border-zinc-700 focus:border-indigo-500 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none transition-colors font-mono"
            />
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-indigo-500 hover:bg-indigo-400 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {saved ? "Saved!" : "Save"}
            </button>
            <button
              onClick={handleTest}
              disabled={testStatus === "testing"}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-300 text-sm font-medium rounded-lg transition-colors"
            >
              Test Connection
            </button>
            <button
              onClick={handleReset}
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-sm rounded-lg transition-colors"
            >
              Reset to Default
            </button>
            {testStatus !== "idle" && (
              <span className={`text-sm font-medium ${STATUS_UI[testStatus].className}`}>
                {testStatus === "ok" && (
                  <span className="mr-1">✓</span>
                )}
                {testStatus === "error" && (
                  <span className="mr-1">✕</span>
                )}
                {STATUS_UI[testStatus].label}
              </span>
            )}
          </div>
        </div>
      </section>

      {/* About section */}
      <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
        <h2 className="text-white font-medium mb-4">About</h2>
        <dl className="space-y-3 text-sm">
          {[
            ["Application", "Voyager — AI Document Intelligence"],
            ["Version",     "v0.1.0"],
            ["Stack",       "Next.js · FastAPI · ChromaDB · Groq"],
            ["Model",       "llama-3.3-70b-versatile"],
          ].map(([label, value]) => (
            <div key={label} className="flex gap-4">
              <dt className="w-28 shrink-0 text-zinc-500">{label}</dt>
              <dd className="text-zinc-300">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
