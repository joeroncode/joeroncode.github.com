import type { LocationDTO } from "@ordercheck/shared";
import { useEffect, useState, type FormEvent } from "react";
import { ApiError, api } from "../lib/api";

interface POSIntegrationSummary {
  id: string;
  provider: string;
  locationId: string;
  isActive: boolean;
}

interface ConnectResponse {
  id: string;
  provider: string;
  locationId: string;
  webhookUrl: string;
  webhookSecret: string;
}

const PROVIDERS = ["SQUARE", "MOCK"] as const;

export function SettingsPage() {
  const [locations, setLocations] = useState<LocationDTO[]>([]);
  const [integrations, setIntegrations] = useState<POSIntegrationSummary[]>([]);
  const [provider, setProvider] = useState<(typeof PROVIDERS)[number]>("SQUARE");
  const [locationId, setLocationId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [connected, setConnected] = useState<ConnectResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function refresh() {
    api.get<LocationDTO[]>("/locations").then((locs) => {
      setLocations(locs);
      if (!locationId && locs[0]) setLocationId(locs[0].id);
    });
    api.get<POSIntegrationSummary[]>("/pos-integrations").then(setIntegrations);
  }

  useEffect(refresh, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const response = await api.post<ConnectResponse>("/pos-integrations", {
        provider,
        locationId,
        accessToken,
      });
      setConnected(response);
      setAccessToken("");
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to connect POS integration");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h1 className="mb-3 text-lg font-semibold">POS integrations</h1>
        {integrations.length === 0 ? (
          <p className="text-sm text-gray-500">No POS integrations connected yet.</p>
        ) : (
          <ul className="mb-4 space-y-1 text-sm">
            {integrations.map((integ) => (
              <li key={integ.id} className="flex justify-between rounded-md bg-gray-50 px-3 py-2">
                <span>{integ.provider}</span>
                <span className="text-gray-500">{integ.isActive ? "Active" : "Inactive"}</span>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700">Provider</label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as (typeof PROVIDERS)[number])}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              {PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Location</label>
            <select
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Access token</label>
            <input
              required
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              placeholder="Paste the POS provider's API access token"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={submitting || !locationId}
            className="rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {submitting ? "Connecting..." : "Connect"}
          </button>
        </form>

        {connected && (
          <div className="mt-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm">
            <p className="font-medium text-green-800">Connected. Configure this webhook in your POS dashboard:</p>
            <code className="mt-1 block break-all text-xs text-green-700">{connected.webhookUrl}</code>
            <p className="mt-2 text-green-800">Webhook secret (store securely, shown once):</p>
            <code className="mt-1 block break-all text-xs text-green-700">{connected.webhookSecret}</code>
          </div>
        )}
      </div>
    </div>
  );
}
