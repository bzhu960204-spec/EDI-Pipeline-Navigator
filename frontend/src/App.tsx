import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginPage } from './features/auth/LoginPage';
import { RegisterPage } from './features/auth/RegisterPage';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { WorkflowPage } from './features/workflow/WorkflowPage';
import { SubWorkflowsPage } from './features/workflow/SubWorkflowsPage';
import { RolesPage } from './features/workflow/RolesPage';
import { SchemaTemplatesPage } from './features/schemaTemplates/SchemaTemplatesPage';
import { ArtifactsPage } from './features/artifacts/ArtifactsPage';
import { ArtifactDetailPage } from './features/artifacts/ArtifactDetailPage';
import { DirectoryTemplatesPage } from './features/artifacts/DirectoryTemplatesPage';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<DashboardPage />} />
          <Route path="/workflow" element={<SubWorkflowsPage />} />
          <Route path="/workflow/edit/:id" element={<WorkflowPage />} />
          <Route path="/workflow/roles" element={<RolesPage />} />
          <Route path="/schema-templates" element={<SchemaTemplatesPage />} />
          <Route path="/artifacts" element={<ArtifactsPage />} />
          <Route path="/artifacts/templates" element={<DirectoryTemplatesPage />} />
          <Route path="/artifacts/:id" element={<ArtifactDetailPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
