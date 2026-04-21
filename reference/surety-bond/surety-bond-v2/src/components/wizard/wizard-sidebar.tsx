import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Phone, Mail, Clock, ExternalLink, User } from "lucide-react";

export function WizardSidebar() {
  return (
    <div className="space-y-4">
      <Card className="border-border/50 bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Phone className="h-4 w-4 text-primary" />
            Customer Service
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Phone className="h-3.5 w-3.5" />
            <span>1-800-555-BOND (2663)</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            <span>Mon-Fri 8:00 AM - 6:00 PM ET</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Mail className="h-3.5 w-3.5" />
            <span>support@bondclicktrust.com</span>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50 bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <ExternalLink className="h-4 w-4 text-primary" />
            Resources
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <a href="#" className="block text-primary hover:underline">Certificates of Authority Library</a>
          <a href="#" className="block text-primary hover:underline">Billing Services</a>
          <a href="#" className="block text-primary hover:underline">Bond Form Library</a>
          <a href="#" className="block text-primary hover:underline">Underwriting Guidelines</a>
        </CardContent>
      </Card>

      <Card className="border-border/50 bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <ExternalLink className="h-4 w-4 text-primary" />
            Surety Demo App Quick Links
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <a href="#" className="block text-primary hover:underline">My Bond Portfolio</a>
          <a href="#" className="block text-primary hover:underline">Underwriting Authority</a>
          <a href="#" className="block text-primary hover:underline">Agent Dashboard</a>
        </CardContent>
      </Card>

      <Card className="border-border/50 bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <User className="h-4 w-4 text-primary" />
            Underwriting Contacts
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <p className="font-medium">Jane Morrison</p>
            <p className="text-muted-foreground text-xs">Senior Underwriter</p>
            <p className="text-muted-foreground text-xs">jane.morrison@bondclicktrust.com</p>
            <p className="text-muted-foreground text-xs">555-200-3001</p>
          </div>
          <div>
            <p className="font-medium">Robert Chen</p>
            <p className="text-muted-foreground text-xs">Underwriting Manager</p>
            <p className="text-muted-foreground text-xs">robert.chen@bondclicktrust.com</p>
            <p className="text-muted-foreground text-xs">555-200-3002</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
