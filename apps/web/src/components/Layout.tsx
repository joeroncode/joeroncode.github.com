import { Link, Outlet } from "react-router-dom";
import { useAuth } from "../lib/auth";

export function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/" className="text-lg font-semibold text-brand-700">
            OrderCheck
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link to="/" className="text-gray-600 hover:text-gray-900">
              Orders
            </Link>
            <Link to="/settings" className="text-gray-600 hover:text-gray-900">
              Settings
            </Link>
            {user && (
              <button onClick={logout} className="text-gray-600 hover:text-gray-900">
                Sign out ({user.email})
              </button>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
