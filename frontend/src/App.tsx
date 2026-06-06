import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "@/components/Layout/AppLayout";
import { HomePage } from "@/pages/HomePage";
import { WorkshopPage } from "@/pages/WorkshopPage";
import { HostDashboard } from "@/pages/HostDashboard";
import { KnowledgeBasePage } from "@/pages/KnowledgeBasePage";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/workshop/:id" element={<WorkshopPage />} />
          <Route path="/workshop/:id/host" element={<HostDashboard />} />
          <Route path="/knowledge" element={<KnowledgeBasePage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
