import "./styles.css";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { queryClient } from "@/app/query-client.ts";
import { configureAuth } from "@/features/auth/index.ts";
import { router } from "./router.ts";

configureAuth();

const container = document.getElementById("root");
if (!container) throw new Error("Falta el elemento #root en index.html");

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
