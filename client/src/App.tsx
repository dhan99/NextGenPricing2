import { Route, Switch } from "wouter";
import { AppLayout } from "./components/layout/AppLayout";
import { Dashboard } from "./pages/Dashboard";
import { DealsList } from "./pages/DealsList";
import { NewDeal } from "./pages/NewDeal";
import { DealDetail } from "./pages/DealDetail";
import { RateCards } from "./pages/RateCards";
import { ScopeCatalogAdmin } from "./pages/ScopeCatalogAdmin";

function App() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/deals" component={DealsList} />
        <Route path="/deals/new" component={NewDeal} />
        <Route path="/deals/:id" component={DealDetail} />
        <Route path="/admin/rate-cards" component={RateCards} />
        <Route path="/admin/scope-catalog" component={ScopeCatalogAdmin} />
        <Route>
          <div className="flex items-center justify-center min-h-screen">
            <p className="text-xl text-muted-foreground">Page not found</p>
          </div>
        </Route>
      </Switch>
    </AppLayout>
  );
}

export default App;
