import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import "./index.css";
import { installAppZoomGuard } from "./lib/appZoomGuard";
import { initPlatform } from "./platform";

installAppZoomGuard();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      // Dados ficam "frescos" por 1 min: voltar a uma tela logo depois não
      // refaz as consultas. Mutations continuam invalidando o que mudam.
      staleTime: 60_000,
    },
  },
});

// No Desktop a sessão salva precisa estar em memória antes da primeira chamada à API.
void initPlatform().finally(() => ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
));
