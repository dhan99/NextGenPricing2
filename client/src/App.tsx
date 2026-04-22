import { Route, Switch } from "wouter";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { AppLayout } from "./components/layout/AppLayout";
import { Dashboard } from "./pages/Dashboard";
import { DealsList } from "./pages/DealsList";
import { NewDeal } from "./pages/NewDeal";
import { DealDetail } from "./pages/DealDetail";
import { RenewalLeadsheet } from "./pages/RenewalLeadsheet";
import { RateCards } from "./pages/RateCards";
import { ScopeCatalogAdmin } from "./pages/ScopeCatalogAdmin";
import { PromptSetsAdmin } from "./pages/PromptSetsAdmin";
import { CongaTemplatesAdmin } from "./pages/CongaTemplatesAdmin";
import { MarginTargetsAdmin } from "./pages/MarginTargetsAdmin";
import { Architecture } from "./pages/Architecture";
import { ArchitectureInteractive } from "./pages/ArchitectureInteractive";
import { ArchitectureHub } from "./pages/ArchitectureHub";
import { Analytics } from "./pages/Analytics";
import { ChangeOrders } from "./pages/ChangeOrders";
import { DynamicsCRM } from "./pages/DynamicsCRM";
import { Intapp } from "./pages/Intapp";
import { WorkdayIntegration } from "./pages/WorkdayIntegration";
import { Login } from "./pages/Login";
import { Shield } from "lucide-react";

function NoAccess({ feature }: { feature: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-8">
      <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center mb-4">
        <Shield className="w-8 h-8 text-red-500" />
      </div>
      <h2 className="text-xl font-bold text-foreground mb-2">Access Restricted</h2>
      <p className="text-muted-foreground max-w-md">
        Your current role does not have permission to access {feature}. Contact your administrator or switch to a different persona.
      </p>
    </div>
  );
}

function AuthenticatedApp() {
  const { persona, hasPermission } = useAuth();

  if (!persona) return <Login />;

  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/deals">
          {hasPermission("viewDeals") ? <DealsList /> : <NoAccess feature="the deals list" />}
        </Route>
        <Route path="/deals/new">
          {hasPermission("createDeals") ? <NewDeal /> : <NoAccess feature="deal creation" />}
        </Route>
        <Route path="/deals/:id/renewal-leadsheet">
          {hasPermission("viewDeals") ? <RenewalLeadsheet /> : <NoAccess feature="renewal leadsheet" />}
        </Route>
        <Route path="/deals/:id">
          {(params) => hasPermission("viewDeals") ? <DealDetail /> : <NoAccess feature="deal details" />}
        </Route>
        <Route path="/admin/rate-cards">
          {hasPermission("manageRateCards") || hasPermission("viewAdminConfig")
            ? <RateCards />
            : <NoAccess feature="rate card management" />}
        </Route>
        <Route path="/admin/scope-catalog">
          {hasPermission("manageScopeCatalog") || hasPermission("viewAdminConfig")
            ? <ScopeCatalogAdmin readOnly={!hasPermission("manageScopeCatalog")} />
            : <NoAccess feature="scope catalog management" />}
        </Route>
        <Route path="/admin/prompt-sets">
          {hasPermission("manageScopeCatalog") || hasPermission("viewAdminConfig")
            ? <PromptSetsAdmin readOnly={!hasPermission("manageScopeCatalog")} />
            : <NoAccess feature="prompt set governance" />}
        </Route>
        <Route path="/admin/engagement-letters">
          {hasPermission("manageScopeCatalog") || hasPermission("viewAdminConfig")
            ? <CongaTemplatesAdmin readOnly={!hasPermission("manageScopeCatalog")} />
            : <NoAccess feature="engagement letter templates" />}
        </Route>
        <Route path="/admin/margin-targets">
          {hasPermission("manageRateCards") || hasPermission("viewAdminConfig")
            ? <MarginTargetsAdmin readOnly={!hasPermission("manageRateCards")} />
            : <NoAccess feature="margin target governance" />}
        </Route>
        <Route path="/analytics">
          {hasPermission("viewDeals") ? <Analytics /> : <NoAccess feature="analytics" />}
        </Route>
        <Route path="/deals/:id/change-orders">
          {hasPermission("viewDeals") ? <ChangeOrders /> : <NoAccess feature="change orders" />}
        </Route>
        <Route path="/integrations/dynamics">
          {hasPermission("viewDeals") ? <DynamicsCRM /> : <NoAccess feature="the CRM integration" />}
        </Route>
        <Route path="/integrations/intapp">
          {hasPermission("viewRiskSummary") ? <Intapp /> : <NoAccess feature="the conflicts & risk integration" />}
        </Route>
        <Route path="/integrations/workday">
          {hasPermission("viewDeals") ? <WorkdayIntegration /> : <NoAccess feature="the Workday integration" />}
        </Route>
        <Route path="/architecture">
          {hasPermission("viewArchitecture") ? <ArchitectureHub /> : <NoAccess feature="architecture" />}
        </Route>
        <Route path="/architecture-i">
          {hasPermission("viewArchitecture") ? <ArchitectureInteractive /> : <NoAccess feature="architecture" />}
        </Route>
        <Route>
          <div className="flex items-center justify-center min-h-screen">
            <p className="text-xl text-muted-foreground">Page not found</p>
          </div>
        </Route>
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <AuthProvider>
      <AuthenticatedApp />
    </AuthProvider>
  );
}

export default App;
