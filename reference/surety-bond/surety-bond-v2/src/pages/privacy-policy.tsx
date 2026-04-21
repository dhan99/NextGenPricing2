import { Link } from "wouter";
import { ArrowLeft, Shield, Lock, CreditCard, Eye, Database, Bell, Users, FileText, Globe, Scale } from "lucide-react";
import { useTheme } from "@/themes/theme-provider";

export function PrivacyPolicyPage() {
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
              <Shield className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-[var(--slate-900)]">Privacy Policy</h1>
              <p className="text-sm text-[var(--text-muted)]">{theme.brandName} — Surety Bond Portal</p>
            </div>
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-3">Last Updated: March 31, 2026 &nbsp;|&nbsp; Effective Date: March 31, 2026</p>
        </div>

        <div className="space-y-6">
          <Section
            icon={Eye}
            title="1. Introduction"
            content={
              <>
                <p>
                  {theme.brandName} ("we," "us," or "our") operates the {theme.brandName} Surety Bond Portal
                  (the "Platform"), which provides AI-powered surety bond underwriting, application management,
                  and payment processing services. This Privacy Policy describes how we collect, use, disclose,
                  and protect your personal information when you access or use our Platform.
                </p>
                <p>
                  By accessing or using the Platform, you acknowledge that you have read, understood, and agree
                  to be bound by this Privacy Policy. If you do not agree, please discontinue use of the Platform.
                </p>
              </>
            }
          />

          <Section
            icon={Database}
            title="2. Information We Collect"
            content={
              <>
                <h4 className="font-bold text-[var(--slate-900)] mt-4 mb-2">2.1 Information You Provide</h4>
                <ul>
                  <li><strong>Account Information:</strong> Name, email address, phone number, company name, and role (Agent, Principal, or Underwriter) when registering or logging into the Platform.</li>
                  <li><strong>Bond Application Data:</strong> Business details, financial information, obligee information, bond amounts, bond types, class codes, effective/expiration dates, and underwriting questionnaire responses.</li>
                  <li><strong>Principal Information:</strong> Company name, contact name, address, phone, email, and financial data submitted as part of surety bond applications.</li>
                  <li><strong>Agent/Broker Information:</strong> Agency name, license number, contact details, and producer codes.</li>
                  <li><strong>Payment Information:</strong> Credit card number, cardholder name, expiration date, CVV, billing address, and billing type selection (Agency Bill, Direct Bill, or Credit Card). See Section 5 for detailed payment data handling.</li>
                  <li><strong>Communication Data:</strong> Messages, comments, notes, and AI chat conversation transcripts created through the Platform's communication features.</li>
                  <li><strong>Document Uploads:</strong> Files, supporting documents, and completed bond documents uploaded to the Platform.</li>
                </ul>

                <h4 className="font-bold text-[var(--slate-900)] mt-4 mb-2">2.2 Information Collected Automatically</h4>
                <ul>
                  <li><strong>Usage Data:</strong> Pages visited, features used, session duration, click patterns, and workflow interactions.</li>
                  <li><strong>Device Information:</strong> Browser type, operating system, device type, screen resolution, and language preferences.</li>
                  <li><strong>Log Data:</strong> IP address, access times, referring URLs, and server request logs.</li>
                  <li><strong>Cookie Data:</strong> Session cookies, authentication tokens, and preference cookies. See Section 9 for cookie details.</li>
                </ul>

                <h4 className="font-bold text-[var(--slate-900)] mt-4 mb-2">2.3 Information from AI Processing</h4>
                <ul>
                  <li><strong>AI Risk Assessments:</strong> Risk scores, risk levels, triage decisions, and AI-generated underwriting recommendations produced by our {theme.aiName} AI system.</li>
                  <li><strong>AI Chat Interactions:</strong> Conversation logs between users and AI agents (including BondAssist, Underwriting Agent, and Issuance Agent), including extracted application data and agent handoff records.</li>
                  <li><strong>Status Explanations:</strong> AI-generated plain-language explanations of bond statuses and next steps.</li>
                </ul>
              </>
            }
          />

          <Section
            icon={FileText}
            title="3. How We Use Your Information"
            content={
              <ul>
                <li><strong>Bond Processing:</strong> To process, underwrite, issue, renew, and manage surety bond applications throughout their lifecycle.</li>
                <li><strong>AI Underwriting:</strong> To perform automated risk assessments, generate premium calculations, and provide AI-driven underwriting decisions using our {theme.aiName} AI system.</li>
                <li><strong>Payment Processing:</strong> To facilitate premium payments via credit card, including OTP (One-Time Password) verification for payment security. See Section 5.</li>
                <li><strong>Account Management:</strong> To create and manage user accounts, authenticate sessions, and enforce role-based access controls.</li>
                <li><strong>Communication:</strong> To send transactional notifications (payment requests, status updates, OTP codes), and to facilitate in-platform messaging between agents, principals, and underwriters.</li>
                <li><strong>Document Generation:</strong> To generate bond documents, invoices, application forms, and endorsement records.</li>
                <li><strong>Analytics & Improvement:</strong> To analyze Platform usage patterns, monitor performance, improve user experience, and enhance our AI models.</li>
                <li><strong>Legal Compliance:</strong> To comply with applicable laws, regulations, and insurance industry requirements.</li>
                <li><strong>Fraud Prevention:</strong> To detect, prevent, and address fraudulent activity, security breaches, and unauthorized access.</li>
              </ul>
            }
          />

          <Section
            icon={Users}
            title="4. How We Share Your Information"
            content={
              <>
                <p>We do not sell your personal information to third parties. We may share your information in the following circumstances:</p>
                <ul>
                  <li><strong>Between Portal Users:</strong> Bond application data is shared between Agents, Principals, and Underwriters as necessary to process and manage bond applications. Internal notes marked as private are only visible to the authoring party.</li>
                  <li><strong>AI Service Providers:</strong> Bond application data is transmitted to our AI processing partners (Anthropic Claude) for risk assessment, underwriting analysis, and chat-based application processing. This data is processed under strict data processing agreements.</li>
                  <li><strong>Payment Processors:</strong> Credit card and billing information is shared with our payment processing partners solely for the purpose of processing premium payments. Card data is not stored on our servers after transaction completion.</li>
                  <li><strong>Communication Services:</strong> Phone numbers and email addresses are shared with our SMS (Twilio) and email (Resend) service providers for the purpose of delivering OTP codes, payment requests, and transactional notifications.</li>
                  <li><strong>Legal Requirements:</strong> We may disclose information when required by law, court order, subpoena, or regulatory request, or when we believe disclosure is necessary to protect our rights, property, safety, or that of our users.</li>
                  <li><strong>Business Transfers:</strong> In the event of a merger, acquisition, or sale of assets, user information may be transferred as part of that transaction.</li>
                </ul>
              </>
            }
          />

          <Section
            icon={CreditCard}
            title="5. Credit Card Payments & OTP Verification"
            content={
              <>
                <p className="font-semibold text-[var(--slate-900)]">
                  This section describes our specific practices regarding credit card payment processing
                  and One-Time Password (OTP) verification.
                </p>

                <h4 className="font-bold text-[var(--slate-900)] mt-4 mb-2">5.1 Payment Request Flow</h4>
                <p>
                  When a bond premium payment is due, a payment request is generated by the Platform containing
                  a unique, time-limited token. This token is used to authenticate the payment session without
                  requiring the principal to log into the Platform. Payment request links expire after 72 hours
                  for security purposes.
                </p>

                <h4 className="font-bold text-[var(--slate-900)] mt-4 mb-2">5.2 OTP (One-Time Password) Verification</h4>
                <ul>
                  <li><strong>Purpose:</strong> Before entering payment details, the principal must verify their identity through a One-Time Password sent to their registered phone number via SMS.</li>
                  <li><strong>OTP Delivery:</strong> OTP codes are delivered via SMS through our Twilio integration. Only the last 4 digits of the phone number are displayed on-screen for privacy.</li>
                  <li><strong>OTP Validity:</strong> Each OTP code is valid for a limited time period and can only be used once. Expired or used codes are immediately invalidated.</li>
                  <li><strong>OTP Storage:</strong> OTP codes are stored in hashed form and automatically deleted after verification or expiration. We do not retain plaintext OTP codes.</li>
                  <li><strong>Rate Limiting:</strong> To prevent abuse, OTP requests are rate-limited. Excessive verification attempts may temporarily lock the payment session.</li>
                </ul>

                <h4 className="font-bold text-[var(--slate-900)] mt-4 mb-2">5.3 Credit Card Data Handling</h4>
                <ul>
                  <li><strong>Collection:</strong> We collect the cardholder name, card number, expiration date, CVV, and billing address necessary to process the payment.</li>
                  <li><strong>Transmission:</strong> All credit card data is transmitted over TLS-encrypted connections (HTTPS). Card data is never transmitted in plaintext.</li>
                  <li><strong>Storage:</strong> Full credit card numbers and CVV codes are <strong>not stored</strong> on our servers. After processing, only a masked reference (last 4 digits and card type) is retained for transaction records.</li>
                  <li><strong>Processing:</strong> Payment transactions are processed securely. Transaction confirmations include a reference number, card type, last 4 digits, and timestamp.</li>
                  <li><strong>PCI Compliance:</strong> Our payment handling practices are designed to align with Payment Card Industry Data Security Standard (PCI DSS) requirements.</li>
                </ul>

                <h4 className="font-bold text-[var(--slate-900)] mt-4 mb-2">5.4 Payment Records</h4>
                <p>
                  Upon successful payment, we retain a transaction record including: transaction reference number,
                  payment amount, card type (Visa, Mastercard, etc.), last 4 digits of the card, payment date and time,
                  and associated bond number. These records are accessible to the Principal and their Agent for
                  accounting and audit purposes.
                </p>
              </>
            }
          />

          <Section
            icon={Lock}
            title="6. Data Security"
            content={
              <ul>
                <li><strong>Encryption in Transit:</strong> All data transmitted between your browser and our servers is encrypted using TLS/SSL (HTTPS).</li>
                <li><strong>Authentication:</strong> User sessions are managed through JWT (JSON Web Token) authentication with secure token handling. Passwords are hashed using bcrypt with appropriate salt rounds.</li>
                <li><strong>Role-Based Access:</strong> The Platform enforces strict role-based access controls. Agents can only access their own clients and bonds. Principals can only view their own applications. Underwriters have access to applications requiring review.</li>
                <li><strong>Session Management:</strong> Authentication tokens have defined expiration periods. Sessions are invalidated upon logout.</li>
                <li><strong>Infrastructure:</strong> The Platform is hosted on secure cloud infrastructure with automated monitoring, backup, and disaster recovery capabilities.</li>
                <li><strong>Incident Response:</strong> We maintain incident response procedures to address potential security breaches. In the event of a data breach affecting your personal information, we will notify affected users in accordance with applicable law.</li>
              </ul>
            }
          />

          <Section
            icon={Globe}
            title="7. Data Retention"
            content={
              <>
                <p>We retain your information for as long as necessary to fulfill the purposes described in this Privacy Policy, including:</p>
                <ul>
                  <li><strong>Account Data:</strong> Retained for the duration of your account and for a reasonable period after account closure.</li>
                  <li><strong>Bond Records:</strong> Retained for the full bond term plus any legally required retention period (typically 7 years after bond expiration, per insurance industry standards).</li>
                  <li><strong>Payment Records:</strong> Transaction records are retained for at least 7 years for tax, audit, and regulatory compliance purposes.</li>
                  <li><strong>AI Conversation Logs:</strong> Retained for the duration of the associated bond lifecycle and for analytical improvement purposes.</li>
                  <li><strong>OTP Codes:</strong> Automatically deleted immediately after successful verification or upon expiration (whichever occurs first).</li>
                  <li><strong>Credit Card Data:</strong> Full card numbers and CVVs are not retained after transaction processing. Only masked references are kept with payment records.</li>
                </ul>
              </>
            }
          />

          <Section
            icon={Scale}
            title="8. Your Rights & Choices"
            content={
              <>
                <p>Depending on your jurisdiction, you may have the following rights regarding your personal information:</p>
                <ul>
                  <li><strong>Access:</strong> Request a copy of the personal information we hold about you.</li>
                  <li><strong>Correction:</strong> Request correction of inaccurate or incomplete personal information.</li>
                  <li><strong>Deletion:</strong> Request deletion of your personal information, subject to legal retention requirements (e.g., active bond records cannot be deleted during the bond term).</li>
                  <li><strong>Portability:</strong> Request a machine-readable copy of your data.</li>
                  <li><strong>Opt-Out:</strong> Opt out of non-essential communications. Note: Transactional messages (OTP codes, payment confirmations, bond status updates) cannot be opted out of as they are necessary for service delivery.</li>
                  <li><strong>Withdraw Consent:</strong> Where processing is based on consent, you may withdraw consent at any time.</li>
                </ul>
                <p>
                  To exercise any of these rights, please contact us at the address provided in Section 12.
                  We will respond to your request within 30 days.
                </p>
              </>
            }
          />

          <Section
            icon={Bell}
            title="9. Cookies & Tracking"
            content={
              <>
                <p>The Platform uses the following types of cookies and similar technologies:</p>
                <ul>
                  <li><strong>Essential Cookies:</strong> Required for authentication, session management, and core Platform functionality. These cannot be disabled.</li>
                  <li><strong>Preference Cookies:</strong> Store your display preferences (e.g., dark mode, theme settings).</li>
                  <li><strong>Authentication Tokens:</strong> Secure JWT tokens stored in memory or local storage for session persistence.</li>
                </ul>
                <p>
                  We do not use third-party advertising cookies or cross-site tracking technologies.
                </p>
              </>
            }
          />

          <Section
            icon={Users}
            title="10. Children's Privacy"
            content={
              <p>
                The Platform is not intended for use by individuals under the age of 18. We do not knowingly
                collect personal information from minors. If we become aware that we have collected personal
                information from a child under 18, we will take steps to delete that information promptly.
              </p>
            }
          />

          <Section
            icon={Globe}
            title="11. Changes to This Policy"
            content={
              <p>
                We may update this Privacy Policy from time to time to reflect changes in our practices,
                technologies, legal requirements, or other factors. We will post the updated policy on
                this page with a revised "Last Updated" date. Material changes will be communicated through
                Platform notifications or email. Your continued use of the Platform after any changes
                constitutes acceptance of the updated Privacy Policy.
              </p>
            }
          />

          <Section
            icon={FileText}
            title="12. Contact Us"
            content={
              <>
                <p>If you have questions, concerns, or requests regarding this Privacy Policy or our data practices, please contact us:</p>
                <div className="glass-card p-4 mt-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    <div>
                      <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-semibold mb-1">Company</div>
                      <div className="font-medium text-[var(--slate-900)]">{theme.brandName}</div>
                    </div>
                    <div>
                      <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-semibold mb-1">Email</div>
                      <div className="font-medium text-[var(--accent)]">privacy@bondclicknova.com</div>
                    </div>
                    <div>
                      <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider font-semibold mb-1">Website</div>
                      <div className="font-medium text-[var(--accent)]">bondclicknova.com</div>
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
          <Link href="/terms-and-conditions" className="text-sm text-[var(--accent)] hover:text-[var(--accent-dark)] transition-colors no-underline font-medium">
            View our Terms & Conditions
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
