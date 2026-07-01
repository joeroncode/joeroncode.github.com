import type { OrderDTO } from "@ordercheck/shared";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { OrderStatusBadge } from "../components/OrderStatusBadge";
import { api } from "../lib/api";

const STATUS_FILTERS = ["ALL", "READY_FOR_VERIFICATION", "VERIFIED", "FLAGGED", "PENDING"] as const;

export function DashboardPage() {
  const [orders, setOrders] = useState<OrderDTO[]>([]);
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]>("ALL");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const query = statusFilter === "ALL" ? "" : `?status=${statusFilter}`;
    api
      .get<OrderDTO[]>(`/orders${query}`)
      .then(setOrders)
      .finally(() => setLoading(false));
  }, [statusFilter]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Order queue</h1>
        <div className="flex gap-2">
          {STATUS_FILTERS.map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`rounded-md px-3 py-1.5 text-sm ${
                statusFilter === status ? "bg-brand-600 text-white" : "bg-white text-gray-600 hover:bg-gray-100"
              } border border-gray-200`}
            >
              {status.replace(/_/g, " ")}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Loading orders...</p>
      ) : orders.length === 0 ? (
        <p className="text-sm text-gray-500">No orders found.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs font-medium uppercase text-gray-500">
              <tr>
                <th className="px-4 py-2">Order</th>
                <th className="px-4 py-2">Customer</th>
                <th className="px-4 py-2">Channel</th>
                <th className="px-4 py-2">Items</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {orders.map((order) => (
                <tr key={order.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <Link to={`/orders/${order.id}`} className="font-medium text-brand-600 hover:underline">
                      {order.externalId ?? order.id.slice(0, 8)}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{order.customerName ?? "—"}</td>
                  <td className="px-4 py-2">{order.channel}</td>
                  <td className="px-4 py-2">{order.items.length}</td>
                  <td className="px-4 py-2">
                    <OrderStatusBadge status={order.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
