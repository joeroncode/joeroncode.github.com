import type { OrderDTO, VerificationResultDTO } from "@ordercheck/shared";
import { useEffect, useState, type ChangeEvent } from "react";
import { useParams } from "react-router-dom";
import { OrderStatusBadge } from "../components/OrderStatusBadge";
import { ApiError, api } from "../lib/api";

function fileToBase64(file: File): Promise<{ data: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const [, base64] = result.split(",");
      resolve({ data: base64, mimeType: file.type });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<(OrderDTO & { verifications?: VerificationResultDTO[] }) | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState<VerificationResultDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api.get<typeof order>(`/orders/${id}`).then(setOrder);
  }, [id]);

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !id) return;

    setPreview(URL.createObjectURL(file));
    setError(null);
    setVerifying(true);
    setResult(null);
    try {
      const { data, mimeType } = await fileToBase64(file);
      const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp"];
      const verification = await api.post<VerificationResultDTO>(`/orders/${id}/verify`, {
        imageBase64: data,
        mimeType: allowedMimeTypes.includes(mimeType) ? mimeType : "image/jpeg",
      });
      setResult(verification);
      const refreshed = await api.get<typeof order>(`/orders/${id}`);
      setOrder(refreshed);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Verification failed");
    } finally {
      setVerifying(false);
    }
  }

  if (!order) return <p className="text-sm text-gray-500">Loading order...</p>;

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h1 className="text-lg font-semibold">Order {order.externalId ?? order.id.slice(0, 8)}</h1>
          <OrderStatusBadge status={order.status} />
        </div>
        <p className="mb-3 text-sm text-gray-600">
          {order.channel} · {order.customerName ?? "Walk-in / no name"}
        </p>
        <ul className="space-y-2">
          {order.items.map((item) => (
            <li key={item.id} className="flex justify-between rounded-md bg-gray-50 px-3 py-2 text-sm">
              <span>
                {item.quantity}x {item.name}
                {item.modifiers.length > 0 && (
                  <span className="text-gray-500"> ({item.modifiers.join(", ")})</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-lg font-semibold">Verify order</h2>
        <label className="mb-3 block cursor-pointer rounded-md border-2 border-dashed border-gray-300 p-6 text-center text-sm text-gray-500 hover:border-brand-400">
          {preview ? (
            <img src={preview} alt="Order preview" className="mx-auto max-h-48 rounded-md" />
          ) : (
            "Take or upload a photo of the packed order"
          )}
          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileChange} />
        </label>

        {verifying && <p className="text-sm text-gray-500">Running AI verification...</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}

        {result && (
          <div className="mt-3 space-y-2 rounded-md border border-gray-100 bg-gray-50 p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Verdict: {result.verdict.replace(/_/g, " ")}</span>
              <span className="text-xs text-gray-500">{Math.round(result.confidence * 100)}% confidence</span>
            </div>
            <p className="text-sm text-gray-700">{result.summary}</p>
            <ul className="space-y-1">
              {result.itemResults.map((item) => (
                <li key={item.orderItemId} className="flex items-center justify-between text-sm">
                  <span>{item.name}</span>
                  <span className={item.matched ? "text-green-600" : "text-red-600"}>
                    {item.matched ? "Detected" : "Missing"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
