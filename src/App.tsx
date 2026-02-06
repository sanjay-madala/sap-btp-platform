import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './components/admin/AuthContext'
import ProtectedRoute from './components/admin/ProtectedRoute'
import CustomerDetails from './pages/CustomerDetails'
import Questionnaire from './pages/Questionnaire'
import ThankYou from './pages/ThankYou'
import AdminLogin from './pages/admin/AdminLogin'
import AdminLayout from './pages/admin/AdminLayout'
import Dashboard from './pages/admin/Dashboard'
import QuestionnairesManager from './pages/admin/QuestionnairesManager'
import SectionsManager from './pages/admin/SectionsManager'
import QuestionsManager from './pages/admin/QuestionsManager'
import UseCasesManager from './pages/admin/UseCasesManager'
import DecisionMatrixManager from './pages/admin/DecisionMatrixManager'

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<CustomerDetails />} />
          <Route path="/questionnaire/:submissionId" element={<Questionnaire />} />
          <Route path="/thank-you/:submissionId" element={<ThankYou />} />

          {/* Admin auth */}
          <Route path="/admin/login" element={<AdminLogin />} />

          {/* Protected admin routes */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute>
                <AdminLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="questionnaires" element={<QuestionnairesManager />} />
            <Route path="questionnaires/:questionnaireId/sections" element={<SectionsManager />} />
            <Route path="questionnaires/:questionnaireId/sections/:sectionId/questions" element={<QuestionsManager />} />
            <Route path="use-cases" element={<UseCasesManager />} />
            <Route path="decision-matrix" element={<DecisionMatrixManager />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
