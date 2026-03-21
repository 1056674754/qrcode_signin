import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { pb } from '@/lib/pb';
import Layout from '@/components/Layout';
import Login from '@/pages/Login';
import OAuthCallback from '@/pages/OAuthCallback';
import Events from '@/pages/Events';
import Display from '@/pages/Display';
import CheckIn from '@/pages/CheckIn';
import History from '@/pages/History';
import ScanLand from '@/pages/ScanLand';

function RequireAuth({ children }: { children: React.ReactNode }) {
  if (!pb.authStore.isValid) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/oauth-callback" element={<OAuthCallback />} />
        <Route path="/s/:eventId" element={<ScanLand />} />
        <Route path="/display/:eventId" element={<RequireAuth><Display /></RequireAuth>} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }
        >
          <Route index element={<Navigate to="/events" replace />} />
          <Route path="events" element={<Events />} />
          <Route path="checkin" element={<CheckIn />} />
          <Route path="history" element={<History />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
