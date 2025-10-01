import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { Auth } from '@/pages/Auth';
import { TeacherDashboard } from '@/pages/TeacherDashboard';
import { StudentDashboard } from '@/pages/StudentDashboard';
import { ClassRoom } from '@/pages/ClassRoom';
import { Toaster } from '@/components/ui/sonner';

function PrivateRoute({ children, allowedRole }: { children: React.ReactNode; allowedRole?: 'teacher' | 'student' }) {
  const { currentUser } = useAuth();

  if (!currentUser) {
    return <Navigate to="/" replace />;
  }

  if (allowedRole && currentUser.role !== allowedRole) {
    return <Navigate to={currentUser.role === 'teacher' ? '/teacher' : '/student'} replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  const { currentUser } = useAuth();

  return (
    <Routes>
      <Route
        path="/"
        element={currentUser ? (
          <Navigate to={currentUser.role === 'teacher' ? '/teacher' : '/student'} replace />
        ) : (
          <Auth />
        )}
      />
      <Route
        path="/teacher"
        element={
          <PrivateRoute allowedRole="teacher">
            <TeacherDashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/student"
        element={
          <PrivateRoute allowedRole="student">
            <StudentDashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/class/:classId"
        element={
          <PrivateRoute>
            <ClassRoom />
          </PrivateRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
        <Toaster />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;