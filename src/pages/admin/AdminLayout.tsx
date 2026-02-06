import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../../components/admin/AuthContext'

const navItems = [
  { to: '/admin', label: 'Dashboard', end: true },
  { to: '/admin/questionnaires', label: 'Questionnaires' },
  { to: '/admin/use-cases', label: 'Use Cases' },
  { to: '/admin/decision-matrix', label: 'Decision Matrix' },
]

export default function AdminLayout() {
  const { user, signOut } = useAuth()

  return (
    <div className="min-h-screen bg-gray-100 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900 text-white flex flex-col flex-shrink-0">
        <div className="p-4 border-b border-gray-800">
          <h1 className="text-lg font-bold">SAP BTP Admin</h1>
          <p className="text-xs text-gray-400 mt-1 truncate">{user?.email}</p>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `block px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-gray-800">
          <button
            onClick={signOut}
            className="w-full px-3 py-2 text-sm text-gray-300 hover:bg-gray-800 hover:text-white rounded-lg transition-colors text-left"
          >
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="p-6">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
