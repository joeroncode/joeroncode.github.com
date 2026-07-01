const STYLES: Record<string, string> = {
  PENDING: "bg-gray-100 text-gray-700",
  IN_PREP: "bg-blue-100 text-blue-700",
  READY_FOR_VERIFICATION: "bg-amber-100 text-amber-700",
  VERIFIED: "bg-green-100 text-green-700",
  FLAGGED: "bg-red-100 text-red-700",
  HANDED_OFF: "bg-gray-200 text-gray-600",
  CANCELLED: "bg-gray-100 text-gray-400",
};

export function OrderStatusBadge({ status }: { status: string }) {
  const style = STYLES[status] ?? "bg-gray-100 text-gray-700";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${style}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}
