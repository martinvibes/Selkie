import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { Home } from "./pages/Home";
import { Dashboard } from "./pages/Dashboard";
import { Account } from "./pages/Account";
import { TransactionDetail } from "./pages/TransactionDetail";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />

          {/* Your wallet, tabbed. */}
          <Route path="/dashboard" element={<Navigate to="/dashboard/activity" replace />} />
          <Route path="/dashboard/:tab" element={<Dashboard />} />

          {/* Shareable: a handle can always be paid, even before it has a wallet. */}
          <Route path="/account/:handle" element={<Account />} />

          {/* A receipt, readable only by the two people in the payment. */}
          <Route path="/tx/:id" element={<TransactionDetail />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
