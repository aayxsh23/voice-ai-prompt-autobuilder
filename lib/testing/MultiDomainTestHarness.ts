import { compilePromptPackage } from "@/lib/pipeline/promptCompiler";
import { validateVariableConsistency } from "@/lib/pipeline/validators/VariableConsistencyValidator";
import { validateFallbackDialogue } from "@/lib/pipeline/validators/FallbackDialogueValidator";
import { validateCoherence } from "@/lib/pipeline/validators/CoherenceValidator";
import { BlueprintJson } from "@/lib/llm/types";

export interface DomainTestScenario {
  domainId: string;
  domainName: string;
  blueprint: BlueprintJson;
}

export interface DomainTestResult {
  domainId: string;
  domainName: string;
  passed: boolean;
  errors: string[];
  warnings: string[];
  promptLength: number;
}

export interface TestHarnessSummary {
  totalScenarios: number;
  passedCount: number;
  failedCount: number;
  results: DomainTestResult[];
}

export class MultiDomainTestHarness {
  public static getCanonicalScenarios(): DomainTestScenario[] {
    return [
      {
        domainId: "dental",
        domainName: "Dental Clinic Receptionist",
        blueprint: {
          selectedTemplate: "Custom Agent",
          personality: { tone: "Professional", languageVariant: "English" },
          followupAnswers: {},
          useCase: "Inbound clinic booking",
          business: { businessName: "Apex Dental Studio", industry: "Healthcare", description: "Family and cosmetic dental practice" },
          mission: { primaryGoal: "Book patient appointments and answer general clinic FAQs", supportedIntents: ["book_appointment", "reschedule", "faq"] },
          conversation: { opening: "Thank you for calling Apex Dental Studio. How may I assist your smile today?" }
        }
      },
      {
        domainId: "hvac",
        domainName: "HVAC Field Tech Scheduling",
        blueprint: {
          selectedTemplate: "Custom Agent",
          personality: { tone: "Urgent & Professional", languageVariant: "English" },
          followupAnswers: {},
          useCase: "Emergency dispatch and scheduling",
          business: { businessName: "QuickCool HVAC", industry: "Field Services", description: "24/7 heating and cooling service" },
          mission: { primaryGoal: "Schedule emergency dispatch or routine maintenance", supportedIntents: ["emergency_dispatch", "maintenance"] },
          conversation: { opening: "Hello, you've reached QuickCool HVAC. Are you experiencing a heating or cooling emergency right now?" }
        }
      },
      {
        domainId: "saas_sdr",
        domainName: "SaaS Sales SDR (Outbound)",
        blueprint: {
          selectedTemplate: "Custom Agent",
          personality: { tone: "Engaging & Concise", languageVariant: "English" },
          followupAnswers: {},
          useCase: "Outbound lead qualification",
          business: { businessName: "CloudScale Software", industry: "Technology", description: "AI-powered dev platform" },
          mission: { primaryGoal: "Qualify lead and book a discovery demo with an account executive", supportedIntents: ["qualify_lead", "book_demo"] },
          conversation: { opening: "Hi, this is Alex calling from CloudScale Software. Do you have two minutes to chat about dev workflow automation?" }
        }
      },
      {
        domainId: "ecommerce",
        domainName: "E-Commerce Order Support",
        blueprint: {
          selectedTemplate: "Custom Agent",
          personality: { tone: "Helpful & Empathetic", languageVariant: "English" },
          followupAnswers: {},
          useCase: "Order tracking and returns",
          business: { businessName: "Luxe Apparel Co", industry: "Retail", description: "Premium online clothing retailer" },
          mission: { primaryGoal: "Locate order status and process return requests", supportedIntents: ["order_status", "return_request"] },
          conversation: { opening: "Welcome to Luxe Apparel Customer Support. Could I please get your order number?" }
        }
      },
      {
        domainId: "legal_intake",
        domainName: "Law Firm Intake",
        blueprint: {
          selectedTemplate: "Custom Agent",
          personality: { tone: "Authoritative & Discreet", languageVariant: "English" },
          followupAnswers: {},
          useCase: "New client qualification",
          business: { businessName: "Vanguard Legal Partners", industry: "Legal", description: "Personal injury and corporate counsel" },
          mission: { primaryGoal: "Screen potential client case details and schedule attorney consultation", supportedIntents: ["case_intake", "consultation"] },
          conversation: { opening: "Good day, Vanguard Legal Partners intake line. How can our legal team assist you today?" }
        }
      },
      {
        domainId: "patient_monitor",
        domainName: "Healthcare Patient Monitoring",
        blueprint: {
          selectedTemplate: "Custom Agent",
          personality: { tone: "Caring & Attentive", languageVariant: "English" },
          followupAnswers: {},
          useCase: "Post-op checkup call",
          business: { businessName: "St. Jude Recovery Care", industry: "Healthcare", description: "Post-surgery recovery follow-up" },
          mission: { primaryGoal: "Collect daily recovery vitals and symptom checklists", supportedIntents: ["vitals_check", "symptom_report"] },
          conversation: { opening: "Hello, this is St. Jude Recovery Care following up on your recent discharge. How are you feeling today?" }
        }
      }
    ];
  }

  async runAllScenarios(): Promise<TestHarnessSummary> {
    const scenarios = MultiDomainTestHarness.getCanonicalScenarios();
    const results: DomainTestResult[] = [];

    for (const sc of scenarios) {
      const errors: string[] = [];
      const warnings: string[] = [];
      let fullPrompt = "";

      try {
        const draft = await compilePromptPackage(sc.blueprint);
        fullPrompt = draft.finalPrompt || '';

        const varCheck = validateVariableConsistency(fullPrompt, draft.dynamicVariables || []);
        if (!varCheck.isValid) errors.push(...varCheck.errors);

        const fbCheck = validateFallbackDialogue(fullPrompt);
        if (!fbCheck.isValid) errors.push(...fbCheck.errors);

        const cohCheck = validateCoherence(fullPrompt, draft);
        if (!cohCheck.isValid) errors.push(...cohCheck.errors);

      } catch (err: any) {
        errors.push(`Compilation threw error: ${err.message || err}`);
      }

      results.push({
        domainId: sc.domainId,
        domainName: sc.domainName,
        passed: errors.length === 0,
        errors,
        warnings,
        promptLength: fullPrompt.length
      });
    }

    const passedCount = results.filter(r => r.passed).length;
    return {
      totalScenarios: scenarios.length,
      passedCount,
      failedCount: scenarios.length - passedCount,
      results
    };
  }
}
