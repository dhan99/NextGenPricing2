export interface WizardState {
  currentStep: number;
  bondFormId: number | null;
  bondFormName: string;
  bondFormType: string;
  bondFormClassCode: string;
  customBondForm: boolean;
  customBondFormName: string;

  effectiveDate: string;
  expirationDate: string;
  clientId: number | null;
  clientName: string;

  principalCompanyName: string;
  principalFirstName: string;
  principalLastName: string;
  principalEmail: string;
  principalPhone: string;
  principalAddress: string;
  principalCity: string;
  principalState: string;
  principalZip: string;

  obligeeName: string;
  obligeeAddress: string;
  obligeeCity: string;
  obligeeState: string;
  obligeeZip: string;

  bondDescription: string;
  bondAmount: string;
  attorneyInFact: string;
  underwritingNotes: string;
  premiumCalculated: number | null;
  surcharge: number | null;
  commission: number | null;
  netPremium: number | null;
  riskScore: number | null;
  riskLevel: string | null;
  triageDecision: string | null;
  riskFlags: string[];
  underwritingAnswers: Record<number, string>;
  uploadedFiles: string[];
  documentsCollected: string[];
  companyDeclaredBankruptcy: string | null;
  companyClaimWithSurety: string | null;
  companyDeniedBonding: string | null;
  referralComments: string;
  referredToUnderwriter: boolean;

  billingType: string;
  billingAddress: string;
  billingCity: string;
  billingState: string;
  billingZip: string;
  usePrincipalAsBilling: boolean;
  ccPrincipalPhone: string;
  ccPrincipalEmail: string;
  ccOtpConsent: boolean;
  ccPaymentRequested: boolean;
  ccPaymentToken: string;
  emailCopy: boolean;
  conditionsAccepted: boolean;
  termsAccepted: boolean;

  bondId: number | null;
  bondNumber: string;
  isPurchased: boolean;

  uwSelectedAgentId: number | null;
  uwSelectedAgentName: string;
  uwCreated: boolean;
}

export const initialWizardState: WizardState = {
  currentStep: 1,
  bondFormId: null,
  bondFormName: "",
  bondFormType: "",
  bondFormClassCode: "",
  customBondForm: false,
  customBondFormName: "",

  effectiveDate: "",
  expirationDate: "",
  clientId: null,
  clientName: "",

  principalCompanyName: "",
  principalFirstName: "",
  principalLastName: "",
  principalEmail: "",
  principalPhone: "",
  principalAddress: "",
  principalCity: "",
  principalState: "",
  principalZip: "",

  obligeeName: "",
  obligeeAddress: "",
  obligeeCity: "",
  obligeeState: "",
  obligeeZip: "",

  bondDescription: "",
  bondAmount: "",
  attorneyInFact: "",
  underwritingNotes: "",
  premiumCalculated: null,
  surcharge: null,
  commission: null,
  netPremium: null,
  riskScore: null,
  riskLevel: null,
  triageDecision: null,
  riskFlags: [],
  underwritingAnswers: {},
  uploadedFiles: [],
  documentsCollected: [],
  companyDeclaredBankruptcy: null,
  companyClaimWithSurety: null,
  companyDeniedBonding: null,
  referralComments: "",
  referredToUnderwriter: false,

  billingType: "agency_bill",
  billingAddress: "",
  billingCity: "",
  billingState: "",
  billingZip: "",
  usePrincipalAsBilling: true,
  ccPrincipalPhone: "",
  ccPrincipalEmail: "",
  ccOtpConsent: false,
  ccPaymentRequested: false,
  ccPaymentToken: "",
  emailCopy: true,
  conditionsAccepted: false,
  termsAccepted: false,

  bondId: null,
  bondNumber: "",
  isPurchased: false,

  uwSelectedAgentId: null,
  uwSelectedAgentName: "",
  uwCreated: false,
};

export const WIZARD_STEPS = [
  "Bond Form",
  "Account Info",
  "Applicant",
  "Bond Info",
  "Summary",
  "Payment",
];
