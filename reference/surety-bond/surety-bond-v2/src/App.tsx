import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/themes/theme-provider";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/hooks/use-auth";

import NotFound from "@/pages/not-found";

import { LoginPage } from "./pages/auth/login";
import { AgentDashboard } from "./pages/agent/dashboard";
import { AgentBondsList } from "./pages/agent/bonds";
import { AgentBondDetail } from "./pages/agent/bond-detail";
import { AgentConversationsList } from "./pages/agent/conversations";
import { AgentConversationDetail } from "./pages/agent/conversation-detail";
import { AgentNewBond } from "./pages/agent/new-bond";
import { BondApplicationWizard } from "./pages/agent/bond-application-wizard";
import { BondFormLibrary } from "./pages/agent/bond-form-library";
import { BondFormDetail } from "./pages/agent/bond-form-detail";
import { ClientsPage } from "./pages/agent/clients";
import { ClientDetail } from "./pages/agent/client-detail";
import { UnderwritingReview } from "./pages/agent/underwriting";
import { RenewalsPage } from "./pages/agent/renewals";
import { ApplicationSummary } from "./pages/agent/application-summary";
import { PrincipalDashboard } from "./pages/principal/dashboard";
import { PrincipalNewBond } from "./pages/principal/new-bond";
import { PrincipalBondDetail } from "./pages/principal/bond-detail";
import { PrincipalChat } from "./pages/principal/chat";
import { PrincipalPayments } from "./pages/principal/payments";
import { CCPaymentPage } from "./pages/payment/cc-payment";
import { PrivacyPolicyPage } from "./pages/privacy-policy";
import { TermsAndConditionsPage } from "./pages/terms-and-conditions";
import { AIFeaturesInfographic } from "./pages/infographics/ai-features";
import { BusinessFeaturesInfographic } from "./pages/infographics/business-features";
import { UnderwriterDashboard } from "./pages/underwriter/dashboard";
import { UnderwriterReview } from "./pages/underwriter/review";
import { UnderwriterBondDetail } from "./pages/underwriter/bond-detail";
import { UnderwriterBondsList } from "./pages/underwriter/bonds";
import { UnderwriterPrincipalDetail } from "./pages/underwriter/principal-detail";
import { UWBondApplicationWizard } from "./pages/underwriter/bond-application-wizard";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5,
    },
  },
});

function ProtectedRoute({ children, allowedRoles }: { children: React.ReactNode; allowedRoles?: string[] }) {
  const { token, role } = useAuth();
  if (!token) return <Redirect to="/" />;
  if (allowedRoles && role && !allowedRoles.includes(role)) {
    const dest = role === "agent" ? "/agent/dashboard" : role === "principal" ? "/principal/dashboard" : "/underwriter/dashboard";
    return <Redirect to={dest} />;
  }
  return <>{children}</>;
}

