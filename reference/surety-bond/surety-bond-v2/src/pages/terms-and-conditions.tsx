import { Link } from "wouter";
import { ArrowLeft, FileText, MessageSquare, CreditCard, Shield, Scale, Globe, Bell, Users, Lock, Phone, Ban } from "lucide-react";
import { useTheme } from "@/themes/theme-provider";

export function TermsAndConditionsPage() {
  const { theme } = useTheme();

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 max-w-4xl">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-medium text-[var(--accent)] hover:text-[var(--accent-dark)] mb-8 no-underline transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back to Sign In
        </Link>

        <div className="glass-card p-6 sm:p-10 mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl gradient-accent flex items-center justify-center">
              <Scale className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-[var(--slate-900)]">Terms & Conditions</h1>
              <p className="text-sm text-[var(--text-muted)]">{theme.brandName} — Surety Bond Portal</p>
            </div>
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-3">Last Updated: March 31, 2026 &nbsp;|&nbsp; Effective Date: March 31, 2026</p>
        </div>

        <div className="space-y-6">
          <Section
            icon={FileText}
            title="1. Program Name & Description"
            content={
              <>
                <p>
                  <strong>Program Name:</strong> {theme.brandName} Surety Bond Portal
                </p>
                <p>
                  {theme.brandName} is a digital surety bond platform that enables insurance agents, principals
                  (bond applicants), and underwriters to manage the complete surety bond lifecycle — from
                  application and AI-powered underwriting through issuance, payment, and renewal.
                </p>
                <p>The Platform provides the following services:</p>
                <ul>
                  <li>AI-driven surety bond application processing and underwriting via {theme.aiName}</li>
                  <li>Real-time risk scoring, premium calculation, and automated triage</li>
                  <li>Secure online premium payment with OTP (One-Time Password) verification</li>
                  <li>Bond document generation, issuance, and digital delivery</li>
                  <li>Multi-portal access for Agents, Principals, and Underwriters</li>
                  <li>Bond renewal management and lifecycle tracking</li>
                  <li>SMS and email notifications for payment requests, status updates, and security verification</li>
                </ul>
              </>
            }
          />

          <Section
            icon={Scale}
            title="2. Acceptance of Terms"
            content={
              <>
                <p>
                  By accessing, registering for, or using the {theme.brandName} Surety Bond Portal (the "Platform"),
                  you ("User," "you," or "your") agree to be bound by these Terms and Conditions ("Terms").
                  These Terms constitute a legally binding agreement between you and {theme.brandName} ("we," "us," or "our").
                </p>
                <p>
                  If you do not agree to these Terms, you must discontinue use of the Platform immediately.
                  Your continued use of the Platform following any changes to these Terms constitutes acceptance
                  of those changes.
                </p>
              </>
            }
          />

          <Section
            icon={Users}
            title="3. User Accounts & Roles"
            content={
              <>
                <p>The Platform supports three user roles, each with distinct access and responsibilities:</p>
                <ul>
                  <li><strong>Agent:</strong> Licensed insurance agents/brokers who submit bond applications on behalf of principals, manage client relationships, and facilitate the bonding process.</li>
                  <li><strong>Principal:</strong> Bond applicants (individuals or businesses) who apply for surety bonds, provide required documentation, and make premium payments.</li>
                  <li><strong>Underwriter:</strong> Authorized personnel who review applications, assess risk, approve or decline bonds, and manage the underwriting workflow.</li>
                </ul>
                <p>You are responsible for maintaining the confidentiality of your account credentials and for all activity that occurs under your account. You must notify us immediately of any unauthorized access.</p>
              </>
            }
          />

          <Section
            icon={MessageSquare}
            title="4. SMS/Text Messaging Terms"
            content={
              <>
                <div className="glass-card p-4 mb-4 border-l-4 border-l-[var(--accent)]">
                  <p className="font-semibold text-[var(--slate-900)] text-sm mb-1">Important SMS Disclosure</p>
                  <p className="text-[13px]">
                    By providing your phone number and using the Platform, you consent to receive SMS/text messages
                    from {theme.brandName} related to your surety bond transactions.
                  </p>
                </div>

                <h4 className="font-bold text-[var(--slate-900)] mt-4 mb-2">4.1 Message Types & Frequency</h4>
                <p>You may receive the following types of SMS messages:</p>
                <ul>
                  <li><strong>OTP Verification Codes:</strong> One-time passwords for payment authentication (sent per payment session)</li>
                  <li><strong>Payment Request Notifications:</strong> Alerts when a premium payment is due</li>
                  <li><strong>Bond Status Updates:</strong> Notifications when your bond application status changes (approved, issued, etc.)</li>
                  <li><strong>Security Alerts:</strong> Notifications related to account security events</li>
                </ul>
                <p>
                  <strong>Message Frequency:</strong> Message frequency varies based on your bond activity.
                  Typical usage is 1–5 messages per bond transaction. OTP codes are sent only when you
                  initiate a payment. You will not receive more than 10 messages per month under normal usage.
                </p>

                <h4 className="font-bold text-[var(--slate-900)] mt-4 mb-2">4.2 Message & Data Rates</h4>
                <p>
                  <strong>Message and data rates may apply.</strong> Standard messaging and data rates from your
                  wireless carrier apply to all SMS messages sent to and from the Platform. {theme.brandName} does
                  not charge any additional fees for SMS messages, but your carrier's standard rates will apply.
                  Contact your wireless carrier for details about your messaging plan and any applicable charges.
                </p>

                <h4 className="font-bold text-[var(--slate-900)] mt-4 mb-2">4.3 Opting Out</h4>
                <div className="glass-card p-4 my-3">
                  <p className="text-sm text-[var(--slate-900)]">
                    To stop receiving SMS messages, text <strong className="text-[var(--accent)] text-base">STOP</strong> to
                    any message you receive from us. You will receive a one-time confirmation message
                    confirming your opt-out. After opting out, you will no longer receive SMS messages from {theme.brandName}.
                  </p>
                  <p className="text-sm text-[var(--slate-900)] mt-3">
                    <strong>Please note:</strong> Opting out of SMS will prevent delivery of OTP verification codes
                    required for credit card payments. If you opt out, you may need to use alternative payment
                    methods (Agency Bill or Direct Bill) or contact your agent to complete premium payments.
                  </p>
                </div>

                <h4 className="font-bold text-[var(--slate-900)] mt-4 mb-2">4.4 Getting Help</h4>
                <div className="glass-card p-4 my-3">
                  <p className="text-sm text-[var(--slate-900)]">
                    For help with SMS messaging, text <strong className="text-[var(--accent)] text-base">HELP</strong> to
                    any message you receive from us. You will receive a reply with support contact information.
                    You can also contact us directly using the information in Section 12.
                  </p>
                </div>

                <h4 className="font-bold text-[var(--slate-900)] mt-4 mb-2">4.5 Supported Carriers</h4>
                <p>
                  SMS messaging is supported on all major U.S. wireless carriers including AT&T, Verizon,
                  T-Mobile, Sprint, and most regional carriers. Carriers are not liable for delayed or
                  undelivered messages.
                </p>
              </>
            }
          />

          <Section
            icon={CreditCard}
            title="5. Payment Terms"
            content={
              <>
                <h4 className="font-bold text-[var(--slate-900)] mt-4 mb-2">5.1 Premium Payments</h4>
                <p>
                  Surety bond premiums are determined through the underwriting process based on bond type,
                  bond amount, risk assessment, and other relevant factors. Premium amounts are displayed
                  on the Platform and in payment request notifications.
                </p>

                <h4 className="font-bold text-[var(--slate-900)] mt-4 mb-2">5.2 Payment Methods</h4>
                <p>The Platform supports the following payment methods:</p>
                <ul>
                  <li><strong>Credit Card:</strong> Visa, Mastercard, American Express, and Discover. Requires OTP verification for security.</li>
                  <li><strong>Agency Bill:</strong> Premium is billed through the agent's account.</li>
                  <li><strong>Direct Bill:</strong> Premium is billed directly to the principal.</li>
                </ul>

                <h4 className="font-bold text-[var(--slate-900)] mt-4 mb-2">5.3 OTP Payment Authentication</h4>
                <p>
                  Credit card payments require One-Time Password (OTP) verification. When you initiate a
                  credit card payment, a unique code will be sent via SMS to your registered phone number.
                  You must enter this code to proceed with the payment. OTP codes are valid for a limited
                  time and can only be used once. Payment links expire after 72 hours.
                </p>

                <h4 className="font-bold text-[var(--slate-900)] mt-4 mb-2">5.4 Refunds</h4>
                <p>
                  Refund eligibility is determined by the applicable surety bond terms, state regulations,
                  and the specific circumstances of the request. Refund requests should be directed to your
                  agent or our support team. Processing times for approved refunds may vary.
                </p>
              </>
            }
          />

          <Section
            icon={Shield}
            title="6. AI-Powered Services"
            content={
              <>
                <p>
                  The Platform utilizes artificial intelligence ({theme.aiName}) to assist with bond application
                  processing, risk assessment, and underwriting decisions. By using the Platform, you acknowledge:
                </p>
                <ul>
                  <li>AI-generated risk scores and recommendations are advisory tools that assist human underwriters in making final decisions.</li>
                  <li>AI chatbot interactions (including {theme.aiName}) may collect and process application data you provide during conversations.</li>
                  <li>AI-generated explanations of bond statuses and next steps are provided for convenience and do not constitute legal or financial advice.</li>
                  <li>Final underwriting decisions are made by authorized underwriters and are not solely determined by AI systems.</li>
                </ul>
              </>
            }
          />

          <Section
            icon={Lock}
            title="7. Intellectual Property"
            content={
              <>
                <p>
                  All content, features, functionality, and technology of the Platform — including but not limited
                  to the {theme.brandName} brand, {theme.aiName} AI system, user interface designs, software code,
                  algorithms, and documentation — are owned by {theme.brandName} and are protected by copyright,
                  trademark, and other intellectual property laws.
                </p>
                <p>
                  You are granted a limited, non-exclusive, non-transferable license to access and use the
                  Platform solely for its intended purpose of managing surety bond transactions. You may not
                  copy, modify, distribute, reverse-engineer, or create derivative works from any part of the Platform.
                </p>
              </>
            }
          />

          <Section
            icon={Ban}
            title="8. Prohibited Conduct"
            content={
              <ul>
                <li>Submitting false, misleading, or fraudulent information in bond applications</li>
                <li>Attempting to circumvent OTP verification or payment security measures</li>
                <li>Accessing another user's account or data without authorization</li>
                <li>Using the Platform for any unlawful purpose or in violation of applicable regulations</li>
                <li>Interfering with, disrupting, or placing an unreasonable burden on the Platform's infrastructure</li>
                <li>Scraping, harvesting, or collecting data from the Platform through automated means</li>
                <li>Impersonating another person or misrepresenting your role, license, or authority</li>
              </ul>
            }
          />

          <Section
            icon={Globe}
            title="9. Limitation of Liability"
            content={
              <>
                <p>
                  To the maximum extent permitted by applicable law, {theme.brandName} shall not be liable for
                  any indirect, incidental, special, consequential, or punitive damages arising from your
                  use of the Platform, including but not limited to:
                </p>
                <ul>
                  <li>Loss of data, revenue, or business opportunities</li>
                  <li>Errors or inaccuracies in AI-generated risk assessments or recommendations</li>
                  <li>Delays or failures in SMS delivery (including OTP codes) caused by wireless carriers</li>
                  <li>Unauthorized access to your account resulting from your failure to protect your credentials</li>
                  <li>Actions taken or not taken by underwriters based on Platform data</li>
                </ul>
                <p>
                  The Platform is provided "as is" and "as available" without warranties of any kind,
                  either express or implied. We do not guarantee uninterrupted, error-free, or secure access
                  to the Platform.
                </p>
              </>
            }
          />

          <Section
            icon={Bell}
            title="10. Termination"
            content={
              <>
                <p>
                  We reserve the right to suspend or terminate your access to the Platform at any time, with
                  or without notice, for any reason, including but not limited to: violation of these Terms,
                  fraudulent activity, or inactivity.
                </p>
                <p>
                  Upon termination, your right to access the Platform ceases immediately. Provisions of these
                  Terms that by their nature should survive termination (including intellectual property,
                  limitation of liability, and dispute resolution) will remain in effect.
                </p>
                <p>
                  Outstanding bond obligations, payment obligations, and related contractual duties are not
                  affected by termination of Platform access and remain enforceable under their respective
                  agreements.
                </p>
              </>
            }
          />

          <Section
            icon={Scale}
            title="11. Governing Law & Disputes"
            content={
              <p>
                These Terms shall be governed by and construed in accordance with the laws of the applicable
                jurisdiction, without regard to conflict of law principles. Any disputes arising from or
                related to these Terms or your use of the Platform shall be resolved through binding
                arbitration or in the courts of competent jurisdiction, as determined by applicable law.
              </p>
            }
          />

          <Section
            icon={Phone}
            title="12. Contact Information & Support"
            content={
              <>
                <p>For questions about these Terms, SMS messaging, payments, or any other matter:</p>
                <div className="glass-card p-4 mt-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    <div>
                      <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-semibold mb-1">Company</div>
                      <div className="font-medium text-[var(--slate-900)]">{theme.brandName}</div>
                    </div>
                    <div>
                      <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-semibold mb-1">Email</div>
                      <div className="font-medium text-[var(--accent)]">support@bondclicknova.com</div>
                    </div>
                    <div>
                      <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-semibold mb-1">Website</div>
                      <div className="font-medium text-[var(--accent)]">bondclicknova.com</div>
                    </div>
                    <div>
                      <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-semibold mb-1">SMS Support</div>
                      <div className="font-medium text-[var(--slate-900)]">Text <strong className="text-[var(--accent)]">HELP</strong> to any message</div>
                    </div>
                    <div>
                      <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-semibold mb-1">SMS Opt-Out</div>
                      <div className="font-medium text-[var(--slate-900)]">Text <strong className="text-[var(--accent)]">STOP</strong> to any message</div>
                    </div>
                    <div>
                      <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-semibold mb-1">Response Time</div>
                      <div className="font-medium text-[var(--slate-900)]">Within 30 business days</div>
                    </div>
                  </div>
                </div>
              </>
            }
          />
        </div>

        <div className="mt-8 text-center">
          <Link href="/privacy-policy" className="text-sm text-[var(--accent)] hover:text-[var(--accent-dark)] transition-colors no-underline font-medium">
            View our Privacy Policy
          </Link>
        </div>

        <footer className="mt-6 py-6 border-t border-[var(--border-color)] text-center">
          <span className="text-sm text-[var(--text-muted)]">{theme.footerCopyright}</span>
        </footer>
      </div>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  content,
}: {
  icon: React.ElementType;
  title: string;
  content: React.ReactNode;
}) {
  return (
    <div className="glass-card p-5 sm:p-7">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-8 h-8 rounded-lg bg-[var(--accent-50)] flex items-center justify-center shrink-0">
          <Icon className="h-4 w-4 text-[var(--accent)]" />
        </div>
        <h2 className="text-lg font-bold text-[var(--slate-900)]">{title}</h2>
      </div>
      <div className="prose-privacy text-[13.5px] leading-relaxed text-[var(--text-muted)] space-y-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-2 [&_li]:text-[var(--text-muted)] [&_strong]:text-[var(--slate-900)] [&_p]:text-[var(--text-muted)]">
        {content}
      </div>
    </div>
  );
}
