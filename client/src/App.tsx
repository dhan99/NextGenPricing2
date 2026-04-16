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
import { Architecture } from "./pages/Architecture";
import { ArchitectureInteractive } from "./pages/ArchitectureInteractive";
import { ArchitectureHub } from "./pages/ArchitectureHub";
import { Analytics } from "./pages/Analytics";
import { ChangeOrders } from "./pages/ChangeOrders";
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
          {hasPermission("manageRateCards") ? <RateCards /> : <NoAccess feature="rate card management" />}
        </Route>
        <Route path="/admin/scope-catalog">
          {hasPermission("manageScopeCatalog") ? <ScopeCatalogAdmin /> : <NoAccess feature="scope catalog management" />}
        </Route>
        <Route path="/analytics">
          {hasPermission("viewDeals") ? <Analytics /> : <NoAccess feature="analytics" />}
        </Route>
        <Route path="/deals/:id/change-orders">
          {hasPermission("viewDeals") ? <ChangeOrders /> : <NoAccess feature="change orders" />}
        </Route>
        <Route path="/architecture" component={ArchitectureHub} />
        <Route path="/architecture-i" component={ArchitectureInteractive} />
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