function AppRoutes() {
  const { token, role } = useAuth();

  return (
    <Switch>
      <Route path="/">{() => {
        if (token && role) {
          const dest = role === "agent" ? "/agent/dashboard" : role === "principal" ? "/principal/dashboard" : "/underwriter/dashboard";
          return <Redirect to={dest} />;
        }
        return <LoginPage />;
      }}</Route>

      <Route path="/agent">{() => <Redirect to="/agent/dashboard" />}</Route>
      <Route path="/agent/dashboard">{() => <ProtectedRoute allowedRoles={["agent"]}><AppLayout><AgentDashboard /></AppLayout></ProtectedRoute>}</Route>
      <Route path="/agent/new-bond">{() => {
        const params = window.location.search;
        return <Redirect to={`/agent/bond-wizard${params}`} />;
      }}</Route>
      <Route path="/agent/bond-wizard">{() => <ProtectedRoute allowedRoles={["agent"]}><AppLayout><BondApplicationWizard /></AppLayout></ProtectedRoute>}</Route>
      <Route path="/agent/bond-form-library">{() => <ProtectedRoute allowedRoles={["agent"]}><AppLayout><BondFormLibrary /></AppLayout></ProtectedRoute>}</Route>
      <Route path="/agent/bond-form-library/:id">{() => <ProtectedRoute allowedRoles={["agent"]}><AppLayout><BondFormDetail /></AppLayout></ProtectedRoute>}</Route>
      <Route path="/agent/clients">{() => <ProtectedRoute allowedRoles={["agent"]}><AppLayout><ClientsPage /></AppLayout></ProtectedRoute>}</Route>
      <Route path="/agent/clients/:id">{() => <ProtectedRoute allowedRoles={["agent"]}><AppLayout><ClientDetail /></AppLayout></ProtectedRoute>}</Route>
      <Route path="/agent/bonds">{() => <ProtectedRoute allowedRoles={["agent"]}><AppLayout><AgentBondsList /></AppLayout></ProtectedRoute>}</Route>
      <Route path="/agent/bonds/:id/application-summary">{() => <ProtectedRoute allowedRoles={["agent"]}><AppLayout><ApplicationSummary /></AppLayout></ProtectedRoute>}</Route>
      <Route path="/agent/bonds/:id">{() => <ProtectedRoute allowedRoles={["agent"]}><AppLayout><AgentBondDetail /></AppLayout></ProtectedRoute>}</Route>
      <Route path="/agent/underwriting">{() => <ProtectedRoute allowedRoles={["agent"]}><AppLayout><UnderwritingReview /></AppLayout></ProtectedRoute>}</Route>
      <Route path="/agent/renewals">{() => <ProtectedRoute allowedRoles={["agent"]}><AppLayout><RenewalsPage /></AppLayout></ProtectedRoute>}</Route>
      <Route path="/agent/conversations">{() => <ProtectedRoute allowedRoles={["agent"]}><AppLayout><AgentConversationsList /></AppLayout></ProtectedRoute>}</Route>
      <Route path="/agent/conversations/:id">{() => <ProtectedRoute allowedRoles={["agent"]}><AppLayout><AgentConversationDetail /></AppLayout></ProtectedRoute>}</Route>

      <Route path="/principal">{() => <Redirect to="/principal/dashboard" />}</Route>
      <Route path="/principal/dashboard">{() => <ProtectedRoute allowedRoles={["principal"]}><AppLayout><PrincipalDashboard /></AppLayout></ProtectedRoute>}</Route>
      <Route path="/principal/payments">{() => <ProtectedRoute allowedRoles={["principal"]}><AppLayout><PrincipalPayments /></AppLayout></ProtectedRoute>}</Route>
      <Route path="/principal/new-bond">{() => <ProtectedRoute allowedRoles={["principal"]}><AppLayout><PrincipalNewBond /></AppLayout></ProtectedRoute>}</Route>
      <Route path="/principal/bonds/:id">{() => <ProtectedRoute allowedRoles={["principal"]}><AppLayout><PrincipalBondDetail /></AppLayout></ProtectedRoute>}</Route>
      <Route path="/chat">{() => <ProtectedRoute allowedRoles={["principal"]}><AppLayout><PrincipalChat /></AppLayout></ProtectedRoute>}</Route>

      <Route path="/underwriter">{() => <Redirect to="/underwriter/dashboard" />}</Route>
      <Route path="/underwriter/dashboard">{() => <ProtectedRoute allowedRoles={["underwriter"]}><AppLayout><UnderwriterDashboard /></AppLayout></ProtectedRoute>}</Route>
      <Route path="/underwriter/review">{() => <ProtectedRoute allowedRoles={["underwriter"]}><AppLayout><UnderwriterReview /></AppLayout></ProtectedRoute>}</Route>
      <Route path="/underwriter/bond-wizard">{() => <ProtectedRoute allowedRoles={["underwriter"]}><AppLayout><UWBondApplicationWizard /></AppLayout></ProtectedRoute>}</Route>
      <Route path="/underwriter/bonds">{() => <ProtectedRoute allowedRoles={["underwriter"]}><AppLayout><UnderwriterBondsList /></AppLayout></ProtectedRoute>}</Route>
      <Route path="/underwriter/bonds/:id">{() => <ProtectedRoute allowedRoles={["underwriter"]}><AppLayout><UnderwriterBondDetail /></AppLayout></ProtectedRoute>}</Route>
      <Route path="/underwriter/principals/:id">{() => <ProtectedRoute allowedRoles={["underwriter"]}><AppLayout><UnderwriterPrincipalDetail /></AppLayout></ProtectedRoute>}</Route>

      <Route path="/pay/:token">{() => <CCPaymentPage />}</Route>
      <Route path="/privacy-policy">{() => <PrivacyPolicyPage />}</Route>
      <Route path="/terms-and-conditions">{() => <TermsAndConditionsPage />}</Route>
      <Route path="/infographics/ai-features">{() => <AIFeaturesInfographic />}</Route>
      <Route path="/infographics/business-features">{() => <BusinessFeaturesInfographic />}</Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AppRoutes />
          </WouterRouter>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
