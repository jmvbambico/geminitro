import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { Overview } from "@/pages/Overview";
import { Setup } from "@/pages/Setup";
import { useSocket } from "@/hooks/useSocket";

export default function App() {
  const { keys, logs, trafficTick, connected, fullStats } = useSocket();

  return (
    <BrowserRouter basename="/dashboard">
      <Routes>
        <Route path="/setup" element={<Setup />} />
        <Route element={<Layout connected={connected} />}>
          <Route index element={<Navigate to="/overview" replace />} />
          <Route
            path="/overview"
            element={
              <Overview keys={keys} logs={logs} trafficTick={trafficTick} fullStats={fullStats} />
            }
          />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
